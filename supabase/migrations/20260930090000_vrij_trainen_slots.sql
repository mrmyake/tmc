-- feat/vrij-trainen-slots
--
-- Vrij trainen boekbaar als eigen tijdslot binnen een dagsessie, met een
-- harde grens op het aantal mensen tegelijk (spec-vrij-trainen-slots.md).
--
-- Onderdelen:
--   1. Unique-fix: bookings_profile_id_session_id_key (alle statussen) wordt
--      een partiele unique index op status in ('booked','waitlisted'), zodat
--      annuleren en opnieuw boeken van dezelfde sessie weer kan (alle
--      pillars). De geannuleerde rij blijft staan als historie.
--   2. bookings.slot_start_at / slot_end_at met check-constraints, index
--      voor de kwartiertelling, booking_settings.vrij_trainen_max_concurrent.
--   3. tmc.vrij_trainen_slot_peak: de enige gedeelde telling (RPC, trigger,
--      beschikbaarheid), inclusief blokkerende lessen.
--   4. Triggers: slot-backstop op bookings, weigering van proeflessen en
--      gasten op vrij trainen, geen strikes op vrij trainen, en een guard
--      die een vrij-trainen-sessie niet laat krimpen buiten geboekte slots.
--   5. Drop en recreate van book_class_session, cancel_class_booking,
--      book_guest_session en admin_reschedule_class_session op basis van de
--      live definitie (pg_get_functiondef, 2026-09-29), grants expliciet
--      hersteld zoals ze live stonden.
--   6. tmc.vrij_trainen_availability(p_date): vrije plekken per kwartier.
--   7. Templates voor de dagsessie volgens opening_hours (voorwaardelijk,
--      README regel 6).
--
-- Race-vrijheid: elke schrijver op een vrij-trainen-dag (RPC, trigger,
-- admin-pad) neemt eerst FOR UPDATE op de ene class_sessions-rij van die
-- dag. Onder READ COMMITTED krijgt elk statement na die lock een nieuwe
-- snapshot, dus de telling ziet de gecommitte boeking van de vorige
-- lockhouder. Beide BEFORE-triggers op bookings locken dezelfde rij, in
-- dezelfde transactie, dus geen deadlock.

-- 1. Unique-fix ---------------------------------------------------------------

alter table tmc.bookings drop constraint bookings_profile_id_session_id_key;

create unique index bookings_profile_session_active_key
  on tmc.bookings (profile_id, session_id)
  where status in ('booked', 'waitlisted');

-- 2. Datamodel ----------------------------------------------------------------

alter table tmc.bookings
  add column slot_start_at timestamptz,
  add column slot_end_at timestamptz;

comment on column tmc.bookings.slot_start_at is
  'Alleen vrij trainen: begin van het geboekte slot (kwartierraster). Leidend voor annuleertermijn, herinnering en weergave.';
comment on column tmc.bookings.slot_end_at is
  'Alleen vrij trainen: einde van het geboekte slot (half-open interval).';

alter table tmc.bookings
  add constraint bookings_slot_pair
    check ((slot_start_at is null) = (slot_end_at is null)),
  -- Kwartierraster via epoch: de Amsterdamse offset is altijd hele uren,
  -- dus UTC-kwartieren vallen samen met lokale kwartieren.
  add constraint bookings_slot_shape
    check (slot_start_at is null or (
      slot_end_at > slot_start_at
      and extract(epoch from (slot_end_at - slot_start_at)) in (1800, 2700, 3600, 4500, 5400)
      and mod(extract(epoch from slot_start_at), 900) = 0)),
  add constraint bookings_slot_pillar
    check ((pillar = 'vrij_trainen') = (slot_start_at is not null)),
  -- Vrij trainen levert nooit een no-show op (besluit 5).
  add constraint bookings_vrij_trainen_no_no_show
    check (pillar <> 'vrij_trainen' or no_show_at is null);

