-- 20260911000000_guest_bookings_write_gate.sql
--
-- Schrijven naar tmc.guest_bookings verloopt uitsluitend via
-- tmc.book_guest_session(); de attendance-updates (markGuestAttendance in
-- src/lib/admin/attendance-actions.ts) en de reminder_sent-update
-- (src/lib/member/guest-pass-actions.ts) lopen via service_role
-- (createAdminClient). Geen enkel applicatiepad schrijft als
-- authenticated rechtstreeks naar deze tabel.
--
-- Aanleiding (discovery guest passes, 2026-09-08; fase 1 geverifieerd
-- 2026-09-09): tmc.guest_bookings had table-grants INSERT/UPDATE/DELETE
-- voor authenticated (relacl: authenticated=arwd) plus de RLS-policy
-- guest_bookings_self_insert met als enige eis booked_by = auth.uid().
-- Daarmee kon een lid via PostgREST rechtstreeks een guest_bookings-rij
-- aanmaken, buiten book_guest_session() om. Dat pad verhoogt
-- guest_passes.passes_used niet en controleert het eigendom van
-- guest_pass_id niet (de FK eist alleen dat de pass bestaat), dus het
-- quotum per periode was client-side te omzeilen. tmc.bookings hanteert
-- het juiste patroon: geen self-insert policy, schrijven kan alleen via
-- book_class_session(). Deze migratie brengt guest_bookings naar datzelfde
-- patroon, met daarbovenop de REVOKE op tabelniveau (riem en bretels).
--
-- Wat deze migratie doet:
--   1. DROP POLICY guest_bookings_self_insert en guest_bookings_self_cancel.
--      Het cancel-pad: fase 1 bevestigde dat er geen enkel member-facing
--      annuleerpad bestaat (geen action, geen route, geen UI-knop), dus de
--      policy was dood. Het annuleerpad wordt later opnieuw gebouwd met
--      restitutie van de pass, dan via een RPC en niet via een directe
--      policy.
--   2. REVOKE INSERT, UPDATE, DELETE op tmc.guest_bookings van
--      authenticated. SELECT blijft: guest_bookings_self_read en
--      guest_bookings_trainer_read blijven werken.
--   3. REVOKE ALL op tmc.guest_bookings en tmc.guest_passes van anon. Een
--      uitgelogde bezoeker heeft hier niets te zoeken. Geen enkele
--      RLS-policy op deze tabellen matcht anon (allemaal auth.uid(),
--      is_admin() of is_trainer()), en het publieke rooster leest de
--      gasttelling via v_session_availability, een view zonder
--      security_invoker (owner postgres), dus anon heeft geen SELECT op de
--      onderliggende tabellen nodig. Precedent: tmc.trial_bookings heeft
--      ook geen anon- of authenticated-grants.
--
-- Bewust NIET aangeraakt:
--   - tmc.book_guest_session: de live definitie (pg_get_functiondef,
--     2026-09-09) controleert het eigendom van de pass al
--     (v_pass.profile_id <> auth.uid() geeft pass_not_found) en lockt de
--     pass- en sessierij. Geen drop-and-recreate, geen cosmetische
--     wijziging; de EXECUTE-grant voor authenticated wordt hieronder
--     alleen geasserteerd.
--   - guest_bookings_admin_all, guest_bookings_self_read,
--     guest_bookings_trainer_read, guest_passes_admin_all en
--     guest_passes_self_read: ongewijzigd.
--   - De schrijf-grants van authenticated op tmc.guest_passes: die tabel
--     heeft geen self-insert/update policy, dus RLS blokkeert elke
--     directe schrijfactie al. Buiten de scope van deze fix, net als
--     dezelfde ruwe grants op tmc.bookings.
--   - De trigger guest_bookings_enforce_capacity en de view
--     v_session_availability: ongewijzigd.
--
-- Replay-safe en idempotent: alleen DROP POLICY IF EXISTS en REVOKE, geen
-- afhankelijkheid van applicatiedata (beide tabellen waren leeg op het
-- moment van deze fix). De assertie aan het eind faalt de migratie als de
-- eindtoestand niet klopt, zodat een gedeeltelijke toepassing niet
-- stilzwijgend blijft staan.

-- ---------------------------------------------------------------------------
-- 1. Policies die directe schrijfacties door leden toestonden.
-- ---------------------------------------------------------------------------

