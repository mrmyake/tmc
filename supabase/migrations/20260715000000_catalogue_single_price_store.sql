-- WS-1: tmc.catalogue, the single price store (Migration A, additive only).
--
-- Approved design: ws1-catalogue-design.md (2026-07-09). This migration is
-- strictly additive: it creates tmc.catalogue and seeds it FROM the live
-- tables (membership_plan_catalogue, pricing_items, booking_settings) via
-- INSERT ... SELECT, never by transcribing numbers, so the catalogue is
-- born equal to production truth. It does not touch, drop, or read from
-- public or tvmuur, and does not modify the 20260503 placeholder.
--
-- Nothing reads tmc.catalogue yet after this migration; Phase 3 (separate
-- PR) repoints readers, then Migration B (gated, separate file) drops the
-- old stores once the exit-test greps pass.
--
-- Review adjustments applied on top of the approved design:
--   1. 24-month price is DERIVED (factor 0.92 + nullable rounding
--      override), not hardcoded and not hidden. Realized as a generated
--      column so display and any future charge path read the exact same
--      computed value; this is the single-row equivalent of the
--      vrij-trainen-addon delta pattern (derive at read time from stored
--      inputs, never store the derived answer twice).
--   2. In-transaction assertion that the All Access minus Groepslessen
--      delta is equal across 2x/3x/onbeperkt, aborting on mismatch.
--   3. Per-kind CHECK constraints: one purchasable-vs-lead boolean gated
--      to kind='product', plan-only fields nulled outside kind='plan',
--      product-only fields nulled outside kind='product'.
--   4. get_campaign_deadline() returns only the timestamp.

begin;

-- ---------------------------------------------------------------------------
-- 0. Replay-reconstructie van de runtime-bronnen (edit 2026-07-10, na de
--    oorspronkelijke toepassing; zie onder waarom dit veilig is).
--
--    De booking_settings-singleton en het merendeel van de mpc-rijen
--    (vrij_trainen, kids, senior, all_inclusive_3x/unl) zijn destijds op de
--    remote via de app/admin aangemaakt, nooit door een migratie. Op elke
--    database waar deze migratie al draaide bestaan die rijen, en zijn de
--    inserts hieronder no-ops (ON CONFLICT DO NOTHING): de uitkomst van deze
--    migratie verandert daar met geen byte. Op een verse from-scratch replay
--    (shadow database voor db diff, lokale stack) bestonden ze niet, waardoor
--    de pre-seed asserts afketsten en de seeds hieronder lege bronnen lazen.
--    Dit blok reconstrueert exact de bronstaat die deze migratie op
--    2026-07-15 op productie aantrof (waarden 1:1 verifieerbaar tegen de
--    live tmc.catalogue, die eruit geseed is), zodat de asserts hun volle
--    beschermende werking houden en de keten weer from-scratch afspeelbaar
--    is t/m de huidige kop.
-- ---------------------------------------------------------------------------

INSERT INTO "tmc"."booking_settings" (
  "id", "registration_fee_cents", "drop_in_yoga_cents", "drop_in_kids_cents",
  "drop_in_senior_cents", "ten_ride_card_cents", "kids_ten_ride_card_cents",
  "senior_ten_ride_card_cents", "ten_ride_card_validity_months",
  "extended_access_price_cents"
)
VALUES ('singleton', 3900, 1700, 1300, 1300, 15000, 11000, 11000, 4, 1000)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "tmc"."membership_plan_catalogue"
  ("plan_type", "plan_variant", "display_name", "frequency_cap", "age_category",
   "price_per_cycle_cents", "billing_cycle_weeks", "commit_months",
   "covered_pillars", "display_order", "early_member_price_cents", "is_active")
