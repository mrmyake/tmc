-- Facturatie PR 6 (spec-facturatie.md sectie 14): het factuurschema.
--
-- Levert uitsluitend het schema: tmc.invoice_series (2.4), tmc.invoices
-- (2.5), tmc.invoice_lines (2.6), RLS-policies en grants (2.7), de
-- immutability-triggers op invoices (4.5). GEEN tmc.finalize_invoice, GEEN
-- tmc.v_invoice_credit_state, GEEN tmc.v_revenue_lines -- dat is PR 7. Er
-- is dus nog geen manier om een factuur te finaliseren; deze migratie zet
-- alleen de tafel neer waarop PR 7 gaat bouwen.
--
-- Drie kleine, transparante toevoegingen bovenop de letterlijke spec-tekst
-- (geen van alle wijzigt het schema dat de spec voorschrijft, alleen
-- prestatie/gemak):
--   1. invoices_touch_updated_at, hetzelfde patroon als
--      catalogue_touch_updated_at/orders_touch_updated_at/
--      profiles_touch_updated_at. De immutability-trigger negeert
--      updated_at toch al in zijn vergelijking (updated_at staat met opzet
--      in de lijst van kolommen die op een finalised rij mogen wijzigen),
--      dus dit kan nooit met die trigger botsen.
--   2. Drie indexen: invoices(profile_id) voor de RLS self-read,
--      invoices(credit_of_invoice_id) voor de LEFT JOIN die PR 7's
--      tmc.v_invoice_credit_state gaat doen, invoices(payment_id) voor het
--      "vanaf een betaling"-pad uit 9.1. Geen van drie verandert het
--      schema, alleen de padkeuze van de planner.
--   3. Tabel- en kolomcommentaar, zelfde conventie als de order-pipeline-
--      migratie (20260717000000).
--
-- Wat bewust NIET is toegevoegd, ook al zou het voor de hand liggen: een
-- CHECK die invoice_series.code beperkt tot ('LIVE','TEST'). Sectie 2.4
-- noemt expliciet twee CHECKs (is_test en prefix); een derde over code zelf
-- staat er niet. Die twee CHECKs samen dwingen al af dat is_test=true code
-- 'TEST' oplevert; ze verbieden alleen niet dat is_test=false een andere
-- waarde dan 'LIVE' krijgt. Dat is een gat dat al in de spec zit, niet iets
-- wat deze migratie erbij verzint of dichtzet.

begin;

-- ---------------------------------------------------------------------------
-- 1. tmc.invoice_series (2.4)
-- ---------------------------------------------------------------------------

create table tmc.invoice_series (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  fiscal_year   integer not null,
  is_test       boolean not null,
  prefix        text not null,
  next_number   integer not null default 1,
  created_at    timestamptz not null default now(),

  constraint invoice_series_code_fiscal_year_key unique (code, fiscal_year),
  constraint invoice_series_is_test_check
    check (is_test = (code = 'TEST')),
  constraint invoice_series_prefix_check
    check (prefix = case when is_test then 'TEST-' else '' end)
);

comment on table tmc.invoice_series is
  'De teller. Eén rij per combinatie van reeks (LIVE/TEST) en boekjaar; het nummer wordt getrokken door PR 7''s tmc.finalize_invoice onder een rijlock op deze tabel, nooit door een Postgres SEQUENCE. Zie spec-facturatie.md 2.4 en 4.3.';

comment on column tmc.invoice_series.next_number is
  'Het VOLGENDE uit te geven nummer, niet het laatst uitgegevene. finalize_invoice consumeert deze waarde en hoogt hem in hetzelfde statement op.';

-- ---------------------------------------------------------------------------
-- 2. tmc.invoices (2.5)
-- ---------------------------------------------------------------------------

