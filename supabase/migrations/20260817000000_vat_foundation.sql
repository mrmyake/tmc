-- Facturatie PR 1 (spec-facturatie.md sectie 14): het BTW-fundament.
--
-- Drie losse dingen die samen de bodem leggen onder de facturatieketen, en
-- die bewust in één migratie zitten omdat ze alle drie puur additief zijn
-- en niets aan gedrag veranderen:
--
--   1. tmc.catalogue krijgt vat_rate_bp en revenue_category (sectie 2.1)
--   2. tmc.profiles krijgt is_test, company_name en vat_number (sectie 2.3)
--   3. tmc.payments verliest de grants die RLS toch al blokkeerde (2.8)
--
-- BUITEN SCOPE, met opzet: de prijsketen. _compute_order_price, create_order
-- en admin_create_order blijven hier ongemoeid; die krijgen de BTW-keys in
-- PR 3. Deze migratie voegt kolommen toe en vult ze, meer niet. Er is dus
-- geen enkele codepad-wijziging nodig om hem te kunnen deployen.
--
-- FISCAAL: besloten door Ilja 2026-08-06, niet fiscaal getoetst.
-- Alle diensten van TMC worden aangemerkt als het geven van gelegenheid tot
-- sportbeoefening en vallen daarmee onder het lage tarief. Dat geldt ook voor
-- personal training en de twaalfweken-programma's. De eerdere indeling die
-- die twee op 2100 zette is verworpen (spec-facturatie.md besluitenlog 27).
-- De fiscale bevestiging staat nog open als vraag 1 in sectie 13; dat is een
-- opleverpunt, geen bouwpunt.
--
-- GEEN DEFAULT op vat_rate_bp en revenue_category. Dat is een expliciet
-- besluit (sectie 2.1), geen omissie. Nu elke rij hetzelfde tarief draagt
-- lijkt DEFAULT 900 redelijk, en precies daarom is hij gevaarlijk: het enige
-- geval waarin hij ooit iets doet is het geval waarin hij fout is, namelijk
-- een toekomstig product dat niet onder het lage tarief valt. De CHECK laat
-- 2100 wel toe, dus zo'n product vraagt een bewuste waarde in de insert en
-- geen nieuwe migratie.
--
-- De backfill hieronder noemt elke slug expliciet, gegroepeerd per
-- revenue_category zoals de tabel in sectie 1.1. Geen veegupdate over de hele
-- tabel en geen LIKE-patroon: dit is de plek waar de accountant meeleest en
-- waar zichtbaar moet zijn dat er per productgroep is nagedacht. Inactieve
-- rijen (kids_*, senior_*, ten_ride_card_kids, ten_ride_card_senior) krijgen
-- hun tarief net zo goed, want is_active is een verkoopvlag en geen fiscale.
--
-- Bijwerking om te kennen: tmc.catalogue heeft een catalogue_touch_updated_at
-- trigger, dus alle 29 rijen krijgen een nieuwe updated_at. Dat klopt ook,
-- de rijen zijn echt gewijzigd.

begin;

-- ---------------------------------------------------------------------------
-- 1. tmc.catalogue: kolommen, eerst nullable
-- ---------------------------------------------------------------------------

alter table tmc.catalogue
  add column if not exists vat_rate_bp integer,
  add column if not exists revenue_category text;

-- ---------------------------------------------------------------------------
-- 2. Backfill, één update per productgroep, alle slugs expliciet benoemd
-- ---------------------------------------------------------------------------

-- abonnement (15 rijen): de vijf plan-families, inclusief de inactieve
-- kids- en senior-varianten.
update tmc.catalogue
set vat_rate_bp = 900, revenue_category = 'abonnement'
where slug in (
  'vrij_trainen_2x',  'vrij_trainen_3x',  'vrij_trainen_unl',
  'groepslessen_2x',  'groepslessen_3x',  'groepslessen_unl',
  'all_inclusive_2x', 'all_inclusive_3x', 'all_inclusive_unl',
  'kids_1x',          'kids_2x',          'kids_unl',
  'senior_1x',        'senior_2x',        'senior_unl'
);

