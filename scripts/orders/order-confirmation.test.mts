import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConfirmationProps,
  nextChargeDate,
  sendOrderConfirmationOnce,
  type ConfirmationOrderRow,
  type SendOnceDeps,
} from "../../src/lib/orders/order-confirmation-core.ts";

// Draait via `npm run test:orders` (node:test met de ts-loader, zelfde opzet
// als scripts/mollie). Geen netwerk: alle afhankelijkheden zijn nep.

const fmt = {
  euroCents: (c: number) => `€${(c / 100).toFixed(2).replace(".", ",")}`,
  noticePeriod: (d: number) => `${d} dagen`,
  longDate: (d: Date) => d.toISOString().slice(0, 10),
};

const NOW = new Date("2026-09-08T12:00:00Z");

function subscriptionOrder(overrides: Partial<ConfirmationOrderRow> = {}): ConfirmationOrderRow {
  return {
    id: "order-sub-1",
    profile_id: "profile-1",
    kind: "subscription",
    catalogue_slug: "groepslessen_2x",
    first_charge_cents: 7900,
    recurring_cents: 7900,
    signup_fee_cents: 0,
    signup_fee_waiver: "early_member",
    billing_cycle_weeks: 4,
    vat_amount_cents: 652,
    pricing_snapshot: { recurring_vat_amount_cents: 652, vat_rate_bp: 900 },
    profile: { email: "lid@example.com", first_name: "Sanne" },
    ...overrides,
  };
}

function productOrder(): ConfirmationOrderRow {
  return {
    id: "order-prod-1",
    profile_id: "profile-2",
    kind: "product",
    catalogue_slug: "ten_ride_card",
    first_charge_cents: 15000,
    recurring_cents: null,
    signup_fee_cents: 0,
    signup_fee_waiver: null,
    billing_cycle_weeks: null,
    vat_amount_cents: 1239,
    pricing_snapshot: { vat_rate_bp: 900 },
    profile: { email: "koper@example.com", first_name: "" },
    ...{},
  };
}

const catalogueBySlug = {
  groepslessen_2x: { display_name: "Groepslessen 2×/wk", credits: null, validity_months: null, vat_rate_bp: 900 },
  ten_ride_card: { display_name: "10-rittenkaart", credits: 10, validity_months: 4, vat_rate_bp: 900 },
} as const;

function makeDeps(order: ConfirmationOrderRow, opts: { sendOk?: boolean } = {}) {
  const events = new Set<string>();
  const sent: string[] = [];
  const deps: SendOnceDeps = {
    hasConfirmationEvent: async (id) => events.has(id),
    loadOrder: async (id) => (id === order.id ? order : null),
    loadCatalogue: async (slug) => catalogueBySlug[slug as keyof typeof catalogueBySlug] ?? null,
    cancellationNoticeDays: async () => 28,
    send: async ({ to }) => {
      sent.push(to);
      return opts.sendOk ?? true;
    },
    emitSent: async (id) => {
      events.add(id);
    },
    siteUrl: "https://www.themovementclub.nl",
    now: () => NOW,
    fmt,
  };
  return { deps, events, sent };
}

test("abonnement: bedragen uit de order-rij, EM-waiver, per 4 weken, volgende incasso", () => {
  const built = buildConfirmationProps(
    { order: subscriptionOrder(), catalogue: catalogueBySlug.groepslessen_2x, cancellationNoticeDays: 28, siteUrl: "https://x", now: NOW },
    fmt,
  );
  assert.ok(built);
  assert.equal(built.to, "lid@example.com");
  assert.equal(built.props.kind, "subscription");
  if (built.props.kind !== "subscription") return;
  assert.equal(built.props.productName, "Groepslessen 2×/wk");
  assert.equal(built.props.paidEuro, "€79,00");
  assert.equal(built.props.paidVatEuro, "€6,52");
  assert.equal(built.props.vatRateLabel, "9%");
  assert.equal(built.props.recurringEuro, "€79,00");
  assert.equal(built.props.intervalLabel, "per 4 weken");
  assert.equal(built.props.nextChargeDate, "2026-10-06");
  assert.deepEqual(built.props.signupFee, { charged: false, reasonLabel: "Early Member" });
  assert.equal(built.props.noticePeriodLabel, "28 dagen");
});

