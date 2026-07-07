-- Early Member entitlements + verlengde-toegang-rechtenlaag (PR 2)
--
--   * memberships.extended_access: het recht op verlengde toegang
--     (06:00-23:00). Gratis inbegrepen bij all_inclusive, 10-euro-add-on
--     bij vrij_trainen. De handhaving (Akiles-deurschema) is een aparte
--     track; dit is alleen de rechten-laag.
--   * memberships.source krijgt 'early_member' als acquisitiekanaal.
--   * membership_plan_catalogue.early_member_pool: datagedreven mapping
--     van plan naar Early Member-pool (NULL = geen Early Member-optie).
--   * booking_settings.extended_access_price_cents: de add-on-prijs,
--     datagedreven naast registration_fee_cents.

-- ---------------------------------------------------------------------------
-- memberships: verlengde toegang + early_member source
-- ---------------------------------------------------------------------------

ALTER TABLE "tmc"."memberships"
    ADD COLUMN IF NOT EXISTS "extended_access" boolean DEFAULT false NOT NULL;

ALTER TABLE "tmc"."memberships"
    ADD COLUMN IF NOT EXISTS "extended_access_price_cents" integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN "tmc"."memberships"."extended_access" IS
  'Recht op verlengde toegang (06:00-23:00, zeven dagen). Inbegrepen bij all_inclusive (price 0); betaalde add-on bij vrij_trainen. Handhaving via Akiles is een aparte track — dit is de rechten-laag.';

COMMENT ON COLUMN "tmc"."memberships"."extended_access_price_cents" IS
  'Add-on-bedrag per cyclus dat bovenop price_per_cycle_cents in de Mollie-subscription zit (0 = inbegrepen of geen verlengde toegang).';

ALTER TABLE "tmc"."memberships" DROP CONSTRAINT IF EXISTS "memberships_source_check";
ALTER TABLE "tmc"."memberships" ADD CONSTRAINT "memberships_source_check"
    CHECK ("source" = ANY (ARRAY['direct'::text, 'crowdfunding'::text, 'admin_manual'::text, 'early_member'::text]));

-- ---------------------------------------------------------------------------
-- Plan-catalogus: mapping naar Early Member-pool
-- ---------------------------------------------------------------------------

ALTER TABLE "tmc"."membership_plan_catalogue"
    ADD COLUMN IF NOT EXISTS "early_member_pool" text;

ALTER TABLE "tmc"."membership_plan_catalogue"
    DROP CONSTRAINT IF EXISTS "membership_plan_catalogue_early_member_pool_fkey";
ALTER TABLE "tmc"."membership_plan_catalogue"
    ADD CONSTRAINT "membership_plan_catalogue_early_member_pool_fkey"
    FOREIGN KEY ("early_member_pool") REFERENCES "tmc"."early_member_pools"("pool");

COMMENT ON COLUMN "tmc"."membership_plan_catalogue"."early_member_pool" IS
  'Welke Early Member-pool dit plan aanspreekt bij een Early Member-signup. NULL = plan doet niet mee aan de actie (vrij_trainen, kids, senior).';

-- Groepslessen-pool: de les-gebaseerde volwassenen-plannen (79/99/119-lijn).
UPDATE "tmc"."membership_plan_catalogue"
   SET "early_member_pool" = 'groepslessen'
 WHERE "plan_type" IN ('yoga_mobility', 'kettlebell');

-- All Access-pool: de all-inclusive plannen.
UPDATE "tmc"."membership_plan_catalogue"
   SET "early_member_pool" = 'all_access'
 WHERE "plan_type" = 'all_inclusive';

-- ---------------------------------------------------------------------------
-- booking_settings: add-on-prijs verlengde toegang
-- ---------------------------------------------------------------------------

ALTER TABLE "tmc"."booking_settings"
    ADD COLUMN IF NOT EXISTS "extended_access_price_cents" integer DEFAULT 1000 NOT NULL;

COMMENT ON COLUMN "tmc"."booking_settings"."extended_access_price_cents" IS
  'Prijs per 4 weken voor de verlengde-toegang-add-on op Vrij Trainen-tiers (all_inclusive heeft het gratis inbegrepen).';
