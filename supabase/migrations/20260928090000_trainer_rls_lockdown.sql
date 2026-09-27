-- 20260928090000_trainer_rls_lockdown.sql
--
-- fix/trainer-rls-lockdown (discovery 2026-09-27, akkoord op de bouwopdracht
-- dezelfde dag). Twee lekken en een opruiming, in een migratie.
--
-- Lek 1: elk lid kan zichzelf staf maken. Policy trainers_self (FOR ALL,
-- USING en WITH CHECK profile_id = auth.uid()) plus INSERT/UPDATE/DELETE-
-- grants voor authenticated op tmc.trainers lieten elk lid een actieve
-- trainers-rij voor zichzelf aanmaken. tmc.is_staff() (admin OF actieve
-- trainers-rij, zonder rolcheck) gaf daarna true, en requireTrainerOrAdmin
-- in de app deed hetzelfde. Bevestigd in een teruggedraaide transactie als
-- gewoon lid.
--
-- Lek 2: personeelsgegevens publiek leesbaar. Met de tabelbrede SELECT-grant
-- voor anon en authenticated gaf tmc.trainers voor elke actieve trainer
-- hourly_rate_in_cents, pt_session_rate_cents, has_health_access,
-- employment_tier en profile_id terug (policy trainers_public_read op
-- is_active). Dezelfde ruwe grants stonden op class_sessions en
-- schedule_templates.
--
-- Opruiming: trainers hadden via class_sessions_trainer_own_update (UPDATE
-- zonder WITH CHECK) en bookings_trainer_attendance (UPDATE zonder WITH
-- CHECK en zonder kolombeperking) directe schrijfrechten op eigen lessen en
-- op alle kolommen van boekingen op eigen lessen. Geen enkel codepad
-- gebruikt die policies: alle schrijfacties van de app lopen via de
-- service-role-client achter een TypeScript-gate (requireAdmin,
-- authorizeForSession, requireTrainerOrAdmin, de kiosk-gate), en leden
-- boeken en annuleren via de SECURITY DEFINER-RPC's book_class_session en
-- cancel_class_booking. De trainer-leespolicies blijven staan.
--
-- Gewenst model (besluit Ilja): alleen admin maakt trainers aan, wijzigt
-- trainervelden en koppelt trainers aan lessen. Een trainer leest zijn eigen
-- trainers-rij, ziet alleen de lessen die hij zelf verzorgt en de deelnemers
-- daarvan, en registreert alleen aanwezigheid. Aanwezigheid blijft lopen via
-- het bestaande pad markAttendance -> authorizeForSession ->
-- setMemberAttendance (service role), geen nieuwe RPC.
--
-- Wat deze migratie doet:
--   1. trainers: trainers_self weg, trainers_self_read (SELECT op de eigen
--      rij) ervoor terug; INSERT/UPDATE/DELETE ingetrokken voor
--      authenticated en anon.
--   2. class_sessions: class_sessions_trainer_own_update weg;
--      INSERT/UPDATE/DELETE ingetrokken voor authenticated en anon.
--   3. bookings: bookings_trainer_attendance weg; INSERT/UPDATE/DELETE
--      ingetrokken voor authenticated en anon.
--   4. check_ins: INSERT/UPDATE/DELETE ingetrokken voor authenticated en
--      anon (er was al geen trainer-schrijfpolicy).
--   5. schedule_templates: INSERT/UPDATE/DELETE ingetrokken voor
--      authenticated en anon (admin schrijft via service role:
--      series-actions.ts, cron generate-sessions).
--   6. pt_sessions: pt_sessions_trainer_own (FOR ALL) versmald tot
--      pt_sessions_trainer_own_read (SELECT); INSERT/UPDATE/DELETE
--      ingetrokken voor authenticated. Alle PT-schrijfacties lopen via de
--      RPC's (create_pt_block, reschedule_pt, enz.) of via service role
--      (cron, Mollie-webhook, intake).
--   7. tmc.is_staff() en tmc.is_staff_profile(uuid) verstrengd: een
--      niet-admin telt pas als staf bij profiles.role = 'trainer' EN een
--      actieve eigen trainers-rij. CREATE OR REPLACE met identieke
--      signatuur en attributen (live definitie 2026-09-27 via
--      pg_get_functiondef), dus de EXECUTE-grants blijven staan. De
--      PT-RPC's met "if not tmc.is_staff()" en policy pcr_trainer_read
--      worden daarmee automatisch strenger. De TypeScript-spiegels
--      (requireTrainerOrAdmin, readStaffPinInfo) krijgen dezelfde regel in
--      dezelfde PR.
--   8. Kolom-grants in plaats van tabelbrede SELECT voor anon en
--      authenticated op trainers, class_sessions en schedule_templates, en
--      anon SELECT weg op bookings en check_ins; zie het blok hieronder
--      voor de onderbouwing per kolom.
--
-- Bewust NIET aangeraakt: trainers_admin_all, trainers_public_read,
-- class_sessions_admin_all, class_sessions_authed_read, bookings_admin_all,
-- bookings_self_read, bookings_trainer_read, check_ins_* (alle drie),
-- guest_bookings (al dichtgezet in 20260911000000), schedule_templates_*
-- policies, pt_sessions_admin_all, pt_sessions_member_booked_read,
-- tmc.is_trainer() en tmc.is_admin(), de bestaande trainers-rijen (Remi en
-- Fenna, actieve rijen op member-profielen, tellen na deze migratie niet
-- meer als staf; ze loggen nooit in), en de SELECT-grants op class_types
-- en v_session_availability.
--
-- Replay-veilig (README punt 6): uitsluitend DROP POLICY IF EXISTS, CREATE
-- POLICY, REVOKE, GRANT en CREATE OR REPLACE FUNCTION; geen enkele
-- afhankelijkheid van applicatierijen. Het assertieblok aan het einde laat
-- de migratie falen als de eindtoestand niet klopt.
--
-- Negatieve tests: scripts/test-trainer-rls-lockdown.sql (transactie met
-- rollback, eigen wegwerp-fixtures, set role authenticated/anon met
-- request.jwt.claims).

