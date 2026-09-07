-- Facturatie, losse fix voor 9b (spec-facturatie.md besluitenlog 31, door
-- PR 9a blootgelegd): payments_self_read miste de is_test-clausule.
--
-- 6.8 claimt dubbele bescherming op /app/facturen (RLS-policy en query),
-- maar de live policy was uitsluitend profile_id = auth.uid(): de
-- is_test-kolom kwam pas in PR 2 (20260818000000) op deze tabel, terwijl de
-- policies uit de baseline stammen. Een kolom die later aan een bestaande
-- tabel wordt toegevoegd erft geen filter in bestaande policies; wie een
-- kolom toevoegt moet de policies van die tabel opnieuw langslopen. De
-- invoice-tabellen (PR 6) zijn na het testmodus-ontwerp geboren en kregen
-- het filter meteen; alleen payments viel in dat gat.
--
-- Alleen payments_self_read wordt aangescherpt. payments_admin_all blijft
-- onaangeroerd: policies zijn OR-semantiek, dus een admin blijft onder RLS
-- alles zien, inclusief testrijen (nodig voor het ledendetail-scenario in
-- 6.8). Alle service-role paden (webhooks, create-order, payment-link,
-- admin-dashboard, admin-ledendetail) bypassen RLS sowieso en merken hier
-- niets van.
--
-- Bewuste consequentie (6.8): een TESTLID ziet zijn eigen testbetalingen
-- niet meer op /app/facturen en /app/producten. De test-flow wordt
-- geverifieerd via de transactionele mail en het admin-ledendetail, niet
-- via de ledenpagina.
--
-- Orders en memberships hebben bewust geen is_test-kolom (modus woont op
-- het profiel) en hun policies zijn correct zoals ze zijn; trial_bookings
-- heeft geen self_read en is dus al dicht. Geverifieerd in de discovery
-- van deze PR.

begin;

drop policy payments_self_read on tmc.payments;

create policy payments_self_read on tmc.payments
  for select using (profile_id = auth.uid() and is_test = false);

-- Zelfcontrole binnen dezelfde transactie: de policy staat er, met exact
-- de bedoelde qual, en admin_all is onaangeroerd.
do $$
declare
  v_qual text;
begin
  select qual into v_qual
  from pg_policies
  where schemaname = 'tmc' and tablename = 'payments' and policyname = 'payments_self_read';

  if v_qual is null then
    raise exception 'payments_rls_is_test: policy ontbreekt na recreate';
  end if;
  if v_qual not like '%is_test = false%' or v_qual not like '%auth.uid()%' then
    raise exception 'payments_rls_is_test: qual is niet zoals bedoeld: %', v_qual;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tmc' and tablename = 'payments'
      and policyname = 'payments_admin_all' and qual = 'tmc.is_admin()'
  ) then
    raise exception 'payments_rls_is_test: payments_admin_all is geraakt en dat mag niet';
  end if;
end $$;

commit;
