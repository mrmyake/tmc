-- Walk-in vanuit de deelnemerslijst (fase-2-checkin-model.md, check-in-spoor
-- PR 3). Een trainer of admin voegt een bestaand lid ter plekke aan een
-- groepsles toe en checkt het direct in; dezelfde regels als gewoon boeken,
-- met precies drie uitzonderingen: de starttijd-cutoff, de capaciteit en de
-- strike-blokkade (strikes zijn tegen het vasthouden van plekken, en wie al
-- in de zaal staat houdt niets vast).
--
-- Inhoud, in deze volgorde:
--   1. bookings.walk_in_at: markering van een walk-in-boeking (null = gewoon).
--   2. booking_gate: drop en recreate op basis van de live definitie, met een
--      zesde parameter p_walk_in boolean default false. Grant blijft alleen
--      postgres (live: geen public, geen anon, geen authenticated).
--   3. enforce_session_capacity: create or replace met gelijke signatuur
--      (triggerfunctie op bookings, trial_bookings en guest_bookings; drop zou
--      de drie triggers meenemen). Laat een rij alleen door met de
--      transactie-lokale override EN op bookings EN met walk_in_at gezet.
--   4. book_walk_in(p_session_id, p_profile_id): de RPC.
--   5. undo_walk_in(p_booking_id): walk-in ongedaan maken, zelfde dag.
--   6. Grants en asserties.
--
-- Schema uitsluitend tmc. Geen app-data nodig (regel 6 van de README).

-- ---------------------------------------------------------------------------
-- 1. Markering
-- ---------------------------------------------------------------------------

alter table tmc.bookings
  add column walk_in_at timestamptz;

comment on column tmc.bookings.walk_in_at is
  'Gezet door tmc.book_walk_in: deze boeking is ter plekke door staf toegevoegd (fase-2-checkin-model.md PR 3). Null = gewone boeking. Alleen schrijfbaar via de RPC; authenticated en anon hebben geen INSERT of UPDATE op bookings.';

-- ---------------------------------------------------------------------------
-- 2. booking_gate met p_walk_in
-- ---------------------------------------------------------------------------
-- Live (pg_get_functiondef, 2026-10-22): niet SECURITY DEFINER, search_path
-- tmc, extensions, ACL {postgres=X/postgres}. Aanroepers book_class_session
-- en join_waitlist geven vijf argumenten mee en krijgen via de default het
-- oude gedrag. Wijzigingen ten opzichte van live, letterlijk:
--   a. zesde parameter p_walk_in boolean default false;
--   b. met p_walk_in: session_in_past wordt overgeslagen;
--   c. met p_walk_in: de capaciteitstelling wordt overgeslagen (o_capacity_full
--      blijft false, o_can_join_waitlist false);
--   d. met p_walk_in: strike_blocked wordt overgeslagen.
-- Alles daarbuiten (dubbelboeking, dagcap, dekking, rittenkaartgeldigheid,
-- weekcap, slotregels, leeftijdscategorie, status, boekvenster) is ongewijzigd.

drop function tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean);

create function tmc.booking_gate(
  p_uid uuid,
  p_session_id uuid,
  p_slot_start_at timestamptz,
  p_slot_minutes integer,
  p_for_waitlist boolean,
  p_walk_in boolean default false,
  out o_reason text,
  out o_capacity_full boolean,
  out o_can_join_waitlist boolean,
  out o_session tmc.class_sessions,
  out o_session_date date,
  out o_iso_week integer,
  out o_iso_year integer,
  out o_is_vrij boolean,
  out o_slot_start timestamptz,
  out o_slot_end timestamptz,
  out o_covering tmc.memberships,
  out o_credits_used integer
)
returns record
language plpgsql
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_profile_age text;
  v_settings record;
  v_same_day_count int;
  v_pillar_week_count int;
  v_strikes record;
  v_check_in_for_pillar boolean;
  v_effective_start timestamptz;
  v_peak int;
  v_blocked boolean;