create index bookings_vrij_slot_idx
  on tmc.bookings (session_id, slot_start_at, slot_end_at)
  where status = 'booked' and slot_start_at is not null;

alter table tmc.booking_settings
  add column vrij_trainen_max_concurrent integer not null default 5
    constraint booking_settings_vrij_trainen_max_concurrent_check
    check (vrij_trainen_max_concurrent > 0);

comment on column tmc.booking_settings.vrij_trainen_max_concurrent is
  'Maximaal aantal vrij-trainen-boekingen dat tegelijk een kwartier mag raken.';

-- 3. Gedeelde telling ---------------------------------------------------------

-- Per kwartier q in [p_start, p_end): aantal geboekte slots dat q raakt
-- (slot_start_at <= q < slot_end_at). peak = het hoogste aantal; blocked =
-- minstens een kwartier overlapt met een geplande sessie met
-- blocks_free_training. p_exclude_booking_id laat de eigen rij buiten de
-- telling bij een UPDATE. Aanroepers moeten de sessierij gelockt hebben.
create function tmc.vrij_trainen_slot_peak(
  p_session_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_booking_id uuid default null
)
returns table (peak integer, blocked boolean)
language sql
stable
set search_path to 'tmc', 'extensions'
as $function$
  with q as (
    select gs as qs
    from generate_series(p_start, p_end - interval '15 minutes', interval '15 minutes') gs
  )
  select
    coalesce((
      select max(c.n)
      from q
      cross join lateral (
        select count(*)::integer as n
        from tmc.bookings b
        where b.session_id = p_session_id
          and b.status = 'booked'
          and b.slot_start_at <= q.qs
          and b.slot_end_at > q.qs
          and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      ) c
    ), 0)::integer as peak,
    exists (
      select 1
      from q
      join tmc.class_sessions cs
        on cs.status = 'scheduled'
       and cs.blocks_free_training
       and cs.id <> p_session_id
       and cs.start_at < q.qs + interval '15 minutes'
       and cs.end_at > q.qs
    ) as blocked
$function$;

