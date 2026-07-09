-- Migratie B: de afsluitende destructieve stap van het prijs-consolidatietraject.
--
-- Verwijdert de oude prijsbronnen nu tmc.catalogue de enige lezer-bron is
-- (WS-1 t/m WS-3 plus de order-pipeline-cutover zijn live), plus de dode
-- Early Member cap-machinerie (caps zijn beleidsmatig dood sinds de
-- 2026-07-08-amendments; de checkout-fasegate is tmc._compute_order_price
-- tegen get_campaign_deadline(), niet meer de reservering).
--
-- Pre-drop dependency-check, live uitgevoerd op 2026-07-09 en integraal
-- gerapporteerd voor akkoord:
--   - Nul views (in welk schema dan ook) verwijzen naar pricing_items,
--     membership_plan_catalogue of booking_settings.
--   - Nul functies lezen de te droppen tabellen of prijskolommen. De vier
--     booking_settings-lezende functies (book_class_session,
--     cancel_class_booking, set_admin_checkin_pin, verify_admin_checkin_pin)
--     raken uitsluitend operationele kolommen; geen drop-and-recreate nodig.
--     De prosrc-hits op "extended_access_price_cents" in de order-pipeline-
--     functies betreffen de gelijknamige kolom op tmc.orders/tmc.memberships
--     (blijven bestaan), niet booking_settings.
--   - Column-level pg_depend op de 13 prijskolommen: alleen hun eigen
--     DEFAULT-expressies. Geen indexen, generated columns of constraints.
--   - Nul foreign keys verwijzen NAAR de te droppen tabellen. mpc's eigen
--     uitgaande FK naar early_member_pools valt met de tabel mee.
--   - De vier EM-RPCs hebben nul callers (app-side sinds de #69-cutover,
--     DB-side alleen een tekst-comment in admin_create_order). De release-
--     holds-cron is de enige lezer van early_member_reservations en wordt
--     in dezelfde PR verwijderd (route + vercel.json-entry).
--
-- early_member_pools BLIJFT: het is het huis van closes_at, waar
-- get_campaign_deadline() (de enige campagne-deadlinebron) uit leest.
-- Alleen de dode cap- en hold-window-kolommen gaan eraf.
--
-- Herstelpad (dit is een forward-only greenfield-drop, geen data-verlies
-- van betekenis): elke gedropte prijs leeft door in tmc.catalogue (daar in
-- WS-1 uit deze bronnen geseed) en in de versiegecontroleerde migratie-
-- historie; de includes-marketingbullets zijn als lokale copy verhuisd
-- naar de homepage en /app/abonnement in dezelfde PR.
--
-- Schema tmc only; public en tvmuur onaangeraakt; 20260503 ongemoeid.

begin;

-- ---------------------------------------------------------------------------
-- 1. Dode Early Member cap-machinerie.
--    Functies eerst (zij verwijzen naar de reservations-tabel en de
--    cap/hold-kolommen), dan de tabel, dan de kolommen.
-- ---------------------------------------------------------------------------

drop function tmc.reserve_early_member_slot(text, uuid);
drop function tmc.claim_early_member_slot(uuid, uuid, text);
drop function tmc.cancel_early_member_reservation(uuid);
drop function tmc.get_early_member_availability();

drop table tmc.early_member_reservations;

alter table tmc.early_member_pools
  drop column cap,
  drop column hold_window_minutes;

-- ---------------------------------------------------------------------------
-- 2. De oude prijstabellen. Beide zonder inkomende afhankelijkheden
--    (geverifieerd, zie header); hun eigen triggers, policies en
--    constraints vallen mee.
-- ---------------------------------------------------------------------------

drop table tmc.pricing_items;
drop table tmc.membership_plan_catalogue;

-- ---------------------------------------------------------------------------
-- 3. De 13 prijskolommen op booking_settings. De tabel zelf blijft, als
--    huis van de operationele boekingsconfiguratie.
-- ---------------------------------------------------------------------------

alter table tmc.booking_settings
  drop column registration_fee_cents,
  drop column drop_in_yoga_cents,
  drop column drop_in_kettlebell_cents,
  drop column drop_in_kids_cents,
  drop column drop_in_senior_cents,
  drop column ten_ride_card_cents,
  drop column ten_ride_card_crowdfunding_cents,
  drop column ten_ride_card_validity_months,
  drop column kids_ten_ride_card_cents,
  drop column senior_ten_ride_card_cents,
  drop column pt_intake_discount_cents,
  drop column member_pt_discount_percent,
  drop column extended_access_price_cents;

-- ---------------------------------------------------------------------------
-- 4. Post-drop assertions: de dingen die moesten blijven, bestaan nog en
--    werken nog. Abort de transactie bij elke afwijking.
-- ---------------------------------------------------------------------------

do $$
declare
  v_deadline timestamptz;
  v_catalogue_count integer;
  v_ops_check integer;
begin
  -- De campagne-deadlinebron overleeft de pools-kolomdrop.
  v_deadline := tmc.get_campaign_deadline();
  if v_deadline is null then
    raise exception 'migratie B abort: get_campaign_deadline() geeft null na de pools-kolomdrop';
  end if;

  -- De catalogus (de enige prijsbron) staat er nog volledig.
  select count(*) into v_catalogue_count from tmc.catalogue;
  if v_catalogue_count < 29 then
    raise exception 'migratie B abort: tmc.catalogue heeft % rijen, verwacht >= 29', v_catalogue_count;
  end if;

  -- De operationele booking_settings-kolommen zijn onaangeraakt.
  select count(*) into v_ops_check
  from information_schema.columns
  where table_schema = 'tmc' and table_name = 'booking_settings'
    and column_name in ('cancellation_window_hours','booking_window_days',
      'waitlist_confirmation_minutes','fair_use_daily_max',
      'no_show_strike_window_days','no_show_strike_threshold',
      'no_show_block_days','vrij_trainen_cancel_window_minutes',
      'check_in_enabled','check_in_pillars','check_in_required_for_cap',
      'no_show_release_minutes','admin_checkin_pin_hash');
  if v_ops_check <> 13 then
    raise exception 'migratie B abort: operationele booking_settings-kolommen incompleet (%/13)', v_ops_check;
  end if;
end $$;

commit;
