-- 20260907130000_mark_fixture_profiles_is_test.sql
--
-- fix/testdata-markeren (discovery 2026-09-07, akkoord op fase 1 en 2).
-- Vervolg op 20260907000000_cleanup_pre_launch_test_data.sql: die migratie
-- zette profiles.is_test met terugwerkende kracht op de 10 profielen met
-- test-activiteit, maar liet de overige fixtureprofielen op false staan.
-- Live gemeten tijdens de discovery: 21 profielen met is_test = false,
-- waarvan 15 fixtures (14 op @tmc.test plus me@ilja.cpom, een typefout-
-- signup die nooit bevestigd is), allemaal rol member, allemaal zonder
-- membership, order, payment of trial_booking. Zodra er met Mollie getest
-- wordt op die profielen tellen ze mee als echte leden in tmc.vw_admin_kpis
-- en krijgen ze de live-Mollie-key (create_order, admin_create_order,
-- mollie-mode.ts, payment-link.ts lezen allemaal profiles.is_test).
--
-- Wat deze migratie doet: is_test = true op elk profiel dat aan het
-- criterium voldoet. Criterium, in de where-clausule en nergens anders:
--   - e-mail eindigt op @tmc.test OF is exact me@ilja.cpom, EN
--   - role = 'member' (extra slot: een toekomstig @tmc.test-adres met rol
--     trainer of admin gaat nooit per ongeluk mee), EN
--   - is_test staat nog op false (idempotent, en de "geraakt"-telling
--     hieronder klopt daardoor ook bij een tweede keer draaien).
--
-- Bewust NIET aangeraakt: marlon@ptloosdrecht.nl (admin, echt),
-- marlonvanderleij@gmail.com en ewoutintveld@gmail.com (echte adressen),
-- en alles op @trainers.test (fixture-trainers, ander domein, buiten het
-- criterium). Geen refresh van tmc.vw_admin_kpis: geen van de 15 heeft een
-- membership, dus de huidige KPI-waarden veranderen niet. De ledenlijst
-- (/app/admin/leden) filtert nergens op is_test en blijft deze profielen
-- tonen; dat is een openstaand punt, geen onderdeel van deze migratie.
--
-- Replay-veilig (README punt 6): geen hardgecodeerde ids, en de
-- omgevingsassertie "exact 15 geraakt" draait alleen als er doelrijen
-- waren. In een lege shadow-database (db diff) raakt de update niets, logt
-- de migratie een notice en slaagt hij. De migratie-eigen controle ("na
-- afloop voldoet geen enkele rij meer aan het criterium met is_test =
-- false") draait altijd en is op een lege database vanzelf waar.

begin;

-- ---------------------------------------------------------------------------
-- 1. De update, met de geraakte rijen vastgehouden voor de asserties.
-- ---------------------------------------------------------------------------

create temporary table fixture_profiles_touched (id uuid, email text, role text)
  on commit drop;

with touched as (
  update tmc.profiles p
  set is_test = true
  where p.role = 'member'
    and not p.is_test
    and (p.email like '%@tmc.test' or p.email = 'me@ilja.cpom')
  returning p.id, p.email, p.role
)
insert into fixture_profiles_touched (id, email, role)
select id, email, role from touched;

-- ---------------------------------------------------------------------------
-- 2. Asserties.
-- ---------------------------------------------------------------------------

do $$
declare
  v_left      int;
  v_forbidden int;
  v_wrong_role int;
  v_touched   int;
begin
  -- Migratie-eigen, altijd: na de update mag geen enkele rij meer aan het
  -- criterium voldoen met is_test = false. Op een lege database is dit
  -- vanzelf 0.
  select count(*) into v_left
  from tmc.profiles p
  where p.role = 'member'
    and not p.is_test
    and (p.email like '%@tmc.test' or p.email = 'me@ilja.cpom');
  if v_left <> 0 then
    raise exception 'mark_fixture_profiles_is_test: % rij(en) voldoen nog aan het criterium met is_test = false', v_left;
  end if;

  -- Migratie-eigen, altijd: de expliciet uitgesloten adressen zijn niet
  -- geraakt. Het criterium kan ze niet matchen, maar dit legt dat vast.
  select count(*) into v_forbidden
  from fixture_profiles_touched t
  where t.email in ('marlon@ptloosdrecht.nl', 'marlonvanderleij@gmail.com', 'ewoutintveld@gmail.com')
     or t.email like '%@trainers.test';
  if v_forbidden <> 0 then
    raise exception 'mark_fixture_profiles_is_test: % uitgesloten profiel(en) geraakt, dat mag niet', v_forbidden;
  end if;

  -- Migratie-eigen, altijd: alleen rol member is geraakt.
  select count(*) into v_wrong_role
  from fixture_profiles_touched t
  where t.role is distinct from 'member';
  if v_wrong_role <> 0 then
    raise exception 'mark_fixture_profiles_is_test: % profiel(en) met een andere rol dan member geraakt', v_wrong_role;
  end if;

  -- Omgeving: het exacte aantal, live gemeten tijdens de discovery van
  -- 2026-09-07. Alleen asserteren als er doelrijen waren; op een lege
  -- database (of als de vlag al eerder omging) niets te controleren.
  select count(*) into v_touched from fixture_profiles_touched;
  if v_touched = 0 then
    raise notice 'mark_fixture_profiles_is_test: geen doelrijen aanwezig (lege database of al gemarkeerd), niets gewijzigd';
  elsif v_touched <> 15 then
    raise exception 'mark_fixture_profiles_is_test: % profiel(en) geraakt, 15 verwacht (14 op @tmc.test plus me@ilja.cpom)', v_touched;
  else
    raise notice 'mark_fixture_profiles_is_test: 15 fixtureprofielen op is_test = true gezet';
  end if;
end $$;

commit;
