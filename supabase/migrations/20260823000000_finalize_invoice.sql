-- Facturatie PR 7 (spec-facturatie.md sectie 14): het hart van de keten.
--
--   1. tmc.finalize_invoice: valideren, nummer trekken, bevriezen (4.2-4.4)
--   2. tmc.v_invoice_credit_state: crediteringsstand afgeleid (4.6)
--   3. tmc.v_revenue_lines: de omzetregels (7.2, 7.4)
--   4. catalogue_revenue_category_check uitgebreid met 'proefles' (7.2,
--      besluitenlog 30): proefles-payments hebben geen catalogusrij (de
--      prijs komt uit booking_settings per pillar), dus ze krijgen een
--      eigen categorie in plaats van een aanname in een case.
--
-- De twee regels waar alles op hangt (4.2/4.3):
--
--   REGEL 1: alle validatie voor het trekken van het nummer. Na het
--   trekken retourneert de functie nooit meer ok:false; elke resterende
--   fout is een raise, zodat de transactie terugrolt en het nummer wordt
--   teruggegeven. Een plpgsql-functie die normaal returnt draait niets
--   terug; een ok:false na de tellerophoging zou die ophoging committen en
--   een gat in de reeks slaan.
--
--   REGEL 2: vergrendelen en consumeren zijn twee statements met de
--   validatiepoort ertussen. Fase 1 verzekert de reeksrij en neemt het
--   rijslot via een zelftoekenning (on conflict do update set next_number
--   = next_number), zonder te consumeren; fase 2 consumeert onder het al
--   gehouden slot. De chronologiecontrole leest max(issued_at) NA fase 1,
--   dus geserialiseerd: twee gelijktijdige finalisaties kunnen niet allebei
--   slagen met omgekeerde datums (4.4, test A6b).
--
-- Autorisatie volgt het admin_cancel_order-patroon: tmc.is_admin() als
-- DB-gate (raise 42501), met requireAdmin() in de TS-laag (PR 9) als
-- tweede verdedigingslinie. Execute-grants: authenticated + service_role,
-- revoke van public en anon (patroon 20260805).
--
-- De views draaien met owner-rechten en lezen dwars door de RLS van
-- payments/invoices heen; SELECT-grant daarom UITSLUITEND aan
-- service_role. De admin-cockpit (PR 9) leest ze via de service-role
-- client; een lid heeft er niets te zoeken en authenticated krijgt ze dus
-- niet.

begin;

-- ---------------------------------------------------------------------------
-- 0. revenue_category 'proefles' (7.2, besluitenlog 30)
-- ---------------------------------------------------------------------------

alter table tmc.catalogue drop constraint catalogue_revenue_category_check;
alter table tmc.catalogue
  add constraint catalogue_revenue_category_check
    check (revenue_category in (
      'abonnement', 'les_tegoed', 'personal_training',
      'programma', 'inschrijfgeld', 'addon', 'proefles'
    ));

comment on constraint catalogue_revenue_category_check on tmc.catalogue is
  'Inclusief ''proefles'', al draagt geen enkele catalogusrij die waarde: proeflessen hebben geen catalogusrij (prijs uit booking_settings per pillar) en v_revenue_lines kent de categorie rechtstreeks toe op kind = ''trial_booking''. De waarde staat in deze CHECK zodat catalogus en rapportage dezelfde gesloten verzameling delen. Zie spec-facturatie.md 7.2 en besluitenlog 30.';

-- ---------------------------------------------------------------------------
-- 1. tmc.finalize_invoice
-- ---------------------------------------------------------------------------

