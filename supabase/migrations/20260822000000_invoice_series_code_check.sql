-- Facturatie PR 6, correctie op review (spec-facturatie.md sectie 14): een
-- CHECK op tmc.invoice_series.code zelf.
--
-- 20260821000000_invoice_schema.sql (dezelfde PR, al toegepast) zette twee
-- CHECKs op invoice_series: is_test = (code = 'TEST') en
-- prefix = case when is_test then 'TEST-' else ''. Samen dwingen die af dat
-- is_test = true altijd code = 'TEST' oplevert -- maar ze verbieden niet dat
-- is_test = false een andere waarde dan 'LIVE' krijgt. Een typefout als
-- 'live' of 'LIVE ' zou dus een derde, ongeplande reeks aanmaken die naast
-- de bestaande twee gaat lopen: finalize_invoice (PR 7) kiest de reeks op
-- is_test, niet op de letterlijke waarde van code, en zou zo'n rij gewoon
-- gebruiken.
--
-- Dit is een omissie in sectie 2.4 van de spec, geen bewuste keuze -- de
-- eerdere lezing ("de spec noemt letterlijk twee CHECKs") was feitelijk
-- correct maar onvolledig: er hoorde een derde te staan. Spec-tekst en
-- besluitenlog zijn in dezelfde PR bijgewerkt.
--
-- Losse migratie, niet een wijziging van 20260821000000: die is al
-- toegepast en blijft zoals hij was (zie supabase/migrations/README.md,
-- punt 1 en 2 -- elke migratie is een eigen repo-bestand, een toegepaste
-- migratie wordt niet herschreven).
--
-- Zelfde PR bevat ook een documentatiecorrectie zonder schema-impact: de
-- COMMENT ON INDEX op invoices_payment_id_idx in de vorige migratie citeerde
-- 9.1 als onderbouwing. Dat is onjuist -- 9.1 beschrijft het SCHRIJVEN van
-- payment_id bij het aanmaken van een factuur vanuit een betaling, geen
-- lezende query die op payment_id filtert. De echte onderbouwing staat in
-- 7.4 (de v_revenue_lines-rekenregel, `where i.payment_id = p.id`) en in
-- 8.2 (de /app/facturen-query, `.in("payment_id", <payment-ids>)`). De
-- index zelf blijft ongewijzigd correct; alleen het commentaar wordt hier
-- rechtgezet.

begin;

do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from tmc.invoice_series
  where code not in ('LIVE', 'TEST');

  if v_bad > 0 then
    raise exception 'invoice_series_code_check: % rijen met een code buiten (LIVE, TEST); eerst opschonen', v_bad;
  end if;
end $$;

alter table tmc.invoice_series
  add constraint invoice_series_code_check check (code in ('LIVE', 'TEST'));

comment on column tmc.invoice_series.code is
  'LIVE of TEST, afgedwongen door invoice_series_code_check. Samen met invoice_series_is_test_check en invoice_series_prefix_check is de combinatie (code, is_test, prefix) daarmee volledig gesloten: geen van de drie kan een waarde dragen die niet bij de andere twee past.';

comment on index tmc.invoices_payment_id_idx is
  'Ondersteunt twee lezende paden uit spec-facturatie.md: de v_revenue_lines-rekenregel in 7.4 (`where i.payment_id = p.id`, gecorreleerd per betaalregel) en de /app/facturen-query in 8.2 (`.in("payment_id", <payment-ids van de pagina>)`, tot vijftig ids per paginaload). Niet 9.1: dat pad schrijft payment_id bij het aanmaken van een factuur, filtert er niet op.';

-- ---------------------------------------------------------------------------
-- Zelfcontrole binnen dezelfde transactie
-- ---------------------------------------------------------------------------

do $$
declare
  v_series uuid;
begin
  begin
    insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
    values ('LIVE ', 9997, false, '');
    raise exception 'invoice_series_code_check: had moeten weigeren (code=''LIVE '' met spatie)';
  exception when others then
    if sqlerrm not like '%invoice_series_code_check%' then raise; end if;
  end;

  begin
    insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
    values ('live', 9997, false, '');
    raise exception 'invoice_series_code_check: had moeten weigeren (code=''live'' kleine letters)';
  exception when others then
    if sqlerrm not like '%invoice_series_code_check%' then raise; end if;
  end;

  -- De twee geldige waarden werken nog gewoon (geen regressie op de twee
  -- bestaande CHECKs).
  insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
  values ('LIVE', 9997, false, '')
  returning id into v_series;
  delete from tmc.invoice_series where id = v_series;

  insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
  values ('TEST', 9997, true, 'TEST-')
  returning id into v_series;
  delete from tmc.invoice_series where id = v_series;

  if exists (select 1 from tmc.invoice_series where fiscal_year = 9997) then
    raise exception 'invoice_series_code_check: opruimen onvolledig';
  end if;
end $$;

commit;
