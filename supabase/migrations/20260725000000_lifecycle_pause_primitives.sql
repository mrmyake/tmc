-- Lifecycle-primitieven fase 1: pauze en hervatten als gedeelde RPC-laag
-- (klantbeheer-workstream, discovery in discovery-klantbeheer-lifecycle.md).
--
-- Beleid (Ilja/Marlon, hardcoded in deze laag, niet in de UI):
-- - Pauze is admin-only, handmatig starten en stoppen. Geen auto-hervat-cron,
--   geen maximumduur.
-- - De lopende betaalde cyclus wordt afgemaakt: de pauze gaat in op het einde
--   van de lopende 28-dagen-cyclus (p_pause_effective_date, aangeleverd door
--   de TS-laag uit Mollie's nextPaymentDate). Tot die datum houdt het lid
--   toegang; de Mollie-subscription is dan al geannuleerd zodat er vanaf de
--   ingangsdatum geen incasso meer loopt (Mollie-eerst-dan-lokaal, zelfde
--   volgorde als de process-cancellations cron).
-- - Pauze schuift de commitment-einddatum op met de WERKELIJKE pauzeduur,
--   berekend op het hervatmoment. De oude trigger apply_pause_to_commit
--   (schoof op goedkeurmoment met de AANGEVRAAGDE duur) vervalt daarmee:
--   pauzes zijn nu open-einde, dus de aangevraagde duur bestaat niet meer.
-- - Tijdens de pauze geen groepsles/vrij-trainen-dekking; al gekochte PT- en
--   Duo-credits staan op eigen membership-rijen en blijven onaangeraakt.
-- - Hervatten mint nooit een tweede Mollie-customer of -mandaat: de TS-laag
--   maakt een nieuwe subscription op het BESTAANDE mandaat en levert alleen
--   het subscription-id aan; is het mandaat ongeldig, dan zet
--   admin_flag_resume_blocked de expliciete herautorisatie-staat.
--
-- Laagdeling: RPC's muteren uitsluitend lokale staat (atomair, onder rijlock,
-- idempotent); alle Mollie-aanroepen leven in de TS-servicelaag
-- (src/lib/admin/membership-lifecycle.ts), die Mollie-eerst aanroept en pas
-- daarna de RPC. Faalt de RPC na een geslaagde Mollie-cancel, dan is de
-- incasso gestopt maar de lokale staat ongewijzigd: veilig en opnieuw
-- uitvoerbaar (de Mollie-cancel is idempotent).

-- 1. Pauze-state op memberships. pause_effective_date is de enige bron voor
--    "vanaf wanneer geen dekking"; hij staat gezet vanaf plannen tot hervatten.
alter table tmc.memberships
  add column if not exists pause_planned_at timestamptz,
  add column if not exists pause_effective_date date,
  add column if not exists resume_blocked_reason text;

comment on column tmc.memberships.pause_planned_at is
  'Moment waarop admin de pauze plande (admin_pause_membership). Null buiten een pauze.';
comment on column tmc.memberships.pause_effective_date is
  'Eerste dag zonder dekking en zonder incasso: het einde van de lopende betaalde cyclus (Mollie nextPaymentDate op het plan-moment). Gezet vanaf plannen tot hervatten; book_class_session weigert dekking voor sessies op of na deze datum.';
comment on column tmc.memberships.resume_blocked_reason is
  'Expliciete herautorisatie-staat: gezet (bv. mandate_invalid) wanneer hervatten niet kan omdat het SEPA-mandaat ongeldig of ingetrokken is. Gewist bij geslaagd hervatten.';

-- 2. membership_pauses wordt de historische pauze-administratie met open
--    einde: end_date null zolang de pauze loopt, gezet bij hervatten.
alter table tmc.membership_pauses alter column end_date drop not null;
alter table tmc.membership_pauses drop constraint membership_pauses_check;
alter table tmc.membership_pauses
  add constraint membership_pauses_check check (end_date is null or end_date >= start_date);

-- 3. De oude commit-shift-trigger vervalt: hij schoof commit_end_date op het
--    goedkeurmoment met (end_date - start_date), maar het nieuwe beleid kent
--    geen vooraf bekende einddatum. De shift gebeurt voortaan in
--    admin_resume_membership met de werkelijke duur. (De trigger vuurde
--    bovendien alleen op UPDATE naar approved; het directe-toekennen-pad
--    dat meteen approved inserte, raakte hem nooit.)
drop trigger if exists pauses_extend_commit on tmc.membership_pauses;
drop function if exists tmc.apply_pause_to_commit();

