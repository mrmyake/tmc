-- All Access rename + extended access data fix.
--
-- 1. Public-facing rename: "All Inclusive" wordt "All Access" in de
--    catalogus-display_name. De interne plan_type-waarde 'all_inclusive'
--    blijft bewust ongewijzigd (expliciete instructie: alleen de
--    display/copy-laag wijzigt, geen CHECK-constraint of kolomwaarden).
-- 2. Verlengde toegang (06:00-23:00) is per mastersheet alleen gratis
--    inbegrepen op All Access Onbeperkt (all_inclusive_unl). Bestaande
--    actieve leden op die variant (admin_manual aangemaakt vóór deze fix)
--    hebben extended_access = false; die krijgen het entitlement alsnog,
--    tegen 0 cent (het zit in hun plan inbegrepen). Er bestaan geen
--    memberships op all_inclusive_2x/3x, dus daar is niets te
--    grandfatheren.
--
-- Alleen plain UPDATEs, geen DDL, geen functions.

-- COPY: confirm met Marlon
update tmc.membership_plan_catalogue
set display_name = 'All Access 2×/wk'
where plan_variant = 'all_inclusive_2x';

-- COPY: confirm met Marlon
update tmc.membership_plan_catalogue
set display_name = 'All Access 3×/wk'
where plan_variant = 'all_inclusive_3x';

-- COPY: confirm met Marlon
update tmc.membership_plan_catalogue
set display_name = 'All Access Onbeperkt'
where plan_variant = 'all_inclusive_unl';

-- Bestaande All Access Onbeperkt-leden: verlengde toegang is inbegrepen,
-- dus zet het entitlement aan zonder add-on-prijs.
update tmc.memberships
set extended_access = true,
    extended_access_price_cents = 0
where plan_variant = 'all_inclusive_unl'
  and status in ('pending', 'active', 'paused', 'cancellation_requested')
  and extended_access = false;
