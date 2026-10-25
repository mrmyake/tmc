/**
 * Extra les bijkopen (spec-weekcap-extra-les.md): pure regels uit
 * src/lib/extra-class/core.ts. De houdtijd van de pending rij, de vertaling
 * van Mollie-statussen en de beslissing van de cron.
 * Run: npm run test:extra-class
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideHoldExpiry,
  euroLabel,
  euroShort,
  extraClassDescription,
  outcomeForMollieStatus,
  vatSplit,
} from "../../src/lib/extra-class/core";

const T0 = "2026-10-26T18:00:00Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000);

test("outcomeForMollieStatus: paid en de drie eindstatussen, de rest null", () => {
  assert.equal(outcomeForMollieStatus("paid"), "paid");
  assert.equal(outcomeForMollieStatus("failed"), "failed");
  assert.equal(outcomeForMollieStatus("expired"), "expired");
  assert.equal(outcomeForMollieStatus("canceled"), "canceled");
  assert.equal(outcomeForMollieStatus("open"), null);
  assert.equal(outcomeForMollieStatus("pending"), null);
  assert.equal(outcomeForMollieStatus("authorized"), null);
});

test("decideHoldExpiry: Mollie paid wint altijd, ook na de houdtijd", () => {
  const d = decideHoldExpiry({ bookedAt: T0, holdExpiresAt: at(20).toISOString(), hasPaymentId: true, mollieStatus: "paid", now: at(60) });
  assert.deepEqual(d, { action: "confirm" });
});

test("decideHoldExpiry: Mollie failed of expired geeft direct vrij", () => {
  const d = decideHoldExpiry({ bookedAt: T0, holdExpiresAt: at(20).toISOString(), hasPaymentId: true, mollieStatus: "failed", now: at(2) });
  assert.deepEqual(d, { action: "release", outcome: "failed", detail: "mollie_status" });
});

test("decideHoldExpiry: open binnen de houdtijd blijft staan", () => {
  const d = decideHoldExpiry({ bookedAt: T0, holdExpiresAt: at(20).toISOString(), hasPaymentId: true, mollieStatus: "open", now: at(19) });
  assert.deepEqual(d, { action: "leave", detail: "open_within_hold" });
});

test("decideHoldExpiry: open voorbij de houdtijd geeft vrij (late betaling via de webhook)", () => {
  const d = decideHoldExpiry({ bookedAt: T0, holdExpiresAt: at(20).toISOString(), hasPaymentId: true, mollieStatus: "open", now: at(21) });
  assert.deepEqual(d, { action: "release", outcome: "expired", detail: "hold_expired" });
});

test("decideHoldExpiry: Mollie onbereikbaar: binnen de houdtijd wachten, daarna vrijgeven", () => {
  const within = decideHoldExpiry({ bookedAt: T0, holdExpiresAt: at(20).toISOString(), hasPaymentId: true, mollieStatus: null, now: at(10) });
  assert.deepEqual(within, { action: "leave", detail: "payment_unknown" });
  const after = decideHoldExpiry({ bookedAt: T0, holdExpiresAt: at(20).toISOString(), hasPaymentId: true, mollieStatus: null, now: at(25) });
  assert.deepEqual(after, { action: "release", outcome: "expired", detail: "hold_expired" });
});

test("decideHoldExpiry: zonder hold_expires_at geldt booked_at plus 20 minuten", () => {
  const d = decideHoldExpiry({ bookedAt: T0, holdExpiresAt: null, hasPaymentId: true, mollieStatus: "open", now: at(21) });
  assert.equal(d.action, "release");
});

test("decideHoldExpiry: zonder payment-id na vijf minuten vrijgeven", () => {
  const soon = decideHoldExpiry({ bookedAt: T0, holdExpiresAt: at(20).toISOString(), hasPaymentId: false, mollieStatus: null, now: at(4) });
  assert.deepEqual(soon, { action: "leave", detail: "orphan_within_grace" });
  const late = decideHoldExpiry({ bookedAt: T0, holdExpiresAt: at(20).toISOString(), hasPaymentId: false, mollieStatus: null, now: at(6) });
  assert.deepEqual(late, { action: "release", outcome: "expired", detail: "orphan" });
});

test("vatSplit: bruto leidend, 9 procent over 15 euro is 124 cent", () => {
  assert.deepEqual(vatSplit(1500, 900), { vatCents: 124, netCents: 1376 });
  assert.deepEqual(vatSplit(1500, null), { vatCents: null, netCents: null });
});

test("euro: label en korte vorm", () => {
  assert.equal(euroLabel(1500), "15,00 euro");
  assert.equal(euroShort(1500), "€15");
  assert.equal(euroShort(1499), "€14,99");
});

test("extraClassDescription: Amsterdamse tijd, korte weekdag en maand", () => {
  const d = extraClassDescription("Kettlebell Power", new Date("2026-10-26T18:00:00Z"));
  assert.match(d, /^Extra les: Kettlebell Power, ma 26 okt 19:00$/);
});
