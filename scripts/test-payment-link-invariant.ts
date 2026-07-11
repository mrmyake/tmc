/**
 * Bewijs van de dubbele-betaling-invariant in startCheckoutCore
 * (src/lib/orders/payment-link-core.ts). Draait de ECHTE productiecode met
 * fake deps; de fake Mollie dedupliceert op idempotencyKey, exact zoals de
 * echte Mollie API dat doet.
 *
 * Run: node --experimental-strip-types scripts/test-payment-link-invariant.ts
 */
import {
  startCheckoutCore,
  type PaymentLinkDeps,
  type PaymentLinkOrder,
} from "../src/lib/orders/payment-link-core.ts";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

const TOKEN = "11111111-2222-4333-8444-555555555555";

interface Harness {
  deps: PaymentLinkDeps;
  createdPayments: Map<string, { id: string; key: string }>;
  createCalls: number;
  paymentRows: Set<string>;
  order: PaymentLinkOrder;
  molliePayments: Map<string, { id: string; status: string; checkoutUrl: string | null }>;
}

function makeHarness(orderOverrides: Partial<PaymentLinkOrder> = {}): Harness {
  const order: PaymentLinkOrder = {
    id: "order-1",
    profile_id: "profile-1",
    kind: "subscription",
    catalogue_slug: "all_inclusive_3x",
    status: "draft",
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    first_charge_cents: 16800,
    mollie_payment_id: null,
    mollie_customer_id: null,
    ...orderOverrides,
  };

  // key -> payment: de idempotency-dedupe zoals Mollie hem afdwingt.
  const byIdempotencyKey = new Map<string, { id: string; status: string; checkoutUrl: string | null }>();
  const molliePayments = new Map<string, { id: string; status: string; checkoutUrl: string | null }>();
  const paymentRows = new Set<string>();
  let seq = 0;

  const h: Harness = {
    createdPayments: new Map(),
    createCalls: 0,
    paymentRows,
    order,
    molliePayments,
    deps: {
      db: {
        async getOrderByToken(t) {
          return t === TOKEN ? { ...order } : null;
        },
        async getProfile() {
          return {
            first_name: "Test",
            last_name: "Klant",
            email: "klant@example.com",
            mollie_customer_id: null,
          };
        },
        async saveMollieCustomerId(_p, id) {
          order.mollie_customer_id = order.mollie_customer_id ?? id;
        },
        async countPaymentsForOrder() {
          return paymentRows.size;
        },
        async markOrderPending(_o, paymentId, customerId) {
          if (order.status !== "draft" && order.status !== "pending") return false;
          order.status = "pending";
          order.mollie_payment_id = paymentId;
          order.mollie_customer_id = customerId;
          return true;
        },
        async getOrderStatus() {
          return order.status;
        },
        async upsertPaymentRow(row) {
          paymentRows.add(row.mollie_payment_id); // Set = upsert-semantiek
        },
      },
      mollie: {
        async getPayment(id) {
          const p = molliePayments.get(id);
          if (!p) throw new Error(`unknown payment ${id}`);
          return { ...p };
        },
        async createCustomer() {
          return "cst_test_1";
        },
        async createPayment(args) {
          h.createCalls++;
          // Mollie-gedrag: zelfde idempotencyKey binnen het venster geeft
          // hetzelfde payment-object terug, er ontstaat GEEN tweede payment.
          const existing = byIdempotencyKey.get(args.idempotencyKey);
          if (existing) return { ...existing };
          seq++;
          const p = {
            id: `tr_test_${seq}`,
            status: "open",
            checkoutUrl: `https://checkout.mollie.test/${seq}`,
          };
          byIdempotencyKey.set(args.idempotencyKey, p);
          molliePayments.set(p.id, p);
          h.createdPayments.set(p.id, { id: p.id, key: args.idempotencyKey });
          return { ...p };
        },
      },
      urls: { site: "https://tmc.test", webhook: "https://tmc.test/api/mollie/webhook" },
    },
  };
  return h;
}

