-- Racebewijs voor de pauze/hervat-primitieven (lifecycle fase 1, migratie
-- 20260725000000_lifecycle_pause_primitives.sql).
--
-- Uitgevoerd tegen de live DB op 2026-07-12 (via MCP execute_sql, met
-- wegwerpdata die na afloop is verwijderd; de werkelijke uitkomsten staan
-- per stap in het commentaar). Herdraaien kan met psql tegen het gelinkte
-- project; vervang de profiel-id's door een bestaand member- (zonder
-- memberships) en admin-profiel en de sessie-id's door toekomstige
-- scheduled adult-sessies, en ruim de aangemaakte rijen na afloop op
-- (stap 12). De Mollie-laag (mandaat-check, idempotente subscription-
-- creatie op het bestaande mandaat, revoke-pad) is apart bewezen in
-- scripts/test-pause-resume-mollie.ts tegen de Mollie-test-API.
--
-- Waarom dit sequentieel afdoende is voor de race: admin_pause_membership,
-- admin_resume_membership, admin_flag_resume_blocked en de loop in
-- process_due_membership_pauses nemen allemaal dezelfde rijlock
-- (select ... for update op de membership-rij). Twee gelijktijdige
-- aanroepen serialiseren dus altijd naar een van de sequentiele volgordes
-- die hieronder allebei getest worden; de idempotentie-takken vangen de
-- verliezer van de race op zonder tweede mutatie.
--
-- Gebruikte context bij de run van 2026-07-12:
--   member_id  07839a52-a91a-4d85-80bf-a9e704fcee79  (member, nul memberships)
--   admin_id   ec13f4e4-e800-4eb5-b4af-da109fcfac20  (role admin)
--   sessie A   c0b4cbaf-3ece-4b3e-9830-93a54ea0050c  (2026-07-13, yoga_mobility)
--   sessie B   a2b0fb04-ad9f-4c54-98aa-ccbacf34db3e  (2026-07-15, yoga_mobility)
--   sessie C   3d7bf2b7-d418-4fc4-94ee-72dffbb4ceff  (2026-07-15, kettlebell)
--   sessie D   91a7a8dd-cc9a-4648-b122-5803f6fc85d7  (2026-07-13, kettlebell)

