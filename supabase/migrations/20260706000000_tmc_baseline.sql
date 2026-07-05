


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "tmc";


ALTER SCHEMA "tmc" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "tmc"."training_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "title" "text",
    "notes" "text",
    "activated_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_programs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'archived'::"text"])))
);


ALTER TABLE "tmc"."training_programs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."activate_training_program"("p_program_id" "uuid") RETURNS "tmc"."training_programs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_program tmc.training_programs%rowtype;
begin
  select * into v_program
  from tmc.training_programs
  where id = p_program_id
  for update;

  if not found then
    raise exception 'Programma niet gevonden.';
  end if;
  if v_program.status <> 'draft' then
    raise exception 'Alleen een concept kan geactiveerd worden.';
  end if;

  update tmc.training_programs
  set status = 'archived', archived_at = now()
  where profile_id = v_program.profile_id
    and status = 'active';

  update tmc.training_programs
  set status = 'active', activated_at = now()
  where id = p_program_id
  returning * into v_program;

  return v_program;
end;
$$;


ALTER FUNCTION "tmc"."activate_training_program"("p_program_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "tmc"."activate_training_program"("p_program_id" "uuid") IS 'Archiveert atomair het huidige actieve schema van de klant en activeert de opgegeven draft. Service-role-only; aangeroepen via admin server actions.';



CREATE OR REPLACE FUNCTION "tmc"."apply_pause_to_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  pause_days integer;
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    pause_days := (new.end_date - new.start_date);
    update tmc.memberships
    set commit_end_date = commit_end_date + (pause_days || ' days')::interval
    where id = new.membership_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "tmc"."apply_pause_to_commit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."book_class_session"("p_session_id" "uuid", "p_rental_mat" boolean DEFAULT false, "p_rental_towel" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
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


ALTER FUNCTION "tmc"."book_class_session"("p_session_id" "uuid", "p_rental_mat" boolean, "p_rental_towel" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "tmc"."book_class_session"("p_session_id" "uuid", "p_rental_mat" boolean, "p_rental_towel" boolean) IS 'Groepsles boeken (audit-fix #3). SECURITY DEFINER: valideert age/window/status/capaciteit/strikes/daily-cap/harde weekly-cap/dekking zelf, onder een for update-lock op de sessie- en membership-rij; trekt ten-rittenkaart-credits in dezelfde transactie af. Retourneert jsonb {ok, reason?, booking_id?, can_join_waitlist?}.';



CREATE OR REPLACE FUNCTION "tmc"."book_pt_credits"("p_pt_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "tmc"."book_pt_credits"("p_pt_session_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "tmc"."book_pt_credits"("p_pt_session_id" "uuid") IS 'PT-sessie boeken op credits van een actief pt_package (audit-fix #3 + #1 deel 2). SECURITY DEFINER: kiest en lockt het pakket zelf (credits_used_from is dus nooit client-supplied), decrement in dezelfde transactie. Retourneert jsonb {ok, reason?, booking_id?}.';



CREATE OR REPLACE FUNCTION "tmc"."book_pt_pending_payment"("p_pt_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "tmc"."book_pt_pending_payment"("p_pt_session_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "tmc"."book_pt_pending_payment"("p_pt_session_id" "uuid") IS 'PT-sessie boeken met Mollie-betaling (audit-fix #3). SECURITY DEFINER: berekent price_paid_cents en is_intake_discount server-side (premium 9500 / standard 8000 / intake 4500) — sluit de client-side intake-discount-exploit. Retourneert jsonb {ok, reason?, booking_id?, price_cents?, is_intake_discount?, reused?, trainer_name?, start_at?}; de TS-laag maakt daarna de Mollie-payment aan en koppelt mollie_payment_id via de admin-client.';



CREATE OR REPLACE FUNCTION "tmc"."cancel_class_booking"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "tmc"."cancel_class_booking"("p_booking_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "tmc"."cancel_class_booking"("p_booking_id" "uuid") IS 'Eigen groepsles-boeking annuleren (audit-fix #3 + #1 deel 2). SECURITY DEFINER: valideert eigenaarschap + status onder een for update-lock, bepaalt het cancel-venster server-side en voert de credit-refund in dezelfde transactie uit. Retourneert jsonb {ok, reason?, within_window?, credits_refunded?}.';



CREATE OR REPLACE FUNCTION "tmc"."cleanup_expired_strikes"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  deleted_count integer;
begin
  delete from tmc.no_show_strikes where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;


ALTER FUNCTION "tmc"."cleanup_expired_strikes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."complete_workout_session"("p_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session tmc.workout_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select * into v_session
  from tmc.workout_sessions
  where id = p_session_id and profile_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  if v_session.completed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_completed');
  end if;

  update tmc.workout_sessions
  set completed_at = now()
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object('ok', true, 'completed_at', v_session.completed_at);
end;
$$;


ALTER FUNCTION "tmc"."complete_workout_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
  select coalesce(
    (select role from tmc.profiles where id = auth.uid()),
    'anon'
  );
$$;


ALTER FUNCTION "tmc"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."duplicate_training_program"("p_program_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_src tmc.training_programs%rowtype;
  v_new_id uuid;
  v_next_version integer;
  v_day record;
  v_new_day_id uuid;
begin
  select * into v_src
  from tmc.training_programs
  where id = p_program_id;

  if not found then
    raise exception 'Programma niet gevonden.';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
  from tmc.training_programs
  where profile_id = v_src.profile_id;

  insert into tmc.training_programs (profile_id, version, status, title, notes)
  values (v_src.profile_id, v_next_version, 'draft', v_src.title, v_src.notes)
  returning id into v_new_id;

  for v_day in
    select * from tmc.program_days
    where program_id = p_program_id
    order by day_number
  loop
    insert into tmc.program_days (program_id, day_number, label)
    values (v_new_id, v_day.day_number, v_day.label)
    returning id into v_new_day_id;

    insert into tmc.program_exercises (
      day_id, slot, exercise_id, sets, reps_min, reps_max,
      tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
      rest_seconds, notes
    )
    select
      v_new_day_id, slot, exercise_id, sets, reps_min, reps_max,
      tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
      rest_seconds, notes
    from tmc.program_exercises
    where day_id = v_day.id;
  end loop;

  return v_new_id;
end;
$$;


ALTER FUNCTION "tmc"."duplicate_training_program"("p_program_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "tmc"."duplicate_training_program"("p_program_id" "uuid") IS 'Kopieert een schema (inclusief dagen en oefeningen) naar een nieuwe draft-versie voor dezelfde klant. Service-role-only; aangeroepen via admin server actions.';



CREATE OR REPLACE FUNCTION "tmc"."events_block_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'tmc.events is append-only: % is niet toegestaan', tg_op;
end;
$$;


ALTER FUNCTION "tmc"."events_block_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."expire_lock_in_on_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if new.lock_in_active then
      new.lock_in_active := false;
      new.lock_in_expired_at := now();
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "tmc"."expire_lock_in_on_cancel"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "membership_id" "uuid",
    "status" "text" DEFAULT 'booked'::"text" NOT NULL,
    "iso_year" integer NOT NULL,
    "iso_week" integer NOT NULL,
    "session_date" "date" NOT NULL,
    "pillar" "text" NOT NULL,
    "credits_used" integer DEFAULT 0 NOT NULL,
    "drop_in_payment_id" "text",
    "drop_in_price_cents" integer DEFAULT 0 NOT NULL,
    "cancellation_reason" "text",
    "cancelled_at" timestamp with time zone,
    "booked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attended_at" timestamp with time zone,
    "reminder_sent_at" timestamp with time zone,
    "rental_mat" boolean DEFAULT false NOT NULL,
    "rental_towel" boolean DEFAULT false NOT NULL,
    "no_show_at" timestamp with time zone,
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['booked'::"text", 'cancelled'::"text", 'waitlisted'::"text"])))
);


ALTER TABLE "tmc"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."class_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_type_id" "uuid" NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "pillar" "text" NOT NULL,
    "age_category" "text" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "capacity" integer NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "cancellation_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "blocks_free_training" boolean DEFAULT false NOT NULL,
    CONSTRAINT "class_sessions_age_category_check" CHECK (("age_category" = ANY (ARRAY['adult'::"text", 'kids'::"text", 'senior'::"text"]))),
    CONSTRAINT "class_sessions_capacity_check" CHECK (("capacity" > 0)),
    CONSTRAINT "class_sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'cancelled'::"text", 'completed'::"text"])))
);


ALTER TABLE "tmc"."class_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."crowdfunding_backers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tier_id" "text" NOT NULL,
    "tier_name" "text" NOT NULL,
    "amount" integer NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "mollie_payment_id" "text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "show_on_wall" boolean DEFAULT true
);


ALTER TABLE "tmc"."crowdfunding_backers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."membership_pauses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "membership_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "medical_attest_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "membership_pauses_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "membership_pauses_reason_check" CHECK (("reason" = ANY (ARRAY['pregnancy'::"text", 'medical'::"text", 'other_approved'::"text"]))),
    CONSTRAINT "membership_pauses_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'active'::"text", 'completed'::"text"])))
);


ALTER TABLE "tmc"."membership_pauses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "plan_type" "text" NOT NULL,
    "plan_variant" "text",
    "frequency_cap" integer,
    "age_category" "text" DEFAULT 'adult'::"text" NOT NULL,
    "price_per_cycle_cents" integer NOT NULL,
    "billing_cycle_weeks" integer DEFAULT 4 NOT NULL,
    "commit_months" integer DEFAULT 12 NOT NULL,
    "start_date" "date" NOT NULL,
    "commit_end_date" "date" NOT NULL,
    "end_date" "date",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "cancellation_requested_at" timestamp with time zone,
    "cancellation_effective_date" "date",
    "lock_in_active" boolean DEFAULT false NOT NULL,
    "lock_in_source" "text",
    "lock_in_price_cents" integer,
    "lock_in_expired_at" timestamp with time zone,
    "mollie_customer_id" "text",
    "mollie_subscription_id" "text",
    "registration_fee_paid" boolean DEFAULT false NOT NULL,
    "credits_remaining" integer,
    "credits_total" integer,
    "credits_expires_at" "date",
    "covered_pillars" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source" "text" DEFAULT 'direct'::"text" NOT NULL,
    "crowdfunding_tier_id" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memberships_age_category_check" CHECK (("age_category" = ANY (ARRAY['adult'::"text", 'kids'::"text", 'senior'::"text"]))),
    CONSTRAINT "memberships_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['vrij_trainen'::"text", 'yoga_mobility'::"text", 'kettlebell'::"text", 'all_inclusive'::"text", 'kids'::"text", 'senior'::"text", 'ten_ride_card'::"text", 'pt_package'::"text", 'twelve_week_program'::"text"]))),
    CONSTRAINT "memberships_source_check" CHECK (("source" = ANY (ARRAY['direct'::"text", 'crowdfunding'::"text", 'admin_manual'::"text"]))),
    CONSTRAINT "memberships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'paused'::"text", 'cancellation_requested'::"text", 'cancelled'::"text", 'expired'::"text", 'payment_failed'::"text"])))
);


