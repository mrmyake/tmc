import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedGrantCount,
  grantFailureMessage,
  grantPlanType,
  grantTermsLabel,
  hasCyclePrice,
  invoiceGrantCounters,
  isGrantableProduct,
  revokeFailureMessage,
  toGrantableProducts,
  validateGrantInput,
  type GrantCatalogueRow,
} from "../../src/lib/product-grants/core.ts";

// Product toekennen zonder betaling (spec-facturatie.md 9.8): de poort, de
// telling per factuur en de invoercontrole van de action. De database-kant
// staat in scripts/test-product-grants.sql.

function row(over: Partial<GrantCatalogueRow>): GrantCatalogueRow {
  return {
    slug: "ten_ride_card",
    kind: "product",
    display_name: "10-rittenkaart",
    credits: 10,
    validity_months: 6,
    billing_cycle_weeks: null,
    is_active: true,
    ...over,
  };
}

const PROFILE = "11111111-1111-4111-8111-111111111111";
const INVOICE = "22222222-2222-4222-8222-222222222222";

test("poort: losse producten met tegoed mogen, de rest niet", () => {
  assert.equal(isGrantableProduct(row({})), true);
  assert.equal(isGrantableProduct(row({ slug: "pt_10", validity_months: null })), true);
  assert.equal(isGrantableProduct(row({ slug: "duo_single", credits: 1 })), true);
  // Abonnement: kind plan met een incassocyclus.
  assert.equal(
    isGrantableProduct(row({ slug: "all_inclusive_unl", kind: "plan", credits: null, billing_cycle_weeks: 4 })),
    false,
  );
  // drop_in heeft credits maar geen plan_type.
  assert.equal(isGrantableProduct(row({ slug: "drop_in", credits: 1 })), false);
  // Programma: product zonder credits.
  assert.equal(isGrantableProduct(row({ slug: "program_studio_12w", credits: null })), false);
  assert.equal(isGrantableProduct(row({ slug: "extended_access", kind: "addon", credits: null, billing_cycle_weeks: 4 })), false);
  assert.equal(isGrantableProduct(row({ slug: "signup_fee", kind: "fee", credits: null })), false);
  // Inactief.
  assert.equal(isGrantableProduct(row({ slug: "ten_ride_card_senior", is_active: false })), false);
});

test("plan_type-mapping is die van activate_order", () => {
  assert.equal(grantPlanType("ten_ride_card"), "ten_ride_card");
  assert.equal(grantPlanType("ten_ride_card_kids"), "ten_ride_card");
  assert.equal(grantPlanType("pt_single"), "pt_package");
  assert.equal(grantPlanType("duo_10"), "pt_package");
  assert.equal(grantPlanType("drop_in"), null);
  assert.equal(grantPlanType("groepslessen_unl"), null);
});

test("toGrantableProducts filtert en neemt credits en geldigheid uit de catalogus", () => {
  const out = toGrantableProducts([
    row({}),
    row({ slug: "pt_10", display_name: "PT 10", validity_months: null }),
    row({ slug: "drop_in", credits: 1 }),
  ]);
  assert.deepEqual(out, [
    { slug: "ten_ride_card", displayName: "10-rittenkaart", credits: 10, validityMonths: 6 },
    { slug: "pt_10", displayName: "PT 10", credits: 10, validityMonths: null },
  ]);
  assert.equal(grantTermsLabel(out[0]), "10 credits, 6 maanden geldig");
  assert.equal(grantTermsLabel(out[1]), "10 credits, geen vervaldatum");
  assert.equal(grantTermsLabel({ credits: 1, validityMonths: null }), "1 credit, geen vervaldatum");
});

test("toegestaan aantal: som van quantity naar beneden, 1 als de slug niet op de factuur staat", () => {
  const lines = [
    { catalogueSlug: "ten_ride_card", quantity: 1 },
    { catalogueSlug: "ten_ride_card", quantity: 1.5 },
    { catalogueSlug: null, quantity: 3 },
  ];
  assert.equal(allowedGrantCount(lines, "ten_ride_card"), 2);
  assert.equal(allowedGrantCount(lines, "duo_10"), 1);
  assert.equal(allowedGrantCount([{ catalogueSlug: "pt_10", quantity: 0.5 }], "pt_10"), 0);
  assert.equal(allowedGrantCount([], "pt_10"), 1);
});

