-- Facturatie: de LIVE-reeks van boekjaar 2026 leegmaken voor de eerste echte
-- factuur (spec-facturatie.md besluit 45; precedent: besluit 32 en migratie
-- 20260827000000_cleanup_test_invoice_7777.sql).
--
-- De reeks bevatte alleen testfacturen op profielen met is_test = false
-- (2026.001 tot en met 2026.005 en een concept), gemaakt bij het testen van
-- PR #338, #339 en #340. Geen van deze facturen is bij een klant aangekomen:
-- de zeven factuurmails gingen naar de adressen van Marlon en Ilja zelf
-- (bevestigd door Ilja, 2026-11-10).
--
-- De reeks van boekjaar 2026 start bewust bij 2026.011. De nummers 2026.001
-- tot en met 2026.010 zijn nooit als factuur aan een klant uitgereikt;
-- 2026.001 tot en met 2026.005 waren testfacturen die zijn verwijderd,
-- 2026.006 tot en met 2026.010 zijn nooit aangemaakt.
--
-- De echte betaling tr_4CCyWTDg3Zo8zkQTk7PZJ (EUR 1,00 via iDEAL op 2026.005)
-- was een testbetaling door Ilja zelf. Hij is bewust NIET terugbetaald: hij
-- blijft zichtbaar in het Mollie live-dashboard en in de uitbetaling, en
-- staat na deze opruiming niet meer in tmc.v_revenue_lines. De eis "volledig
-- terugbetaald" vervalt voor precies deze ene payments-rij, op id, en geldt
-- voor elke andere niet-test factuurbetaling.
--
-- Chirurgisch, in een transactie:
--   1. Poort: alleen de zes bekende facturen, geen creditnota's of
--      toekenningen eraan, geen andere niet-terugbetaalde echte
--      factuurbetaling, de LIVE-teller staat nog op 6.
--   2. payments.invoice_id op null voor de ene betrokken rij.
--   3. invoices_finalised_no_delete uit (invoices_finalised_immutable blijft
--      aan: er is geen update op tmc.invoices).
--   4. De zes facturen exact op id verwijderen; invoice_lines en
--      invoice_pay_tokens volgen via cascade.
--   5. De ene payments-rij op id verwijderen; payment_refunds volgt via cascade.
--   6. tmc.invoice_series LIVE 2026: next_number van 6 naar 11.
--   7. Trigger weer aan, en een zelfcontrole die de transactie laat falen als
--      er iets niet klopt.
--
-- Blijft staan als spoor: tmc.admin_audit_log en tmc.events, ook waar ze naar
-- de verwijderde facturen verwijzen. De TEST-reeks en alle is_test-data
-- blijven ongemoeid. De PDF's in de bucket tmc-invoices gaan via
-- scripts/cleanup-live-invoice-pdfs.mjs (storage API), niet via SQL.
--
-- Replay op een lege database (README regel 6): de rijen bestaan daar niet;
-- de migratie slaat zichzelf dan over met een notice.

begin;

do $$
declare
  c_invoice_ids constant uuid[] := array[
    '55894c83-923e-433d-a65f-db442705c605',  -- 2026.001
    '9310b049-b966-47d8-a528-ae8f107b06b0',  -- 2026.002
    '751f5fca-7ca0-4930-8204-fc04a41acf42',  -- 2026.003
    '370fd7b5-560e-46f1-831f-52cd8cfe08cb',  -- 2026.004
    '9d53dd97-5f15-43c5-94b6-b7c4269481dc',  -- 2026.005
    'ece424d0-b515-4f68-af58-8c0de5d90aa6'   -- concept
  ]::uuid[];
  -- Testbetaling van EUR 1,00 door Ilja zelf op 2026.005, bewust niet
  -- terugbetaald (tr_4CCyWTDg3Zo8zkQTk7PZJ).
  c_payment_id constant uuid := '2d771cf1-bc8e-4b68-8621-c60529573937';
  c_invoice_paid constant uuid := '9d53dd97-5f15-43c5-94b6-b7c4269481dc';

  v_present      integer;
  v_live_total   integer;
  v_other        integer;
  v_next         integer;
  v_test_inv_before  integer;
  v_test_next_before integer;
  v_test_inv_after   integer;
  v_test_next_after  integer;
  v_deleted      integer;
  v_bad_triggers integer;
