-- book_class_session telt capaciteit voortaan óók over trial_bookings
-- (pending/paid/attended), dezelfde optelling als v_session_availability
-- en redeem_trial_code. Vóór deze fix telde de schrijf-gate alleen
-- tmc.bookings (status 'booked'), terwijl de weergave-view proefles- en
-- codeboekingen al meetelde: een lid kon boeken op een plek die een
-- proefles- of codebezoeker al innam. Met trial_codes live (20260808) was
-- dat gat asymmetrisch geworden: redeem_trial_code telt wel over beide
-- tabellen, book_class_session niet.
--
-- De nieuwe telling staat op exact de bestaande plek, onder de bestaande
-- `for update`-lock op de sessie-rij. redeem_trial_code neemt dezelfde
-- rijlock vóór zíjn telling, dus beide schrijvers serialiseren op
-- dezelfde lock en zien elkaars committed rijen: de race is dicht, niet
-- verplaatst. Return bij vol ongewijzigd:
-- {ok:false, reason:'capacity_full', can_join_waitlist:true}.
--
-- CREATE OR REPLACE, zelfde signatuur (uuid, boolean, boolean) en
-- returntype: ACL (postgres + authenticated EXECUTE) blijft staan, geen
-- drop en geen grant-herstel nodig. Verder ongewijzigd: alle checks,
-- volgordes en reason-codes zijn byte-voor-byte de live definitie
-- (pg_get_functiondef, 2026-07-23) op het capaciteitsblok na.
--
-- Bewust NIET in deze migratie: v_session_availability (telt al goed),
-- redeem_trial_code en de overige trial_codes-RPC's (20260808,
-- ongemoeid), de waitlist-promote cron (leest de view en boekt via deze
-- RPC, geen eigen telling), vw_admin_kpis (fill-rate-scheefheid is een
-- los ledger-punt) en guest_bookings (telt nergens mee; eigen ledger-punt
-- met deadline).
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd.

create or replace function tmc.book_class_session(
  p_session_id uuid,
  p_rental_mat boolean default false,
  p_rental_towel boolean default false
) returns jsonb
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
  -- Telling = leden-bookings ('booked') PLUS trial_bookings
  -- (pending/paid/attended): exact de optelling van v_session_availability
  -- en redeem_trial_code, zodat weergave en beide schrijf-gates dezelfde
  -- bezetting zien (trial-capaciteitsfix, 20260809).
  if v_session.capacity is not null then
    select
      (select count(*) from tmc.bookings
        where session_id = p_session_id and status = 'booked')
      + (select count(*) from tmc.trial_bookings
        where session_id = p_session_id
          and status in ('pending', 'paid', 'attended'))
    into v_booked_count;

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