create or replace function tmc.finalize_invoice(
  p_invoice_id uuid,
  p_issued_at  date default current_date
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_inv          tmc.invoices%rowtype;
  v_code         text;
  v_prefix       text;
  v_year         integer;
  v_series_id    uuid;
  v_line_count   integer;
  v_net          integer;
  v_vat          integer;
  v_gross        integer;
  v_bill_name    text;
  v_bill_company text;
  v_bill_vat     text;
  v_bill_street  text;
  v_bill_postal  text;
  v_bill_city    text;
  v_bill_country text;
  v_bill_email   text;
  v_last_issued  date;
  v_number       integer;
  v_invoice_no   text;
begin
  -- 1. Autorisatie (patroon admin_cancel_order; requireAdmin() in TS is
  --    de tweede laag).
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  if p_issued_at is null then
    return jsonb_build_object('ok', false, 'reason', 'issued_at_required');
  end if;

  -- 2. Rijlock op de factuur.
  select * into v_inv from tmc.invoices where id = p_invoice_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
  end if;

  -- 3. Idempotentie: een dubbelklik levert geen tweede nummer op en raakt
  --    de teller niet aan (zelfde patroon als already_activated).
  if v_inv.status = 'finalised' then
    return jsonb_build_object(
      'ok', true, 'already_finalised', true,
      'invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number
    );
  end if;

  -- 4. Boekjaar en reeks uit p_issued_at, niet uit now(): een factuur die
  --    op 2 januari over december wordt uitgeschreven hoort in december.
  v_year := extract(year from p_issued_at)::integer;
  v_code := case when v_inv.is_test then 'TEST' else 'LIVE' end;
  v_prefix := case when v_inv.is_test then 'TEST-' else '' end;

  -- 5. FASE 1 van de teller (4.3): reeksrij verzekeren en VERGRENDELEN
  --    zonder te consumeren. De zelftoekenning schrijft een nieuwe
  --    rijversie en neemt daarmee het slot, dat tot commit of rollback
  --    gehouden wordt; het statement retourneert altijd exact een rij, of
  --    het nu invoegde of bijwerkte. Geen do-nothing-plus-select-for-update
  --    (NULL-race bij rollback van een gelijktijdige eerste factuur van
  --    een boekjaar, zie 4.3) en geen gecombineerd
  --    vergrendel-en-consumeer-statement (dat zou het nummer voor de
  --    validatie verbruiken).
  insert into tmc.invoice_series (code, fiscal_year, is_test, prefix, next_number)
  values (v_code, v_year, v_inv.is_test, v_prefix, 1)
  on conflict (code, fiscal_year)
  do update set next_number = tmc.invoice_series.next_number
  returning id into v_series_id;

  -- 6. Validatiepoort. Alles hier retourneert ok:false en er is nog geen
  --    nummer verbruikt.

  -- 6a. Regels aanwezig.
  select count(*),
         coalesce(sum(net_cents), 0),
         coalesce(sum(vat_cents), 0),
         coalesce(sum(gross_cents), 0)
  into v_line_count, v_net, v_vat, v_gross
  from tmc.invoice_lines
  where invoice_id = v_inv.id;

  if v_line_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_lines');
  end if;

  -- 6b. Totalen: herberekend uit de regels (3.4: per regel afrekenen en
  --     optellen, nooit opnieuw over het bruto totaal).
  if v_gross <> v_net + v_vat then
    return jsonb_build_object('ok', false, 'reason', 'totals_mismatch');
  end if;

  -- 6c. Afnemergegevens in lokale variabelen: het concept wint waar de
  --     admin het heeft ingevuld, het profiel vult alleen de gaten. Er
  --     wordt hier niets geschreven; dat gebeurt pas in stap 9.
  select
    coalesce(v_inv.bill_to_name, nullif(trim(p.first_name || ' ' || p.last_name), '')),
    coalesce(v_inv.bill_to_company, p.company_name),
    coalesce(v_inv.bill_to_vat_number, p.vat_number),
    coalesce(v_inv.bill_to_street, p.street_address),
    coalesce(v_inv.bill_to_postal_code, p.postal_code),
    coalesce(v_inv.bill_to_city, p.city),
    coalesce(v_inv.bill_to_country, p.country),
    coalesce(v_inv.bill_to_email, p.email)
  into v_bill_name, v_bill_company, v_bill_vat, v_bill_street,
       v_bill_postal, v_bill_city, v_bill_country, v_bill_email
  from tmc.profiles p
  where p.id = v_inv.profile_id;

  if v_bill_name is null or v_bill_email is null then
    return jsonb_build_object('ok', false, 'reason', 'incomplete_bill_to');
  end if;

  -- 6d. Chronologie, ONDER het slot uit stap 5 (4.4): zonder dat slot
  --     lezen twee gelijktijdige finalisaties dezelfde oude max en slagen
  --     ze allebei met omgekeerde datums. Gelijke datums zijn toegestaan.
  select max(issued_at) into v_last_issued
  from tmc.invoices
  where series_id = v_series_id and status = 'finalised';

  if v_last_issued is not null and p_issued_at < v_last_issued then
    return jsonb_build_object(
      'ok', false, 'reason', 'issued_at_before_last',
      'last_issued_at', v_last_issued
    );
  end if;

  -- ======================= DE GRENS (4.2) ==================================
  -- Vanaf hier geen enkele return ok:false meer. Elke resterende fout
  -- propageert als exception zodat de transactie terugrolt en het nummer
  -- wordt teruggegeven; een normale return zou de ophoging committen en
  -- een gat in de reeks slaan.
  -- =========================================================================

  -- 7. FASE 2 van de teller: consumeren onder het al gehouden slot.
  update tmc.invoice_series
  set next_number = next_number + 1
  where id = v_series_id
  returning next_number - 1 into v_number;

  -- 8. Nummer samenstellen: 2026.001, degradeert netjes naar 2026.1000.
  v_invoice_no := v_prefix || v_year::text || '.' || lpad(v_number::text, 3, '0');

  -- 9. Bevriezen. Geen exception-handler eromheen: een constraint-schending
  --    (bv. invoices_credit_note_negative_check op een creditnota met
  --    positieve totalen) hoort de transactie terug te rollen, precies
  --    zodat het getrokken nummer weer vrijkomt (test D5). De
  --    draft->finalised-overgang mag van de immutability-trigger alles
  --    schrijven (die toetst OLD.status).
  update tmc.invoices set
    status = 'finalised',
    series_id = v_series_id,
    fiscal_year = v_year,
    number = v_number,
    invoice_number = v_invoice_no,
    issued_at = p_issued_at,
    subtotal_net_cents = v_net,
    vat_total_cents = v_vat,
    total_gross_cents = v_gross,
    bill_to_name = v_bill_name,
    bill_to_company = v_bill_company,
    bill_to_vat_number = v_bill_vat,
    bill_to_street = v_bill_street,
    bill_to_postal_code = v_bill_postal,
    bill_to_city = v_bill_city,
    bill_to_country = v_bill_country,
    bill_to_email = v_bill_email
  where id = v_inv.id;

  -- 10. Klaar.
  return jsonb_build_object(
    'ok', true,
    'already_finalised', false,
    'invoice_id', v_inv.id,
    'invoice_number', v_invoice_no,
    'number', v_number,
    'fiscal_year', v_year
  );
end;
$function$;

comment on function tmc.finalize_invoice(uuid, date) is
  'Finaliseert een concept: valideert (regels, totalen, bill_to, chronologie), trekt het nummer uit tmc.invoice_series onder een rijslot, en bevriest de factuur. Alle validatie staat voor het trekken; daarna is elke fout een exception zodat een rollback het nummer teruggeeft en de reeks aaneengesloten blijft. Idempotent: een tweede aanroep geeft already_finalised met hetzelfde nummer. De PDF hoort hier bewust NIET: nummer eerst, document daarna (spec-facturatie.md 4.2, 5.1).';

revoke all on function tmc.finalize_invoice(uuid, date) from public, anon;
grant execute on function tmc.finalize_invoice(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. tmc.v_invoice_credit_state (4.6)
-- ---------------------------------------------------------------------------

create view tmc.v_invoice_credit_state as
select
  i.id                                             as invoice_id,
  i.total_gross_cents,
  coalesce(-sum(c.total_gross_cents), 0)           as credited_gross_cents,
  case
    when coalesce(-sum(c.total_gross_cents), 0) = 0                     then 'none'
    when coalesce(-sum(c.total_gross_cents), 0) >= i.total_gross_cents  then 'full'
    else 'partial'
  end                                              as credit_state
from tmc.invoices i
left join tmc.invoices c
  on c.credit_of_invoice_id = i.id and c.status = 'finalised'
where i.status = 'finalised' and i.credit_of_invoice_id is null
group by i.id, i.total_gross_cents;

comment on view tmc.v_invoice_credit_state is
  'Crediteringsstand per gefinaliseerde factuur, afgeleid uit de gekoppelde gefinaliseerde creditnotas: none, partial of full. Bewust een view en geen statuskolom: deels crediteren bestaat, en een status naast de creditnotas is een tweede bron van waarheid die kan gaan afwijken. Leunt op invoices_credit_note_negative_check (creditnotas dragen negatieve totalen, vandaar -sum). Zie spec-facturatie.md 4.6.';

-- ---------------------------------------------------------------------------
-- 3. tmc.v_revenue_lines (7.2, 7.4)
-- ---------------------------------------------------------------------------

create view tmc.v_revenue_lines as
select
  date_trunc('month', p.paid_at)::date as period_month,
  p.paid_at,
  p.refunded_at,
  p.id                                 as payment_id,
  p.profile_id,
  case
    when p.kind = 'trial_booking' then 'proefles'
    else coalesce(cat_o.revenue_category, cat_m.revenue_category)
  end                                  as revenue_category,
  p.vat_rate_bp,
  p.amount_cents                       as gross_cents,
  p.vat_amount_cents                   as vat_cents,
  p.net_amount_cents                   as net_cents,
  p.refunded_amount_cents              as refunded_cents,
  -- BTW op de restitutie: ALTIJD uit payments.vat_rate_bp, het bevroren
  -- snapshot; nooit uit de actuele catalogue (het tarief kan sinds de
  -- betaling gewijzigd zijn). Volledige restitutie spiegelt
  -- vat_amount_cents exact (geen dubbele afronding); deelrestitutie naar
  -- rato met dezelfde formule als 3.1; onbekend tarief blijft NULL, wordt
  -- nooit stil 0 (7.2).
  case
    when p.vat_rate_bp is null then null
    when p.refunded_amount_cents = 0 then 0
    when p.refunded_amount_cents = p.amount_cents then p.vat_amount_cents
    else round(p.refunded_amount_cents::numeric * p.vat_rate_bp
               / (10000 + p.vat_rate_bp))::integer
  end                                  as refunded_vat_cents,
  case
    when p.vat_rate_bp is null then null
    when p.refunded_amount_cents = 0 then 0
    when p.refunded_amount_cents = p.amount_cents
      then p.refunded_amount_cents - p.vat_amount_cents
    else p.refunded_amount_cents
       - round(p.refunded_amount_cents::numeric * p.vat_rate_bp
               / (10000 + p.vat_rate_bp))::integer
  end                                  as refunded_net_cents,
  -- De 7.4-rekenregel: refunded_amount_cents is altijd de bron van de
  -- negatieve omzetregel; de creditnota draagt alleen het meerdere bij.
  -- De twee delen blijven gescheiden kolommen omdat ze in verschillende
  -- periodes vallen: de restitutie in de maand van refunded_at, het
  -- meerdere in de maand van de creditnota-issued_at (die staat in
  -- last_credit_issued_at; de maandtoewijzing zelf is aan de
  -- rapportagequery).
  cr.credited_gross_cents,
  greatest(0, cr.credited_gross_cents - p.refunded_amount_cents)
                                       as credit_excess_cents,
  cr.last_credit_issued_at,
  p.kind
from tmc.payments p
left join tmc.orders o        on o.id = p.order_id
left join tmc.catalogue cat_o on cat_o.slug = o.catalogue_slug
left join tmc.memberships m   on m.id = p.membership_id
left join tmc.catalogue cat_m on cat_m.slug = m.plan_variant
cross join lateral (
  select
    coalesce(-sum(c.total_gross_cents), 0) as credited_gross_cents,
    max(c.issued_at)                       as last_credit_issued_at
  from tmc.invoices c
  join tmc.invoices i on i.id = c.credit_of_invoice_id
  where i.payment_id = p.id
    and c.status = 'finalised'
) cr
where p.status = 'paid'
  and p.is_test = false;

comment on view tmc.v_revenue_lines is
  'Een rij per betaalde, niet-test betaalregel: de bron van de omzetrapportage (facturen zijn documenten, geen omzetbron). revenue_category via de order- of membership-catalogusrij; kind = trial_booking krijgt vast ''proefles'' (geen catalogusrij, prijs uit booking_settings; besluitenlog 30); anders NULL = categorie onbekend, nooit stil een aanname. Negatieve omzet volgens 7.4: refunded_cents (maand van refunded_at) plus credit_excess_cents = greatest(0, gecrediteerd - gerestitueerd) (maand van last_credit_issued_at); samen nooit dubbel en nooit een verdwenen bedrag. SELECT alleen voor service_role: de view leest met owner-rechten door RLS heen.';

revoke all on tmc.v_invoice_credit_state from public, anon, authenticated;
revoke all on tmc.v_revenue_lines from public, anon, authenticated;
grant select on tmc.v_invoice_credit_state to service_role;
grant select on tmc.v_revenue_lines to service_role;

-- ---------------------------------------------------------------------------
-- 4. Zelfcontrole binnen dezelfde transactie (compact: happy path,
--    idempotentie, geen-nummer-bij-weigering; de concurrency- en
--    creditnota-batterij draait extern via psql, zie de PR)
-- ---------------------------------------------------------------------------

do $$
declare
  v_profile uuid;
  v_inv uuid;
  v_r jsonb;
  v_next integer;
begin
  select id into v_profile from tmc.profiles where role = 'admin' limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profile, 'role', 'authenticated')::text, true);

  -- Concept + regel, finaliseren op fiscal_year 9999. De reeksrij wordt
  -- vooraf aangemaakt zodat de concept-invoice ernaar kan verwijzen;
  -- finalize_invoice vindt hem daarna via on conflict (fase 1).
  insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
  values ('LIVE', 9999, false, '');

  insert into tmc.invoices (series_id, fiscal_year, is_test, profile_id)
  select id, 9999, false, v_profile
  from tmc.invoice_series where code = 'LIVE' and fiscal_year = 9999
  returning id into v_inv;

  insert into tmc.invoice_lines (invoice_id, line_no, description, unit_net_cents, vat_rate_bp, net_cents, vat_cents, gross_cents)
  values (v_inv, 1, 'Zelfcontrole', 10000, 900, 10000, 900, 10900);

  v_r := tmc.finalize_invoice(v_inv, date '9999-03-10');
  if not (v_r->>'ok')::boolean or v_r->>'invoice_number' <> '9999.001' then
    raise exception 'finalize_invoice: happy path faalt: %', v_r;
  end if;

  -- Idempotentie: zelfde nummer, teller onaangeroerd.
  v_r := tmc.finalize_invoice(v_inv, date '9999-03-10');
  if not (v_r->>'already_finalised')::boolean or v_r->>'invoice_number' <> '9999.001' then
    raise exception 'finalize_invoice: idempotentie faalt: %', v_r;
  end if;
  select next_number into v_next from tmc.invoice_series where code = 'LIVE' and fiscal_year = 9999;
  if v_next <> 2 then
    raise exception 'finalize_invoice: teller hoort op 2 te staan, is %', v_next;
  end if;

  -- Weigering verbruikt geen nummer (A3b in het klein): concept zonder
  -- regels.
  insert into tmc.invoices (series_id, fiscal_year, is_test, profile_id)
  select id, 9999, false, v_profile from tmc.invoice_series where code = 'LIVE' and fiscal_year = 9999
  returning id into v_inv;
  v_r := tmc.finalize_invoice(v_inv, date '9999-03-11');
  if (v_r->>'ok')::boolean or v_r->>'reason' <> 'no_lines' then
    raise exception 'finalize_invoice: no_lines-weigering faalt: %', v_r;
  end if;
  select next_number into v_next from tmc.invoice_series where code = 'LIVE' and fiscal_year = 9999;
  if v_next <> 2 then
    raise exception 'finalize_invoice: weigering verbruikte een nummer (teller %)', v_next;
  end if;

  -- Chronologie sequentieel (A6 in het klein).
  insert into tmc.invoice_lines (invoice_id, line_no, description, unit_net_cents, vat_rate_bp, net_cents, vat_cents, gross_cents)
  values (v_inv, 1, 'Zelfcontrole 2', 10000, 900, 10000, 900, 10900);
  v_r := tmc.finalize_invoice(v_inv, date '9999-03-09');
  if (v_r->>'ok')::boolean or v_r->>'reason' <> 'issued_at_before_last' then
    raise exception 'finalize_invoice: chronologie-weigering faalt: %', v_r;
  end if;
  v_r := tmc.finalize_invoice(v_inv, date '9999-03-10');
  if not (v_r->>'ok')::boolean or v_r->>'invoice_number' <> '9999.002' then
    raise exception 'finalize_invoice: gelijke datum hoort te slagen met nummer 2: %', v_r;
  end if;

  -- Opruimen (finalised rijen: triggers tijdelijk uit, zelfde route als
  -- PR 6).
  alter table tmc.invoices disable trigger invoices_finalised_no_delete;
  alter table tmc.invoices disable trigger invoices_finalised_immutable;
  delete from tmc.invoices where fiscal_year = 9999;
  delete from tmc.invoice_series where fiscal_year = 9999;
  alter table tmc.invoices enable trigger invoices_finalised_no_delete;
  alter table tmc.invoices enable trigger invoices_finalised_immutable;

  if exists (select 1 from tmc.invoices where fiscal_year = 9999)
     or exists (select 1 from tmc.invoice_series where fiscal_year = 9999) then
    raise exception 'finalize_invoice: opruimen onvolledig';
  end if;

  -- De views bestaan en zijn bevraagbaar (leeg resultaat is prima).
  perform * from tmc.v_invoice_credit_state limit 1;
  perform * from tmc.v_revenue_lines limit 1;
end $$;

commit;
