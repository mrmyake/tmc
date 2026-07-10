-- Afdwinging van credits_expires_at op alle debit-paden (vervolg op de
-- credits-RPC-laag van 20260722, waar dit bewust buiten scope bleef).
--
-- Discovery 2026-07-10: credits_expires_at wordt bij activatie geschreven
-- (activate_order: start_date + validity_months, rittenkaart 4 maanden)
-- maar werd NERGENS gelezen, server- noch client-side. Een verlopen
-- rittenkaart bleef dus bruikbaar voor boekingen en check-ins.
--
-- Semantiek (besluit Ilja 2026-07-10): geldig op het BOEKMOMENT, uniform
-- op elk pad: credits_expires_at is null or credits_expires_at >=
-- current_date. Boeken van een sessie ná de vervaldatum mag dus zolang de
-- kaart vandaag nog geldig is. De vervaldatum zelf telt als geldige dag.
--
-- Drie functies, hercreaties van de live definities (pg_get_functiondef,
-- 2026-07-10) met alleen de expiry-toevoegingen:
-- 1. book_class_session: de rittenkaart-tak van de dekking-selectie.
-- 2. book_pt_credits: de pakket-selectie. PT/Duo-pakketten hebben vandaag
--    geen vervaldatum (validity_months null), dus dit is daar een no-op,
--    maar de regel is consistent zodra een pakket er wel een krijgt.
-- 3. adjust_membership_credits: de debit-tak weigert met credits_expired.
--    Refunds blijven ook op een verlopen kaart mogelijk (bewust: een
--    annulering geeft de rit terug ongeacht de kaartstatus).
--
-- De TS-kant (check-in-selectie, can-book parity) gaat in dezelfde PR mee.
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 onaangeroerd.

begin;

create or replace function tmc.book_class_session(p_session_id uuid, p_rental_mat boolean DEFAULT false, p_rental_towel boolean DEFAULT false)
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
  select m.* into v_covering
  from tmc.memberships m
  where m.profile_id = v_uid
    and (
      m.status = 'active'
      or (m.status = 'cancellation_requested'
          and m.cancellation_effective_date is not null
          and m.cancellation_effective_date >= v_session_date)
    )
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

create or replace function tmc.book_pt_credits(p_pt_session_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_session record;
  v_membership tmc.memberships%rowtype;
  v_booking_id uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select id, status, start_at, format into v_session
  from tmc.pt_sessions where id = p_pt_session_id;

  if v_session.id is null or v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_unavailable');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Alleen formats waar een credit-product voor bestaat; small_group_4
  -- heeft geen rittenkaart en valt buiten dit pad.
  if v_session.format not in ('one_on_one', 'duo') then
    return jsonb_build_object('ok', false, 'reason', 'format_not_supported');
  end if;

  -- Lock op het PT-pakket: credits-check en decrement zijn atomair
  -- (edge-cases 3 en 4) en status wordt onder de lock geverifieerd.
  -- Pakket moet bij het sessie-format horen: een duo-rittenkaart
  -- (plan_variant duo_*) betaalt geen 1-op-1-sessie en omgekeerd
  -- (duo-rit 110 euro per 2 personen, 1-op-1-rit 90 euro). Legacy rijen
  -- zonder plan_variant tellen als 1-op-1. Pakket moet op het boekmoment
  -- geldig zijn (expiry-afdwinging, 20260723; PT/Duo hebben vandaag geen
  -- vervaldatum, dus dit is een consistentie-regel voor de toekomst).
  select m.* into v_membership
  from tmc.memberships m
  where m.profile_id = v_uid
    and m.status = 'active'
    and m.plan_type = 'pt_package'
    and coalesce(m.credits_remaining, 0) > 0
    and (m.credits_expires_at is null or m.credits_expires_at >= current_date)
    and (
      (v_session.format = 'duo' and m.plan_variant like 'duo%')
      or (v_session.format = 'one_on_one'
          and (m.plan_variant is null or m.plan_variant not like 'duo%'))
    )
  order by m.start_date desc
  limit 1
  for update of m;

  if v_membership.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_credits');
  end if;

  begin
    insert into tmc.pt_bookings (
      profile_id, pt_session_id, price_paid_cents, credits_used_from,
      is_intake_discount, status
    ) values (
      v_uid, p_pt_session_id, 0, v_membership.id, false, 'booked'
    )
    returning id into v_booking_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end;

  update tmc.memberships
  set credits_remaining = credits_remaining - 1
  where id = v_membership.id
    and coalesce(credits_remaining, 0) > 0;
  if not found then
    raise exception 'Geen PT-credits meer beschikbaar.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'membership_id', v_membership.id
  );
end;
$function$;

