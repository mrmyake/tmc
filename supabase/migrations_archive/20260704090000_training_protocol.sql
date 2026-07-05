-- Trainingsprotocol PR 1 (spec-trainingsprotocol.md): volledig datamodel
-- voor schema's (Overload-model) plus logging, in schema tmc.
--
-- Zes tabellen in 1 migratie zodat het schema in een keer compleet en
-- getest is; de schrijf-RPC's voor logging komen bewust pas in PR 4.
-- Members lezen uitsluitend hun eigen actieve programma via RLS; alle
-- schrijfpaden lopen buiten RLS om (admin client in cockpit-actions,
-- later SECURITY DEFINER RPC's voor logging). Er zijn dus bewust geen
-- schrijf-policies en ook geen admin-RLS-policies: de cockpit gebruikt
-- de service-role client, die RLS passeert.
--
-- LET OP (schema-drift, bekend risico): geschreven tegen het LIVE
-- tmc-schema (profiles-kolommen en huisstijl van policies gelezen via
-- de Supabase MCP), niet tegen de historische public.*-bestanden.

-- ---------------------------------------------------------------------------
-- 1. exercises: de oefeningenbibliotheek van Marlon
-- ---------------------------------------------------------------------------

create table tmc.exercises (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  video_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Case-insensitive uniek: "leg press" en "Leg Press" zijn hetzelfde.
create unique index exercises_name_lower_idx on tmc.exercises (lower(name));

-- ---------------------------------------------------------------------------
-- 2. training_programs: 1 schema per klant per versie
-- ---------------------------------------------------------------------------

create table tmc.training_programs (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references tmc.profiles(id) on delete cascade,
  version      integer not null,
  status       text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  title        text,
  notes        text,
  activated_at timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (profile_id, version)
);

-- Kern-invariant: precies 1 actief schema per klant, op databaseniveau.
create unique index training_programs_one_active_idx
  on tmc.training_programs (profile_id)
  where status = 'active';

create index training_programs_profile_idx
  on tmc.training_programs (profile_id);

-- ---------------------------------------------------------------------------
-- 3. program_days
-- ---------------------------------------------------------------------------

create table tmc.program_days (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references tmc.training_programs(id) on delete cascade,
  day_number integer not null,
  label      text,
  unique (program_id, day_number)
);

-- ---------------------------------------------------------------------------
-- 4. program_exercises: oefening in een superset-slot
-- ---------------------------------------------------------------------------

create table tmc.program_exercises (
  id                 uuid primary key default gen_random_uuid(),
  day_id             uuid not null references tmc.program_days(id) on delete cascade,
  slot               text not null check (slot ~ '^[A-E][12]$'),
  exercise_id        uuid not null references tmc.exercises(id),
  sets               integer not null check (sets > 0),
  reps_min           integer not null,
  reps_max           integer not null,
  -- Tempo als 4 losse velden; 0 betekent explosief en wordt in de UI als
  -- "X" getoond (bv. "41X0").
  tempo_eccentric    integer not null check (tempo_eccentric >= 0),
  tempo_pause_bottom integer not null check (tempo_pause_bottom >= 0),
  tempo_concentric   integer not null check (tempo_concentric >= 0),
  tempo_pause_top    integer not null check (tempo_pause_top >= 0),
  rest_seconds       integer not null,
  notes              text,
  unique (day_id, slot),
  check (reps_min <= reps_max)
);

create index program_exercises_exercise_idx
  on tmc.program_exercises (exercise_id);

-- ---------------------------------------------------------------------------
-- 5. workout_sessions (logging, schrijf-RPC's volgen in PR 4)
-- ---------------------------------------------------------------------------

-- program_id/day_id bewust ZONDER cascade: historie moet archivering en
-- eventuele opschoning overleven; alleen drafts zijn verwijderbaar en
-- daar wordt nooit tegen gelogd.
create table tmc.workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references tmc.profiles(id) on delete cascade,
  program_id   uuid not null references tmc.training_programs(id),
  day_id       uuid not null references tmc.program_days(id),
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index workout_sessions_profile_idx on tmc.workout_sessions (profile_id);
create index workout_sessions_program_idx on tmc.workout_sessions (program_id);

-- ---------------------------------------------------------------------------
-- 6. set_logs
-- ---------------------------------------------------------------------------

create table tmc.set_logs (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references tmc.workout_sessions(id) on delete cascade,
  program_exercise_id uuid not null references tmc.program_exercises(id),
  set_number          integer not null,
  weight_kg           numeric(5,2) not null,
  reps                integer not null,
  notes               text,
  unique (session_id, program_exercise_id, set_number)
);

create index set_logs_program_exercise_idx
  on tmc.set_logs (program_exercise_id);

-- ---------------------------------------------------------------------------
-- RLS: members lezen alleen hun eigen actieve schema plus eigen logs.
-- Geen schrijf-policies; geen admin-policies (cockpit = service-role).
-- ---------------------------------------------------------------------------

alter table tmc.exercises enable row level security;
alter table tmc.training_programs enable row level security;
alter table tmc.program_days enable row level security;
alter table tmc.program_exercises enable row level security;
alter table tmc.workout_sessions enable row level security;
alter table tmc.set_logs enable row level security;

-- Bibliotheek is leesbaar voor elk ingelogd lid (nodig om het schema te
-- renderen), maar alleen actieve oefeningen. Expliciet `to authenticated`:
-- deze tabel heeft geen eigenaarschaps-qual, dus zonder rolbeperking zou
-- ook anon kunnen lezen.
create policy exercises_member_read on tmc.exercises
  for select to authenticated
  using (is_active = true);

-- Alleen het eigen actieve programma; drafts en archived zijn onzichtbaar.
create policy training_programs_self_active_read on tmc.training_programs
  for select to authenticated
  using (profile_id = auth.uid() and status = 'active');

create policy program_days_self_active_read on tmc.program_days
  for select to authenticated
  using (
    exists (
      select 1 from tmc.training_programs p
      where p.id = program_id
        and p.profile_id = auth.uid()
        and p.status = 'active'
    )
  );

create policy program_exercises_self_active_read on tmc.program_exercises
  for select to authenticated
  using (
    exists (
      select 1
      from tmc.program_days d
      join tmc.training_programs p on p.id = d.program_id
      where d.id = day_id
        and p.profile_id = auth.uid()
        and p.status = 'active'
    )
  );

-- Log-historie blijft voor de klant zelf altijd zichtbaar, ook wanneer er
-- tegen een inmiddels gearchiveerde versie is gelogd (spec, besluit 4).
create policy workout_sessions_self_read on tmc.workout_sessions
  for select to authenticated
  using (profile_id = auth.uid());

create policy set_logs_self_read on tmc.set_logs
  for select to authenticated
  using (
    exists (
      select 1 from tmc.workout_sessions s
      where s.id = session_id
        and s.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants: het tmc-schema heeft GEEN default privileges voor authenticated
-- op nieuwe tabellen (live geverifieerd: zonder deze grants geeft elke
-- REST-call 42501 permission denied, nog voordat RLS uberhaupt evalueert).
-- Alleen SELECT en alleen voor authenticated: rijen-scoping doet RLS,
-- schrijven loopt via de service-role (die zijn eigen default grants heeft).
-- Bewust niets voor anon.
-- ---------------------------------------------------------------------------

grant select on
  tmc.exercises,
  tmc.training_programs,
  tmc.program_days,
  tmc.program_exercises,
  tmc.workout_sessions,
  tmc.set_logs
to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: de oefeningen uit het huidige Overload-voorbeeldschema.
-- Idempotent via de lower(name)-unique (patroon: crowdfunding_tables).
-- ---------------------------------------------------------------------------

insert into tmc.exercises (name)
values
  ('Leg Press'),
  ('Standing Barbell Press'),
  ('Seated Pulley Row'),
  ('Dumbbell Press'),
  ('Front Squat'),
  ('Leg Curl'),
  ('Dips'),
  ('Bent-Over Barbell Row'),
  ('Standing Dumbbell Press'),
  ('Sit-Ups')
on conflict ((lower(name))) do nothing;