revoke execute on function tmc.vrij_trainen_slot_peak(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated, service_role;

-- 4. Triggers -----------------------------------------------------------------

-- Harde backstop op de slotregels, ook voor paden die de RPC omzeilen.
create function tmc.enforce_vrij_trainen_slot()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_session record;
  v_max int;
  v_peak int;
  v_blocked boolean;
begin
  if new.status <> 'booked' then
    return new;
  end if;

  -- Een rij die al booked was en niet van sessie of slot wisselt, neemt
  -- geen nieuwe plek in.
  if tg_op = 'UPDATE'
     and old.status = 'booked'
     and new.session_id is not distinct from old.session_id
     and new.slot_start_at is not distinct from old.slot_start_at
     and new.slot_end_at is not distinct from old.slot_end_at then
    return new;
  end if;

  -- Serialisatiepunt: dezelfde rij-lock als book_class_session en
  -- enforce_session_capacity.
  select id, pillar, start_at, end_at into v_session
  from tmc.class_sessions
  where id = new.session_id
  for update;

  if not found then
    return new;
  end if;

  if v_session.pillar <> 'vrij_trainen' then
    if new.slot_start_at is not null then
      raise exception 'slot_not_allowed' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.slot_start_at is null then
    raise exception 'slot_required' using errcode = 'P0001';
  end if;

  if new.slot_start_at < v_session.start_at or new.slot_end_at > v_session.end_at then
    raise exception 'slot_outside_session' using errcode = 'P0001';
  end if;

  select coalesce(bs.vrij_trainen_max_concurrent, 5) into v_max
  from tmc.booking_settings bs limit 1;
  v_max := coalesce(v_max, 5);

  select p.peak, p.blocked into v_peak, v_blocked
  from tmc.vrij_trainen_slot_peak(
    new.session_id, new.slot_start_at, new.slot_end_at,
    case when tg_op = 'UPDATE' then new.id end) p;

  if v_blocked then
    raise exception 'slot_blocked' using errcode = 'P0001';
  end if;
  if v_peak >= v_max then
    raise exception 'slot_full' using errcode = 'P0001',
      hint = 'Maximaal aantal tegelijk bereikt in minstens een kwartier van dit slot.';
  end if;

  return new;
end;
$function$;

revoke execute on function tmc.enforce_vrij_trainen_slot() from public, anon, authenticated, service_role;

create trigger bookings_enforce_vrij_trainen_slot
  before insert or update of status, session_id, slot_start_at, slot_end_at
  on tmc.bookings
  for each row execute function tmc.enforce_vrij_trainen_slot();

-- Proeflessen (code en betaald) en gasten zijn niet toegestaan op vrij
-- trainen. redeem_trial_code en book_guest_session weigeren al netjes; dit
-- is de DB-backstop voor alle paden, ook de service_role-insert van de
-- betaalde proefles.
create function tmc.reject_vrij_trainen_visitor()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
begin
  if tg_op = 'UPDATE' and new.session_id is not distinct from old.session_id then
    return new;
  end if;
  if exists (
    select 1 from tmc.class_sessions
    where id = new.session_id and pillar = 'vrij_trainen'
  ) then
    raise exception 'session_not_eligible' using errcode = 'P0001',
      hint = 'Vrij trainen staat geen proeflessen en gasten toe.';
  end if;
  return new;
end;
$function$;

revoke execute on function tmc.reject_vrij_trainen_visitor() from public, anon, authenticated, service_role;

create trigger trial_bookings_reject_vrij_trainen
  before insert or update of session_id on tmc.trial_bookings
  for each row execute function tmc.reject_vrij_trainen_visitor();

create trigger guest_bookings_reject_vrij_trainen
  before insert or update of session_id on tmc.guest_bookings
  for each row execute function tmc.reject_vrij_trainen_visitor();

-- Geen strikes op vrij trainen (besluit 5), ook niet handmatig.
create function tmc.reject_vrij_trainen_strike()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
begin
  if new.booking_id is not null and exists (
    select 1 from tmc.bookings
    where id = new.booking_id and pillar = 'vrij_trainen'
  ) then
    raise exception 'vrij_trainen_no_strike' using errcode = 'P0001',
      hint = 'Vrij trainen levert nooit een strike op.';
  end if;
  return new;
end;
$function$;

revoke execute on function tmc.reject_vrij_trainen_strike() from public, anon, authenticated, service_role;

create trigger no_show_strikes_reject_vrij_trainen
  before insert or update of booking_id on tmc.no_show_strikes
  for each row execute function tmc.reject_vrij_trainen_strike();

-- Een vrij-trainen-sessie mag niet zo verschuiven of krimpen dat geboekte
-- slots erbuiten vallen (ook niet via een directe admin-update).
create function tmc.guard_vrij_trainen_session_bounds()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
begin
  if old.pillar = 'vrij_trainen'
     and (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at)
     and exists (
       select 1 from tmc.bookings b
       where b.session_id = old.id
         and b.status = 'booked'
         and (b.slot_start_at < new.start_at or b.slot_end_at > new.end_at)
     ) then
    raise exception 'vrij_trainen_slots_outside_session' using errcode = 'P0001',
      hint = 'Er staan geboekte slots buiten de nieuwe tijden.';
  end if;
  return new;
end;
$function$;

revoke execute on function tmc.guard_vrij_trainen_session_bounds() from public, anon, authenticated, service_role;

create trigger class_sessions_vrij_trainen_bounds
  before update of start_at, end_at on tmc.class_sessions
  for each row execute function tmc.guard_vrij_trainen_session_bounds();

-- 5a. book_class_session ------------------------------------------------------
-- Live rechten voor de wijziging: postgres, authenticated.
-- Nieuwe parameters p_slot_start_at en p_slot_minutes (default null), zodat
-- bestaande aanroepen met drie benoemde argumenten blijven werken.

drop function tmc.book_class_session(uuid, boolean, boolean);

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
  v_waitlist_confirmed int := 0;
  v_is_vrij boolean;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_effective_start timestamptz;
  v_peak int;
  v_blocked boolean;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Lock op de sessie-rij: serialiseert capaciteits- en slotchecks en pint
  -- de status/start_at vast voor de duur van deze transactie.
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
  v_session_date := (v_session.start_at at time zone 'utc')::date;
  v_iso_week := extract(week from v_session_date)::int;
  v_iso_year := extract(isoyear from v_session_date)::int;

  -- Slot: verplicht op vrij trainen, verboden op andere pillars.
  v_is_vrij := v_session.pillar = 'vrij_trainen';
  if v_is_vrij then
    if p_slot_start_at is null or p_slot_minutes is null then
      return jsonb_build_object('ok', false, 'reason', 'slot_required');
    end if;
    if p_slot_minutes not in (30, 45, 60, 75, 90)
       or mod(extract(epoch from p_slot_start_at), 900) <> 0 then
      return jsonb_build_object('ok', false, 'reason', 'slot_invalid');
    end if;
    v_slot_start := p_slot_start_at;
    v_slot_end := p_slot_start_at + make_interval(mins => p_slot_minutes);
    if v_slot_start < v_session.start_at or v_slot_end > v_session.end_at then
      return jsonb_build_object('ok', false, 'reason', 'slot_outside_session');
    end if;
  elsif p_slot_start_at is not null or p_slot_minutes is not null then
    return jsonb_build_object('ok', false, 'reason', 'slot_not_allowed');
  end if;

  -- Vrij trainen rekent venster en verleden vanaf het slot, niet vanaf de
  -- dagsessie (anders is om 07:00 de hele dag dicht).
  v_effective_start := coalesce(v_slot_start, v_session.start_at);

  -- Checks in dezelfde volgorde als canBook() (src/lib/member/can-book.ts).
  if v_profile_age <> v_session.age_category then
    return jsonb_build_object('ok', false, 'reason', 'age_mismatch');
  end if;

  if v_effective_start > now() + make_interval(days => v_settings.booking_window_days) then
    return jsonb_build_object('ok', false, 'reason', 'booking_window_closed');
  end if;

  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;

  if v_effective_start <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Dubbelboeking: expliciete check; de partiele unique index
  -- bookings_profile_session_active_key vangt de race af.
  if exists (
    select 1 from tmc.bookings
    where profile_id = v_uid and session_id = p_session_id
      and status in ('booked', 'waitlisted')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end if;

  -- Capaciteit, geteld onder de sessie-lock. NULL betekent onbeperkt (ook
  -- vrij trainen: daar geldt de slotgrens hieronder).
  if v_session.capacity is not null then
    if tmc.session_occupancy(p_session_id) >= v_session.capacity then
      return jsonb_build_object(
        'ok', false, 'reason', 'capacity_full', 'can_join_waitlist', true);
    end if;
  end if;

  -- Slotgrens vrij trainen, onder dezelfde sessie-lock. Geen wachtlijst.
  if v_is_vrij then
    select p.peak, p.blocked into v_peak, v_blocked
    from tmc.vrij_trainen_slot_peak(p_session_id, v_slot_start, v_slot_end) p;
    if v_blocked then
      return jsonb_build_object('ok', false, 'reason', 'slot_blocked');
    end if;
    if v_peak >= v_settings.vrij_trainen_max_concurrent then
      return jsonb_build_object('ok', false, 'reason', 'slot_full');
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

  -- Daily fair-use cap. Vrij trainen telt niet mee en wordt er ook niet door
  -- geweigerd (besluit 4); een per dag volgt al uit sessie plus unique index.
  if not v_is_vrij then
    select count(*) into v_same_day_count
    from tmc.bookings
    where profile_id = v_uid and status = 'booked'
      and session_date = v_session_date
      and pillar <> 'vrij_trainen';
    if v_same_day_count >= v_settings.fair_use_daily_max then
      return jsonb_build_object('ok', false, 'reason', 'daily_cap_reached');
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
      membership_id, credits_used, status, rental_mat, rental_towel,
      slot_start_at, slot_end_at
    ) values (
      v_uid, p_session_id, v_session_date, v_session.pillar, v_iso_week, v_iso_year,
      v_covering.id, v_credits_used, 'booked', v_rental_mat, v_rental_towel,
      v_slot_start, v_slot_end
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

  if v_credits_used > 0 then
    -- Rij is hierboven gelockt; de guard houdt credits >= 0.
    update tmc.memberships
    set credits_remaining = credits_remaining - v_credits_used
    where id = v_covering.id
      and coalesce(credits_remaining, 0) >= v_credits_used;
    if not found then
      raise exception 'Geen credits meer beschikbaar.' using errcode = 'P0001';
    end if;
  end if;

  -- Waitlist-resolutie (20260814): een geslaagde boeking lost de eigen
  -- open wachtlijst-entry voor deze sessie op, in dezelfde transactie als
  -- de insert.
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
    'credits_used', v_credits_used,
    'pillar', v_session.pillar,
    'session_date', v_session_date,
    'slot_start_at', v_slot_start,
    'slot_end_at', v_slot_end,
    'waitlist_confirmed', v_waitlist_confirmed > 0
  );
end;
$function$;

revoke execute on function tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer) from public, anon, service_role;
grant execute on function tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer) to authenticated;