create table tmc.invoices (
  id                     uuid primary key default gen_random_uuid(),
  series_id              uuid not null references tmc.invoice_series(id),
  fiscal_year            integer not null,
  number                 integer,
  invoice_number         text,
  is_test                boolean not null,
  status                 text not null default 'draft',
  issued_at              date,
  profile_id             uuid not null references tmc.profiles(id),

  -- bevroren afnemergegevens
  bill_to_name           text,
  bill_to_company        text,
  bill_to_vat_number     text,
  bill_to_street         text,
  bill_to_postal_code    text,
  bill_to_city           text,
  bill_to_country        text,
  bill_to_email          text,

  -- bevroren bedragen
  subtotal_net_cents     integer,
  vat_total_cents        integer,
  total_gross_cents      integer,
  currency               text not null default 'EUR',

  -- herkomst
  payment_id             uuid references tmc.payments(id),
  order_id               uuid references tmc.orders(id),
  credit_of_invoice_id   uuid references tmc.invoices(id),

  -- pdf, write-once (afgedwongen door de trigger hieronder, niet hier)
  pdf_path               text,
  pdf_generated_at       timestamptz,

  notes                  text,
  created_by_profile_id  uuid references tmc.profiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint invoices_series_number_key unique (series_id, number),
  constraint invoices_invoice_number_key unique (invoice_number),
  constraint invoices_status_check check (status in ('draft', 'finalised')),

  -- Een gefinaliseerde rij moet de zes velden dragen die een factuur tot
  -- een factuur maken. Een concept mag ze allemaal missen.
  constraint invoices_finalised_fields_check check (
    status = 'draft' or (
      number is not null
      and invoice_number is not null
      and issued_at is not null
      and bill_to_name is not null
      and bill_to_email is not null
      and total_gross_cents is not null
    )
  ),

  constraint invoices_credit_not_self_check
    check (credit_of_invoice_id is null or credit_of_invoice_id <> id),

  -- Rekenvoorwaarde, geen stijlregel: tmc.v_invoice_credit_state (PR 7)
  -- rekent gecrediteerde bedragen op met -sum(...) en gaat er dus vanuit
  -- dat een creditnota negatieve totalen draagt. status = 'draft' is
  -- uitgezonderd omdat de totalen dan nog null zijn (finalize_invoice
  -- berekent ze pas). vat_total_cents <= 0, niet < 0: een creditnota van
  -- een volledig vrijgestelde regel heeft nul BTW. Zie 2.5 en 7.4.
  constraint invoices_credit_note_negative_check check (
    credit_of_invoice_id is null
    or status = 'draft'
    or (total_gross_cents < 0 and subtotal_net_cents <= 0 and vat_total_cents <= 0)
  )
);

create index invoices_profile_idx on tmc.invoices (profile_id);
create index invoices_credit_of_invoice_id_idx on tmc.invoices (credit_of_invoice_id)
  where credit_of_invoice_id is not null;
create index invoices_payment_id_idx on tmc.invoices (payment_id)
  where payment_id is not null;

comment on table tmc.invoices is
  'Het bevroren document. Alles wat op een gefinaliseerde factuur staat (NAW, bedragen) is gekopieerd in de rij zelf; er wordt bij weergave nooit gejoind naar profiles of catalogue. status kent bewust maar twee waarden (draft, finalised); de crediteringsstand wordt in PR 7 afgeleid uit gekoppelde creditnotas (tmc.v_invoice_credit_state), niet als derde status opgeslagen. Onveranderlijk na finaliseren op alles behalve pdf_path/pdf_generated_at/updated_at (trigger invoices_finalised_immutable); een gefinaliseerde rij kan niet verwijderd worden. Zie spec-facturatie.md 2.5, 4.5, 4.6.';

comment on column tmc.invoices.number is
  'NULL zolang de factuur draft is. Getrokken door tmc.finalize_invoice (PR 7) uit tmc.invoice_series, nooit hier of elders geschreven.';

comment on column tmc.invoices.pdf_path is
  'Write-once zodra gezet: de trigger invoices_finalised_immutable weigert een tweede schrijfactie. Een tweede render kan een ander document opleveren dan de klant ontving (sjabloon- of adreswijziging); een nieuwe PDF vraagt een nieuwe factuur of een creditnota.';