VALUES
  ('vrij_trainen', 'vrij_trainen_2x', 'Vrij Trainen 2×/wk', 2, 'adult',
   4900, 4, 12, ARRAY['vrij_trainen'], 10, NULL, true),
  ('vrij_trainen', 'vrij_trainen_3x', 'Vrij Trainen 3×/wk', 3, 'adult',
   5900, 4, 12, ARRAY['vrij_trainen'], 11, NULL, true),
  ('vrij_trainen', 'vrij_trainen_unl', 'Vrij Trainen Onbeperkt', NULL, 'adult',
   6900, 4, 12, ARRAY['vrij_trainen'], 12, NULL, true),
  ('all_inclusive', 'all_inclusive_3x', 'All Access 3×/wk', 3, 'adult',
   12900, 4, 12, ARRAY['vrij_trainen', 'yoga_mobility', 'kettlebell'], 40, NULL, true),
  ('all_inclusive', 'all_inclusive_unl', 'All Access Onbeperkt', NULL, 'adult',
   14900, 4, 12, ARRAY['vrij_trainen', 'yoga_mobility', 'kettlebell'], 41, 13900, true),
  ('kids', 'kids_1x', 'Kids 1×/wk', 1, 'kids',
   4500, 4, 12, ARRAY['kids'], 50, NULL, true),
  ('kids', 'kids_2x', 'Kids 2×/wk', 2, 'kids',
   7500, 4, 12, ARRAY['kids'], 51, NULL, true),
  ('kids', 'kids_unl', 'Kids Onbeperkt (4×)', NULL, 'kids',
   9500, 4, 12, ARRAY['kids'], 52, NULL, true),
  ('senior', 'senior_1x', 'Senior 1×/wk', 1, 'senior',
   4500, 4, 12, ARRAY['senior'], 60, NULL, true),
  ('senior', 'senior_2x', 'Senior 2×/wk', 2, 'senior',
   7500, 4, 12, ARRAY['senior'], 61, NULL, true),
  ('senior', 'senior_unl', 'Senior Onbeperkt (5×)', NULL, 'senior',
   9900, 4, 12, ARRAY['senior'], 62, NULL, true)
ON CONFLICT ("plan_variant") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. tmc.catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE "tmc"."catalogue" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "slug" text NOT NULL,
    "kind" text NOT NULL,
    "family" text,
    "display_name" text NOT NULL,
    "price_cents" integer NOT NULL,
    "billing_cycle_weeks" integer,
    "frequency_cap" integer,
    "covered_pillars" text[] DEFAULT '{}'::text[] NOT NULL,
    "commit_months" integer,
    "commit_24m_discount_factor" numeric(4,3),
    "price_cents_24m_override" integer,
    "price_cents_24m_computed" integer GENERATED ALWAYS AS (
      CASE
        WHEN "commit_24m_discount_factor" IS NULL THEN NULL
        ELSE COALESCE(
          "price_cents_24m_override",
          ROUND("price_cents" * "commit_24m_discount_factor")::integer
        )
      END
    ) STORED,
    "extended_access_mode" text,
    "credits" integer,
    "validity_months" integer,
    "purchasable" boolean DEFAULT true NOT NULL,
    "early_member_eligible" boolean DEFAULT false NOT NULL,
    "early_member_price_cents" integer,
    "early_member_commit_months" integer,
    "early_member_price_lock" boolean DEFAULT false NOT NULL,
    "age_category" text DEFAULT 'adult'::text NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "catalogue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalogue_slug_key" UNIQUE ("slug"),
    CONSTRAINT "catalogue_kind_check" CHECK ("kind" IN ('plan', 'addon', 'product', 'fee')),
    CONSTRAINT "catalogue_family_check" CHECK ("family" IS NULL OR "family" IN
      ('groepslessen', 'vrij_trainen', 'all_inclusive', 'kids', 'senior')),
    CONSTRAINT "catalogue_extended_access_mode_check" CHECK ("extended_access_mode" IS NULL OR "extended_access_mode" IN
      ('included', 'addon', 'na')),
    CONSTRAINT "catalogue_age_category_check" CHECK ("age_category" IN ('adult', 'kids', 'senior')),
    CONSTRAINT "catalogue_price_cents_check" CHECK ("price_cents" >= 0),
    CONSTRAINT "catalogue_price_cents_24m_override_check" CHECK ("price_cents_24m_override" IS NULL OR "price_cents_24m_override" >= 0),
    CONSTRAINT "catalogue_commit_24m_discount_factor_check" CHECK ("commit_24m_discount_factor" IS NULL OR
      ("commit_24m_discount_factor" > 0 AND "commit_24m_discount_factor" <= 1)),
    CONSTRAINT "catalogue_early_member_price_cents_check" CHECK ("early_member_price_cents" IS NULL OR "early_member_price_cents" >= 0),
    CONSTRAINT "catalogue_credits_check" CHECK ("credits" IS NULL OR "credits" > 0),
    CONSTRAINT "catalogue_validity_months_check" CHECK ("validity_months" IS NULL OR "validity_months" > 0),
    -- Adjustment 3: plan-only fields are null outside kind='plan'.
    CONSTRAINT "catalogue_plan_only_fields_check" CHECK (
      "kind" = 'plan' OR (
        "family" IS NULL AND "frequency_cap" IS NULL AND "commit_months" IS NULL
        AND "commit_24m_discount_factor" IS NULL AND "price_cents_24m_override" IS NULL
        AND "extended_access_mode" IS NULL
      )
    ),
    -- Adjustment 3: plan rows must carry the fields a plan needs.
    CONSTRAINT "catalogue_plan_required_fields_check" CHECK (
      "kind" <> 'plan' OR (
        "family" IS NOT NULL AND "billing_cycle_weeks" IS NOT NULL
        AND "commit_months" IS NOT NULL AND "extended_access_mode" IS NOT NULL
      )
    ),
    -- Adjustment 3: product-only fields are null outside kind='product'.
    CONSTRAINT "catalogue_product_only_fields_check" CHECK (
      "kind" = 'product' OR ("credits" IS NULL AND "validity_months" IS NULL)
    ),
    -- Adjustment 3: the one purchasable-vs-lead distinction is confined to
    -- products; every other kind is always purchasable (there is nothing
    -- else for "lead item" to mean for a plan, addon, or fee).
    CONSTRAINT "catalogue_purchasable_gate_check" CHECK (
      "purchasable" OR "kind" = 'product'
    ),
    -- Early Member shape: benefit fields stay null unless eligible.
    CONSTRAINT "catalogue_em_shape_check" CHECK (
      "early_member_eligible" OR (
        "early_member_price_cents" IS NULL AND "early_member_commit_months" IS NULL
        AND NOT "early_member_price_lock"
      )
    )
);