-- 5b. cancel_class_booking ----------------------------------------------------
-- Live rechten voor de wijziging: postgres, authenticated.
-- Wijziging: de termijn (en de kosteloze annulering na verschuiving) rekent
-- voor vrij trainen vanaf slot_start_at.

drop function tmc.cancel_class_booking(uuid);

create function tmc.cancel_class_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_booking tmc.bookings%rowtype;
  v_start_at timestamptz;
  v_rescheduled_at timestamptz;
  v_within_window boolean;
  v_free_after_reschedule boolean;
  v_credits_refunded boolean := false;
  v_cancel_hours int;
  v_vrij_minutes int;
  v_refund jsonb;
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

  select start_at, rescheduled_at into v_start_at, v_rescheduled_at
  from tmc.class_sessions where id = v_booking.session_id;
  if v_start_at is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  -- Vrij trainen: het eigen slot is de starttijd, niet de dagsessie.
  v_start_at := coalesce(v_booking.slot_start_at, v_start_at);

  -- Vrij trainen heeft een veel soepeler venster dan groepslessen.
  if v_booking.pillar = 'vrij_trainen' then
    v_within_window := v_start_at - now() >= make_interval(mins => v_vrij_minutes);
  else
    v_within_window := v_start_at - now() >= make_interval(hours => v_cancel_hours);
  end if;

  -- Verschoven les (session-overrides): wie boekte voor de verschuiving mag
  -- tot de nieuwe starttijd kosteloos annuleren.
  v_free_after_reschedule := v_rescheduled_at is not null
    and v_booking.booked_at < v_rescheduled_at
    and now() < v_start_at;

  update tmc.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = case
        when v_within_window then 'within_window'
        when v_free_after_reschedule then 'rescheduled'
        else 'late' end
  where id = p_booking_id;

  if (v_within_window or v_free_after_reschedule)
     and v_booking.credits_used > 0 and v_booking.membership_id is not null then
    -- Via de gedeelde kern: lockt membership en boeking, zet credits_used op
    -- 0 en schrijft credits.adjusted in dezelfde transactie.
    v_refund := tmc.apply_credit_adjustment(
      v_booking.membership_id, v_booking.credits_used,
      case when v_within_window then 'Annulering binnen de termijn'
           else 'Annulering na verschuiving van de les' end,
      'refund', 'member', v_uid, p_booking_id, 'tmc_booking');
    v_credits_refunded := coalesce((v_refund ->> 'ok')::boolean, false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_booking.session_id,
    'pillar', v_booking.pillar,
    'within_window', v_within_window or v_free_after_reschedule,
    'free_after_reschedule', v_free_after_reschedule and not v_within_window,
    'credits_refunded', v_credits_refunded
  );
