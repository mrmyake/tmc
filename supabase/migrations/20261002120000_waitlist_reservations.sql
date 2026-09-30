-- feat/waitlist-and-cron-frequency
--
-- Wachtlijst met echte reserveringen (spec-community-growth.md, sectie
-- Wachtlijst). Alle definities die hier gedropt en herbouwd worden, zijn op
-- 2026-09-30 live opgehaald met pg_get_functiondef, pg_get_viewdef en
-- pg_get_triggerdef; de repobestanden zijn niet als bron gebruikt.
--
--   1. waitlist_entries: herinschrijving na opgeven of na een verlopen
--      promotie is toegestaan. De unique constraint (profile_id, session_id)
--      maakt plaats voor een partiele unique index op open entries;
--      (session_id, position) wordt uniek als backstop tegen dubbele posities.
--   2. Open promotie = promoted_at gezet, niet bevestigd, niet verlopen en
--      confirmation_deadline > now(). Zo'n reservering telt als bezet in
--      session_occupancy (nieuwe tweede parameter p_exclude_profile: het
--      gepromoveerde lid ziet zijn eigen reservering niet als bezet), in
--      enforce_session_capacity (exclusie alleen op bookings, dat is de enige
--      tabel met een profile_id) en in v_session_availability. Een verlopen
--      reservering valt door de deadline-voorwaarde direct vrij, zonder op de
--      cron te wachten.
--   3. booking_gate: de gedeelde checks van book_class_session, in dezelfde
--      volgorde en met dezelfde reason-codes. join_waitlist gebruikt dezelfde
--      poort; daar is capacity_full de voorwaarde om in te schrijven in plaats
--      van een weigering. Geen grant aan wie dan ook: alleen de twee RPC's
--      (SECURITY DEFINER, eigenaar postgres) roepen hem aan.
--   4. join_waitlist en leave_waitlist (authenticated), promote_waitlist_entries
--      (service_role, aangeroepen door de cron) met rustvenster 22:00-07:00
--      Amsterdam via waitlist_confirmation_deadline, en my_waitlist_entries
--      voor de ledenapp (eigen open entries met rang).
--
-- Rechten: elke functie krijgt revoke from public, anon en daarna alleen de
-- bedoelde grants; de zelfcontrole onderaan controleert ze. Geen CASCADE:
-- afhankelijkheden op session_occupancy(uuid) en op de view worden vooraf
-- gecontroleerd via pg_depend en pg_rewrite. Niets hier hangt af van
-- app-data (README regel 6); de functionele zelfcontrole van de deadline
-- rekent met vaste tijdstippen.

-- 0. Afhankelijkheden --------------------------------------------------------

do $$
declare
  v_dep text;
begin
  select string_agg(d.classid::regclass::text || ':' || d.objid::text, ', ')
  into v_dep
  from pg_depend d
  where d.refobjid = 'tmc.session_occupancy(uuid)'::regprocedure
    and d.deptype in ('n', 'a');
  if v_dep is not null then
    raise exception 'waitlist_reservations: session_occupancy(uuid) heeft afhankelijke catalogusobjecten (%); breid de migratie uit in plaats van CASCADE', v_dep;
  end if;

  select string_agg(r.ev_class::regclass::text, ', ')
  into v_dep
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  where d.refobjid = 'tmc.v_session_availability'::regclass
    and d.classid = 'pg_rewrite'::regclass
    and d.deptype in ('n', 'a')
    and r.ev_class <> 'tmc.v_session_availability'::regclass;
  if v_dep is not null then
    raise exception 'waitlist_reservations: v_session_availability heeft afhankelijke views (%); breid de migratie uit in plaats van CASCADE', v_dep;
  end if;
end;
$$;

-- 1. waitlist_entries: herinschrijving en positie-backstop --------------------

alter table tmc.waitlist_entries
  drop constraint waitlist_entries_profile_id_session_id_key;

-- Een lid heeft per les hooguit een open entry (wachtend of gepromoveerd).
-- Na opgeven of een verlopen promotie (expired_at gezet) mag hij opnieuw.
create unique index waitlist_entries_open_profile_session_key
  on tmc.waitlist_entries (profile_id, session_id)
  where confirmed_at is null and expired_at is null;