ALTER TABLE "tmc"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "date_of_birth" "date",
    "age_category" "text" DEFAULT 'adult'::"text" NOT NULL,
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    "health_intake_completed_at" timestamp with time zone,
    "health_notes" "text",
    "avatar_url" "text",
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "has_used_pt_intake_discount" boolean DEFAULT false NOT NULL,
    "marketing_opt_in" boolean DEFAULT false NOT NULL,
    "locale" "text" DEFAULT 'nl'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "street_address" "text",
    "postal_code" "text",
    "city" "text",
    "country" "text" DEFAULT 'NL'::"text" NOT NULL,
    "acquisition_source" "text",
    "acquisition_medium" "text",
    "acquisition_campaign" "text",
    "acquisition_content" "text",
    "signup_path" "text",
    "first_touch_at" timestamp with time zone,
    "member_code" "text" NOT NULL,
    CONSTRAINT "profiles_age_category_check" CHECK (("age_category" = ANY (ARRAY['adult'::"text", 'kids'::"text", 'senior'::"text"]))),
    CONSTRAINT "profiles_member_code_format" CHECK (("member_code" ~ '^[0-9]{6}$'::"text")),
    CONSTRAINT "profiles_phone_e164_nl" CHECK (("phone" ~ '^\+31[0-9]{9}$'::"text")),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'trainer'::"text", 'admin'::"text"])))
);


ALTER TABLE "tmc"."profiles" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "tmc"."vw_admin_kpis" AS
 WITH "active_members" AS (
         SELECT "count"(*) AS "count"
           FROM "tmc"."memberships"
          WHERE ("memberships"."status" = 'active'::"text")
        ), "mrr" AS (
         SELECT (COALESCE("sum"(((("memberships"."price_per_cycle_cents")::numeric * 30.4375) / (("memberships"."billing_cycle_weeks" * 7))::numeric)), (0)::numeric))::bigint AS "cents"
           FROM "tmc"."memberships"
          WHERE ("memberships"."status" = 'active'::"text")
        ), "new_signups_week" AS (
         SELECT "count"(*) AS "count"
           FROM "tmc"."memberships"
          WHERE ("memberships"."created_at" >= ("now"() - '7 days'::interval))
        ), "new_signups_month" AS (
         SELECT "count"(*) AS "count"
           FROM "tmc"."memberships"
          WHERE ("memberships"."created_at" >= ("now"() - '30 days'::interval))
        ), "churn_30d" AS (
         SELECT "count"(*) AS "count"
           FROM "tmc"."memberships"
          WHERE (("memberships"."status" = ANY (ARRAY['cancelled'::"text", 'expired'::"text"])) AND ("memberships"."cancellation_effective_date" >= ((CURRENT_DATE - '30 days'::interval))::"date") AND ("memberships"."cancellation_effective_date" <= CURRENT_DATE))
        ), "active_pauses" AS (
         SELECT "count"(*) AS "count"
           FROM "tmc"."membership_pauses"
          WHERE (("membership_pauses"."status" = 'active'::"text") AND ("membership_pauses"."end_date" >= CURRENT_DATE))
        ), "fill_rate_week" AS (
         SELECT COALESCE("avg"(
                CASE
                    WHEN ("s"."capacity" > 0) THEN (( SELECT ("count"(*))::numeric AS "count"
                       FROM "tmc"."bookings" "b"
                      WHERE (("b"."session_id" = "s"."id") AND ("b"."status" = ANY (ARRAY['booked'::"text", 'attended'::"text", 'no_show'::"text"])))) / ("s"."capacity")::numeric)
                    ELSE (0)::numeric
                END), (0)::numeric) AS "ratio"
           FROM "tmc"."class_sessions" "s"
          WHERE (("s"."start_at" >= ("now"() - '7 days'::interval)) AND ("s"."start_at" < "now"()) AND ("s"."pillar" <> 'vrij_trainen'::"text"))
        ), "no_show_rate_30d" AS (
         SELECT COALESCE((("count"(*) FILTER (WHERE ("bookings"."status" = 'no_show'::"text")))::numeric / (NULLIF("count"(*) FILTER (WHERE ("bookings"."status" = ANY (ARRAY['attended'::"text", 'no_show'::"text"]))), 0))::numeric), (0)::numeric) AS "ratio"
           FROM "tmc"."bookings"
          WHERE ("bookings"."booked_at" >= ("now"() - '30 days'::interval))
        ), "crowdfunding_conversion" AS (
         SELECT "count"(DISTINCT "b"."email") AS "total_backers",
            "count"(DISTINCT
                CASE
                    WHEN ("m"."id" IS NOT NULL) THEN "b"."email"
                    ELSE NULL::"text"
                END) AS "converted_members"
           FROM (("tmc"."crowdfunding_backers" "b"
             LEFT JOIN "tmc"."profiles" "p" ON (("lower"("p"."email") = "lower"("b"."email"))))
             LEFT JOIN "tmc"."memberships" "m" ON ((("m"."profile_id" = "p"."id") AND ("m"."status" = 'active'::"text"))))
          WHERE ("b"."payment_status" = 'paid'::"text")
        )
 SELECT ( SELECT "active_members"."count"
           FROM "active_members") AS "active_members",
    ( SELECT "mrr"."cents"
           FROM "mrr") AS "mrr_cents",
    ( SELECT "new_signups_week"."count"
           FROM "new_signups_week") AS "new_signups_week",
    ( SELECT "new_signups_month"."count"
           FROM "new_signups_month") AS "new_signups_month",
    ( SELECT "churn_30d"."count"
           FROM "churn_30d") AS "churn_30d",
    ( SELECT "active_pauses"."count"
           FROM "active_pauses") AS "active_pauses",
    "round"((( SELECT "fill_rate_week"."ratio"
           FROM "fill_rate_week") * (100)::numeric), 1) AS "fill_rate_week_pct",
    "round"((( SELECT "no_show_rate_30d"."ratio"
           FROM "no_show_rate_30d") * (100)::numeric), 1) AS "no_show_rate_30d_pct",
    ( SELECT "crowdfunding_conversion"."total_backers"
           FROM "crowdfunding_conversion") AS "crowdfunding_total_backers",
    ( SELECT "crowdfunding_conversion"."converted_members"
           FROM "crowdfunding_conversion") AS "crowdfunding_converted_members",
    "now"() AS "refreshed_at"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "tmc"."vw_admin_kpis" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."get_admin_kpis"() RETURNS "tmc"."vw_admin_kpis"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  result tmc.vw_admin_kpis;
begin
  if not tmc.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  select * into result from tmc.vw_admin_kpis limit 1;
  return result;
end;
$$;


ALTER FUNCTION "tmc"."get_admin_kpis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."get_remaining_guest_passes"("p_profile_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
  select greatest(0, passes_allocated - passes_used)
  from tmc.guest_passes
  where profile_id = p_profile_id
    and period_start <= current_date
    and period_end > current_date
  order by period_start desc
  limit 1;
$$;