comment on column tmc.invoices.credit_of_invoice_id is
  'Verwijzing naar de gecrediteerde factuur. Een creditnota is een gewone rij in deze tabel, geen apart type: alleen de tekenwissel van de bedragen (invoices_credit_note_negative_check) en deze verwijzing onderscheiden hem.';

-- ---------------------------------------------------------------------------
-- 3. tmc.invoice_lines (2.6)
-- ---------------------------------------------------------------------------

create table tmc.invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references tmc.invoices(id) on delete cascade,
  line_no           integer not null,
  catalogue_slug    text,                          -- BEWUST geen foreign key, zie hieronder
  description       text not null,
  quantity          numeric(10,2) not null default 1,
  unit_net_cents    integer not null,
  vat_rate_bp       integer not null,
  net_cents         integer not null,
  vat_cents         integer not null,
  gross_cents       integer not null,
  revenue_category  text,

  constraint invoice_lines_invoice_id_line_no_key unique (invoice_id, line_no),
  constraint invoice_lines_gross_check check (gross_cents = net_cents + vat_cents)
);

comment on table tmc.invoice_lines is
  'BTW per regel, want één factuur kan negen en eenentwintig procent mengen. gross_cents = net_cents + vat_cents is een harde constraint; de header-totalen op tmc.invoices worden door finalize_invoice (PR 7) herberekend uit deze regels, nooit andersom over het bruto totaal (afrondingsverschil, spec 3.4). Zie 2.6.';

comment on column tmc.invoice_lines.catalogue_slug is
  'BEWUST geen foreign key naar tmc.catalogue. De catalogus mag wijzigen, rijen mogen op is_active=false, een slug mag in theorie verdwijnen; een factuur uit 2026 moet in 2031 nog leesbaar zijn. De slug staat er als herkomstspoor, niet als verwijzing.';

-- ---------------------------------------------------------------------------
-- 4. Onveranderlijkheid na finaliseren (4.5)
-- ---------------------------------------------------------------------------

-- BEFORE UPDATE: op een draft-rij mag alles; op een finalised-rij mogen
-- alleen pdf_path, pdf_generated_at en updated_at wijzigen, en pdf_path
-- precies één keer (van null naar een waarde). De vergelijking gebeurt op
-- de hele rij via de composite-type kopie: alles wat na het nullen van de
-- drie toegestane kolommen nog verschilt, is een verboden wijziging. Dat is
-- robuuster dan elke kolom apart uitschrijven en blijft correct als er ooit
-- een kolom bijkomt.
create or replace function tmc.invoices_finalised_immutable()
returns trigger
language plpgsql
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_old tmc.invoices := old;
  v_new tmc.invoices := new;
begin
  if old.status = 'draft' then
    return new;
  end if;

  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'pdf_path is write-once.' using errcode = 'P0001';
  end if;

  v_new.pdf_path := v_old.pdf_path;
  v_new.pdf_generated_at := v_old.pdf_generated_at;
  v_new.updated_at := v_old.updated_at;

  if v_new is distinct from v_old then
    raise exception 'Gefinaliseerde factuur is onveranderlijk.' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

create trigger invoices_finalised_immutable
  before update on tmc.invoices
  for each row execute function tmc.invoices_finalised_immutable();

-- BEFORE DELETE: finalised mag niet verwijderd worden, draft wel (en
-- cascadeert dan naar zijn invoice_lines).
create or replace function tmc.invoices_finalised_no_delete()
returns trigger
language plpgsql
set search_path to 'tmc', 'extensions'
as $function$
begin
  if old.status = 'finalised' then
    raise exception 'Gefinaliseerde factuur kan niet verwijderd worden.' using errcode = 'P0001';
  end if;
  return old;
end;
$function$;

create trigger invoices_finalised_no_delete
  before delete on tmc.invoices
  for each row execute function tmc.invoices_finalised_no_delete();