-- Stap 1: wegwerp-membership (actief groepslessen-abonnement, fake Mollie-
-- id's) plus twee boekingen: een voor de pauze-ingang (sessie A) en een
-- erin (sessie B).
insert into tmc.memberships (
  profile_id, plan_type, plan_variant, frequency_cap, age_category,
  price_per_cycle_cents, billing_cycle_weeks, commit_months, start_date,
  status, mollie_customer_id, mollie_subscription_id, covered_pillars,
  source, extended_access, extended_access_price_cents, notes
) values (
  '07839a52-a91a-4d85-80bf-a9e704fcee79', 'groepslessen', 'racetest_pause',
  null, 'adult', 10000, 4, 12, '2026-06-15',
  'active', 'cst_racetest_pause', 'sub_racetest_1', '{}',
  'admin_manual', false, 0, 'RACETEST lifecycle pauze, wegwerp'
) returning id, commit_end_date;
-- WAARGENOMEN: id bb2c3e44-eb74-4362-8119-442c03ed1825,
-- commit_end_date 2027-06-15 (start + 12 maanden via insert-trigger).
-- Boekingen aangemaakt: 0d224de0 (2026-07-13, A) en 5abc65c5 (2026-07-15, B).

-- Stap 2 (T1): pauzeren zonder admin-context wordt hard geweigerd.
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.admin_pause_membership('bb2c3e44-eb74-4362-8119-442c03ed1825', '2026-07-14');
commit;
-- WAARGENOMEN: ERROR 42501 "Alleen voor admins."

-- Stap 3 (T2): admin plant de pauze op het einde van de lopende cyclus.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_pause_membership('bb2c3e44-eb74-4362-8119-442c03ed1825', '2026-07-14');
commit;
-- WAARGENOMEN: {"ok": true, "pause_id": "a695e294-...", "immediate": false,
--   "cancelled_bookings": 1, "pause_effective_date": "2026-07-14"}.
-- Staat daarna: membership status 'active' (planvenster), pause_planned_at
-- gezet, pause_effective_date 2026-07-14; boeking A (voor ingang) nog
-- 'booked', boeking B (in venster) 'cancelled' met cancellation_reason
-- 'membership_paused'; precies EEN membership_pauses-rij: status 'approved',
-- start 2026-07-14, end null (open venster).

-- Stap 4 (T3): dubbel plannen is idempotent en verplaatst de datum NIET.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_pause_membership('bb2c3e44-eb74-4362-8119-442c03ed1825', '2026-07-20');
commit;
-- WAARGENOMEN: {"ok": true, "already_planned": true,
--   "pause_effective_date": "2026-07-14"}; geen tweede pauze-rij.

-- Stap 5 (T4): de book_class_session-guard. In het pauzevenster geen
-- dekking; voor de ingangsdatum boekt het gewoon.
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.book_class_session('3d7bf2b7-d418-4fc4-94ee-72dffbb4ceff') as in_window,
       tmc.book_class_session('91a7a8dd-cc9a-4648-b122-5803f6fc85d7') as before_window;
commit;
-- WAARGENOMEN: in_window {"ok": false, "reason": "no_coverage"};
-- before_window {"ok": true, "booking_id": "a896268b-...", "credits_used": 0,
--   "session_date": "2026-07-13"}.

-- Stap 6 (T5): effectuerings-RPC met niets due is een no-op.
select tmc.process_due_membership_pauses();
-- WAARGENOMEN: {"ok": true, "processed": 0, "membership_ids": [],
--   "swept_bookings": 0} (ingangsdatum 2026-07-14 ligt in de toekomst).

-- Stap 7: testmanipulatie, simuleer 10 dagen tijdsverloop.
update tmc.memberships set pause_effective_date = '2026-07-02'
where id = 'bb2c3e44-eb74-4362-8119-442c03ed1825';
update tmc.membership_pauses set start_date = '2026-07-02'
where id = 'a695e294-58fb-40ef-ae3d-02be947cad47';

-- Stap 8 (T6 + T7): effectuering flipt naar paused en veegt het (verplaatste)
-- venster; een tweede run is idempotent.
select tmc.process_due_membership_pauses();
-- WAARGENOMEN: {"ok": true, "processed": 1,
--   "membership_ids": ["bb2c3e44-..."], "swept_bookings": 2}
--   (boeking A en de stap-5-boeking vallen nu in het venster).
-- Staat daarna: status 'paused', pauze-rij status 'active',
-- commit_end_date ONGEWIJZIGD 2027-06-15 (shift volgt pas bij hervatten).
select tmc.process_due_membership_pauses();
-- WAARGENOMEN: {"ok": true, "processed": 0, ...}.

-- Stap 9 (T8 + T9): hervat-weigeringen. Zonder subscription-id, en zonder
-- admin-context.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_resume_membership('bb2c3e44-eb74-4362-8119-442c03ed1825', null);
commit;
-- WAARGENOMEN: {"ok": false, "reason": "missing_subscription_id"}.
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.admin_resume_membership('bb2c3e44-eb74-4362-8119-442c03ed1825', 'sub_racetest_2');
commit;
-- WAARGENOMEN: ERROR 42501 "Alleen voor admins."

-- Stap 10 (T10): de expliciete herautorisatie-staat, idempotent.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_flag_resume_blocked('bb2c3e44-eb74-4362-8119-442c03ed1825', 'mandate_invalid') as eerste,
       tmc.admin_flag_resume_blocked('bb2c3e44-eb74-4362-8119-442c03ed1825', 'mandate_invalid') as tweede;
commit;
-- WAARGENOMEN: eerste {"ok": true, "resume_blocked_reason": "mandate_invalid"};
-- tweede {"ok": true, "already_flagged": true, ...}.

-- Stap 11 (T11 + T12): hervatten met commitment-shift, daarna idempotent.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_resume_membership('bb2c3e44-eb74-4362-8119-442c03ed1825', 'sub_racetest_2');
commit;
-- WAARGENOMEN: {"ok": true, "pause_id": "a695e294-...", "shift_days": 10,
--   "commit_end_date": "2027-06-25", "mollie_subscription_id": "sub_racetest_2"}.
-- Staat daarna: status 'active', commit_end_date 2027-06-25 (was 2027-06-15,
-- plus de 10 werkelijk gepauzeerde dagen), mollie_subscription_id
-- 'sub_racetest_2', pause_planned_at/pause_effective_date/
-- resume_blocked_reason alle null, pauze-rij status 'completed' met
-- start 2026-07-02 en end 2026-07-12.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_resume_membership('bb2c3e44-eb74-4362-8119-442c03ed1825', 'sub_racetest_2');
commit;
-- WAARGENOMEN: {"ok": true, "already_active": true, "same_subscription": true,
--   "mollie_subscription_id": "sub_racetest_2"}; geen tweede transitie.

-- Stap 12 (T13 + T14 + T15): een credit-rij is niet pauzeerbaar en
-- PT/Duo-credits blijven onaangeraakt; per-direct-pauze (ingang vandaag)
-- flipt meteen; zelfde-dag hervatten geeft shift 0.
insert into tmc.memberships (
  profile_id, plan_type, plan_variant, age_category, price_per_cycle_cents,
  billing_cycle_weeks, commit_months, start_date, status, source,
  credits_total, credits_remaining, notes
) values (
  '07839a52-a91a-4d85-80bf-a9e704fcee79', 'pt_package', 'pt_10', 'adult', 55000,
  0, 0, current_date, 'active', 'admin_manual', 10, 7, 'RACETEST credit-rij, wegwerp'
) returning id;
-- WAARGENOMEN: id fc6e6c3f-2e98-495d-bf38-f99201b181b7, credits_remaining 7.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_pause_membership('fc6e6c3f-2e98-495d-bf38-f99201b181b7', current_date) as credit_rij,
       tmc.admin_pause_membership('bb2c3e44-eb74-4362-8119-442c03ed1825', current_date) as per_direct;
commit;
-- WAARGENOMEN: credit_rij {"ok": false, "reason": "not_pausable_plan"};
-- per_direct {"ok": true, "pause_id": "d0c05ef1-...", "immediate": true,
--   "cancelled_bookings": 0, "pause_effective_date": "2026-07-12"}.
-- Staat daarna: membership meteen 'paused', pauze-rij meteen 'active';
-- credits_remaining van de PT-rij ONGEWIJZIGD 7 (boeking-annulering is
-- membership_id-gescoped, credits staan op eigen rijen).
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_resume_membership('bb2c3e44-eb74-4362-8119-442c03ed1825', 'sub_racetest_3');
commit;
-- WAARGENOMEN: {"ok": true, "pause_id": "d0c05ef1-...", "shift_days": 0,
--   "commit_end_date": "2027-06-25", "mollie_subscription_id": "sub_racetest_3"}.

-- Stap 13: cleanup van alle wegwerpdata (uitgevoerd 2026-07-12; de
-- tmc.events-rijen van de test blijven staan, de log is append-only en
-- update/delete is daar per trigger geblokkeerd).
delete from tmc.bookings
where membership_id in ('bb2c3e44-eb74-4362-8119-442c03ed1825', 'fc6e6c3f-2e98-495d-bf38-f99201b181b7');
delete from tmc.membership_pauses
where membership_id in ('bb2c3e44-eb74-4362-8119-442c03ed1825', 'fc6e6c3f-2e98-495d-bf38-f99201b181b7');
delete from tmc.memberships
where id in ('bb2c3e44-eb74-4362-8119-442c03ed1825', 'fc6e6c3f-2e98-495d-bf38-f99201b181b7');
-- WAARGENOMEN: 3 bookings, 2 pauzes, 2 memberships verwijderd;
-- tmc.memberships-telling terug op 2 (de staat van voor de test).
