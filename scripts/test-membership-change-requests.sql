-- Racebewijs voor tmc.membership_change_requests plus de RPC's
-- request_membership_change / cancel_membership_change_request /
-- process_due_membership_change_requests (lifecycle fase 2B, migratie
-- 20260727000000_change_requests_and_email_correction.sql).
--
-- Uitgevoerd tegen de live DB op 2026-07-12 (via MCP execute_sql, met
-- wegwerpdata die na afloop is verwijderd; de werkelijke uitkomsten staan
-- per stap in het commentaar). Herdraaien kan met psql; vervang de
-- profiel-id's zoals bij de eerdere racebewijzen. LET OP: elke stap met
-- `set local request.jwt.claims` moet expliciet met `commit;` afgesloten
-- worden; een sessie die sluit zonder commit rolt de mutatie terug.
--
-- Waarom dit sequentieel afdoende is voor de race: request en cancel
-- locken de membership- respectievelijk request-rij (`for update`), de
-- verwerking locket request-dan-membership met `skip locked`, en de unieke
-- partial index mcr_one_pending_per_membership maakt een tweede pending
-- verzoek per membership onmogelijk, ook onder gelijktijdigheid.
--
-- Verwerkingskeuze (gemotiveerd): het Mollie-bedrag gaat DIRECT bij het
-- verzoek omhoog (TS-laag, updateMollieSubscriptionAmount), zodat de
-- eerstvolgende incasso op de factuurdatum gegarandeerd het nieuwe bedrag
-- is ongeacht Mollie's SEPA-aanlooptijd; de entitlements wisselen op de
-- factuurdatum via de process-change-requests cron. Geen proratie by
-- construction. De TS-laag schuift het verzoek een hele cyclus op wanneer
-- de volgende incasso binnen 2 dagen valt (SEPA-guard), zodat bedrag en
-- rechten nooit uiteenlopen.
--
-- Gebruikte context bij de run van 2026-07-12:
--   member_id  07839a52-a91a-4d85-80bf-a9e704fcee79  (member, eigenaar)
--   admin_id   ec13f4e4-e800-4eb5-b4af-da109fcfac20  (role admin)
--   catalogusprijzen: groepslessen_2x 7900, groepslessen_3x 9900,
--   groepslessen_unl 11900, all_inclusive_unl 14900 (per 4 weken, cents)

-- Stap 1: twee wegwerp-memberships. M1 op groepslessen_3x (9900),
-- M2 op groepslessen_unl (11900), beide actief met fake Mollie-id's.
insert into tmc.memberships (
  profile_id, plan_type, plan_variant, frequency_cap, age_category,
  price_per_cycle_cents, billing_cycle_weeks, commit_months, start_date,
  status, mollie_customer_id, mollie_subscription_id, covered_pillars, source,
  extended_access, extended_access_price_cents, notes
) values
 ('07839a52-a91a-4d85-80bf-a9e704fcee79', 'groepslessen', 'groepslessen_3x', 3, 'adult',
  9900, 4, 12, '2026-06-15', 'active', 'cst_racetest_ch', 'sub_racetest_ch1',
  array['yoga_mobility','kettlebell'], 'admin_manual', false, 0, 'RACETEST change M1, wegwerp'),
 ('07839a52-a91a-4d85-80bf-a9e704fcee79', 'groepslessen', 'groepslessen_unl', null, 'adult',
  11900, 4, 12, '2026-06-15', 'active', 'cst_racetest_ch', 'sub_racetest_ch2',
  array['yoga_mobility','kettlebell'], 'admin_manual', false, 0, 'RACETEST change M2, wegwerp')
returning id, plan_variant, commit_end_date;
-- WAARGENOMEN: M1 beb11794 (3x), M2 d2fb2897 (unl), commit_end_date beide
-- 2027-06-15.

-- Stap 2 (T1): zonder eigenaar- of admin-context is het membership
-- onvindbaar (geen informatie-lek, geen mutatie).
select tmc.request_membership_change('beb11794-c299-4d74-bb5b-f7f22cdab346', 'groepslessen_unl', false, '2026-07-26');
-- WAARGENOMEN: {"ok": false, "reason": "membership_not_found"}
-- (uitgevoerd zonder jwt-claims: auth.uid() null, tmc.is_admin() false).

-- Stap 3 (T2): de EIGENAAR vraagt een upgrade aan (3x naar onbeperkt).
-- Display-equals-charge: het snapshot-bedrag is exact de catalogusprijs
-- via tmc._compute_order_price.
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.request_membership_change('beb11794-c299-4d74-bb5b-f7f22cdab346', 'groepslessen_unl', false, '2026-07-26') as owner_upgrade,
       tmc._compute_order_price('groepslessen_unl', false, false, false)->>'recurring_cents' as catalogue_recurring;
commit;
-- WAARGENOMEN: owner_upgrade {"ok": true, "request_id": "42e310dc-...",
--   "effective_date": "2026-07-26", "current_recurring_cents": 9900,
--   "new_recurring_cents": 11900, "mollie_subscription_id": "sub_racetest_ch1"};
-- catalogue_recurring "11900": snapshot is byte-gelijk aan de catalogus.

-- Stap 4 (T3): idempotentie en de een-pending-regel.
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.request_membership_change('beb11794-c299-4d74-bb5b-f7f22cdab346', 'groepslessen_unl', false, '2026-07-30') as same_again,
       tmc.request_membership_change('beb11794-c299-4d74-bb5b-f7f22cdab346', 'all_inclusive_unl', false, '2026-07-26') as other_while_pending,
       tmc.request_membership_change('d2fb2897-036c-43a3-aa11-4e849053984f', 'groepslessen_2x', false, '2026-07-26') as downgrade,
       tmc.request_membership_change('d2fb2897-036c-43a3-aa11-4e849053984f', 'groepslessen_unl', false, '2026-07-26') as no_change;