-- addon (1 rij): volgt het tarief van de hoofddienst.
update tmc.catalogue
set vat_rate_bp = 900, revenue_category = 'addon'
where slug in ('extended_access');

-- inschrijfgeld (1 rij): volgt het tarief van de hoofddienst.
update tmc.catalogue
set vat_rate_bp = 900, revenue_category = 'inschrijfgeld'
where slug in ('signup_fee');

-- les_tegoed (6 rijen): losse lessen en rittenkaarten, inclusief de
-- inactieve kids- en seniorvarianten van de rittenkaart.
update tmc.catalogue
set vat_rate_bp = 900, revenue_category = 'les_tegoed'
where slug in (
  'drop_in',        'drop_in_kids',        'drop_in_senior',
  'ten_ride_card',  'ten_ride_card_kids',  'ten_ride_card_senior'
);

-- personal_training (4 rijen): 1-op-1 en duo, los en als rittenkaart.
update tmc.catalogue
set vat_rate_bp = 900, revenue_category = 'personal_training'
where slug in ('pt_single', 'pt_10', 'duo_single', 'duo_10');

-- programma (2 rijen): de twaalfweken-programma's, purchasable = false
-- en uitsluitend via de admin-context verkoopbaar.
update tmc.catalogue
set vat_rate_bp = 900, revenue_category = 'programma'
where slug in ('program_studio_12w', 'program_online_12w');

-- Guard vóór SET NOT NULL. Zonder deze check zou een rij die na het schrijven
-- van de spec is toegevoegd, de migratie laten falen op een kale
-- not-null-schending zonder te vertellen welke rij het is.
do $$
declare
  v_missing text;
begin
  select string_agg(slug, ', ' order by slug) into v_missing
  from tmc.catalogue
  where vat_rate_bp is null or revenue_category is null;

  if v_missing is not null then
    raise exception
      'vat_foundation: catalogusrijen zonder tarief of categorie: %. Voeg ze toe aan de backfill hierboven en aan sectie 1.1 van spec-facturatie.md.',
      v_missing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. NOT NULL, zonder default. Zie de kop van dit bestand.
-- ---------------------------------------------------------------------------

alter table tmc.catalogue
  alter column vat_rate_bp     set not null,
  alter column revenue_category set not null;

-- ---------------------------------------------------------------------------
-- 4. CHECK-constraints
-- ---------------------------------------------------------------------------

alter table tmc.catalogue
  add constraint catalogue_vat_rate_bp_check
    check (vat_rate_bp between 0 and 2100);

alter table tmc.catalogue
  add constraint catalogue_revenue_category_check
    check (revenue_category in (
      'abonnement', 'les_tegoed', 'personal_training',
      'programma', 'inschrijfgeld', 'addon'
    ));

comment on column tmc.catalogue.vat_rate_bp is
  'BTW-tarief in basispunten: 900 is 9,00 procent, 2100 is 21,00 procent. Integer, dus exact en zonder drijvende komma in een bedragberekening. NOT NULL zonder default, bewust: een default zou een nieuwe catalogusrij stil op het lage tarief zetten. Bruto is leidend, de BTW is de afgeleide: vat = round(bruto * rate / (10000 + rate)). Zie spec-facturatie.md 2.1 en 3.1.';

comment on column tmc.catalogue.revenue_category is
  'Boekhoud-as voor de omzetrapportage, los van kind en family (die de prijsmechanica beschrijven). NOT NULL zonder default, om dezelfde reden als vat_rate_bp. Zie spec-facturatie.md 2.1 en 7.2.';

-- ---------------------------------------------------------------------------
-- 5. tmc.profiles: testvlag en de NAW-aanvulling voor de factuur
-- ---------------------------------------------------------------------------

alter table tmc.profiles
  add column if not exists is_test      boolean not null default false,
  add column if not exists company_name text,
  add column if not exists vat_number   text;

comment on column tmc.profiles.is_test is
  'De enige plek waar de testmodus wordt vastgelegd. Een testorder is uitsluitend toegestaan op een testprofiel; payments.is_test en invoices.is_test zijn afgeleide snapshots hiervan. Hier is een default juist wel goed: "geen test" is de veilige aanname. Zie spec-facturatie.md 6.1 en 6.3.';