end;
$function$;

revoke execute on function tmc.cancel_class_booking(uuid) from public, anon, service_role;
grant execute on function tmc.cancel_class_booking(uuid) to authenticated;

-- 5c. book_guest_session ------------------------------------------------------
-- Live rechten voor de wijziging: postgres, authenticated.
-- Wijziging: vrij trainen weigert gasten (session_not_eligible).

drop function tmc.book_guest_session(uuid, uuid, text, text);

create function tmc.book_guest_session(
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
  -- Vrij trainen staat geen gasten toe (spec-vrij-trainen-slots.md); de
  -- trigger guest_bookings_reject_vrij_trainen is de backstop.
  if v_session.pillar = 'vrij_trainen' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_eligible');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Capaciteit onder de sessie-lock, via de gedeelde telling.
  -- capacity null = onbeperkt: nooit vol.
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

revoke execute on function tmc.book_guest_session(uuid, uuid, text, text) from public, anon, service_role;
grant execute on function tmc.book_guest_session(uuid, uuid, text, text) to authenticated;

-- 5d. admin_reschedule_class_session ------------------------------------------
-- Live rechten voor de wijziging: postgres, authenticated, service_role.
-- Wijziging: vrij-trainen-sessies weigeren (vrij_trainen_not_reschedulable);
-- een dag annuleren blijft mogelijk via cancel_class_session_core.

drop function tmc.admin_reschedule_class_session(uuid, timestamptz, integer);

create function tmc.admin_reschedule_class_session(
  p_session_id uuid,
  p_new_start_at timestamptz,
  p_duration_min integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_session tmc.class_sessions%rowtype;
  v_duration int;
  v_new_end timestamptz;
  v_new_date date;
  v_bookings jsonb;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;
  if p_new_start_at is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_start');
  end if;

  select * into v_session from tmc.class_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  -- Vrij trainen: de dagsessie draagt geboekte slots; verschuiven zou die
  -- buiten de sessie laten vallen (spec-vrij-trainen-slots.md).
  if v_session.pillar = 'vrij_trainen' then
    return jsonb_build_object('ok', false, 'reason', 'vrij_trainen_not_reschedulable');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'not_scheduled');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_started');
  end if;
  if exists (select 1 from tmc.check_ins where session_id = p_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'has_check_ins');
  end if;
  if p_new_start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'new_start_in_past');
  end if;
  if (p_new_start_at at time zone 'Europe/Amsterdam')::date
     <> (v_session.start_at at time zone 'Europe/Amsterdam')::date then
    return jsonb_build_object('ok', false, 'reason', 'different_day');
  end if;

  v_duration := coalesce(
    p_duration_min,
    round(extract(epoch from (v_session.end_at - v_session.start_at)) / 60)::int);
  if v_duration is null or v_duration < 5 or v_duration > 600 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_duration');
  end if;
  v_new_end := p_new_start_at + make_interval(mins => v_duration);

  if p_new_start_at = v_session.start_at and v_new_end = v_session.end_at then
    return jsonb_build_object('ok', false, 'reason', 'no_change');
  end if;

  update tmc.class_sessions
  set start_at = p_new_start_at, end_at = v_new_end,
      rescheduled_at = now(), rescheduled_by = v_uid
  where id = p_session_id;

  v_new_date := (p_new_start_at at time zone 'utc')::date;

  -- Herinnering: al verstuurd met de oude tijd en de nieuwe start valt nog
  -- buiten het herinneringsvenster (21 tot 25 uur)? Dan stempel wissen, zodat
  -- de cron later een herinnering met de juiste tijd stuurt. Valt de nieuwe
  -- start binnen 25 uur, dan dekt de wijzigingsmail het en krijgt het lid
  -- geen tweede mail direct erachteraan.
  with upd as (
    update tmc.bookings
    set session_date = v_new_date,
        iso_week = extract(week from v_new_date)::int,
        iso_year = extract(isoyear from v_new_date)::int,
        reminder_sent_at = case
          when reminder_sent_at is not null and p_new_start_at - now() > interval '25 hours' then null
          else reminder_sent_at end
    where session_id = p_session_id
    returning id, profile_id, status
  )
  select coalesce(jsonb_agg(jsonb_build_object('booking_id', id, 'profile_id', profile_id))
                  filter (where status = 'booked'), '[]'::jsonb)
  into v_bookings from upd;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values ('session.rescheduled', 'admin', v_uid, 'session', p_session_id,
    jsonb_build_object('session_id', p_session_id,
      'old_start_at', v_session.start_at, 'old_end_at', v_session.end_at,
      'new_start_at', p_new_start_at, 'new_end_at', v_new_end,
      'occurrence_start_at', v_session.occurrence_start_at,
      'affected_booking_count', jsonb_array_length(v_bookings)));

  return jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'old_start_at', v_session.start_at, 'old_end_at', v_session.end_at,
    'new_start_at', p_new_start_at, 'new_end_at', v_new_end,
    'bookings', v_bookings);
