import { test } from "node:test";
import assert from "node:assert/strict";
import {
  syncChargebackMirror,
  subscriptionWarningFor,
  pickActiveChargeback,
  pickReversedChargeback,
  centsFromMollieValue,
  type ChargebackDeps,
  type ChargebackEvent,
  type ChargebackLike,
  type ChargebackPaymentRow,
  type ChargebackPaymentView,
  type LinkedMembership,
  type PaymentFailedCause,
} from "../../src/lib/chargebacks/core.ts";

// Chargeback-spiegel (spec-facturatie.md 4.7, storno-tegenhanger): de pure
// kern met fakes, zonder Mollie of database.

interface Calls {
  mirror: Array<{ paymentRowId: string; previousCents: number; nextCents: number }>;
  fetch: string[];
  findMembership: number;
  setStatus: Array<{ membershipId: string; from: string; to: string }>;
  events: ChargebackEvent[];
  staff: Array<{ title: string; message: string }>;
  member: Array<{ profileId: string; amountCents: number; planLabel: string }>;
}

function makeDeps(opts: {
  chargebacks?: ChargebackLike[];
  membership?: LinkedMembership | null;
  cause?: PaymentFailedCause | null;
  mirrorResult?: boolean;
  fetchThrows?: boolean;
} = {}): { deps: ChargebackDeps; calls: Calls } {
  const calls: Calls = { mirror: [], fetch: [], findMembership: 0, setStatus: [], events: [], staff: [], member: [] };
  const deps: ChargebackDeps = {
    async mirror(args) {
      calls.mirror.push({ paymentRowId: args.paymentRowId, previousCents: args.previousCents, nextCents: args.nextCents });
      return opts.mirrorResult ?? true;
    },
    async fetchChargebacks(id) {
      calls.fetch.push(id);
      if (opts.fetchThrows) throw new Error("mollie down");
      return opts.chargebacks ?? [];
    },
    async findMembership() {
      calls.findMembership += 1;
      return opts.membership ?? null;
    },
    async setMembershipStatus(args) {
      calls.setStatus.push(args);
      return true;
    },
    async lastPaymentFailedCause() {
      return opts.cause ?? null;
    },
    async emit(event) {
      calls.events.push(event);
    },
    async notifyStaff(title, message) {
      calls.staff.push({ title, message });
    },
    async notifyMember(args) {
      calls.member.push(args);
    },
    now: () => new Date("2026-10-29T08:00:00Z"),
  };
  return { deps, calls };
}

const chb: ChargebackLike = {
  id: "chb_abc",
  amountCents: 7900,
  reasonCode: "MD06",
  reasonDescription: "Return of funds requested by end customer",
  createdAt: "2026-10-29T07:00:00Z",
  reversedAt: null,
};

function row(partial: Partial<ChargebackPaymentRow> = {}): ChargebackPaymentRow {
  return {
    id: "pay-row-1",
    molliePaymentId: "tr_rec1",
    amountCents: 7900,
    chargedBackAmountCents: 0,
    profileId: "prof-1",
    membershipId: "mem-1",
    orderId: null,
    ptBookingId: null,
    trialBookingId: null,
    kind: "recurring",
    description: "TMC order x",
    isTest: false,
    ...partial,
  };
}

const recurring: ChargebackPaymentView = {
  amountChargedBackCents: 7900,
  sequenceType: "recurring",
  subscriptionId: "sub_1",
  metadataType: "recurring",
};

const activeMembership: LinkedMembership = { id: "mem-1", status: "active", profileId: "prof-1", planVariant: "pt_unlimited" };

