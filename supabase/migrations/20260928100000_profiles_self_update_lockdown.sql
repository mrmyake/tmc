-- 20260928100000_profiles_self_update_lockdown.sql
--
-- fix/profiles-self-update-lockdown (discovery en akkoord 2026-09-27).
--
-- Kritiek lek: elk lid kon zichzelf admin maken. Policy profiles_self_update
-- (UPDATE, USING en WITH CHECK auth.uid() = id, geen kolombegrenzing) plus de
-- tabelbrede UPDATE-grant voor authenticated lieten "update tmc.profiles set
-- role = 'admin' where id = <eigen id>" slagen, waarna tmc.is_admin() true
-- gaf. In dezelfde proef (gewoon lid, teruggedraaide transactie) waren ook
-- member_code, is_test, mollie_customer_id, de acquisitievelden en
-- health_intake_completed_at vrij te zetten.
--
-- Tweede lek: policy profiles_trainer_read_relevant gaf een trainer de
-- volledige profielrij (health_notes, date_of_birth, adres, telefoon,
-- noodcontact, mollie_customer_id, acquisitie) van elk lid met een boeking in
-- een eigen les, zonder has_health_access-check. Geen enkel codepad gebruikt
-- die policy: alle trainerpaden (deelnemerslijst, klantpagina, kiosk) lezen
-- via service role en loadParticipants geeft health_notes alleen door bij
-- has_health_access.
--
-- Sweep over schema tmc (alle policies met UPDATE, INSERT of ALL die niet
-- admin-only zijn, plus grants): drie verdere gevallen bewezen als lid:
--   * waitlist_entries, policy waitlist_self_all (ALL): eigen entry op
--     position 0 zetten (de cron promoveert op position asc, dus voordringen)
--     en promoted_at, confirmation_deadline, confirmed_at en expired_at zelf
--     zetten. joinWaitlist berekende de positie bovendien client-side.
--   * membership_pauses, policy pauses_self_insert: pauze invoegen met
--     status 'active' of 'approved' en approved_by = zichzelf. Geen effect
--     op facturatie (de cron en admin_pause_membership werken vanaf
--     memberships.pause_effective_date, dat alleen een admin zet), wel
--     vervuiling van het pauze-overzicht en de audit.
--   * anon had volledige grants op profiles, membership_pauses,
--     trainer_hours en waitlist_entries zonder enig anon-pad.
-- pt_settings_trainer_own (ALL) stond een trainer toe eigen PT-instellingen
-- direct te zetten; geen cookie-pad schrijft daar. device_push_tokens en
-- trainer_hours_self_insert zijn in orde (eigen rij, status pending) en
-- blijven ongewijzigd.
--
-- Wat deze migratie doet:
--   1. profiles: tabelbrede UPDATE, INSERT en DELETE weg voor authenticated;
--      kolom-UPDATE voor authenticated op uitsluitend de velden die een lid
--      zelf beheert (naam, telefoon, geboortedatum, adres, noodcontact,
--      avatar, marketing opt-in). Nooit: role, member_code,
--      mollie_customer_id, is_test, email, age_category, locale, country,
--      company_name, vat_number, de acquisitievelden en de health-velden.
--      profiles_self_update blijft (USING en WITH CHECK auth.uid() = id).
--      profiles_trainer_read_relevant weg. Alles weg voor anon.
--   2. Nieuwe SECURITY DEFINER-RPC tmc.submit_health_intake(text): zet voor
--      auth.uid() health_notes en health_intake_completed_at samen. Het
--      schrijfpad van de acquisitievelden (recordAcquisitionOnLogin) gaat in
--      dezelfde PR naar de service-role-client.
--   3. waitlist_entries: waitlist_self_all weg, waitlist_self_read (SELECT)
--      ervoor terug; INSERT, UPDATE, DELETE weg voor authenticated, alles
--      weg voor anon. joinWaitlist schrijft in dezelfde PR via service role.
--   4. membership_pauses: pauses_self_insert krijgt een strengere WITH CHECK
--      (eigen membership, status 'pending', requested_by = auth.uid(),
--      approved_by en approved_at leeg) plus een kolom-INSERT-grant zonder
--      approved_by en approved_at; UPDATE en DELETE weg voor authenticated,
--      alles weg voor anon.
--   5. pt_settings: pt_settings_trainer_own (ALL) versmald tot
--      pt_settings_trainer_own_read (SELECT); INSERT, UPDATE, DELETE weg
--      voor authenticated.
--   6. trainer_hours: policy ongewijzigd; UPDATE en DELETE weg voor
--      authenticated (geen policy), alles weg voor anon.
--
-- Bewust NIET aangeraakt: profiles_admin_all, profiles_self_select en de
-- tabelbrede SELECT voor authenticated op profiles (alleen de eigen rij, en
-- /app/profiel toont die velden), device_push_tokens, trainer_hours_self_*,
-- memberships, orders, payments, credits, invoices, access_*, staff_pins,
-- no_show_strikes, membership_change_requests (alle admin_all plus
-- self_read, live geverifieerd), en de positie-race in joinWaitlist (twee
-- gelijktijdige inschrijvingen kunnen dezelfde positie krijgen; een RPC met
-- rij-lock is een vervolgpunt).
--
-- Replay-veilig (README punt 6): uitsluitend DROP/CREATE POLICY, REVOKE,
-- GRANT en CREATE OR REPLACE FUNCTION; geen afhankelijkheid van
-- applicatierijen. Het assertieblok laat de migratie falen als de
-- eindtoestand afwijkt.
--
-- Negatieve tests: scripts/test-profiles-lockdown.sql (transactie met
-- rollback, eigen wegwerp-fixtures, set role authenticated/anon met
-- request.jwt.claims).

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------

