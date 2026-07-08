-- Groepslessen: gecombineerd lesabonnement (yoga/mobility + kettlebell)
--
--   * De losse Yoga & Mobility- en Kettlebell Club-lijnen gaan uit de
--     verkoop (is_active = false). NIET verwijderen: bestaande memberships
--     verwijzen met plan_variant (tekst, geen FK) naar deze rijen voor
--     display/lookup, en bestaande leden houden hun oude dekking.
--   * Drie nieuwe groepslessen-rijen (2x/3x/onbeperkt, 79/99/119) met
--     covered_pillars {yoga_mobility, kettlebell}: een les is een les,
--     het lid mixt zelf binnen de weekcap.
--   * Een nieuwe all_inclusive_2x-rij (109 = groepslessen 2x 79 + 30
--     All Access-opslag), zodat de 109/129/149-lijn op /prijzen klopt.
--   * plan_type 'groepslessen' toegevoegd aan de memberships-check en aan
--     tmc.plan_covers. Boekingsautorisatie loopt via
--     tmc.book_class_session -> tmc.plan_covers(plan_type, pillar),
--     NIET via covered_pillars; zonder deze functie-update zou een
--     groepslessen-lid 'no_coverage' krijgen bij elke boeking.
--
-- COPY: alle display_name- en includes-strings in dit bestand zijn nieuwe
-- Nederlandse aanbod-copy; confirm met Marlon.

-- ---------------------------------------------------------------------------
-- 1. Oude les-lijnen uit de verkoop (historie blijft intact)
-- ---------------------------------------------------------------------------

UPDATE "tmc"."membership_plan_catalogue"
   SET "is_active" = false,
       "updated_at" = "now"()
 WHERE "plan_variant" IN (
   'yoga_mobility_1x', 'yoga_mobility_2x', 'yoga_mobility_3x', 'yoga_mobility_unl',
   'kettlebell_1x', 'kettlebell_2x', 'kettlebell_3x'
 );

-- ---------------------------------------------------------------------------
-- 2. memberships: plan_type 'groepslessen' toestaan
-- ---------------------------------------------------------------------------

ALTER TABLE "tmc"."memberships" DROP CONSTRAINT IF EXISTS "memberships_plan_type_check";
ALTER TABLE "tmc"."memberships" ADD CONSTRAINT "memberships_plan_type_check"
    CHECK ("plan_type" = ANY (ARRAY['vrij_trainen'::"text", 'yoga_mobility'::"text", 'kettlebell'::"text", 'groepslessen'::"text", 'all_inclusive'::"text", 'kids'::"text", 'senior'::"text", 'ten_ride_card'::"text", 'pt_package'::"text", 'twelve_week_program'::"text"]));

-- ---------------------------------------------------------------------------
-- 3. plan_covers: groepslessen dekt yoga_mobility + kettlebell
--    (live definitie geverifieerd via pg_get_functiondef; identiek aan de
--    baseline op de nieuwe groepslessen-tak na)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "tmc"."plan_covers"("p_plan_type" "text", "p_pillar" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_plan_type
    when 'vrij_trainen'         then p_pillar = 'vrij_trainen'
    when 'yoga_mobility'        then p_pillar = 'yoga_mobility'
    when 'kettlebell'           then p_pillar = 'kettlebell'
    when 'groepslessen'         then p_pillar in ('yoga_mobility', 'kettlebell')
    when 'all_inclusive'        then p_pillar in ('vrij_trainen', 'yoga_mobility', 'kettlebell')
    when 'kids'                 then p_pillar = 'kids'
    when 'senior'               then p_pillar = 'senior'
    when 'ten_ride_card'        then p_pillar in ('yoga_mobility', 'kettlebell')
    when 'twelve_week_program'  then p_pillar in ('vrij_trainen', 'yoga_mobility', 'kettlebell')
    else false -- pt_package en onbekende types dekken geen groepslessen
  end;
$$;

COMMENT ON FUNCTION "tmc"."plan_covers"("p_plan_type" "text", "p_pillar" "text") IS 'SQL-spiegel van PLAN_COVERAGE (src/lib/member/plan-coverage.ts): welke pillars dekt een plan_type. Gebruikt door tmc.book_class_session.';

-- ---------------------------------------------------------------------------
-- 4. Nieuwe catalogusrijen (idempotent via unique plan_variant)
-- ---------------------------------------------------------------------------

INSERT INTO "tmc"."membership_plan_catalogue"
  ("plan_type", "plan_variant", "display_name", "frequency_cap", "age_category",
   "price_per_cycle_cents", "billing_cycle_weeks", "commit_months",
   "covered_pillars", "includes", "is_highlighted", "display_order",
   "early_member_pool", "is_active")
VALUES
  -- COPY: confirm met Marlon (display_name + includes)
  ('groepslessen', 'groepslessen_2x', 'Groepslessen 2×/wk', 2, 'adult',
   7900, 4, 12,
   ARRAY['yoga_mobility', 'kettlebell'],
   ARRAY['2× per week groepsles', 'Yoga, mobility en kettlebell, mix zoals jij wilt'],
   false, 20, 'groepslessen', true),
  -- COPY: confirm met Marlon (display_name + includes)
  ('groepslessen', 'groepslessen_3x', 'Groepslessen 3×/wk', 3, 'adult',
   9900, 4, 12,
   ARRAY['yoga_mobility', 'kettlebell'],
   ARRAY['3× per week groepsles', 'Yoga, mobility en kettlebell, mix zoals jij wilt'],
   false, 21, 'groepslessen', true),
  -- COPY: confirm met Marlon (display_name + includes)
  ('groepslessen', 'groepslessen_unl', 'Groepslessen Onbeperkt', NULL, 'adult',
   11900, 4, 12,
   ARRAY['yoga_mobility', 'kettlebell'],
   ARRAY['Onbeperkt groepslessen', 'Yoga, mobility en kettlebell, mix zoals jij wilt'],
   false, 22, 'groepslessen', true),
  -- COPY: confirm met Marlon (display_name + includes)
  ('all_inclusive', 'all_inclusive_2x', 'All Inclusive 2×/wk', 2, 'adult',
   10900, 4, 12,
   ARRAY['vrij_trainen', 'yoga_mobility', 'kettlebell'],
   ARRAY['2× per week toegang tot alle lessen', 'Vrij trainen inbegrepen'],
   false, 39, 'all_access', true)
ON CONFLICT ("plan_variant") DO NOTHING;