test("eerste chargeback op recurring: spiegel, events, lid en staf gemeld, membership naar payment_failed", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb], membership: activeMembership });
  const out = await syncChargebackMirror(deps, row(), recurring);
  assert.equal(out.outcome, "charged_back");
  assert.deepEqual(calls.mirror, [{ paymentRowId: "pay-row-1", previousCents: 0, nextCents: 7900 }]);
  assert.deepEqual(calls.setStatus, [{ membershipId: "mem-1", from: "active", to: "payment_failed" }]);
  assert.equal(calls.member.length, 1);
  assert.equal(calls.member[0].planLabel, "pt_unlimited");
  assert.equal(calls.staff.length, 1);
  assert.match(calls.staff[0].message, /MD06/);
  assert.match(calls.staff[0].message, /na drie storno's/);
  assert.deepEqual(
    calls.events.map((e) => e.type),
    ["payment.charged_back", "membership.payment_failed"],
  );
  const cb = calls.events[0];
  assert.equal(cb.subjectId, "pay-row-1");
  assert.equal(cb.payload.dedupe_key, "tr_rec1:chb_abc");
  assert.equal(cb.payload.chargeback_id, "chb_abc");
  assert.equal(cb.payload.reason_code, "MD06");
  assert.equal(cb.payload.amount_cents, 7900);
  assert.equal(cb.payload.previous_cents, 0);
  assert.equal(cb.payload.membership_id, "mem-1");
  assert.equal(cb.payload.sequence, "recurring");
  const mf = calls.events[1];
  assert.equal(mf.subjectId, "mem-1");
  assert.equal(mf.payload.reason, "chargeback");
  assert.equal(mf.payload.chargeback_id, "chb_abc");
  assert.equal(mf.payload.reason_code, "MD06");
});

test("herhaalde webhook zonder wijziging: geen schrijfactie, geen melding, geen event", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb], membership: activeMembership });
  const out = await syncChargebackMirror(deps, row({ chargedBackAmountCents: 7900 }), recurring);
  assert.equal(out.outcome, "unchanged");
  assert.equal(calls.mirror.length, 0);
  assert.equal(calls.fetch.length, 0);
  assert.equal(calls.events.length, 0);
  assert.equal(calls.staff.length, 0);
  assert.equal(calls.member.length, 0);
});

test("gewone webhook zonder chargeback: amountChargedBack 0 en spiegel 0 is een no-op", async () => {
  const { deps, calls } = makeDeps();
  const out = await syncChargebackMirror(deps, row(), { ...recurring, amountChargedBackCents: 0 });
  assert.equal(out.outcome, "unchanged");
  assert.equal(calls.fetch.length, 0);
});

test("verloren race: compare-and-swap raakt niets, dus geen bijwerkingen", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb], membership: activeMembership, mirrorResult: false });
  const out = await syncChargebackMirror(deps, row(), recurring);
  assert.equal(out.outcome, "lost_race");
  assert.equal(calls.events.length, 0);
  assert.equal(calls.staff.length, 0);
  assert.equal(calls.member.length, 0);
  assert.equal(calls.setStatus.length, 0);
});

test("reversal naar 0 na een storno die deze membership op payment_failed zette: terug naar active", async () => {
  const { deps, calls } = makeDeps({
    chargebacks: [{ ...chb, reversedAt: "2026-10-30T07:00:00Z" }],
    membership: { ...activeMembership, status: "payment_failed" },
    cause: { reason: "chargeback", chargebackId: "chb_abc", paymentId: "tr_rec1" },
  });
  const out = await syncChargebackMirror(
    deps,
    row({ chargedBackAmountCents: 7900 }),
    { ...recurring, amountChargedBackCents: 0 },
  );
  assert.equal(out.outcome, "reversed");
  if (out.outcome === "reversed") assert.equal(out.membershipReactivated, true);
  assert.deepEqual(calls.mirror, [{ paymentRowId: "pay-row-1", previousCents: 7900, nextCents: 0 }]);
  assert.deepEqual(calls.setStatus, [{ membershipId: "mem-1", from: "payment_failed", to: "active" }]);
  assert.deepEqual(
    calls.events.map((e) => e.type),
    ["payment.chargeback_reversed", "membership.reactivated"],
  );
  assert.equal(calls.events[0].payload.partial, false);
  assert.equal(calls.events[0].payload.previous_cents, 7900);
  assert.equal(calls.events[1].payload.reason, "chargeback_reversed");
  assert.equal(calls.events[1].payload.chargeback_id, "chb_abc");
  assert.equal(calls.member.length, 0, "geen ledenmail bij een reversal");
  assert.equal(calls.staff.length, 1);
  assert.match(calls.staff[0].title, /weer actief/);
});

