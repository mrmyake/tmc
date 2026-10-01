import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancellationReasonForMollieStatus,
  decideTrialExpiry,
  trialExpiryDeadline,
  tripsCircuitBreaker,
  TRIAL_EXPIRY_FALLBACK_MS,
  TRIAL_EXPIRY_MARGIN_MS,
} from "../../src/lib/trial-expiry.ts";

// Vervalregels voor pending proeflessen: de beslissing die de cron
// /api/cron/expire-trial-bookings per rij neemt, zonder Mollie of database.

const bookedAt = "2026-10-01T19:38:54.000Z";
const expiresAt = "2026-10-01T19:53:54.000Z";

test("Mollie-eindstatus geeft de passende reden", () => {
  assert.equal(cancellationReasonForMollieStatus("expired"), "payment_expired");
  assert.equal(cancellationReasonForMollieStatus("failed"), "payment_failed");
  assert.equal(cancellationReasonForMollieStatus("canceled"), "payment_canceled");
  assert.equal(cancellationReasonForMollieStatus("open"), null);
  assert.equal(cancellationReasonForMollieStatus("pending"), null);
  assert.equal(cancellationReasonForMollieStatus("paid"), null);
});

test("vervaltijd is expiresAt plus marge, anders booked_at plus terugval", () => {
  assert.equal(
    trialExpiryDeadline(bookedAt, expiresAt).getTime(),
    Date.parse(expiresAt) + TRIAL_EXPIRY_MARGIN_MS,
  );
  assert.equal(
    trialExpiryDeadline(bookedAt, null).getTime(),
    Date.parse(bookedAt) + TRIAL_EXPIRY_FALLBACK_MS,
  );
  assert.equal(
    trialExpiryDeadline(bookedAt, "geen datum").getTime(),
    Date.parse(bookedAt) + TRIAL_EXPIRY_FALLBACK_MS,
  );
});

test("paid bij Mollie wordt alsnog bevestigd", () => {
  const d = decideTrialExpiry({
    bookedAt,
    payment: { found: true, status: "paid", expiresAt: null },
    hasPaymentRow: false,
    now: new Date("2026-10-01T19:40:00Z"),
  });
  assert.deepEqual(d, { action: "mark_paid" });
});

test("expired, failed en canceled annuleren direct, ook binnen de vervaltijd", () => {
  const now = new Date("2026-10-01T19:40:00Z");
  for (const [status, reason] of [
    ["expired", "payment_expired"],
    ["failed", "payment_failed"],
    ["canceled", "payment_canceled"],
  ] as const) {
    const d = decideTrialExpiry({
      bookedAt,
      payment: { found: true, status, expiresAt },
      hasPaymentRow: true,
      now,
    });
    assert.deepEqual(d, { action: "cancel", reason, detail: "mollie_status" });
  }
});

test("nog open binnen expiresAt plus marge blijft staan", () => {
  const d = decideTrialExpiry({
    bookedAt,
    payment: { found: true, status: "open", expiresAt },
    hasPaymentRow: false,
    now: new Date(Date.parse(expiresAt) + TRIAL_EXPIRY_MARGIN_MS),
  });
  assert.deepEqual(d, { action: "leave", detail: "open_within_window" });
});

test("nog open voorbij expiresAt plus marge vervalt als payment_expired", () => {
  const d = decideTrialExpiry({
    bookedAt,
    payment: { found: true, status: "open", expiresAt },
    hasPaymentRow: false,
    now: new Date(Date.parse(expiresAt) + TRIAL_EXPIRY_MARGIN_MS + 1000),
  });
  assert.deepEqual(d, {
    action: "cancel",
    reason: "payment_expired",
    detail: "open_past_expiry",
  });
});

test("open zonder expiresAt gebruikt de terugval van 45 minuten", () => {
  const payment = { found: true as const, status: "open", expiresAt: null };
  const inside = decideTrialExpiry({
    bookedAt,
    payment,
    hasPaymentRow: false,
    now: new Date(Date.parse(bookedAt) + TRIAL_EXPIRY_FALLBACK_MS),
  });
  assert.equal(inside.action, "leave");
  const past = decideTrialExpiry({
    bookedAt,
    payment,
    hasPaymentRow: false,
    now: new Date(Date.parse(bookedAt) + TRIAL_EXPIRY_FALLBACK_MS + 1),
  });
  assert.equal(past.action, "cancel");
});

test("onbekend bij Mollie: binnen de terugval laten staan", () => {
  const d = decideTrialExpiry({
    bookedAt,
    payment: { found: false },
    hasPaymentRow: false,
    now: new Date(Date.parse(bookedAt) + 10 * 60_000),
  });
  assert.deepEqual(d, { action: "leave", detail: "not_found_within_window" });
});

test("onbekend bij Mollie na de terugval zonder payments-rij vervalt als payment_expired", () => {
  const d = decideTrialExpiry({
    bookedAt: "2026-09-29T12:57:03.505Z",
    payment: { found: false },
    hasPaymentRow: false,
    now: new Date("2026-10-02T04:45:00Z"),
  });
  assert.deepEqual(d, {
    action: "cancel",
    reason: "payment_expired",
    detail: "payment_not_found",
  });
});

test("onbekend bij Mollie met een payments-rij blijft staan", () => {
  const d = decideTrialExpiry({
    bookedAt: "2026-09-29T12:57:03.505Z",
    payment: { found: false },
    hasPaymentRow: true,
    now: new Date("2026-10-02T04:45:00Z"),
  });
  assert.deepEqual(d, { action: "leave", detail: "not_found_with_payment_row" });
});

test("circuit breaker: meer dan drie 404's breekt de run af", () => {
  assert.equal(tripsCircuitBreaker(0), false);
  assert.equal(tripsCircuitBreaker(3), false);
  assert.equal(tripsCircuitBreaker(4), true);
});
