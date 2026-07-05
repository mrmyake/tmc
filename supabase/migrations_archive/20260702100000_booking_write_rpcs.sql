-- Audit-fix #3 (+ #1 deel 2) — schrijf-acties op bookings/pt_bookings via
-- SECURITY DEFINER RPC's i.p.v. brede self-write RLS-policies.
--
-- Probleem (AUDIT-SECURITY.md §4): de RLS op tmc.bookings/tmc.pt_bookings
-- toetste alleen profile_id = auth.uid(). Alle business-invarianten
-- (capaciteit, weekly/daily caps, coverage, credits, PT-prijs, intake-
-- korting) zaten uitsluitend in app-code. Een ingelogd lid kon met de
-- publieke anon-key + zijn sessie-token de Supabase REST-API rechtstreeks
-- aanroepen en zo:
--   - boeken voorbij capaciteit / buiten zijn abonnement / zonder credits;
--   - zijn pt_booking op price_paid_cents=0 of is_intake_discount=true
--     zetten (intake-discount-exploit), of status='attended';
--   - credits_used_from op andermans membership-id zetten;
--   - kolommen van een bestaande booking herschrijven binnen
--     bookings_self_cancel (bv. session_id verhangen).
-- Daarnaast (audit #1 deel 2) liepen de credit-mutaties op tmc.memberships
-- via een user-scoped .update() die door het ontbreken van een
-- self-UPDATE-policy stil 0 rijen raakte: ten-rittenkaart-credits gingen
-- nooit omlaag bij boeken en kwamen nooit terug bij annuleren.
--
-- Fix: vier smalle RPC's die eigenaarschap + invarianten zelf valideren en
-- de credit-mutatie in dezelfde transactie meenemen:
--   - tmc.book_class_session(session, rentals)   — groepsles boeken
--   - tmc.cancel_class_booking(booking)          — groepsles annuleren + refund
--   - tmc.book_pt_credits(pt_session)            — PT boeken op pakket-credits
--   - tmc.book_pt_pending_payment(pt_session)    — PT boeken met Mollie-betaling;
--     prijs en intake-korting worden hier server-side berekend, niet client-side
-- De self-write-policies gaan weg; leden houden alleen SELECT op eigen rijen.
--
-- Race-condities (edge-cases uit het plan) en hoe ze gedekt zijn:
--   1. Dubbelboeking: expliciete check op bestaande rij + unique
--      (profile_id, session_id) / (profile_id, pt_session_id) als vangnet;
--      unique_violation wordt naar een nette 'already_booked' vertaald.
--   2. Race op capaciteit: `select ... for update` op de class_sessions-rij
--      serialiseert alle boekingen voor dezelfde sessie; de capaciteits-
--      count gebeurt pas ná het verkrijgen van de lock.
--   3. Race op credits: `select ... for update` op de memberships-rij; de
--      decrement heeft bovendien een `credits_remaining > 0`-guard zodat
--      credits nooit onder nul komen.
--   4. Verlopen/opgebruikte credit-kaart: status- en credits-check gebeuren
--      ónder de lock, dus een kaart die tussen read en write op 0 credits of
--      op een niet-actieve status belandt wordt alsnog geweigerd.
--      (credits_expires_at blijft bewust ongebruikt — besluit #3, gedrag
--      identiek aan de huidige app-laag.)
--   5. Sessie-status tussen read en boeking: de status/start_at-checks lezen
--      de sessie-rij ónder de `for update`-lock, dus een annulering die
--      gelijktijdig commit wordt gezien vóór de insert.
--
-- Weekly cap (besluit #1, optie B): alleen de hárde cap — pillars zonder
-- check-in — wordt hier afgedwongen. De zachte combined-cap (bookings +
-- check_ins, met "toch boeken?"-bevestiging) blijft een UX-nudge in de
-- TS-laag vóór de RPC-call en is bewust niet server-side gehandhaafd.
--
-- PT-prijs (besluit #2): SQL berekent price_paid_cents en is_intake_discount
-- zelf. Huidige scope: one_on_one/single → premium 9500; standard 8000, of
-- 4500 bij intake-korting (eerste keer, standard trainer, 1-op-1). De
-- client levert géén prijs- of discount-parameter meer aan.
--
-- LET OP (schema-drift, audit #4): geschreven tegen de LIVE kolommen/
-- constraints/policies van het tmc-schema (gelezen via de Supabase MCP),
-- niet tegen de historische public.*-migratiebestanden.
--
-- LET OP (grants): dit schema heeft een brede default GRANT EXECUTE naar
-- anon/authenticated op nieuwe functies; de expliciete revokes onderaan
-- zijn dus verplicht (zelfde patroon als
-- 20260702000000_membership_cancellation_rpc.sql).

-- ---------------------------------------------------------------------------
-- Helper: SQL-spiegel van PLAN_COVERAGE uit src/lib/member/plan-coverage.ts.
-- Bewust een hardcoded mapping (net als de TS-kant) en niet
-- memberships.covered_pillars: canBook() gebruikte ook de mapping, en de
-- gecachte kolom kan bij admin_manual-rijen leeg zijn.
-- ---------------------------------------------------------------------------
create or replace function tmc.plan_covers(p_plan_type text, p_pillar text)
returns boolean
language sql
immutable
as $function$
  select case p_plan_type
    when 'vrij_trainen'         then p_pillar = 'vrij_trainen'
    when 'yoga_mobility'        then p_pillar = 'yoga_mobility'
    when 'kettlebell'           then p_pillar = 'kettlebell'
    when 'all_inclusive'        then p_pillar in ('vrij_trainen', 'yoga_mobility', 'kettlebell')
    when 'kids'                 then p_pillar = 'kids'
    when 'senior'               then p_pillar = 'senior'
    when 'ten_ride_card'        then p_pillar in ('yoga_mobility', 'kettlebell')
    when 'twelve_week_program'  then p_pillar in ('vrij_trainen', 'yoga_mobility', 'kettlebell')
    else false -- pt_package en onbekende types dekken geen groepslessen
  end;
$function$;

comment on function tmc.plan_covers(text, text) is
  'SQL-spiegel van PLAN_COVERAGE (src/lib/member/plan-coverage.ts): welke pillars dekt een plan_type. Gebruikt door tmc.book_class_session.';

-- ---------------------------------------------------------------------------
-- 1. Groepsles boeken
-- ---------------------------------------------------------------------------
create or replace function tmc.book_class_session(
  p_session_id uuid,
  p_rental_mat boolean default false,
  p_rental_towel boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = tmc, extensions
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

  -- Dubbelboeking (edge-case 1) — expliciete check; de unique constraint
  -- (profile_id, session_id) vangt de race af.
  if exists (
    select 1 from tmc.bookings
    where profile_id = v_uid and session_id = p_session_id
      and status in ('booked', 'waitlisted')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end if;

  -- Capaciteit — geteld ónder de sessie-lock (edge-case 2).
  select count(*) into v_booked_count
  from tmc.bookings
  where session_id = p_session_id and status = 'booked';

  if v_booked_count >= v_session.capacity then
    return jsonb_build_object(
      'ok', false, 'reason', 'capacity_full', 'can_join_waitlist', true);
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
  -- ten-rittenkaart mét credits. De membership-rij wordt gelockt zodat de
  -- credit-decrement niet kan racen (edge-cases 3 en 4). Een opgezegd lid
  -- (cancellation_requested) houdt dekking t/m de effective date.
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
    and (m.plan_type <> 'ten_ride_card' or coalesce(m.credits_remaining, 0) > 0)
  order by (m.plan_type = 'ten_ride_card') asc, m.start_date desc
  limit 1
  for update of m;

  if v_covering.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_coverage');
  end if;

  -- Weekly cap — alleen de harde variant (besluit #1, optie B): pillars
  -- zónder check-in. Voor check-in-pillars is de combined-cap een TS-nudge.
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
      -- Kan alleen bij een race die de lock zou omzeilen — bestaat niet,
      -- maar defensief: boeking terugdraaien en weigeren.
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

comment on function tmc.book_class_session(uuid, boolean, boolean) is
  'Groepsles boeken (audit-fix #3). SECURITY DEFINER: valideert age/window/status/capaciteit/strikes/daily-cap/harde weekly-cap/dekking zelf, onder een for update-lock op de sessie- en membership-rij; trekt ten-rittenkaart-credits in dezelfde transactie af. Retourneert jsonb {ok, reason?, booking_id?, can_join_waitlist?}.';

-- ---------------------------------------------------------------------------
-- 2. Groepsles annuleren (+ credit-refund binnen het venster)
-- ---------------------------------------------------------------------------
create or replace function tmc.cancel_class_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tmc, extensions
as $function$
declare
  v_uid uuid := auth.uid();
  v_booking tmc.bookings%rowtype;
  v_start_at timestamptz;
  v_within_window boolean;
  v_credits_refunded boolean := false;
  v_cancel_hours int;
  v_vrij_minutes int;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Lock op de eigen boeking: twee gelijktijdige cancels kunnen niet allebei
  -- de refund-tak inlopen.
  select * into v_booking
  from tmc.bookings
  where id = p_booking_id and profile_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_booking.status <> 'booked' then
    return jsonb_build_object('ok', false, 'reason', 'not_booked');
  end if;

  select coalesce(bs.cancellation_window_hours, 6),
         coalesce(bs.vrij_trainen_cancel_window_minutes, 5)
  into v_cancel_hours, v_vrij_minutes
  from tmc.booking_settings bs
  limit 1;
  if not found then
    v_cancel_hours := 6;
    v_vrij_minutes := 5;
  end if;

  select start_at into v_start_at
  from tmc.class_sessions where id = v_booking.session_id;
  if v_start_at is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  -- Vrij trainen heeft een veel soepeler venster dan groepslessen.
  if v_booking.pillar = 'vrij_trainen' then
    v_within_window := v_start_at - now() >= make_interval(mins => v_vrij_minutes);
  else
    v_within_window := v_start_at - now() >= make_interval(hours => v_cancel_hours);
  end if;

  update tmc.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = case when v_within_window then 'within_window' else 'late' end
  where id = p_booking_id;

  if v_within_window and v_booking.credits_used > 0 and v_booking.membership_id is not null then
    -- Lock + refund in dezelfde transactie (audit #1 deel 2: dit was eerst
    -- een stille RLS-no-op via de user-client).
    update tmc.memberships
    set credits_remaining = coalesce(credits_remaining, 0) + v_booking.credits_used
    where id = v_booking.membership_id;
    v_credits_refunded := found;
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_booking.session_id,
    'pillar', v_booking.pillar,
    'within_window', v_within_window,
    'credits_refunded', v_credits_refunded
  );
end;
$function$;

comment on function tmc.cancel_class_booking(uuid) is
  'Eigen groepsles-boeking annuleren (audit-fix #3 + #1 deel 2). SECURITY DEFINER: valideert eigenaarschap + status onder een for update-lock, bepaalt het cancel-venster server-side en voert de credit-refund in dezelfde transactie uit. Retourneert jsonb {ok, reason?, within_window?, credits_refunded?}.';

-- ---------------------------------------------------------------------------
-- 3. PT boeken op pakket-credits
-- ---------------------------------------------------------------------------
create or replace function tmc.book_pt_credits(p_pt_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tmc, extensions
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

  select id, status, start_at into v_session
  from tmc.pt_sessions where id = p_pt_session_id;

  if v_session.id is null or v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_unavailable');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Lock op het PT-pakket: credits-check en decrement zijn atomair
  -- (edge-cases 3 en 4) en status wordt ónder de lock geverifieerd.
  select m.* into v_membership
  from tmc.memberships m
  where m.profile_id = v_uid
    and m.status = 'active'
    and m.plan_type = 'pt_package'
    and coalesce(m.credits_remaining, 0) > 0
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

comment on function tmc.book_pt_credits(uuid) is
  'PT-sessie boeken op credits van een actief pt_package (audit-fix #3 + #1 deel 2). SECURITY DEFINER: kiest en lockt het pakket zelf (credits_used_from is dus nooit client-supplied), decrement in dezelfde transactie. Retourneert jsonb {ok, reason?, booking_id?}.';

-- ---------------------------------------------------------------------------
-- 4. PT boeken met Mollie-betaling — prijs + intake-korting server-side
-- ---------------------------------------------------------------------------
create or replace function tmc.book_pt_pending_payment(p_pt_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tmc, extensions
as $function$
declare
  v_uid uuid := auth.uid();
  v_session record;
  v_has_used_intake boolean;
  v_is_intake boolean;
  v_price_cents int;
  v_existing record;
  v_booking_id uuid;
  v_reused boolean := false;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select ps.id, ps.status, ps.start_at, ps.format,
         t.pt_tier, t.display_name as trainer_name
  into v_session
  from tmc.pt_sessions ps
  join tmc.trainers t on t.id = ps.trainer_id
  where ps.id = p_pt_session_id;

  if v_session.id is null or v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_unavailable');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  select has_used_pt_intake_discount into v_has_used_intake
  from tmc.profiles where id = v_uid;
  if v_has_used_intake is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  -- Besluit #2: prijs en intake-korting worden hiér berekend — de client
  -- levert geen prijs-parameter. Huidige scope: one_on_one, single.
  -- (spiegel van calculatePtPriceCents/qualifiesForIntakeDiscount in
  -- src/lib/member/pt-pricing.ts, dat nu dode code is)
  v_is_intake := (not v_has_used_intake)
    and v_session.pt_tier = 'standard'
    and v_session.format = 'one_on_one';
  v_price_cents := case
    when v_session.pt_tier = 'premium' then 9500
    when v_is_intake then 4500
    else 8000
  end;

  -- Idempotentie: bestaande rij voor (profile, sessie) hergebruiken zodat
  -- Mollie-metadata naar hetzelfde booking-id blijft wijzen. Lock op de rij
  -- zodat twee gelijktijdige checkouts niet allebei inserten (edge-case 1;
  -- de unique constraint is het vangnet).
  select id, status into v_existing
  from tmc.pt_bookings
  where profile_id = v_uid and pt_session_id = p_pt_session_id
  for update;

  if v_existing.id is not null then
    if v_existing.status = 'booked' then
      return jsonb_build_object('ok', false, 'reason', 'already_booked');
    end if;
    -- Hergebruik (bv. eerder afgebroken betaling): prijs/discount opnieuw
    -- server-side zetten zodat een oude rij nooit een oude prijs meesleept.
    update tmc.pt_bookings
    set price_paid_cents = v_price_cents,
        is_intake_discount = v_is_intake
    where id = v_existing.id;
    v_booking_id := v_existing.id;
    v_reused := true;
  else
    begin
      insert into tmc.pt_bookings (
        profile_id, pt_session_id, price_paid_cents, is_intake_discount, status
      ) values (
        v_uid, p_pt_session_id, v_price_cents, v_is_intake, 'booked'
      )
      returning id into v_booking_id;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'already_booked');
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'price_cents', v_price_cents,
    'is_intake_discount', v_is_intake,
    'reused', v_reused,
    'trainer_name', v_session.trainer_name,
    'start_at', v_session.start_at
  );
end;
$function$;

comment on function tmc.book_pt_pending_payment(uuid) is
  'PT-sessie boeken met Mollie-betaling (audit-fix #3). SECURITY DEFINER: berekent price_paid_cents en is_intake_discount server-side (premium 9500 / standard 8000 / intake 4500) — sluit de client-side intake-discount-exploit. Retourneert jsonb {ok, reason?, booking_id?, price_cents?, is_intake_discount?, reused?, trainer_name?, start_at?}; de TS-laag maakt daarna de Mollie-payment aan en koppelt mollie_payment_id via de admin-client.';

-- ---------------------------------------------------------------------------
-- Grants — expliciet, wegens de brede default EXECUTE-grant in dit schema.
-- ---------------------------------------------------------------------------
revoke all on function tmc.plan_covers(text, text) from public;
revoke all on function tmc.plan_covers(text, text) from anon;
grant execute on function tmc.plan_covers(text, text) to authenticated;

revoke all on function tmc.book_class_session(uuid, boolean, boolean) from public;
revoke all on function tmc.book_class_session(uuid, boolean, boolean) from anon;
grant execute on function tmc.book_class_session(uuid, boolean, boolean) to authenticated;

revoke all on function tmc.cancel_class_booking(uuid) from public;
revoke all on function tmc.cancel_class_booking(uuid) from anon;
grant execute on function tmc.cancel_class_booking(uuid) to authenticated;

revoke all on function tmc.book_pt_credits(uuid) from public;
revoke all on function tmc.book_pt_credits(uuid) from anon;
grant execute on function tmc.book_pt_credits(uuid) to authenticated;

revoke all on function tmc.book_pt_pending_payment(uuid) from public;
revoke all on function tmc.book_pt_pending_payment(uuid) from anon;
grant execute on function tmc.book_pt_pending_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: self-write-policies weg — alle member-writes lopen nu via de RPC's.
-- bookings_self_read, trainer- en admin-policies blijven ongemoeid.
-- ---------------------------------------------------------------------------
drop policy if exists bookings_self_insert on tmc.bookings;
drop policy if exists bookings_self_cancel on tmc.bookings;
drop policy if exists pt_bookings_self_all on tmc.pt_bookings;

create policy pt_bookings_self_read on tmc.pt_bookings
  for select using (profile_id = auth.uid());
