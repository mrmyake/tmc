-- 20261031120000_schema_vorige_waarden.sql
--
-- feat/schema-vorige-waarden (discovery en akkoord 2026-10-31). Een lid
-- ziet in een nieuwe workout per set de waarden van vorige keer als
-- ghost values en vinkt een set af; alleen afgevinkte sets tellen mee in
-- de historie. Zie spec-trainingsprotocol.md, "Vervolg, vorige waarden".
--
-- Onderdelen (alle in schema tmc):
--   1. exercises: equipment (barbell, dumbbell, kettlebell, machine,
--      bodyweight; NULL = nog niet ingedeeld) en weight_step_kg (optionele
--      stapgrootte per oefening, overschrijft de standaard van het type).
--      Initiele classificatie op naam; twijfelgevallen blijven NULL en
--      deelt Marlon in via de admin.
--   2. program_exercises: start_weight_kg (optioneel startgewicht van de
--      coach; ghost value zolang er geen historie is).
--   3. set_logs: completed_at (NULL = draft, nooit in de historie) en
--      source ('previous' = ghost ongewijzigd overgenomen, 'edited' =
--      afwijkend; NULL = onbekend, zoals de rijen van voor deze migratie).
--      Backfill: elke bestaande rij was "opgeslagen = gedaan" en krijgt
--      completed_at van de sessie (anders started_at), source blijft NULL.
--   4. log_set: nieuwe parameters p_completed (default true) en p_source
--      (default null). De oude 6-argument-signature wordt gedropt, zodat
--      er geen dubbelzinnige overload overblijft; grants expliciet
--      hersteld. Een draft mag reps 0 hebben; een afgevinkte set niet.
--   5. duplicate_training_program: kopieert start_weight_kg mee (de
--      kolommenlijst staat daar expliciet).
--   6. set_log_history: filtert voortaan ook op l.completed_at is not
--      null. Security invoker en grants ongewijzigd (create or replace).
--   7. Asserties over de catalogi.
--
-- Geen supabase db push voor de merge van de PR. Migratie-entry 20260503
-- blijft onaangeraakt.

-- ---------------------------------------------------------------------------
-- 1. exercises
-- ---------------------------------------------------------------------------

alter table tmc.exercises
  add column equipment text null,
  add column weight_step_kg numeric(4,2) null;

alter table tmc.exercises
  add constraint exercises_equipment_check
    check (equipment in ('barbell', 'dumbbell', 'kettlebell', 'machine', 'bodyweight')),
  add constraint exercises_weight_step_kg_check
    check (weight_step_kg > 0);

comment on column tmc.exercises.equipment is
  'Type materiaal: barbell, dumbbell, kettlebell, machine of bodyweight. NULL = nog niet ingedeeld (Marlon via /app/admin/oefeningen). Bepaalt de editor in de workout-logger; zie src/lib/equipment.ts.';
comment on column tmc.exercises.weight_step_kg is
  'Optionele stapgrootte voor de gewicht-stepper. NULL = standaard van het type (src/lib/equipment.ts).';

-- Initiele classificatie: alleen waar het type eenduidig uit de naam
-- blijkt. Ab Wheel Rollout, Hip Thrust, Split Squat en Walking Lunge
-- blijven bewust NULL (besluit 2026-10-31), net als elke naam die hier
-- niet staat.
update tmc.exercises set equipment = 'machine' where equipment is null and name in (
  'Lat Pulldown', 'Seated Pulley Row', 'Tricep Pull Down', 'Leg Press',
  'Leg Extension', 'Leg Curl', 'Hack Squat', 'Cable Chest Fly',
  'Cable Crunch', 'Straight-Arm Pulldown'
);

update tmc.exercises set equipment = 'bodyweight' where equipment is null and name in (
  'Pull-Up', 'Chin-Up', 'Dips', 'Push-Up', 'Sit-Ups', 'Bird Dog', 'Dead Bug',
  'Hanging Knee Raise', 'Hanging Leg Raise', 'Russian Twist', 'Glute Bridge',
  'Plank', 'Side Plank'
);

update tmc.exercises set equipment = 'barbell' where equipment is null and name in (
  'Landmine Row', 'Back Squat', 'Front Squat', 'Bench Press',
  'Incline Bench Press', 'Deadlift', 'Sumo Deadlift', 'Trap Bar Deadlift',
  'Romanian Deadlift', 'Good Morning', 'Barbell Curl',
  'Bent-Over Barbell Row', 'Overhead Press (Barbell)',
  'Standing Barbell Press', 'Push Press', 'Strict Press'
);