-- De positie wordt in join_waitlist onder de sessie-lock bepaald
-- (max + 1 over alle entries van de les); deze index is de backstop.
drop index if exists tmc.waitlist_session_position_idx;
create unique index waitlist_entries_session_position_key
  on tmc.waitlist_entries (session_id, "position");

-- 2. Bevestigingsdeadline met rustvenster -------------------------------------
-- Tussen 22:00 en 07:00 Amsterdam is de deadline de eerstvolgende 07:30
-- Amsterdam; overdag now() + waitlist_confirmation_minutes. Altijd
-- geplafonneerd op vijf minuten voor de start. De aanroeper garandeert
-- start_at > now() + 15 minuten, dus de deadline ligt altijd in de toekomst.

create function tmc.waitlist_confirmation_deadline(
  p_now timestamptz,
  p_start_at timestamptz,
  p_minutes integer
)
returns timestamptz
language sql
stable
set search_path to 'tmc', 'extensions'
as $function$
  select least(
    case
      when (p_now at time zone 'Europe/Amsterdam')::time >= time '22:00'
        then (((p_now at time zone 'Europe/Amsterdam')::date + 1) + time '07:30') at time zone 'Europe/Amsterdam'
      when (p_now at time zone 'Europe/Amsterdam')::time < time '07:00'
        then ((p_now at time zone 'Europe/Amsterdam')::date + time '07:30') at time zone 'Europe/Amsterdam'
      else p_now + make_interval(mins => greatest(coalesce(p_minutes, 30), 1))
    end,
    p_start_at - interval '5 minutes'
  )
$function$;