test("reversal naar 0 terwijl payment_failed een andere oorzaak heeft: status blijft staan", async () => {
  const { deps, calls } = makeDeps({
    chargebacks: [{ ...chb, reversedAt: "2026-10-30T07:00:00Z" }],
    membership: { ...activeMembership, status: "payment_failed" },
    cause: { reason: "chargeback", chargebackId: "chb_other", paymentId: "tr_other" },
  });
  const out = await syncChargebackMirror(
    deps,
    row({ chargedBackAmountCents: 7900 }),
    { ...recurring, amountChargedBackCents: 0 },
  );
  assert.equal(out.outcome, "reversed");
  if (out.outcome === "reversed") assert.equal(out.membershipReactivated, false);
  assert.equal(calls.setStatus.length, 0);
  assert.deepEqual(calls.events.map((e) => e.type), ["payment.chargeback_reversed"]);
  assert.match(calls.staff[0].title, /blijft payment_failed/);
});

test("reversal: oorzaak zonder chargeback_id matcht op payment_id", async () => {
  const { deps, calls } = makeDeps({
    chargebacks: [],
    membership: { ...activeMembership, status: "payment_failed" },
    cause: { reason: "chargeback", chargebackId: null, paymentId: "tr_rec1" },
  });
  await syncChargebackMirror(deps, row({ chargedBackAmountCents: 7900 }), { ...recurring, amountChargedBackCents: 0 });
  assert.deepEqual(calls.setStatus, [{ membershipId: "mem-1", from: "payment_failed", to: "active" }]);
});

test("membership niet active (al payment_failed): spiegel, event en staf-ntfy, geen ledenmail of statuswissel", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb], membership: { ...activeMembership, status: "payment_failed" } });
  const out = await syncChargebackMirror(deps, row(), recurring);
  assert.equal(out.outcome, "charged_back");
  if (out.outcome === "charged_back") {
    assert.equal(out.membershipFlipped, false);
    assert.equal(out.memberNotified, false);
  }
  assert.equal(calls.setStatus.length, 0);
  assert.equal(calls.member.length, 0);
  assert.deepEqual(calls.events.map((e) => e.type), ["payment.charged_back"]);
  assert.equal(calls.staff.length, 1);
  assert.match(calls.staff[0].message, /staat op payment_failed/);
  assert.match(calls.staff[0].message, /MD06/);
});

test("membership gepauzeerd: zelfde pad, geen ledenmail", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb], membership: { ...activeMembership, status: "paused" } });
  await syncChargebackMirror(deps, row(), recurring);
  assert.equal(calls.setStatus.length, 0);
  assert.equal(calls.member.length, 0);
  assert.match(calls.staff[0].message, /staat op paused/);
});

test("eerste betaling van een abonnement (first + order): zelfde behandeling als recurring", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb], membership: activeMembership });
  const out = await syncChargebackMirror(
    deps,
    row({ molliePaymentId: "tr_first1", membershipId: null, orderId: "order-1", kind: null }),
    { amountChargedBackCents: 7900, sequenceType: "first", subscriptionId: null, metadataType: "order" },
  );
  assert.equal(out.outcome, "charged_back");
  assert.equal(calls.findMembership, 1);
  assert.deepEqual(calls.setStatus, [{ membershipId: "mem-1", from: "active", to: "payment_failed" }]);
  assert.equal(calls.member.length, 1);
  assert.deepEqual(calls.events.map((e) => e.type), ["payment.charged_back", "membership.payment_failed"]);
  assert.equal(calls.events[0].payload.order_id, "order-1");
  assert.equal(calls.events[0].payload.sequence, "first");
});

test("niet-recurring order (oneoff product): alleen spiegel, event en staf-ntfy", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [{ ...chb, reasonCode: null, reasonDescription: null }], membership: activeMembership });
  const out = await syncChargebackMirror(
    deps,
    row({ molliePaymentId: "tr_prod1", membershipId: "mem-credits", orderId: "order-2", kind: null, amountCents: 15000 }),
    { amountChargedBackCents: 15000, sequenceType: "oneoff", subscriptionId: null, metadataType: "order" },
  );
  assert.equal(out.outcome, "charged_back");
  assert.equal(calls.findMembership, 0, "geen membership-lookup voor een productbetaling");
  assert.equal(calls.setStatus.length, 0);
  assert.equal(calls.member.length, 0);
  assert.deepEqual(calls.events.map((e) => e.type), ["payment.charged_back"]);
  assert.equal(calls.staff.length, 1);
  assert.match(calls.staff[0].message, /Order order-2/);
  assert.match(calls.staff[0].message, /niet teruggedraaid/);
  assert.match(calls.staff[0].message, /reden onbekend/);
});