ALTER FUNCTION "tmc"."get_remaining_guest_passes"("p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_code text;
  v_attempts integer := 0;
begin
  loop
    v_code := lpad((floor(random() * 1000000))::text, 6, '0');
    exit when not exists (
      select 1 from tmc.profiles where member_code = v_code
    );
    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      raise exception 'member_code collision storm';
    end if;
  end loop;

  insert into tmc.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    member_code,
    acquisition_source,
    acquisition_medium,
    acquisition_campaign,
    acquisition_content,
    signup_path,
    first_touch_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'phone',
    v_code,
    new.raw_user_meta_data->>'acquisition_source',
    new.raw_user_meta_data->>'acquisition_medium',
    new.raw_user_meta_data->>'acquisition_campaign',
    new.raw_user_meta_data->>'acquisition_content',
    new.raw_user_meta_data->>'signup_path',
    nullif(new.raw_user_meta_data->>'first_touch_at', '')::timestamptz
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "tmc"."handle_new_auth_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "tmc"."handle_new_auth_user"() IS 'Trigger op auth.users insert. Genereert member_code. Phone blijft leeg (nullable) als de auth-metadata er geen bevat, i.p.v. het eerder verzonnen fallback-nummer (fix 2026-07-03, zie profiles_phone_nullable migratie) — telefoon wordt nu verplicht bij eerste boeking/checkout, niet bij signup.';



CREATE OR REPLACE FUNCTION "tmc"."increment_cf_stats"("p_amount" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
BEGIN
  INSERT INTO crowdfunding_stats (id, total_raised, total_backers, updated_at)
  VALUES (1, p_amount, 1, NOW())
  ON CONFLICT (id) DO UPDATE
    SET
      total_raised  = crowdfunding_stats.total_raised + p_amount,
      total_backers = crowdfunding_stats.total_backers + 1,
      updated_at    = NOW();
END;
$$;


ALTER FUNCTION "tmc"."increment_cf_stats"("p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."increment_cf_stats"("p_amount" numeric) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
  update tmc.crowdfunding_stats
  set total_raised  = coalesce(total_raised, 0) + p_amount,
      total_backers = coalesce(total_backers, 0) + 1,
      updated_at    = now()
  where id = 1;
$$;


ALTER FUNCTION "tmc"."increment_cf_stats"("p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."increment_cf_tier_slot"("p_tier_id" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
  insert into tmc.crowdfunding_tiers (id, slots_claimed)
  values (p_tier_id, 1)
  on conflict (id)
  do update set slots_claimed = tmc.crowdfunding_tiers.slots_claimed + 1;
$$;


ALTER FUNCTION "tmc"."increment_cf_tier_slot"("p_tier_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
  select tmc.current_user_role() = 'admin';
$$;


ALTER FUNCTION "tmc"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."is_trainer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
  select tmc.current_user_role() = 'trainer';
$$;


ALTER FUNCTION "tmc"."is_trainer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."log_set"("p_session_id" "uuid", "p_program_exercise_id" "uuid", "p_set_number" integer, "p_weight_kg" numeric, "p_reps" integer, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session tmc.workout_sessions%rowtype;
  v_exercise tmc.program_exercises%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  if p_weight_kg is null or p_weight_kg < 0 or p_reps is null or p_reps < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_values');
  end if;

  select * into v_session
  from tmc.workout_sessions
  where id = p_session_id and profile_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  if v_session.completed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'session_completed');
  end if;

  select * into v_exercise
  from tmc.program_exercises
  where id = p_program_exercise_id;

  if not found or v_exercise.day_id <> v_session.day_id then
    return jsonb_build_object('ok', false, 'reason', 'exercise_not_in_session');
  end if;

  if p_set_number < 1 or p_set_number > v_exercise.sets then
    return jsonb_build_object('ok', false, 'reason', 'set_number_out_of_range');
  end if;

  insert into tmc.set_logs (
    session_id, program_exercise_id, exercise_id, set_number, weight_kg, reps, notes
  )
  values (
    p_session_id, p_program_exercise_id, v_exercise.exercise_id, p_set_number, p_weight_kg, p_reps, p_notes
  )
  on conflict (session_id, program_exercise_id, set_number)
  do update set weight_kg = excluded.weight_kg, reps = excluded.reps, notes = excluded.notes;

  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "tmc"."log_set"("p_session_id" "uuid", "p_program_exercise_id" "uuid", "p_set_number" integer, "p_weight_kg" numeric, "p_reps" integer, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."plan_covers"("p_plan_type" "text", "p_pillar" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
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
$$;


ALTER FUNCTION "tmc"."plan_covers"("p_plan_type" "text", "p_pillar" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "tmc"."plan_covers"("p_plan_type" "text", "p_pillar" "text") IS 'SQL-spiegel van PLAN_COVERAGE (src/lib/member/plan-coverage.ts): welke pillars dekt een plan_type. Gebruikt door tmc.book_class_session.';



CREATE OR REPLACE FUNCTION "tmc"."refresh_admin_kpis"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
begin
  refresh materialized view concurrently tmc.vw_admin_kpis;
end;
$$;


ALTER FUNCTION "tmc"."refresh_admin_kpis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."request_membership_cancellation"("p_membership_id" "uuid") RETURNS TABLE("id" "uuid", "status" "text", "cancellation_requested_at" timestamp with time zone, "cancellation_effective_date" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_status text;
  v_commit_end_date date;
  v_effective_date date;
begin
  select m.status, m.commit_end_date
    into v_status, v_commit_end_date
  from tmc.memberships m
  where m.id = p_membership_id
    and m.profile_id = auth.uid();

  if v_status is null then
    raise exception 'Abonnement niet gevonden.' using errcode = '42501';
  end if;

  if v_status = 'cancellation_requested' then
    raise exception 'Je opzegverzoek staat al open.';
  end if;

  if v_status not in ('active', 'paused', 'payment_failed') then
    raise exception 'Dit abonnement kan niet worden opgezegd.';
  end if;

  v_effective_date := greatest(v_commit_end_date, current_date + 28);

  return query
  update tmc.memberships m
  set status = 'cancellation_requested',
      cancellation_requested_at = now(),
      cancellation_effective_date = v_effective_date
  where m.id = p_membership_id
    and m.profile_id = auth.uid()
  returning m.id, m.status, m.cancellation_requested_at, m.cancellation_effective_date;
end;
$$;


ALTER FUNCTION "tmc"."request_membership_cancellation"("p_membership_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "tmc"."request_membership_cancellation"("p_membership_id" "uuid") IS 'Self-service opzegging voor leden (audit-fix #1). SECURITY DEFINER: valideert profile_id = auth.uid() en de toegestane status-overgang (active/paused/payment_failed -> cancellation_requested) zelf; raakt alleen status/cancellation_requested_at/cancellation_effective_date, nooit prijs-, lock-in- of mollie-kolommen. Raise een exception bij ongeldige aanroep i.p.v. stil 0 rijen te raken.';



CREATE OR REPLACE FUNCTION "tmc"."set_admin_checkin_pin"("p_pin" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $_$
begin
  if not tmc.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN moet 4-6 cijfers zijn';
  end if;
  update tmc.booking_settings
  set admin_checkin_pin_hash = extensions.crypt(
    p_pin,
    extensions.gen_salt('bf')
  )
  where id = 'singleton';
end;
$_$;


ALTER FUNCTION "tmc"."set_admin_checkin_pin"("p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."set_commit_end_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
begin
  if new.commit_end_date is null then
    new.commit_end_date = new.start_date + (new.commit_months || ' months')::interval;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "tmc"."set_commit_end_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."start_workout_session"("p_day_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_program_id uuid;
  v_session tmc.workout_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select p.id into v_program_id
  from tmc.program_days d
  join tmc.training_programs p on p.id = d.program_id
  where d.id = p_day_id
    and p.profile_id = v_uid
    and p.status = 'active';

  if v_program_id is null then
    return jsonb_build_object('ok', false, 'reason', 'day_not_found');
  end if;

  -- Hervat een bestaande, nog niet afgeronde sessie voor deze dag i.p.v.
  -- een dubbele aan te maken bij een dubbele tap of page reload.
  select * into v_session
  from tmc.workout_sessions
  where profile_id = v_uid and day_id = p_day_id and completed_at is null
  order by started_at desc
  limit 1;

  if not found then
    insert into tmc.workout_sessions (profile_id, program_id, day_id)
    values (v_uid, v_program_id, p_day_id)
    returning * into v_session;
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'started_at', v_session.started_at
  );
end;
$$;


ALTER FUNCTION "tmc"."start_workout_session"("p_day_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "tmc"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tmc"."verify_admin_checkin_pin"("p_pin" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'tmc', 'extensions'
    AS $$
declare
  stored_hash text;
begin
  select admin_checkin_pin_hash into stored_hash
  from tmc.booking_settings where id = 'singleton';
  if stored_hash is null then
    return false;
  end if;
  return stored_hash = extensions.crypt(p_pin, stored_hash);
end;
$$;


ALTER FUNCTION "tmc"."verify_admin_checkin_pin"("p_pin" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."admin_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "tmc"."admin_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "audience" "text" DEFAULT 'trainers'::"text" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "published_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcements_audience_check" CHECK (("audience" = ANY (ARRAY['all'::"text", 'trainers'::"text", 'members'::"text"]))),
    CONSTRAINT "announcements_title_check" CHECK (("length"(TRIM(BOTH FROM "title")) > 0))
);


ALTER TABLE "tmc"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."booking_settings" (
    "id" "text" DEFAULT 'singleton'::"text" NOT NULL,
    "cancellation_window_hours" integer DEFAULT 6 NOT NULL,
    "booking_window_days" integer DEFAULT 14 NOT NULL,
    "waitlist_confirmation_minutes" integer DEFAULT 30 NOT NULL,
    "fair_use_daily_max" integer DEFAULT 2 NOT NULL,
    "no_show_strike_window_days" integer DEFAULT 30 NOT NULL,
    "no_show_strike_threshold" integer DEFAULT 3 NOT NULL,
    "no_show_block_days" integer DEFAULT 7 NOT NULL,
    "registration_fee_cents" integer DEFAULT 3900 NOT NULL,
    "drop_in_yoga_cents" integer DEFAULT 2000 NOT NULL,
    "drop_in_kettlebell_cents" integer DEFAULT 2000 NOT NULL,
    "drop_in_kids_cents" integer DEFAULT 1300 NOT NULL,
    "drop_in_senior_cents" integer DEFAULT 1300 NOT NULL,
    "ten_ride_card_cents" integer DEFAULT 17000 NOT NULL,
    "ten_ride_card_crowdfunding_cents" integer DEFAULT 15000 NOT NULL,
    "ten_ride_card_validity_months" integer DEFAULT 4 NOT NULL,
    "kids_ten_ride_card_cents" integer DEFAULT 11000 NOT NULL,
    "senior_ten_ride_card_cents" integer DEFAULT 11000 NOT NULL,
    "pt_intake_discount_cents" integer DEFAULT 4500 NOT NULL,
    "member_pt_discount_percent" integer DEFAULT 10 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vrij_trainen_cancel_window_minutes" integer DEFAULT 5 NOT NULL,
    "check_in_enabled" boolean DEFAULT true NOT NULL,
    "check_in_pillars" "text"[] DEFAULT ARRAY['yoga_mobility'::"text", 'kettlebell'::"text", 'vrij_trainen'::"text"] NOT NULL,
    "check_in_required_for_cap" boolean DEFAULT true NOT NULL,
    "no_show_release_minutes" integer DEFAULT 10 NOT NULL,
    "admin_checkin_pin_hash" "text",
    CONSTRAINT "booking_settings_id_check" CHECK (("id" = 'singleton'::"text"))
);


ALTER TABLE "tmc"."booking_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."check_ins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "booking_id" "uuid",
    "checked_in_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "checked_in_date" "date" GENERATED ALWAYS AS ((("checked_in_at" AT TIME ZONE 'UTC'::"text"))::"date") STORED,
    "checked_in_by" "uuid",
    "check_in_method" "text" NOT NULL,
    "access_type" "text" NOT NULL,
    "pillar" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_ins_access_type_check" CHECK (("access_type" = ANY (ARRAY['membership'::"text", 'guest_pass'::"text", 'credit'::"text", 'drop_in'::"text", 'trial'::"text", 'comp'::"text"]))),
    CONSTRAINT "check_ins_check_in_method_check" CHECK (("check_in_method" = ANY (ARRAY['self_tablet'::"text", 'admin_tablet'::"text", 'admin_web'::"text"])))
);


ALTER TABLE "tmc"."check_ins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."class_pillars" (
    "code" "text" NOT NULL,
    "name_nl" "text" NOT NULL,
    "description_nl" "text",
    "age_category" "text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "class_pillars_age_category_check" CHECK (("age_category" = ANY (ARRAY['adult'::"text", 'kids'::"text", 'senior'::"text"]))),
    CONSTRAINT "class_pillars_code_check" CHECK (("code" = ANY (ARRAY['vrij_trainen'::"text", 'yoga_mobility'::"text", 'kettlebell'::"text", 'kids'::"text", 'senior'::"text"])))
);


ALTER TABLE "tmc"."class_pillars" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."class_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sanity_id" "text",
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "pillar" "text" NOT NULL,
    "age_category" "text" NOT NULL,
    "default_capacity" integer,
    "default_duration_minutes" integer DEFAULT 60 NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "color" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "class_types_age_category_check" CHECK (("age_category" = ANY (ARRAY['adult'::"text", 'kids'::"text", 'senior'::"text"])))
);


ALTER TABLE "tmc"."class_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."crowdfunding_stats" (
    "id" integer DEFAULT 1 NOT NULL,
    "total_raised" integer DEFAULT 0,
    "total_backers" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "crowdfunding_stats_id_check" CHECK (("id" = 1))
);


ALTER TABLE "tmc"."crowdfunding_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."crowdfunding_tiers" (
    "id" "text" NOT NULL,
    "slots_claimed" integer DEFAULT 0
);


ALTER TABLE "tmc"."crowdfunding_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."device_push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "device_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "tmc"."device_push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "actor_type" "text" NOT NULL,
    "actor_id" "uuid",
    "subject_type" "text",
    "subject_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "events_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['member'::"text", 'admin'::"text", 'trainer'::"text", 'system'::"text", 'tablet'::"text", 'visitor'::"text"])))
);


ALTER TABLE "tmc"."events" OWNER TO "postgres";


COMMENT ON TABLE "tmc"."events" IS 'Append-only domein-event log (PR4). Schrijven uitsluitend via service-role, lezen alleen admin, update/delete geblokkeerd via trigger. actor_id/subject_id zijn FK-loze historische referenties.';



COMMENT ON COLUMN "tmc"."events"."type" IS 'Event-naam in dot-notatie, bv. booking.created, payment.failed.';



COMMENT ON COLUMN "tmc"."events"."payload" IS 'Minimale payload: ids, enums en timestamps. Geen PII. Voor payment.* events staat de Mollie payment-id op payload.dedupe_key voor dedupe-bij-lezen.';



CREATE TABLE IF NOT EXISTS "tmc"."exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "video_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "tmc"."exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."guest_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "guest_pass_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "booked_by" "uuid" NOT NULL,
    "guest_name" "text" NOT NULL,
    "guest_email" "text" NOT NULL,
    "status" "text" DEFAULT 'booked'::"text" NOT NULL,
    "reminder_sent" boolean DEFAULT false NOT NULL,
    "booked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "guest_bookings_guest_email_check" CHECK (("length"(TRIM(BOTH FROM "guest_email")) > 0)),
    CONSTRAINT "guest_bookings_guest_name_check" CHECK (("length"(TRIM(BOTH FROM "guest_name")) > 0)),
    CONSTRAINT "guest_bookings_status_check" CHECK (("status" = ANY (ARRAY['booked'::"text", 'cancelled'::"text", 'attended'::"text", 'no_show'::"text"])))
);


ALTER TABLE "tmc"."guest_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."guest_passes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "membership_id" "uuid",
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "passes_allocated" integer NOT NULL,
    "passes_used" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "guest_passes_passes_allocated_check" CHECK (("passes_allocated" >= 0)),
    CONSTRAINT "guest_passes_passes_used_check" CHECK (("passes_used" >= 0)),
    CONSTRAINT "guest_passes_used_lte_allocated" CHECK (("passes_used" <= "passes_allocated"))
);


ALTER TABLE "tmc"."guest_passes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."member_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "member_notes_body_check" CHECK (("length"(TRIM(BOTH FROM "body")) > 0))
);


