-- CHECK-constraints als defense-in-depth; de RPC hieronder valideert al
-- met een vriendelijke reason voordat de insert de constraint raakt.
alter table tmc.set_logs
  add constraint set_logs_weight_kg_check check (weight_kg >= 0),
  add constraint set_logs_reps_check check (reps >= 0);

create or replace function tmc.start_workout_session(p_day_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
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
$function$;

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

  insert into tmc.set_logs (session_id, program_exercise_id, set_number, weight_kg, reps, notes)
  values (p_session_id, p_program_exercise_id, p_set_number, p_weight_kg, p_reps, p_notes)
  on conflict (session_id, program_exercise_id, set_number)
  do update set weight_kg = excluded.weight_kg, reps = excluded.reps, notes = excluded.notes;

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function tmc.complete_workout_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
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
$function$;

revoke all on function tmc.start_workout_session(uuid) from public;
revoke all on function tmc.start_workout_session(uuid) from anon;
revoke all on function tmc.start_workout_session(uuid) from authenticated;
grant execute on function tmc.start_workout_session(uuid) to authenticated;

revoke all on function tmc.log_set(uuid, uuid, int, numeric, int, text) from public;
revoke all on function tmc.log_set(uuid, uuid, int, numeric, int, text) from anon;
revoke all on function tmc.log_set(uuid, uuid, int, numeric, int, text) from authenticated;
grant execute on function tmc.log_set(uuid, uuid, int, numeric, int, text) to authenticated;

revoke all on function tmc.complete_workout_session(uuid) from public;
revoke all on function tmc.complete_workout_session(uuid) from anon;
revoke all on function tmc.complete_workout_session(uuid) from authenticated;
grant execute on function tmc.complete_workout_session(uuid) to authenticated;