-- 4. Pauze plannen. p_pause_effective_date komt uit de TS-laag (Mollie
--    nextPaymentDate, of de berekende cyclusgrens als er geen subscription
--    is). p_pause_request_id koppelt optioneel een pending lid-aanvraag uit
--    membership_pauses; zonder request-id is dit het directe-toekennen-pad.
create or replace function tmc.admin_pause_membership(
  p_membership_id uuid,
  p_pause_effective_date date,
  p_reason text default 'other_approved',
  p_pause_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_m tmc.memberships%rowtype;
  v_req tmc.membership_pauses%rowtype;
  v_reason text;
  v_immediate boolean;
  v_pause_id uuid;
  v_cancelled integer := 0;
begin
  -- DB-gate; de aanroepende server action draait daarnaast requireAdmin()
  -- in TS (zelfde laagdeling als tmc.admin_create_order).
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  -- Rijlock: plannen, effectueren (cron) en hervatten serialiseren op de
  -- membership-rij.
  select * into v_m from tmc.memberships where id = p_membership_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_found');
  end if;

  -- Idempotent: dubbel plannen (twee tabbladen) muteert niet dubbel.
  if v_m.status = 'paused' then
    return jsonb_build_object('ok', true, 'already_paused', true,
      'pause_effective_date', v_m.pause_effective_date);
  end if;
  if v_m.pause_effective_date is not null then
    return jsonb_build_object('ok', true, 'already_planned', true,
      'pause_effective_date', v_m.pause_effective_date);
  end if;

  -- Alleen echte abonnementen zijn pauzeerbaar; credit-rijen (rittenkaart,
  -- PT/Duo, billing_cycle_weeks = 0) hebben geen incasso om te pauzeren.
  if coalesce(v_m.billing_cycle_weeks, 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_pausable_plan');
  end if;
  if v_m.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_pausable',
      'status', v_m.status);
  end if;
  if p_pause_effective_date is null or p_pause_effective_date < current_date then
    return jsonb_build_object('ok', false, 'reason', 'invalid_effective_date');
  end if;

  -- Gekoppelde lid-aanvraag valideren VOOR er iets muteert.
  if p_pause_request_id is not null then
    select * into v_req from tmc.membership_pauses
    where id = p_pause_request_id and membership_id = p_membership_id
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'pause_request_not_found');
    end if;
    if v_req.status <> 'pending' then
      return jsonb_build_object('ok', false, 'reason', 'pause_request_not_pending',
        'status', v_req.status);
    end if;
    v_reason := v_req.reason;
  else
    if p_reason not in ('pregnancy', 'medical', 'other_approved') then
      return jsonb_build_object('ok', false, 'reason', 'invalid_reason');
    end if;
    v_reason := p_reason;
  end if;

  -- Ingang vandaag betekent meteen paused (er is dan geen betaald restant
  -- van de cyclus meer); anders blijft het lid active tot de ingangsdatum
  -- en flipt de process-pauses cron de status.
  v_immediate := p_pause_effective_date <= current_date;

  update tmc.memberships
  set pause_planned_at = now(),
      pause_effective_date = p_pause_effective_date,
      status = case when v_immediate then 'paused' else status end
  where id = p_membership_id;

  -- Pauze-administratie: open venster, end_date volgt bij hervatten.
  if p_pause_request_id is not null then
    update tmc.membership_pauses
    set status = case when v_immediate then 'active' else 'approved' end,
        start_date = p_pause_effective_date,
        end_date = null,
        approved_by = auth.uid(),
        approved_at = now()
    where id = p_pause_request_id
    returning id into v_pause_id;
  else
    insert into tmc.membership_pauses (
      membership_id, start_date, end_date, reason, status,
      requested_by, approved_by, approved_at
    ) values (
      p_membership_id, p_pause_effective_date, null, v_reason,
      case when v_immediate then 'active' else 'approved' end,
      v_m.profile_id, auth.uid(), now()
    )
    returning id into v_pause_id;
  end if;

  -- Toekomstige boekingen in het pauzevenster vervallen bij ingang van de
  -- pauze (beleid). Alleen boekingen van DIT membership: PT/Duo-credits en
  -- rittenkaarten zijn eigen membership-rijen en blijven bruikbaar.
  -- credits_used is op deze boekingen altijd 0 (abonnementsdekking), dus
  -- er valt niets te refunden.
  update tmc.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = 'membership_paused'
  where membership_id = p_membership_id
    and status in ('booked', 'waitlisted')
    and session_date >= p_pause_effective_date;
  get diagnostics v_cancelled = row_count;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'membership.pause_planned', 'admin', auth.uid(), 'membership', p_membership_id,
    jsonb_build_object(
      'profile_id', v_m.profile_id,
      'pause_id', v_pause_id,
      'pause_effective_date', p_pause_effective_date,
      'cancelled_bookings', v_cancelled,
      'immediate', v_immediate,
      'reason', v_reason
    )
  );
  if v_immediate then
    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values (
      'membership.paused', 'admin', auth.uid(), 'membership', p_membership_id,
      jsonb_build_object('profile_id', v_m.profile_id, 'pause_id', v_pause_id,
        'pause_effective_date', p_pause_effective_date)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'pause_id', v_pause_id,
    'pause_effective_date', p_pause_effective_date,
    'immediate', v_immediate,
    'cancelled_bookings', v_cancelled
  );
