import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPENING_MAX_PER_SESSION,
  OPENING_REASON_MESSAGE,
  isOpeningPeriodActive,
  openingReasonMessage,
  openingSpotsLeft,
  openingStepForReason,
  trialSourceLabel,
} from "../../src/lib/opening-trial/rules.ts";

// Gratis proefles in de openingsperiode: de pure regels die de pagina's
// gebruiken. De database beslist (tmc.book_opening_trial); deze tests borgen
// dat de weergave dezelfde grenzen hanteert (periode inclusief einde, quotum
// van 4) en dat elke weigering een tekst heeft.

const period = { startAt: "2026-10-11T07:00:00Z", endAt: "2026-11-22T22:59:59Z" };

test("periode: actief tussen start en einde, inclusief het einde", () => {
  assert.equal(isOpeningPeriodActive(period, new Date("2026-10-11T07:00:00Z")), true);
  assert.equal(isOpeningPeriodActive(period, new Date("2026-11-01T12:00:00Z")), true);
  assert.equal(isOpeningPeriodActive(period, new Date("2026-11-22T22:59:59Z")), true);
  assert.equal(isOpeningPeriodActive(period, new Date("2026-11-22T23:00:00Z")), false);
  assert.equal(isOpeningPeriodActive(period, new Date("2026-10-11T06:59:59Z")), false);
});

test("periode: zonder start of einde nooit actief", () => {
  assert.equal(isOpeningPeriodActive(null, new Date("2026-11-01T12:00:00Z")), false);
  assert.equal(isOpeningPeriodActive({ startAt: null, endAt: period.endAt }), false);
  assert.equal(isOpeningPeriodActive({ startAt: period.startAt, endAt: null }), false);
  assert.equal(isOpeningPeriodActive({ startAt: "onzin", endAt: period.endAt }), false);
});

test("einddatum 22 november 2026 23:59 Amsterdam is 22:59 UTC (wintertijd)", () => {
  const endAmsterdam = new Date("2026-11-22T23:59:59+01:00");
  assert.equal(endAmsterdam.toISOString(), "2026-11-22T22:59:59.000Z");
  assert.equal(isOpeningPeriodActive(period, endAmsterdam), true);
  assert.equal(isOpeningPeriodActive(period, new Date(endAmsterdam.getTime() + 1000)), false);
});

test("gratis plekken: het kleinste van capaciteit en quotum, nooit negatief", () => {
  assert.equal(OPENING_MAX_PER_SESSION, 4);
  assert.equal(openingSpotsLeft(10, 0), 4);
  assert.equal(openingSpotsLeft(10, 3), 1);
  assert.equal(openingSpotsLeft(10, 4), 0);
  assert.equal(openingSpotsLeft(10, 7), 0);
  assert.equal(openingSpotsLeft(2, 0), 2);
  assert.equal(openingSpotsLeft(0, 0), 0);
  assert.equal(openingSpotsLeft(-1, 0), 0);
  // Onbeperkte capaciteit (null): alleen het quotum telt.
  assert.equal(openingSpotsLeft(null, 1), 3);
});

test("elke weigering van de RPC heeft een tekst zonder URL", () => {
  const reasons = [
    "missing_fields", "invalid_phone", "invalid_email", "period_closed",
    "already_customer", "already_used", "email_already_booked",
    "session_not_found", "session_not_scheduled", "session_in_past",
    "session_not_trial_eligible", "trial_quota_full", "capacity_full",
    "slot_required", "slot_invalid", "slot_in_past", "slot_outside_session",
    "outside_presence", "slot_blocked", "slot_full", "slot_not_allowed",
  ];
  for (const r of reasons) {
    assert.ok(OPENING_REASON_MESSAGE[r], `tekst voor ${r}`);
    assert.doesNotMatch(OPENING_REASON_MESSAGE[r], /https?:\/\//);
  }
  assert.equal(openingReasonMessage("iets_onbekends"), openingReasonMessage(undefined));
});

test("stap na weigering: periode, persoon, sessie of invoer", () => {
  assert.equal(openingStepForReason("period_closed"), "period");
  assert.equal(openingStepForReason("already_used"), "person");
  assert.equal(openingStepForReason("already_customer"), "person");
  assert.equal(openingStepForReason("trial_quota_full"), "session");
  assert.equal(openingStepForReason("slot_full"), "session");
  assert.equal(openingStepForReason("capacity_full"), "session");
  assert.equal(openingStepForReason("invalid_phone"), undefined);
  assert.equal(openingStepForReason(undefined), undefined);
});

test("label op de deelnemerslijsten en de kiosk per bron", () => {
  assert.equal(trialSourceLabel({ source: "opening", status: "paid" }), "Proefles, gratis");
  assert.equal(trialSourceLabel({ source: "opening", status: "no_show" }), "Proefles, gratis");
  assert.equal(trialSourceLabel({ source: "code", status: "attended" }), "Proefles via code");
  assert.equal(trialSourceLabel({ source: "paid", status: "paid" }), "Proefles");
  assert.equal(trialSourceLabel({ source: "paid", status: "paid", priceLabel: "17,00 euro" }), "Proefles 17,00 euro");
  assert.equal(trialSourceLabel({ source: "paid", status: "pending" }), "Proefles, wacht op betaling");
});