revoke execute on function tmc.waitlist_confirmation_deadline(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function tmc.waitlist_confirmation_deadline(timestamptz, timestamptz, integer) to service_role;

-- 3. session_occupancy: open promoties tellen mee -----------------------------
-- Live (2026-09-30): session_occupancy(uuid), language sql stable, rechten
-- postgres en service_role. Aanroepers met een argument (book_guest_session,
-- redeem_trial_code, enforce_session_capacity, book_class_session) lossen
-- naar de nieuwe signatuur op via de default van p_exclude_profile; alleen
-- book_class_session en enforce_session_capacity geven het profiel mee.

drop function tmc.session_occupancy(uuid);

create function tmc.session_occupancy(p_session_id uuid, p_exclude_profile uuid default null)
returns integer
language sql
stable
as $function$
  select (
    (select count(*) from tmc.bookings b
      where b.session_id = p_session_id
        and b.status = 'booked')
    + (select count(*) from tmc.trial_bookings tb
      where tb.session_id = p_session_id
        and tb.status in ('pending', 'paid', 'attended')
        and not tb.is_test)
    + (select count(*) from tmc.guest_bookings gb
      where gb.session_id = p_session_id
        and gb.status in ('booked', 'attended'))
    -- Open promoties reserveren een plek tot de deadline. Het gepromoveerde
    -- lid zelf ziet zijn reservering niet als bezet (p_exclude_profile),
    -- zodat bevestigen via book_class_session in de gereserveerde plek past.
    + (select count(*) from tmc.waitlist_entries w
      where w.session_id = p_session_id
        and w.promoted_at is not null
        and w.confirmed_at is null
        and w.expired_at is null
        and w.confirmation_deadline > now()
        and w.profile_id is distinct from p_exclude_profile)
  )::integer
$function$;

revoke execute on function tmc.session_occupancy(uuid, uuid) from public, anon, authenticated;
grant execute on function tmc.session_occupancy(uuid, uuid) to service_role;

-- 4. v_session_availability: taken_count en spots_available incl. promoties --
-- Zelfde kolommen in dezelfde volgorde als live; waitlist_count ongewijzigd
-- (alle open entries, gepromoveerd of niet). De view draait als eigenaar
-- (postgres), dus de som staat inline en roept session_occupancy niet aan:
-- anon heeft daar geen EXECUTE op en leest deze view wel (publiek rooster).

drop view tmc.v_session_availability;

create view tmc.v_session_availability as
select cs.id,
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
    else cs.capacity - (occ.members_booked + occ.trials_taken + occ.guests_taken + occ.promotions_open)
  end as spots_available,
  (select count(*) as count
     from tmc.waitlist_entries w
    where w.session_id = cs.id and w.confirmed_at is null and w.expired_at is null) as waitlist_count,
  occ.members_booked + occ.trials_taken + occ.guests_taken + occ.promotions_open as taken_count
from tmc.class_sessions cs
cross join lateral (
  select
    (select count(*) as count
       from tmc.bookings b
      where b.session_id = cs.id and b.status = 'booked') as members_booked,
    (select count(*) as count
       from tmc.trial_bookings tb
      where tb.session_id = cs.id
        and tb.status = any (array['pending', 'paid', 'attended'])
        and not tb.is_test) as trials_taken,
    (select count(*) as count
       from tmc.guest_bookings gb
      where gb.session_id = cs.id
        and gb.status = any (array['booked', 'attended'])) as guests_taken,
    (select count(*) as count
       from tmc.waitlist_entries w
      where w.session_id = cs.id
        and w.promoted_at is not null
        and w.confirmed_at is null
        and w.expired_at is null
        and w.confirmation_deadline > now()) as promotions_open
) occ
where cs.status = 'scheduled';

revoke all on tmc.v_session_availability from public, anon, authenticated, service_role;
grant select on tmc.v_session_availability to anon, authenticated, service_role;

-- 5. enforce_session_capacity: eigen promotie telt niet op bookings ----------
-- Live (2026-09-30): drie triggers (bookings 'booked', trial_bookings
-- 'pending,paid,attended', guest_bookings 'booked,attended'), functie
-- SECURITY DEFINER met rechten alleen voor postgres. Enige inhoudelijke
-- wijziging: de exclusie van het eigen profiel. trial_bookings en
-- guest_bookings hebben geen profile_id, dus daar blijft de exclusie null.

drop trigger bookings_enforce_capacity on tmc.bookings;
drop trigger trial_bookings_enforce_capacity on tmc.trial_bookings;
drop trigger guest_bookings_enforce_capacity on tmc.guest_bookings;
drop function tmc.enforce_session_capacity();

create function tmc.enforce_session_capacity()
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

revoke execute on function tmc.enforce_session_capacity() from public, anon, authenticated, service_role;

create trigger bookings_enforce_capacity
  before insert or update of status, session_id on tmc.bookings
  for each row execute function tmc.enforce_session_capacity('booked');

create trigger trial_bookings_enforce_capacity
  before insert or update of status, session_id on tmc.trial_bookings
  for each row execute function tmc.enforce_session_capacity('pending,paid,attended');

create trigger guest_bookings_enforce_capacity
  before insert or update of status, session_id on tmc.guest_bookings
  for each row execute function tmc.enforce_session_capacity('booked,attended');

-- 6. booking_gate: de gedeelde checks -----------------------------------------
-- Letterlijk de checks uit de live book_class_session, in dezelfde volgorde
-- en met dezelfde reason-codes: sessie-lock, profiel, instellingen, slot
-- (vrij trainen), leeftijdscategorie, boekvenster, scheduled, niet in het
-- verleden, geen eigen actieve boeking, capaciteit, slotgrens, strike,
-- dagelijkse fair-use-cap, dekking (incl. rittenkaart-credits, expiry en
-- pauzevenster, membership-rij gelockt), harde weekcap.
--
-- p_for_waitlist: bij true is een volle les geen weigering maar wordt
-- o_capacity_full gezet en lopen de overige checks door, zodat join_waitlist
-- dezelfde redenen teruggeeft als book_class_session. OUT-parameters hebben
-- een o_-prefix om botsingen met kolomnamen in de queries te voorkomen.

create function tmc.booking_gate(
  p_uid uuid,
  p_session_id uuid,
  p_slot_start_at timestamptz,
  p_slot_minutes integer,
  p_for_waitlist boolean,
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

  if v_effective_start <= now() then
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
  if o_session.capacity is not null
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

  -- Strike-blokkade.
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

revoke execute on function tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean) from public, anon, authenticated, service_role;

-- 7. book_class_session: via de gedeelde poort -------------------------------
-- Live (2026-09-30): signatuur (uuid, boolean, boolean, timestamptz, integer),
-- rechten postgres en authenticated. Inhoudelijke wijzigingen: de checks
-- lopen via booking_gate (eigen open promotie telt niet als bezet),
-- can_join_waitlist is alleen true zonder eigen open entry. Insert, credits,
-- wachtlijst-resolutie en de ok-payload zijn ongewijzigd.

drop function tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer);

