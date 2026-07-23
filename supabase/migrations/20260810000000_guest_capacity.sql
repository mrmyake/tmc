-- 20260810000000_guest_capacity.sql
--
-- Gastboekingen tellen mee in sessiecapaciteit + fan-out-fix in
-- v_session_availability. Fysiek risico bij opening (deadline 2026-08-15):
-- een gast nam tot deze migratie in geen enkele schrijf-gate of weergave
-- een plek in, dus de studio kon voller lopen dan de capaciteit toestaat.
--
-- Inhoud:
-- 1. tmc.session_occupancy(uuid) — canonieke bezettingstelling, gedeeld
--    door de drie schrijf-gates (book_class_session, redeem_trial_code,
--    book_guest_session). Bewust SECURITY INVOKER en niet uitvoerbaar voor
--    anon/authenticated: hij wordt uitsluitend aangeroepen vanuit de
--    SECURITY DEFINER-gates, waar current_user de functie-owner is.
-- 2. v_session_availability — herschreven van drie LEFT JOINs met
--    count-FILTER naar per-tabel subqueries. De joins vermenigvuldigden
--    elkaars rijen zodra een sessie in meerdere tabellen rijen had
--    (live gereproduceerd op 2026-07-23: 2 leden + 2 trials + 1 waitlist
--    gaf booked_count=4, waitlist_count=4, spots_available=0 in plaats
--    van 2, 1 en 3). Gasten (booked/attended) tellen nu mee in
--    spots_available; nieuwe kolom taken_count (totale bezetting)
--    achteraan toegevoegd.
--    De view kan tmc.session_occupancy() niet zelf aanroepen:
--    - als scalar functie wordt hij niet geinlined (functie-call per rij)
--      en wordt de EXECUTE-ACL tegen de AANROEPENDE rol gecheckt, dus de
--      publieke roosters (anon) zouden breken;
--    - als inline-bare SRF (LATERAL) worden na inlining de tabel-ACL's en
--      RLS van de aanroeper gecheckt, dus anon zou trials/gasten niet
--      zien en te veel vrije plekken tonen.
--    Beide varianten op 2026-07-23 live geverifieerd (zie PR). Daarom:
--    de som staat hieronder in een inline LATERAL-subquery die
--    REGEL-VOOR-REGEL identiek MOET blijven aan tmc.session_occupancy().
--    Wijzig ze samen; de PR-test asserteert gelijkheid.
-- 3. tmc.book_guest_session(...) — atomaire gastboeking: lockt de
--    guest_passes-rij (lost-update-fix op passes_used) en de sessie-rij,
--    telt capaciteit via session_occupancy onder de lock, en doet insert,
--    passes_used-increment en het guest.booked-event in één transactie.
-- 4. book_class_session + redeem_trial_code — capaciteitsblok omgezet
--    naar session_occupancy. CREATE OR REPLACE (signaturen ongewijzigd,
--    dus geen drop nodig; ACL's blijven staan), grants daarna expliciet
--    hersteld en aan het eind van deze migratie geasserteerd.

-- ---------------------------------------------------------------------------
-- 1. Canonieke bezettingstelling.
-- ---------------------------------------------------------------------------

create or replace function tmc.session_occupancy(p_session_id uuid)
returns integer
language sql
stable
as $$
  select (
    (select count(*) from tmc.bookings b
      where b.session_id = p_session_id
        and b.status = 'booked')
    + (select count(*) from tmc.trial_bookings tb
      where tb.session_id = p_session_id
        and tb.status in ('pending', 'paid', 'attended'))
    + (select count(*) from tmc.guest_bookings gb
      where gb.session_id = p_session_id
        and gb.status in ('booked', 'attended'))
  )::integer
$$;

comment on function tmc.session_occupancy(uuid) is
  'Canonieke bezetting van een sessie: leden-bookings (booked) + '
  'trial_bookings (pending/paid/attended) + guest_bookings '
  '(booked/attended). Gedeeld door alle schrijf-gates; de som in '
  'v_session_availability moet hieraan identiek blijven.';

-- ---------------------------------------------------------------------------
-- 2. v_session_availability: per-tabel subqueries, gasten tellen mee.
-- ---------------------------------------------------------------------------

create or replace view tmc.v_session_availability as
select
  cs.id,
  cs.class_type_id,
  cs.trainer_id,
  cs.pillar,
  cs.age_category,
  cs.start_at,
  cs.end_at,
  cs.capacity,
  cs.status,
  occ.members_booked as booked_count,
  case
    when cs.capacity is null then null::bigint
    else (cs.capacity
          - (occ.members_booked + occ.trials_taken + occ.guests_taken)
         )::bigint
  end as spots_available,
  (select count(*) from tmc.waitlist_entries w
    where w.session_id = cs.id
      and w.confirmed_at is null
      and w.expired_at is null) as waitlist_count,
  (occ.members_booked + occ.trials_taken + occ.guests_taken)::bigint
    as taken_count
from tmc.class_sessions cs
cross join lateral (
  -- MOET regel-voor-regel gelijk blijven aan tmc.session_occupancy();
  -- zie de kop van deze migratie voor waarom de functie hier niet
  -- rechtstreeks aangeroepen kan worden.
  select
    (select count(*) from tmc.bookings b
      where b.session_id = cs.id
        and b.status = 'booked') as members_booked,
    (select count(*) from tmc.trial_bookings tb
      where tb.session_id = cs.id
        and tb.status in ('pending', 'paid', 'attended')) as trials_taken,
    (select count(*) from tmc.guest_bookings gb
      where gb.session_id = cs.id
        and gb.status in ('booked', 'attended')) as guests_taken
) occ
where cs.status = 'scheduled';

-- ---------------------------------------------------------------------------
-- 3. Atomaire gastboeking.
-- ---------------------------------------------------------------------------

create or replace function tmc.book_guest_session(
  p_session_id uuid,
  p_guest_pass_id uuid,
  p_guest_name text,
  p_guest_email text
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_guest_name, ''));
  v_email text := lower(trim(coalesce(p_guest_email, '')));
  v_pass tmc.guest_passes%rowtype;
  v_session tmc.class_sessions%rowtype;
  v_booking_id uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Verwachte weigeringen als jsonb-reason, geen exceptions
  -- (conventie book_class_session).
  if v_name = '' or v_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;

  -- Lock op de pass-rij: serialiseert het passes_used-increment, zodat twee
  -- gelijktijdige gastboekingen van hetzelfde lid niet allebei dezelfde
  -- pass kunnen verbruiken (lost-update-fix).
  select * into v_pass
  from tmc.guest_passes
  where id = p_guest_pass_id
  for update;

  -- Andermans pass behandelen als onbekend (geen informatie-lek).
  if not found or v_pass.profile_id <> v_uid then
    return jsonb_build_object('ok', false, 'reason', 'pass_not_found');
  end if;
  if not (v_pass.period_start <= current_date
          and v_pass.period_end > current_date) then
    return jsonb_build_object('ok', false, 'reason', 'pass_period_invalid');
  end if;
  if v_pass.passes_used >= v_pass.passes_allocated then
    return jsonb_build_object('ok', false, 'reason', 'no_passes_left');
  end if;

  -- Lock op de sessie-rij: serialiseert capaciteits-checks en pint
  -- status/start_at vast, zelfde patroon als book_class_session.
  select * into v_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Capaciteit onder de sessie-lock, via de gedeelde telling.
  -- capacity null = onbeperkt (alleen kettlebell): nooit vol.
  if v_session.capacity is not null then
    if tmc.session_occupancy(p_session_id) >= v_session.capacity then
      return jsonb_build_object('ok', false, 'reason', 'capacity_full');
    end if;
  end if;

  -- Idempotentie via de partial unique index (session_id, guest_email)
  -- where status in ('booked','attended').
  begin
    insert into tmc.guest_bookings (
      guest_pass_id, session_id, booked_by, guest_name, guest_email, status
    ) values (
      p_guest_pass_id, p_session_id, v_uid, v_name, v_email, 'booked'
    )
    returning id into v_booking_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end;

  -- Pass-verbruik in dezelfde transactie; de rij is hierboven gelockt en
  -- de constraint passes_used <= passes_allocated is de harde backstop.
  update tmc.guest_passes
  set passes_used = passes_used + 1
  where id = p_guest_pass_id;

  -- Geen gast-naam/e-mail in de payload: PII die de event-laag niet nodig
  -- heeft (zelfde afweging als de oude TS-emit).
  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'guest.booked', 'member', v_uid, 'guest_booking', v_booking_id,
    jsonb_build_object(
      'profile_id', v_uid,
      'guest_pass_id', p_guest_pass_id,
      'session_id', p_session_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'guest_booking_id', v_booking_id,
    'passes_allocated', v_pass.passes_allocated,
    'passes_used', v_pass.passes_used + 1
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4a. book_class_session: capaciteitsblok naar session_occupancy.
--     Volledige hercreatie van de live definitie (20260809) met exact twee
--     wijzigingen: de declaratie van v_booked_count is weg en het
--     capaciteitsblok telt via tmc.session_occupancy().
-- ---------------------------------------------------------------------------

create or replace function tmc.book_class_session(p_session_id uuid, p_rental_mat boolean default false, p_rental_towel boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_session tmc.class_sessions%rowtype;
  v_profile_age text;
  v_settings record;
  v_session_date date;
  v_iso_week int;
  v_iso_year int;
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
  -- Telling via tmc.session_occupancy(): leden-bookings ('booked') plus
  -- trial_bookings (pending/paid/attended) plus guest_bookings
  -- (booked/attended) — exact dezelfde som als v_session_availability en de
  -- andere schrijf-gates (guest-capaciteitsfix, 20260810; verving de inline
  -- twee-tabellen-som van de trial-capaciteitsfix, 20260809).
  if v_session.capacity is not null then
    if tmc.session_occupancy(p_session_id) >= v_session.capacity then
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
$function$;

-- ---------------------------------------------------------------------------
-- 4b. redeem_trial_code: capaciteitsblok naar session_occupancy.
--     Volledige hercreatie van de live definitie (20260808) met exact twee
--     wijzigingen: de declaratie van v_taken is weg en het capaciteitsblok
--     telt via tmc.session_occupancy().
-- ---------------------------------------------------------------------------

create or replace function tmc.redeem_trial_code(p_code text, p_session_id uuid, p_name text, p_email text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_code_norm text := upper(trim(coalesce(p_code, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
  v_tc tmc.trial_codes%rowtype;
  v_session tmc.class_sessions%rowtype;
  v_trial_id uuid;
  v_cancel_token uuid;
begin
  -- Verwachte weigeringen als jsonb-reason, geen exceptions
  -- (conventie book_class_session).
  if v_code_norm = '' or v_name = '' or v_email = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;

  -- Lock de code-rij: serialiseert dubbel verzilveren van dezelfde code.
  select * into v_tc
  from tmc.trial_codes
  where code = v_code_norm
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'code_not_found');
  end if;
  if v_tc.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'code_not_active');
  end if;
  if v_tc.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'code_expired');
  end if;

  -- Lock de sessie-rij: pint status/capaciteit vast, zelfde patroon als
  -- book_class_session.
  select * into v_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;
  if v_tc.pillar is not null and v_tc.pillar <> v_session.pillar then
    return jsonb_build_object('ok', false, 'reason', 'pillar_mismatch');
  end if;

  -- Capaciteit hertellen onder de sessie-lock, via tmc.session_occupancy():
  -- leden-boekingen plus trial-boekingen plus gastboekingen, dezelfde som
  -- als v_session_availability en de andere schrijf-gates
  -- (guest-capaciteitsfix, 20260810).
  -- capacity null = onbeperkt (alleen kettlebell): nooit vol.
  if v_session.capacity is not null then
    if tmc.session_occupancy(p_session_id) >= v_session.capacity then
      return jsonb_build_object('ok', false, 'reason', 'capacity_full');
    end if;
  end if;

  -- Gratis en direct definitief: status 'paid' (er is geen betaling om
  -- op te wachten), price 0, geen Mollie-payment. cancel_token via de
  -- kolom-default, zoals elke trial_booking.
  insert into tmc.trial_bookings (
    session_id, name, email, phone,
    price_paid_cents, mollie_payment_id, status, trial_code_id
  ) values (
    p_session_id, v_name, v_email, v_phone,
    0, null, 'paid', v_tc.id
  )
  returning id, cancel_token into v_trial_id, v_cancel_token;

  update tmc.trial_codes
  set status = 'redeemed',
      redeemed_at = now(),
      trial_booking_id = v_trial_id
  where id = v_tc.id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.redeemed', 'visitor', null, 'trial_code', v_tc.id,
    jsonb_build_object(
      'code_id', v_tc.id,
      'batch_id', v_tc.batch_id,
      'trial_booking_id', v_trial_id,
      'session_id', p_session_id,
      'pillar', v_session.pillar
    )
  );

  return jsonb_build_object(
    'ok', true,
    'trial_booking_id', v_trial_id,
    'cancel_token', v_cancel_token,
    'code_id', v_tc.id,
    'session_id', p_session_id,
    'pillar', v_session.pillar,
    'session_start_at', v_session.start_at
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Grants: expliciet herstellen op de bedoelde staat. CREATE OR REPLACE
-- behoudt bestaande ACL's, maar nieuwe functies krijgen default EXECUTE
-- voor PUBLIC — daarom overal eerst revoke, dan gerichte grants.
-- ---------------------------------------------------------------------------

revoke execute on function tmc.session_occupancy(uuid) from public, anon, authenticated;
grant execute on function tmc.session_occupancy(uuid) to service_role;

revoke execute on function tmc.book_guest_session(uuid, uuid, text, text) from public, anon, service_role;
grant execute on function tmc.book_guest_session(uuid, uuid, text, text) to authenticated;

revoke execute on function tmc.book_class_session(uuid, boolean, boolean) from public, anon, service_role;
grant execute on function tmc.book_class_session(uuid, boolean, boolean) to authenticated;

revoke execute on function tmc.redeem_trial_code(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function tmc.redeem_trial_code(text, uuid, text, text, text) to service_role;

-- Assertie: de ACL's staan exact zoals bedoeld; anders faalt de migratie
-- en rolt alles terug.
do $$
begin
  if not (
    -- session_occupancy: alleen owner + service_role.
        not has_function_privilege('anon', 'tmc.session_occupancy(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'tmc.session_occupancy(uuid)', 'execute')
    and     has_function_privilege('service_role', 'tmc.session_occupancy(uuid)', 'execute')
    -- book_guest_session: alleen authenticated.
    and not has_function_privilege('anon', 'tmc.book_guest_session(uuid, uuid, text, text)', 'execute')
    and     has_function_privilege('authenticated', 'tmc.book_guest_session(uuid, uuid, text, text)', 'execute')
    -- book_class_session: alleen authenticated (live staat vóór deze migratie).
    and not has_function_privilege('anon', 'tmc.book_class_session(uuid, boolean, boolean)', 'execute')
    and     has_function_privilege('authenticated', 'tmc.book_class_session(uuid, boolean, boolean)', 'execute')
    -- redeem_trial_code: alleen service_role (live staat vóór deze migratie).
    and not has_function_privilege('anon', 'tmc.redeem_trial_code(text, uuid, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'tmc.redeem_trial_code(text, uuid, text, text, text)', 'execute')
    and     has_function_privilege('service_role', 'tmc.redeem_trial_code(text, uuid, text, text, text)', 'execute')
  ) then
    raise exception 'guest_capacity: EXECUTE-grants staan niet zoals bedoeld';
  end if;
end $$;