drop policy if exists profiles_trainer_read_relevant on tmc.profiles;

-- Policy opnieuw aanmaken met exact dezelfde USING en WITH CHECK, zodat de
-- definitie in deze migratie vastligt (de kolombegrenzing komt uit de grant).
drop policy if exists profiles_self_update on tmc.profiles;
create policy profiles_self_update on tmc.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke insert, update, delete on tmc.profiles from authenticated;
grant update (
  first_name, last_name, phone, date_of_birth,
  street_address, postal_code, city,
  emergency_contact_name, emergency_contact_phone,
  avatar_url, marketing_opt_in
) on tmc.profiles to authenticated;

revoke all on tmc.profiles from anon;

-- ---------------------------------------------------------------------------
-- 2. Health intake via RPC
-- ---------------------------------------------------------------------------

create or replace function tmc.submit_health_intake(p_health_notes text)
 returns void
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  if p_health_notes is null or btrim(p_health_notes) = '' then
    raise exception 'Intake is leeg.' using errcode = '22023';
  end if;

  update tmc.profiles
  set health_notes = p_health_notes,
      health_intake_completed_at = now()
  where id = v_uid;

  if not found then
    raise exception 'Profiel niet gevonden.' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function tmc.submit_health_intake(text) from public;
revoke all on function tmc.submit_health_intake(text) from anon;
grant execute on function tmc.submit_health_intake(text) to authenticated;
grant execute on function tmc.submit_health_intake(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. waitlist_entries
-- ---------------------------------------------------------------------------

drop policy if exists waitlist_self_all on tmc.waitlist_entries;
drop policy if exists waitlist_self_read on tmc.waitlist_entries;
create policy waitlist_self_read on tmc.waitlist_entries
  for select
  using (profile_id = auth.uid());

revoke insert, update, delete on tmc.waitlist_entries from authenticated;
revoke all on tmc.waitlist_entries from anon;

-- ---------------------------------------------------------------------------
-- 4. membership_pauses
-- ---------------------------------------------------------------------------

drop policy if exists pauses_self_insert on tmc.membership_pauses;
create policy pauses_self_insert on tmc.membership_pauses
  for insert
  with check (
    membership_id in (select m.id from tmc.memberships m where m.profile_id = auth.uid())
    and status = 'pending'
    and requested_by = auth.uid()
    and approved_by is null
    and approved_at is null
  );

revoke insert, update, delete on tmc.membership_pauses from authenticated;
grant insert (
  membership_id, start_date, end_date, reason, status,
  requested_by, medical_attest_url, notes
) on tmc.membership_pauses to authenticated;
revoke all on tmc.membership_pauses from anon;

-- ---------------------------------------------------------------------------
-- 5. pt_settings
-- ---------------------------------------------------------------------------

drop policy if exists pt_settings_trainer_own on tmc.pt_settings;
drop policy if exists pt_settings_trainer_own_read on tmc.pt_settings;
create policy pt_settings_trainer_own_read on tmc.pt_settings
  for select
  using (
    tmc.is_trainer()
    and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid())
  );

