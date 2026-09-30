-- feat/vrij-trainen-slotkiezer
--
-- Vervolg op 20260930090000_vrij_trainen_slots.sql (PR #245), zie
-- spec-vrij-trainen-slots.md:
--   1. booking_settings.vrij_trainen_booking_enabled (default false): de
--      enige schakelaar tussen de slotkiezer en de check-in-weergave op
--      /app/vrij-trainen. check_in_pillars blijft ongewijzigd.
--   2. opening_hours: zondag 08:00-14:00 (was gesloten) en maandag tot en
--      met vrijdag 07:00-22:00 (was 07:00-21:00), besloten toegangstijd voor
--      leden. De Akiles-sync leidt het standaardschema van de deur hieruit
--      af. De vrij-trainen-templates blijven ma-vr 07:00-21:00.
--   3. Vrij-trainen-template voor zondag, gelijk aan zaterdag.
--   4. enforce_vrij_trainen_slot controleert ook bij 'waitlisted' de pillar
--      en de grenzen van het slot; de grens per kwartier blijft alleen voor
--      'booked'. Drop en recreate op basis van de live definitie
--      (pg_get_functiondef, 2026-09-30), rechten hersteld zoals ze live
--      stonden: alleen postgres.
--
-- Alles voorwaardelijk (README regel 6): op een lege shadow-database raken
-- de updates en de template-insert nul rijen.

-- 1. Boekmodus-schakelaar -----------------------------------------------------

alter table tmc.booking_settings
  add column vrij_trainen_booking_enabled boolean not null default false;

comment on column tmc.booking_settings.vrij_trainen_booking_enabled is
  'Aan: /app/vrij-trainen toont de slotkiezer. Uit: de check-in-weergave. Staat los van check_in_pillars.';

-- 2. Openingstijden -----------------------------------------------------------
-- weekday 0 = zondag (JS getDay-conventie, zie src/lib/access/schedule.ts).

update tmc.opening_hours
set is_closed = false, opens_at = time '08:00', closes_at = time '14:00', updated_at = now()
where weekday = 0;

update tmc.opening_hours
set closes_at = time '22:00', updated_at = now()
where weekday between 1 and 5
  and not is_closed;

-- 3. Zondagtemplate vrij trainen ----------------------------------------------
-- Gelijk aan zaterdag: 08:00, 360 minuten, capacity null, Marlon,
-- blocks_free_training false. Geen tweede actieve template voor zondag.

insert into tmc.schedule_templates (
  name, class_type_id, trainer_id, day_of_week, start_time, duration_minutes,
  capacity, valid_from, is_active, blocks_free_training
)
select 'Vrij trainen', ct.id, t.id, 0, time '08:00', 360,
       null, current_date, true, false
from tmc.class_types ct
join tmc.trainers t on t.id = 'cf17f988-c44c-4530-b507-0716ace774ed'
where ct.slug = 'vrij-trainen-dag' and ct.pillar = 'vrij_trainen'
  and not exists (
    select 1 from tmc.schedule_templates st
    where st.class_type_id = ct.id and st.day_of_week = 0 and st.is_active
  );

-- 4. enforce_vrij_trainen_slot ------------------------------------------------

drop trigger bookings_enforce_vrij_trainen_slot on tmc.bookings;
drop function tmc.enforce_vrij_trainen_slot();

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
  -- Alleen rijen die een plek innemen (booked) of kunnen gaan innemen
  -- (waitlisted) hebben een geldig slot nodig.
  if new.status not in ('booked', 'waitlisted') then
    return new;
  end if;

  -- Een rij die van status, sessie en slot niet wisselt, is al gecontroleerd.
  -- waitlisted naar booked valt hier dus niet onder en wordt geteld.
  if tg_op = 'UPDATE'
     and old.status = new.status
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

  -- De grens per kwartier geldt alleen voor rijen die een plek innemen.
  if new.status = 'waitlisted' then
    return new;
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

-- Zelfcontrole ----------------------------------------------------------------

do $$
declare
  r record;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'tmc' and table_name = 'booking_settings'
      and column_name = 'vrij_trainen_booking_enabled' and column_default = 'false'
  ) then
    raise exception 'vrij_trainen_slotkiezer: kolom vrij_trainen_booking_enabled ontbreekt of heeft geen default false';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'bookings_enforce_vrij_trainen_slot') then
    raise exception 'vrij_trainen_slotkiezer: trigger bookings_enforce_vrij_trainen_slot ontbreekt';
  end if;

  for r in select * from (values ('anon'), ('authenticated'), ('service_role')) as v(role) loop
    if has_function_privilege(r.role, 'tmc.enforce_vrij_trainen_slot()', 'EXECUTE') then
      raise exception 'vrij_trainen_slotkiezer: % heeft EXECUTE op enforce_vrij_trainen_slot', r.role;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'tmc.enforce_vrij_trainen_slot()'::regprocedure
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'vrij_trainen_slotkiezer: PUBLIC heeft EXECUTE op enforce_vrij_trainen_slot';
  end if;
end;
$$;