test("tellers per factuur: toekenbare slugs van de regels plus al toegekende slugs", () => {
  const products = toGrantableProducts([
    row({}),
    row({ slug: "duo_10", display_name: "Duo 10", validity_months: null }),
  ]);
  const counters = invoiceGrantCounters(
    [
      { catalogueSlug: "ten_ride_card", quantity: 2 },
      { catalogueSlug: "signup_fee", quantity: 1 },
      { catalogueSlug: null, quantity: 1 },
    ],
    ["ten_ride_card", "duo_10"],
    products,
  );
  assert.deepEqual(
    counters.map((c) => [c.slug, c.granted, c.allowed]),
    [
      ["ten_ride_card", 1, 2],
      ["duo_10", 1, 1],
    ],
  );
  assert.deepEqual(invoiceGrantCounters([{ catalogueSlug: null, quantity: 1 }], [], products), []);
});

test("invoercontrole van de action", () => {
  const ok = { profileId: PROFILE, slug: "ten_ride_card", reason: "cadeau" };
  assert.equal(validateGrantInput(ok), null);
  assert.equal(validateGrantInput({ ...ok, invoiceId: INVOICE }), null);
  assert.equal(validateGrantInput({ ...ok, invoiceId: null }), null);
  assert.match(validateGrantInput({ ...ok, reason: "   " }) ?? "", /reden/);
  assert.match(validateGrantInput({ ...ok, reason: "x".repeat(501) }) ?? "", /te lang/);
  assert.match(validateGrantInput({ ...ok, slug: "all_inclusive_unl" }) ?? "", /niet toegekend/);
  assert.match(validateGrantInput({ ...ok, slug: "drop_in" }) ?? "", /niet toegekend/);
  assert.match(validateGrantInput({ ...ok, profileId: "nope" }) ?? "", /lid/);
  assert.match(validateGrantInput({ ...ok, invoiceId: "nope" }) ?? "", /factuur/);
});

test("weigeringen van de RPC krijgen een eigen tekst", () => {
  assert.match(grantFailureMessage("already_granted", { granted: 1, allowed: 1 }), /1 van 1/);
  assert.match(grantFailureMessage("invoice_not_paid"), /nog niet betaald/);
  assert.match(grantFailureMessage("invoice_profile_mismatch"), /ander lid/);
  assert.match(grantFailureMessage("invoice_credited"), /gecrediteerd/);
  assert.match(grantFailureMessage("invoice_is_credit_note"), /creditnota/);
  assert.match(grantFailureMessage("invoice_not_finalised"), /concept/);
  assert.match(grantFailureMessage("product_not_grantable"), /geen abonnementen/);
  assert.equal(grantFailureMessage(undefined), "Product toekennen lukte niet.");
  assert.match(revokeFailureMessage("credits_used", { creditsRemaining: 9, creditsTotal: 10 }), /9 van 10/);
  assert.match(revokeFailureMessage("already_revoked"), /al ingetrokken/);
  assert.equal(revokeFailureMessage("iets_anders"), "Intrekken lukte niet.");
});

test("geen bedrag per cyclus voor een rij zonder incassocyclus", () => {
  // Toegekende kaart (prijs 0) en gekochte kaart (prijs, geen cyclus).
  assert.equal(hasCyclePrice({ billingCycleWeeks: 0 }), false);
  // Een abonnement houdt zijn bedrag, ook als dat 0 is.
  assert.equal(hasCyclePrice({ billingCycleWeeks: 4 }), true);
});

test("geen em dashes in de teksten", () => {
  const texts = [
    grantFailureMessage("already_granted", { granted: 1, allowed: 1 }),
    grantFailureMessage("invoice_not_paid"),
    grantFailureMessage("invoice_credited"),
    revokeFailureMessage("credits_used", { creditsRemaining: 1, creditsTotal: 2 }),
    revokeFailureMessage("credits_adjusted"),
  ];
  const emDash = String.fromCharCode(0x2014);
  for (const t of texts) assert.equal(t.includes(emDash), false);
});