begin
  o_reason := null;
  o_capacity_full := false;
  o_can_join_waitlist := false;
  o_credits_used := 0;

  -- Lock op de sessie-rij: serialiseert capaciteits- en slotchecks en pint
  -- de status/start_at vast voor de duur van deze transactie.
  select * into o_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    o_reason := 'session_not_found';
    return;
  end if;

  select age_category into v_profile_age
  from tmc.profiles where id = p_uid;
  if v_profile_age is null then
    o_reason := 'profile_not_found';
    return;
  end if;

  select
    coalesce(bs.booking_window_days, 14)        as booking_window_days,
    coalesce(bs.fair_use_daily_max, 2)          as fair_use_daily_max,
    coalesce(bs.no_show_strike_threshold, 3)    as no_show_strike_threshold,
    coalesce(bs.no_show_block_days, 7)          as no_show_block_days,
    coalesce(bs.check_in_enabled, true)         as check_in_enabled,
    coalesce(bs.check_in_pillars,
      array['yoga_mobility','kettlebell','vrij_trainen']) as check_in_pillars,
    coalesce(bs.vrij_trainen_max_concurrent, 5) as vrij_trainen_max_concurrent
  into v_settings
  from tmc.booking_settings bs
  limit 1;
  if not found then
    select 14 as booking_window_days,
           2 as fair_use_daily_max,
           3 as no_show_strike_threshold,
           7 as no_show_block_days,
           true as check_in_enabled,
           array['yoga_mobility','kettlebell','vrij_trainen'] as check_in_pillars,
           5 as vrij_trainen_max_concurrent
    into v_settings;
  end if;

  -- Zelfde datum/week-berekening als de TS-laag (die op Vercel in UTC draait).
  o_session_date := (o_session.start_at at time zone 'utc')::date;
  o_iso_week := extract(week from o_session_date)::int;
  o_iso_year := extract(isoyear from o_session_date)::int;

  -- Slot: verplicht op vrij trainen, verboden op andere pillars.
  o_is_vrij := o_session.pillar = 'vrij_trainen';
  if o_is_vrij then
    if p_slot_start_at is null or p_slot_minutes is null then
      o_reason := 'slot_required';
      return;
    end if;
    if p_slot_minutes not in (30, 45, 60, 75, 90)
       or mod(extract(epoch from p_slot_start_at), 900) <> 0 then
      o_reason := 'slot_invalid';
      return;
    end if;
    o_slot_start := p_slot_start_at;
    o_slot_end := p_slot_start_at + make_interval(mins => p_slot_minutes);
    if o_slot_start < o_session.start_at or o_slot_end > o_session.end_at then
      o_reason := 'slot_outside_session';
      return;
    end if;
  elsif p_slot_start_at is not null or p_slot_minutes is not null then
    o_reason := 'slot_not_allowed';
    return;
  end if;

  -- Vrij trainen rekent venster en verleden vanaf het slot, niet vanaf de
  -- dagsessie (anders is om 07:00 de hele dag dicht).
  v_effective_start := coalesce(o_slot_start, o_session.start_at);

  -- Checks in dezelfde volgorde als canBook() (src/lib/member/can-book.ts).
  if v_profile_age <> o_session.age_category then
    o_reason := 'age_mismatch';
    return;
  end if;

  if v_effective_start > now() + make_interval(days => v_settings.booking_window_days) then
    o_reason := 'booking_window_closed';
    return;
  end if;

  if o_session.status <> 'scheduled' then
    o_reason := 'session_not_scheduled';
    return;
  end if;

  -- Walk-in (b): de les mag al begonnen zijn; het venster bewaakt
  -- book_walk_in zelf.
  if not p_walk_in and v_effective_start <= now() then
    o_reason := 'session_in_past';
    return;
  end if;

  -- Dubbelboeking: expliciete check; de partiele unique index
  -- bookings_profile_session_active_key vangt de race af.
  if exists (
    select 1 from tmc.bookings
    where profile_id = p_uid and session_id = p_session_id
      and status in ('booked', 'waitlisted')
  ) then
    o_reason := 'already_booked';
    return;
  end if;

  -- Capaciteit, geteld onder de sessie-lock, inclusief open promoties van
  -- anderen; de eigen open promotie telt niet als bezet. NULL betekent
  -- onbeperkt (ook vrij trainen: daar geldt de slotgrens hieronder).
  -- Walk-in (c): komt er als extra plek bij, geen telling en geen wachtlijst.
  if not p_walk_in
     and o_session.capacity is not null
     and tmc.session_occupancy(p_session_id, p_uid) >= o_session.capacity then
    o_capacity_full := true;
    -- Wie al een open entry heeft (wachtend of gepromoveerd) kan niet
    -- nogmaals inschrijven; de app biedt dan geen wachtlijstknop.
    o_can_join_waitlist := not exists (
      select 1 from tmc.waitlist_entries w
      where w.profile_id = p_uid and w.session_id = p_session_id
        and w.confirmed_at is null and w.expired_at is null
    );
    if not p_for_waitlist then
      o_reason := 'capacity_full';
      return;
    end if;
  end if;

  -- Slotgrens vrij trainen, onder dezelfde sessie-lock. Geen wachtlijst.
  if o_is_vrij then
    select p.peak, p.blocked into v_peak, v_blocked
    from tmc.vrij_trainen_slot_peak(p_session_id, o_slot_start, o_slot_end) p;
    if v_blocked then
      o_reason := 'slot_blocked';
      return;
    end if;
    if v_peak >= v_settings.vrij_trainen_max_concurrent then
      o_reason := 'slot_full';
      return;
    end if;
  end if;

  -- Strike-blokkade. Walk-in (d): overgeslagen, wie in de zaal staat houdt
  -- geen plek vast.
  if not p_walk_in then
    select strike_count, last_strike_at into v_strikes
    from tmc.v_active_strikes where profile_id = p_uid;
    if found
      and v_strikes.strike_count >= v_settings.no_show_strike_threshold
      and v_strikes.last_strike_at
          + make_interval(days => v_settings.no_show_block_days) > now()
    then
      o_reason := 'strike_blocked';
      return;
    end if;
  end if;

  -- Daily fair-use cap. Vrij trainen telt niet mee en wordt er ook niet door
  -- geweigerd (besluit 4); een per dag volgt al uit sessie plus unique index.
  if not o_is_vrij then
    select count(*) into v_same_day_count
    from tmc.bookings
    where profile_id = p_uid and status = 'booked'
      and session_date = o_session_date
      and pillar <> 'vrij_trainen';
    if v_same_day_count >= v_settings.fair_use_daily_max then
      o_reason := 'daily_cap_reached';
      return;
    end if;
  end if;

  -- Dekking: eerst een dekkend abonnement zonder credits, anders een
  -- ten-rittenkaart met credits. De membership-rij wordt gelockt zodat de
  -- credit-decrement niet kan racen. Een opgezegd lid
  -- (cancellation_requested) houdt dekking t/m de effective date.
  -- Rittenkaart moet op het boekmoment geldig zijn: credits_expires_at
  -- null of >= current_date (expiry-afdwinging, 20260723).
  -- Pauzevenster (lifecycle-primitieven, 20260725): een geplande of lopende
  -- pauze dekt geen sessies op of na de pauze-ingangsdatum.
  select m.* into o_covering
  from tmc.memberships m
  where m.profile_id = p_uid
    and (
      m.status = 'active'
      or (m.status = 'cancellation_requested'
          and m.cancellation_effective_date is not null
          and m.cancellation_effective_date >= o_session_date)
    )
    and (m.pause_effective_date is null
         or o_session_date < m.pause_effective_date)
    and tmc.plan_covers(m.plan_type, o_session.pillar)
    and (m.plan_type <> 'ten_ride_card'
         or (coalesce(m.credits_remaining, 0) > 0
             and (m.credits_expires_at is null or m.credits_expires_at >= current_date)))
  order by (m.plan_type = 'ten_ride_card') asc, m.start_date desc
  limit 1
  for update of m;

  if not found then
    o_reason := 'no_coverage';
    return;
  end if;

  -- Weekly cap: alleen de harde variant (besluit #1, optie B), pillars
  -- zonder check-in. Voor check-in-pillars is de combined-cap een TS-nudge.
  v_check_in_for_pillar := v_settings.check_in_enabled
    and o_session.pillar = any (v_settings.check_in_pillars);

  if o_covering.frequency_cap is not null and not v_check_in_for_pillar then
    select count(*) into v_pillar_week_count
    from tmc.bookings
    where profile_id = p_uid and status = 'booked'
      and pillar = o_session.pillar
      and iso_week = o_iso_week and iso_year = o_iso_year;
    if v_pillar_week_count >= o_covering.frequency_cap then
      o_reason := 'weekly_cap_reached';
      return;
    end if;
  end if;

  if o_covering.plan_type = 'ten_ride_card' then
    o_credits_used := 1;
  end if;

  return;
end;
$function$;

-- Live ACL hersteld: alleen postgres (eigenaar), niets voor public, anon,
-- authenticated of service_role.
revoke execute on function tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. enforce_session_capacity met walk-in-override
-- ---------------------------------------------------------------------------
-- Live: SECURITY DEFINER, search_path tmc, extensions, ACL {postgres=X/postgres},
-- drie triggers (bookings 'booked'; trial_bookings 'pending,paid,attended';
-- guest_bookings 'booked,attended'). Create or replace met gelijke signatuur,
-- zodat de triggers en de ACL blijven staan. Enige wijziging: de override
-- aan het begin. Die geldt uitsluitend als alle drie waar zijn: de
-- transactie-lokale setting tmc.capacity_override = 'on' (gezet door
-- book_walk_in met set_config(..., true)), TG_TABLE_NAME = 'bookings', en
-- NEW.walk_in_at is not null. Voor trial_bookings en guest_bookings verandert
-- er niets, en een gewone boeking zonder walk_in_at blijft onder de grens.

create or replace function tmc.enforce_session_capacity()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_counting text[] := string_to_array(tg_argv[0], ',');
  v_needs_check boolean;
  v_capacity int;
  v_exclude uuid;
begin
  -- Walk-in-override (fase-2-checkin-model.md PR 3): alleen voor een
  -- bookings-rij met walk_in_at, binnen de transactie van book_walk_in.
  if tg_table_name = 'bookings'
     and coalesce(current_setting('tmc.capacity_override', true), '') = 'on'
     and (to_jsonb(new) ->> 'walk_in_at') is not null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_needs_check := new.status = any (v_counting);
  else
    -- Alleen checken als de rij capaciteit gaat innemen die hij nog niet
    -- innam: van niet-tellend naar tellend, of een tellende rij die naar
    -- een andere sessie verhuist. pending -> paid blijft bijvoorbeeld
    -- buiten schot: die rij telde al mee.
    v_needs_check := new.status = any (v_counting)
      and (old.status <> all (v_counting)
           or new.session_id is distinct from old.session_id);
  end if;

  if not v_needs_check then
    return new;
  end if;

  -- Serialisatiepunt: dezelfde rij-lock als de RPC-gates. BEFORE INSERT
  -- ziet de nieuwe rij zelf nog niet in de telling, dus de check is
  -- "bestaande bezetting >= capaciteit weigert de nieuwkomer".
  select capacity into v_capacity
  from tmc.class_sessions
  where id = new.session_id
  for update;

  if not found then
    -- Onbekende sessie laat de FK-constraint afhandelen.
    return new;
  end if;

  -- Ledenboekingen: de eigen open wachtlijstpromotie is een reservering
  -- voor precies deze rij en telt dus niet als bezet. Alleen bookings heeft
  -- een profile_id; voor trial_bookings en guest_bookings is dit null.
  v_exclude := (to_jsonb(new) ->> 'profile_id')::uuid;

  -- capacity null betekent onbeperkt: geen grens om te bewaken.
  if v_capacity is not null
     and tmc.session_occupancy(new.session_id, v_exclude) >= v_capacity then
    raise exception 'session_capacity_exceeded'
      using errcode = 'P0001',
            hint = 'Sessie is vol; capaciteit is een harde bovengrens over leden, proeflessers, gasten en open wachtlijstpromoties.';
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. book_walk_in
-- ---------------------------------------------------------------------------
-- Gate: auth.uid() is admin, of (rol trainer met een actieve trainers-rij die
-- de trainer van deze sessie is), dezelfde definitie als tmc.is_staff() en
-- authorizeForSession() in src/lib/admin/attendance-actions.ts. Anders 42501.
-- Venster: vanaf 15 minuten voor de start tot het einde van de dag van de
-- sessie in Europe/Amsterdam. Daarbinnen dezelfde regels als gewoon boeken
-- (booking_gate met p_walk_in). Een bestaande booked boeking geeft ok met
-- already_booked en de booking_id, zodat de UI gewoon incheckt.
-- Rittenkaart: debit via tmc.apply_credit_adjustment in dezelfde transactie;
-- de kern accepteert bij een debit geen booking_id, dus de booking_id staat
-- in de reason-tekst (en daarmee in de payload van credits.adjusted). Faalt
-- de debit, dan rolt de hele walk-in terug (raise).

create function tmc.book_walk_in(p_session_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_actor_type text;
  v_session tmc.class_sessions%rowtype;
  v_existing uuid;
  g record;
  v_booking_id uuid;
  v_debit jsonb;
  v_waitlist_confirmed int := 0;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  v_role := tmc.current_user_role();
  if v_role = 'admin' then
    v_actor_type := 'admin';
  elsif v_role = 'trainer' and exists (
    select 1
    from tmc.class_sessions cs
    join tmc.trainers t on t.id = cs.trainer_id
    where cs.id = p_session_id
      and t.profile_id = v_uid
      and t.is_active
  ) then
    v_actor_type := 'trainer';
  else
    raise exception 'Geen toegang tot deze sessie.' using errcode = '42501';
  end if;

  if p_profile_id is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  -- Sessie-lock: dezelfde rij als booking_gate straks lockt (geen deadlock,
  -- zelfde transactie).
  select * into v_session
  from tmc.class_sessions
  where id = p_session_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.pillar = 'vrij_trainen' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_class');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;

  -- Venster: 15 minuten voor de start tot einde dag Europe/Amsterdam.
  if now() < v_session.start_at - make_interval(mins => 15)
     or (now() at time zone 'Europe/Amsterdam')::date
        <> (v_session.start_at at time zone 'Europe/Amsterdam')::date then
    return jsonb_build_object('ok', false, 'reason', 'outside_window');
  end if;

  -- Al geboekt: geen nieuwe rij, de bestaande terug zodat de UI incheckt.
  -- Een geannuleerde rij telt niet (partiele unique index).
  select id into v_existing
  from tmc.bookings
  where session_id = p_session_id
    and profile_id = p_profile_id
    and status = 'booked'
  limit 1;
  if v_existing is not null then
    return jsonb_build_object(
      'ok', true, 'reason', 'already_booked', 'booking_id', v_existing,
      'credits_used', 0);
  end if;

  select * into g
  from tmc.booking_gate(p_profile_id, p_session_id, null, null, false, true);
  if g.o_reason is not null then
    return jsonb_build_object('ok', false, 'reason', g.o_reason);
  end if;

  -- Capaciteits-override, transactie-lokaal; de trigger eist daarnaast
  -- tabel bookings en walk_in_at is not null.
  perform set_config('tmc.capacity_override', 'on', true);

  begin
    insert into tmc.bookings (
      profile_id, session_id, session_date, pillar, iso_week, iso_year,
      membership_id, credits_used, status,
      walk_in_at, trainer_alerted_at
    ) values (
      p_profile_id, p_session_id, g.o_session_date, v_session.pillar,
      g.o_iso_week, g.o_iso_year,
      (g.o_covering).id, g.o_credits_used, 'booked',
      now(), now()
    )
    returning id into v_booking_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end;

  perform set_config('tmc.capacity_override', 'off', true);

  -- Rittenkaart: via de gedeelde kern, in deze transactie. De rij is door
  -- booking_gate gelockt en had credits > 0, dus een weigering hier is een
  -- programmeerfout of een race buiten de lock; dan alles terug.
  if g.o_credits_used > 0 then
    v_debit := tmc.apply_credit_adjustment(
      (g.o_covering).id,
      -g.o_credits_used,
      'Walk-in, boeking ' || v_booking_id::text,
      'booking',
      v_actor_type,
      v_uid);
    if not coalesce((v_debit ->> 'ok')::boolean, false) then
      raise exception 'walk_in_credit_failed:%', coalesce(v_debit ->> 'reason', 'unknown')
        using errcode = 'P0001';
    end if;
  end if;

  -- Net als book_class_session: een eigen open wachtlijst-entry is hiermee
  -- bevestigd.
  update tmc.waitlist_entries
  set confirmed_at = now()
  where session_id = p_session_id
    and profile_id = p_profile_id
    and confirmed_at is null
    and expired_at is null;
  get diagnostics v_waitlist_confirmed = row_count;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'booking.created', v_actor_type, v_uid, 'booking', v_booking_id,
    jsonb_build_object(
      'profile_id', p_profile_id,
      'session_id', p_session_id,
      'membership_id', (g.o_covering).id,
      'credits_used', g.o_credits_used,
      'pillar', v_session.pillar,
      'session_date', g.o_session_date,
      'source', 'walk_in',
      'waitlist_confirmed', v_waitlist_confirmed > 0
    )
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'membership_id', (g.o_covering).id,
    'credits_used', g.o_credits_used,
    'waitlist_confirmed', v_waitlist_confirmed > 0
  );
end;
$function$;

revoke execute on function tmc.book_walk_in(uuid, uuid) from public, anon;
grant execute on function tmc.book_walk_in(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. undo_walk_in
-- ---------------------------------------------------------------------------
-- Zelfde gate als book_walk_in. Alleen een boeking met walk_in_at, status
-- booked, op dezelfde dag (Europe/Amsterdam) als de sessie. Zet status
-- cancelled met reden walk_in_undone, boekt de rit terug via
-- apply_credit_adjustment (refund met booking_id: de kern zet credits_used
-- op 0 en bewaakt dubbel terugboeken), alles in een transactie. Geen strike.
-- De check-in zelf haalt de TS-laag weg via setMemberAttendance (present
-- false, source walk_in_undo) voor deze aanroep; de kern weigert op een
-- geannuleerde boeking, vandaar die volgorde.

create function tmc.undo_walk_in(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_actor_type text;
  v_booking tmc.bookings%rowtype;
  v_start_at timestamptz;
  v_refund jsonb;
  v_refunded int := 0;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select * into v_booking
  from tmc.bookings
  where id = p_booking_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  v_role := tmc.current_user_role();
  if v_role = 'admin' then
    v_actor_type := 'admin';
  elsif v_role = 'trainer' and exists (
    select 1
    from tmc.class_sessions cs
    join tmc.trainers t on t.id = cs.trainer_id
    where cs.id = v_booking.session_id
      and t.profile_id = v_uid
      and t.is_active
  ) then
    v_actor_type := 'trainer';
  else
    raise exception 'Geen toegang tot deze sessie.' using errcode = '42501';
  end if;

  if v_booking.walk_in_at is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_walk_in');
  end if;
  if v_booking.status <> 'booked' then
    return jsonb_build_object('ok', false, 'reason', 'not_booked');
  end if;

  select start_at into v_start_at
  from tmc.class_sessions where id = v_booking.session_id;
  if v_start_at is null
     or (now() at time zone 'Europe/Amsterdam')::date
        <> (v_start_at at time zone 'Europe/Amsterdam')::date then
    return jsonb_build_object('ok', false, 'reason', 'outside_window');
  end if;

  -- Eerst terugboeken (de kern leest credits_used van de boeking en zet hem
  -- op 0), dan annuleren.
  if coalesce(v_booking.credits_used, 0) > 0 and v_booking.membership_id is not null then
    v_refund := tmc.apply_credit_adjustment(
      v_booking.membership_id,
      v_booking.credits_used,
      'Walk-in ongedaan gemaakt',
      'refund',
      v_actor_type,
      v_uid,
      p_booking_id,
      'tmc_booking');
    if not coalesce((v_refund ->> 'ok')::boolean, false) then
      raise exception 'walk_in_refund_failed:%', coalesce(v_refund ->> 'reason', 'unknown')
        using errcode = 'P0001';
    end if;
    v_refunded := v_booking.credits_used;
  end if;

  update tmc.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = 'walk_in_undone',
      attended_at = null,
      no_show_at = null
  where id = p_booking_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'booking.cancelled', v_actor_type, v_uid, 'booking', p_booking_id,
    jsonb_build_object(
      'profile_id', v_booking.profile_id,
      'session_id', v_booking.session_id,
      'membership_id', v_booking.membership_id,
      'credits_refunded', v_refunded,
      'reason', 'walk_in_undone',
      'source', 'walk_in'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'session_id', v_booking.session_id,
    'credits_refunded', v_refunded
  );
end;
$function$;

revoke execute on function tmc.undo_walk_in(uuid) from public, anon;
grant execute on function tmc.undo_walk_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Asserties: grants, kolom, signatuur, triggers
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text;
  v_count int;
begin
  -- Kolom bestaat, timestamptz, zonder default.
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'tmc' and table_name = 'bookings'
    and column_name = 'walk_in_at' and data_type = 'timestamp with time zone'
    and column_default is null;
  if v_count <> 1 then
    raise exception 'walk_in_at ontbreekt of heeft de verkeerde vorm';
  end if;

  -- booking_gate: zes IN-parameters, alleen postgres mag uitvoeren.
  v_name := 'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)';
  if to_regprocedure(v_name) is null then
    raise exception 'booking_gate met p_walk_in ontbreekt';
  end if;
  if to_regprocedure('tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean)') is not null then
    raise exception 'oude booking_gate bestaat nog';
  end if;
  foreach v_name in array array[
    'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)'
  ] loop
    if has_function_privilege('anon', v_name, 'execute')
       or has_function_privilege('authenticated', v_name, 'execute')
       or has_function_privilege('service_role', v_name, 'execute') then
      raise exception '% is uitvoerbaar voor een app-rol', v_name;
    end if;
  end loop;

  -- De twee RPC's: authenticated wel, anon niet.
  foreach v_name in array array[
    'tmc.book_walk_in(uuid, uuid)',
    'tmc.undo_walk_in(uuid)'
  ] loop
    if has_function_privilege('anon', v_name, 'execute') then
      raise exception '% is uitvoerbaar voor anon', v_name;
    end if;
    if not has_function_privilege('authenticated', v_name, 'execute') then
      raise exception '% is niet uitvoerbaar voor authenticated', v_name;
    end if;
  end loop;

  -- Triggerfunctie: ACL ongewijzigd (geen app-rol), drie triggers staan nog.
  v_name := 'tmc.enforce_session_capacity()';
  if has_function_privilege('anon', v_name, 'execute')
     or has_function_privilege('authenticated', v_name, 'execute')
     or has_function_privilege('service_role', v_name, 'execute') then
    raise exception 'enforce_session_capacity is uitvoerbaar voor een app-rol';
  end if;
  select count(*) into v_count
  from pg_trigger
  where tgfoid = 'tmc.enforce_session_capacity'::regproc and not tgisinternal;
  if v_count <> 3 then
    raise exception 'enforce_session_capacity heeft % triggers, verwacht 3', v_count;
  end if;

  -- Leden kunnen walk_in_at niet zelf zetten: geen INSERT of UPDATE op
  -- bookings voor anon of authenticated (tabel noch kolom).
  select count(*) into v_count
  from information_schema.table_privileges
  where table_schema = 'tmc' and table_name = 'bookings'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE');
  if v_count <> 0 then
    raise exception 'anon of authenticated kan tmc.bookings schrijven';
  end if;
  select count(*) into v_count
  from information_schema.column_privileges
  where table_schema = 'tmc' and table_name = 'bookings'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE');
  if v_count <> 0 then
    raise exception 'anon of authenticated heeft kolomrechten om tmc.bookings te schrijven';
  end if;
end;
$$;
