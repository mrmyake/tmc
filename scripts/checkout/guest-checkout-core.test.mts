/**
 * Kern van de gastcheckout-action (src/lib/checkout/guest-checkout-core.ts):
 * rate limit telt elke aanroep, validatie, bestaand adres stuurt de code en
 * slaat de telefooncheck over, telefoon in gebruik, prijs uitsluitend via de
 * intent-RPC, Mollie-metadata en idempotency, redirect naar de publieke
 * bedankpagina. Run: npm run test:checkout
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanAcquisition,
  startGuestCheckoutCore,
  type GuestCheckoutDeps,
  type GuestCheckoutInput,
} from "../../src/lib/checkout/guest-checkout-core";
import { PHONE_TAKEN_MESSAGE } from "../../src/lib/profile-validation";

const INTENT_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "f".repeat(64);

function input(overrides: Partial<GuestCheckoutInput> = {}): GuestCheckoutInput {
  return {
    slug: "groepslessen_2x",
    earlyMember: true,
    email: "  Nieuw.Lid@Voorbeeld.NL ",
    firstName: "Nieuw",
    lastName: "Lid",
    phone: "06 12 34 56 78",
    streetAddress: "Industrieweg 14P",
    postalCode: "1231 MX",
    city: "Loosdrecht",
    gaClientId: "GA1.1.1",
    ...overrides,
  };
}

function harness(opts: {
  allowed?: boolean;
  existingUser?: string | null;
  phoneInUse?: boolean;
  createIntent?: Awaited<ReturnType<GuestCheckoutDeps["db"]["createIntent"]>>;
  markPendingOk?: boolean;
} = {}) {
  const calls = {
    rateLimit: [] as string[],
    sendLoginCode: [] as string[],
    phoneInUse: [] as string[],
    createIntent: [] as Parameters<GuestCheckoutDeps["db"]["createIntent"]>[0][],
    createCustomer: [] as Parameters<GuestCheckoutDeps["mollie"]["createCustomer"]>[0][],
    createPayment: [] as Parameters<GuestCheckoutDeps["mollie"]["createPayment"]>[0][],
    markPending: [] as Parameters<GuestCheckoutDeps["db"]["markPending"]>[0][],
    emit: [] as string[],
  };
  const deps: GuestCheckoutDeps = {
    mode: "test",
    ip: "203.0.113.7",
    rateLimit: async (ip) => {
      calls.rateLimit.push(ip);
      return opts.allowed ?? true;
    },
    auth: {
      userIdForEmail: async () => opts.existingUser ?? null,
      sendLoginCode: async (email) => {
        calls.sendLoginCode.push(email);
        return { ok: true };
      },
    },
    db: {
      phoneInUse: async (p) => {
        calls.phoneInUse.push(p);
        return opts.phoneInUse ?? false;
      },
      createIntent: async (a) => {
        calls.createIntent.push(a);
        return (
          opts.createIntent ?? {
            ok: true,
            intent_id: INTENT_ID,
            status_token: TOKEN,
            kind: "subscription",
            first_charge_cents: 7900,
            recurring_cents: 7900,
            early_member: true,
          }
        );
      },
      markPending: async (a) => {
        calls.markPending.push(a);
        return { ok: opts.markPendingOk ?? true };
      },
    },
    mollie: {
      createCustomer: async (a) => {
        calls.createCustomer.push(a);
        return "cst_1";
      },
      createPayment: async (a) => {
        calls.createPayment.push(a);
        return { id: "tr_1", checkoutUrl: "https://mollie.test/checkout/tr_1" };
      },
    },
    urls: { site: "https://preview.test", webhook: "https://preview.test/api/mollie/webhook?mode=test" },
    emit: async (e) => {
      calls.emit.push(e.type);
    },
  };
  return { deps, calls };
}

test("happy path: prijs uit de RPC, Mollie-metadata, key en redirect naar de publieke bedankpagina", async () => {
  const h = harness();
  const out = await startGuestCheckoutCore(h.deps, input());
  assert.deepEqual(out, { ok: true, checkoutUrl: "https://mollie.test/checkout/tr_1", kind: "subscription", amountCents: 7900 });
  assert.deepEqual(h.calls.rateLimit, ["203.0.113.7"]);
  const ci = h.calls.createIntent[0];
  assert.equal(ci.email, "nieuw.lid@voorbeeld.nl");
  assert.equal(ci.phoneE164, "+31612345678");
  assert.equal(ci.mode, "test");
  assert.equal(ci.earlyMember, true);
  assert.equal(ci.gaClientId, "GA1.1.1");
  assert.equal(h.calls.createCustomer[0].name, "Nieuw Lid");
  const cp = h.calls.createPayment[0];
  assert.equal(cp.amountValue, "79.00");
  assert.equal(cp.isSubscription, true);
  assert.equal(cp.customerId, "cst_1");
  assert.equal(cp.intentId, INTENT_ID);
  assert.equal(cp.mode, "test");
  assert.equal(cp.idempotencyKey, `checkout-${INTENT_ID}-p1`);
  assert.equal(cp.redirectUrl, `https://preview.test/abonnement/bedankt?t=${TOKEN}`);
  assert.deepEqual(h.calls.markPending, [{ intentId: INTENT_ID, paymentId: "tr_1", customerId: "cst_1" }]);
  assert.deepEqual(h.calls.emit, ["checkout_intent.created"]);
});

test("product: redirect naar /kopen/bedankt en geen first-sequence", async () => {
  const h = harness({
    createIntent: { ok: true, intent_id: INTENT_ID, status_token: TOKEN, kind: "product", first_charge_cents: 12500 },
  });
  const out = await startGuestCheckoutCore(h.deps, input({ slug: "ten_ride_card_adult", earlyMember: false }));
  assert.equal(out.ok, true);
  assert.equal(h.calls.createPayment[0].isSubscription, false);
  assert.equal(h.calls.createPayment[0].redirectUrl, `https://preview.test/kopen/bedankt?t=${TOKEN}`);
});

test("rate limit telt elke aanroep, ook met ongeldige invoer, en wint van alles", async () => {
  const h = harness({ allowed: false });
  const out = await startGuestCheckoutCore(h.deps, input({ email: "geen-adres" }));
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, "rate_limited");
  assert.deepEqual(h.calls.rateLimit, ["203.0.113.7"]);
  assert.deepEqual(h.calls.createIntent, []);
});

test("validatie: e-mail, verplichte velden en telefoon met veldnaam", async () => {
  const h = harness();
  const e = await startGuestCheckoutCore(h.deps, input({ email: "geen-adres" }));
  assert.equal(e.ok === false && e.field, "email");
  const n = await startGuestCheckoutCore(h.deps, input({ lastName: "  " }));
  assert.equal(n.ok === false && n.field, "last_name");
  const p = await startGuestCheckoutCore(h.deps, input({ phone: "12" }));
  assert.equal(p.ok === false && p.field, "phone");
  assert.deepEqual(h.calls.createIntent, []);
});

test("bestaand adres: inlogcode verstuurd, telefooncheck overgeslagen, geen intent", async () => {
  const h = harness({ existingUser: "profile-x", phoneInUse: true });
  const out = await startGuestCheckoutCore(h.deps, input());
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.reason, "existing_account");
  assert.equal(out.codeSent, true);
  assert.equal(out.email, "nieuw.lid@voorbeeld.nl");
  assert.deepEqual(h.calls.sendLoginCode, ["nieuw.lid@voorbeeld.nl"]);
  assert.deepEqual(h.calls.phoneInUse, []);
  assert.deepEqual(h.calls.createIntent, []);
});

test("telefoon al in gebruik: bestaande melding, geen intent", async () => {
  const h = harness({ phoneInUse: true });
  const out = await startGuestCheckoutCore(h.deps, input());
  assert.deepEqual(out, { ok: false, reason: "phone_in_use", error: PHONE_TAKEN_MESSAGE, field: "phone" });
  assert.deepEqual(h.calls.phoneInUse, ["+31612345678"]);
  assert.deepEqual(h.calls.createIntent, []);
});

test("RPC weigert: catalogusreden wordt klantcopy, invalid_input wijst het veld aan", async () => {
  const a = harness({ createIntent: { ok: false, reason: "catalogue_row_not_found" } });
  const outA = await startGuestCheckoutCore(a.deps, input());
  assert.equal(outA.ok === false && outA.reason, "price_unavailable");
  assert.deepEqual(a.calls.createCustomer, []);
  const b = harness({ createIntent: { ok: false, reason: "invalid_input", constraint: "checkout_intents_phone_e164" } });
  const outB = await startGuestCheckoutCore(b.deps, input());
  assert.equal(outB.ok === false && outB.field, "phone");
});

test("mark pending mislukt: geen checkout-URL, intent blijft voor de cron", async () => {
  const h = harness({ markPendingOk: false });
  const out = await startGuestCheckoutCore(h.deps, input());
  assert.equal(out.ok === false && out.reason, "unexpected_error");
  assert.deepEqual(h.calls.emit, []);
});

test("acquisitie: getrimd, begrensd, ongeldige first_touch_at valt weg", () => {
  const cleaned = cleanAcquisition({
    acquisition_source: "  instagram ",
    acquisition_medium: "",
    signup_path: "/abonnement",
    first_touch_at: "niet-een-datum",
    onbekend: "weg",
  });
  assert.deepEqual(cleaned, { acquisition_source: "instagram", signup_path: "/abonnement" });
  assert.equal(cleanAcquisition({ first_touch_at: "2026-10-01T10:00:00Z" }).first_touch_at, "2026-10-01T10:00:00.000Z");
});