test("abonnement zonder waiver: inschrijfkosten in rekening gebracht", () => {
  const built = buildConfirmationProps(
    {
      order: subscriptionOrder({ first_charge_cents: 11800, signup_fee_cents: 3900, signup_fee_waiver: null, vat_amount_cents: 974 }),
      catalogue: catalogueBySlug.groepslessen_2x,
      cancellationNoticeDays: 28,
      siteUrl: "https://x",
      now: NOW,
    },
    fmt,
  );
  assert.ok(built && built.props.kind === "subscription");
  assert.equal(built.props.paidEuro, "€118,00");
  assert.deepEqual(built.props.signupFee, { charged: true, amountEuro: "€39,00" });
});

test("product: ritten en geldigheid uit de catalogus, geen incasso-velden", () => {
  const built = buildConfirmationProps(
    { order: productOrder(), catalogue: catalogueBySlug.ten_ride_card, cancellationNoticeDays: 28, siteUrl: "https://x", now: NOW },
    fmt,
  );
  assert.ok(built && built.props.kind === "product");
  assert.equal(built.props.productName, "10-rittenkaart");
  assert.equal(built.props.paidEuro, "€150,00");
  assert.equal(built.props.paidVatEuro, "€12,39");
  assert.equal(built.props.credits, 10);
  assert.equal(built.props.validityMonths, 4);
});

test("zonder e-mailadres geen mail", () => {
  const built = buildConfirmationProps(
    { order: subscriptionOrder({ profile: { email: null, first_name: "X" } }), catalogue: null, cancellationNoticeDays: 28, siteUrl: "https://x", now: NOW },
    fmt,
  );
  assert.equal(built, null);
});

test("nextChargeDate: nu plus billing_cycle_weeks * 7 dagen", () => {
  assert.equal(nextChargeDate(NOW, 4).toISOString().slice(0, 10), "2026-10-06");
});

test("exact één keer: tweede aanroep voor dezelfde order verstuurt niets", async () => {
  const { deps, sent, events } = makeDeps(subscriptionOrder());
  const first = await sendOrderConfirmationOnce(deps, "order-sub-1");
  const second = await sendOrderConfirmationOnce(deps, "order-sub-1");
  const third = await sendOrderConfirmationOnce(deps, "order-sub-1");
  assert.deepEqual(first, { outcome: "sent" });
  assert.deepEqual(second, { outcome: "already_sent" });
  assert.deepEqual(third, { outcome: "already_sent" });
  assert.equal(sent.length, 1);
  assert.ok(events.has("order-sub-1"));
});

test("mislukte verzending schrijft geen event, zodat een retry alsnog kan versturen", async () => {
  const { deps, sent, events } = makeDeps(subscriptionOrder(), { sendOk: false });
  const first = await sendOrderConfirmationOnce(deps, "order-sub-1");
  assert.deepEqual(first, { outcome: "failed" });
  assert.equal(sent.length, 1);
  assert.equal(events.has("order-sub-1"), false);
});

test("onbekende order: skipped, geen mail, geen event", async () => {
  const { deps, sent, events } = makeDeps(subscriptionOrder());
  const res = await sendOrderConfirmationOnce(deps, "bestaat-niet");
  assert.deepEqual(res, { outcome: "skipped", reason: "order_not_found" });
  assert.equal(sent.length, 0);
  assert.equal(events.size, 0);
});

test("een fout in een afhankelijkheid wordt gevangen en levert failed op", async () => {
  const { deps } = makeDeps(subscriptionOrder());
  deps.loadCatalogue = async () => {
    throw new Error("boom");
  };
  const res = await sendOrderConfirmationOnce(deps, "order-sub-1");
  assert.deepEqual(res, { outcome: "failed" });
});
