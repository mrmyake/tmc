-- Groepsles-rittenkaarten zijn voortaan 6 maanden geldig in plaats van 4,
-- ook de al verkochte kaarten.
--
-- Scope: alleen de drie groepsles-varianten (ten_ride_card,
-- ten_ride_card_kids, ten_ride_card_senior). PT- en duo-pakketten
-- (validity_months null, geen vervaldatum) en losse lessen blijven
-- ongewijzigd.
--
-- Nieuwe aankopen: tmc.activate_order leest validity_months uit
-- tmc.catalogue en zet credits_expires_at = start_date + validity_months
-- (start_date = current_date op het activatiemoment, UTC). De functie
-- zelf wijzigt niet; de catalogue-update volstaat.
--
-- Bestaande kaarten: dezelfde basis (start_date) plus 6 maanden, zodat een
-- kaart die vandaag gekocht is en een kaart van twee weken geleden dezelfde
-- rekenregel volgen. Alleen kaarten met een vervaldatum en een status
-- waarin het tegoed nog bruikbaar is; cancelled en expired blijven staan
-- zoals ze waren.

begin;

update tmc.catalogue
set validity_months = 6
where slug in ('ten_ride_card', 'ten_ride_card_kids', 'ten_ride_card_senior');

update tmc.memberships
set credits_expires_at = (start_date + make_interval(months => 6))::date
where plan_type = 'ten_ride_card'
  and plan_variant in ('ten_ride_card', 'ten_ride_card_kids', 'ten_ride_card_senior')
  and credits_expires_at is not null
  and status in ('active', 'paused', 'cancellation_requested');

commit;

-- Controlequery (na de migratie, handmatig). Toont per groepsles-rittenkaart
-- de id, de basisdatum, wat de oude 4-maanden-regel gaf en de nieuwe
-- vervaldatum. Verwacht op 2026-10-18 voor de drie bestaande kaarten:
-- 2027-04-05, 2027-04-08 en 2027-04-11.
--
-- select m.id, m.plan_variant, m.status, m.start_date,
--        (m.start_date + make_interval(months => 4))::date as oud_4m,
--        m.credits_expires_at as nieuw,
--        m.credits_remaining
-- from tmc.memberships m
-- where m.plan_type = 'ten_ride_card'
-- order by m.start_date;
--
-- select slug, validity_months from tmc.catalogue
-- where slug in ('ten_ride_card', 'ten_ride_card_kids', 'ten_ride_card_senior', 'pt_10', 'duo_10')
-- order by slug;
