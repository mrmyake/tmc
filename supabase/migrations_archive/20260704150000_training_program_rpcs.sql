-- Trainingsprotocol PR 2 (spec-trainingsprotocol.md): twee RPC's voor de
-- programma-builder in de admin-cockpit.
--
-- 1. activate_training_program: archiveren van het huidige actieve schema
--    en activeren van de draft in EEN transactie (spec-eis). De partial
--    unique index training_programs_one_active_idx blijft het vangnet
--    tegen races.
-- 2. duplicate_training_program: actief (of gearchiveerd) schema kopieren
--    naar een nieuwe draft-versie inclusief dagen en oefeningen, atomair,
--    zodat een half-gefaalde kopie nooit een kreupele draft achterlaat.
--
-- Beide worden uitsluitend aangeroepen via server actions met de
-- service-role client (admin-cockpit). Vandaar: revoke voor public, anon
-- EN authenticated; dit schema grant't EXECUTE op nieuwe functies default
-- breed, dus de expliciete revokes zijn verplicht (zelfde patroon als
-- 20260702000000_membership_cancellation_rpc.sql).

create or replace function tmc.activate_training_program(p_program_id uuid)
returns tmc.training_programs
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_program tmc.training_programs%rowtype;
begin
  select * into v_program
  from tmc.training_programs
  where id = p_program_id
  for update;

  if not found then
    raise exception 'Programma niet gevonden.';
  end if;
  if v_program.status <> 'draft' then
    raise exception 'Alleen een concept kan geactiveerd worden.';
  end if;

  -- Archiveer het eventuele huidige actieve schema van dezelfde klant.
  update tmc.training_programs
  set status = 'archived', archived_at = now()
  where profile_id = v_program.profile_id
    and status = 'active';

  update tmc.training_programs
  set status = 'active', activated_at = now()
  where id = p_program_id
  returning * into v_program;

  return v_program;
end;
$function$;

comment on function tmc.activate_training_program(uuid) is
  'Archiveert atomair het huidige actieve schema van de klant en activeert de opgegeven draft. Service-role-only; aangeroepen via admin server actions.';

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
      rest_seconds, notes
    )
    select
      v_new_day_id, slot, exercise_id, sets, reps_min, reps_max,
      tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
      rest_seconds, notes
    from tmc.program_exercises
    where day_id = v_day.id;
  end loop;

  return v_new_id;
end;
$function$;

comment on function tmc.duplicate_training_program(uuid) is
  'Kopieert een schema (inclusief dagen en oefeningen) naar een nieuwe draft-versie voor dezelfde klant. Service-role-only; aangeroepen via admin server actions.';

revoke all on function tmc.activate_training_program(uuid) from public;
revoke all on function tmc.activate_training_program(uuid) from anon;
revoke all on function tmc.activate_training_program(uuid) from authenticated;
revoke all on function tmc.duplicate_training_program(uuid) from public;
revoke all on function tmc.duplicate_training_program(uuid) from anon;
revoke all on function tmc.duplicate_training_program(uuid) from authenticated;

-- De revoke van public raakt ook service_role (die heeft geen eigen
-- default meer zodra public weg is); expliciet teruggeven, want de
-- admin server actions roepen deze RPC's via de service-role client aan.
grant execute on function tmc.activate_training_program(uuid) to service_role;
grant execute on function tmc.duplicate_training_program(uuid) to service_role;