test("PT-boeking: staf-ntfy noemt de boeking", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb] });
  await syncChargebackMirror(
    deps,
    row({ molliePaymentId: "tr_pt1", membershipId: null, ptBookingId: "ptb-1", kind: null }),
    { amountChargedBackCents: 7900, sequenceType: "oneoff", subscriptionId: null, metadataType: "pt_booking" },
  );
  assert.match(calls.staff[0].message, /PT-boeking ptb-1 blijft geboekt/);
  assert.equal(calls.setStatus.length, 0);
});

test("proefles (trial booking): alleen spiegel, event en staf-ntfy", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb] });
  const out = await syncChargebackMirror(
    deps,
    row({ molliePaymentId: "tr_trial1", membershipId: null, trialBookingId: "trial-1", kind: "trial_booking", amountCents: 1700 }),
    { amountChargedBackCents: 1700, sequenceType: null, subscriptionId: null, metadataType: null },
  );
  assert.equal(out.outcome, "charged_back");
  assert.equal(calls.findMembership, 0);
  assert.equal(calls.member.length, 0);
  assert.deepEqual(calls.events.map((e) => e.type), ["payment.charged_back"]);
  assert.equal(calls.events[0].payload.trial_booking_id, "trial-1");
  assert.match(calls.staff[0].message, /Proefles-boeking trial-1 blijft staan/);
});

test("Mollie-chargebacklijst niet op te halen: spiegel en events gaan door met chargeback_id null", async () => {
  const { deps, calls } = makeDeps({ fetchThrows: true, membership: activeMembership });
  const out = await syncChargebackMirror(deps, row(), recurring);
  assert.equal(out.outcome, "charged_back");
  assert.equal(calls.events[0].payload.chargeback_id, null);
  assert.equal(calls.events[0].payload.dedupe_key, "tr_rec1:unknown");
  assert.equal(calls.setStatus.length, 1);
});

test("gedeeltelijke reversal: event met partial true, geen statuswijziging", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb], membership: { ...activeMembership, status: "payment_failed" } });
  const out = await syncChargebackMirror(deps, row({ chargedBackAmountCents: 7900 }), { ...recurring, amountChargedBackCents: 4000 });
  assert.equal(out.outcome, "partially_reversed");
  assert.equal(calls.events[0].payload.partial, true);
  assert.equal(calls.setStatus.length, 0);
  assert.equal(calls.findMembership, 0);
});

test("bedrag boven amount_cents wordt begrensd zodat de check-constraint nooit klapt", async () => {
  const { deps, calls } = makeDeps({ chargebacks: [chb], membership: activeMembership });
  await syncChargebackMirror(deps, row(), { ...recurring, amountChargedBackCents: 9999 });
  assert.equal(calls.mirror[0].nextCents, 7900);
});

test("subscriptionWarningFor: MD01 en MD06 waarschuwen voor annulering na drie keer, AC04 direct, iDEAL-storno niets", () => {
  assert.match(subscriptionWarningFor("MD06"), /na drie storno's/);
  assert.match(subscriptionWarningFor("md01"), /na drie storno's/);
  assert.match(subscriptionWarningFor("AC04"), /direct/);
  assert.equal(subscriptionWarningFor("XX99"), "");
  assert.equal(subscriptionWarningFor(null), "");
});

test("pickActiveChargeback kiest de nieuwste niet-teruggedraaide, pickReversedChargeback de nieuwste teruggedraaide", () => {
  const older: ChargebackLike = { ...chb, id: "chb_old", createdAt: "2026-09-01T00:00:00Z", reversedAt: "2026-09-05T00:00:00Z" };
  const newer: ChargebackLike = { ...chb, id: "chb_new", createdAt: "2026-10-01T00:00:00Z" };
  assert.equal(pickActiveChargeback([older, newer])?.id, "chb_new");
  assert.equal(pickReversedChargeback([older, newer])?.id, "chb_old");
  assert.equal(pickActiveChargeback([])?.id, undefined);
});

test("centsFromMollieValue: afwezig of negatief is 0", () => {
  assert.equal(centsFromMollieValue("79.00"), 7900);
  assert.equal(centsFromMollieValue(null), 0);
  assert.equal(centsFromMollieValue("-1.00"), 0);
});