comment on column tmc.profiles.company_name is
  'Bedrijfsnaam van een zakelijke klant, voor op de factuur. NULL voor particulieren. Wordt bij het finaliseren bevroren in invoices.bill_to_company.';

comment on column tmc.profiles.vat_number is
  'BTW-nummer van de afnemer, verplicht op een factuur aan een ondernemer. NULL voor particulieren. Wordt bij het finaliseren bevroren in invoices.bill_to_vat_number.';

-- ---------------------------------------------------------------------------
-- 6. Grant-opruiming op tmc.payments (sectie 2.8)
--
-- Verandert geen gedrag: RLS kent op deze tabel alleen payments_self_read
-- (SELECT op de eigen rijen) en payments_admin_all, dus schrijven door anon
-- of authenticated werd al geweigerd. Dit haalt de tweede verdedigingslinie
-- terug die tmc.orders wel heeft en payments om historische redenen miste.
-- Alle schrijfpaden lopen via de service-role-client; anon leest hier niets.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on tmc.payments from anon, authenticated;
revoke select on tmc.payments from anon;

-- ---------------------------------------------------------------------------
-- 7. Zelfcontrole binnen dezelfde transactie
-- ---------------------------------------------------------------------------

do $$
declare
  v_rows        integer;
  v_rates       text;
  v_default_vat text;
  v_default_cat text;
begin
  -- Alle rijen geclassificeerd, en precies één tarief in gebruik.
  select count(*) into v_rows from tmc.catalogue;
  select string_agg(distinct vat_rate_bp::text, ',' order by vat_rate_bp::text)
    into v_rates from tmc.catalogue;

  if v_rates is distinct from '900' then
    raise exception 'vat_foundation: onverwachte tarieven in tmc.catalogue: % (verwacht uitsluitend 900)', v_rates;
  end if;

  if v_rows <> 29 then
    raise warning 'vat_foundation: tmc.catalogue heeft % rijen, de spec ging uit van 29. Controleer sectie 1.1.', v_rows;
  end if;

  -- Geen default op de twee nieuwe kolommen. Dit is de assertie die het
  -- besluit uit sectie 2.1 bewaakt tegen een latere "vereenvoudiging".
  select column_default into v_default_vat
  from information_schema.columns
  where table_schema = 'tmc' and table_name = 'catalogue' and column_name = 'vat_rate_bp';

  select column_default into v_default_cat
  from information_schema.columns
  where table_schema = 'tmc' and table_name = 'catalogue' and column_name = 'revenue_category';

  if v_default_vat is not null or v_default_cat is not null then
    raise exception 'vat_foundation: er staat een DEFAULT op vat_rate_bp (%) of revenue_category (%); dat is expliciet niet de bedoeling, zie spec-facturatie.md 2.1',
      v_default_vat, v_default_cat;
  end if;

  -- Grants op tmc.payments zoals bedoeld.
  if has_table_privilege('anon', 'tmc.payments', 'SELECT')
     or has_table_privilege('anon', 'tmc.payments', 'INSERT')
     or has_table_privilege('anon', 'tmc.payments', 'UPDATE')
     or has_table_privilege('anon', 'tmc.payments', 'DELETE') then
    raise exception 'vat_foundation: anon heeft nog rechten op tmc.payments';
  end if;

  if has_table_privilege('authenticated', 'tmc.payments', 'INSERT')
     or has_table_privilege('authenticated', 'tmc.payments', 'UPDATE')
     or has_table_privilege('authenticated', 'tmc.payments', 'DELETE') then
    raise exception 'vat_foundation: authenticated heeft nog schrijfrechten op tmc.payments';
  end if;

  if not has_table_privilege('authenticated', 'tmc.payments', 'SELECT') then
    raise exception 'vat_foundation: authenticated heeft geen SELECT meer op tmc.payments; /app/facturen zou breken';
  end if;

  if not has_table_privilege('service_role', 'tmc.payments', 'INSERT') then
    raise exception 'vat_foundation: service_role heeft geen INSERT meer op tmc.payments; de webhook zou breken';
  end if;
end $$;

commit;
