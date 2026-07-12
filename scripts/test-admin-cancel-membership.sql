-- Racebewijs voor tmc.admin_cancel_membership (lifecycle fase 2A, migratie
-- 20260726000000_admin_cancel_membership.sql).
--
-- Uitgevoerd tegen de live DB op 2026-07-12 (via MCP execute_sql, met
-- wegwerpdata die na afloop is verwijderd; de werkelijke uitkomsten staan
-- per stap in het commentaar). Herdraaien kan met psql tegen het gelinkte
-- project; vervang de profiel-id's en sessie-id's zoals bij
-- scripts/test-pause-resume-race.sql en ruim de rijen na afloop op.
--
-- Waarom dit sequentieel afdoende is voor de race: admin_cancel_membership
-- neemt dezelfde rijlock (select ... for update op de membership-rij) als
-- de pauze/hervat-RPC's en als de fase 1-effectuering. Gelijktijdige
-- aanroepen serialiseren dus naar de sequentiele volgordes die hieronder
-- getest worden; de idempotentie-takken (already_cancelled,
-- already_scheduled) vangen de verliezer zonder tweede transitie.
--
-- Hergebruik-invariant (kern van het ontwerp): de default-modus zet EXACT
-- de staat van het lid-opzegpad (status 'cancellation_requested' plus
-- cancellation_effective_date) en wordt door de BESTAANDE
-- process-cancellations cron geflipt naar 'cancelled'. Er is geen tweede
-- effectueringspad; de Mollie-subscription is op het stop-moment al door
-- de TS-laag geannuleerd, waardoor de Mollie-stap van de cron een
-- idempotente no-op is (cancelMollieSubscription telt 'canceled' als
-- succes).
--
-- Gebruikte context bij de run van 2026-07-12:
--   member_id  07839a52-a91a-4d85-80bf-a9e704fcee79  (member, nul memberships)
--   admin_id   ec13f4e4-e800-4eb5-b4af-da109fcfac20  (role admin)
--   sessie A   c0b4cbaf-3ece-4b3e-9830-93a54ea0050c  (2026-07-13, yoga_mobility)
--   sessie B   a2b0fb04-ad9f-4c54-98aa-ccbacf34db3e  (2026-07-15, yoga_mobility)

-- Stap 1: wegwerp-membership M1 (actief, fake Mollie-id's, ACTIEVE lock-in
-- om de expire_lock_in_on_cancel-trigger mee te bewijzen) plus twee
-- boekingen (2026-07-13 en 2026-07-15).
insert into tmc.memberships (
  profile_id, plan_type, plan_variant, frequency_cap, age_category,
  price_per_cycle_cents, billing_cycle_weeks, commit_months, start_date,
  status, mollie_customer_id, mollie_subscription_id, covered_pillars,
  source, extended_access, extended_access_price_cents,
  lock_in_active, lock_in_source, lock_in_price_cents, notes
) values (
  '07839a52-a91a-4d85-80bf-a9e704fcee79', 'groepslessen', 'racetest_cancel',
  null, 'adult', 10000, 4, 12, '2026-06-15',
  'active', 'cst_racetest_cancel', 'sub_racetest_c1', '{}',
  'admin_manual', false, 0,
  true, 'early_member', 10000, 'RACETEST admin-stop, wegwerp'
) returning id;
-- WAARGENOMEN: id 609d2289-2e88-4152-868b-5186619042c0, lock_in_active true.
-- Boekingen: 6cff046c (2026-07-13) en 6bb64c9e (2026-07-15).

-- Stap 2 (T1): stoppen zonder admin-context wordt hard geweigerd.
begin;
set local request.jwt.claims = '{"sub":"07839a52-a91a-4d85-80bf-a9e704fcee79","role":"authenticated"}';
select tmc.admin_cancel_membership('609d2289-2e88-4152-868b-5186619042c0', 'racetest', false, '2026-07-19');
commit;
-- WAARGENOMEN: ERROR 42501 "Alleen voor admins."

-- Stap 3 (T2): lege reden geweigerd; default plant op cyclus-einde en laat
-- boekingen BINNEN de betaalde cyclus staan.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_cancel_membership('609d2289-2e88-4152-868b-5186619042c0', '  ', false, '2026-07-19') as missing_reason,
       tmc.admin_cancel_membership('609d2289-2e88-4152-868b-5186619042c0', 'racetest default', false, '2026-07-19') as default_scheduled;
commit;
-- WAARGENOMEN: missing_reason {"ok": false, "reason": "missing_reason"};
-- default_scheduled {"ok": true, "mode": "scheduled", "hard_stop": false,
--   "effective_date": "2026-07-19", "cancelled_bookings": 0}
-- (beide boekingen vallen VOOR de ingangsdatum en blijven staan: het lid
-- maakt de betaalde cyclus af).

-- Stap 4 (T3 + T4): een latere datum verplaatst NIET (admin-gezag mag
-- alleen vervroegen); een eerdere datum wel, en de boeking die daardoor
-- in het venster valt vervalt mee.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_cancel_membership('609d2289-2e88-4152-868b-5186619042c0', 'racetest later', false, '2026-07-25') as later_kept,
       tmc.admin_cancel_membership('609d2289-2e88-4152-868b-5186619042c0', 'racetest vervroegd', false, '2026-07-15') as moved_earlier;