create or replace function tmc.adjust_membership_credits(
  p_membership_id uuid,
  p_delta integer,
  p_reason text,
  p_source text,
  p_actor_type text,
  p_actor_id uuid default null,
  p_booking_id uuid default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_membership tmc.memberships%rowtype;
  v_booking tmc.bookings%rowtype;
  v_previous integer;
  v_new integer;
begin
  -- Service-role only, zelfde guard als tmc.activate_order: de TS-laag
  -- (requireAdmin/requireStaff/kiosk-PIN) is de autorisatiepoort, deze
  -- functie is nooit direct door een client aanroepbaar.
  if auth.uid() is not null then
    raise exception 'adjust_membership_credits is service-role only.' using errcode = '42501';
  end if;

  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_delta');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_reason');
  end if;
  if p_source is null or p_source not in ('check_in', 'refund', 'manual', 'session_cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_source');
  end if;
  -- Zelfde set als de events_actor_type_check-constraint; expliciet
  -- valideren geeft een nette reason i.p.v. een constraint-fout diep in
  -- de event-insert.
  if p_actor_type is null or p_actor_type not in ('member', 'admin', 'trainer', 'system', 'tablet', 'visitor') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_actor_type');
  end if;
  -- p_booking_id hoort alleen bij een refund: het koppelt de teruggave
  -- aan de boeking waarvan de credits terugkomen.
  if p_booking_id is not null and p_delta <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_booking_refund');
  end if;

  -- Lock op de membership-rij: check en mutatie zijn atomair, zelfde
  -- patroon als book_pt_credits.
  select * into v_membership
  from tmc.memberships
  where id = p_membership_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_membership.plan_type not in ('ten_ride_card', 'pt_package') then
    return jsonb_build_object('ok', false, 'reason', 'not_a_credit_plan');
  end if;

  -- Debit alleen op een actief pakket; een refund mag ook op een
  -- inmiddels opgezegde of verlopen rij landen (bv. sessie-annulering
  -- na een opzegging).
  if p_delta < 0 and v_membership.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_active');
  end if;

  -- Debit alleen op een niet-verlopen kaart (expiry-afdwinging, 20260723;
  -- geldig op het boekmoment, de vervaldatum zelf telt als geldige dag).
  -- Refunds blijven ook op een verlopen kaart mogelijk.
  if p_delta < 0
     and v_membership.credits_expires_at is not null
     and v_membership.credits_expires_at < current_date then
    return jsonb_build_object('ok', false, 'reason', 'credits_expired');
  end if;

  -- Booking-gekoppelde refund: lock de boeking mee en maak de
  -- dubbel-refund onmogelijk binnen dezelfde transactie.
  if p_booking_id is not null then
    select * into v_booking
    from tmc.bookings
    where id = p_booking_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
    end if;
    if coalesce(v_booking.credits_used, 0) = 0 then
      return jsonb_build_object('ok', false, 'reason', 'already_refunded');
    end if;
    if v_booking.membership_id is distinct from p_membership_id then
      return jsonb_build_object('ok', false, 'reason', 'booking_membership_mismatch');
    end if;
    if p_delta <> v_booking.credits_used then
      return jsonb_build_object('ok', false, 'reason', 'delta_mismatch');
    end if;

    update tmc.bookings
    set credits_used = 0
    where id = p_booking_id;
  end if;

  v_previous := coalesce(v_membership.credits_remaining, 0);
  v_new := v_previous + p_delta;
  if v_new < 0 then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_credits', 'previous_balance', v_previous);
  end if;

  update tmc.memberships
  set credits_remaining = v_new
  where id = p_membership_id;

  -- Audit-event in dezelfde transactie: geen saldo-mutatie zonder spoor,
  -- geen spoor zonder mutatie. Zelfde type en payload-vorm als de
  -- bestaande credits.adjusted-events uit de TS-laag.
  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'credits.adjusted',
    p_actor_type,
    p_actor_id,
    'membership',
    p_membership_id,
    jsonb_build_object(
      'profile_id', v_membership.profile_id,
      'membership_id', p_membership_id,
      'delta', p_delta,
      'previous_balance', v_previous,
      'new_balance', v_new,
      'source', p_source,
      'reason', trim(p_reason),
      'booking_id', p_booking_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'previous_balance', v_previous,
    'new_balance', v_new
  );
end;
$function$;

-- Grants opnieuw vastzetten na de recreate (create or replace behoudt
-- bestaande grants, maar expliciet is hier goedkoop en zelf-documenterend).
revoke execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid) from public;
revoke execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid) from anon;
revoke execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid) from authenticated;
grant execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid) to service_role;

-- Self-verifying: structurele checks (replay-veilig: geen profielen nodig).
do $$
declare
  v_def text;
  v_grants text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tmc' and p.proname = 'book_class_session';
  if v_def not like '%credits_expires_at%' then
    raise exception 'book_class_session mist de expiry-check';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tmc' and p.proname = 'book_pt_credits';
  if v_def not like '%credits_expires_at%' then
    raise exception 'book_pt_credits mist de expiry-check';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tmc' and p.proname = 'adjust_membership_credits';
  if v_def not like '%credits_expired%' then
    raise exception 'adjust_membership_credits mist de credits_expired-weigering';
  end if;

  select string_agg(grantee::text, ',') into v_grants
  from information_schema.routine_privileges
  where specific_schema = 'tmc' and routine_name = 'adjust_membership_credits'
    and grantee in ('authenticated', 'anon', 'PUBLIC');
  if v_grants is not null then
    raise exception 'adjust_membership_credits heeft onbedoelde grants: %', v_grants;
  end if;
end $$;

commit;