revoke insert, update, delete on tmc.pt_settings from authenticated;

-- ---------------------------------------------------------------------------
-- 6. trainer_hours
-- ---------------------------------------------------------------------------

revoke update, delete on tmc.trainer_hours from authenticated;
revoke all on tmc.trainer_hours from anon;

-- ---------------------------------------------------------------------------
-- Assertie: eindtoestand exact zoals bedoeld, anders rolt alles terug.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text;
begin
  -- profiles: policies
  if exists (select 1 from pg_policies where schemaname='tmc' and tablename='profiles' and policyname='profiles_trainer_read_relevant') then
    raise exception 'profiles_lockdown: profiles_trainer_read_relevant bestaat nog';
  end if;
  if (select count(*) from pg_policies where schemaname='tmc' and tablename='profiles'
        and policyname in ('profiles_admin_all','profiles_self_select','profiles_self_update')) <> 3 then
    raise exception 'profiles_lockdown: profiles-policies onvolledig';
  end if;
  if (select with_check from pg_policies where schemaname='tmc' and tablename='profiles' and policyname='profiles_self_update') is null then
    raise exception 'profiles_lockdown: profiles_self_update mist WITH CHECK';
  end if;

  -- profiles: grants
  if has_table_privilege('authenticated', 'tmc.profiles', 'update')
     or has_table_privilege('authenticated', 'tmc.profiles', 'insert')
     or has_table_privilege('authenticated', 'tmc.profiles', 'delete')
     or has_any_column_privilege('authenticated', 'tmc.profiles', 'insert') then
    raise exception 'profiles_lockdown: authenticated heeft nog tabelbrede UPDATE, INSERT of DELETE op profiles';
  end if;
  if not has_table_privilege('authenticated', 'tmc.profiles', 'select') then
    raise exception 'profiles_lockdown: authenticated mist SELECT op profiles';
  end if;
  perform 1 from unnest(array['first_name','last_name','phone','date_of_birth','street_address','postal_code','city','emergency_contact_name','emergency_contact_phone','avatar_url','marketing_opt_in']) as c(name)
  where not has_column_privilege('authenticated', 'tmc.profiles', c.name, 'update');
  if found then raise exception 'profiles_lockdown: authenticated mist een toegestane UPDATE-kolom op profiles'; end if;
  perform 1 from unnest(array['role','member_code','mollie_customer_id','is_test','email','age_category','locale','country','company_name','vat_number','acquisition_source','acquisition_medium','acquisition_campaign','acquisition_content','signup_path','first_touch_at','health_notes','health_intake_completed_at','id','created_at','updated_at']) as c(name)
  where has_column_privilege('authenticated', 'tmc.profiles', c.name, 'update');
  if found then raise exception 'profiles_lockdown: authenticated kan nog een afgeschermde kolom op profiles wijzigen'; end if;
  if has_any_column_privilege('anon', 'tmc.profiles', 'select') or has_any_column_privilege('anon', 'tmc.profiles', 'update')
     or has_any_column_privilege('anon', 'tmc.profiles', 'insert') or has_table_privilege('anon', 'tmc.profiles', 'delete') then
    raise exception 'profiles_lockdown: anon heeft nog rechten op profiles';
  end if;

  -- RPC
  select pg_get_functiondef('tmc.submit_health_intake(text)'::regprocedure) into v_def;
  if v_def !~ 'SECURITY DEFINER' or v_def !~ 'search_path' then
    raise exception 'profiles_lockdown: submit_health_intake is geen SECURITY DEFINER met search_path';
  end if;
  if not has_function_privilege('authenticated', 'tmc.submit_health_intake(text)', 'execute')
     or has_function_privilege('anon', 'tmc.submit_health_intake(text)', 'execute') then
    raise exception 'profiles_lockdown: EXECUTE op submit_health_intake klopt niet (authenticated ja, anon nee)';
  end if;

  -- waitlist_entries
  if exists (select 1 from pg_policies where schemaname='tmc' and tablename='waitlist_entries' and policyname='waitlist_self_all') then
    raise exception 'profiles_lockdown: waitlist_self_all bestaat nog';
  end if;
  if (select count(*) from pg_policies where schemaname='tmc' and tablename='waitlist_entries' and policyname in ('waitlist_admin_all','waitlist_self_read')) <> 2 then
    raise exception 'profiles_lockdown: waitlist-policies onvolledig';
  end if;

  -- membership_pauses
  if (select with_check from pg_policies where schemaname='tmc' and tablename='membership_pauses' and policyname='pauses_self_insert') !~ 'pending' then
    raise exception 'profiles_lockdown: pauses_self_insert eist geen status pending';
  end if;
  if has_table_privilege('authenticated', 'tmc.membership_pauses', 'insert')
     or has_column_privilege('authenticated', 'tmc.membership_pauses', 'approved_by', 'insert')
     or has_column_privilege('authenticated', 'tmc.membership_pauses', 'approved_at', 'insert')
     or not has_column_privilege('authenticated', 'tmc.membership_pauses', 'membership_id', 'insert') then
    raise exception 'profiles_lockdown: kolom-INSERT-grant op membership_pauses klopt niet';
  end if;

  -- pt_settings
  if exists (select 1 from pg_policies where schemaname='tmc' and tablename='pt_settings' and policyname='pt_settings_trainer_own') then
    raise exception 'profiles_lockdown: pt_settings_trainer_own bestaat nog';
  end if;
  if (select cmd from pg_policies where schemaname='tmc' and tablename='pt_settings' and policyname='pt_settings_trainer_own_read') <> 'SELECT' then
    raise exception 'profiles_lockdown: pt_settings_trainer_own_read is geen SELECT-policy';
  end if;

  -- Geen schrijfrechten meer waar geen policy ze draagt.
  perform 1 from (values ('waitlist_entries'), ('pt_settings')) as t(name)
  where has_table_privilege('authenticated', 'tmc.' || t.name, 'insert')
     or has_table_privilege('authenticated', 'tmc.' || t.name, 'update')
     or has_table_privilege('authenticated', 'tmc.' || t.name, 'delete')
     or has_any_column_privilege('authenticated', 'tmc.' || t.name, 'insert')
     or has_any_column_privilege('authenticated', 'tmc.' || t.name, 'update');
  if found then raise exception 'profiles_lockdown: authenticated heeft nog schrijfrechten op waitlist_entries of pt_settings'; end if;
  if has_table_privilege('authenticated', 'tmc.membership_pauses', 'update') or has_table_privilege('authenticated', 'tmc.membership_pauses', 'delete')
     or has_table_privilege('authenticated', 'tmc.trainer_hours', 'update') or has_table_privilege('authenticated', 'tmc.trainer_hours', 'delete') then
    raise exception 'profiles_lockdown: authenticated heeft nog UPDATE of DELETE op membership_pauses of trainer_hours';
  end if;
  if not has_table_privilege('authenticated', 'tmc.trainer_hours', 'insert') then
    raise exception 'profiles_lockdown: authenticated mist INSERT op trainer_hours (cookie-pad trainer-hours-actions)';
  end if;

  -- anon: niets op de vier tabellen.
  perform 1 from (values ('profiles'), ('membership_pauses'), ('trainer_hours'), ('waitlist_entries')) as t(name)
  where has_any_column_privilege('anon', 'tmc.' || t.name, 'select')
     or has_any_column_privilege('anon', 'tmc.' || t.name, 'insert')
     or has_any_column_privilege('anon', 'tmc.' || t.name, 'update')
     or has_table_privilege('anon', 'tmc.' || t.name, 'delete');
  if found then raise exception 'profiles_lockdown: anon heeft nog rechten op profiles, membership_pauses, trainer_hours of waitlist_entries'; end if;

  -- service_role houdt zijn schrijfpad.
  perform 1 from (values ('profiles'), ('waitlist_entries'), ('membership_pauses'), ('pt_settings'), ('trainer_hours')) as t(name)
  where not (has_table_privilege('service_role', 'tmc.' || t.name, 'insert')
         and has_table_privilege('service_role', 'tmc.' || t.name, 'update')
         and has_table_privilege('service_role', 'tmc.' || t.name, 'delete'));
  if found then raise exception 'profiles_lockdown: service_role mist rechten'; end if;
end $$;
