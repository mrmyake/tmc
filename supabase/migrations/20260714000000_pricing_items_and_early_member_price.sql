-- Pricing single-source-of-truth: niet-recurring prijzen + Early Member-kolom
-- op de recurring catalogus. Zie tmc-prijzen-seed-prompt (CC-conversatie
-- 2026-07-14) voor de volledige bron van deze waarden.
--
--   * tmc.pricing_items: nieuwe tabel voor niet-recurring prijzen (PT, duo,
--     inschrijfkosten, 12-weken-programma). Zelfde RLS/grant-patroon als
--     membership_plan_catalogue: publiek leesbaar waar is_active, admin
--     schrijft alles.
--   * membership_plan_catalogue.early_member_price_cents: nullable kolom,
--     alleen ingevuld voor all_inclusive_unl (149 -> 139, blijvend zolang het
--     lidmaatschap loopt).
--   * class_types: Mobility Reset en Vinyasa Yoga naar capaciteit 8 (Flow
--     Yoga stond al op 8). Kettlebell blijft onbeperkt (default_capacity
--     null, ongewijzigd).
--
-- Buiten scope van deze migratie (los geflagd, zie discovery-rapport):
--   * 24-maanden-commitment 8% korting -- geen mechaniek, aparte PR.
--   * 12-weken-programma Early Member-bonus (studio onbeperkt groepslessen /
--     online 2x vrij trainen + 1x kettlebell) -- geen entitlement-laag,
--     aparte PR.

-- ---------------------------------------------------------------------------
-- 1. tmc.pricing_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "tmc"."pricing_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "slug" text NOT NULL,
    "label" text NOT NULL,
    "unit" text NOT NULL,
    "price_cents" integer NOT NULL,
    "early_member_price_cents" integer,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pricing_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pricing_items_slug_key" UNIQUE ("slug"),
    CONSTRAINT "pricing_items_price_cents_check" CHECK ("price_cents" >= 0),
    CONSTRAINT "pricing_items_early_member_price_cents_check" CHECK ("early_member_price_cents" IS NULL OR "early_member_price_cents" >= 0)
);

ALTER TABLE "tmc"."pricing_items" OWNER TO "postgres";

COMMENT ON TABLE "tmc"."pricing_items" IS
  'Niet-recurring prijzen (PT, duo, inschrijfkosten, 12-weken-programma). Recurring abonnementsprijzen staan in membership_plan_catalogue.';

COMMENT ON COLUMN "tmc"."pricing_items"."early_member_price_cents" IS
  'Early Member-prijs indien afwijkend van price_cents. NULL = geen Early Member-variant voor dit item.';

CREATE OR REPLACE TRIGGER "pricing_items_touch_updated_at"
    BEFORE UPDATE ON "tmc"."pricing_items"
    FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();

ALTER TABLE "tmc"."pricing_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_items_admin_all" ON "tmc"."pricing_items"
    USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());

CREATE POLICY "pricing_items_public_read" ON "tmc"."pricing_items"
    FOR SELECT USING ("is_active" = true);

GRANT ALL ON TABLE "tmc"."pricing_items" TO "service_role";
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE "tmc"."pricing_items" TO "anon";
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE "tmc"."pricing_items" TO "authenticated";

INSERT INTO "tmc"."pricing_items"
  ("slug", "label", "unit", "price_cents", "early_member_price_cents", "sort_order", "is_active")
VALUES
  ('vrij_trainen_addon',   'Vrij trainen add-on',        'per 4 weken',        3000,  NULL, 10, true),
  ('extended_access',      'Verlengde toegang',          'per 4 weken',        1000,  NULL, 20, true),
  ('pt_one_on_one_single', 'Personal training 1-op-1',   'per sessie',         9500,  NULL, 30, true),
  ('pt_one_on_one_12',     'Personal training 1-op-1',   'totaal (12 ritten)', 90000, NULL, 31, true),
  ('duo_single',           'Personal training duo',      'per sessie',         12000, NULL, 40, true),
  ('duo_12',               'Personal training duo',      'totaal (12 ritten)', 110000, NULL, 41, true),
  ('signup_fee',           'Inschrijfkosten',             'eenmalig',           3900,  0,    50, true),
  ('program_studio_12w',   '12-weken-programma studio',   'totaal (12 weken)', 240000, 240000, 60, true),
  ('program_online_12w',   '12-weken-programma online',   'totaal (12 weken)', 125000, 125000, 61, true)
ON CONFLICT ("slug") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. membership_plan_catalogue: Early Member-prijs kolom
-- ---------------------------------------------------------------------------

ALTER TABLE "tmc"."membership_plan_catalogue"
    ADD COLUMN IF NOT EXISTS "early_member_price_cents" integer;

ALTER TABLE "tmc"."membership_plan_catalogue"
    ADD CONSTRAINT "membership_plan_catalogue_early_member_price_cents_check"
    CHECK ("early_member_price_cents" IS NULL OR "early_member_price_cents" >= 0);

COMMENT ON COLUMN "tmc"."membership_plan_catalogue"."early_member_price_cents" IS
  'Early Member-prijs indien afwijkend van price_per_cycle_cents, blijvend zolang het lidmaatschap loopt. NULL = geen Early Member-korting op dit plan.';

UPDATE "tmc"."membership_plan_catalogue"
   SET "early_member_price_cents" = 13900
 WHERE "plan_variant" = 'all_inclusive_unl';

-- ---------------------------------------------------------------------------
-- 3. class_types: yoga/mobility klassengrootte naar 8
-- ---------------------------------------------------------------------------

UPDATE "tmc"."class_types"
   SET "default_capacity" = 8,
       "updated_at" = now()
 WHERE "slug" IN ('mobility-reset', 'vinyasa-yoga')
   AND "default_capacity" IS DISTINCT FROM 8;
