-- fix/tmc-hardening
--
-- Twee losse verhardingen, zie spec-session-overrides.md (Volgende stappen,
-- "Should, voor opening") en de discovery van 2026-09-29.
--
-- 1. De oude unieke sleutel class_sessions_template_id_start_at_key
--    (template_id, start_at) gaat weg. Sinds PR #239 (8a2cf61) upsert de
--    materialisatie op (template_id, occurrence_start_at). Live leunt niets
--    meer op de oude sleutel: geen functie, view, FK of Edge Function; de
--    planner kiest voor lookups op template_id de nieuwe index. Het
--    seedscript scripts/seed-test-data.mjs is in dezelfde PR omgezet.
--
-- 2. Nieuwe functies in schema tmc krijgen standaard geen EXECUTE meer voor
--    PUBLIC en anon. ALTER DEFAULT PRIVILEGES ... IN SCHEMA tmc kan dat niet
--    (een per-schema-regel kan alleen rechten toevoegen, de ingebouwde
--    PUBLIC-EXECUTE blijft staan; live getest). De globale variant FOR ROLE
--    postgres werkt wel, maar raakt elk schema van dit gedeelde project
--    (public, tvmuur, tmm, montagebaas) en functies die extensies als postgres
--    aanmaken. Daarom een event trigger die alleen naar schema tmc kijkt:
--    - alleen CREATE FUNCTION en CREATE PROCEDURE;
--    - alleen objecten in schema tmc die nog de standaardrechten hebben
--      (proacl is null), dus een CREATE OR REPLACE van een functie met
--      expliciete rechten (zoals is_admin met anon) blijft ongemoeid;
--    - extensie-DDL wordt overgeslagen;
--    - elke fout wordt een waarschuwing: de trigger blokkeert nooit DDL, ook
--      niet van het platform.
--    Gevolg voor toekomstige migraties: elke nieuwe tmc-functie heeft een
--    expliciete GRANT EXECUTE nodig voor wie hem mag aanroepen (regel 7 in
--    supabase/migrations/README.md). Na de opruiming van het gedeelde project
--    kan dit worden vervangen door de globale regel en kan de trigger weg.
--
-- Bestaande functies worden niet aangeraakt.

-- ---------------------------------------------------------------------------
-- 1. Oude unieke sleutel droppen
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tmc.class_sessions'::regclass
      and conname = 'class_sessions_template_id_occurrence_key'
      and contype = 'u'
  ) then
    raise exception 'tmc_hardening: class_sessions_template_id_occurrence_key ontbreekt; de oude sleutel blijft staan';
  end if;
end $$;

alter table tmc.class_sessions drop constraint class_sessions_template_id_start_at_key;

-- ---------------------------------------------------------------------------
-- 2. Event trigger: nieuwe tmc-functies zonder PUBLIC- en anon-EXECUTE
-- ---------------------------------------------------------------------------

create function tmc.tmc_new_function_default_privileges()
returns event_trigger
language plpgsql
set search_path to 'tmc', 'pg_catalog'
as $$
declare
  r record;
begin
  for r in
    select objid, object_type, object_identity, schema_name, in_extension
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
  loop
    if r.in_extension or r.schema_name is distinct from 'tmc' then
      continue;
    end if;
    begin
      -- Alleen een functie met nog de standaardrechten (net aangemaakt, of
      -- een replace van een functie die nooit expliciete rechten kreeg).
      if exists (select 1 from pg_catalog.pg_proc p where p.oid = r.objid and p.proacl is null) then
        execute format('revoke execute on routine %s from public, anon', r.object_identity);
      end if;
    exception when others then
      raise warning 'tmc_new_function_default_privileges: % niet aangepast: %', r.object_identity, sqlerrm;
    end;
  end loop;
exception when others then
  raise warning 'tmc_new_function_default_privileges: overgeslagen: %', sqlerrm;
end;
$$;

revoke execute on function tmc.tmc_new_function_default_privileges() from public, anon, authenticated;

create event trigger tmc_new_function_default_privileges
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
  execute function tmc.tmc_new_function_default_privileges();

-- ---------------------------------------------------------------------------
-- Zelfcontrole
-- ---------------------------------------------------------------------------

do $$
declare
  v_is_admin_acl aclitem[];
begin
  if exists (select 1 from pg_constraint where conname = 'class_sessions_template_id_start_at_key') then
    raise exception 'tmc_hardening: oude sleutel staat er nog';
  end if;

  -- De triggerfunctie zelf: geen PUBLIC, anon of authenticated.
  if has_function_privilege('anon', 'tmc.tmc_new_function_default_privileges()', 'execute')
     or has_function_privilege('authenticated', 'tmc.tmc_new_function_default_privileges()', 'execute')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = 'tmc.tmc_new_function_default_privileges()'::regprocedure
                  and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'tmc_hardening: triggerfunctie heeft te ruime EXECUTE';
  end if;

  if not exists (select 1 from pg_event_trigger
                 where evtname = 'tmc_new_function_default_privileges'
                   and evtenabled <> 'D') then
    raise exception 'tmc_hardening: event trigger ontbreekt of staat uit';
  end if;

  -- Werking: een nieuwe tmc-functie en -procedure krijgen geen PUBLIC en anon.
  create function tmc.zz_tmc_hardening_selftest() returns int language sql as 'select 1';
  create procedure tmc.zz_tmc_hardening_selftest_proc() language sql as 'select 1';
  if has_function_privilege('anon', 'tmc.zz_tmc_hardening_selftest()', 'execute')
     or has_function_privilege('anon', 'tmc.zz_tmc_hardening_selftest_proc()', 'execute')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid in ('tmc.zz_tmc_hardening_selftest()'::regprocedure,
                                'tmc.zz_tmc_hardening_selftest_proc()'::regprocedure)
                  and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'tmc_hardening: nieuwe tmc-functie heeft nog PUBLIC of anon EXECUTE';
  end if;
  drop function tmc.zz_tmc_hardening_selftest();
  drop procedure tmc.zz_tmc_hardening_selftest_proc();

  -- Een replace van een functie met expliciete rechten blijft ongemoeid.
  select proacl into v_is_admin_acl from pg_proc where oid = 'tmc.is_admin()'::regprocedure;
  execute pg_get_functiondef('tmc.is_admin()'::regprocedure);
  if (select proacl from pg_proc where oid = 'tmc.is_admin()'::regprocedure) is distinct from v_is_admin_acl then
    raise exception 'tmc_hardening: rechten van is_admin veranderd door een replace';
  end if;
end $$;