create function tmc.book_class_session(
  p_session_id uuid,
  p_rental_mat boolean default false,
  p_rental_towel boolean default false,
  p_slot_start_at timestamptz default null,
  p_slot_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  g record;
  v_session tmc.class_sessions%rowtype;
  v_covering tmc.memberships%rowtype;
  v_rental_mat boolean;
  v_rental_towel boolean;
  v_booking_id uuid;
  v_waitlist_confirmed int := 0;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select * into g
  from tmc.booking_gate(v_uid, p_session_id, p_slot_start_at, p_slot_minutes, false);

  if g.o_reason is not null then
    if g.o_reason = 'capacity_full' then
      return jsonb_build_object(
        'ok', false, 'reason', 'capacity_full',
        'can_join_waitlist', g.o_can_join_waitlist);
    end if;
    return jsonb_build_object('ok', false, 'reason', g.o_reason);
  end if;

  v_session := g.o_session;
  v_covering := g.o_covering;

  -- Rentals alleen op yoga_mobility; overige pillars stil negeren (spec).
  v_rental_mat := v_session.pillar = 'yoga_mobility' and coalesce(p_rental_mat, false);
  v_rental_towel := v_session.pillar = 'yoga_mobility' and coalesce(p_rental_towel, false);

  begin
    insert into tmc.bookings (
      profile_id, session_id, session_date, pillar, iso_week, iso_year,
      membership_id, credits_used, status, rental_mat, rental_towel,
      slot_start_at, slot_end_at
    ) values (
      v_uid, p_session_id, g.o_session_date, v_session.pillar, g.o_iso_week, g.o_iso_year,
      v_covering.id, g.o_credits_used, 'booked', v_rental_mat, v_rental_towel,
      g.o_slot_start, g.o_slot_end
    )
    returning id into v_booking_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'already_booked');
    when raise_exception then
      -- Slot-backstop (bookings_enforce_vrij_trainen_slot). Onder de
      -- sessie-lock hierboven niet bereikbaar, maar een weigering blijft
      -- een nette reason in plaats van een exception.
      if sqlerrm in ('slot_full', 'slot_blocked') then
        return jsonb_build_object('ok', false, 'reason', sqlerrm);
      end if;
      raise;
  end;

  if g.o_credits_used > 0 then
    -- Rij is in booking_gate gelockt; de guard houdt credits >= 0.
    update tmc.memberships
    set credits_remaining = credits_remaining - g.o_credits_used
    where id = v_covering.id
      and coalesce(credits_remaining, 0) >= g.o_credits_used;
    if not found then
      raise exception 'Geen credits meer beschikbaar.' using errcode = 'P0001';
    end if;
  end if;

  -- Waitlist-resolutie (20260814): een geslaagde boeking lost de eigen
  -- open wachtlijst-entry voor deze sessie op, in dezelfde transactie als
  -- de insert. Ook een gepromoveerde entry: dat is het bevestigen.
  update tmc.waitlist_entries
  set confirmed_at = now()
  where session_id = p_session_id
    and profile_id = v_uid
    and confirmed_at is null
    and expired_at is null;
  get diagnostics v_waitlist_confirmed = row_count;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'membership_id', v_covering.id,
    'credits_used', g.o_credits_used,
    'pillar', v_session.pillar,
    'session_date', g.o_session_date,
    'slot_start_at', g.o_slot_start,
    'slot_end_at', g.o_slot_end,
    'waitlist_confirmed', v_waitlist_confirmed > 0
  );