-- Gemak, zelfde conventie als catalogue/orders/profiles. Kan nooit met de
-- immutability-trigger botsen: die negeert updated_at toch al in zijn
-- vergelijking (updated_at staat zelf in de lijst van toegestane
-- wijzigingen op een finalised rij).
create trigger invoices_touch_updated_at
  before update on tmc.invoices
  for each row execute function tmc.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. RLS-beleid en grants (2.7)
-- ---------------------------------------------------------------------------

alter table tmc.invoice_series enable row level security;
alter table tmc.invoices enable row level security;
alter table tmc.invoice_lines enable row level security;

create policy invoice_series_admin_all on tmc.invoice_series
  using (tmc.is_admin()) with check (tmc.is_admin());

create policy invoices_self_read on tmc.invoices
  for select using (
    profile_id = auth.uid() and status = 'finalised' and is_test = false
  );

create policy invoices_admin_all on tmc.invoices
  using (tmc.is_admin()) with check (tmc.is_admin());

create policy invoice_lines_self_read on tmc.invoice_lines
  for select using (
    exists (
      select 1 from tmc.invoices i
      where i.id = invoice_id
        and i.profile_id = auth.uid()
        and i.status = 'finalised'
        and i.is_test = false
    )
  );

create policy invoice_lines_admin_all on tmc.invoice_lines
  using (tmc.is_admin()) with check (tmc.is_admin());

-- Zelfde patroon als tmc.orders: SELECT voor authenticated, niets voor
-- anon, alles voor service_role. Elke schrijfactie loopt via de
-- service-role-RPC's (PR 7) of de service-role TS-laag (PR 9), nooit direct
-- vanuit een client-sessie.
grant select on table tmc.invoice_series to authenticated;
grant select on table tmc.invoices to authenticated;
grant select on table tmc.invoice_lines to authenticated;

grant all on table tmc.invoice_series to service_role;
grant all on table tmc.invoices to service_role;
grant all on table tmc.invoice_lines to service_role;

-- ---------------------------------------------------------------------------
-- 6. Zelfcontrole binnen dezelfde transactie
--
-- Synthetische reeksen (fiscal_year 9999, evident geen echt boekjaar) en
-- een bestaand profiel, alles binnen deze transactie aangemaakt en aan het
-- eind weer verwijderd. Voor de opruiming van de gefinaliseerde/creditnota-
-- testrijen worden de twee triggers op invoices tijdelijk uitgezet: dat is
-- de enige manier om een rij te verwijderen die de trigger zelf onschendbaar
-- maakt, en het is transactioneel veilig (DDL binnen dezelfde transactie).
-- ---------------------------------------------------------------------------

do $$
declare
  v_profile     uuid;
  v_series_live uuid;
  v_series_test uuid;
  v_draft_id    uuid;
  v_final_id    uuid;
  v_credit_id   uuid;
  v_draft2_id   uuid;
  v_line_id     uuid;
  v_msg         text;
