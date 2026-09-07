-- Facturatie, opruiming van synthetische testfactuur 7777.001 (PR 9b
-- discovery, besluitenlog 32): een eerdere sessie testte
-- tmc.finalize_invoice en de mengtarieven-acceptatiecriteria (11.3 C3)
-- rechtstreeks tegen de database. Fiscal_year 7777 was het gekozen
-- sentinel-jaar, evident fictief, maar de rij bleef staan met
-- is_test = false op een ECHT profiel (Marlon van der Leij). De
-- write-once/immutability-triggers op tmc.invoices bieden geen pad om
-- een gefinaliseerde rij achteraf als test te markeren of te
-- verwijderen -- precies zoals bedoeld voor een echte factuur, maar
-- daarom is deze opruiming een expliciete migratie in plaats van een
-- ad-hoc statement.
--
-- Niet urgent voor leden geweest: /app/facturen (ledenkant) koppelt
-- uitsluitend via payments.id -> invoices.payment_id, en deze rij had
-- payment_id = null, dus hij is nooit op een ledenpagina verschenen.
-- Wel zichtbaar op /app/admin/facturen, dat alle facturen zonder filter
-- toont -- de reden om hem alsnog te verwijderen in plaats van te laten
-- staan.
--
-- Chirurgisch: schakelt invoices_finalised_no_delete alleen binnen deze
-- transactie uit, verwijdert exact de ene rij op id (niet op
-- fiscal_year of nummer, om nooit per ongeluk een buurrij te raken),
-- ruimt de bijbehorende invoice_series-rij op (op id, met fiscal_year
-- en code als extra sanity-check in de where-clausule), en herstelt de
-- trigger voor de commit. De zelfcontrole aan het eind bevestigt zowel
-- de opruiming als dat de trigger aantoonbaar weer actief staat (niet
-- alleen dat het ENABLE-statement zonder fout liep).

begin;

alter table tmc.invoices disable trigger invoices_finalised_no_delete;

delete from tmc.invoices
where id = 'd7e7bc74-cd54-44d4-b4e5-4ac98e70516d';

delete from tmc.invoice_series
where id = 'be685d9d-de7e-4ead-b5e6-c29691ba0a05'
  and fiscal_year = 7777
  and code = 'LIVE';

alter table tmc.invoices enable trigger invoices_finalised_no_delete;

do $$
declare
  v_invoices_left  integer;
  v_series_left    integer;
  v_tgenabled      "char";
begin
  select count(*) into v_invoices_left from tmc.invoices;
  if v_invoices_left <> 0 then
    raise exception 'cleanup_test_invoice_7777: tmc.invoices niet leeg, % rijen over', v_invoices_left;
  end if;

  select count(*) into v_series_left
  from tmc.invoice_series
  where fiscal_year = 7777;
  if v_series_left <> 0 then
    raise exception 'cleanup_test_invoice_7777: invoice_series voor 7777 nog aanwezig';
  end if;

  select tgenabled into v_tgenabled
  from pg_trigger
  where tgrelid = 'tmc.invoices'::regclass
    and tgname = 'invoices_finalised_no_delete';

  if v_tgenabled is distinct from 'O' then
    raise exception 'cleanup_test_invoice_7777: trigger niet correct heractiveerd (tgenabled = %)', v_tgenabled;
  end if;
end $$;

commit;
