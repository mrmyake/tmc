-- Trainingshistorie, leeslaag (spec-trainingsprotocol.md PR 5 vervolg,
-- feat/trainingshistorie). Doel: een lid, een trainer (eigen klant) en
-- admin kunnen de volledige set_logs-historie van een lid lezen, ook
-- tegen een gearchiveerde schemaversie, zonder SECURITY DEFINER.
--
-- Inhoud:
--   1. Drie SELECT-policies ("self_logged_read") op program_days,
--      training_programs en program_exercises: leesbaar als er een eigen
--      workout_sessions- of set_logs-rij naar verwijst, naast de
--      bestaande "self_active_read"-policies (RLS OR't permissive
--      policies samen, dus dit is een uitbreiding, geen vervanging).
--   2. exercises_member_read verruimd: ook leesbaar als het lid de
--      oefening ooit gelogd heeft, ook als is_active intussen false is.
--   3. View tmc.set_log_history, security invoker, platte rij per
--      gelogde set met sessie/programma/dag/oefening erbij. Alleen
--      afgeronde sessies (completed_at is not null). Bevat GEEN sessies
--      zonder sets (inner joins); de sessie-lijst zelf (ook lege,
--      afgeronde sessies) komt uit een rechtstreekse select op
--      workout_sessions met de policies uit stap 1, niet uit deze view.
--   4. Twee indexen op workout_sessions voor de nieuwe leespaden.
--
-- Geen functies, geen SECURITY DEFINER. Schema uitsluitend tmc.

-- ---------------------------------------------------------------------------
-- 1. self_logged_read policies
-- ---------------------------------------------------------------------------

create policy "program_days_self_logged_read" on tmc.program_days
  for select to authenticated
  using (
    exists (
      select 1
      from tmc.workout_sessions s
      where s.day_id = program_days.id
        and s.profile_id = auth.uid()
    )
  );

create policy "training_programs_self_logged_read" on tmc.training_programs
  for select to authenticated
  using (
    exists (
      select 1
      from tmc.workout_sessions s
      where s.program_id = training_programs.id
        and s.profile_id = auth.uid()
    )
  );

-- Bewust beperkt tot program_exercises die ook echt gelogd zijn (via
-- set_logs), niet elke oefening van een gearchiveerde dag: dat geeft
-- weergave 3 (per workout) de slot en doelwaarden van gelogde oefeningen
-- in slotvolgorde, zonder de volledige, ongelogde inhoud van een oud
-- schema vrij te geven.
create policy "program_exercises_self_logged_read" on tmc.program_exercises
  for select to authenticated
  using (
    exists (
      select 1
      from tmc.set_logs l
      join tmc.workout_sessions s on s.id = l.session_id
      where l.program_exercise_id = program_exercises.id
        and s.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. exercises_member_read verruimen
-- ---------------------------------------------------------------------------

alter policy "exercises_member_read" on tmc.exercises
  using (
    is_active = true
    or exists (
      select 1
      from tmc.set_logs l
      join tmc.workout_sessions s on s.id = l.session_id
      where l.exercise_id = exercises.id
        and s.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. View tmc.set_log_history
-- ---------------------------------------------------------------------------

create view tmc.set_log_history
  with (security_invoker = true)
as
select
  s.id as session_id,
  s.profile_id,
  s.started_at,
  s.completed_at,
  p.id as program_id,
  p.version as program_version,
  p.status as program_status,
  d.id as day_id,
  d.day_number,
  d.label as day_label,
  pe.id as program_exercise_id,
  pe.slot,
  pe.sets as target_sets,
  pe.reps_min,
  pe.reps_max,
  e.id as exercise_id,
  e.name as exercise_name,
  l.set_number,
  l.weight_kg,
  l.reps,
  l.notes
from tmc.set_logs l
join tmc.workout_sessions s on s.id = l.session_id
join tmc.training_programs p on p.id = s.program_id
join tmc.program_days d on d.id = s.day_id
join tmc.program_exercises pe on pe.id = l.program_exercise_id
join tmc.exercises e on e.id = l.exercise_id
where s.completed_at is not null;

comment on view tmc.set_log_history is
  'Platte historie-rij per gelogde set (spec-trainingsprotocol.md PR 5 vervolg). Security invoker: leest onder de rechten van de aanroeper, dus RLS op de onderliggende tabellen filtert een lid vanzelf op zichzelf. Admin en trainer lezen via de service-role-client met een expliciete profile_id-filter in de querylaag (de view zelf heeft geen policy). Bevat uitsluitend afgeronde sessies en mist sessies zonder gelogde sets, zie punt 3 van de migratie-header.';

grant select on tmc.set_log_history to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Indexen
-- ---------------------------------------------------------------------------

create index "workout_sessions_day_idx" on tmc.workout_sessions (day_id);

create index "workout_sessions_profile_started_completed_idx"
  on tmc.workout_sessions (profile_id, started_at desc)
  where completed_at is not null;

-- ---------------------------------------------------------------------------
-- Asserties
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'tmc' and tablename = 'program_days'
      and policyname = 'program_days_self_logged_read'
  ) then
    raise exception 'program_days_self_logged_read ontbreekt';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tmc' and tablename = 'training_programs'
      and policyname = 'training_programs_self_logged_read'
  ) then
    raise exception 'training_programs_self_logged_read ontbreekt';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tmc' and tablename = 'program_exercises'
      and policyname = 'program_exercises_self_logged_read'
  ) then
    raise exception 'program_exercises_self_logged_read ontbreekt';
  end if;

  if not exists (
    select 1 from information_schema.views
    where table_schema = 'tmc' and table_name = 'set_log_history'
  ) then
    raise exception 'tmc.set_log_history ontbreekt';
  end if;

  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'tmc' and table_name = 'set_log_history'
      and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception 'authenticated mist SELECT op tmc.set_log_history';
  end if;
end $$;