end;
$function$;

revoke execute on function tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer) from public, anon;
grant execute on function tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer) to authenticated;

-- 8. join_waitlist -------------------------------------------------------------
-- Dezelfde poort als book_class_session; capacity_full is hier de voorwaarde
-- om in te schrijven. Er wordt niets gedecrementeerd: credits gaan pas af bij
-- bevestigen via book_class_session. De positie is max + 1 over alle entries
-- van de les (ook verlopen en bevestigde), bepaald onder de sessie-lock die
-- booking_gate al heeft genomen; wie na opgeven opnieuw inschrijft, staat
-- daardoor achteraan. rank is de plek onder de wachtenden (open, nog niet
-- gepromoveerd) en is wat de app toont.

create function tmc.join_waitlist(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  g record;
  v_open_id uuid;
  v_position int;
  v_entry_id uuid;
  v_rank int;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select * into g
  from tmc.booking_gate(v_uid, p_session_id, null, null, true);

  if g.o_reason is not null then
    return jsonb_build_object('ok', false, 'reason', g.o_reason);
  end if;

  -- Een open entry (wachtend of gepromoveerd) sluit een tweede uit.
  select w.id into v_open_id
  from tmc.waitlist_entries w
  where w.profile_id = v_uid and w.session_id = p_session_id
    and w.confirmed_at is null and w.expired_at is null;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'already_on_waitlist', 'entry_id', v_open_id);
  end if;

  if not g.o_capacity_full then
    return jsonb_build_object('ok', false, 'reason', 'spots_available');
  end if;

  select coalesce(max(w."position"), 0) + 1 into v_position
  from tmc.waitlist_entries w
  where w.session_id = p_session_id;

  begin
    insert into tmc.waitlist_entries (profile_id, session_id, "position")
    values (v_uid, p_session_id, v_position)
    returning id into v_entry_id;
  exception when unique_violation then
    -- Onder de sessie-lock niet bereikbaar; nette reason als backstop.
    return jsonb_build_object('ok', false, 'reason', 'already_on_waitlist');
  end;

  select count(*)::int + 1 into v_rank
  from tmc.waitlist_entries w
  where w.session_id = p_session_id
    and w.confirmed_at is null and w.expired_at is null and w.promoted_at is null
    and w."position" < v_position;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'booking.waitlisted', 'member', v_uid, 'waitlist', v_entry_id,
    jsonb_build_object(
      'profile_id', v_uid,
      'session_id', p_session_id,
      'position', v_position,
      'rank', v_rank
    )
  );

  return jsonb_build_object(
    'ok', true,
    'entry_id', v_entry_id,
    'position', v_position,
    'rank', v_rank
  );
end;
$function$;

revoke execute on function tmc.join_waitlist(uuid) from public, anon;
grant execute on function tmc.join_waitlist(uuid) to authenticated;

-- 9. leave_waitlist ------------------------------------------------------------
-- Alleen de eigen open entry (wachtend of gepromoveerd). Een open promotie
-- valt hiermee direct vrij; de cron promoveert de volgende binnen vijf
-- minuten. Lock op de sessie zodat dit niet door promote_waitlist_entries of
-- book_class_session heen loopt.

create function tmc.leave_waitlist(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_entry tmc.waitlist_entries%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Andermans entry behandelen als onbekend (geen informatie-lek).
  select * into v_entry
  from tmc.waitlist_entries
  where id = p_entry_id and profile_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  perform 1 from tmc.class_sessions where id = v_entry.session_id for update;

  -- Opnieuw lezen onder de lock: de cron kan de entry intussen hebben
  -- gepromoveerd of laten verlopen.
  select * into v_entry from tmc.waitlist_entries where id = p_entry_id;

  if v_entry.confirmed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_confirmed');
  end if;
  if v_entry.expired_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  update tmc.waitlist_entries
  set expired_at = now()
  where id = p_entry_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'waitlist.left', 'member', v_uid, 'waitlist', p_entry_id,
    jsonb_build_object(
      'profile_id', v_uid,
      'session_id', v_entry.session_id,
      'position', v_entry."position",
      'was_promoted', v_entry.promoted_at is not null
    )
  );

  return jsonb_build_object(
    'ok', true,
    'session_id', v_entry.session_id,
    'was_promoted', v_entry.promoted_at is not null
  );
