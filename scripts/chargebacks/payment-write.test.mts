import { test } from "node:test";
import assert from "node:assert/strict";
import {
  writePaymentWithTransition,
  moneyFactEventFor,
  recurringMembershipActionFor,
  type PaymentWriteSteps,
} from "../../src/lib/payments/payment-write-core.ts";

// Payments-write van de Mollie-webhook (spec-facturatie.md 6.5): de drie
// stappen (overgang, nieuwe rij, herhaling) tegen een nagebouwde
// PostgREST-tabel. Mollie maakt recurring betalingen zelf aan; de eerste
// webhook komt dan zonder bestaande rij en vaak direct met eindstatus.

interface Row {
  mollie_payment_id: string;
  status: string;
}

/**
 * Nagebouwde tmc.payments met de drie query-vormen die de webhook gebruikt.
 * `onInsert` laat een test een andere webhook ertussen laten komen, zoals
 * een race op de unieke index: de eerste insert wint, de tweede ziet de
 * conflict en levert niets op (ON CONFLICT DO NOTHING).
 */
class FakePayments {
  rows = new Map<string, Row>();
  log: string[] = [];

  steps(args: { id: string; status: string; label?: string }): PaymentWriteSteps<Row> {
    const tag = args.label ?? args.status;
    return {
      transition: async () => {
        this.log.push(`${tag}:transition`);
        const row = this.rows.get(args.id);
        if (!row || row.status === args.status) return null;
        row.status = args.status;
        return { ...row };
      },
      insertIfAbsent: async () => {
        this.log.push(`${tag}:insert`);
        if (this.rows.has(args.id)) return null;
        const row = { mollie_payment_id: args.id, status: args.status };
        this.rows.set(args.id, row);
        return { ...row };
      },
      read: async () => {
        this.log.push(`${tag}:read`);
        const row = this.rows.get(args.id);
        return row ? { ...row } : null;
      },
    };
  }
}

test("nieuwe rij die direct als paid binnenkomt: insert-pad telt als overgang, payment.received en reactivering", async () => {
  const db = new FakePayments();
  const res = await writePaymentWithTransition(db.steps({ id: "tr_1", status: "paid" }));
  assert.equal(res.transitioned, true);
  assert.equal(res.row?.status, "paid");
  assert.deepEqual(db.log, ["paid:transition", "paid:insert"]);
  assert.equal(moneyFactEventFor(res.transitioned, "paid"), "payment.received");
  assert.equal(
    recurringMembershipActionFor({ transitioned: res.transitioned, paymentStatus: "paid", membershipStatus: "payment_failed" }),
    "reactivate",
  );
  assert.equal(
    recurringMembershipActionFor({ transitioned: res.transitioned, paymentStatus: "paid", membershipStatus: "active" }),
    "none",
  );

  // Herlevering van dezelfde webhook: geen overgang, geen event, geen reactivering.
  const again = await writePaymentWithTransition(db.steps({ id: "tr_1", status: "paid", label: "retry" }));
  assert.equal(again.transitioned, false);
  assert.equal(again.row?.status, "paid");
  assert.deepEqual(db.log.slice(2), ["retry:transition", "retry:insert", "retry:read"]);
  assert.equal(moneyFactEventFor(again.transitioned, "paid"), null);
  assert.equal(
    recurringMembershipActionFor({ transitioned: again.transitioned, paymentStatus: "paid", membershipStatus: "payment_failed" }),
    "none",
  );
});

test("nieuwe rij die direct als failed, expired of canceled binnenkomt: overgang, payment.failed en active naar payment_failed", async () => {
  for (const status of ["failed", "expired", "canceled"]) {
    const db = new FakePayments();
    const res = await writePaymentWithTransition(db.steps({ id: "tr_f", status }));
    assert.equal(res.transitioned, true, status);
    assert.equal(res.row?.status, status);
    assert.equal(moneyFactEventFor(res.transitioned, status), "payment.failed", status);
    assert.equal(
      recurringMembershipActionFor({ transitioned: true, paymentStatus: status, membershipStatus: "active" }),
      "degrade",
      status,
    );
    // Niet active: geen tweede degradatie, geen ledenmail.
    for (const membershipStatus of ["payment_failed", "paused", "cancelled"]) {
      assert.equal(
        recurringMembershipActionFor({ transitioned: true, paymentStatus: status, membershipStatus }),
        "none",
        `${status}/${membershipStatus}`,
      );
    }
    // Herleverde failed-webhook: intussen hersteld lid blijft met rust gelaten.
    const again = await writePaymentWithTransition(db.steps({ id: "tr_f", status, label: "retry" }));
    assert.equal(again.transitioned, false, status);
    assert.equal(
      recurringMembershipActionFor({ transitioned: again.transitioned, paymentStatus: status, membershipStatus: "active" }),
      "none",
      status,
    );
  }
});

