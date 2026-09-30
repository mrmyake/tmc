/**
 * Wachtlijst, pure regels (spec-community-growth.md, sectie Wachtlijst):
 *   - confirmDeadlineLabel: "voor HH:MM" in Amsterdamse tijd, "voor morgen
 *     HH:MM" als de deadline op een andere Amsterdamse dag valt;
 *   - memberSessionStatus: boeking gaat voor open promotie gaat voor
 *     wachtlijst;
 *   - canBook(): een volle les geeft pas "vol, wachtlijst" als de overige
 *     checks slagen, zodat de prefilter dezelfde reden toont als
 *     tmc.join_waitlist zou geven.
 * De deadline-berekening zelf (rustvenster, plafond op start - 5 minuten)
 * leeft in tmc.waitlist_confirmation_deadline en wordt getest in
 * waitlist.db.test.mts tegen de lokale stack.
 * Run: npm run test:waitlist
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmDeadlineLabel,
  memberSessionStatus,
} from "../../src/lib/member/waitlist";
import {
  canBook,
  type CanBookMembership,
  type CanBookProfile,
  type CanBookSession,
  type CanBookSettings,
  type CanBookUsage,
} from "../../src/lib/member/can-book";

// 5 oktober 2026, zomertijd: 14:00 Amsterdam = 12:00 UTC.
const NOW = new Date("2026-10-05T12:00:00Z");

test("confirmDeadlineLabel: zelfde dag geeft 'voor HH:MM' in Amsterdamse tijd", () => {
  assert.equal(confirmDeadlineLabel(new Date("2026-10-05T12:30:00Z"), NOW), "voor 14:30");
  assert.equal(confirmDeadlineLabel(new Date("2026-10-05T16:25:00Z"), NOW), "voor 18:25");
});

test("confirmDeadlineLabel: andere Amsterdamse dag geeft 'voor morgen HH:MM'", () => {
  // 23:30 Amsterdam op 5 oktober, deadline 07:30 Amsterdam op 6 oktober.
  const lateEvening = new Date("2026-10-05T21:30:00Z");
  assert.equal(confirmDeadlineLabel(new Date("2026-10-06T05:30:00Z"), lateEvening), "voor morgen 07:30");
  // 00:30 Amsterdam op 6 oktober (22:30 UTC de 5e): zelfde Amsterdamse dag als 07:30.
  const afterMidnight = new Date("2026-10-05T22:30:00Z");
  assert.equal(confirmDeadlineLabel(new Date("2026-10-06T05:30:00Z"), afterMidnight), "voor 07:30");
});

test("memberSessionStatus: boeking > promotie > wachtlijst > niets", () => {
  assert.equal(memberSessionStatus({ hasBooking: true, waitlist: { state: "promoted" } }), "booked");
  assert.equal(memberSessionStatus({ hasBooking: false, waitlist: { state: "promoted" } }), "promoted");
  assert.equal(memberSessionStatus({ hasBooking: false, waitlist: { state: "waiting" } }), "waitlisted");
  assert.equal(memberSessionStatus({ hasBooking: false, waitlist: null }), null);
  assert.equal(memberSessionStatus({ hasBooking: false, waitlist: undefined }), null);
});

// --- canBook op een volle les -----------------------------------------------

const session: CanBookSession = {
  id: "s1",
  start_at: "2026-10-07T16:00:00Z",
  status: "scheduled",
  pillar: "yoga_mobility",
  age_category: "adult",
  capacity: 6,
};
const profile: CanBookProfile = {
  age_category: "adult",
  active_strikes: 0,
  strikes_block_until: null,
};
const allInclusive: CanBookMembership = {
  id: "m1",
  plan_type: "all_inclusive",
  frequency_cap: null,
  credits_remaining: null,
};
const settings: CanBookSettings = {
  booking_window_days: 14,
  fair_use_daily_max: 2,
  no_show_strike_threshold: 3,
  no_show_block_days: 7,
  checkInEnabledForPillar: false,
};
const usageFull: CanBookUsage = {
  takenCountThisSession: 6,
  bookingsSameDay: 0,
  bookingsSamePillarThisWeek: 0,
  checkInsSamePillarThisWeek: 0,
};

function run(over: {
  memberships?: CanBookMembership[];
  usage?: Partial<CanBookUsage>;
  profile?: Partial<CanBookProfile>;
  settings?: Partial<CanBookSettings>;
  acknowledgeOverCap?: boolean;
}) {
  return canBook({
    session,
    profile: { ...profile, ...over.profile },
    memberships: over.memberships ?? [allInclusive],
    usage: { ...usageFull, ...over.usage },
    settings: { ...settings, ...over.settings },
    now: NOW,
    acknowledgeOverCap: over.acknowledgeOverCap,
  });
}

test("canBook: vol en alle overige checks in orde geeft capacity_full met wachtlijstoptie", () => {
  const r = run({});
  assert.equal(r.allowed, false);
  if (!r.allowed) {
    assert.equal(r.reason, "capacity_full");
    assert.equal(r.canJoinWaitlist, true);
  }
});

test("canBook: vol zonder dekking geeft no_coverage, niet capacity_full", () => {
  const r = run({ memberships: [] });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "no_coverage");
});

test("canBook: vol met strike-blokkade geeft strike_blocked", () => {
  const r = run({ profile: { active_strikes: 3, strikes_block_until: "2026-10-09T00:00:00Z" } });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "strike_blocked");
});

test("canBook: vol met daglimiet bereikt geeft daily_cap_reached", () => {
  const r = run({ usage: { bookingsSameDay: 2 } });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "daily_cap_reached");
});

test("canBook: vol met harde weekcap bereikt geeft weekly_cap_reached", () => {
  const r = run({
    memberships: [{ ...allInclusive, plan_type: "yoga_mobility", frequency_cap: 2 }],
    usage: { bookingsSamePillarThisWeek: 2 },
  });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "weekly_cap_reached");
});

test("canBook: vol met zachte weekcap over geeft capacity_full zonder bevestigdialoog", () => {
  const r = run({
    memberships: [{ ...allInclusive, plan_type: "yoga_mobility", frequency_cap: 2 }],
    usage: { bookingsSamePillarThisWeek: 2 },
    settings: { checkInEnabledForPillar: true },
  });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "capacity_full");
});

test("canBook: vol met geldige rittenkaart geeft capacity_full", () => {
  const r = run({
    memberships: [{ id: "m2", plan_type: "ten_ride_card", frequency_cap: null, credits_remaining: 3 }],
  });
  assert.equal(r.allowed, false);
  if (!r.allowed) {
    assert.equal(r.reason, "capacity_full");
    assert.equal(r.canJoinWaitlist, true);
  }
});

test("canBook: niet vol blijft gewoon boekbaar", () => {
  const r = run({ usage: { takenCountThisSession: 5 } });
  assert.equal(r.allowed, true);
});

test("canBook: capaciteit null is nooit vol", () => {
  const r = canBook({
    session: { ...session, capacity: null },
    profile,
    memberships: [allInclusive],
    usage: { ...usageFull, takenCountThisSession: 40 },
    settings,
    now: NOW,
  });
  assert.equal(r.allowed, true);
});