-- ---------------------------------------------------------------------------
-- 1. trainers
-- ---------------------------------------------------------------------------

drop policy if exists trainers_self on tmc.trainers;
drop policy if exists trainers_self_read on tmc.trainers;

create policy trainers_self_read on tmc.trainers
  for select
  using (profile_id = auth.uid());

revoke insert, update, delete on tmc.trainers from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. class_sessions
-- ---------------------------------------------------------------------------

drop policy if exists class_sessions_trainer_own_update on tmc.class_sessions;

revoke insert, update, delete on tmc.class_sessions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. bookings
-- ---------------------------------------------------------------------------

drop policy if exists bookings_trainer_attendance on tmc.bookings;

revoke insert, update, delete on tmc.bookings from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. check_ins
-- ---------------------------------------------------------------------------

revoke insert, update, delete on tmc.check_ins from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. schedule_templates
-- ---------------------------------------------------------------------------

revoke insert, update, delete on tmc.schedule_templates from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. pt_sessions
-- ---------------------------------------------------------------------------

drop policy if exists pt_sessions_trainer_own on tmc.pt_sessions;
drop policy if exists pt_sessions_trainer_own_read on tmc.pt_sessions;

-- Zelfde uitdrukking als de oude USING-clausule (20260730000000
-- pt_sessions_policy_recursion_fix), alleen nog voor SELECT.
create policy pt_sessions_trainer_own_read on tmc.pt_sessions
  for select
  using (
    tmc.is_trainer()
    and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid())
  );

revoke insert, update, delete on tmc.pt_sessions from authenticated;

-- ---------------------------------------------------------------------------
-- 7. Stafdefinitie: rol trainer EN actieve eigen trainers-rij, of admin.
-- ---------------------------------------------------------------------------

-- Live definitie voor deze migratie (pg_get_functiondef, 2026-09-27):
--   select tmc.is_admin() or exists (
--     select 1 from tmc.trainers t
--     where t.profile_id = auth.uid() and t.is_active
--   );
create or replace function tmc.is_staff()
 returns boolean
 language sql
 stable security definer
 set search_path to 'tmc', 'extensions'
as $function$
  select tmc.is_admin() or (
    tmc.current_user_role() = 'trainer'
    and exists (
      select 1 from tmc.trainers t
      where t.profile_id = auth.uid() and t.is_active
    )
  );
$function$;