end;
$function$;

revoke execute on function tmc.admin_reschedule_class_session(uuid, timestamptz, integer) from public, anon;
grant execute on function tmc.admin_reschedule_class_session(uuid, timestamptz, integer) to authenticated, service_role;

-- 6. Beschikbaarheid per kwartier ---------------------------------------------
-- Voor de slotkiezer (volgende PR). Alleen tellingen, geen persoonsgegevens.
-- SECURITY DEFINER omdat RLS leden alleen de eigen boekingen laat lezen.

create function tmc.vrij_trainen_availability(p_date date)
returns table (
  session_id uuid,
  quarter_start timestamptz,
  booked integer,
  available integer,
  blocked boolean
)
language plpgsql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_max int;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select coalesce(bs.vrij_trainen_max_concurrent, 5) into v_max
  from tmc.booking_settings bs limit 1;
  v_max := coalesce(v_max, 5);

  return query
  select
    cs.id,
    q.qs,
    p.peak,
    case when p.blocked then 0 else greatest(v_max - p.peak, 0) end,
    p.blocked
  from tmc.class_sessions cs
  cross join lateral generate_series(
    cs.start_at, cs.end_at - interval '15 minutes', interval '15 minutes') as q(qs)
  cross join lateral tmc.vrij_trainen_slot_peak(
    cs.id, q.qs, q.qs + interval '15 minutes') p
  where cs.pillar = 'vrij_trainen'
    and cs.status = 'scheduled'
    and (cs.start_at at time zone 'Europe/Amsterdam')::date = p_date
  order by cs.start_at, q.qs;