ALTER TABLE "tmc"."member_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."membership_plan_catalogue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sanity_id" "text",
    "plan_type" "text" NOT NULL,
    "plan_variant" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "frequency_cap" integer,
    "age_category" "text" NOT NULL,
    "price_per_cycle_cents" integer NOT NULL,
    "billing_cycle_weeks" integer DEFAULT 4 NOT NULL,
    "commit_months" integer DEFAULT 12 NOT NULL,
    "covered_pillars" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "includes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_highlighted" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "membership_plan_catalogue_age_category_check" CHECK (("age_category" = ANY (ARRAY['adult'::"text", 'kids'::"text", 'senior'::"text"])))
);


ALTER TABLE "tmc"."membership_plan_catalogue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."no_show_strikes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "tmc"."no_show_strikes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."opening_hours" (
    "weekday" smallint NOT NULL,
    "is_closed" boolean DEFAULT false NOT NULL,
    "opens_at" time without time zone,
    "closes_at" time without time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "opening_hours_check" CHECK ((("is_closed" AND ("opens_at" IS NULL) AND ("closes_at" IS NULL)) OR ((NOT "is_closed") AND ("opens_at" IS NOT NULL) AND ("closes_at" IS NOT NULL) AND ("opens_at" < "closes_at")))),
    CONSTRAINT "opening_hours_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "tmc"."opening_hours" OWNER TO "postgres";


COMMENT ON COLUMN "tmc"."opening_hours"."weekday" IS '0-6, 0 = zondag, 6 = zaterdag (JS getDay-conventie). Zelfde conventie als schedule_templates.day_of_week.';



CREATE TABLE IF NOT EXISTS "tmc"."opening_hours_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "is_closed" boolean DEFAULT false NOT NULL,
    "opens_at" time without time zone,
    "closes_at" time without time zone,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "opening_hours_exceptions_check" CHECK ((("is_closed" AND ("opens_at" IS NULL) AND ("closes_at" IS NULL)) OR ((NOT "is_closed") AND ("opens_at" IS NOT NULL) AND ("closes_at" IS NOT NULL) AND ("opens_at" < "closes_at"))))
);


ALTER TABLE "tmc"."opening_hours_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "membership_id" "uuid",
    "pt_booking_id" "uuid",
    "booking_id" "uuid",
    "mollie_payment_id" "text" NOT NULL,
    "mollie_subscription_id" "text",
    "amount_cents" integer NOT NULL,
    "status" "text" NOT NULL,
    "method" "text",
    "description" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'pending'::"text", 'authorized'::"text", 'paid'::"text", 'canceled'::"text", 'expired'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "tmc"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."program_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "day_number" integer NOT NULL,
    "label" "text"
);


ALTER TABLE "tmc"."program_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."program_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "day_id" "uuid" NOT NULL,
    "slot" "text" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "sets" integer NOT NULL,
    "reps_min" integer NOT NULL,
    "reps_max" integer NOT NULL,
    "tempo_eccentric" integer NOT NULL,
    "tempo_pause_bottom" integer NOT NULL,
    "tempo_concentric" integer NOT NULL,
    "tempo_pause_top" integer NOT NULL,
    "rest_seconds" integer NOT NULL,
    "notes" "text",
    CONSTRAINT "program_exercises_check" CHECK (("reps_min" <= "reps_max")),
    CONSTRAINT "program_exercises_sets_check" CHECK (("sets" > 0)),
    CONSTRAINT "program_exercises_slot_check" CHECK (("slot" ~ '^[A-E][12]$'::"text")),
    CONSTRAINT "program_exercises_tempo_concentric_check" CHECK (("tempo_concentric" >= 0)),
    CONSTRAINT "program_exercises_tempo_eccentric_check" CHECK (("tempo_eccentric" >= 0)),
    CONSTRAINT "program_exercises_tempo_pause_bottom_check" CHECK (("tempo_pause_bottom" >= 0)),
    CONSTRAINT "program_exercises_tempo_pause_top_check" CHECK (("tempo_pause_top" >= 0))
);


ALTER TABLE "tmc"."program_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."pt_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "pt_session_id" "uuid" NOT NULL,
    "price_paid_cents" integer NOT NULL,
    "credits_used_from" "uuid",
    "is_intake_discount" boolean DEFAULT false NOT NULL,
    "mollie_payment_id" "text",
    "status" "text" DEFAULT 'booked'::"text" NOT NULL,
    "cancelled_at" timestamp with time zone,
    "booked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pt_bookings_status_check" CHECK (("status" = ANY (ARRAY['booked'::"text", 'cancelled'::"text", 'attended'::"text", 'no_show'::"text"])))
);


ALTER TABLE "tmc"."pt_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."pt_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "format" "text" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "capacity" integer NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pt_sessions_capacity_check" CHECK ((("capacity" >= 1) AND ("capacity" <= 4))),
    CONSTRAINT "pt_sessions_format_check" CHECK (("format" = ANY (ARRAY['one_on_one'::"text", 'duo'::"text", 'small_group_4'::"text"]))),
    CONSTRAINT "pt_sessions_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'cancelled'::"text", 'completed'::"text"])))
);


ALTER TABLE "tmc"."pt_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."schedule_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sanity_id" "text",
    "name" "text",
    "class_type_id" "uuid" NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "capacity" integer NOT NULL,
    "valid_from" "date" NOT NULL,
    "valid_until" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "blocks_free_training" boolean DEFAULT false NOT NULL,
    CONSTRAINT "schedule_templates_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "tmc"."schedule_templates" OWNER TO "postgres";


COMMENT ON COLUMN "tmc"."schedule_templates"."day_of_week" IS '0-6, 0 = zondag, 6 = zaterdag (JS getDay-conventie). Zelfde conventie als opening_hours.weekday.';



CREATE TABLE IF NOT EXISTS "tmc"."set_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "program_exercise_id" "uuid" NOT NULL,
    "set_number" integer NOT NULL,
    "weight_kg" numeric(5,2) NOT NULL,
    "reps" integer NOT NULL,
    "notes" "text",
    "exercise_id" "uuid" NOT NULL,
    CONSTRAINT "set_logs_reps_check" CHECK (("reps" >= 0)),
    CONSTRAINT "set_logs_weight_kg_check" CHECK (("weight_kg" >= (0)::numeric))
);


ALTER TABLE "tmc"."set_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."trainer_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "work_date" "date" NOT NULL,
    "hours" numeric(4,2) NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejection_reason" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trainer_hours_hours_check" CHECK ((("hours" > (0)::numeric) AND ("hours" <= (24)::numeric))),
    CONSTRAINT "trainer_hours_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "tmc"."trainer_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."trainers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "sanity_id" "text",
    "display_name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "bio" "text",
    "specialties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "pillar_specialties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "pt_tier" "text" DEFAULT 'standard'::"text" NOT NULL,
    "hourly_rate_in_cents" integer,
    "pt_session_rate_cents" integer,
    "is_pt_available" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "employment_tier" "text" DEFAULT 'trainer'::"text" NOT NULL,
    "has_health_access" boolean DEFAULT false NOT NULL,
    CONSTRAINT "trainers_employment_tier_check" CHECK (("employment_tier" = ANY (ARRAY['head_trainer'::"text", 'trainer'::"text", 'intern'::"text"]))),
    CONSTRAINT "trainers_pt_tier_check" CHECK (("pt_tier" = ANY (ARRAY['premium'::"text", 'standard'::"text"])))
);


ALTER TABLE "tmc"."trainers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."trial_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "price_paid_cents" integer NOT NULL,
    "mollie_payment_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "cancel_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "trial_bookings_email_check" CHECK (("length"(TRIM(BOTH FROM "email")) > 0)),
    CONSTRAINT "trial_bookings_name_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "trial_bookings_phone_check" CHECK (("length"(TRIM(BOTH FROM "phone")) > 0)),
    CONSTRAINT "trial_bookings_price_paid_cents_check" CHECK (("price_paid_cents" >= 0)),
    CONSTRAINT "trial_bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'attended'::"text", 'no_show'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "tmc"."trial_bookings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "tmc"."v_active_strikes" WITH ("security_invoker"='on') AS
 SELECT "profile_id",
    "count"(*) AS "strike_count",
    "max"("occurred_at") AS "last_strike_at",
    "min"("expires_at") AS "earliest_expiry"
   FROM "tmc"."no_show_strikes"
  WHERE ("expires_at" > "now"())
  GROUP BY "profile_id";


ALTER VIEW "tmc"."v_active_strikes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "tmc"."v_member_last_attendance" AS
 SELECT "profile_id",
    "max"("checked_in_date") AS "last_attended_at"
   FROM "tmc"."check_ins"
  GROUP BY "profile_id";


ALTER VIEW "tmc"."v_member_last_attendance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "tmc"."v_session_availability" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "class_type_id",
    NULL::"uuid" AS "trainer_id",
    NULL::"text" AS "pillar",
    NULL::"text" AS "age_category",
    NULL::timestamp with time zone AS "start_at",
    NULL::timestamp with time zone AS "end_at",
    NULL::integer AS "capacity",
    NULL::"text" AS "status",
    NULL::bigint AS "booked_count",
    NULL::bigint AS "spots_available",
    NULL::bigint AS "waitlist_count";


ALTER VIEW "tmc"."v_session_availability" OWNER TO "postgres";


COMMENT ON VIEW "tmc"."v_session_availability" IS '@supabase-lint-ignore security_definer_view. SECURITY DEFINER by design: publieke rooster-aggregaten vereisen tellen over alle bookings zonder RLS-toegang. Bevat geen per-lid PII.';



CREATE TABLE IF NOT EXISTS "tmc"."waitlist_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "promoted_at" timestamp with time zone,
    "confirmation_deadline" timestamp with time zone,
    "confirmed_at" timestamp with time zone,
    "expired_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "tmc"."waitlist_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tmc"."workout_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "day_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "tmc"."workout_sessions" OWNER TO "postgres";


ALTER TABLE ONLY "tmc"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."booking_settings"
    ADD CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."bookings"
    ADD CONSTRAINT "bookings_profile_id_session_id_key" UNIQUE ("profile_id", "session_id");



ALTER TABLE ONLY "tmc"."check_ins"
    ADD CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."class_pillars"
    ADD CONSTRAINT "class_pillars_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "tmc"."class_sessions"
    ADD CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."class_sessions"
    ADD CONSTRAINT "class_sessions_template_id_start_at_key" UNIQUE ("template_id", "start_at");



ALTER TABLE ONLY "tmc"."class_types"
    ADD CONSTRAINT "class_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."class_types"
    ADD CONSTRAINT "class_types_sanity_id_key" UNIQUE ("sanity_id");



ALTER TABLE ONLY "tmc"."class_types"
    ADD CONSTRAINT "class_types_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "tmc"."crowdfunding_backers"
    ADD CONSTRAINT "crowdfunding_backers_mollie_payment_id_key" UNIQUE ("mollie_payment_id");



ALTER TABLE ONLY "tmc"."crowdfunding_backers"
    ADD CONSTRAINT "crowdfunding_backers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."crowdfunding_stats"
    ADD CONSTRAINT "crowdfunding_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."crowdfunding_tiers"
    ADD CONSTRAINT "crowdfunding_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "tmc"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."guest_bookings"
    ADD CONSTRAINT "guest_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."guest_passes"
    ADD CONSTRAINT "guest_passes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."member_notes"
    ADD CONSTRAINT "member_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."membership_pauses"
    ADD CONSTRAINT "membership_pauses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."membership_plan_catalogue"
    ADD CONSTRAINT "membership_plan_catalogue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."membership_plan_catalogue"
    ADD CONSTRAINT "membership_plan_catalogue_plan_variant_key" UNIQUE ("plan_variant");