ALTER TABLE "tmc"."catalogue" OWNER TO "postgres";

COMMENT ON TABLE "tmc"."catalogue" IS
  'Single price store: plans, the extended-access addon, one-off products, and the signup fee. Both /prijzen display and the Order pipeline charge read this table exclusively once Migration B lands. Superseding tmc.membership_plan_catalogue and tmc.pricing_items and the booking_settings price columns.';

COMMENT ON COLUMN "tmc"."catalogue"."slug" IS
  'Stable key. For plan rows this equals the legacy plan_variant, so existing tmc.memberships rows (plan_variant column) and tmc.plan_covers() need no data migration.';

COMMENT ON COLUMN "tmc"."catalogue"."purchasable" IS
  'false = lead item: shown with its price on /prijzen with an aanvraag-CTA, no Order path. Only meaningful (and only allowed false) on kind=product; enforcement of "no Order path" lives in the WS-2 order-creation RPC, this column only records the intent.';

COMMENT ON COLUMN "tmc"."catalogue"."commit_24m_discount_factor" IS
  '24-maanden-commitment korting als factor (0.920 = 8% korting), niet als los bedrag. price_cents_24m_computed leidt de prijs hieruit af; price_cents_24m_override staat een schoon afgerond bedrag toe zonder de afleiding te verliezen.';

COMMENT ON COLUMN "tmc"."catalogue"."price_cents_24m_computed" IS
  'Generated: price_cents_24m_override if set, else round(price_cents * commit_24m_discount_factor). NULL when commit_24m_discount_factor is NULL (24-month option not offered on this row). This is the one number both /prijzen and the Order pipeline read for the 24-month price; they cannot drift because there is only one computation.';

COMMENT ON COLUMN "tmc"."catalogue"."early_member_price_lock" IS
  'true = once sold at the Early Member price, tmc.memberships snapshots and keeps that price for the life of the membership (existing lock_in_* columns on memberships), independent of later catalogue changes.';

CREATE OR REPLACE TRIGGER "catalogue_touch_updated_at"
    BEFORE UPDATE ON "tmc"."catalogue"
    FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();

CREATE INDEX "catalogue_kind_idx" ON "tmc"."catalogue" ("kind");
CREATE INDEX "catalogue_is_active_idx" ON "tmc"."catalogue" ("is_active");

ALTER TABLE "tmc"."catalogue" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogue_admin_all" ON "tmc"."catalogue"
    USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());

CREATE POLICY "catalogue_public_read" ON "tmc"."catalogue"
    FOR SELECT USING ("is_active" = true);

-- Tighter than the legacy price tables on purpose: SELECT only for
-- anon/authenticated at the grant level, RLS is not the sole gate here.
-- Writes happen via migration (service_role) or admin (RLS-gated).
GRANT ALL ON TABLE "tmc"."catalogue" TO "service_role";
GRANT SELECT ON TABLE "tmc"."catalogue" TO "anon";
GRANT SELECT ON TABLE "tmc"."catalogue" TO "authenticated";

