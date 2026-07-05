-- Denormaliseer exercise_id op set_logs zodat historie/progressie-queries
-- (PR 5) geen join door program_exercises nodig hebben. Dat is nodig omdat
-- program_exercises_self_active_read alleen rijen uit het HUIDIGE actieve
-- schema toont; een klant se eigen historie moet juist over alle oude
-- versies heen kunnen, gematcht op de daadwerkelijke oefening (exercise_id),
-- niet op de per-versie program_exercise_id.
alter table tmc.set_logs
  add column exercise_id uuid references tmc.exercises(id);

update tmc.set_logs sl
set exercise_id = pe.exercise_id
from tmc.program_exercises pe
where pe.id = sl.program_exercise_id
  and sl.exercise_id is null;

alter table tmc.set_logs
  alter column exercise_id set not null;

create index set_logs_exercise_id_idx on tmc.set_logs (exercise_id);

create or replace function tmc.log_set(
  p_session_id uuid,
  p_program_exercise_id uuid,
  p_set_number int,
  p_weight_kg numeric,
  p_reps int,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
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
$function$;