ALTER TABLE ONLY "tmc"."membership_plan_catalogue"
    ADD CONSTRAINT "membership_plan_catalogue_sanity_id_key" UNIQUE ("sanity_id");



ALTER TABLE ONLY "tmc"."memberships"
    ADD CONSTRAINT "memberships_mollie_subscription_id_key" UNIQUE ("mollie_subscription_id");



ALTER TABLE ONLY "tmc"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."no_show_strikes"
    ADD CONSTRAINT "no_show_strikes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."opening_hours_exceptions"
    ADD CONSTRAINT "opening_hours_exceptions_date_key" UNIQUE ("date");



ALTER TABLE ONLY "tmc"."opening_hours_exceptions"
    ADD CONSTRAINT "opening_hours_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."opening_hours"
    ADD CONSTRAINT "opening_hours_pkey" PRIMARY KEY ("weekday");



ALTER TABLE ONLY "tmc"."payments"
    ADD CONSTRAINT "payments_mollie_payment_id_key" UNIQUE ("mollie_payment_id");



ALTER TABLE ONLY "tmc"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."profiles"
    ADD CONSTRAINT "profiles_member_code_unique" UNIQUE ("member_code");



ALTER TABLE ONLY "tmc"."profiles"
    ADD CONSTRAINT "profiles_phone_unique" UNIQUE ("phone");



ALTER TABLE ONLY "tmc"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."program_days"
    ADD CONSTRAINT "program_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."program_days"
    ADD CONSTRAINT "program_days_program_id_day_number_key" UNIQUE ("program_id", "day_number");



ALTER TABLE ONLY "tmc"."program_exercises"
    ADD CONSTRAINT "program_exercises_day_id_slot_key" UNIQUE ("day_id", "slot");



ALTER TABLE ONLY "tmc"."program_exercises"
    ADD CONSTRAINT "program_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."pt_bookings"
    ADD CONSTRAINT "pt_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."pt_bookings"
    ADD CONSTRAINT "pt_bookings_profile_id_pt_session_id_key" UNIQUE ("profile_id", "pt_session_id");



ALTER TABLE ONLY "tmc"."pt_sessions"
    ADD CONSTRAINT "pt_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."schedule_templates"
    ADD CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."schedule_templates"
    ADD CONSTRAINT "schedule_templates_sanity_id_key" UNIQUE ("sanity_id");



ALTER TABLE ONLY "tmc"."set_logs"
    ADD CONSTRAINT "set_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."set_logs"
    ADD CONSTRAINT "set_logs_session_id_program_exercise_id_set_number_key" UNIQUE ("session_id", "program_exercise_id", "set_number");



ALTER TABLE ONLY "tmc"."trainer_hours"
    ADD CONSTRAINT "trainer_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."trainers"
    ADD CONSTRAINT "trainers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."trainers"
    ADD CONSTRAINT "trainers_profile_id_key" UNIQUE ("profile_id");



ALTER TABLE ONLY "tmc"."trainers"
    ADD CONSTRAINT "trainers_sanity_id_key" UNIQUE ("sanity_id");



ALTER TABLE ONLY "tmc"."trainers"
    ADD CONSTRAINT "trainers_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "tmc"."training_programs"
    ADD CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."training_programs"
    ADD CONSTRAINT "training_programs_profile_id_version_key" UNIQUE ("profile_id", "version");



ALTER TABLE ONLY "tmc"."trial_bookings"
    ADD CONSTRAINT "trial_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."waitlist_entries"
    ADD CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tmc"."waitlist_entries"
    ADD CONSTRAINT "waitlist_entries_profile_id_session_id_key" UNIQUE ("profile_id", "session_id");



ALTER TABLE ONLY "tmc"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id");



CREATE INDEX "announcements_active_idx" ON "tmc"."announcements" USING "btree" ("published_at", "expires_at") WHERE ("published_at" IS NOT NULL);



CREATE INDEX "announcements_published_idx" ON "tmc"."announcements" USING "btree" ("audience", "published_at" DESC) WHERE ("published_at" IS NOT NULL);



CREATE INDEX "audit_admin_idx" ON "tmc"."admin_audit_log" USING "btree" ("admin_id");



CREATE INDEX "audit_target_idx" ON "tmc"."admin_audit_log" USING "btree" ("target_type", "target_id");



CREATE INDEX "bookings_profile_date_idx" ON "tmc"."bookings" USING "btree" ("profile_id", "session_date");



CREATE INDEX "bookings_profile_pillar_week_idx" ON "tmc"."bookings" USING "btree" ("profile_id", "pillar", "iso_year", "iso_week") WHERE ("status" = 'booked'::"text");



CREATE INDEX "bookings_profile_week_idx" ON "tmc"."bookings" USING "btree" ("profile_id", "iso_year", "iso_week");



CREATE INDEX "bookings_reminder_idx" ON "tmc"."bookings" USING "btree" ("reminder_sent_at") WHERE (("reminder_sent_at" IS NULL) AND ("status" = 'booked'::"text"));



CREATE INDEX "bookings_rental_idx" ON "tmc"."bookings" USING "btree" ("session_id") WHERE ("rental_mat" OR "rental_towel");



CREATE INDEX "bookings_session_status_idx" ON "tmc"."bookings" USING "btree" ("session_id", "status");



CREATE INDEX "check_ins_pillar_idx" ON "tmc"."check_ins" USING "btree" ("pillar", "checked_in_at" DESC);



CREATE INDEX "check_ins_profile_idx" ON "tmc"."check_ins" USING "btree" ("profile_id", "checked_in_at" DESC);



CREATE INDEX "check_ins_session_idx" ON "tmc"."check_ins" USING "btree" ("session_id");



CREATE UNIQUE INDEX "check_ins_unique_per_day" ON "tmc"."check_ins" USING "btree" ("profile_id", "checked_in_date", "pillar") WHERE ("session_id" IS NULL);



CREATE UNIQUE INDEX "check_ins_unique_per_session" ON "tmc"."check_ins" USING "btree" ("session_id", "profile_id") WHERE ("session_id" IS NOT NULL);



CREATE INDEX "class_sessions_age_idx" ON "tmc"."class_sessions" USING "btree" ("age_category");



CREATE INDEX "class_sessions_pillar_idx" ON "tmc"."class_sessions" USING "btree" ("pillar");



CREATE INDEX "class_sessions_start_idx" ON "tmc"."class_sessions" USING "btree" ("start_at");



CREATE INDEX "class_sessions_status_idx" ON "tmc"."class_sessions" USING "btree" ("status");



CREATE INDEX "class_sessions_trainer_idx" ON "tmc"."class_sessions" USING "btree" ("trainer_id");



CREATE INDEX "class_types_active_idx" ON "tmc"."class_types" USING "btree" ("is_active");



CREATE INDEX "class_types_pillar_idx" ON "tmc"."class_types" USING "btree" ("pillar");



CREATE INDEX "crowdfunding_backers_created_at_idx" ON "tmc"."crowdfunding_backers" USING "btree" ("created_at" DESC);



CREATE INDEX "crowdfunding_backers_payment_status_idx" ON "tmc"."crowdfunding_backers" USING "btree" ("payment_status");



CREATE INDEX "crowdfunding_backers_tier_id_idx" ON "tmc"."crowdfunding_backers" USING "btree" ("tier_id");



CREATE INDEX "device_push_tokens_profile_idx" ON "tmc"."device_push_tokens" USING "btree" ("profile_id");



CREATE INDEX "events_actor_idx" ON "tmc"."events" USING "btree" ("actor_id");



CREATE INDEX "events_created_idx" ON "tmc"."events" USING "btree" ("created_at" DESC);



CREATE INDEX "events_payload_gin" ON "tmc"."events" USING "gin" ("payload" "jsonb_path_ops");



CREATE INDEX "events_subject_idx" ON "tmc"."events" USING "btree" ("subject_type", "subject_id");



CREATE INDEX "events_type_created_idx" ON "tmc"."events" USING "btree" ("type", "created_at" DESC);



CREATE UNIQUE INDEX "exercises_name_lower_idx" ON "tmc"."exercises" USING "btree" ("lower"("name"));



CREATE INDEX "guest_bookings_booked_by_idx" ON "tmc"."guest_bookings" USING "btree" ("booked_by");



CREATE INDEX "guest_bookings_email_idx" ON "tmc"."guest_bookings" USING "btree" ("guest_email");



CREATE INDEX "guest_bookings_session_idx" ON "tmc"."guest_bookings" USING "btree" ("session_id");



CREATE UNIQUE INDEX "guest_bookings_unique_per_session" ON "tmc"."guest_bookings" USING "btree" ("session_id", "guest_email") WHERE ("status" = ANY (ARRAY['booked'::"text", 'attended'::"text"]));



CREATE INDEX "guest_passes_active_idx" ON "tmc"."guest_passes" USING "btree" ("profile_id", "period_end" DESC);



CREATE UNIQUE INDEX "guest_passes_member_period_idx" ON "tmc"."guest_passes" USING "btree" ("profile_id", "period_start");



CREATE INDEX "idx_backers_created" ON "tmc"."crowdfunding_backers" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_backers_status" ON "tmc"."crowdfunding_backers" USING "btree" ("payment_status");



CREATE INDEX "idx_backers_tier" ON "tmc"."crowdfunding_backers" USING "btree" ("tier_id");



CREATE INDEX "member_notes_profile_idx" ON "tmc"."member_notes" USING "btree" ("profile_id", "created_at" DESC);



CREATE INDEX "memberships_active_profile_idx" ON "tmc"."memberships" USING "btree" ("profile_id") WHERE ("status" = ANY (ARRAY['active'::"text", 'paused'::"text"]));



CREATE INDEX "memberships_mollie_sub_idx" ON "tmc"."memberships" USING "btree" ("mollie_subscription_id");



CREATE INDEX "memberships_plan_type_idx" ON "tmc"."memberships" USING "btree" ("plan_type");



CREATE INDEX "memberships_profile_idx" ON "tmc"."memberships" USING "btree" ("profile_id");



CREATE INDEX "memberships_status_idx" ON "tmc"."memberships" USING "btree" ("status");



CREATE INDEX "pauses_membership_idx" ON "tmc"."membership_pauses" USING "btree" ("membership_id");



CREATE INDEX "pauses_status_idx" ON "tmc"."membership_pauses" USING "btree" ("status");



CREATE INDEX "payments_membership_idx" ON "tmc"."payments" USING "btree" ("membership_id");



CREATE INDEX "payments_profile_idx" ON "tmc"."payments" USING "btree" ("profile_id");



CREATE INDEX "payments_status_idx" ON "tmc"."payments" USING "btree" ("status");



CREATE INDEX "profiles_acquisition_campaign_idx" ON "tmc"."profiles" USING "btree" ("acquisition_campaign");



CREATE INDEX "profiles_acquisition_source_idx" ON "tmc"."profiles" USING "btree" ("acquisition_source");



CREATE INDEX "profiles_age_category_idx" ON "tmc"."profiles" USING "btree" ("age_category");



CREATE INDEX "profiles_city_idx" ON "tmc"."profiles" USING "btree" ("city");



CREATE INDEX "profiles_email_idx" ON "tmc"."profiles" USING "btree" ("email");



CREATE INDEX "profiles_role_idx" ON "tmc"."profiles" USING "btree" ("role");