begin
  select id into v_profile from tmc.profiles where role = 'admin' limit 1;
  if v_profile is null then
    raise exception 'invoice_schema: geen profiel gevonden om tegen te testen';
  end if;

  -- --- invoice_series: de twee CHECKs ---

  insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
  values ('LIVE', 9999, false, '')
  returning id into v_series_live;

  insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
  values ('TEST', 9999, true, 'TEST-')
  returning id into v_series_test;

  begin
    insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
    values ('TEST', 9998, false, '');
    raise exception 'invoice_schema: is_test-check had moeten weigeren (code=TEST, is_test=false)';
  exception when others then
    if sqlerrm not like '%invoice_series_is_test_check%' then raise; end if;
  end;

  begin
    insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
    values ('LIVE', 9998, false, 'TEST-');
    raise exception 'invoice_schema: prefix-check had moeten weigeren (code=LIVE, prefix=TEST-)';
  exception when others then
    if sqlerrm not like '%invoice_series_prefix_check%' then raise; end if;
  end;

  -- --- invoices: finalised-fields-check ---

  insert into tmc.invoices (series_id, fiscal_year, is_test, profile_id)
  values (v_series_live, 9999, false, v_profile)
  returning id into v_draft_id;

  begin
    insert into tmc.invoices (
      series_id, fiscal_year, number, invoice_number, is_test, status,
      issued_at, profile_id, bill_to_name, bill_to_email, total_gross_cents
    ) values (
      v_series_live, 9999, 1, '9999.001', false, 'finalised',
      current_date, v_profile, 'Zelfcontrole', null, 10900
    );
    raise exception 'invoice_schema: finalised-fields-check had moeten weigeren (bill_to_email null)';
  exception when others then
    if sqlerrm not like '%invoices_finalised_fields_check%' then raise; end if;
  end;

  insert into tmc.invoices (
    series_id, fiscal_year, number, invoice_number, is_test, status,
    issued_at, profile_id, bill_to_name, bill_to_email,
    subtotal_net_cents, vat_total_cents, total_gross_cents
  ) values (
    v_series_live, 9999, 1, '9999.001', false, 'finalised',
    current_date, v_profile, 'Zelfcontrole', 'zelfcontrole@test.invalid',
    10000, 900, 10900
  )
  returning id into v_final_id;

  -- --- B1: elke andere kolom is onveranderlijk op een finalised rij ---

  begin
    update tmc.invoices set bill_to_city = 'Nergens' where id = v_final_id;
    raise exception 'invoice_schema: B1 had moeten weigeren (bill_to_city op finalised rij)';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%onveranderlijk%' then raise; end if;
  end;

  -- --- B2: pdf_path is write-once ---

  update tmc.invoices
  set pdf_path = 'test/9999.001.pdf', pdf_generated_at = now()
  where id = v_final_id;

  if (select pdf_path from tmc.invoices where id = v_final_id) <> 'test/9999.001.pdf' then
    raise exception 'invoice_schema: B2 eerste schrijfactie op pdf_path had moeten slagen';
  end if;

  begin
    update tmc.invoices set pdf_path = 'test/anders.pdf' where id = v_final_id;
    raise exception 'invoice_schema: B2 had moeten weigeren (tweede schrijfactie op pdf_path)';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%write-once%' then raise; end if;
  end;

  -- --- B3: verwijderen ---

  begin
    delete from tmc.invoices where id = v_final_id;
    raise exception 'invoice_schema: B3 had moeten weigeren (delete op finalised rij)';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%niet verwijderd worden%' then raise; end if;
  end;

  delete from tmc.invoices where id = v_draft_id;
  if exists (select 1 from tmc.invoices where id = v_draft_id) then
    raise exception 'invoice_schema: B3 draft-delete had moeten slagen';
  end if;

  -- --- B4: geen join naar profiles, dus geen live sync mogelijk ---
  --
  -- Structurele garantie in plaats van een dynamische test: er is geen
  -- trigger op tmc.profiles die tmc.invoices aanraakt, en bill_to_name is
  -- een gewone opgeslagen kolom, geen view/generated column over profiles.
  -- Een write op een echt profiel wordt hier bewust niet uitgevoerd (zou
  -- productie-profielgegevens muteren binnen deze migratietransactie).
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'tmc' and c.relname = 'profiles' and not t.tgisinternal
      and pg_get_triggerdef(t.oid) ilike '%invoices%'
  ) then
    raise exception 'invoice_schema: B4 veronderstelling geschonden -- er bestaat een trigger op profiles die invoices raakt';
  end if;
  if (select bill_to_name from tmc.invoices where id = v_final_id) <> 'Zelfcontrole' then
    raise exception 'invoice_schema: B4 bill_to_name onverwacht gewijzigd';
  end if;

  -- --- creditnota-constraint ---

  insert into tmc.invoices (series_id, fiscal_year, is_test, profile_id, credit_of_invoice_id)
  values (v_series_live, 9999, false, v_profile, v_final_id)
  returning id into v_credit_id;

  begin
    update tmc.invoices set
      status = 'finalised', number = 2, invoice_number = '9999.002',
      issued_at = current_date, bill_to_name = 'Zelfcontrole',
      bill_to_email = 'zelfcontrole@test.invalid',
      subtotal_net_cents = 10000, vat_total_cents = 900, total_gross_cents = 10900
    where id = v_credit_id;
    raise exception 'invoice_schema: credit-note-check had moeten weigeren (positieve totalen)';
  exception when others then
    if sqlerrm not like '%invoices_credit_note_negative_check%' then raise; end if;
  end;

  update tmc.invoices set
    status = 'finalised', number = 2, invoice_number = '9999.002',
    issued_at = current_date, bill_to_name = 'Zelfcontrole',
    bill_to_email = 'zelfcontrole@test.invalid',
    subtotal_net_cents = -10000, vat_total_cents = -900, total_gross_cents = -10900
  where id = v_credit_id;

  if (select status from tmc.invoices where id = v_credit_id) <> 'finalised' then
    raise exception 'invoice_schema: creditnota met negatieve totalen had moeten slagen';
  end if;

  -- --- invoice_lines: gross=net+vat, geen FK op catalogue_slug, cascade ---

  insert into tmc.invoices (series_id, fiscal_year, is_test, profile_id)
  values (v_series_live, 9999, false, v_profile)
  returning id into v_draft2_id;

  begin
    insert into tmc.invoice_lines (
      invoice_id, line_no, catalogue_slug, description,
      unit_net_cents, vat_rate_bp, net_cents, vat_cents, gross_cents
    ) values (
      v_draft2_id, 1, 'slug_bestaat_niet_in_catalogue', 'Zelfcontroleregel',
      1000, 900, 1000, 90, 1000  -- gross klopt bewust niet: 1000 <> 1000+90
    );
    raise exception 'invoice_schema: invoice_lines_gross_check had moeten weigeren';
  exception when others then
    if sqlerrm not like '%invoice_lines_gross_check%' then raise; end if;
  end;

  insert into tmc.invoice_lines (
    invoice_id, line_no, catalogue_slug, description,
    unit_net_cents, vat_rate_bp, net_cents, vat_cents, gross_cents
  ) values (
    v_draft2_id, 1, 'slug_bestaat_niet_in_catalogue', 'Zelfcontroleregel',
    1000, 900, 1000, 90, 1090
  )
  returning id into v_line_id;

  if not exists (select 1 from tmc.invoice_lines where id = v_line_id) then
    raise exception 'invoice_schema: regel met onbekende catalogue_slug had moeten slagen (geen FK)';
  end if;

  delete from tmc.invoices where id = v_draft2_id;
  if exists (select 1 from tmc.invoice_lines where id = v_line_id) then
    raise exception 'invoice_schema: invoice_lines had moeten cascade-verwijderd zijn';
  end if;

  -- --- Opruimen: finalised/creditnota-rijen kunnen niet via een gewone
  -- DELETE weg, dus de twee triggers gaan tijdelijk uit. ---

  alter table tmc.invoices disable trigger invoices_finalised_no_delete;
  alter table tmc.invoices disable trigger invoices_finalised_immutable;

  delete from tmc.invoices where series_id in (v_series_live, v_series_test);
  delete from tmc.invoice_series where id in (v_series_live, v_series_test);

  alter table tmc.invoices enable trigger invoices_finalised_no_delete;
  alter table tmc.invoices enable trigger invoices_finalised_immutable;

  if exists (select 1 from tmc.invoice_series where fiscal_year = 9999) then
    raise exception 'invoice_schema: opruimen onvolledig (invoice_series)';
  end if;
  if exists (select 1 from tmc.invoices where fiscal_year = 9999) then
    raise exception 'invoice_schema: opruimen onvolledig (invoices)';
  end if;
end $$;

commit;