end;
$function$;

revoke execute on function tmc.leave_waitlist(uuid) from public, anon;
grant execute on function tmc.leave_waitlist(uuid) to authenticated;

-- 10. promote_waitlist_entries -------------------------------------------------
-- Stap 1: verlopen promoties sluiten (set-based, met event). Stap 2: per
-- kandidaat-sessie (scheduled, capaciteit niet null, start > now + 15 min,
-- minstens een wachtende) in start-volgorde onder de sessie-lock zoveel
-- wachtenden promoveren als er plekken vrij zijn, laagste positie eerst.
-- Twee overlappende runs: de tweede wacht op de lock en ziet daarna niets
-- meer te doen (de update heeft een guard op promoted_at is null). De cron is
-- een dunne wrapper: hij stuurt alleen mail en push per geretourneerde rij.

create function tmc.promote_waitlist_entries()
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_minutes int;
  v_expired int := 0;
  v_candidate record;
  v_session record;
  v_entry record;
  v_free int;
  v_deadline timestamptz;
  v_promoted jsonb := '[]'::jsonb;
  v_n int;
begin
  with expired as (
    update tmc.waitlist_entries
    set expired_at = now()
    where promoted_at is not null
      and confirmed_at is null
      and expired_at is null
      and confirmation_deadline <= now()
    returning id, profile_id, session_id
  ), ev as (
    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    select 'waitlist.expired', 'system', null, 'waitlist', e.id,
           jsonb_build_object('profile_id', e.profile_id, 'session_id', e.session_id)
    from expired e
    returning 1
  )
  select count(*) into v_expired from ev;

  select coalesce(bs.waitlist_confirmation_minutes, 30) into v_minutes
  from tmc.booking_settings bs
  limit 1;
  v_minutes := coalesce(v_minutes, 30);

  for v_candidate in
    select cs.id
    from tmc.class_sessions cs
    where cs.status = 'scheduled'
      and cs.capacity is not null
      and cs.start_at > now() + interval '15 minutes'
      and exists (
        select 1 from tmc.waitlist_entries w
        where w.session_id = cs.id
          and w.promoted_at is null and w.confirmed_at is null and w.expired_at is null
      )
    order by cs.start_at
  loop
    -- Lock en opnieuw lezen: de kandidatenlijst is een snapshot van voor de
    -- lock, de beslissing wordt op de gelockte rij genomen.
    select id, start_at, capacity, status into v_session
    from tmc.class_sessions
    where id = v_candidate.id
    for update;

    if v_session.status <> 'scheduled'
       or v_session.capacity is null
       or v_session.start_at <= now() + interval '15 minutes' then
      continue;
    end if;

    v_free := v_session.capacity - tmc.session_occupancy(v_session.id);
    if v_free <= 0 then
      continue;
    end if;

    v_deadline := tmc.waitlist_confirmation_deadline(now(), v_session.start_at, v_minutes);

    for v_entry in
      select w.id, w.profile_id, w."position"
      from tmc.waitlist_entries w
      where w.session_id = v_session.id
        and w.promoted_at is null and w.confirmed_at is null and w.expired_at is null
      order by w."position"
      limit v_free
    loop
      update tmc.waitlist_entries
      set promoted_at = now(), confirmation_deadline = v_deadline
      where id = v_entry.id
        and promoted_at is null and confirmed_at is null and expired_at is null;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        continue;
      end if;

      insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
      values (
        'waitlist.promoted', 'system', null, 'waitlist', v_entry.id,
        jsonb_build_object(
          'waitlist_entry_id', v_entry.id,
          'profile_id', v_entry.profile_id,
          'session_id', v_session.id,
          'position', v_entry."position",
          'confirmation_deadline', v_deadline
        )
      );

      v_promoted := v_promoted || jsonb_build_object(
        'entry_id', v_entry.id,
        'profile_id', v_entry.profile_id,
        'session_id', v_session.id,
        'position', v_entry."position",
        'start_at', v_session.start_at,
        'confirmation_deadline', v_deadline
      );
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'expired', v_expired, 'promoted', v_promoted);
end;
$function$;

