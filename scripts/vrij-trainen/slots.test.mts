/**
 * Slotkiezer vrij trainen (src/lib/member/vrij-trainen-slots.ts): toestand per
 * kwartier, "past niet", voorbij, gekozen slot, herinneringsregel,
 * uurgroepering en de wintertijdwissel.
 * Run: npm run test:vrij-trainen
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amsterdamClock,
  durationLabel,
  groupByHour,
  isStartBookable,
  nextFreeStart,
  quarterCells,
  quarterLabel,
  reminderWillBeSent,
  slotQuarterStarts,
  trainerPresentInHour,
  type QuarterAvailability,
} from "../../src/lib/member/vrij-trainen-slots";

const Q = 15 * 60_000;

/** Kwartieren vanaf een UTC-start; `over` overschrijft per index. */
function day(
  startIso: string,
  count: number,
  over: Record<number, Partial<QuarterAvailability>> = {},
): QuarterAvailability[] {
  const start = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) => ({
    quarterStart: new Date(start + i * Q).toISOString(),
    booked: 0,
    available: 5,
    blocked: false,
    ...over[i],
  }));
}

// 1 oktober 2026, zomertijd: 07:00 Amsterdam = 05:00 UTC.
const START = "2026-10-01T05:00:00.000Z";
const BEFORE = Date.parse(START) - 60 * 60_000;

test("vrij, weinig vrij, vol en les per kwartier", () => {
  const cells = quarterCells(
    day(START, 8, { 1: { available: 2, booked: 3 }, 2: { available: 0, booked: 5 }, 3: { available: 0, blocked: true } }),
    30,
    BEFORE,
  );
  assert.equal(cells[0].state, "open"); // 30 min = 07:00 en 07:15 (2 vrij), past
  assert.equal(cells[1].state, "no_fit"); // 07:15 en 07:30 (vol)
  assert.equal(cells[2].state, "full");
  assert.equal(cells[3].state, "blocked");
  assert.equal(cells[4].state, "open");
  assert.equal(quarterLabel(cells[3]), "les");
  assert.equal(quarterLabel(cells[2]), "vol");
});

test("weinig vrij kleurt champagne en blijft boekbaar", () => {
  const cells = quarterCells(day(START, 4, { 0: { available: 2 }, 1: { available: 1 } }), 30, BEFORE);
  assert.equal(cells[0].state, "few");
  assert.equal(cells[0].bookable, true);
  assert.equal(quarterLabel(cells[0]), "2 vrij");
  assert.equal(cells[2].state, "open");
  assert.equal(quarterLabel(cells[2]), "5 vrij");
});

test("past niet: later kwartier vol, les of buiten de sessie", () => {
  const cells = quarterCells(day(START, 6, { 3: { available: 0 } }), 60, BEFORE);
  // 60 min vanaf 07:00 raakt 07:45 (vol); vanaf 07:15 ook; vanaf 07:30 ook.
  assert.deepEqual(cells.map((c) => c.state), ["no_fit", "no_fit", "no_fit", "full", "no_fit", "no_fit"]);
  // Laatste twee: 08:00 en 08:15 met 60 min lopen buiten de sessie (6 kwartieren).
});

test("half-open: een slot dat eindigt waar een les begint past", () => {
  const cells = quarterCells(day(START, 8, { 4: { blocked: true, available: 0 } }), 60, BEFORE);
  assert.equal(cells[0].bookable, true); // 07:00-08:00, les vanaf 08:00
  assert.equal(cells[1].state, "no_fit"); // 07:15-08:15 raakt de les
});

test("voorbij op tijdstip, ook voor een kwartier dat nu loopt", () => {
  const now = Date.parse(START) + 20 * 60_000; // 07:20
  const cells = quarterCells(day(START, 8), 30, now);
  assert.equal(cells[0].state, "past"); // 07:00
  assert.equal(cells[1].state, "past"); // 07:15 (loopt)
  assert.equal(cells[2].state, "open"); // 07:30
  assert.equal(quarterLabel(cells[1]), "voorbij");
});

test("gekozen start vervalt als de nieuwe duur niet meer past", () => {
  const quarters = day(START, 8, { 4: { available: 0 } });
  assert.equal(isStartBookable(quarters, quarters[0].quarterStart, 60, BEFORE), true);
  assert.equal(isStartBookable(quarters, quarters[0].quarterStart, 75, BEFORE), false);
});

