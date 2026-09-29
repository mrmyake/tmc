-- fix/function-execute-grants
--
-- Hotfix functierechten in schema tmc. Aanleiding: bij de discovery van
-- feat/session-overrides bleek tmc.adjust_membership_credits een default ACL
-- te hebben (PUBLIC EXECUTE, dus ook anon). De guard in die functie weigert
-- alleen als auth.uid() niet null is; een aanroep met alleen de anon key komt
-- er dus doorheen en kan het saldo van elke rittenkaart aanpassen.
--
-- Er staat in tmc geen ALTER DEFAULT PRIVILEGES voor functies, dus elke
-- functie zonder expliciete revoke krijgt PUBLIC EXECUTE. Deze migratie loopt
-- alle functies na waar anon of PUBLIC EXECUTE op heeft (live via aclexplode)
-- en trekt het recht alleen in waar de aanroepers hard zijn vastgesteld:
--
--   adjust_membership_credits   aanroepers: check-in/core.ts, member-actions,
--                               attendance-actions, session-actions, allemaal
--                               createAdminClient (service role). Geen SQL-
--                               aanroepers, policies of views.
--   refresh_admin_kpis          aanroeper: cron refresh-kpis (service role).
--                               Geen guard; anon kon een REFRESH MATERIALIZED
--                               VIEW CONCURRENTLY afdwingen.
--   cleanup_expired_strikes     geen aanroepers (cron expire-strikes deletet
--                               zelf via de service role). Geen guard.
--   get_remaining_guest_passes  geen aanroepers (dode functie, zie
--                               guest-pass-discovery). Geen guard, las het
--                               gastpas-saldo van een willekeurig profiel.
--   increment_cf_stats (2x)     geen aanroepers sinds de crowdfunding-module
--   increment_cf_tier_slot      weg is (#120). Geen guard; AUDIT-SECURITY.md
--                               meldde dit al, maar de revoke daar liet PUBLIC
--                               staan.
--   get_admin_kpis              geen aanroepers; guard is_admin(). anon en
--                               PUBLIC eraf, authenticated en service_role
--                               blijven (admin-gegate).
--
-- Bewust niet aangeraakt (zie PR-beschrijving): is_admin, is_trainer,
-- is_staff, is_pt_trainer_for, current_user_role (RLS-helpers, ook voor anon
-- geevalueerd), get_campaign_deadline, get_campaign_window,
-- get_cancellation_notice_days (publieke marketingdata), audit_actor_label
-- (geen SECURITY DEFINER, draait onder RLS van de aanroeper) en alle
-- trigger-functies (niet direct aanroepbaar).
--
-- Alleen grants, geen functiedefinities: niets wordt gedropt of herschreven.

revoke execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid, text)
  to service_role;

revoke execute on function tmc.refresh_admin_kpis() from public, anon, authenticated;
grant execute on function tmc.refresh_admin_kpis() to service_role;

revoke execute on function tmc.cleanup_expired_strikes() from public, anon, authenticated;
grant execute on function tmc.cleanup_expired_strikes() to service_role;

revoke execute on function tmc.get_remaining_guest_passes(uuid) from public, anon, authenticated;
grant execute on function tmc.get_remaining_guest_passes(uuid) to service_role;

revoke execute on function tmc.increment_cf_stats(numeric) from public, anon, authenticated;
revoke execute on function tmc.increment_cf_stats(integer) from public, anon, authenticated;
revoke execute on function tmc.increment_cf_tier_slot(text) from public, anon, authenticated;
grant execute on function tmc.increment_cf_stats(numeric) to service_role;
grant execute on function tmc.increment_cf_stats(integer) to service_role;
grant execute on function tmc.increment_cf_tier_slot(text) to service_role;

revoke execute on function tmc.get_admin_kpis() from public, anon;
grant execute on function tmc.get_admin_kpis() to authenticated, service_role;

-- Zelfcontrole: faalt de migratie als een recht niet klopt.
do $$
declare
  v_name text;
  v_service_only text[] := array[
    'tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid, text)',
    'tmc.refresh_admin_kpis()',
    'tmc.cleanup_expired_strikes()',
    'tmc.get_remaining_guest_passes(uuid)',
    'tmc.increment_cf_stats(numeric)',
    'tmc.increment_cf_stats(integer)',
    'tmc.increment_cf_tier_slot(text)'
  ];
begin
  foreach v_name in array v_service_only || array['tmc.get_admin_kpis()'] loop
    if has_function_privilege('anon', v_name, 'execute') then
      raise exception 'function_execute_grants: anon heeft EXECUTE op %', v_name;
    end if;
    if exists (
      select 1 from pg_proc p
      where p.oid = v_name::regprocedure
        and exists (select 1 from aclexplode(p.proacl) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    ) then
      raise exception 'function_execute_grants: PUBLIC heeft EXECUTE op %', v_name;
    end if;
    if not has_function_privilege('service_role', v_name, 'execute') then
      raise exception 'function_execute_grants: service_role mist EXECUTE op %', v_name;
    end if;
  end loop;

  foreach v_name in array v_service_only loop
    if has_function_privilege('authenticated', v_name, 'execute') then
      raise exception 'function_execute_grants: authenticated heeft EXECUTE op %', v_name;
    end if;
  end loop;

  if not has_function_privilege('authenticated', 'tmc.get_admin_kpis()', 'execute') then
    raise exception 'function_execute_grants: authenticated mist EXECUTE op tmc.get_admin_kpis()';
  end if;
end $$;