revoke execute on function tmc.promote_waitlist_entries() from public, anon, authenticated;
grant execute on function tmc.promote_waitlist_entries() to service_role;

-- 11. my_waitlist_entries: eigen open entries met rang ------------------------
-- SECURITY DEFINER omdat de rang over andermans rijen telt (RLS laat een lid
-- alleen eigen rijen lezen). Alleen open entries van geplande, toekomstige
-- lessen; een promotie waarvan de deadline verstreken is, is geen open
-- promotie meer en blijft weg tot de cron hem sluit.

create function tmc.my_waitlist_entries()
returns table (
  entry_id uuid,
  session_id uuid,
  "position" integer,
  rank integer,
  state text,
  promoted_at timestamptz,
  confirmation_deadline timestamptz,
  created_at timestamptz
)
language sql
security definer
stable
set search_path to 'tmc', 'extensions'
as $function$
  select w.id,
    w.session_id,
    w."position",
    (select count(*)::int + 1
       from tmc.waitlist_entries o
      where o.session_id = w.session_id
        and o.confirmed_at is null and o.expired_at is null and o.promoted_at is null
        and o."position" < w."position") as rank,
    case when w.promoted_at is not null then 'promoted' else 'waiting' end as state,
    w.promoted_at,
    w.confirmation_deadline,
    w.created_at
  from tmc.waitlist_entries w
  join tmc.class_sessions cs on cs.id = w.session_id
  where w.profile_id = auth.uid()
    and w.confirmed_at is null
    and w.expired_at is null
    and (w.promoted_at is null or w.confirmation_deadline > now())
    and cs.status = 'scheduled'
    and cs.start_at > now()
  order by cs.start_at
$function$;

revoke execute on function tmc.my_waitlist_entries() from public, anon;
grant execute on function tmc.my_waitlist_entries() to authenticated;

-- Zelfcontrole ----------------------------------------------------------------

do $$
declare
  r record;
  f text;
  v_ts timestamptz;
