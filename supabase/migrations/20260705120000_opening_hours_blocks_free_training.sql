-- Recurrence-traject Fase 1 (tmc-sessies-recurrence-vrij-trainen.md, aangepast
-- plan zonder rrule): blocks_free_training op template + sessie, en
-- openingstijden naar Supabase zodat Marlon vakantieweken zelf kan doorvoeren.
--
-- Weekdag-conventie: 0-6 met 0 = zondag (JS getDay), identiek aan
-- schedule_templates.day_of_week; geverifieerd tegen amsterdamDayOfWeek() in
-- src/app/api/cron/generate-sessions/route.ts en DAY_LABEL in de admin-UI.

-- 1. Blokkeert-vrij-trainen vlag; default false (beslissing Ilja 2026-07-05).
-- Cron kopieert template -> sessie bij materialisatie; occurrence-override
-- loopt via het bestaande sessie-bewerkpad.
alter table tmc.schedule_templates
  add column blocks_free_training boolean not null default false;

alter table tmc.class_sessions
  add column blocks_free_training boolean not null default false;

comment on column tmc.schedule_templates.day_of_week is
  '0-6, 0 = zondag, 6 = zaterdag (JS getDay-conventie). Zelfde conventie als opening_hours.weekday.';

-- 2. Openingstijden: vaste 7-rijen-tabel (weekday als pk) + uitzonderingen
-- per datum (feestdagen, vakantieweken).
create table tmc.opening_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  updated_at timestamptz not null default now(),
  check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

comment on column tmc.opening_hours.weekday is
  '0-6, 0 = zondag, 6 = zaterdag (JS getDay-conventie). Zelfde conventie als schedule_templates.day_of_week.';

create table tmc.opening_hours_exceptions (
  id uuid primary key default gen_random_uuid(),
  date date unique not null,
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  note text,
  created_at timestamptz not null default now(),
  check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

-- 3. RLS: publieke read (patroon booking_settings), schrijven alleen admin.
alter table tmc.opening_hours enable row level security;

create policy opening_hours_public_read on tmc.opening_hours
  for select using (true);

create policy opening_hours_admin_all on tmc.opening_hours
  for all using (tmc.is_admin()) with check (tmc.is_admin());

alter table tmc.opening_hours_exceptions enable row level security;

create policy opening_hours_exceptions_public_read on tmc.opening_hours_exceptions
  for select using (true);

create policy opening_hours_exceptions_admin_all on tmc.opening_hours_exceptions
  for all using (tmc.is_admin()) with check (tmc.is_admin());

-- 4. Seed vanuit de actuele Sanity openingHours-data (live opgehaald
-- 2026-07-05): ma-vr 07:00-21:00, za 08:00-14:00, zo gesloten.
-- on conflict do nothing: een re-run overschrijft nooit door Marlon
-- aangepaste rijen.
insert into tmc.opening_hours (weekday, is_closed, opens_at, closes_at) values
  (0, true,  null,    null),    -- zondag: gesloten
  (1, false, '07:00', '21:00'), -- maandag
  (2, false, '07:00', '21:00'), -- dinsdag
  (3, false, '07:00', '21:00'), -- woensdag
  (4, false, '07:00', '21:00'), -- donderdag
  (5, false, '07:00', '21:00'), -- vrijdag
  (6, false, '08:00', '14:00')  -- zaterdag
on conflict (weekday) do nothing;