-- ---------------------------------------------------------------------------
-- 2. Pre-seed assertions (adjustment 2 + the drift-equality checks from the
--    approved design). Abort the whole migration on any mismatch rather than
--    silently seeding a value that no longer matches production truth.
-- ---------------------------------------------------------------------------

do $$
declare
  v_pi_signup_fee integer;
  v_bs_signup_fee integer;
  v_pi_ext_access integer;
  v_bs_ext_access integer;
  v_delta_2x integer;
  v_delta_3x integer;
  v_delta_unl integer;
  v_pi_addon integer;
begin
  select price_cents into v_pi_signup_fee from tmc.pricing_items where slug = 'signup_fee';
  select registration_fee_cents into v_bs_signup_fee from tmc.booking_settings where id = 'singleton';
  if v_pi_signup_fee is distinct from v_bs_signup_fee then
    raise exception 'catalogue seed abort: signup fee drift, pricing_items=% booking_settings=%',
      v_pi_signup_fee, v_bs_signup_fee;
  end if;

  select price_cents into v_pi_ext_access from tmc.pricing_items where slug = 'extended_access';
  select extended_access_price_cents into v_bs_ext_access from tmc.booking_settings where id = 'singleton';
  if v_pi_ext_access is distinct from v_bs_ext_access then
    raise exception 'catalogue seed abort: extended access drift, pricing_items=% booking_settings=%',
      v_pi_ext_access, v_bs_ext_access;
  end if;

  select
    (select price_per_cycle_cents from tmc.membership_plan_catalogue where plan_variant = 'all_inclusive_2x')
    - (select price_per_cycle_cents from tmc.membership_plan_catalogue where plan_variant = 'groepslessen_2x')
  into v_delta_2x;
  select
    (select price_per_cycle_cents from tmc.membership_plan_catalogue where plan_variant = 'all_inclusive_3x')
    - (select price_per_cycle_cents from tmc.membership_plan_catalogue where plan_variant = 'groepslessen_3x')
  into v_delta_3x;
  select
    (select price_per_cycle_cents from tmc.membership_plan_catalogue where plan_variant = 'all_inclusive_unl')
    - (select price_per_cycle_cents from tmc.membership_plan_catalogue where plan_variant = 'groepslessen_unl')
  into v_delta_unl;
  select price_cents into v_pi_addon from tmc.pricing_items where slug = 'vrij_trainen_addon';

  if v_delta_2x is distinct from v_delta_3x or v_delta_2x is distinct from v_delta_unl then
    raise exception 'catalogue seed abort: all_inclusive minus groepslessen delta mismatch across frequencies (2x=%, 3x=%, unl=%)',
      v_delta_2x, v_delta_3x, v_delta_unl;
  end if;
  if v_delta_2x is distinct from v_pi_addon then
    raise exception 'catalogue seed abort: delta % does not match pricing_items.vrij_trainen_addon %',
      v_delta_2x, v_pi_addon;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Seed: plans, FROM tmc.membership_plan_catalogue.