update tmc.exercises set equipment = 'dumbbell' where equipment is null and name in (
  'Dumbbell Bench Press', 'Dumbbell Chest Fly', 'Dumbbell Curl',
  'Dumbbell Press', 'Dumbbell Row', 'Incline Dumbbell Press',
  'Overhead Press (Dumbbell)', 'Seated Dumbbell Press',
  'Standing Dumbbell Press', 'Arnold Press', 'Hammer Curl',
  'Lateral Raise', 'Side Raise'
);

-- ---------------------------------------------------------------------------
-- 2. program_exercises
-- ---------------------------------------------------------------------------

alter table tmc.program_exercises
  add column start_weight_kg numeric(5,2) null;

alter table tmc.program_exercises
  add constraint program_exercises_start_weight_kg_check
    check (start_weight_kg >= 0);

comment on column tmc.program_exercises.start_weight_kg is
  'Optioneel startgewicht van de coach. Ghost value in de workout-logger zolang het lid deze oefening nog nooit heeft afgevinkt.';

-- ---------------------------------------------------------------------------
-- 3. set_logs
-- ---------------------------------------------------------------------------

alter table tmc.set_logs
  add column completed_at timestamptz null,
  add column source text null;

alter table tmc.set_logs
  add constraint set_logs_source_check
    check (source in ('previous', 'edited'));

comment on column tmc.set_logs.completed_at is
  'Moment van afvinken. NULL = draft (waarden bewaard, set niet gedaan); drafts komen nooit in tmc.set_log_history of de historie.';
comment on column tmc.set_logs.source is
  'previous = ghost value van vorige keer ongewijzigd overgenomen; edited = gewicht of reps afwijkend. NULL = onbekend (rijen van voor 20261031120000).';

-- Backfill: alles van voor deze migratie was "opgeslagen = gedaan".
update tmc.set_logs l
set completed_at = coalesce(s.completed_at, s.started_at)
from tmc.workout_sessions s
where s.id = l.session_id
  and l.completed_at is null;

create index set_logs_session_completed_idx
  on tmc.set_logs (session_id)
  where completed_at is not null;

-- ---------------------------------------------------------------------------
-- 4. log_set
-- ---------------------------------------------------------------------------

drop function if exists tmc.log_set(uuid, uuid, integer, numeric, integer, text);

create function tmc.log_set(
  p_session_id uuid,
  p_program_exercise_id uuid,
  p_set_number integer,
  p_weight_kg numeric,
  p_reps integer,
  p_notes text default null,
  p_completed boolean default true,
  p_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_session tmc.workout_sessions%rowtype;
  v_exercise tmc.program_exercises%rowtype;
  v_completed boolean := coalesce(p_completed, true);
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  if p_weight_kg is null or p_weight_kg < 0 or p_reps is null or p_reps < 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_values');
  end if;

  -- Een draft mag reps 0 hebben (tussenstand); een afgevinkte set niet.
  if v_completed and p_reps < 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_values');
  end if;

  if p_source is not null and p_source not in ('previous', 'edited') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_source');
  end if;

  select s.* into v_session
  from tmc.workout_sessions s
  where s.id = p_session_id and s.profile_id = v_uid
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  if v_session.completed_at is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'session_completed');
  end if;

  select pe.* into v_exercise
  from tmc.program_exercises pe
  where pe.id = p_program_exercise_id;

  if not found or v_exercise.day_id <> v_session.day_id then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'exercise_not_in_session');
  end if;

  if p_set_number < 1 or p_set_number > v_exercise.sets then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'set_number_out_of_range');
  end if;

  insert into tmc.set_logs (
    session_id, program_exercise_id, exercise_id, set_number,
    weight_kg, reps, notes, completed_at, source
  )
  values (
    p_session_id, p_program_exercise_id, v_exercise.exercise_id, p_set_number,
    p_weight_kg, p_reps, p_notes,
    case when v_completed then pg_catalog.now() else null end,
    p_source
  )
  on conflict (session_id, program_exercise_id, set_number)
  do update set
    weight_kg = excluded.weight_kg,
    reps = excluded.reps,
    notes = excluded.notes,
    -- Afvinken houdt het eerste afvinkmoment; uitvinken zet het op NULL.
    completed_at = case
      when v_completed then coalesce(tmc.set_logs.completed_at, pg_catalog.now())
      else null
    end,
    source = excluded.source;

  return pg_catalog.jsonb_build_object('ok', true, 'completed', v_completed);
end;
$function$;

comment on function tmc.log_set(uuid, uuid, integer, numeric, integer, text, boolean, text) is
  'Upsert van een set in de eigen, nog open workout-sessie. p_completed true = afgevinkt (completed_at behoudt het eerste afvinkmoment), false = draft (completed_at NULL, nooit in de historie). p_source: previous of edited. Alleen authenticated; zie 20261031120000_schema_vorige_waarden.sql.';