commit;
-- WAARGENOMEN: later_kept {"ok": true, "already_scheduled": true,
--   "effective_date": "2026-07-19"};
-- moved_earlier {"ok": true, "mode": "scheduled",
--   "effective_date": "2026-07-15", "cancelled_bookings": 1}.
-- Staat daarna: status 'cancellation_requested', effective 2026-07-15,
-- boeking 2026-07-13 nog 'booked', boeking 2026-07-15 'cancelled' met
-- cancellation_reason 'membership_cancelled', lock_in_active nog true, en
-- de rij MATCHT de exacte selectie van de process-cancellations cron
-- (status='cancellation_requested' and cancellation_effective_date <=
-- '2026-07-15'): de flip op de ingangsdatum rijdt op de bestaande rails.

-- Stap 5 (T5): hard stop escaleert een geplande stop naar per direct.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_cancel_membership('609d2289-2e88-4152-868b-5186619042c0', 'racetest geschil', true);
commit;
-- WAARGENOMEN: {"ok": true, "mode": "immediate", "hard_stop": true,
--   "effective_date": "2026-07-12", "cancelled_bookings": 1}
-- (de resterende boeking van 2026-07-13 verviel mee).
-- Staat daarna: status 'cancelled', end_date 2026-07-12,
-- cancellation_effective_date 2026-07-12, en de
-- expire_lock_in_on_cancel-trigger doofde de lock-in
-- (lock_in_active false, lock_in_expired_at gezet).

-- Stap 6 (T6): dubbel stoppen is idempotent, geen tweede transitie.
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_cancel_membership('609d2289-2e88-4152-868b-5186619042c0', 'racetest dubbel', false);
commit;
-- WAARGENOMEN: {"ok": true, "already_cancelled": true, "end_date": "2026-07-12"}.

-- Stap 7 (T7 + T8): een credit-rij is niet stopzetbaar en credits blijven
-- intact; stoppen vanuit een lopende pauze is per direct (er is geen
-- betaald restant) en sluit het pauzevenster.
insert into tmc.memberships (profile_id, plan_type, plan_variant, age_category, price_per_cycle_cents, billing_cycle_weeks, commit_months, start_date, status, source, credits_total, credits_remaining, notes)
values
  ('07839a52-a91a-4d85-80bf-a9e704fcee79', 'pt_package', 'pt_10', 'adult', 55000, 0, 0, current_date, 'active', 'admin_manual', 10, 7, 'RACETEST credit-rij cancel, wegwerp'),
  ('07839a52-a91a-4d85-80bf-a9e704fcee79', 'groepslessen', 'racetest_cancel_paused', 'adult', 10000, 4, 12, '2026-06-15', 'active', 'admin_manual', null, null, 'RACETEST cancel vanuit pauze, wegwerp')
returning id, plan_type;
-- WAARGENOMEN: 5941ca04 (pt_package, credits 7) en cd7e2521 (groepslessen).
begin;
set local request.jwt.claims = '{"sub":"ec13f4e4-e800-4eb5-b4af-da109fcfac20","role":"authenticated"}';
select tmc.admin_cancel_membership('5941ca04-d0c5-487c-839b-e39d686e8d98', 'racetest credit', false) as credit_rij,
       tmc.admin_pause_membership('cd7e2521-604d-405e-b6d7-cb9ce8a76dc0', current_date) as pauze_eerst,
       tmc.admin_cancel_membership('cd7e2521-604d-405e-b6d7-cb9ce8a76dc0', 'racetest vanuit pauze', false) as cancel_vanuit_pauze;
commit;
-- WAARGENOMEN: credit_rij {"ok": false, "reason": "not_cancellable_plan"};
-- pauze_eerst {"ok": true, "immediate": true,
--   "pause_effective_date": "2026-07-12"};
-- cancel_vanuit_pauze {"ok": true, "mode": "immediate",
--   "effective_date": "2026-07-12", "cancelled_bookings": 0}.
-- Staat daarna: PT-credits ONGEWIJZIGD 7; het gepauzeerde membership
-- 'cancelled' met de pauzevelden gewist; het pauzevenster 'completed'
-- met end_date 2026-07-12.

-- Stap 8: cleanup van alle wegwerpdata (uitgevoerd 2026-07-12; de
-- tmc.events-rijen blijven staan, het log is append-only).
delete from tmc.bookings where membership_id in
  ('609d2289-2e88-4152-868b-5186619042c0','5941ca04-d0c5-487c-839b-e39d686e8d98','cd7e2521-604d-405e-b6d7-cb9ce8a76dc0');
delete from tmc.membership_pauses where membership_id in
  ('609d2289-2e88-4152-868b-5186619042c0','5941ca04-d0c5-487c-839b-e39d686e8d98','cd7e2521-604d-405e-b6d7-cb9ce8a76dc0');
delete from tmc.memberships where id in
  ('609d2289-2e88-4152-868b-5186619042c0','5941ca04-d0c5-487c-839b-e39d686e8d98','cd7e2521-604d-405e-b6d7-cb9ce8a76dc0');
-- WAARGENOMEN: 2 bookings, 1 pauze, 3 memberships verwijderd;
-- tmc.memberships-telling terug op 2 (de staat van voor de test).