CREATE INDEX "profiles_signup_path_idx" ON "tmc"."profiles" USING "btree" ("signup_path");



CREATE INDEX "program_exercises_exercise_idx" ON "tmc"."program_exercises" USING "btree" ("exercise_id");



CREATE INDEX "pt_bookings_profile_idx" ON "tmc"."pt_bookings" USING "btree" ("profile_id");



CREATE INDEX "pt_bookings_session_idx" ON "tmc"."pt_bookings" USING "btree" ("pt_session_id");



CREATE INDEX "pt_sessions_trainer_start_idx" ON "tmc"."pt_sessions" USING "btree" ("trainer_id", "start_at");



CREATE INDEX "schedule_templates_active_idx" ON "tmc"."schedule_templates" USING "btree" ("is_active");



CREATE INDEX "set_logs_exercise_id_idx" ON "tmc"."set_logs" USING "btree" ("exercise_id");



CREATE INDEX "set_logs_program_exercise_idx" ON "tmc"."set_logs" USING "btree" ("program_exercise_id");



CREATE INDEX "strikes_profile_expires_idx" ON "tmc"."no_show_strikes" USING "btree" ("profile_id", "expires_at");



CREATE INDEX "trainer_hours_status_idx" ON "tmc"."trainer_hours" USING "btree" ("status");



CREATE INDEX "trainer_hours_trainer_date_idx" ON "tmc"."trainer_hours" USING "btree" ("trainer_id", "work_date" DESC);



CREATE INDEX "trainers_active_idx" ON "tmc"."trainers" USING "btree" ("is_active");



CREATE INDEX "trainers_pt_tier_idx" ON "tmc"."trainers" USING "btree" ("pt_tier");



CREATE UNIQUE INDEX "training_programs_one_active_idx" ON "tmc"."training_programs" USING "btree" ("profile_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "training_programs_profile_idx" ON "tmc"."training_programs" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "trial_bookings_cancel_token_idx" ON "tmc"."trial_bookings" USING "btree" ("cancel_token");



CREATE INDEX "trial_bookings_email_idx" ON "tmc"."trial_bookings" USING "btree" ("email");



CREATE INDEX "trial_bookings_session_idx" ON "tmc"."trial_bookings" USING "btree" ("session_id");



CREATE UNIQUE INDEX "vw_admin_kpis_refresh_idx" ON "tmc"."vw_admin_kpis" USING "btree" ((("refreshed_at" IS NOT NULL)));



CREATE INDEX "waitlist_pending_promotion_idx" ON "tmc"."waitlist_entries" USING "btree" ("promoted_at") WHERE (("confirmed_at" IS NULL) AND ("expired_at" IS NULL));



CREATE INDEX "waitlist_session_position_idx" ON "tmc"."waitlist_entries" USING "btree" ("session_id", "position");



CREATE INDEX "workout_sessions_profile_idx" ON "tmc"."workout_sessions" USING "btree" ("profile_id");



CREATE INDEX "workout_sessions_program_idx" ON "tmc"."workout_sessions" USING "btree" ("program_id");



CREATE OR REPLACE VIEW "tmc"."v_session_availability" AS
 SELECT "cs"."id",
    "cs"."class_type_id",
    "cs"."trainer_id",
    "cs"."pillar",
    "cs"."age_category",
    "cs"."start_at",
    "cs"."end_at",
    "cs"."capacity",
    "cs"."status",
    "count"("b"."id") FILTER (WHERE ("b"."status" = 'booked'::"text")) AS "booked_count",
    (("cs"."capacity" - "count"("b"."id") FILTER (WHERE ("b"."status" = 'booked'::"text"))) - "count"("tb"."id") FILTER (WHERE ("tb"."status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'attended'::"text"])))) AS "spots_available",
    "count"("w"."id") FILTER (WHERE (("w"."confirmed_at" IS NULL) AND ("w"."expired_at" IS NULL))) AS "waitlist_count"
   FROM ((("tmc"."class_sessions" "cs"
     LEFT JOIN "tmc"."bookings" "b" ON (("b"."session_id" = "cs"."id")))
     LEFT JOIN "tmc"."waitlist_entries" "w" ON (("w"."session_id" = "cs"."id")))
     LEFT JOIN "tmc"."trial_bookings" "tb" ON (("tb"."session_id" = "cs"."id")))
  WHERE ("cs"."status" = 'scheduled'::"text")
  GROUP BY "cs"."id";



CREATE OR REPLACE TRIGGER "announcements_touch_updated_at" BEFORE UPDATE ON "tmc"."announcements" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "booking_settings_touch" BEFORE UPDATE ON "tmc"."booking_settings" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "catalogue_touch_updated_at" BEFORE UPDATE ON "tmc"."membership_plan_catalogue" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "class_sessions_touch_updated_at" BEFORE UPDATE ON "tmc"."class_sessions" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "class_types_touch_updated_at" BEFORE UPDATE ON "tmc"."class_types" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "device_push_tokens_touch_updated_at" BEFORE UPDATE ON "tmc"."device_push_tokens" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "events_no_update_delete" BEFORE DELETE OR UPDATE ON "tmc"."events" FOR EACH ROW EXECUTE FUNCTION "tmc"."events_block_mutation"();



CREATE OR REPLACE TRIGGER "memberships_expire_lock_in" BEFORE UPDATE ON "tmc"."memberships" FOR EACH ROW EXECUTE FUNCTION "tmc"."expire_lock_in_on_cancel"();



CREATE OR REPLACE TRIGGER "memberships_set_commit_end" BEFORE INSERT ON "tmc"."memberships" FOR EACH ROW EXECUTE FUNCTION "tmc"."set_commit_end_date"();



CREATE OR REPLACE TRIGGER "memberships_touch_updated_at" BEFORE UPDATE ON "tmc"."memberships" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "pauses_extend_commit" AFTER UPDATE ON "tmc"."membership_pauses" FOR EACH ROW EXECUTE FUNCTION "tmc"."apply_pause_to_commit"();



CREATE OR REPLACE TRIGGER "profiles_touch_updated_at" BEFORE UPDATE ON "tmc"."profiles" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "pt_sessions_touch_updated_at" BEFORE UPDATE ON "tmc"."pt_sessions" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "schedule_templates_touch_updated_at" BEFORE UPDATE ON "tmc"."schedule_templates" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trainers_touch_updated_at" BEFORE UPDATE ON "tmc"."trainers" FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();



ALTER TABLE ONLY "tmc"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "tmc"."profiles"("id");



ALTER TABLE ONLY "tmc"."announcements"
    ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "tmc"."profiles"("id");



ALTER TABLE ONLY "tmc"."bookings"
    ADD CONSTRAINT "bookings_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "tmc"."memberships"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "tmc"."bookings"
    ADD CONSTRAINT "bookings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."bookings"
    ADD CONSTRAINT "bookings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tmc"."class_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."check_ins"
    ADD CONSTRAINT "check_ins_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "tmc"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "tmc"."check_ins"
    ADD CONSTRAINT "check_ins_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "tmc"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "tmc"."check_ins"
    ADD CONSTRAINT "check_ins_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."check_ins"
    ADD CONSTRAINT "check_ins_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tmc"."class_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."class_sessions"
    ADD CONSTRAINT "class_sessions_class_type_id_fkey" FOREIGN KEY ("class_type_id") REFERENCES "tmc"."class_types"("id");



ALTER TABLE ONLY "tmc"."class_sessions"
    ADD CONSTRAINT "class_sessions_pillar_fkey" FOREIGN KEY ("pillar") REFERENCES "tmc"."class_pillars"("code");



ALTER TABLE ONLY "tmc"."class_sessions"
    ADD CONSTRAINT "class_sessions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "tmc"."schedule_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "tmc"."class_sessions"
    ADD CONSTRAINT "class_sessions_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "tmc"."trainers"("id");



ALTER TABLE ONLY "tmc"."class_types"
    ADD CONSTRAINT "class_types_pillar_fkey" FOREIGN KEY ("pillar") REFERENCES "tmc"."class_pillars"("code");



ALTER TABLE ONLY "tmc"."device_push_tokens"
    ADD CONSTRAINT "device_push_tokens_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."guest_bookings"
    ADD CONSTRAINT "guest_bookings_booked_by_fkey" FOREIGN KEY ("booked_by") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."guest_bookings"
    ADD CONSTRAINT "guest_bookings_guest_pass_id_fkey" FOREIGN KEY ("guest_pass_id") REFERENCES "tmc"."guest_passes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."guest_bookings"
    ADD CONSTRAINT "guest_bookings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tmc"."class_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."guest_passes"
    ADD CONSTRAINT "guest_passes_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "tmc"."memberships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."guest_passes"
    ADD CONSTRAINT "guest_passes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."member_notes"
    ADD CONSTRAINT "member_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "tmc"."profiles"("id");



ALTER TABLE ONLY "tmc"."member_notes"
    ADD CONSTRAINT "member_notes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."membership_pauses"
    ADD CONSTRAINT "membership_pauses_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "tmc"."profiles"("id");



ALTER TABLE ONLY "tmc"."membership_pauses"
    ADD CONSTRAINT "membership_pauses_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "tmc"."memberships"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."membership_pauses"
    ADD CONSTRAINT "membership_pauses_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "tmc"."profiles"("id");



ALTER TABLE ONLY "tmc"."memberships"
    ADD CONSTRAINT "memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."no_show_strikes"
    ADD CONSTRAINT "no_show_strikes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "tmc"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."no_show_strikes"
    ADD CONSTRAINT "no_show_strikes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "tmc"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "tmc"."payments"
    ADD CONSTRAINT "payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "tmc"."memberships"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "tmc"."payments"
    ADD CONSTRAINT "payments_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "tmc"."payments"
    ADD CONSTRAINT "payments_pt_booking_id_fkey" FOREIGN KEY ("pt_booking_id") REFERENCES "tmc"."pt_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "tmc"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."program_days"
    ADD CONSTRAINT "program_days_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tmc"."training_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."program_exercises"
    ADD CONSTRAINT "program_exercises_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "tmc"."program_days"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."program_exercises"
    ADD CONSTRAINT "program_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "tmc"."exercises"("id");



ALTER TABLE ONLY "tmc"."pt_bookings"
    ADD CONSTRAINT "pt_bookings_credits_used_from_fkey" FOREIGN KEY ("credits_used_from") REFERENCES "tmc"."memberships"("id");



ALTER TABLE ONLY "tmc"."pt_bookings"
    ADD CONSTRAINT "pt_bookings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."pt_bookings"
    ADD CONSTRAINT "pt_bookings_pt_session_id_fkey" FOREIGN KEY ("pt_session_id") REFERENCES "tmc"."pt_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."pt_sessions"
    ADD CONSTRAINT "pt_sessions_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "tmc"."trainers"("id");



ALTER TABLE ONLY "tmc"."schedule_templates"
    ADD CONSTRAINT "schedule_templates_class_type_id_fkey" FOREIGN KEY ("class_type_id") REFERENCES "tmc"."class_types"("id");



ALTER TABLE ONLY "tmc"."schedule_templates"
    ADD CONSTRAINT "schedule_templates_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "tmc"."trainers"("id");



ALTER TABLE ONLY "tmc"."set_logs"
    ADD CONSTRAINT "set_logs_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "tmc"."exercises"("id");



ALTER TABLE ONLY "tmc"."set_logs"
    ADD CONSTRAINT "set_logs_program_exercise_id_fkey" FOREIGN KEY ("program_exercise_id") REFERENCES "tmc"."program_exercises"("id");



ALTER TABLE ONLY "tmc"."set_logs"
    ADD CONSTRAINT "set_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tmc"."workout_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."trainer_hours"
    ADD CONSTRAINT "trainer_hours_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "tmc"."profiles"("id");



ALTER TABLE ONLY "tmc"."trainer_hours"
    ADD CONSTRAINT "trainer_hours_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "tmc"."trainers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."trainers"
    ADD CONSTRAINT "trainers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."training_programs"
    ADD CONSTRAINT "training_programs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."trial_bookings"
    ADD CONSTRAINT "trial_bookings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tmc"."class_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."waitlist_entries"
    ADD CONSTRAINT "waitlist_entries_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."waitlist_entries"
    ADD CONSTRAINT "waitlist_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tmc"."class_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "tmc"."program_days"("id");



ALTER TABLE ONLY "tmc"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "tmc"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tmc"."training_programs"("id");



CREATE POLICY "Public read paid backers" ON "tmc"."crowdfunding_backers" FOR SELECT USING ((("payment_status" = 'paid'::"text") AND ("show_on_wall" = true)));



CREATE POLICY "Public read stats" ON "tmc"."crowdfunding_stats" FOR SELECT USING (true);



CREATE POLICY "Public read tier slots" ON "tmc"."crowdfunding_tiers" FOR SELECT USING (true);



ALTER TABLE "tmc"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tmc"."announcements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "announcements_admin_all" ON "tmc"."announcements" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "announcements_audience_read" ON "tmc"."announcements" FOR SELECT USING ((("published_at" IS NOT NULL) AND ("published_at" <= "now"()) AND (("expires_at" IS NULL) OR ("expires_at" > "now"())) AND (("audience" = 'all'::"text") OR (("audience" = 'trainers'::"text") AND "tmc"."is_trainer"()) OR (("audience" = 'members'::"text") AND ("tmc"."current_user_role"() = 'member'::"text")))));



CREATE POLICY "audit_admin_all" ON "tmc"."admin_audit_log" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



ALTER TABLE "tmc"."booking_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_settings_admin_all" ON "tmc"."booking_settings" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "booking_settings_public_read" ON "tmc"."booking_settings" FOR SELECT USING (true);



ALTER TABLE "tmc"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_admin_all" ON "tmc"."bookings" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "bookings_self_read" ON "tmc"."bookings" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "bookings_trainer_attendance" ON "tmc"."bookings" FOR UPDATE USING (("tmc"."is_trainer"() AND ("session_id" IN ( SELECT "cs"."id"
   FROM ("tmc"."class_sessions" "cs"
     JOIN "tmc"."trainers" "t" ON (("t"."id" = "cs"."trainer_id")))
  WHERE ("t"."profile_id" = "auth"."uid"())))));