revoke execute on function tmc.log_set(uuid, uuid, integer, numeric, integer, text, boolean, text) from public, anon;
grant execute on function tmc.log_set(uuid, uuid, integer, numeric, integer, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. duplicate_training_program: start_weight_kg mee kopieren
-- ---------------------------------------------------------------------------
-- Zelfde signature en eigenschappen als de live definitie (SECURITY
-- DEFINER, search_path tmc, extensions; service-role-only via grants die
-- create or replace niet aanraakt). Alleen de kolommenlijst is uitgebreid.

create or replace function tmc.duplicate_training_program(p_program_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
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
      rest_seconds, notes, start_weight_kg
    )
    select
      v_new_day_id, slot, exercise_id, sets, reps_min, reps_max,
      tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
      rest_seconds, notes, start_weight_kg
    from tmc.program_exercises
    where day_id = v_day.id;
  end loop;

  return v_new_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. set_log_history: alleen afgevinkte sets
-- ---------------------------------------------------------------------------
-- create or replace behoudt de kolommenlijst, de view-optie security_invoker
-- en de bestaande grants (authenticated: select). Alleen het where-filter
-- verandert.

create or replace view tmc.set_log_history
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
where s.completed_at is not null
  and l.completed_at is not null;

comment on view tmc.set_log_history is
  'Platte historie-rij per afgevinkte set (spec-trainingsprotocol.md PR 5 vervolg en vorige waarden). Security invoker: leest onder de rechten van de aanroeper, dus RLS op de onderliggende tabellen filtert een lid vanzelf op zichzelf. Admin en trainer lezen via de service-role-client met een expliciete profile_id-filter in de querylaag (de view zelf heeft geen policy). Bevat uitsluitend afgeronde sessies en uitsluitend sets met completed_at (drafts en ghost values blijven buiten de historie), en mist sessies zonder afgevinkte sets.';

-- ---------------------------------------------------------------------------
-- 7. Asserties (alleen catalogi)
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text := 'tmc.log_set(uuid, uuid, integer, numeric, integer, text, boolean, text)';
  v_def text;
  v_viewdef text;
  v_overloads integer;
begin
  -- Signature: precies een log_set, met acht argumenten.
  select count(*) into v_overloads
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tmc' and p.proname = 'log_set';
  if v_overloads <> 1 then
    raise exception 'log_set: % overloads, verwacht 1', v_overloads;
  end if;

  select pg_get_functiondef(v_name::regprocedure) into v_def;
  if v_def not ilike '%security definer%' then
    raise exception 'log_set: geen SECURITY DEFINER';
  end if;
  if v_def not ilike '%search_path%' then
    raise exception 'log_set: search_path ontbreekt';
  end if;

  -- Grants: authenticated wel, anon en PUBLIC niet.
  if not has_function_privilege('authenticated', v_name, 'execute') then
    raise exception 'log_set: authenticated mist EXECUTE';
  end if;
  if has_function_privilege('anon', v_name, 'execute') then
    raise exception 'log_set: anon heeft EXECUTE';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.oid = v_name::regprocedure
      and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
  ) then
    raise exception 'log_set: PUBLIC heeft EXECUTE';
  end if;

  -- Check-constraints.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tmc.exercises'::regclass and conname = 'exercises_equipment_check'
  ) then
    raise exception 'exercises_equipment_check ontbreekt';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tmc.set_logs'::regclass and conname = 'set_logs_source_check'
  ) then
    raise exception 'set_logs_source_check ontbreekt';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'tmc' and table_name = 'program_exercises' and column_name = 'start_weight_kg'
  ) then
    raise exception 'program_exercises.start_weight_kg ontbreekt';
  end if;

  -- View filtert op l.completed_at, blijft security invoker en leesbaar.
  select pg_get_viewdef('tmc.set_log_history'::regclass) into v_viewdef;
  if v_viewdef not ilike '%l.completed_at IS NOT NULL%' then
    raise exception 'set_log_history filtert niet op l.completed_at';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'tmc.set_log_history'::regclass
      and 'security_invoker=true' = any (reloptions)
  ) then
    raise exception 'set_log_history: security_invoker ontbreekt';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'tmc' and table_name = 'set_log_history'
      and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception 'authenticated mist SELECT op tmc.set_log_history';
  end if;

  -- Backfill: geen rij meer zonder completed_at op dit moment.
  if exists (select 1 from tmc.set_logs where completed_at is null) then
    raise exception 'set_logs: backfill onvolledig';
  end if;
end $$;