--    is_active = true there already excludes the 7 dead yoga_mobility /
--    kettlebell variants (PR #61 leftovers, never sold) -- they are retired
--    without carry, per the approved design.
-- ---------------------------------------------------------------------------

INSERT INTO "tmc"."catalogue" (
  "slug", "kind", "family", "display_name", "price_cents", "billing_cycle_weeks",
  "frequency_cap", "covered_pillars", "commit_months", "commit_24m_discount_factor",
  "extended_access_mode", "purchasable", "early_member_eligible",
  "early_member_price_cents", "early_member_commit_months", "early_member_price_lock",
  "age_category", "is_active", "display_order"
)
SELECT
  mpc.plan_variant,
  'plan',
  mpc.plan_type,  -- plan_type values already equal the target family strings 1:1
  mpc.display_name,
  mpc.price_per_cycle_cents,
  mpc.billing_cycle_weeks,
  mpc.frequency_cap,
  mpc.covered_pillars,
  mpc.commit_months,
  0.920,  -- confirmed 8% korting (adjustment 1); nullable override below is untouched (null)
  CASE
    WHEN mpc.plan_variant = 'all_inclusive_unl' THEN 'included'
    WHEN mpc.plan_type = 'all_inclusive' THEN 'addon'
    WHEN mpc.plan_type = 'vrij_trainen' THEN 'addon'
    ELSE 'na'
  END,
  true,
  mpc.plan_type IN ('groepslessen', 'all_inclusive'),
  mpc.early_member_price_cents,
  CASE WHEN mpc.plan_type IN ('groepslessen', 'all_inclusive') THEN 0 ELSE NULL END,
  mpc.plan_type = 'all_inclusive',
  mpc.age_category,
  CASE WHEN mpc.plan_type IN ('kids', 'senior') THEN false ELSE true END,  -- off-menu, zero live members
  mpc.display_order
FROM tmc.membership_plan_catalogue mpc
WHERE mpc.is_active = true;

-- ---------------------------------------------------------------------------
-- 4. Seed: extended access addon, FROM tmc.booking_settings.
--    The vrij-trainen "add-on" is deliberately NOT seeded as a stored row:
--    it is a row mapping (groepslessen_X -> all_inclusive_X) whose delta is
--    derived by the reader, retiring pricing_items.vrij_trainen_addon
--    without a stored replacement (approved design section 2).
-- ---------------------------------------------------------------------------

INSERT INTO "tmc"."catalogue" (
  "slug", "kind", "display_name", "price_cents", "billing_cycle_weeks",
  "purchasable", "early_member_eligible", "age_category", "is_active", "display_order"
)
SELECT
  'extended_access', 'addon', 'Verlengde toegang', bs.extended_access_price_cents, 4,
  true, false, 'adult', true, 20
FROM tmc.booking_settings bs
WHERE bs.id = 'singleton';

-- ---------------------------------------------------------------------------
-- 5. Seed: signup fee, FROM tmc.booking_settings (price) + tmc.pricing_items
--    (Early Member override, which is 0 today).
-- ---------------------------------------------------------------------------

INSERT INTO "tmc"."catalogue" (
  "slug", "kind", "display_name", "price_cents",
  "purchasable", "early_member_eligible", "early_member_price_cents",
  "age_category", "is_active", "display_order"
)
SELECT
  'signup_fee', 'fee', 'Inschrijfkosten', bs.registration_fee_cents,
  true, true, pi.early_member_price_cents,
  'adult', true, 50
FROM tmc.booking_settings bs
CROSS JOIN (SELECT early_member_price_cents FROM tmc.pricing_items WHERE slug = 'signup_fee') pi
WHERE bs.id = 'singleton';

-- ---------------------------------------------------------------------------
-- 6. Seed: drop-in products, FROM tmc.booking_settings.
--    Kids/senior drop-in stay is_active=true (the proefles/trial-booking
--    flow still charges them for those age categories); they are simply
--    never queried by /prijzen, a WS-3 display concern, not a store concern.
-- ---------------------------------------------------------------------------

INSERT INTO "tmc"."catalogue" (
  "slug", "kind", "display_name", "price_cents", "credits",
  "age_category", "purchasable", "is_active", "display_order"
)
SELECT 'drop_in', 'product', 'Losse les', bs.drop_in_yoga_cents, 1, 'adult', true, true, 60
FROM tmc.booking_settings bs WHERE bs.id = 'singleton'
UNION ALL
SELECT 'drop_in_kids', 'product', 'Losse les (kids)', bs.drop_in_kids_cents, 1, 'kids', true, true, 61
FROM tmc.booking_settings bs WHERE bs.id = 'singleton'
UNION ALL
SELECT 'drop_in_senior', 'product', 'Losse les (senior)', bs.drop_in_senior_cents, 1, 'senior', true, true, 62
FROM tmc.booking_settings bs WHERE bs.id = 'singleton';

-- ---------------------------------------------------------------------------
-- 7. Seed: rittenkaart products, FROM tmc.booking_settings.
--    Kids/senior variants seeded is_active=false (off-menu, matches the
--    plan rows above; no crowdfunding variant carried, campaign is over).
-- ---------------------------------------------------------------------------

INSERT INTO "tmc"."catalogue" (
  "slug", "kind", "display_name", "price_cents", "credits", "validity_months",
  "age_category", "purchasable", "is_active", "display_order"
)
SELECT 'ten_ride_card', 'product', '10-rittenkaart', bs.ten_ride_card_cents, 10,
  bs.ten_ride_card_validity_months, 'adult', true, true, 70
FROM tmc.booking_settings bs WHERE bs.id = 'singleton'
UNION ALL
SELECT 'ten_ride_card_kids', 'product', '10-rittenkaart (kids)', bs.kids_ten_ride_card_cents, 10,
  bs.ten_ride_card_validity_months, 'kids', true, false, 71
FROM tmc.booking_settings bs WHERE bs.id = 'singleton'
UNION ALL
SELECT 'ten_ride_card_senior', 'product', '10-rittenkaart (senior)', bs.senior_ten_ride_card_cents, 10,
  bs.ten_ride_card_validity_months, 'senior', true, false, 72
FROM tmc.booking_settings bs WHERE bs.id = 'singleton';

-- ---------------------------------------------------------------------------
-- 8. Seed: PT (flat, no tiers) and Duo products, FROM tmc.pricing_items.
--    PT confirmed flat during WS-1 discovery: one PT-available trainer,
--    premium tier, zero pt_sessions and zero pt_bookings ever created --
--    the RPC's standard/intake tiers never sold anything.
-- ---------------------------------------------------------------------------

INSERT INTO "tmc"."catalogue" (
  "slug", "kind", "display_name", "price_cents", "credits",
  "purchasable", "is_active", "display_order"
)
SELECT
  CASE pi.slug
    WHEN 'pt_one_on_one_single' THEN 'pt_single'
    WHEN 'pt_one_on_one_12' THEN 'pt_12'
    ELSE pi.slug
  END,
  'product',
  CASE pi.slug
    WHEN 'pt_one_on_one_single' THEN 'Personal training 1-op-1'
    WHEN 'pt_one_on_one_12' THEN 'Personal training 1-op-1, 12-rittenkaart'
    WHEN 'duo_single' THEN 'Personal training duo, losse sessie'  -- COPY: confirm met Marlon
    WHEN 'duo_12' THEN 'Personal training duo, 12-rittenkaart'    -- COPY: confirm met Marlon
  END,
  pi.price_cents,
  CASE pi.slug
    WHEN 'pt_one_on_one_single' THEN 1
    WHEN 'pt_one_on_one_12' THEN 12
    WHEN 'duo_single' THEN 1
    WHEN 'duo_12' THEN 12
  END,
  true, true,
  CASE pi.slug
    WHEN 'pt_one_on_one_single' THEN 80
    WHEN 'pt_one_on_one_12' THEN 81
    WHEN 'duo_single' THEN 90
    WHEN 'duo_12' THEN 91
  END
FROM tmc.pricing_items pi
WHERE pi.slug IN ('pt_one_on_one_single', 'pt_one_on_one_12', 'duo_single', 'duo_12');

-- ---------------------------------------------------------------------------
-- 9. Seed: 12-weken programma's as LEAD items (option B), FROM
--    tmc.pricing_items. purchasable=false: shown with a price on /prijzen,
--    aanvraag-CTA into the existing proefles-style lead capture, no Order
--    path (enforced server-side in the WS-2 order-creation RPC).
-- ---------------------------------------------------------------------------

INSERT INTO "tmc"."catalogue" (
  "slug", "kind", "display_name", "price_cents", "purchasable", "is_active", "display_order"
)
SELECT
  pi.slug, 'product', pi.label, pi.price_cents, false, true,
  CASE pi.slug WHEN 'program_studio_12w' THEN 100 WHEN 'program_online_12w' THEN 101 END
FROM tmc.pricing_items pi
WHERE pi.slug IN ('program_studio_12w', 'program_online_12w');

-- ---------------------------------------------------------------------------
-- 10. Post-seed sanity assertion: exact expected row count.
--     15 plans + 1 addon + 1 fee + 3 drop-in + 3 ten-ride + 4 pt/duo
--     + 2 programs = 29.
-- ---------------------------------------------------------------------------

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from tmc.catalogue;
  if v_count <> 29 then
    raise exception 'catalogue seed abort: expected 29 rows, got %', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. get_campaign_deadline(): the one deadline accessor (adjustment 4,
--     minimal, read-only, returns only the timestamp). early_member_pools
--     stays the home of closes_at; max() makes this indifferent to the
--     pool-row collapse planned for Migration B.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "tmc"."get_campaign_deadline"()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'tmc', 'extensions'
AS $$
  SELECT max(closes_at) FROM tmc.early_member_pools;
$$;

REVOKE ALL ON FUNCTION "tmc"."get_campaign_deadline"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "tmc"."get_campaign_deadline"() TO "anon";
GRANT EXECUTE ON FUNCTION "tmc"."get_campaign_deadline"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "tmc"."get_campaign_deadline"() TO "service_role";

commit;
