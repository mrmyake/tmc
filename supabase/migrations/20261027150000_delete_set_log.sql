-- 20261027150000_delete_set_log.sql
--
-- fix/workout-logging (discovery en akkoord 2026-10-27). De workout-logger
-- slaat sets voortaan automatisch op (autosave, spec-trainingsprotocol.md
-- PR 4 vervolg). Maakt een lid beide velden van een al opgeslagen set leeg,
-- dan moet die set ook uit tmc.set_logs verdwijnen. Er bestond geen
-- delete-pad voor leden: authenticated heeft alleen SELECT op set_logs en
-- log_set is een upsert. Deze migratie voegt de enige ontbrekende schakel
-- toe.
--
-- tmc.delete_set_log(p_session_id, p_program_exercise_id, p_set_number):
--   * SECURITY DEFINER met search_path '' en volledig gekwalificeerde namen.
--   * Eist een ingelogde aanroeper (42501, zelfde patroon als log_set).
--   * Eist dat de sessie van de aanroeper is en nog open staat
--     (completed_at is null); anders reason session_not_found of
--     session_completed, zelfde reasons als log_set.
--   * Verwijdert de rij op (session_id, program_exercise_id, set_number).
--     Idempotent: bestaat de rij niet, dan ok met deleted false.
--   * Grants: EXECUTE alleen voor authenticated. REVOKE van PUBLIC en anon,
--     geen service_role (admin-paden schrijven via de service-role-client
--     rechtstreeks op de tabel, niet via deze RPC).
--
-- supabase db push voert dit bestand in een transactie uit. Drop en create
-- staan bewust naast elkaar: een nieuwe functie krijgt de default-EXECUTE
-- voor PUBLIC (de event trigger tmc_new_function_default_privileges trekt
-- die in, maar de revoke hieronder maakt de migratie daar niet van
-- afhankelijk). Geen enkele stap hangt af van applicatiedata.

-- ---------------------------------------------------------------------------
-- 1. Functie
-- ---------------------------------------------------------------------------

drop function if exists tmc.delete_set_log(uuid, uuid, integer);

create function tmc.delete_set_log(
  p_session_id uuid,
  p_program_exercise_id uuid,
  p_set_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_session tmc.workout_sessions%rowtype;
  v_deleted integer;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
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

  delete from tmc.set_logs l
  where l.session_id = p_session_id
    and l.program_exercise_id = p_program_exercise_id
    and l.set_number = p_set_number;

  get diagnostics v_deleted = row_count;

  return pg_catalog.jsonb_build_object('ok', true, 'deleted', v_deleted > 0);
end;
$function$;

comment on function tmc.delete_set_log(uuid, uuid, integer) is
  'Verwijdert een gelogde set uit de eigen, nog open workout-sessie (autosave: beide velden leeggemaakt). Idempotent. Alleen authenticated; zie 20261027150000_delete_set_log.sql.';

-- ---------------------------------------------------------------------------
-- 2. Grants
-- ---------------------------------------------------------------------------

revoke execute on function tmc.delete_set_log(uuid, uuid, integer) from public, anon;
grant execute on function tmc.delete_set_log(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Asserties (alleen catalogi)
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text := 'tmc.delete_set_log(uuid, uuid, integer)';
  v_def text;
begin
  select pg_get_functiondef(v_name::regprocedure) into v_def;

  if v_def not ilike '%security definer%' then
    raise exception 'delete_set_log: geen SECURITY DEFINER';
  end if;
  if v_def not ilike '%search_path%' then
    raise exception 'delete_set_log: search_path ontbreekt';
  end if;

  if not has_function_privilege('authenticated', v_name, 'execute') then
    raise exception 'delete_set_log: authenticated mist EXECUTE';
  end if;
  if has_function_privilege('anon', v_name, 'execute') then
    raise exception 'delete_set_log: anon heeft EXECUTE';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.oid = v_name::regprocedure
      and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
  ) then
    raise exception 'delete_set_log: PUBLIC heeft EXECUTE';
  end if;
end $$;