drop policy if exists guest_bookings_self_insert on tmc.guest_bookings;
drop policy if exists guest_bookings_self_cancel on tmc.guest_bookings;

-- ---------------------------------------------------------------------------
-- 2. Table-grants: authenticated alleen nog SELECT op guest_bookings.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on tmc.guest_bookings from authenticated;

-- ---------------------------------------------------------------------------
-- 3. anon: geen enkel grant op beide tabellen.
-- ---------------------------------------------------------------------------

revoke all on tmc.guest_bookings from anon;
revoke all on tmc.guest_passes from anon;

-- ---------------------------------------------------------------------------
-- Assertie: eindtoestand exact zoals bedoeld, anders rolt alles terug.
-- ---------------------------------------------------------------------------

do $$
begin
  -- De twee policies zijn weg.
  if exists (
    select 1 from pg_policies
    where schemaname = 'tmc' and tablename = 'guest_bookings'
      and policyname in ('guest_bookings_self_insert', 'guest_bookings_self_cancel')
  ) then
    raise exception 'guest_bookings_write_gate: self_insert of self_cancel policy bestaat nog';
  end if;

  -- De policies die moeten blijven, zijn er nog.
  if (
    select count(*) from pg_policies
    where schemaname = 'tmc' and tablename = 'guest_bookings'
      and policyname in ('guest_bookings_self_read', 'guest_bookings_trainer_read', 'guest_bookings_admin_all')
  ) <> 3 then
    raise exception 'guest_bookings_write_gate: self_read, trainer_read of admin_all policy ontbreekt';
  end if;
  if (
    select count(*) from pg_policies
    where schemaname = 'tmc' and tablename = 'guest_passes'
      and policyname in ('guest_passes_self_read', 'guest_passes_admin_all')
  ) <> 2 then
    raise exception 'guest_bookings_write_gate: guest_passes self_read of admin_all policy ontbreekt';
  end if;

  -- authenticated: alleen SELECT op guest_bookings, ook op kolomniveau.
  if has_table_privilege('authenticated', 'tmc.guest_bookings', 'insert')
     or has_table_privilege('authenticated', 'tmc.guest_bookings', 'update')
     or has_table_privilege('authenticated', 'tmc.guest_bookings', 'delete')
     or has_any_column_privilege('authenticated', 'tmc.guest_bookings', 'insert')
     or has_any_column_privilege('authenticated', 'tmc.guest_bookings', 'update')
  then
    raise exception 'guest_bookings_write_gate: authenticated heeft nog schrijfrechten op guest_bookings';
  end if;
  if not has_table_privilege('authenticated', 'tmc.guest_bookings', 'select') then
    raise exception 'guest_bookings_write_gate: authenticated mist SELECT op guest_bookings';
  end if;

  -- anon: niets op beide tabellen, ook niet op kolomniveau.
  if has_any_column_privilege('anon', 'tmc.guest_bookings', 'select')
     or has_any_column_privilege('anon', 'tmc.guest_bookings', 'insert')
     or has_any_column_privilege('anon', 'tmc.guest_bookings', 'update')
     or has_table_privilege('anon', 'tmc.guest_bookings', 'delete')
     or has_any_column_privilege('anon', 'tmc.guest_passes', 'select')
     or has_any_column_privilege('anon', 'tmc.guest_passes', 'insert')
     or has_any_column_privilege('anon', 'tmc.guest_passes', 'update')
     or has_table_privilege('anon', 'tmc.guest_passes', 'delete')
  then
    raise exception 'guest_bookings_write_gate: anon heeft nog rechten op guest_bookings of guest_passes';
  end if;

  -- service_role houdt zijn schrijfpad (attendance, reminder_sent).
  if not (has_table_privilege('service_role', 'tmc.guest_bookings', 'update')
          and has_table_privilege('service_role', 'tmc.guest_bookings', 'insert')
          and has_table_privilege('service_role', 'tmc.guest_passes', 'insert')) then
    raise exception 'guest_bookings_write_gate: service_role mist schrijfrechten';
  end if;

  -- Het UI-pad blijft werken: authenticated mag de RPC uitvoeren.
  if not has_function_privilege('authenticated', 'tmc.book_guest_session(uuid, uuid, text, text)', 'execute') then
    raise exception 'guest_bookings_write_gate: authenticated mist EXECUTE op book_guest_session';
  end if;
end $$;