test("kwartieren van een slot", () => {
  assert.deepEqual(
    slotQuarterStarts(START, 45),
    [0, 1, 2].map((i) => Date.parse(START) + i * Q),
  );
});

test("herinneringsregel alleen bij meer dan 25 uur vooruit", () => {
  const now = Date.parse(START);
  assert.equal(reminderWillBeSent(new Date(now + 26 * 3_600_000).toISOString(), now), true);
  assert.equal(reminderWillBeSent(new Date(now + 25 * 3_600_000).toISOString(), now), false);
  assert.equal(reminderWillBeSent(new Date(now + 2 * 3_600_000).toISOString(), now), false);
});

test("uurgroepering in Amsterdamse tijd met lege plekken", () => {
  // Start 07:30 lokaal: het eerste uur heeft twee lege plekken.
  const rows = groupByHour(quarterCells(day("2026-10-01T05:30:00.000Z", 6), 30, BEFORE));
  assert.equal(rows[0].hourLabel, "07:00");
  assert.equal(rows[0].cells[0], null);
  assert.equal(rows[0].cells[1], null);
  assert.equal(amsterdamClock(rows[0].cells[2]!.startMs), "07:30");
  assert.equal(rows[1].hourLabel, "08:00");
  assert.equal(rows.length, 2);
});

test("wintertijdwissel: 28 kwartieren voor 00:00-06:00 lokaal, 02:00 twee keer", () => {
  // 25 oktober 2026: 00:00 CEST = 24 okt 22:00 UTC, 06:00 CET = 25 okt 05:00 UTC.
  const quarters = day("2026-10-24T22:00:00.000Z", 28);
  const cells = quarterCells(quarters, 90, Date.parse("2026-10-24T21:00:00.000Z"));
  assert.equal(cells.length, 28);
  const rows = groupByHour(cells);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map((r) => r.hourLabel), ["00:00", "01:00", "02:00", "02:00", "03:00", "04:00", "05:00"]);
  // Een slot van 90 minuten over de wissel heen is gewoon 6 kwartieren.
  assert.equal(slotQuarterStarts("2026-10-25T00:30:00.000Z", 90).length, 6);
  assert.equal(cells.at(-6)!.bookable, true); // 04:30 CET + 90 min = 06:00
  assert.equal(cells.at(-5)!.state, "no_fit");
});

test("aanwezigheid trainer per heel uur", () => {
  const presence = { weekdays: [1, 2, 3, 4, 5], windows: [{ from: "07:00", to: "12:00" }, { from: "17:00", to: "21:00" }] };
  assert.equal(trainerPresentInHour(1, 7, presence), true);
  assert.equal(trainerPresentInHour(1, 11, presence), true);
  assert.equal(trainerPresentInHour(1, 12, presence), false);
  assert.equal(trainerPresentInHour(5, 20, presence), true);
  assert.equal(trainerPresentInHour(6, 9, presence), false);
  assert.equal(trainerPresentInHour(0, 9, presence), false);
});

test("duurlabels", () => {
  assert.deepEqual([30, 45, 60, 75, 90].map(durationLabel), ["30 min", "45 min", "1 uur", "1 uur 15", "1,5 uur"]);
});

test("nextFreeStart: eerst een uur, anders een half uur, anders niets", () => {
  // Uur past vanaf het eerste kwartier.
  assert.deepEqual(nextFreeStart(day(START, 8, { 0: { available: 3 } }), BEFORE), {
    startMs: Date.parse(START),
    available: 3,
  });
  // Kwartier 1 is vol: een uur past nergens, een half uur pas vanaf 07:30.
  const short = day(START, 5, { 1: { available: 0, booked: 5 } });
  assert.equal(quarterCells(short, 60, BEFORE).some((c) => c.bookable), false);
  assert.deepEqual(nextFreeStart(short, BEFORE), { startMs: Date.parse(START) + 2 * Q, available: 5 });
  // Alles vol of voorbij: geen kaartje.
  assert.equal(nextFreeStart(day(START, 8, { 0: { available: 0 }, 1: { available: 0 }, 2: { available: 0 }, 3: { available: 0 }, 4: { available: 0 }, 5: { available: 0 }, 6: { available: 0 }, 7: { available: 0 } }), BEFORE), null);
  assert.equal(nextFreeStart(day(START, 8), Date.parse(START) + 24 * 60 * 60_000), null);
  assert.equal(nextFreeStart([], BEFORE), null);
});
