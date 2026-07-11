-- Bewijs van de betaling-wint-invariant rond tmc.admin_cancel_order en
-- tmc.activate_order (migratie 20260724000000_admin_cancel_order_payment_wins).
--
-- Uitgevoerd tegen de live DB op 2026-07-11 (via MCP execute_sql, met
-- wegwerpdata die na afloop is verwijderd; de werkelijke uitkomsten staan
-- per stap in het commentaar). Herdraaien kan met psql tegen het gelinkte
-- project; vervang de twee profiel-id's door een bestaand member- en
-- admin-profiel en ruim de aangemaakte rijen na afloop op (stap 8).
--
-- Waarom dit sequentieel afdoende is voor de race: beide functies nemen
-- dezelfde rijlock (select ... for update op de order). Twee gelijktijdige
-- aanroepen serialiseren dus altijd naar precies een van de twee volgordes
-- die hieronder allebei getest worden (annuleren-dan-activeren en
-- activeren-dan-annuleren). Een derde volgorde bestaat niet.
--
-- \set member_id  '6bf08764-deda-40f3-ade0-d107ea1d77c1'
-- \set admin_id   'ec13f4e4-e800-4eb5-b4af-da109fcfac20'

-- Stap 1: twee wegwerp-orders (product, pending), created_by='admin'.
insert into tmc.orders (profile_id, kind, catalogue_slug, base_price_cents,
  first_charge_cents, pricing_snapshot, created_by, created_by_profile_id,
  status, expires_at)
values
 (:'member_id','product','pt_single', 9000, 9000, '{"test":"race-a"}',
  'admin', :'admin_id', 'pending', now() + interval '7 days'),
 (:'member_id','product','pt_single', 9000, 9000, '{"test":"race-b"}',
  'admin', :'admin_id', 'pending', now() + interval '7 days')
returning id;
-- Noteer de twee id's als :order_a en :order_b.

-- Stap 2 (T1): annuleren van een open verzoek slaagt.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_cancel_order(:'order_a');
commit;
-- WAARGENOMEN: {"ok": true, "already_cancelled": false};
-- order_a: status='cancelled', cancelled_at gezet.

-- Stap 3 (T2): tweede annulering is idempotent, geen tweede transitie.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_cancel_order(:'order_a');
commit;
-- WAARGENOMEN: {"ok": true, "already_cancelled": true}.

-- Stap 4 (T3, DE KERN): een betaling op de geannuleerde order wint alsnog.
-- Simuleert de webhook: payments-upsert (status 'paid') gevolgd door
-- activate_order, zonder jwt (service-role-context, auth.uid() is null).
insert into tmc.payments (mollie_payment_id, order_id, profile_id,
  amount_cents, status, paid_at)
values ('tr_racetest_a', :'order_a', :'member_id', 9000, 'paid', now());
select tmc.activate_order(:'order_a', 'tr_racetest_a');
-- WAARGENOMEN: {"ok": true, "late_payment": true, "already_activated": false,
--   "membership_id": "...", ...};
-- order_a: status='activated', activated_at gezet, membership aangemaakt,
-- cancelled_at blijft staan als audit-spoor (geannuleerd op T1, betaling
-- won op T2).

-- Stap 5 (T4): annuleren van een geactiveerde order wordt geweigerd.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_cancel_order(:'order_a');
commit;
-- WAARGENOMEN: {"ok": false, "reason": "activated"}.

-- Stap 6 (T5): het webhook-venster. De payments-rij (status 'paid') staat
-- er al, maar activate_order is nog niet aangeroepen (order nog 'pending').
-- Annuleren moet dan al weigeren.
insert into tmc.payments (mollie_payment_id, order_id, profile_id,
  amount_cents, status, paid_at)
values ('tr_racetest_b', :'order_b', :'member_id', 9000, 'paid', now());
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_cancel_order(:'order_b');
commit;
-- WAARGENOMEN: {"ok": false, "reason": "already_paid"}.

-- Stap 7 (T6): zonder admin-context weigert de functie hard.
select tmc.admin_cancel_order(:'order_b');
-- WAARGENOMEN: ERROR 42501 "Alleen voor admins."

-- Stap 8: cleanup (volgorde: payments -> orders -> membership, vanwege de
-- FK's payments.order_id en orders.membership_id).
delete from tmc.payments where mollie_payment_id in ('tr_racetest_a','tr_racetest_b');
delete from tmc.orders where id in (:'order_a', :'order_b');
delete from tmc.memberships where id = '<membership_id uit stap 4>';
-- WAARGENOMEN op 2026-07-11: 2 payments, 2 orders, 1 membership verwijderd;
-- geen testdata achtergebleven.