async function run() {
  console.log("\n1. KERN-DoD: twee GELIJKTIJDIGE mint-pogingen op hetzelfde token");
  {
    const h = makeHarness();
    const [a, b] = await Promise.all([
      startCheckoutCore(h.deps, TOKEN),
      startCheckoutCore(h.deps, TOKEN),
    ]);
    assert(a.ok && b.ok, "beide aanroepen slagen");
    assert(h.createdPayments.size === 1, `precies EEN Mollie-payment ontstaan (n=${h.createdPayments.size}, calls=${h.createCalls})`);
    assert(a.ok && b.ok && a.checkoutUrl === b.checkoutUrl, "beide krijgen dezelfde checkout-URL");
    assert(h.paymentRows.size === 1, "een payments-rij (upsert, geen unique-violation)");
  }

  console.log("\n2. Tweede bezoek terwijl er een OPEN payment hangt: hergebruik, geen mint");
  {
    const h = makeHarness();
    await startCheckoutCore(h.deps, TOKEN);
    const callsNaEerste = h.createCalls;
    const res = await startCheckoutCore(h.deps, TOKEN);
    assert(res.ok, "tweede bezoek krijgt gewoon een checkout-URL");
    assert(h.createCalls === callsNaEerste, "geen nieuwe createPayment-aanroep gedaan");
    assert(h.createdPayments.size === 1, "nog steeds een payment");
  }

  console.log("\n3. Al betaald (payment paid, webhook nog onderweg): geen mint");
  {
    const h = makeHarness();
    await startCheckoutCore(h.deps, TOKEN);
    const paymentId = h.order.mollie_payment_id!;
    h.molliePayments.get(paymentId)!.status = "paid";
    const res = await startCheckoutCore(h.deps, TOKEN);
    assert(!res.ok && res.reason === "already_paid", "reason=already_paid");
    assert(h.createdPayments.size === 1, "geen tweede payment gemint");
  }

  console.log("\n4. Order al geactiveerd: geen mint");
  {
    const h = makeHarness({ status: "activated" });
    const res = await startCheckoutCore(h.deps, TOKEN);
    assert(!res.ok && res.reason === "already_paid", "reason=already_paid");
    assert(h.createCalls === 0, "createPayment nooit aangeroepen");
  }

  console.log("\n5. Verlopen order (zachte muur): geen mint");
  {
    const h = makeHarness({ expires_at: new Date(Date.now() - 1000).toISOString() });
    const res = await startCheckoutCore(h.deps, TOKEN);
    assert(!res.ok && res.reason === "expired", "reason=expired");
    assert(h.createCalls === 0, "createPayment nooit aangeroepen");
  }

  console.log("\n6. Vorige poging terminaal dood (failed): nieuwe mint met NIEUWE key");
  {
    const h = makeHarness();
    await startCheckoutCore(h.deps, TOKEN);
    const eerste = h.order.mollie_payment_id!;
    h.molliePayments.get(eerste)!.status = "failed";
    const res = await startCheckoutCore(h.deps, TOKEN);
    assert(res.ok, "retry slaagt");
    assert(h.createdPayments.size === 2, "tweede payment gemint voor de retry");
    const keys = [...h.createdPayments.values()].map((p) => p.key);
    assert(new Set(keys).size === 2, `verschillende idempotencyKeys per poging (${keys.join(", ")})`);
  }

  console.log("\n7. Status flipt naar activated TUSSEN mint en koppelen: geen checkout-URL");
  {
    const h = makeHarness();
    const origMark = h.deps.db.markOrderPending;
    h.deps.db.markOrderPending = async (o, p, c) => {
      h.order.status = "activated"; // webhook won de race
      return origMark(o, p, c);
    };
    const res = await startCheckoutCore(h.deps, TOKEN);
    assert(!res.ok && res.reason === "already_paid", "reason=already_paid, geen URL teruggegeven");
  }

  console.log("\n8. Onbekend/ongeldig token en cancelled order: not_found, lekt niets");
  {
    const h = makeHarness();
    const bad = await startCheckoutCore(h.deps, "geen-uuid");
    const missing = await startCheckoutCore(h.deps, "99999999-9999-4999-8999-999999999999");
    assert(!bad.ok && bad.reason === "not_found", "ongeldig token -> not_found");
    assert(!missing.ok && missing.reason === "not_found", "onbekend token -> not_found");
    const h2 = makeHarness({ status: "cancelled" });
    const cancelled = await startCheckoutCore(h2.deps, TOKEN);
    assert(!cancelled.ok && cancelled.reason === "not_found", "cancelled -> not_found (zelfde als onbekend)");
  }

  console.log(failures === 0 ? "\nALLE TESTS GESLAAGD" : `\n${failures} TEST(S) GEFAALD`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