begin
  select count(*) into v_present from tmc.invoices where id = any (c_invoice_ids);
  select count(*) into v_live_total from tmc.invoices where is_test = false;

  -- Replay op een lege (shadow-)database: niets te doen.
  if v_present = 0 and v_live_total = 0 then
    raise notice 'cleanup_live_test_invoices_2026: geen LIVE-facturen aanwezig, overgeslagen.';
    return;
  end if;

  -- ---------------------------------------------------------------------
  -- 1. Poort
  -- ---------------------------------------------------------------------
  if v_present <> 6 then
    raise exception 'cleanup_live_test_invoices_2026: % van de 6 verwachte facturen aanwezig.', v_present;
  end if;
  if v_live_total <> 6 then
    raise exception 'cleanup_live_test_invoices_2026: er zijn % facturen met is_test = false; alleen de 6 bekende mogen bestaan.', v_live_total;
  end if;

  select count(*) into v_other
  from tmc.invoices where id = any (c_invoice_ids) and (is_test or fiscal_year <> 2026);
  if v_other <> 0 then
    raise exception 'cleanup_live_test_invoices_2026: een factuur in de lijst is een testfactuur of van een ander boekjaar.';
  end if;

  select count(*) into v_other
  from tmc.invoices where credit_of_invoice_id = any (c_invoice_ids);
  if v_other <> 0 then
    raise exception 'cleanup_live_test_invoices_2026: er hangt een creditnota aan een van de facturen.';
  end if;

  select count(*) into v_other
  from tmc.product_grants where invoice_id = any (c_invoice_ids);
  if v_other <> 0 then
    raise exception 'cleanup_live_test_invoices_2026: er hangt een producttoekenning aan een van de facturen.';
  end if;

  -- Geen andere betaling aan deze facturen dan de ene bekende.
  select count(*) into v_other
  from tmc.payments p
  where p.id <> c_payment_id
    and (p.invoice_id = any (c_invoice_ids)
         or p.mollie_payment_id in (select 'bank:' || i::text from unnest(c_invoice_ids) i));
  if v_other <> 0 then
    raise exception 'cleanup_live_test_invoices_2026: er hangt een onbekende betaling aan een van de facturen.';
  end if;

  -- De ene bekende betaling is wat we verwachten.
  select count(*) into v_other
  from tmc.payments p
  where p.id = c_payment_id
    and p.invoice_id = c_invoice_paid
    and p.kind = 'invoice'
    and p.is_test = false
    and p.amount_cents = 100
    and p.mollie_payment_id = 'tr_4CCyWTDg3Zo8zkQTk7PZJ';
  if v_other <> 1 then
    raise exception 'cleanup_live_test_invoices_2026: de testbetaling op 2026.005 is niet wat verwacht wordt.';
  end if;

  -- Elke ANDERE niet-test factuurbetaling moet volledig terugbetaald zijn.
  select count(*) into v_other
  from tmc.payments p
  where p.kind = 'invoice'
    and p.is_test = false
    and p.id <> c_payment_id
    and p.status = 'paid'
    and coalesce(p.refunded_amount_cents, 0) < p.amount_cents;
  if v_other <> 0 then
    raise exception 'cleanup_live_test_invoices_2026: er is een andere echte factuurbetaling die niet volledig is terugbetaald.';
  end if;

  select next_number into v_next
  from tmc.invoice_series where code = 'LIVE' and fiscal_year = 2026;
  if v_next is distinct from 6 then
    raise exception 'cleanup_live_test_invoices_2026: LIVE-teller 2026 staat op %, verwacht 6.', v_next;
  end if;

  select count(*) into v_test_inv_before from tmc.invoices where is_test;
  select next_number into v_test_next_before
  from tmc.invoice_series where code = 'TEST' and fiscal_year = 2026;

  -- ---------------------------------------------------------------------
  -- 2 tot en met 6. Opruimen
  -- ---------------------------------------------------------------------
  update tmc.payments set invoice_id = null
  where id = c_payment_id and invoice_id = c_invoice_paid;

  alter table tmc.invoices disable trigger invoices_finalised_no_delete;

  delete from tmc.invoices where id = any (c_invoice_ids) and is_test = false;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 6 then
    raise exception 'cleanup_live_test_invoices_2026: % facturen verwijderd, verwacht 6.', v_deleted;
  end if;

  delete from tmc.payments where id = c_payment_id and invoice_id is null;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'cleanup_live_test_invoices_2026: % betalingen verwijderd, verwacht 1.', v_deleted;
  end if;

  update tmc.invoice_series set next_number = 11
  where code = 'LIVE' and fiscal_year = 2026 and next_number = 6;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'cleanup_live_test_invoices_2026: LIVE-teller niet bijgewerkt.';
  end if;

  alter table tmc.invoices enable trigger invoices_finalised_no_delete;

  -- ---------------------------------------------------------------------
  -- 7. Zelfcontrole
  -- ---------------------------------------------------------------------
  select count(*) into v_bad_triggers
  from pg_trigger
  where tgrelid = 'tmc.invoices'::regclass
    and not tgisinternal
    and tgenabled is distinct from 'O';
  if v_bad_triggers <> 0 then
    raise exception 'cleanup_live_test_invoices_2026: % trigger(s) op tmc.invoices niet actief.', v_bad_triggers;
  end if;
  select count(*) into v_other
  from pg_trigger
  where tgrelid = 'tmc.invoices'::regclass
    and tgname in ('invoices_finalised_no_delete', 'invoices_finalised_immutable')
    and tgenabled = 'O';
  if v_other <> 2 then
    raise exception 'cleanup_live_test_invoices_2026: de bewakingstriggers op tmc.invoices staan niet allebei aan.';
  end if;

  select count(*) into v_other from tmc.invoices where is_test = false;
  if v_other <> 0 then
    raise exception 'cleanup_live_test_invoices_2026: nog % facturen met is_test = false.', v_other;
  end if;

  select next_number into v_next
  from tmc.invoice_series where code = 'LIVE' and fiscal_year = 2026;
  if v_next is distinct from 11 then
    raise exception 'cleanup_live_test_invoices_2026: LIVE-teller staat op %, verwacht 11.', v_next;
  end if;

  select count(*) into v_test_inv_after from tmc.invoices where is_test;
  select next_number into v_test_next_after
  from tmc.invoice_series where code = 'TEST' and fiscal_year = 2026;
  if v_test_inv_after <> v_test_inv_before
     or v_test_next_after is distinct from v_test_next_before then
    raise exception 'cleanup_live_test_invoices_2026: de TEST-reeks is geraakt.';
  end if;

  select count(*) into v_other
  from tmc.payments where id = c_payment_id or mollie_payment_id = 'tr_4CCyWTDg3Zo8zkQTk7PZJ';
  if v_other <> 0 then
    raise exception 'cleanup_live_test_invoices_2026: de testbetaling staat er nog.';
  end if;

  raise notice 'cleanup_live_test_invoices_2026: 6 facturen en 1 betaling verwijderd, LIVE-teller 2026 op 11.';
end $$;

commit;