begin
  -- Structuur.
  if exists (select 1 from pg_constraint where conname = 'waitlist_entries_profile_id_session_id_key') then
    raise exception 'waitlist_reservations: oude unique constraint staat er nog';
  end if;
  for f in select unnest(array['waitlist_entries_open_profile_session_key', 'waitlist_entries_session_position_key']) loop
    if not exists (select 1 from pg_indexes where schemaname = 'tmc' and tablename = 'waitlist_entries' and indexname = f) then
      raise exception 'waitlist_reservations: index % ontbreekt', f;
    end if;
  end loop;
  for f in select unnest(array['bookings_enforce_capacity', 'trial_bookings_enforce_capacity', 'guest_bookings_enforce_capacity']) loop
    if not exists (select 1 from pg_trigger where tgname = f and not tgisinternal) then
      raise exception 'waitlist_reservations: trigger % ontbreekt', f;
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'tmc' and p.proname = 'session_occupancy' and p.pronargs = 1) then
    raise exception 'waitlist_reservations: session_occupancy(uuid) bestaat nog';
  end if;

  -- View: alleen select, voor anon, authenticated en service_role.
  for r in select * from (values ('anon'), ('authenticated'), ('service_role')) as v(role) loop
    if not has_table_privilege(r.role, 'tmc.v_session_availability', 'SELECT') then
      raise exception 'waitlist_reservations: % mist SELECT op v_session_availability', r.role;
    end if;
    if has_table_privilege(r.role, 'tmc.v_session_availability', 'INSERT, UPDATE, DELETE') then
      raise exception 'waitlist_reservations: % heeft schrijfrechten op v_session_availability', r.role;
    end if;
  end loop;

  -- Functierechten: nergens PUBLIC of anon; per functie precies de bedoelde rollen.
  for r in
    select * from (values
      ('tmc.waitlist_confirmation_deadline(timestamptz, timestamptz, integer)', false, true),
      ('tmc.session_occupancy(uuid, uuid)', false, true),
      ('tmc.enforce_session_capacity()', false, false),
      ('tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean)', false, false),
      ('tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer)', true, false),
      ('tmc.join_waitlist(uuid)', true, false),
      ('tmc.leave_waitlist(uuid)', true, false),
      ('tmc.promote_waitlist_entries()', false, true),
      ('tmc.my_waitlist_entries()', true, false)
    ) as v(fn, want_authenticated, want_service)
  loop
    if has_function_privilege('anon', r.fn, 'EXECUTE') then
      raise exception 'waitlist_reservations: anon heeft EXECUTE op %', r.fn;
    end if;
    if has_function_privilege('authenticated', r.fn, 'EXECUTE') <> r.want_authenticated then
      raise exception 'waitlist_reservations: rechten authenticated op % kloppen niet', r.fn;
    end if;
    if has_function_privilege('service_role', r.fn, 'EXECUTE') <> r.want_service then
      raise exception 'waitlist_reservations: rechten service_role op % kloppen niet', r.fn;
    end if;
    if exists (
      select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = r.fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) then
      raise exception 'waitlist_reservations: PUBLIC heeft EXECUTE op %', r.fn;
    end if;
  end loop;

  -- Deadline-berekening (Europe/Amsterdam, zomertijd op 2026-10-05).
  -- Overdag: now + minuten.
  v_ts := tmc.waitlist_confirmation_deadline(
    timestamptz '2026-10-05 14:00 Europe/Amsterdam', timestamptz '2026-10-05 18:00 Europe/Amsterdam', 30);
  if v_ts <> timestamptz '2026-10-05 14:30 Europe/Amsterdam' then
    raise exception 'waitlist_reservations: deadline overdag is % in plaats van 14:30', v_ts;
  end if;
  -- 23:30 voor een les om 09:00: eerstvolgende 07:30.
  v_ts := tmc.waitlist_confirmation_deadline(
    timestamptz '2026-10-05 23:30 Europe/Amsterdam', timestamptz '2026-10-06 09:00 Europe/Amsterdam', 30);
  if v_ts <> timestamptz '2026-10-06 07:30 Europe/Amsterdam' then
    raise exception 'waitlist_reservations: deadline 23:30 voor 09:00 is % in plaats van 07:30', v_ts;
  end if;
  -- 23:30 voor een les om 07:00: geplafonneerd op 06:55.
  v_ts := tmc.waitlist_confirmation_deadline(
    timestamptz '2026-10-05 23:30 Europe/Amsterdam', timestamptz '2026-10-06 07:00 Europe/Amsterdam', 30);
  if v_ts <> timestamptz '2026-10-06 06:55 Europe/Amsterdam' then
    raise exception 'waitlist_reservations: deadline 23:30 voor 07:00 is % in plaats van 06:55', v_ts;
  end if;
  -- 06:50 voor een les om 07:30: rustvenster geeft 07:30, plafond 07:25.
  v_ts := tmc.waitlist_confirmation_deadline(
    timestamptz '2026-10-06 06:50 Europe/Amsterdam', timestamptz '2026-10-06 07:30 Europe/Amsterdam', 30);
  if v_ts <> timestamptz '2026-10-06 07:25 Europe/Amsterdam' then
    raise exception 'waitlist_reservations: deadline 06:50 voor 07:30 is % in plaats van 07:25', v_ts;
  end if;
  -- Overdag met een les over 20 minuten: plafond start - 5.
  v_ts := tmc.waitlist_confirmation_deadline(
    timestamptz '2026-10-05 14:00 Europe/Amsterdam', timestamptz '2026-10-05 14:20 Europe/Amsterdam', 30);
  if v_ts <> timestamptz '2026-10-05 14:15 Europe/Amsterdam' then
    raise exception 'waitlist_reservations: deadline met plafond is % in plaats van 14:15', v_ts;
  end if;

  raise notice 'waitlist_reservations: zelfcontrole geslaagd';
end;
$$;