end;
$$;

-- 5. Hervatten. De TS-laag heeft op dit punt het mandaat gevalideerd en EEN
--    nieuwe subscription op het bestaande mandaat aangemaakt (deterministische
--    idempotencyKey resume-<membership>-<effective_date>, dus een dubbele
--    aanroep levert bij Mollie dezelfde subscription op). Deze RPC rondt
--    lokaal af: commitment-shift met de werkelijke pauzeduur, pauzevenster
--    dicht, status terug naar active.
create or replace function tmc.admin_resume_membership(
  p_membership_id uuid,
  p_new_subscription_id text,
  p_resume_date date default current_date
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_m tmc.memberships%rowtype;
  v_shift integer;
  v_pause_id uuid;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  select * into v_m from tmc.memberships where id = p_membership_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_found');
  end if;

  -- Idempotent: al hervat. Met dezelfde subscription-id (Mollie-idempotency
  -- bij een dubbelklik) is dit een geslaagde no-op.
  if v_m.status = 'active' and v_m.pause_effective_date is null then
    return jsonb_build_object('ok', true, 'already_active', true,
      'same_subscription',
      v_m.mollie_subscription_id is not distinct from p_new_subscription_id,
      'mollie_subscription_id', v_m.mollie_subscription_id);
  end if;

  if v_m.pause_effective_date is null or v_m.status not in ('active', 'paused') then
    return jsonb_build_object('ok', false, 'reason', 'not_paused',
      'status', v_m.status);
  end if;
  if p_new_subscription_id is null or length(trim(p_new_subscription_id)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_subscription_id');
  end if;
  if p_resume_date is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_resume_date');
  end if;

  -- Commitment-shift: de werkelijke onbetaalde pauzeduur. Hervatten voor de
  -- ingangsdatum (pauze terugdraaien voor hij inging) geeft shift 0; de
  -- nieuwe subscription start dan pas op de al betaalde cyclusgrens (TS).
  v_shift := greatest(0, p_resume_date - v_m.pause_effective_date);

  update tmc.memberships
  set status = 'active',
      commit_end_date = commit_end_date + v_shift,
      mollie_subscription_id = p_new_subscription_id,
      pause_planned_at = null,
      pause_effective_date = null,
      resume_blocked_reason = null
  where id = p_membership_id;

  -- Sluit het open pauzevenster (er is er hooguit een door de guards in
  -- admin_pause_membership).
  update tmc.membership_pauses
  set status = 'completed',
      end_date = greatest(start_date, p_resume_date)
  where membership_id = p_membership_id
    and end_date is null
    and status in ('approved', 'active')
  returning id into v_pause_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'membership.resumed', 'admin', auth.uid(), 'membership', p_membership_id,
    jsonb_build_object(
      'profile_id', v_m.profile_id,
      'pause_id', v_pause_id,
      'shift_days', v_shift,
      'new_commit_end_date', (v_m.commit_end_date + v_shift),
      'mollie_subscription_id', p_new_subscription_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'pause_id', v_pause_id,
    'shift_days', v_shift,
    'commit_end_date', (v_m.commit_end_date + v_shift),
    'mollie_subscription_id', p_new_subscription_id
  );
end;
$$;

-- 6. Expliciete herautorisatie-staat: de TS-laag roept dit aan wanneer het
--    mandaat bij Mollie ongeldig of ingetrokken blijkt. Er wordt dan NOOIT
--    stil een nieuwe subscription gemaakt; de admin ziet de staat en het lid
--    moet opnieuw autoriseren (first payment, buiten deze fase).
create or replace function tmc.admin_flag_resume_blocked(
  p_membership_id uuid,
  p_reason text default 'mandate_invalid'
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_m tmc.memberships%rowtype;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  select * into v_m from tmc.memberships where id = p_membership_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_found');
  end if;
  if v_m.pause_effective_date is null then
    return jsonb_build_object('ok', false, 'reason', 'not_paused',
      'status', v_m.status);
  end if;
  if v_m.resume_blocked_reason is not distinct from p_reason then
    return jsonb_build_object('ok', true, 'already_flagged', true,
      'resume_blocked_reason', v_m.resume_blocked_reason);
  end if;

  update tmc.memberships
  set resume_blocked_reason = p_reason
  where id = p_membership_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'membership.resume_blocked', 'admin', auth.uid(), 'membership', p_membership_id,
    jsonb_build_object('profile_id', v_m.profile_id, 'reason', p_reason)
  );

  return jsonb_build_object('ok', true, 'resume_blocked_reason', p_reason);
end;
$$;

-- 7. Effectuering van geplande pauzes op hun ingangsdatum, aangeroepen door
--    de process-pauses cron (service-role; ACL-afgedwongen, zelfde stance
--    als activate_order). De Mollie-subscription is al bij het plannen
--    geannuleerd, dus dit is puur de lokale statusflip plus een veegronde
--    over boekingen die na het plannen alsnog in het venster zijn beland.
create or replace function tmc.process_due_membership_pauses()
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  r record;
  v_ids uuid[] := '{}';
  v_swept integer;
  v_total_swept integer := 0;
begin
  for r in
    select id, profile_id, pause_effective_date
    from tmc.memberships
    where status = 'active'
      and pause_effective_date is not null
      and pause_effective_date <= current_date
    for update skip locked
  loop
    update tmc.memberships set status = 'paused'
    where id = r.id and status = 'active';

    update tmc.bookings
    set status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = 'membership_paused'
    where membership_id = r.id
      and status in ('booked', 'waitlisted')
      and session_date >= r.pause_effective_date;
    get diagnostics v_swept = row_count;
    v_total_swept := v_total_swept + v_swept;

    update tmc.membership_pauses
    set status = 'active'
    where membership_id = r.id and end_date is null and status = 'approved';

    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values (
      'membership.paused', 'system', null, 'membership', r.id,
      jsonb_build_object('profile_id', r.profile_id,
        'pause_effective_date', r.pause_effective_date,
        'swept_bookings', v_swept)
    );

    v_ids := v_ids || r.id;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed', coalesce(array_length(v_ids, 1), 0),
    'membership_ids', to_jsonb(v_ids),
    'swept_bookings', v_total_swept
  );
end;
$$;

-- 8. book_class_session: het plan-venster dichtzetten. Tussen plannen en
--    ingang is het membership nog 'active'; zonder deze guard kon een lid
--    opnieuw boeken op sessies binnen het pauzevenster. Hercreatie van de
--    LIVE definitie (pg_get_functiondef geverifieerd op 2026-07-12) met
--    exact een toegevoegde dekking-conditie op pause_effective_date.
create or replace function tmc.book_class_session(p_session_id uuid, p_rental_mat boolean default false, p_rental_towel boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_session tmc.class_sessions%rowtype;
  v_profile_age text;
  v_settings record;
  v_session_date date;
  v_iso_week int;
  v_iso_year int;
  v_booked_count int;
  v_same_day_count int;
  v_pillar_week_count int;
  v_strikes record;
  v_check_in_for_pillar boolean;
  v_covering tmc.memberships%rowtype;
  v_credits_used int := 0;
  v_rental_mat boolean;
  v_rental_towel boolean;
  v_booking_id uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Lock op de sessie-rij: serialiseert capaciteits-checks en pint de
  -- status/start_at vast voor de duur van deze transactie (edge-cases 2 en 5).
  select * into v_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  select age_category into v_profile_age
  from tmc.profiles where id = v_uid;
  if v_profile_age is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  select
    coalesce(bs.booking_window_days, 14)        as booking_window_days,
    coalesce(bs.fair_use_daily_max, 2)          as fair_use_daily_max,
    coalesce(bs.no_show_strike_threshold, 3)    as no_show_strike_threshold,
    coalesce(bs.no_show_block_days, 7)          as no_show_block_days,
    coalesce(bs.check_in_enabled, true)         as check_in_enabled,
    coalesce(bs.check_in_pillars,
      array['yoga_mobility','kettlebell','vrij_trainen']) as check_in_pillars
  into v_settings
  from tmc.booking_settings bs
  limit 1;
  if not found then
    select 14 as booking_window_days,
           2 as fair_use_daily_max,
           3 as no_show_strike_threshold,
           7 as no_show_block_days,
           true as check_in_enabled,
           array['yoga_mobility','kettlebell','vrij_trainen'] as check_in_pillars
    into v_settings;
  end if;

  -- Zelfde datum/week-berekening als de TS-laag (die op Vercel in UTC draait).
  v_session_date := (v_session.start_at at time zone 'utc')::date;
  v_iso_week := extract(week from v_session_date)::int;
  v_iso_year := extract(isoyear from v_session_date)::int;

  -- Checks in dezelfde volgorde als canBook() (src/lib/member/can-book.ts).
  if v_profile_age <> v_session.age_category then
    return jsonb_build_object('ok', false, 'reason', 'age_mismatch');
  end if;

  if v_session.start_at > now() + make_interval(days => v_settings.booking_window_days) then
    return jsonb_build_object('ok', false, 'reason', 'booking_window_closed');
  end if;

  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;

  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Dubbelboeking (edge-case 1): expliciete check; de unique constraint
  -- (profile_id, session_id) vangt de race af.
  if exists (
    select 1 from tmc.bookings
    where profile_id = v_uid and session_id = p_session_id
      and status in ('booked', 'waitlisted')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end if;

  -- Capaciteit, geteld onder de sessie-lock (edge-case 2). NULL betekent
  -- onbeperkt (alleen kettlebell): de telling en de capacity_full-uitkomst
  -- met het waitlist-pad worden dan volledig overgeslagen; een onbeperkte
  -- sessie is nooit vol.
  if v_session.capacity is not null then
    select count(*) into v_booked_count
    from tmc.bookings
    where session_id = p_session_id and status = 'booked';

    if v_booked_count >= v_session.capacity then
      return jsonb_build_object(
        'ok', false, 'reason', 'capacity_full', 'can_join_waitlist', true);
    end if;
  end if;

  -- Strike-blokkade.
  select strike_count, last_strike_at into v_strikes
  from tmc.v_active_strikes where profile_id = v_uid;
  if found
    and v_strikes.strike_count >= v_settings.no_show_strike_threshold
    and v_strikes.last_strike_at
        + make_interval(days => v_settings.no_show_block_days) > now()
  then
    return jsonb_build_object('ok', false, 'reason', 'strike_blocked');
  end if;

  -- Daily fair-use cap.
  select count(*) into v_same_day_count
  from tmc.bookings
  where profile_id = v_uid and status = 'booked'
    and session_date = v_session_date;
  if v_same_day_count >= v_settings.fair_use_daily_max then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap_reached');
  end if;

  -- Dekking: eerst een dekkend abonnement zonder credits, anders een
  -- ten-rittenkaart met credits. De membership-rij wordt gelockt zodat de
  -- credit-decrement niet kan racen (edge-cases 3 en 4). Een opgezegd lid
  -- (cancellation_requested) houdt dekking t/m de effective date.
  -- Rittenkaart moet op het boekmoment geldig zijn: credits_expires_at
  -- null of >= current_date (expiry-afdwinging, 20260723).
  -- Pauzevenster (lifecycle-primitieven, 20260725): een geplande of lopende
  -- pauze dekt geen sessies op of na de pauze-ingangsdatum. Status 'paused'
  -- valt al buiten het statusfilter; deze regel sluit het venster tussen
  -- plannen en ingang, waarin de status nog 'active' is.
  select m.* into v_covering
  from tmc.memberships m
  where m.profile_id = v_uid
    and (
      m.status = 'active'
      or (m.status = 'cancellation_requested'
          and m.cancellation_effective_date is not null
          and m.cancellation_effective_date >= v_session_date)
    )
    and (m.pause_effective_date is null
         or v_session_date < m.pause_effective_date)
    and tmc.plan_covers(m.plan_type, v_session.pillar)
    and (m.plan_type <> 'ten_ride_card'
         or (coalesce(m.credits_remaining, 0) > 0
             and (m.credits_expires_at is null or m.credits_expires_at >= current_date)))
  order by (m.plan_type = 'ten_ride_card') asc, m.start_date desc
  limit 1
  for update of m;

  if v_covering.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_coverage');
  end if;

  -- Weekly cap: alleen de harde variant (besluit #1, optie B), pillars
  -- zonder check-in. Voor check-in-pillars is de combined-cap een TS-nudge.
  v_check_in_for_pillar := v_settings.check_in_enabled
    and v_session.pillar = any (v_settings.check_in_pillars);

  if v_covering.frequency_cap is not null and not v_check_in_for_pillar then
    select count(*) into v_pillar_week_count
    from tmc.bookings
    where profile_id = v_uid and status = 'booked'
      and pillar = v_session.pillar
      and iso_week = v_iso_week and iso_year = v_iso_year;
    if v_pillar_week_count >= v_covering.frequency_cap then
      return jsonb_build_object('ok', false, 'reason', 'weekly_cap_reached');
    end if;
  end if;

  if v_covering.plan_type = 'ten_ride_card' then
    v_credits_used := 1;
  end if;

  -- Rentals alleen op yoga_mobility; overige pillars stil negeren (spec).
  v_rental_mat := v_session.pillar = 'yoga_mobility' and coalesce(p_rental_mat, false);
  v_rental_towel := v_session.pillar = 'yoga_mobility' and coalesce(p_rental_towel, false);

  begin
    insert into tmc.bookings (
      profile_id, session_id, session_date, pillar, iso_week, iso_year,
      membership_id, credits_used, status, rental_mat, rental_towel
    ) values (
      v_uid, p_session_id, v_session_date, v_session.pillar, v_iso_week, v_iso_year,
      v_covering.id, v_credits_used, 'booked', v_rental_mat, v_rental_towel
    )
    returning id into v_booking_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end;

  if v_credits_used > 0 then
    -- Rij is hierboven gelockt; de guard houdt credits >= 0 (edge-case 3).
    update tmc.memberships
    set credits_remaining = credits_remaining - v_credits_used
    where id = v_covering.id
      and coalesce(credits_remaining, 0) >= v_credits_used;
    if not found then
      raise exception 'Geen credits meer beschikbaar.' using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'membership_id', v_covering.id,
    'credits_used', v_credits_used,
    'pillar', v_session.pillar,
    'session_date', v_session_date
  );
end;
$$;

-- 9. ACL, gespiegeld aan admin_create_order/admin_cancel_order: authenticated
--    (met interne is_admin-gate) plus service_role; nooit public/anon. De
--    effectuerings-RPC is uitsluitend service_role (cron), zelfde stance als
--    activate_order. book_class_session behoudt zijn bestaande grants via
--    create or replace.
revoke all on function tmc.admin_pause_membership(uuid, date, text, uuid) from public, anon;
grant execute on function tmc.admin_pause_membership(uuid, date, text, uuid) to authenticated, service_role;

revoke all on function tmc.admin_resume_membership(uuid, text, date) from public, anon;
grant execute on function tmc.admin_resume_membership(uuid, text, date) to authenticated, service_role;

revoke all on function tmc.admin_flag_resume_blocked(uuid, text) from public, anon;
grant execute on function tmc.admin_flag_resume_blocked(uuid, text) to authenticated, service_role;

revoke all on function tmc.process_due_membership_pauses() from public, anon, authenticated;
grant execute on function tmc.process_due_membership_pauses() to service_role;
