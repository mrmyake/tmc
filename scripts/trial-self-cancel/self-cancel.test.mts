import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCancelTokenFormat,
  isFreeAfterReschedule,
  isWithinCancelWindow,
  lateCancelWarning,
  selfCancelMessage,
} from "../../src/lib/trial-self-cancel.ts";

// Zelfservice-annulering proefles: de regels die de bezoeker te zien krijgt.
// De database beslist; deze tests borgen dat de weergave dezelfde grens
// hanteert als cancel_class_booking (inclusief) en de juiste tekst kiest.

const now = new Date("2026-10-01T10:00:00Z");

test("termijngrens is inclusief, net als bij leden", () => {
  assert.equal(isWithinCancelWindow(new Date("2026-10-01T16:00:00Z"), 6, now), true);
  assert.equal(isWithinCancelWindow(new Date("2026-10-01T15:59:59Z"), 6, now), false);
  assert.equal(isWithinCancelWindow(new Date("2026-10-02T10:00:00Z"), 6, now), true);
  assert.equal(isWithinCancelWindow(new Date("2026-10-01T09:00:00Z"), 6, now), false);
});

test("termijn volgt de ingestelde uren, niet een vast getal", () => {
  const start = new Date("2026-10-01T14:00:00Z");
  assert.equal(isWithinCancelWindow(start, 4, now), true);
  assert.equal(isWithinCancelWindow(start, 6, now), false);
});

test("tokenformaat: alleen een uuid", () => {
  assert.equal(isCancelTokenFormat("2d8f1d7d-b7cc-46c3-bc30-c6b921e5e824"), true);
  assert.equal(isCancelTokenFormat("onzin"), false);
  assert.equal(isCancelTokenFormat(""), false);
  assert.equal(isCancelTokenFormat("2d8f1d7d-b7cc-46c3-bc30-c6b921e5e824x"), false);
});

test("betaald binnen de termijn: terugbetaling zonder termijn", () => {
  const msg = selfCancelMessage({ withinWindow: true, pricePaidCents: 1700, refundRequested: true, codeStillUsable: false, windowHours: 6 });
  assert.match(msg, /volledig terug/);
  assert.doesNotMatch(msg, /dagen|werkdag|binnen \d+ dag/);
});

test("betaald na de termijn: geen terugbetaling, uren uit de instelling", () => {
  const msg = selfCancelMessage({ withinWindow: false, pricePaidCents: 1700, refundRequested: false, codeStillUsable: false, windowHours: 8 });
  assert.match(msg, /niet terug/);
  assert.match(msg, /8 uur/);
});

test("codeboeking: code weer bruikbaar, ook na de termijn", () => {
  for (const withinWindow of [true, false]) {
    const msg = selfCancelMessage({ withinWindow, pricePaidCents: 0, refundRequested: false, codeStillUsable: true, windowHours: 6 });
    assert.match(msg, /code is weer te gebruiken/);
  }
});

test("waarschuwing vooraf alleen bij betaald na de termijn", () => {
  assert.equal(lateCancelWarning({ withinWindow: true, pricePaidCents: 1700, windowHours: 6 }), null);
  assert.equal(lateCancelWarning({ withinWindow: false, pricePaidCents: 0, windowHours: 6 }), null);
  const w = lateCancelWarning({ withinWindow: false, pricePaidCents: 1700, windowHours: 6 });
  assert.ok(w && /6 uur/.test(w) && /niet terug/.test(w));
});

test("kosteloos na verschuiving: alleen boekingen van voor de verschuiving, tot de start", () => {
  const start = new Date("2026-10-01T12:00:00Z"); // binnen de termijn van 6 uur
  const rescheduledAt = new Date("2026-10-01T08:00:00Z");
  assert.equal(isWithinCancelWindow(start, 6, now), false);
  // Geboekt voor de verschuiving: kosteloos.
  assert.equal(isFreeAfterReschedule({ bookedAt: new Date("2026-09-30T10:00:00Z"), rescheduledAt, startAt: start, now }), true);
  // Geboekt na de verschuiving: normaal venster.
  assert.equal(isFreeAfterReschedule({ bookedAt: new Date("2026-10-01T09:00:00Z"), rescheduledAt, startAt: start, now }), false);
  // Niet verschoven: normaal venster.
  assert.equal(isFreeAfterReschedule({ bookedAt: new Date("2026-09-30T10:00:00Z"), rescheduledAt: null, startAt: start, now }), false);
  // Les al begonnen: niet meer kosteloos.
  assert.equal(isFreeAfterReschedule({ bookedAt: new Date("2026-09-30T10:00:00Z"), rescheduledAt, startAt: new Date("2026-10-01T09:59:00Z"), now }), false);
});