end;
$function$;

revoke execute on function tmc.vrij_trainen_availability(date) from public, anon, service_role;
grant execute on function tmc.vrij_trainen_availability(date) to authenticated;

-- 7. Templates voor de dagsessie ----------------------------------------------
-- Volgens opening_hours (besluit 2): ma-vr 07:00-21:00, za 08:00-14:00,
-- zondag geen sessie. day_of_week 0 = zondag. Capacity null, class_type
-- vrij-trainen-dag, trainer Marlon. Voorwaardelijk (README regel 6): op een
-- lege shadow-database bestaan class_type en trainer niet en is dit een
-- no-op. De generate-sessions-cron materialiseert de sessies.

insert into tmc.schedule_templates (
  name, class_type_id, trainer_id, day_of_week, start_time, duration_minutes,
  capacity, valid_from, is_active, blocks_free_training
)
select 'Vrij trainen', ct.id, t.id, d.dow, d.start_time, d.minutes,
       null, current_date, true, false
from (values
  (1, time '07:00', 840),
  (2, time '07:00', 840),
  (3, time '07:00', 840),
  (4, time '07:00', 840),
  (5, time '07:00', 840),
  (6, time '08:00', 360)
) as d(dow, start_time, minutes)
join tmc.class_types ct on ct.slug = 'vrij-trainen-dag' and ct.pillar = 'vrij_trainen'
join tmc.trainers t on t.id = 'cf17f988-c44c-4530-b507-0716ace774ed'
where not exists (
  select 1 from tmc.schedule_templates st
  where st.class_type_id = ct.id and st.day_of_week = d.dow and st.is_active
);