commit;
-- WAARGENOMEN: same_again {"ok": true, "already_pending": true,
--   "effective_date": "2026-07-26"} (zelfde verzoek, datum blijft);
-- other_while_pending {"ok": false, "reason": "pending_exists"};
-- downgrade {"ok": false, "reason": "not_an_upgrade",
--   "current_recurring_cents": 11900, "new_recurring_cents": 7900}
--   (downgraden bestaat niet via dit pad);
-- no_change {"ok": false, "reason": "no_change"}.

-- Stap 5 (T4): admin mag op andermans membership aanvragen.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.request_membership_change('d2fb2897-036c-43a3-aa11-4e849053984f', 'all_inclusive_unl', false, '2026-07-26') as admin_request;
commit;
-- WAARGENOMEN: {"ok": true, "request_id": "922768d9-...",
--   "current_recurring_cents": 11900, "new_recurring_cents": 14900}.

-- Stap 6 (T5): verwerking. Niets due is een no-op; daarna de
-- testmanipulatie (factuurdatum bereikt, en op M2 een subscription-wissel
-- om de defensieve weigering te bewijzen).
select tmc.process_due_membership_change_requests();
-- WAARGENOMEN: {"ok": true, "applied": 0, "failed": []}.
update tmc.membership_change_requests set effective_date = current_date where id = '42e310dc-b44c-4730-867e-6acd9f375ae1';
update tmc.membership_change_requests set effective_date = current_date where id = '922768d9-0257-4e7f-9933-bbb2744c338e';
update tmc.memberships set mollie_subscription_id = 'sub_racetest_ch2_NIEUW' where id = 'd2fb2897-036c-43a3-aa11-4e849053984f';
select tmc.process_due_membership_change_requests();
-- WAARGENOMEN: {"ok": true, "applied": 1, "applied_ids": ["42e310dc-..."],
--   "failed": [{"request_id": "922768d9-...", "reason": "subscription_changed"}]}.
-- Staat daarna (M1): plan_variant 'groepslessen_unl', frequency_cap null,
-- price_per_cycle_cents 11900, extended_access false, en commit_months 12
-- plus commit_end_date 2027-06-15 ONGEWIJZIGD (upgrade raakt de commitment
-- niet). Verzoek 1 'applied'; verzoek 2 'failed' met failure_reason
-- 'subscription_changed'. Tweede run: {"applied": 0} (idempotent).

-- Stap 7 (T6): EM-prijsslot en pauze weigeren.
update tmc.memberships set lock_in_active = true, lock_in_price_cents = 11900, lock_in_source = 'early_member' where id='beb11794-c299-4d74-bb5b-f7f22cdab346';
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.request_membership_change('beb11794-c299-4d74-bb5b-f7f22cdab346', 'all_inclusive_unl', false, '2026-07-26');
commit;
-- WAARGENOMEN: {"ok": false, "reason": "lock_in_active"}.
update tmc.memberships set lock_in_active = false, lock_in_price_cents = null, lock_in_source = null, pause_effective_date = '2026-07-20' where id='beb11794-c299-4d74-bb5b-f7f22cdab346';
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.request_membership_change('beb11794-c299-4d74-bb5b-f7f22cdab346', 'all_inclusive_unl', false, '2026-07-26');
commit;
-- WAARGENOMEN: {"ok": false, "reason": "not_changeable_paused"}.
update tmc.memberships set pause_effective_date = null where id='beb11794-c299-4d74-bb5b-f7f22cdab346';

-- Stap 8 (T7): annuleren door de eigenaar, met de restore-informatie voor
-- de TS-laag (Mollie-bedrag terug), en idempotent dubbel annuleren.
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.request_membership_change('beb11794-c299-4d74-bb5b-f7f22cdab346', 'all_inclusive_unl', false, '2026-07-26') as new_request;
commit;
-- WAARGENOMEN: {"ok": true, "request_id": "2d878a21-...",
--   "current_recurring_cents": 11900, "new_recurring_cents": 14900}.
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.cancel_membership_change_request('2d878a21-353a-4562-bc85-c2e64dbf238d') as cancel_once,
       tmc.cancel_membership_change_request('2d878a21-353a-4562-bc85-c2e64dbf238d') as cancel_twice;
commit;
-- WAARGENOMEN: cancel_once {"ok": true, "membership_id": "beb11794-...",
--   "mollie_customer_id": "cst_racetest_ch",
--   "mollie_subscription_id": "sub_racetest_ch1",
--   "restore_recurring_cents": 11900};
-- cancel_twice {"ok": true, "already_cancelled": true}.

-- Stap 9: cleanup van alle wegwerpdata (uitgevoerd 2026-07-12; de
-- tmc.events-rijen blijven staan, het log is append-only).
delete from tmc.membership_change_requests where membership_id in
  ('beb11794-c299-4d74-bb5b-f7f22cdab346','d2fb2897-036c-43a3-aa11-4e849053984f');
delete from tmc.memberships where id in
  ('beb11794-c299-4d74-bb5b-f7f22cdab346','d2fb2897-036c-43a3-aa11-4e849053984f');
-- WAARGENOMEN: 3 requests (applied, failed en cancelled) en 2 memberships
-- verwijderd; de memberships-telling is terug op de staat van voor de test.
