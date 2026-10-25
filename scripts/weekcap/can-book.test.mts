/**
 * Harde weekcap per abonnement (spec-weekcap-extra-les.md, PR A), pure
 * regels in TS die tmc.booking_gate spiegelen:
 *   - cappedPillars(): welke pillars samen onder de cap vallen;
 *   - canBook(): de weekcap telt over die pillars, een sessie buiten de
 *     capped pillars heeft geen cap, check-ins tellen niet, en de volgorde
 *     ten opzichte van capaciteit (wachtlijst) blijft die van de gate.
 * De databasekant staat in scripts/test-weekcap-db.sh tegen de lokale stack.
 * Run: npm run test:weekcap
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cappedPillars } from "../../src/lib/member/plan-coverage";
import {
  canBook,
  cappedPillarsFor,
  weeklyUsage,
  REASON_COPY,
  WEEKLY_CAP_REACHED_COPY,
  type CanBookMembership,
  type CanBookProfile,
  type CanBookSession,
  type CanBookSettings,
  type CanBookUsage,
} from "../../src/lib/member/can-book";

// 5 oktober 2026, 12:00 UTC; de sessies staan op woensdag 7 oktober.
const NOW = new Date("2026-10-05T12:00:00Z");

// --- cappedPillars ----------------------------------------------------------

test("cappedPillars: All Access capt alleen de groepslessen, vrij trainen valt erbuiten", () => {
  assert.deepEqual(
    cappedPillars(["vrij_trainen", "yoga_mobility", "kettlebell"]),
    ["kettlebell", "yoga_mobility"],
  );
});

test("cappedPillars: groepslessen capt beide groepspillars samen", () => {
  assert.deepEqual(cappedPillars(["yoga_mobility", "kettlebell"]), ["kettlebell", "yoga_mobility"]);
});

test("cappedPillars: Vrij Trainen houdt zijn eigen cap", () => {
  assert.deepEqual(cappedPillars(["vrij_trainen"]), ["vrij_trainen"]);
});

test("cappedPillars: kids blijft kids, leeg en null blijven leeg", () => {
  assert.deepEqual(cappedPillars(["kids"]), ["kids"]);
  assert.deepEqual(cappedPillars([]), []);
  assert.deepEqual(cappedPillars(null), []);
  assert.deepEqual(cappedPillars(undefined), []);
});

test("cappedPillarsFor: zonder covered_pillars valt de cap terug op de pillar van de sessie", () => {
  assert.deepEqual(cappedPillarsFor({ covered_pillars: [] }, "yoga_mobility"), ["yoga_mobility"]);
});

test("weeklyUsage: telt alleen de capped pillars op", () => {
  assert.equal(
    weeklyUsage({ yoga_mobility: 1, kettlebell: 1, vrij_trainen: 3 }, ["kettlebell", "yoga_mobility"]),
    2,
  );
  assert.equal(weeklyUsage({}, ["vrij_trainen"]), 0);
});

// --- canBook ----------------------------------------------------------------

const yoga: CanBookSession = {
  id: "s-yoga",
  start_at: "2026-10-07T16:00:00Z",
  status: "scheduled",
  pillar: "yoga_mobility",
  age_category: "adult",
  capacity: 6,
};
const kettlebell: CanBookSession = { ...yoga, id: "s-kb", pillar: "kettlebell", capacity: null };
const vrij: CanBookSession = {
  ...yoga,
  id: "s-vrij",
  pillar: "vrij_trainen",
  capacity: null,
  start_at: "2026-10-07T05:00:00Z",
  slot_start_at: "2026-10-07T16:00:00Z",
};
const profile: CanBookProfile = {
  age_category: "adult",
  active_strikes: 0,
  strikes_block_until: null,
};
const settings: CanBookSettings = {
  booking_window_days: 28,
  fair_use_daily_max: 2,
  no_show_strike_threshold: 3,
  no_show_block_days: 7,
  extraClassPriceCents: 1500,
};
const usageOpen: CanBookUsage = {
  takenCountThisSession: 0,
  bookingsSameDay: 0,
  bookingsThisWeekByPillar: {},
};

const groepslessen2x: CanBookMembership = {
  id: "m-g2",
  plan_type: "groepslessen",
  frequency_cap: 2,
  covered_pillars: ["yoga_mobility", "kettlebell"],
  credits_remaining: null,
};
const groepslessenUnl: CanBookMembership = { ...groepslessen2x, id: "m-gu", frequency_cap: null };
const allAccess2x: CanBookMembership = {
  id: "m-a2",
  plan_type: "all_inclusive",
  frequency_cap: 2,
  covered_pillars: ["vrij_trainen", "yoga_mobility", "kettlebell"],
  credits_remaining: null,
};
const vrijTrainen2x: CanBookMembership = {
  id: "m-v2",
  plan_type: "vrij_trainen",
  frequency_cap: 2,
  covered_pillars: ["vrij_trainen"],
  credits_remaining: null,
};
const tenRideCard: CanBookMembership = {
  id: "m-trc",
  plan_type: "ten_ride_card",
  frequency_cap: null,
  covered_pillars: [],
  credits_remaining: 7,
};

function run(
  session: CanBookSession,
  memberships: CanBookMembership[],
  usage: Partial<CanBookUsage> = {},
) {
  return canBook({
    session,
    profile,
    memberships,
    usage: { ...usageOpen, ...usage },
    settings,
    now: NOW,
  });
}

function reasonOf(r: ReturnType<typeof canBook>): string {
  return r.allowed ? "allowed" : r.reason;
}

test("Groepslessen 2x: een yoga en een kettlebell in dezelfde week lukt, de derde groepsles niet", () => {
  assert.equal(reasonOf(run(yoga, [groepslessen2x], { bookingsThisWeekByPillar: { kettlebell: 1 } })), "allowed");
  assert.equal(
    reasonOf(run(yoga, [groepslessen2x], { bookingsThisWeekByPillar: { kettlebell: 1, yoga_mobility: 1 } })),
    "weekly_cap_reached",
  );
  assert.equal(
    reasonOf(run(kettlebell, [groepslessen2x], { bookingsThisWeekByPillar: { yoga_mobility: 2 } })),
    "weekly_cap_reached",
  );
});

test("Groepslessen 2x: de telling is per ISO-week, een andere week begint op nul", () => {
  // De aanroeper levert de telling van de week van de sessie; een lege
  // telling (volgende week) is gewoon boekbaar.
  assert.equal(reasonOf(run(yoga, [groepslessen2x], { bookingsThisWeekByPillar: {} })), "allowed");
});

test("All Access 2x: na twee groepslessen is vrij trainen nog gewoon mogelijk", () => {
  const week = { yoga_mobility: 1, kettlebell: 1 };
  assert.equal(reasonOf(run(yoga, [allAccess2x], { bookingsThisWeekByPillar: week })), "weekly_cap_reached");
  assert.equal(reasonOf(run(vrij, [allAccess2x], { bookingsThisWeekByPillar: week })), "allowed");
});

test("All Access 2x: vrij trainen telt niet mee voor de groepslessen", () => {
  assert.equal(
    reasonOf(run(yoga, [allAccess2x], { bookingsThisWeekByPillar: { vrij_trainen: 4, kettlebell: 1 } })),
    "allowed",
  );
});

test("Vrij Trainen 2x: de derde vrij-trainen-sessie in dezelfde week wordt geweigerd", () => {
  assert.equal(reasonOf(run(vrij, [vrijTrainen2x], { bookingsThisWeekByPillar: { vrij_trainen: 1 } })), "allowed");
  assert.equal(
    reasonOf(run(vrij, [vrijTrainen2x], { bookingsThisWeekByPillar: { vrij_trainen: 2 } })),
    "weekly_cap_reached",
  );
});

test("Vrij Trainen 2x: een groepsles is geen dekking, geen cap-vraag", () => {
  assert.equal(reasonOf(run(yoga, [vrijTrainen2x])), "no_coverage");
});

test("Groepslessen Onbeperkt en rittenkaart: geen cap", () => {
  const veel = { yoga_mobility: 5, kettlebell: 5 };
  assert.equal(reasonOf(run(yoga, [groepslessenUnl], { bookingsThisWeekByPillar: veel })), "allowed");
  const r = run(yoga, [tenRideCard], { bookingsThisWeekByPillar: veel });
  assert.equal(reasonOf(r), "allowed");
  if (r.allowed) assert.equal(r.coveringMembership?.id, "m-trc");
});

test("Volle les boven de cap: weekly_cap_reached, geen wachtlijstoptie (zelfde volgorde als de gate)", () => {
  const r = run(yoga, [groepslessen2x], {
    takenCountThisSession: 6,
    bookingsThisWeekByPillar: { yoga_mobility: 2 },
  });
  assert.equal(reasonOf(r), "weekly_cap_reached");
  if (!r.allowed) assert.equal(r.canJoinWaitlist, undefined);
});

test("Volle les onder de cap: capacity_full met wachtlijstoptie", () => {
  const r = run(yoga, [groepslessen2x], {
    takenCountThisSession: 6,
    bookingsThisWeekByPillar: { yoga_mobility: 1 },
  });
  assert.equal(reasonOf(r), "capacity_full");
  if (!r.allowed) assert.equal(r.canJoinWaitlist, true);
});

test("Dagcap gaat voor de weekcap, zoals in de gate", () => {
  assert.equal(
    reasonOf(run(yoga, [groepslessen2x], { bookingsSameDay: 2, bookingsThisWeekByPillar: { yoga_mobility: 2 } })),
    "daily_cap_reached",
  );
});

test("Copy: weekly_cap_reached is 'Je weektegoed is op.'", () => {
  assert.equal(REASON_COPY.weekly_cap_reached, WEEKLY_CAP_REACHED_COPY);
  assert.equal(WEEKLY_CAP_REACHED_COPY, "Je weektegoed is op.");
});

// --- Extra les bijkopen (spec-weekcap-extra-les.md, PR B) ---------------------

test("extra les: weekly_cap_reached draagt het aanbod met de serverprijs", () => {
  const r = run(yoga, [groepslessen2x], { bookingsThisWeekByPillar: { yoga_mobility: 2 } });
  assert.equal(reasonOf(r), "weekly_cap_reached");
  if (!r.allowed) assert.deepEqual(r.extraClass, { available: true, priceCents: 1500 });
});

test("extra les: no_coverage met actief abonnement draagt het aanbod", () => {
  const r = run(yoga, [vrijTrainen2x]);
  assert.equal(reasonOf(r), "no_coverage");
  if (!r.allowed) assert.deepEqual(r.extraClass, { available: true, priceCents: 1500 });
});

test("extra les: zonder abonnement (alleen rittenkaart of niets) geen aanbod", () => {
  const r1 = run(vrij, [tenRideCard]);
  assert.equal(reasonOf(r1), "no_coverage");
  if (!r1.allowed) assert.deepEqual(r1.extraClass, { available: false, priceCents: null });
  const r2 = run(yoga, []);
  if (!r2.allowed) assert.deepEqual(r2.extraClass, { available: false, priceCents: null });
});

test("extra les: zonder prijs (kids of senior zonder actieve rittenkaart) geen aanbod", () => {
  const r = canBook({
    session: yoga,
    profile,
    memberships: [groepslessen2x],
    usage: { ...usageOpen, bookingsThisWeekByPillar: { kettlebell: 2 } },
    settings: { ...settings, extraClassPriceCents: null },
    now: NOW,
  });
  assert.equal(reasonOf(r), "weekly_cap_reached");
  if (!r.allowed) assert.deepEqual(r.extraClass, { available: false, priceCents: null });
});

test("extra les: andere weigeringen dragen geen aanbod", () => {
  const r = run(yoga, [groepslessen2x], { bookingsSameDay: 2 });
  assert.equal(reasonOf(r), "daily_cap_reached");
  if (!r.allowed) assert.equal(r.extraClass, undefined);
});
