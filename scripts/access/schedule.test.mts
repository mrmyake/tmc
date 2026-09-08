/**
 * Weekdag-mapping en tijd-naar-seconden voor de Akiles-schedules, met de
 * live openingstijden (2026-09-07): ma t/m vr 07:00-21:00, za 08:00-14:00,
 * zo gesloten. Run: npm run test:access
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildClosedWeekdays,
  buildExtendedWeekdays,
  buildStaffWeekdays,
  buildStandardWeekdays,
  timeToSeconds,
  tmcWeekdayToAkilesIndex,
  weekdaysEqual,
  type OpeningHoursRow,
} from "../../src/lib/access/schedule";
import { EXTENDED_ACCESS_WINDOW } from "../../src/lib/access/constants";

const LIVE_OPENING_HOURS: OpeningHoursRow[] = [
  { weekday: 0, is_closed: true, opens_at: null, closes_at: null },
  { weekday: 1, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 2, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 3, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 4, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 5, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 6, is_closed: false, opens_at: "08:00:00", closes_at: "14:00:00" },
];

test("tmc weekday (0 = zondag) naar Akiles index (0 = maandag)", () => {
  assert.equal(tmcWeekdayToAkilesIndex(0), 6, "zondag");
  assert.equal(tmcWeekdayToAkilesIndex(1), 0, "maandag");
  assert.equal(tmcWeekdayToAkilesIndex(2), 1, "dinsdag");
  assert.equal(tmcWeekdayToAkilesIndex(5), 4, "vrijdag");
  assert.equal(tmcWeekdayToAkilesIndex(6), 5, "zaterdag");
  assert.throws(() => tmcWeekdayToAkilesIndex(7));
  assert.throws(() => tmcWeekdayToAkilesIndex(-1));
  assert.throws(() => tmcWeekdayToAkilesIndex(1.5));
});

test("tijd naar seconden vanaf middernacht", () => {
  assert.equal(timeToSeconds("00:00"), 0);
  assert.equal(timeToSeconds("07:00"), 25_200);
  assert.equal(timeToSeconds("07:00:00"), 25_200);
  assert.equal(timeToSeconds("21:00:00"), 75_600);
  assert.equal(timeToSeconds("08:00"), 28_800);
  assert.equal(timeToSeconds("14:00"), 50_400);
  assert.equal(timeToSeconds("06:00"), 21_600);
  assert.equal(timeToSeconds("23:00"), 82_800);
  assert.equal(timeToSeconds("23:59:59"), 86_399);
  assert.equal(timeToSeconds("24:00"), 86_400);
  assert.throws(() => timeToSeconds("24:01"), /buiten de dag/);
  assert.throws(() => timeToSeconds("7:00"), /Ongeldige tijd/);
  assert.throws(() => timeToSeconds("07:60"), /Ongeldige tijd/);
});

test("standaardschedule uit de live openingstijden", () => {
  const week = buildStandardWeekdays(LIVE_OPENING_HOURS);
  assert.equal(week.length, 7);
  for (let i = 0; i <= 4; i++) {
    assert.deepEqual(week[i].ranges, [{ start: 25_200, end: 75_600 }], `index ${i}`);
  }
  assert.deepEqual(week[5].ranges, [{ start: 28_800, end: 50_400 }], "zaterdag");
  assert.deepEqual(week[6].ranges, [], "zondag gesloten");
});

test("standaardschedule: ontbrekende dag telt als gesloten, volgorde maakt niet uit", () => {
  const shuffled = [...LIVE_OPENING_HOURS].reverse().filter((r) => r.weekday !== 3);
  const week = buildStandardWeekdays(shuffled);
  assert.deepEqual(week[2].ranges, [], "woensdag ontbreekt, dus dicht");
  assert.deepEqual(week[0].ranges, [{ start: 25_200, end: 75_600 }]);
  assert.deepEqual(week[6].ranges, []);
});

test("standaardschedule weigert sluiting voor of op de openingstijd", () => {
  assert.throws(() =>
    buildStandardWeekdays([
      { weekday: 1, is_closed: false, opens_at: "21:00", closes_at: "07:00" },
    ]),
  );
});

test("verlengde toegang: venster uit constants.ts, alle zeven dagen", () => {
  const week = buildExtendedWeekdays();
  const expected = {
    start: timeToSeconds(EXTENDED_ACCESS_WINDOW.opensAt),
    end: timeToSeconds(EXTENDED_ACCESS_WINDOW.closesAt),
  };
  assert.deepEqual(expected, { start: 21_600, end: 82_800 });
  assert.equal(week.length, 7);
  for (const day of week) assert.deepEqual(day.ranges, [expected]);
});

test("gesloten en staf", () => {
  const closed = buildClosedWeekdays();
  assert.equal(closed.length, 7);
  for (const day of closed) assert.deepEqual(day.ranges, []);

  const staff = buildStaffWeekdays();
  assert.equal(staff.length, 7);
  for (const day of staff) assert.deepEqual(day.ranges, [{ start: 0, end: 86_400 }]);
});

test("weekdaysEqual is structureel", () => {
  assert.ok(weekdaysEqual(buildStandardWeekdays(LIVE_OPENING_HOURS), buildStandardWeekdays(LIVE_OPENING_HOURS)));
  assert.ok(!weekdaysEqual(buildStandardWeekdays(LIVE_OPENING_HOURS), buildExtendedWeekdays()));
  assert.ok(!weekdaysEqual(buildClosedWeekdays(), buildStaffWeekdays()));
});