-- Zelfcontrole ----------------------------------------------------------------

do $$
declare
  r record;
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'tmc.bookings'::regclass
               and conname = 'bookings_profile_id_session_id_key') then
    raise exception 'vrij_trainen_slots: oude unique constraint staat er nog';
  end if;

  -- Rechten per functie: verwacht (functie, rol, mag).
  for r in
    select * from (values
      ('tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer)', 'authenticated', true),
      ('tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer)', 'anon', false),
      ('tmc.book_class_session(uuid, boolean, boolean, timestamptz, integer)', 'service_role', false),
      ('tmc.cancel_class_booking(uuid)', 'authenticated', true),
      ('tmc.cancel_class_booking(uuid)', 'anon', false),
      ('tmc.cancel_class_booking(uuid)', 'service_role', false),
      ('tmc.book_guest_session(uuid, uuid, text, text)', 'authenticated', true),
      ('tmc.book_guest_session(uuid, uuid, text, text)', 'anon', false),
      ('tmc.book_guest_session(uuid, uuid, text, text)', 'service_role', false),
      ('tmc.admin_reschedule_class_session(uuid, timestamptz, integer)', 'authenticated', true),
      ('tmc.admin_reschedule_class_session(uuid, timestamptz, integer)', 'service_role', true),
      ('tmc.admin_reschedule_class_session(uuid, timestamptz, integer)', 'anon', false),
      ('tmc.vrij_trainen_availability(date)', 'authenticated', true),
      ('tmc.vrij_trainen_availability(date)', 'anon', false),
      ('tmc.vrij_trainen_availability(date)', 'service_role', false),
      ('tmc.vrij_trainen_slot_peak(uuid, timestamptz, timestamptz, uuid)', 'authenticated', false),
      ('tmc.vrij_trainen_slot_peak(uuid, timestamptz, timestamptz, uuid)', 'anon', false),
      ('tmc.enforce_vrij_trainen_slot()', 'authenticated', false),
      ('tmc.reject_vrij_trainen_visitor()', 'authenticated', false),
      ('tmc.reject_vrij_trainen_strike()', 'authenticated', false),
      ('tmc.guard_vrij_trainen_session_bounds()', 'authenticated', false)
    ) as v(fn, role, allowed)
  loop
    if has_function_privilege(r.role, r.fn::regprocedure, 'EXECUTE') <> r.allowed then
      raise exception 'vrij_trainen_slots: EXECUTE van % op % is niet %', r.role, r.fn, r.allowed;
    end if;
  end loop;

  -- PUBLIC mag geen van de gewijzigde of nieuwe functies uitvoeren.
  if exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'tmc'::regnamespace
      and p.proname in ('book_class_session', 'cancel_class_booking', 'book_guest_session',
                        'admin_reschedule_class_session', 'vrij_trainen_availability',
                        'vrij_trainen_slot_peak', 'enforce_vrij_trainen_slot',
                        'reject_vrij_trainen_visitor', 'reject_vrij_trainen_strike',
                        'guard_vrij_trainen_session_bounds')
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'vrij_trainen_slots: PUBLIC heeft EXECUTE op een functie';
  end if;
end;
$$;