CREATE POLICY "bookings_trainer_read" ON "tmc"."bookings" FOR SELECT USING (("tmc"."is_trainer"() AND ("session_id" IN ( SELECT "cs"."id"
   FROM ("tmc"."class_sessions" "cs"
     JOIN "tmc"."trainers" "t" ON (("t"."id" = "cs"."trainer_id")))
  WHERE ("t"."profile_id" = "auth"."uid"())))));



CREATE POLICY "catalogue_admin_all" ON "tmc"."membership_plan_catalogue" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "catalogue_public_read" ON "tmc"."membership_plan_catalogue" FOR SELECT USING (("is_active" = true));



ALTER TABLE "tmc"."check_ins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "check_ins_admin_all" ON "tmc"."check_ins" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "check_ins_self_read" ON "tmc"."check_ins" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "check_ins_trainer_read" ON "tmc"."check_ins" FOR SELECT USING (("tmc"."is_trainer"() AND ("session_id" IN ( SELECT "cs"."id"
   FROM ("tmc"."class_sessions" "cs"
     JOIN "tmc"."trainers" "t" ON (("t"."id" = "cs"."trainer_id")))
  WHERE ("t"."profile_id" = "auth"."uid"())))));



ALTER TABLE "tmc"."class_pillars" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_pillars_admin_all" ON "tmc"."class_pillars" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "class_pillars_public_read" ON "tmc"."class_pillars" FOR SELECT USING (true);



ALTER TABLE "tmc"."class_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_sessions_admin_all" ON "tmc"."class_sessions" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "class_sessions_authed_read" ON "tmc"."class_sessions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "class_sessions_trainer_own_update" ON "tmc"."class_sessions" FOR UPDATE USING (("tmc"."is_trainer"() AND ("trainer_id" IN ( SELECT "trainers"."id"
   FROM "tmc"."trainers"
  WHERE ("trainers"."profile_id" = "auth"."uid"())))));



ALTER TABLE "tmc"."class_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_types_admin_all" ON "tmc"."class_types" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "class_types_public_read" ON "tmc"."class_types" FOR SELECT USING (("is_active" = true));



ALTER TABLE "tmc"."crowdfunding_backers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crowdfunding_backers_admin_all" ON "tmc"."crowdfunding_backers" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "crowdfunding_backers_public_wall" ON "tmc"."crowdfunding_backers" FOR SELECT USING ((("payment_status" = 'paid'::"text") AND ("show_on_wall" = true)));



ALTER TABLE "tmc"."crowdfunding_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crowdfunding_stats_public_read" ON "tmc"."crowdfunding_stats" FOR SELECT USING (true);



ALTER TABLE "tmc"."crowdfunding_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crowdfunding_tiers_public_read" ON "tmc"."crowdfunding_tiers" FOR SELECT USING (true);



ALTER TABLE "tmc"."device_push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_push_tokens_admin_all" ON "tmc"."device_push_tokens" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "device_push_tokens_self_delete" ON "tmc"."device_push_tokens" FOR DELETE USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "device_push_tokens_self_insert" ON "tmc"."device_push_tokens" FOR INSERT WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "device_push_tokens_self_read" ON "tmc"."device_push_tokens" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "device_push_tokens_self_update" ON "tmc"."device_push_tokens" FOR UPDATE USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "tmc"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_admin_select" ON "tmc"."events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "tmc"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



ALTER TABLE "tmc"."exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exercises_member_read" ON "tmc"."exercises" FOR SELECT TO "authenticated" USING (("is_active" = true));



ALTER TABLE "tmc"."guest_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "guest_bookings_admin_all" ON "tmc"."guest_bookings" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "guest_bookings_self_cancel" ON "tmc"."guest_bookings" FOR UPDATE USING ((("booked_by" = "auth"."uid"()) AND ("status" = 'booked'::"text"))) WITH CHECK (("status" = ANY (ARRAY['cancelled'::"text", 'booked'::"text"])));



CREATE POLICY "guest_bookings_self_insert" ON "tmc"."guest_bookings" FOR INSERT WITH CHECK (("booked_by" = "auth"."uid"()));



CREATE POLICY "guest_bookings_self_read" ON "tmc"."guest_bookings" FOR SELECT USING (("booked_by" = "auth"."uid"()));



CREATE POLICY "guest_bookings_trainer_read" ON "tmc"."guest_bookings" FOR SELECT USING (("tmc"."is_trainer"() AND ("session_id" IN ( SELECT "cs"."id"
   FROM ("tmc"."class_sessions" "cs"
     JOIN "tmc"."trainers" "t" ON (("t"."id" = "cs"."trainer_id")))
  WHERE ("t"."profile_id" = "auth"."uid"())))));



ALTER TABLE "tmc"."guest_passes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "guest_passes_admin_all" ON "tmc"."guest_passes" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "guest_passes_self_read" ON "tmc"."guest_passes" FOR SELECT USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "tmc"."member_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_notes_admin_all" ON "tmc"."member_notes" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



ALTER TABLE "tmc"."membership_pauses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tmc"."membership_plan_catalogue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tmc"."memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memberships_admin_all" ON "tmc"."memberships" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "memberships_self_read" ON "tmc"."memberships" FOR SELECT USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "tmc"."no_show_strikes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tmc"."opening_hours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "opening_hours_admin_all" ON "tmc"."opening_hours" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



ALTER TABLE "tmc"."opening_hours_exceptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "opening_hours_exceptions_admin_all" ON "tmc"."opening_hours_exceptions" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "opening_hours_exceptions_public_read" ON "tmc"."opening_hours_exceptions" FOR SELECT USING (true);



CREATE POLICY "opening_hours_public_read" ON "tmc"."opening_hours" FOR SELECT USING (true);



CREATE POLICY "pauses_admin_all" ON "tmc"."membership_pauses" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "pauses_self_insert" ON "tmc"."membership_pauses" FOR INSERT WITH CHECK (("membership_id" IN ( SELECT "memberships"."id"
   FROM "tmc"."memberships"
  WHERE ("memberships"."profile_id" = "auth"."uid"()))));



CREATE POLICY "pauses_self_read" ON "tmc"."membership_pauses" FOR SELECT USING (("membership_id" IN ( SELECT "memberships"."id"
   FROM "tmc"."memberships"
  WHERE ("memberships"."profile_id" = "auth"."uid"()))));



ALTER TABLE "tmc"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_admin_all" ON "tmc"."payments" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "payments_self_read" ON "tmc"."payments" FOR SELECT USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "tmc"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_all" ON "tmc"."profiles" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "profiles_self_select" ON "tmc"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_self_update" ON "tmc"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_trainer_read_relevant" ON "tmc"."profiles" FOR SELECT USING (("tmc"."is_trainer"() AND (EXISTS ( SELECT 1
   FROM (("tmc"."bookings" "b"
     JOIN "tmc"."class_sessions" "cs" ON (("cs"."id" = "b"."session_id")))
     JOIN "tmc"."trainers" "t" ON (("t"."id" = "cs"."trainer_id")))
  WHERE (("b"."profile_id" = "profiles"."id") AND ("t"."profile_id" = "auth"."uid"()))))));



ALTER TABLE "tmc"."program_days" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_days_self_active_read" ON "tmc"."program_days" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "tmc"."training_programs" "p"
  WHERE (("p"."id" = "program_days"."program_id") AND ("p"."profile_id" = "auth"."uid"()) AND ("p"."status" = 'active'::"text")))));



ALTER TABLE "tmc"."program_exercises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "program_exercises_self_active_read" ON "tmc"."program_exercises" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("tmc"."program_days" "d"
     JOIN "tmc"."training_programs" "p" ON (("p"."id" = "d"."program_id")))
  WHERE (("d"."id" = "program_exercises"."day_id") AND ("p"."profile_id" = "auth"."uid"()) AND ("p"."status" = 'active'::"text")))));



ALTER TABLE "tmc"."pt_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pt_bookings_admin_all" ON "tmc"."pt_bookings" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "pt_bookings_self_read" ON "tmc"."pt_bookings" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "pt_bookings_trainer_read" ON "tmc"."pt_bookings" FOR SELECT USING (("tmc"."is_trainer"() AND ("pt_session_id" IN ( SELECT "ps"."id"
   FROM ("tmc"."pt_sessions" "ps"
     JOIN "tmc"."trainers" "t" ON (("t"."id" = "ps"."trainer_id")))
  WHERE ("t"."profile_id" = "auth"."uid"())))));



ALTER TABLE "tmc"."pt_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pt_sessions_admin_all" ON "tmc"."pt_sessions" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "pt_sessions_authed_read" ON "tmc"."pt_sessions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "pt_sessions_trainer_own" ON "tmc"."pt_sessions" USING (("tmc"."is_trainer"() AND ("trainer_id" IN ( SELECT "trainers"."id"
   FROM "tmc"."trainers"
  WHERE ("trainers"."profile_id" = "auth"."uid"())))));



