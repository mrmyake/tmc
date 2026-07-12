-- Racebewijs voor tmc.admin_undo_cancellation (lifecycle fase 2C, migratie
-- 20260728000000_lifecycle_undo_cancellation.sql).
--
-- Uitgevoerd tegen de live DB op 2026-07-12 (via MCP execute_sql, met
-- wegwerpdata die na afloop is verwijderd; de werkelijke uitkomsten staan
-- per stap in het commentaar). Herdraaien kan met psql tegen het gelinkte
-- project; vervang de profiel-id's zoals bij
-- scripts/test-admin-cancel-membership.sql en ruim de rijen na afloop op.
--
-- Ontwerp dat hier bewezen wordt (beslispunt Ilja 2026-07-12, optie A):
-- undo is ALLEEN toegestaan voor een veilig terugdraaibare opzegging, en
-- de detectie daarvan is lokaal en deterministisch via twee provenance-
-- kolommen (cancellation_source, cancellation_prior_status) die de
-- opzeg-RPC's zelf zetten. Fail-dicht: NULL/onbekend of 'admin' wordt
-- geweigerd, prior status anders dan 'active' wordt geweigerd, en een
-- opzegging waarvan de effectuering due is (effective_date <= vandaag)
-- wordt geweigerd zodat de selecties van undo en de
-- process-cancellations cron disjunct zijn (geen venster waarin de cron
-- Mollie al gecanceld kan hebben).
--
-- Waarom dit sequentieel afdoende is voor de race: admin_undo_cancellation
-- neemt dezelfde rijlock (select ... for update op de membership-rij) als
-- admin_cancel_membership en de pauze/hervat-RPC's. Gelijktijdige
-- aanroepen serialiseren dus naar de sequentiele volgordes hieronder; de
-- idempotentie- en weigertakken vangen de verliezer zonder tweede
-- transitie.
--
-- Gebruikte context bij de run van 2026-07-12:
--   member_id  07839a52-a91a-4d85-80bf-a9e704fcee79  (role member)
--   admin_id   ec13f4e4-e800-4eb5-b4af-da109fcfac20  (role admin)

-- Stap 1: zes wegwerp-memberships. M1 heeft een ACTIEVE lock-in om te
-- bewijzen dat undo die intact laat; M5 start als 'paused' voor de
-- prior-status-guard; commit_months 0 zodat de lid-opzegdatum op
-- current_date + 28 landt (toekomst, dus terugdraaibaar).
insert into tmc.memberships (
  id, profile_id, plan_type, plan_variant, age_category,
  price_per_cycle_cents, billing_cycle_weeks, commit_months, start_date,
  status, source, mollie_customer_id, mollie_subscription_id,
  lock_in_active, lock_in_source, lock_in_price_cents, notes
) values
  ('11111111-1111-4111-8111-111111111101', '<member_id>', 'groepslessen', 'racetest_undo_m1', 'adult', 10000, 4, 0, '2026-06-15', 'active', 'admin_manual', 'cst_racetest_undo', 'sub_racetest_u1', true, 'early_member', 10000, 'RACETEST undo lid-opzegging, wegwerp'),
  ('11111111-1111-4111-8111-111111111102', '<member_id>', 'groepslessen', 'racetest_undo_m2', 'adult', 10000, 4, 0, '2026-06-15', 'active', 'admin_manual', 'cst_racetest_undo', 'sub_racetest_u2', false, null, null, 'RACETEST undo admin-stop geweigerd, wegwerp'),
  ('11111111-1111-4111-8111-111111111103', '<member_id>', 'groepslessen', 'racetest_undo_m3', 'adult', 10000, 4, 0, '2026-06-15', 'active', 'admin_manual', 'cst_racetest_undo', 'sub_racetest_u3', false, null, null, 'RACETEST undo na already_scheduled, wegwerp'),
  ('11111111-1111-4111-8111-111111111104', '<member_id>', 'groepslessen', 'racetest_undo_m4', 'adult', 10000, 4, 0, '2026-06-15', 'active', 'admin_manual', 'cst_racetest_undo', 'sub_racetest_u4', false, null, null, 'RACETEST undo na hard stop, wegwerp'),
  ('11111111-1111-4111-8111-111111111105', '<member_id>', 'groepslessen', 'racetest_undo_m5', 'adult', 10000, 4, 0, '2026-06-15', 'paused', 'admin_manual', 'cst_racetest_undo', null, false, null, null, 'RACETEST undo prior paused, wegwerp'),
  ('11111111-1111-4111-8111-111111111106', '<member_id>', 'groepslessen', 'racetest_undo_m6', 'adult', 10000, 4, 0, '2026-06-15', 'active', 'admin_manual', 'cst_racetest_undo', 'sub_racetest_u6', false, null, null, 'RACETEST undo effectuation_due, wegwerp')
returning id, status, commit_end_date, lock_in_active;
-- WAARGENOMEN: 6 rijen, M1 lock_in_active true, M5 status 'paused',
-- commit_end_date overal 2026-06-15 (verleden, dus lid-opzegdatum wordt
-- current_date + 28).

-- Stap 2 (lid): opzeggingen op M1, M3, M5 (vanuit pauze) en M6.
begin;
set local request.jwt.claims = '{"sub":"<member_id>","role":"authenticated"}';
select 'M1' as m, t.* from tmc.request_membership_cancellation('11111111-1111-4111-8111-111111111101') t
union all
select 'M3', t.* from tmc.request_membership_cancellation('11111111-1111-4111-8111-111111111103') t
union all
select 'M5', t.* from tmc.request_membership_cancellation('11111111-1111-4111-8111-111111111105') t
union all
select 'M6', t.* from tmc.request_membership_cancellation('11111111-1111-4111-8111-111111111106') t;
commit;
-- WAARGENOMEN: alle vier 'cancellation_requested' met effective 2026-08-09
-- (current_date + 28). Markers daarna gecontroleerd: cancellation_source
-- 'member' op alle vier; cancellation_prior_status 'active' op M1/M3/M6 en
-- 'paused' op M5. Lock-in M1 nog true.