test("nieuwe rij als open, later paid: event en reactivering bij de tweede webhook, niet bij de eerste", async () => {
  const db = new FakePayments();
  const first = await writePaymentWithTransition(db.steps({ id: "tr_o", status: "open" }));
  assert.equal(first.transitioned, true);
  assert.equal(first.row?.status, "open");
  assert.equal(moneyFactEventFor(first.transitioned, "open"), null);
  assert.equal(
    recurringMembershipActionFor({ transitioned: first.transitioned, paymentStatus: "open", membershipStatus: "payment_failed" }),
    "none",
  );

  // Herlevering van de open-webhook: niets.
  const openAgain = await writePaymentWithTransition(db.steps({ id: "tr_o", status: "open", label: "open-retry" }));
  assert.equal(openAgain.transitioned, false);

  const second = await writePaymentWithTransition(db.steps({ id: "tr_o", status: "paid" }));
  assert.equal(second.transitioned, true);
  assert.equal(second.row?.status, "paid");
  assert.deepEqual(db.log.slice(-1), ["paid:transition"]);
  assert.equal(moneyFactEventFor(second.transitioned, "paid"), "payment.received");
  assert.equal(
    recurringMembershipActionFor({ transitioned: second.transitioned, paymentStatus: "paid", membershipStatus: "payment_failed" }),
    "reactivate",
  );

  // Chargeback-webhook later: status blijft paid, dus geen overgang en de
  // zojuist op payment_failed gezette membership blijft staan.
  const chargeback = await writePaymentWithTransition(db.steps({ id: "tr_o", status: "paid", label: "chb" }));
  assert.equal(chargeback.transitioned, false);
  assert.equal(moneyFactEventFor(chargeback.transitioned, "paid"), null);
  assert.equal(
    recurringMembershipActionFor({ transitioned: false, paymentStatus: "paid", membershipStatus: "payment_failed" }),
    "none",
  );
});

test("verloren race: twee webhooks tegelijk voor dezelfde nieuwe betaling, bijwerkingen precies één keer", async () => {
  // Beide zien in stap 1 nog geen rij; de eerste insert wint, de tweede
  // ziet de conflict op mollie_payment_id en valt terug op lezen.
  const db = new FakePayments();
  const a = db.steps({ id: "tr_r", status: "paid", label: "a" });
  const b = db.steps({ id: "tr_r", status: "paid", label: "b" });

  const gate = new Promise<void>((resolve) => {
    let seen = 0;
    const orig = { a: a.transition, b: b.transition };
    a.transition = async () => {
      const r = await orig.a();
      if (++seen === 2) resolve();
      await gate;
      return r;
    };
    b.transition = async () => {
      const r = await orig.b();
      if (++seen === 2) resolve();
      await gate;
      return r;
    };
  });

  const [ra, rb] = await Promise.all([
    writePaymentWithTransition(a),
    writePaymentWithTransition(b),
  ]);
  const transitions = [ra, rb].filter((r) => r.transitioned);
  assert.equal(transitions.length, 1);
  assert.equal(ra.row?.status, "paid");
  assert.equal(rb.row?.status, "paid");
  assert.equal(db.rows.size, 1);
  const events = [ra, rb].map((r) => moneyFactEventFor(r.transitioned, "paid")).filter(Boolean);
  assert.deepEqual(events, ["payment.received"]);
  const actions = [ra, rb]
    .map((r) => recurringMembershipActionFor({ transitioned: r.transitioned, paymentStatus: "paid", membershipStatus: "payment_failed" }))
    .filter((x) => x !== "none");
  assert.deepEqual(actions, ["reactivate"]);
  const loser = ra.transitioned ? "b" : "a";
  assert.ok(db.log.includes(`${loser}:read`));
});

test("race waarbij de winnaar al gecommit is voor stap 1 van de ander: update op gelijke status raakt niets", async () => {
  const db = new FakePayments();
  const winner = await writePaymentWithTransition(db.steps({ id: "tr_s", status: "paid", label: "a" }));
  assert.equal(winner.transitioned, true);
  const loser = await writePaymentWithTransition(db.steps({ id: "tr_s", status: "paid", label: "b" }));
  assert.equal(loser.transitioned, false);
  assert.equal(loser.row?.status, "paid");
  assert.deepEqual(db.log.slice(2), ["b:transition", "b:insert", "b:read"]);
});