-- Live definitie voor deze migratie (pg_get_functiondef, 2026-09-27):
--   select exists (select 1 from tmc.profiles p where p.id = p_profile_id and p.role = 'admin')
--       or exists (select 1 from tmc.trainers t where t.profile_id = p_profile_id and t.is_active);
create or replace function tmc.is_staff_profile(p_profile_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'tmc', 'extensions'
as $function$
  select exists (select 1 from tmc.profiles p where p.id = p_profile_id and p.role = 'admin')
      or (
        exists (select 1 from tmc.profiles p where p.id = p_profile_id and p.role = 'trainer')
        and exists (select 1 from tmc.trainers t where t.profile_id = p_profile_id and t.is_active)
      );
$function$;

-- ---------------------------------------------------------------------------
-- 8. Kolom-grants (SELECT) voor anon en authenticated
-- ---------------------------------------------------------------------------
-- Discovery 2026-09-27 (src/, views, functies zonder SECURITY DEFINER):
--   * anon leest deze drie tabellen nergens. Het publieke rooster, de
--     homepage-teaser, het yoga-rooster en de proeflespagina's lezen via de
--     service-role-client; de losse anon-client (getPublicClient) leest
--     alleen catalogus, campagne en opzegtermijn. v_session_availability is
--     een view van postgres zonder security_invoker en heeft geen grants op
--     de onderliggende tabellen nodig. Er zijn geen views of functies zonder
--     SECURITY DEFINER die deze tabellen raken. anon krijgt daarom geen
--     enkele kolom; trainers_public_read en schedule_templates_public_read
--     blijven staan maar zijn voor anon slapend.
--   * authenticated (de ledenomgeving via de cookie-client) leest:
--     - class_sessions: /app/rooster, /app/vrij-trainen, /app/boekingen, het
--       dashboard en de boekingsacties, met filters op pillar, start_at en
--       status en embeds via class_type_id en trainer_id;
--     - trainers: uitsluitend als embed trainer:trainers(display_name, bio)
--       vanuit class_sessions en bookings, gejoind op trainers.id;
--     - schedule_templates: nergens (alleen admin en cron, via service role).
--   * Directe kolomverwijzingen in een RLS-policy hebben geen kolom-grant
--     nodig (lokaal getest): trainers_self_read (profile_id) en
--     trainers_public_read (is_active) werken zonder grant. Een SUBQUERY in
--     een policy wordt echter gepland met de rechten van de aanvrager. Tien
--     policies (bookings_trainer_read, check_ins_trainer_read,
--     guest_bookings_trainer_read, profiles_trainer_read_relevant,
--     pt_bookings_trainer_read, pcr_trainer_read, pt_sessions_trainer_own_read,
--     pt_settings_trainer_own, trainer_hours_self_insert en
--     trainer_hours_self_read) bevatten "select ... from tmc.trainers t where
--     t.profile_id = auth.uid()" (pcr_trainer_read ook t.is_active). Zonder
--     SELECT op profile_id en is_active faalt daardoor elke lezing van die
--     tabellen voor elk lid (lokaal gereproduceerd op bookings). Daarom
--     krijgt authenticated profile_id en is_active wel (besluit Ilja,
--     optie A: geen policies buiten de afgesproken lijst herschrijven). Het
--     alternatief, een SECURITY DEFINER-helper en herschrijving van die tien
--     policies, is een eventuele vervolg-PR.
--   * De admin-lookup in src/lib/auth/role-landing.ts loopt sinds deze PR
--     via de service-role-client, zoals requireTrainerOrAdmin al deed:
--     stafbepaling in de app hoort niet van kolom-grants af te hangen.
--   * anon heeft SELECT op bookings en check_ins zonder dat een anon-pad die
--     tabellen leest (alles via service role; v_session_availability leest
--     als eigenaar postgres). Omdat de trainer-leespolicies op die tabellen
--     nu voor anon een fout zouden geven in plaats van nul rijen, gaat die
--     SELECT ook weg. profiles en trainer_hours hebben hetzelfde patroon
--     maar staan buiten deze fix (geen anon-pad; benoemd in de PR).
--   Buiten de grant voor trainers: hourly_rate_in_cents,
--   pt_session_rate_cents, has_health_access, employment_tier, slug,
--   specialties, pillar_specialties, pt_tier, is_pt_available,
--   display_order, sanity_id, created_at, updated_at. Buiten de grant voor
--   class_sessions: notes, cancellation_reason (admin-invoer), template_id,
--   blocks_free_training, created_at, updated_at.

revoke select on tmc.trainers from anon;
revoke select on tmc.class_sessions from anon;
revoke select on tmc.schedule_templates from anon;
revoke select on tmc.bookings from anon;
revoke select on tmc.check_ins from anon;

revoke select on tmc.trainers from authenticated;
grant select (id, display_name, bio, profile_id, is_active) on tmc.trainers to authenticated;

revoke select on tmc.class_sessions from authenticated;
grant select (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  on tmc.class_sessions to authenticated;

revoke select on tmc.schedule_templates from authenticated;

-- ---------------------------------------------------------------------------
-- Assertie: eindtoestand exact zoals bedoeld, anders rolt alles terug.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text;
begin
  -- Policies die weg moeten zijn.
  if exists (
    select 1 from pg_policies where schemaname = 'tmc' and (
      (tablename = 'trainers' and policyname = 'trainers_self')
      or (tablename = 'class_sessions' and policyname = 'class_sessions_trainer_own_update')
      or (tablename = 'bookings' and policyname = 'bookings_trainer_attendance')
      or (tablename = 'pt_sessions' and policyname = 'pt_sessions_trainer_own')
    )
  ) then
    raise exception 'trainer_rls_lockdown: een verwijderde policy bestaat nog';
  end if;

  -- Policies die er moeten zijn (nieuw en behouden).
  if (select count(*) from pg_policies where schemaname = 'tmc' and tablename = 'trainers'
        and policyname in ('trainers_admin_all', 'trainers_public_read', 'trainers_self_read')) <> 3 then
    raise exception 'trainer_rls_lockdown: trainers-policies onvolledig';
  end if;
  if (select count(*) from pg_policies where schemaname = 'tmc' and tablename = 'class_sessions'
        and policyname in ('class_sessions_admin_all', 'class_sessions_authed_read')) <> 2 then
    raise exception 'trainer_rls_lockdown: class_sessions-policies onvolledig';
  end if;
  if (select count(*) from pg_policies where schemaname = 'tmc' and tablename = 'bookings'
        and policyname in ('bookings_admin_all', 'bookings_self_read', 'bookings_trainer_read')) <> 3 then
    raise exception 'trainer_rls_lockdown: bookings-policies onvolledig';
  end if;
  if (select count(*) from pg_policies where schemaname = 'tmc' and tablename = 'pt_sessions'
        and policyname in ('pt_sessions_admin_all', 'pt_sessions_member_booked_read', 'pt_sessions_trainer_own_read')) <> 3 then
    raise exception 'trainer_rls_lockdown: pt_sessions-policies onvolledig';
  end if;
  if (select cmd from pg_policies where schemaname = 'tmc' and tablename = 'trainers' and policyname = 'trainers_self_read') <> 'SELECT'
     or (select cmd from pg_policies where schemaname = 'tmc' and tablename = 'pt_sessions' and policyname = 'pt_sessions_trainer_own_read') <> 'SELECT' then
    raise exception 'trainer_rls_lockdown: een nieuwe leespolicy is geen SELECT-policy';
  end if;

  -- Geen schrijfrechten meer voor authenticated en anon, ook niet op kolomniveau.
  perform 1 from (values ('trainers'), ('class_sessions'), ('bookings'), ('check_ins'), ('schedule_templates'), ('pt_sessions')) as t(name)
  where has_table_privilege('authenticated', 'tmc.' || t.name, 'insert')
     or has_table_privilege('authenticated', 'tmc.' || t.name, 'update')
     or has_table_privilege('authenticated', 'tmc.' || t.name, 'delete')
     or has_any_column_privilege('authenticated', 'tmc.' || t.name, 'insert')
     or has_any_column_privilege('authenticated', 'tmc.' || t.name, 'update')
     or has_table_privilege('anon', 'tmc.' || t.name, 'insert')
     or has_table_privilege('anon', 'tmc.' || t.name, 'update')
     or has_table_privilege('anon', 'tmc.' || t.name, 'delete')
     or has_any_column_privilege('anon', 'tmc.' || t.name, 'insert')
     or has_any_column_privilege('anon', 'tmc.' || t.name, 'update');
  if found then
    raise exception 'trainer_rls_lockdown: authenticated of anon heeft nog schrijfrechten op een van de zes tabellen';
  end if;

  -- service_role houdt zijn schrijfpad (alle app-schrijfacties).
  perform 1 from (values ('trainers'), ('class_sessions'), ('bookings'), ('check_ins'), ('schedule_templates'), ('pt_sessions')) as t(name)
  where not (has_table_privilege('service_role', 'tmc.' || t.name, 'insert')
         and has_table_privilege('service_role', 'tmc.' || t.name, 'update')
         and has_table_privilege('service_role', 'tmc.' || t.name, 'delete')
         and has_table_privilege('service_role', 'tmc.' || t.name, 'select'));
  if found then
    raise exception 'trainer_rls_lockdown: service_role mist rechten op een van de zes tabellen';
  end if;

  -- Leespaden van leden en trainers: SELECT op bookings, check_ins en pt_sessions blijft.
  if not (has_table_privilege('authenticated', 'tmc.bookings', 'select')
      and has_table_privilege('authenticated', 'tmc.check_ins', 'select')
      and has_table_privilege('authenticated', 'tmc.pt_sessions', 'select')) then
    raise exception 'trainer_rls_lockdown: authenticated mist SELECT op bookings, check_ins of pt_sessions';
  end if;

  -- Stafdefinitie: beide functies bevatten de rolcheck en houden hun grants.
  select pg_get_functiondef('tmc.is_staff()'::regprocedure) into v_def;
  if v_def !~ 'current_user_role\(\) = ''trainer''' or v_def !~ 'SECURITY DEFINER' then
    raise exception 'trainer_rls_lockdown: tmc.is_staff() heeft niet de verwachte definitie';
  end if;
  select pg_get_functiondef('tmc.is_staff_profile(uuid)'::regprocedure) into v_def;
  if v_def !~ 'p.role = ''trainer''' or v_def !~ 'SECURITY DEFINER' then
    raise exception 'trainer_rls_lockdown: tmc.is_staff_profile(uuid) heeft niet de verwachte definitie';
  end if;
  if not (has_function_privilege('authenticated', 'tmc.is_staff()', 'execute')
      and has_function_privilege('anon', 'tmc.is_staff()', 'execute')
      and has_function_privilege('service_role', 'tmc.is_staff()', 'execute')
      and has_function_privilege('service_role', 'tmc.is_staff_profile(uuid)', 'execute')) then
    raise exception 'trainer_rls_lockdown: EXECUTE-grants op is_staff of is_staff_profile ontbreken';
  end if;

  -- Kolom-grants: anon leest niets van de drie tabellen.
  perform 1 from (values ('trainers'), ('class_sessions'), ('schedule_templates'), ('bookings'), ('check_ins')) as t(name)
  where has_table_privilege('anon', 'tmc.' || t.name, 'select')
     or has_any_column_privilege('anon', 'tmc.' || t.name, 'select');
  if found then
    raise exception 'trainer_rls_lockdown: anon heeft nog SELECT op trainers, class_sessions, schedule_templates, bookings of check_ins';
  end if;

  -- authenticated: geen tabelbrede SELECT meer, alleen de toegestane kolommen.
  perform 1 from (values ('trainers'), ('class_sessions'), ('schedule_templates')) as t(name)
  where has_table_privilege('authenticated', 'tmc.' || t.name, 'select');
  if found then
    raise exception 'trainer_rls_lockdown: authenticated heeft nog een tabelbrede SELECT op trainers, class_sessions of schedule_templates';
  end if;
  if has_any_column_privilege('authenticated', 'tmc.schedule_templates', 'select') then
    raise exception 'trainer_rls_lockdown: authenticated heeft nog kolomrechten op schedule_templates';
  end if;
  perform 1 from unnest(array['id', 'display_name', 'bio', 'profile_id', 'is_active']) as c(name)
  where not has_column_privilege('authenticated', 'tmc.trainers', c.name, 'select');
  if found then
    raise exception 'trainer_rls_lockdown: authenticated mist een toegestane kolom op trainers';
  end if;
  perform 1 from unnest(array['hourly_rate_in_cents', 'pt_session_rate_cents', 'has_health_access', 'employment_tier', 'slug', 'is_pt_available', 'pt_tier']) as c(name)
  where has_column_privilege('authenticated', 'tmc.trainers', c.name, 'select');
  if found then
    raise exception 'trainer_rls_lockdown: authenticated leest nog een afgeschermde kolom op trainers';
  end if;
  perform 1 from unnest(array['id', 'class_type_id', 'trainer_id', 'pillar', 'age_category', 'start_at', 'end_at', 'capacity', 'status']) as c(name)
  where not has_column_privilege('authenticated', 'tmc.class_sessions', c.name, 'select');
  if found then
    raise exception 'trainer_rls_lockdown: authenticated mist een toegestane kolom op class_sessions';
  end if;
  perform 1 from unnest(array['notes', 'cancellation_reason', 'template_id', 'blocks_free_training']) as c(name)
  where has_column_privilege('authenticated', 'tmc.class_sessions', c.name, 'select');
  if found then
    raise exception 'trainer_rls_lockdown: authenticated leest nog een afgeschermde kolom op class_sessions';
  end if;

  -- De UI-paden van leden blijven werken: boeken en annuleren via RPC.
  if not (has_function_privilege('authenticated', 'tmc.book_class_session(uuid, boolean, boolean)', 'execute')
      and has_function_privilege('authenticated', 'tmc.cancel_class_booking(uuid)', 'execute')) then
    raise exception 'trainer_rls_lockdown: authenticated mist EXECUTE op book_class_session of cancel_class_booking';
  end if;
end $$;
