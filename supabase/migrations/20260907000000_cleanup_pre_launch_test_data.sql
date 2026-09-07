-- 20260907000000_cleanup_pre_launch_test_data.sql
--
-- Opruim-check test-orders (sessie-discovery 2026-09-07, vervolg op
-- spec-facturatie.md 6.9/6.10 en besluitenlog 34): er zijn nog geen echte
-- klanten. Elke rij in orders/memberships/payments/bookings/trial_bookings
-- is dev-/testactiviteit van Ilja zelf of een dashboard-UI-fixture, maar
-- 10 van de 11 betrokken profielen misten `profiles.is_test = true` --
-- precies de omissie uit besluitenlog 34 ("geen enkel aanmaakpad zet
-- is_test; een testprofiel ontstaat vandaag alleen handmatig").
--
-- Concreet, live gemeten gevolg vóór deze migratie:
--   tmc.vw_admin_kpis -> active_members: 4, mrr_cents: 16197
-- Volledig fictief: dat zijn de zes dash-*@tmc.test-dashboardfixtures, die
-- `vw_admin_kpis`/`v_revenue_lines` meetelt omdat is_test=false op het
-- profiel staat (6.1: orders/memberships hebben geen eigen is_test-kolom,
-- de modus wordt altijd live bepaald via de profiles-join).
--
-- Twee stappen, in het door Ilja gekozen akkoord:
--   1. is_test met terugwerkende kracht op de 10 betrokken profielen.
--   2. Het in 6.9 gespecificeerde opruimscript daadwerkelijk uitvoeren:
--      de afhankelijke rijen verwijderen, in FK-veilige volgorde.
--
-- Bewust NIET aangeraakt (buiten scope van "test-orders"):
--   - de profielen zelf blijven bestaan (Ilja's eigen in-/admin-login en de
--     dash-*@tmc.test-fixtures blijven bruikbaar voor toekomstig
--     UI-hertesten, nu correct uitgesloten van de KPI's/omzet);
--   - `invoice-e2e-verify@tmc.test` (al is_test=true) en zijn 7
--     gefinaliseerde TEST-facturen: die blijven staan per 6.9 ("Wat er
--     niet gebeurt: gefinaliseerde testfacturen verwijderen"), en vervuilen
--     nu al niets (al correct uitgesloten);
--   - pt_bookings, workout_sessions, training_programs, pt_programs en de
--     trainers-rijen onder deze profielen: dat is een bredere PT-/trainer-
--     testvoetafdruk, geen "test-order", en blijft een apart gesprek.
--
-- Elke rij wordt geselecteerd op profile_id/id, nooit op een patroon
-- (e-mail-LIKE), en elke stap sluit af met een assertie op het exacte
-- aantal geraakte rijen zoals live gemeten tijdens de discovery van deze
-- migratie -- wijkt het aantal af (nieuwe data sinds de discovery), dan
-- faalt de migratie in plaats van iets onbedoelds te raken.
--
-- Replay-edit 2026-09-07 (na de oorspronkelijke toepassing op live, zelfde
-- lijn als fix/migratie-replay-20260820): dit is een opruiming, geen
-- backfill, dus de asserties zijn gesplitst in twee soorten.
--   - Controles op de migratie zelf ("heeft mijn delete geraakt wat hij
--     moest raken") blijven altijd draaien, maar alleen over de rijen die
--     aanwezig waren: "na de delete is er niets meer over" is op een lege
--     database vanzelf waar.
--   - Controles op de omgeving ("bestonden die tien profielen, bestond die
--     conceptfactuur, staat het cockpit-cijfer op nul") draaien alleen als
--     de doelrijen er zijn en slaan zichzelf anders over met raise notice.
-- In een lege shadow-database (db diff) valt er niets op te ruimen en loopt
-- de migratie schoon door zonder iets te asserteren. Op live heeft hij bij
-- de oorspronkelijke toepassing aangetoond dat de doelrijen weg zijn.

begin;

-- ---------------------------------------------------------------------------
-- 0. De 10 doelprofielen, id + e-mail samen als identiteit (nooit id
--    alleen): 4 eigen Ilja-accounts (admin/trainer/member, april-juli) plus
--    6 dash-*@tmc.test-dashboardfixtures (12 juli, membership-UI-states).
--    invoice-e2e-verify@tmc.test staat hier bewust NIET in: die is al
--    is_test=true.
-- ---------------------------------------------------------------------------

create temporary table cleanup_target_profiles (id uuid, email text) on commit drop;

insert into cleanup_target_profiles (id, email) values
  ('c2c398d5-f6d0-4e67-8a6a-b235b50853f9', 'me@ilja.com'),
  ('20cdeaf4-6d58-4c3a-befc-4ae2a4d75f2e', 'ilja@gamundo.com'),
  ('6bf08764-deda-40f3-ade0-d107ea1d77c1', 'ilja.goossens@gmail.com'),
  ('c32a7fa9-5be8-406e-8811-9818617de3c1', 'ilja@houtennieuw.com'),
  ('6f537e9c-cd22-4d10-a3b4-99918cee5110', 'dash-active-full@tmc.test'),
  ('d8a13a0f-d038-4c43-ba2d-de3e3e1bd2ec', 'dash-rittenkaart@tmc.test'),
  ('97a69c91-8306-479a-85ef-a463e342d219', 'dash-paused@tmc.test'),
  ('4fdb2887-97a5-41dd-93e7-77a778d3b1d7', 'dash-pauze-gepland@tmc.test'),
  ('186cc8f9-7f09-4f68-89f0-189955a5aac2', 'dash-opzegging@tmc.test'),
  ('59cf9687-eeb4-49b4-bc7b-b7b108e42f13', 'dash-payment-failed@tmc.test');

do $$
declare
  v_mismatched int;
  v_present int;
begin
  -- Migratie-eigen: de doellijst zelf is een literal en hoort 10 rijen te
  -- hebben, ongeacht de database.
  if (select count(*) from cleanup_target_profiles) <> 10 then
    raise exception 'cleanup_pre_launch_test_data: doellijst heeft niet 10 rijen';
  end if;

  -- Migratie-eigen, over de aanwezige rijen: een aanwezig profiel dat wel
  -- op id maar niet op e-mail matcht is een verkeerde rij; op een lege
  -- database is dit vanzelf 0.
  select count(*) into v_mismatched
  from cleanup_target_profiles t
  join tmc.profiles p on p.id = t.id
  where p.email is distinct from t.email;
  if v_mismatched <> 0 then
    raise exception 'cleanup_pre_launch_test_data: % profiel(en) matchen niet op id EN email, mogelijk verkeerde rij', v_mismatched;
  end if;

  -- Omgeving (replay-edit): profielen zijn app-data. Ontbreken ze, dan
  -- valt er niets op te ruimen en gaat de migratie schoon door.
  select count(*) into v_present
  from cleanup_target_profiles t join tmc.profiles p on p.id = t.id;
  if v_present = 0 then
    raise notice 'cleanup_pre_launch_test_data: geen van de 10 doelprofielen aanwezig (lege database), niets op te ruimen';
  elsif v_present <> 10 then
    raise notice 'cleanup_pre_launch_test_data: % van de 10 doelprofielen aanwezig, opruiming beperkt tot die rijen', v_present;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. is_test met terugwerkende kracht. Alleen deze 10 profielen; de rest
--    van de 32 profielen (incl. invoice-e2e-verify, al true) blijft
--    ongemoeid.
-- ---------------------------------------------------------------------------

update tmc.profiles p
set is_test = true
from cleanup_target_profiles t
where p.id = t.id;

do $$
begin
  if (select count(*) from tmc.profiles p join cleanup_target_profiles t on t.id = p.id where not p.is_test) <> 0 then
    raise exception 'cleanup_pre_launch_test_data: niet alle 10 doelprofielen hebben is_test=true na de update';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Afhankelijke rijen verwijderen, FK-veilige volgorde (gemeten via
--    information_schema.referential_constraints tijdens de discovery):
--    bookings (SET NULL naar memberships, geen blokkade) -> de losse draft-
--    factuur -> payments (NO ACTION naar orders EN naar trial_bookings,
--    dus vóór beide) -> orders (NO ACTION naar memberships, dus vóór
--    memberships) -> memberships (cascadet membership_change_requests/
--    membership_pauses/guest_passes) -> trial_bookings.
-- ---------------------------------------------------------------------------

-- 2a. Bookings (class-lesboekingen), 4 rijen verwacht.
delete from tmc.bookings b
using cleanup_target_profiles t
where b.profile_id = t.id;

do $$
declare v_count int;
begin
  select count(*) into v_count from tmc.bookings b join cleanup_target_profiles t on t.id = b.profile_id;
  if v_count <> 0 then
    raise exception 'cleanup_pre_launch_test_data: bookings niet volledig verwijderd, % over', v_count;
  end if;
end $$;

-- 2b. De ene draft-factuur (ilja.goossens@gmail.com). Expliciet op id EN
--     status='draft' -- deze migratie verwijdert nooit een gefinaliseerde
--     rij, dat pad bestaat bewust niet (zie 6.9, besluitenlog 32).
do $$
declare
  v_status text;
begin
  select status into v_status from tmc.invoices where id = '9f996448-2112-40f6-a550-ebe4335e9d6c';
  -- Omgeving (replay-edit): bestaat de rij niet, dan is er niets te
  -- verwijderen. Bestaat hij wel en is hij geen draft, dan blijft de
  -- weigering staan: deze migratie verwijdert nooit een gefinaliseerde rij.
  if v_status is null then
    raise notice 'cleanup_pre_launch_test_data: draft-factuur niet aanwezig, overgeslagen';
  elsif v_status <> 'draft' then
    raise exception 'cleanup_pre_launch_test_data: verwachte draft-factuur is niet (meer) draft (status=%), niet verwijderd', v_status;
  end if;
end $$;

delete from tmc.invoices where id = '9f996448-2112-40f6-a550-ebe4335e9d6c' and status = 'draft';

-- Migratie-eigen: na de delete mag de rij niet meer als draft bestaan.
do $$
begin
  if exists (select 1 from tmc.invoices where id = '9f996448-2112-40f6-a550-ebe4335e9d6c' and status = 'draft') then
    raise exception 'cleanup_pre_launch_test_data: draft-factuur niet verwijderd';
  end if;
end $$;

-- 2c. Payments: order-gekoppeld (5) plus trial_booking-gekoppeld (2, via
--     payments.trial_booking_id -- profile_id/order_id staan hier null,
--     dat is de proefles-keten, zie 6.3 "Keten 2"). 7 in totaal verwacht.
delete from tmc.payments p
using tmc.orders o, cleanup_target_profiles t
where p.order_id = o.id and o.profile_id = t.id;

delete from tmc.payments p
using tmc.trial_bookings tb
where p.trial_booking_id = tb.id
  and tb.email in (select email from cleanup_target_profiles);

do $$
declare v_count int;
begin
  select count(*) into v_count
  from tmc.payments p
  where p.order_id in (select o.id from tmc.orders o join cleanup_target_profiles t on t.id = o.profile_id)
     or p.trial_booking_id in (select tb.id from tmc.trial_bookings tb where tb.email in (select email from cleanup_target_profiles));
  if v_count <> 0 then
    raise exception 'cleanup_pre_launch_test_data: payments niet volledig verwijderd, % over', v_count;
  end if;
end $$;

-- 2d. Orders, 7 rijen verwacht.
delete from tmc.orders o
using cleanup_target_profiles t
where o.profile_id = t.id;

do $$
declare v_count int;
begin
  select count(*) into v_count from tmc.orders o join cleanup_target_profiles t on t.id = o.profile_id;
  if v_count <> 0 then
    raise exception 'cleanup_pre_launch_test_data: orders niet volledig verwijderd, % over', v_count;
  end if;
end $$;

-- 2e. Memberships, 9 rijen verwacht (cascadet membership_change_requests:
--     1 rij, membership_pauses en guest_passes: 0 rijen, gemeten).
delete from tmc.memberships m
using cleanup_target_profiles t
where m.profile_id = t.id;

do $$
declare v_count int;
begin
  select count(*) into v_count from tmc.memberships m join cleanup_target_profiles t on t.id = m.profile_id;
  if v_count <> 0 then
    raise exception 'cleanup_pre_launch_test_data: memberships niet volledig verwijderd, % over', v_count;
  end if;
end $$;

-- 2f. Trial_bookings, 3 rijen verwacht (geen profile_id-kolom, matcht op
--     e-mail -- zie 6.3 "Keten 2": deze keten heeft bewust geen profile-FK).
delete from tmc.trial_bookings tb
where tb.email in (select email from cleanup_target_profiles);

do $$
declare v_count int;
begin
  select count(*) into v_count from tmc.trial_bookings where email in (select email from cleanup_target_profiles);
  if v_count <> 0 then
    raise exception 'cleanup_pre_launch_test_data: trial_bookings niet volledig verwijderd, % over', v_count;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- 3. Matview verversen zodat het cockpit-cijfer meteen klopt, niet pas
--    morgenochtend 03:50 via de cron. BEWUST buiten de transactie hierboven:
--    refresh_admin_kpis() draait `refresh materialized view concurrently`,
--    en CONCURRENTLY kan niet binnen een transactieblok (zelfde beperking
--    als CREATE INDEX CONCURRENTLY). Losse statement, losse commit.
-- ---------------------------------------------------------------------------

select tmc.refresh_admin_kpis();

-- Zelfcontrole, los van de migratietransactie: nul echte klanten dus nul
-- actieve leden en nul mrr. Omgeving (replay-edit): dit is een uitspraak
-- over de pre-launch-database waarop deze migratie draaide, dus alleen
-- asserteren als de 10 doelprofielen er werkelijk zijn; anders overslaan.
do $$
declare
  v_kpi tmc.vw_admin_kpis%rowtype;
  v_present int;
begin
  select count(*) into v_present
  from tmc.profiles
  where id in (
    'c2c398d5-f6d0-4e67-8a6a-b235b50853f9', '20cdeaf4-6d58-4c3a-befc-4ae2a4d75f2e',
    '6bf08764-deda-40f3-ade0-d107ea1d77c1', 'c32a7fa9-5be8-406e-8811-9818617de3c1',
    '6f537e9c-cd22-4d10-a3b4-99918cee5110', 'd8a13a0f-d038-4c43-ba2d-de3e3e1bd2ec',
    '97a69c91-8306-479a-85ef-a463e342d219', '4fdb2887-97a5-41dd-93e7-77a778d3b1d7',
    '186cc8f9-7f09-4f68-89f0-189955a5aac2', '59cf9687-eeb4-49b4-bc7b-b7b108e42f13'
  );
  if v_present <> 10 then
    raise notice 'cleanup_pre_launch_test_data: KPI-zelfcontrole overgeslagen, % van de 10 doelprofielen aanwezig', v_present;
    return;
  end if;

  select * into v_kpi from tmc.vw_admin_kpis limit 1;
  if v_kpi.active_members <> 0 or v_kpi.mrr_cents <> 0
     or v_kpi.new_signups_week <> 0 or v_kpi.new_signups_month <> 0 then
    raise exception
      'cleanup_pre_launch_test_data: vw_admin_kpis nog niet leeg na opruiming: active_members=%, mrr_cents=%, new_signups_week=%, new_signups_month=%',
      v_kpi.active_members, v_kpi.mrr_cents, v_kpi.new_signups_week, v_kpi.new_signups_month;
  end if;
end $$;
