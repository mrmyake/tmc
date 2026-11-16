import { test } from "node:test";
import assert from "node:assert/strict";
import { itemCategoryFor } from "../../src/lib/ga-mp/core.ts";

// De mapping van tmc.catalogue naar item_category op het purchase-event
// (spec-conversiemeting.md). De rijen hieronder zijn de live catalogus van
// 2026-11-16 (slug, revenue_category), actief en inactief.

const CATALOGUE: Array<[slug: string, revenueCategory: string, expected: string]> = [
  ["all_inclusive_2x", "abonnement", "abonnement"],
  ["all_inclusive_3x", "abonnement", "abonnement"],
  ["all_inclusive_unl", "abonnement", "abonnement"],
  ["groepslessen_2x", "abonnement", "abonnement"],
  ["groepslessen_3x", "abonnement", "abonnement"],
  ["groepslessen_unl", "abonnement", "abonnement"],
  ["vrij_trainen_2x", "abonnement", "abonnement"],
  ["vrij_trainen_3x", "abonnement", "abonnement"],
  ["vrij_trainen_unl", "abonnement", "abonnement"],
  ["kids_1x", "abonnement", "abonnement"],
  ["kids_2x", "abonnement", "abonnement"],
  ["kids_unl", "abonnement", "abonnement"],
  ["senior_1x", "abonnement", "abonnement"],
  ["senior_2x", "abonnement", "abonnement"],
  ["senior_unl", "abonnement", "abonnement"],
  ["ten_ride_card", "les_tegoed", "rittenkaart"],
  ["ten_ride_card_kids", "les_tegoed", "rittenkaart"],
  ["ten_ride_card_senior", "les_tegoed", "rittenkaart"],
  // Heten ook rittenkaart, maar zijn personal training.
  ["pt_single", "personal_training", "pt"],
  ["pt_10", "personal_training", "pt"],
  ["duo_single", "personal_training", "pt"],
  ["duo_10", "personal_training", "pt"],
  ["program_studio_12w", "programma", "programma"],
  ["program_online_12w", "programma", "programma"],
  ["drop_in", "les_tegoed", "overig"],
  ["drop_in_kids", "les_tegoed", "overig"],
  ["drop_in_senior", "les_tegoed", "overig"],
  ["extended_access", "addon", "overig"],
  ["signup_fee", "inschrijfgeld", "overig"],
];

test("elke catalogusslug krijgt de afgesproken item_category", () => {
  for (const [slug, revenueCategory, expected] of CATALOGUE) {
    assert.equal(
      itemCategoryFor({ slug, revenue_category: revenueCategory }),
      expected,
      `${slug} (${revenueCategory})`,
    );
  }
});

test("alleen de vijf afgesproken categorieen komen voor", () => {
  const seen = new Set(
    CATALOGUE.map(([slug, revenueCategory]) =>
      itemCategoryFor({ slug, revenue_category: revenueCategory }),
    ),
  );
  assert.deepEqual([...seen].sort(), ["abonnement", "overig", "programma", "pt", "rittenkaart"]);
});

test("onbekende slug of ontbrekende rij is overig", () => {
  assert.equal(itemCategoryFor({ slug: "nieuw_product", revenue_category: "iets_nieuws" }), "overig");
  assert.equal(itemCategoryFor({ slug: "nieuw_product", revenue_category: null }), "overig");
  assert.equal(itemCategoryFor(null), "overig");
  assert.equal(itemCategoryFor(undefined), "overig");
});

test("de rittenkaart wordt op slug herkend, niet op een deelstring", () => {
  assert.equal(itemCategoryFor({ slug: "ten_ride_cardio", revenue_category: "les_tegoed" }), "overig");
  assert.equal(itemCategoryFor({ slug: "x_ten_ride_card", revenue_category: "les_tegoed" }), "overig");
});