ALTER TABLE "tmc"."schedule_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedule_templates_admin_all" ON "tmc"."schedule_templates" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "schedule_templates_public_read" ON "tmc"."schedule_templates" FOR SELECT USING (("is_active" = true));



ALTER TABLE "tmc"."set_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "set_logs_self_read" ON "tmc"."set_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "tmc"."workout_sessions" "s"
  WHERE (("s"."id" = "set_logs"."session_id") AND ("s"."profile_id" = "auth"."uid"())))));



CREATE POLICY "strikes_admin_all" ON "tmc"."no_show_strikes" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "strikes_self_read" ON "tmc"."no_show_strikes" FOR SELECT USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "tmc"."trainer_hours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trainer_hours_admin_all" ON "tmc"."trainer_hours" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "trainer_hours_self_insert" ON "tmc"."trainer_hours" FOR INSERT WITH CHECK (("tmc"."is_trainer"() AND ("trainer_id" IN ( SELECT "trainers"."id"
   FROM "tmc"."trainers"
  WHERE ("trainers"."profile_id" = "auth"."uid"()))) AND ("status" = 'pending'::"text")));



CREATE POLICY "trainer_hours_self_read" ON "tmc"."trainer_hours" FOR SELECT USING (("tmc"."is_trainer"() AND ("trainer_id" IN ( SELECT "trainers"."id"
   FROM "tmc"."trainers"
  WHERE ("trainers"."profile_id" = "auth"."uid"())))));



ALTER TABLE "tmc"."trainers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trainers_admin_all" ON "tmc"."trainers" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "trainers_public_read" ON "tmc"."trainers" FOR SELECT USING (("is_active" = true));



CREATE POLICY "trainers_self" ON "tmc"."trainers" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "tmc"."training_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_programs_self_active_read" ON "tmc"."training_programs" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) AND ("status" = 'active'::"text")));



ALTER TABLE "tmc"."trial_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trial_bookings_admin_all" ON "tmc"."trial_bookings" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



CREATE POLICY "waitlist_admin_all" ON "tmc"."waitlist_entries" USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());



ALTER TABLE "tmc"."waitlist_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "waitlist_self_all" ON "tmc"."waitlist_entries" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "tmc"."workout_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workout_sessions_self_read" ON "tmc"."workout_sessions" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "tmc" TO "service_role";
GRANT USAGE ON SCHEMA "tmc" TO "anon";
GRANT USAGE ON SCHEMA "tmc" TO "authenticated";



GRANT ALL ON TABLE "tmc"."training_programs" TO "service_role";
GRANT SELECT ON TABLE "tmc"."training_programs" TO "authenticated";



REVOKE ALL ON FUNCTION "tmc"."activate_training_program"("p_program_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."activate_training_program"("p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "tmc"."apply_pause_to_commit"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."apply_pause_to_commit"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."apply_pause_to_commit"() TO "service_role";



REVOKE ALL ON FUNCTION "tmc"."book_class_session"("p_session_id" "uuid", "p_rental_mat" boolean, "p_rental_towel" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."book_class_session"("p_session_id" "uuid", "p_rental_mat" boolean, "p_rental_towel" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "tmc"."book_pt_credits"("p_pt_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."book_pt_credits"("p_pt_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "tmc"."book_pt_pending_payment"("p_pt_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."book_pt_pending_payment"("p_pt_session_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "tmc"."cancel_class_booking"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."cancel_class_booking"("p_booking_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "tmc"."cleanup_expired_strikes"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."cleanup_expired_strikes"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."cleanup_expired_strikes"() TO "service_role";



REVOKE ALL ON FUNCTION "tmc"."complete_workout_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."complete_workout_session"("p_session_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "tmc"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."current_user_role"() TO "service_role";



REVOKE ALL ON FUNCTION "tmc"."duplicate_training_program"("p_program_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."duplicate_training_program"("p_program_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "tmc"."expire_lock_in_on_cancel"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."expire_lock_in_on_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."expire_lock_in_on_cancel"() TO "service_role";



GRANT ALL ON TABLE "tmc"."bookings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."bookings" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."bookings" TO "authenticated";



GRANT ALL ON TABLE "tmc"."class_sessions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."class_sessions" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."class_sessions" TO "authenticated";



GRANT ALL ON TABLE "tmc"."crowdfunding_backers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."crowdfunding_backers" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."crowdfunding_backers" TO "authenticated";



GRANT ALL ON TABLE "tmc"."membership_pauses" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."membership_pauses" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."membership_pauses" TO "authenticated";



GRANT ALL ON TABLE "tmc"."memberships" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."memberships" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."memberships" TO "authenticated";



GRANT ALL ON TABLE "tmc"."profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."profiles" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."profiles" TO "authenticated";



GRANT ALL ON TABLE "tmc"."vw_admin_kpis" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."vw_admin_kpis" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."vw_admin_kpis" TO "authenticated";



GRANT ALL ON FUNCTION "tmc"."get_admin_kpis"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."get_admin_kpis"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."get_admin_kpis"() TO "service_role";



GRANT ALL ON FUNCTION "tmc"."get_remaining_guest_passes"("p_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "tmc"."get_remaining_guest_passes"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."get_remaining_guest_passes"("p_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "tmc"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "tmc"."increment_cf_stats"("p_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "tmc"."increment_cf_stats"("p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "tmc"."increment_cf_tier_slot"("p_tier_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "tmc"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "tmc"."is_trainer"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."is_trainer"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."is_trainer"() TO "service_role";



REVOKE ALL ON FUNCTION "tmc"."log_set"("p_session_id" "uuid", "p_program_exercise_id" "uuid", "p_set_number" integer, "p_weight_kg" numeric, "p_reps" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."log_set"("p_session_id" "uuid", "p_program_exercise_id" "uuid", "p_set_number" integer, "p_weight_kg" numeric, "p_reps" integer, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "tmc"."plan_covers"("p_plan_type" "text", "p_pillar" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."plan_covers"("p_plan_type" "text", "p_pillar" "text") TO "authenticated";



GRANT ALL ON FUNCTION "tmc"."refresh_admin_kpis"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."refresh_admin_kpis"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."refresh_admin_kpis"() TO "service_role";



REVOKE ALL ON FUNCTION "tmc"."request_membership_cancellation"("p_membership_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."request_membership_cancellation"("p_membership_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "tmc"."set_admin_checkin_pin"("p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "tmc"."set_admin_checkin_pin"("p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."set_admin_checkin_pin"("p_pin" "text") TO "service_role";



GRANT ALL ON FUNCTION "tmc"."set_commit_end_date"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."set_commit_end_date"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."set_commit_end_date"() TO "service_role";



REVOKE ALL ON FUNCTION "tmc"."start_workout_session"("p_day_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "tmc"."start_workout_session"("p_day_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "tmc"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "tmc"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "tmc"."verify_admin_checkin_pin"("p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "tmc"."verify_admin_checkin_pin"("p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "tmc"."verify_admin_checkin_pin"("p_pin" "text") TO "service_role";



GRANT ALL ON TABLE "tmc"."admin_audit_log" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."admin_audit_log" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."admin_audit_log" TO "authenticated";



GRANT ALL ON TABLE "tmc"."announcements" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."announcements" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."announcements" TO "authenticated";



GRANT ALL ON TABLE "tmc"."booking_settings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."booking_settings" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."booking_settings" TO "authenticated";



GRANT ALL ON TABLE "tmc"."check_ins" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."check_ins" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."check_ins" TO "authenticated";



GRANT ALL ON TABLE "tmc"."class_pillars" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."class_pillars" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."class_pillars" TO "authenticated";



GRANT ALL ON TABLE "tmc"."class_types" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."class_types" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."class_types" TO "authenticated";



GRANT ALL ON TABLE "tmc"."crowdfunding_stats" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."crowdfunding_stats" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."crowdfunding_stats" TO "authenticated";



GRANT ALL ON TABLE "tmc"."crowdfunding_tiers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."crowdfunding_tiers" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."crowdfunding_tiers" TO "authenticated";



GRANT ALL ON TABLE "tmc"."device_push_tokens" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."device_push_tokens" TO "authenticated";



GRANT ALL ON TABLE "tmc"."events" TO "service_role";



GRANT ALL ON TABLE "tmc"."exercises" TO "service_role";
GRANT SELECT ON TABLE "tmc"."exercises" TO "authenticated";



GRANT ALL ON TABLE "tmc"."guest_bookings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."guest_bookings" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."guest_bookings" TO "authenticated";



GRANT ALL ON TABLE "tmc"."guest_passes" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."guest_passes" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."guest_passes" TO "authenticated";



GRANT ALL ON TABLE "tmc"."member_notes" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."member_notes" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."member_notes" TO "authenticated";



GRANT ALL ON TABLE "tmc"."membership_plan_catalogue" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."membership_plan_catalogue" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."membership_plan_catalogue" TO "authenticated";



GRANT ALL ON TABLE "tmc"."no_show_strikes" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."no_show_strikes" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."no_show_strikes" TO "authenticated";



GRANT ALL ON TABLE "tmc"."opening_hours" TO "service_role";



GRANT ALL ON TABLE "tmc"."opening_hours_exceptions" TO "service_role";



GRANT ALL ON TABLE "tmc"."payments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."payments" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."payments" TO "authenticated";



GRANT ALL ON TABLE "tmc"."program_days" TO "service_role";
GRANT SELECT ON TABLE "tmc"."program_days" TO "authenticated";



GRANT ALL ON TABLE "tmc"."program_exercises" TO "service_role";
GRANT SELECT ON TABLE "tmc"."program_exercises" TO "authenticated";



GRANT ALL ON TABLE "tmc"."pt_bookings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."pt_bookings" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."pt_bookings" TO "authenticated";



GRANT ALL ON TABLE "tmc"."pt_sessions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."pt_sessions" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."pt_sessions" TO "authenticated";



GRANT ALL ON TABLE "tmc"."schedule_templates" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."schedule_templates" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."schedule_templates" TO "authenticated";



GRANT ALL ON TABLE "tmc"."set_logs" TO "service_role";
GRANT SELECT ON TABLE "tmc"."set_logs" TO "authenticated";



GRANT ALL ON TABLE "tmc"."trainer_hours" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."trainer_hours" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."trainer_hours" TO "authenticated";



GRANT ALL ON TABLE "tmc"."trainers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."trainers" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."trainers" TO "authenticated";



GRANT ALL ON TABLE "tmc"."trial_bookings" TO "service_role";



GRANT ALL ON TABLE "tmc"."v_active_strikes" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."v_active_strikes" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."v_active_strikes" TO "authenticated";



GRANT ALL ON TABLE "tmc"."v_member_last_attendance" TO "service_role";



GRANT ALL ON TABLE "tmc"."v_session_availability" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."v_session_availability" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."v_session_availability" TO "authenticated";



GRANT ALL ON TABLE "tmc"."waitlist_entries" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."waitlist_entries" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "tmc"."waitlist_entries" TO "authenticated";



GRANT ALL ON TABLE "tmc"."workout_sessions" TO "service_role";
GRANT SELECT ON TABLE "tmc"."workout_sessions" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tmc" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tmc" GRANT ALL ON TABLES TO "service_role";





--
-- Handmatig aangevuld na db dump: pg_dump --schema tmc neemt de trigger op
-- auth.users niet mee (cross-schema; de functie tmc.handle_new_auth_user
-- staat wel hierboven). Definitie letterlijk overgenomen uit live
-- pg_get_triggerdef op 2026-07-05.
--

DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
CREATE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "tmc"."handle_new_auth_user"();