-- Stap 3 (T1): undo zonder admin-context wordt hard geweigerd.
begin;
set local request.jwt.claims = '{"sub":"<member_id>","role":"authenticated"}';
select tmc.admin_undo_cancellation('11111111-1111-4111-8111-111111111101');
commit;
-- WAARGENOMEN: ERROR 42501 "Alleen voor admins." (transactie geaborteerd,
-- geen mutatie).

-- Stap 4 (T2 t/m T10, als admin): happy path, idempotentie en alle
-- weigertakken in een run. M6 krijgt vooraf effective_date = current_date
-- om de cron-race-guard te raken.
begin;
set local request.jwt.claims = '{"sub":"<admin_id>","role":"authenticated"}';
update tmc.memberships set cancellation_effective_date = current_date
  where id = '11111111-1111-4111-8111-111111111106';
select 'undo_M1' as step, tmc.admin_undo_cancellation('11111111-1111-4111-8111-111111111101') as res
union all
select 'undo_M1_again', tmc.admin_undo_cancellation('11111111-1111-4111-8111-111111111101')
union all
select 'admin_sched_M2', tmc.admin_cancel_membership('11111111-1111-4111-8111-111111111102', 'racetest admin-stop', false, (current_date + 10))
union all
select 'undo_M2', tmc.admin_undo_cancellation('11111111-1111-4111-8111-111111111102')
union all
select 'admin_later_M3', tmc.admin_cancel_membership('11111111-1111-4111-8111-111111111103', 'racetest later', false, '2026-09-01')
union all
select 'undo_M3', tmc.admin_undo_cancellation('11111111-1111-4111-8111-111111111103')
union all
select 'hard_stop_M4', tmc.admin_cancel_membership('11111111-1111-4111-8111-111111111104', 'racetest hard', true)
union all
select 'undo_M4', tmc.admin_undo_cancellation('11111111-1111-4111-8111-111111111104')
union all
select 'undo_M5_prior_paused', tmc.admin_undo_cancellation('11111111-1111-4111-8111-111111111105')
union all
select 'undo_M6_due', tmc.admin_undo_cancellation('11111111-1111-4111-8111-111111111106');
commit;
-- WAARGENOMEN (2026-07-12):
-- undo_M1              {"ok": true, "restored_status": "active",
--                       "undone_effective_date": "2026-08-09"}
-- undo_M1_again        {"ok": true, "already_active": true}   (idempotent,
--                       geen mutatie)
-- admin_sched_M2       {"ok": true, "mode": "scheduled",
--                       "effective_date": "2026-07-22"}
-- undo_M2              {"ok": false, "reason": "not_safely_undoable",
--                       "cancellation_source": "admin"}   (admin-geplande
--                       stop: Mollie al gecanceld, terminaal)
-- admin_later_M3       {"ok": true, "already_scheduled": true,
--                       "effective_date": "2026-08-09"}   (geen datum-
--                       mutatie, maar marker flipt naar 'admin' omdat de
--                       TS-laag Mollie voor deze aanroep al cancelt)
-- undo_M3              {"ok": false, "reason": "not_safely_undoable",
--                       "cancellation_source": "admin"}   (de geflipte
--                       marker wordt herkend en geweigerd)
-- hard_stop_M4         {"ok": true, "mode": "immediate", "hard_stop": true}
-- undo_M4              {"ok": false, "reason": "already_cancelled"}
-- undo_M5_prior_paused {"ok": false, "reason": "not_safely_undoable",
--                       "cancellation_prior_status": "paused"}   (undo
--                       herstelt alleen naar 'active'; een opzegging
--                       vanuit pauze zou staat corrumperen)
-- undo_M6_due          {"ok": false, "reason": "effectuation_due",
--                       "effective_date": "2026-07-12"}   (cron-race-
--                       guard: due rijen zijn van de cron, nooit van undo)

-- Stap 5: eindstaat-verificatie.
select id, status, cancellation_requested_at, cancellation_effective_date,
       cancellation_source, cancellation_prior_status, lock_in_active
from tmc.memberships
where id in ('11111111-1111-4111-8111-111111111101',
             '11111111-1111-4111-8111-111111111103');
-- WAARGENOMEN: M1 status 'active', alle vier cancellation-velden NULL,
-- lock_in_active nog true (intact; de expire-trigger vuurt alleen op de
-- flip naar 'cancelled'). M3 nog 'cancellation_requested' met
-- cancellation_source 'admin'. In tmc.events staat een
-- membership.cancellation_undone-event (actor_type 'admin') met
-- undone_effective_date en de oorspronkelijke cancellation_requested_at.

-- Stap 6: cleanup van alle wegwerpdata (uitgevoerd 2026-07-12; de
-- tmc.events-rijen blijven staan, het log is append-only).
delete from tmc.membership_pauses where membership_id::text like '11111111-1111-4111-8111-1111111111%';
delete from tmc.bookings where membership_id::text like '11111111-1111-4111-8111-1111111111%';
delete from tmc.memberships where id::text like '11111111-1111-4111-8111-1111111111%';
-- WAARGENOMEN: 6 memberships verwijderd, 0 resterend.
