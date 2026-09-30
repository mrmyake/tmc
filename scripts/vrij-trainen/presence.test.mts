import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amsterdamWeekdayAndMinutes,
  formatPresenceWindows,
  isSlotInPresence,
  presenceForWeekday,
  type PresenceWindow,
} from "../../src/lib/presence.ts";

// Aanwezigheid van Marlon voor proefuren vrij trainen (PR 2): pure logica die
// tmc.vrij_trainen_trainer_present spiegelt, in Amsterdamse tijd, met zomer- en
// wintertijd rond 25 oktober 2026 (einde zomertijd).

const SEED: PresenceWindow[] = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, from: "07:00", to: "12:00" },
  { weekday, from: "17:00", to: "21:00" },
]);

/** Epoch-ms van een Amsterdamse wandkloktijd, zonder afhankelijkheid van de machinezone. */
function amsterdamMs(ymd: string, hhmm: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  for (const offsetH of [1, 2]) {
    const ms = Date.UTC(y, m - 1, d, hh - offsetH, mm);
    const back = amsterdamWeekdayAndMinutes(ms);
    if (back.minutes === hh * 60 + mm) return ms;
  }
  throw new Error(`geen geldige Amsterdamse tijd: ${ymd} ${hhmm}`);
}

function present(ymd: string, hhmm: string, minutes = 60): boolean {
  return isSlotInPresence(SEED, amsterdamMs(ymd, hhmm), minutes);
}

test("weekdag en minuut in Amsterdamse tijd, 0 = zondag", () => {
  assert.deepEqual(amsterdamWeekdayAndMinutes(amsterdamMs("2026-10-26", "07:00")), { weekday: 1, minutes: 420 });
  assert.deepEqual(amsterdamWeekdayAndMinutes(amsterdamMs("2026-10-25", "09:30")), { weekday: 0, minutes: 570 });
  // 22:30 UTC op zaterdag is zondag 00:30 lokaal.
  assert.equal(amsterdamWeekdayAndMinutes(Date.parse("2026-10-24T22:30:00Z")).weekday, 0);
});

for (const day of ["2026-10-23", "2026-10-26"]) {
  const label = day === "2026-10-23" ? "vrijdag 23 oktober (zomertijd)" : "maandag 26 oktober (wintertijd)";

  test(`${label}: het ochtendvenster 07:00 tot 12:00, laatste start 11:00`, () => {
    assert.equal(present(day, "06:45"), false);
    assert.equal(present(day, "07:00"), true);
    assert.equal(present(day, "10:00"), true);
    assert.equal(present(day, "11:00"), true);
    assert.equal(present(day, "11:15"), false);
    assert.equal(present(day, "12:00"), false);
  });

  test(`${label}: het avondvenster 17:00 tot 21:00, laatste start 20:00`, () => {
    assert.equal(present(day, "16:45"), false);
    assert.equal(present(day, "17:00"), true);
    assert.equal(present(day, "19:00"), true);
    assert.equal(present(day, "20:00"), true);
    assert.equal(present(day, "20:15"), false);
    assert.equal(present(day, "21:00"), false);
  });

  test(`${label}: het uur is precies 60 minuten, een uur dat over het blokeinde loopt telt niet`, () => {
    assert.equal(present(day, "11:00", 60), true);
    assert.equal(present(day, "11:00", 75), false);
    assert.equal(present(day, "11:30", 30), true);
    assert.equal(present(day, "11:45", 30), false);
  });
}

test("het weekend heeft nooit aanwezigheid", () => {
  assert.equal(present("2026-10-24", "09:00"), false); // zaterdag
  assert.equal(present("2026-10-25", "09:00"), false); // zondag, dag van de tijdwissel
});

test("een uur rond middernacht valt nooit in een venster", () => {
  assert.equal(isSlotInPresence(SEED, amsterdamMs("2026-10-26", "23:45"), 60), false);
});

test("aanwezigheid blijft lokaal gelijk over de tijdwissel: 07:00 is 05:00 UTC in zomertijd en 06:00 UTC in wintertijd", () => {
  assert.equal(isSlotInPresence(SEED, Date.parse("2026-10-23T05:00:00Z"), 60), true);
  assert.equal(isSlotInPresence(SEED, Date.parse("2026-10-23T04:00:00Z"), 60), false);
  assert.equal(isSlotInPresence(SEED, Date.parse("2026-10-26T06:00:00Z"), 60), true);
  assert.equal(isSlotInPresence(SEED, Date.parse("2026-10-26T05:00:00Z"), 60), false);
});

test("presenceForWeekday geeft de vensters van die dag gesorteerd, leeg in het weekend", () => {
  assert.deepEqual(presenceForWeekday(SEED, 1), {
    weekdays: [1],
    windows: [
      { from: "07:00", to: "12:00" },
      { from: "17:00", to: "21:00" },
    ],
  });
  assert.deepEqual(presenceForWeekday(SEED, 6), { weekdays: [], windows: [] });
});

test("formatPresenceWindows: samengenomen dagen en vensters", () => {
  assert.equal(formatPresenceWindows(SEED), "ma t/m vr 07:00 tot 12:00 en 17:00 tot 21:00");
  assert.equal(formatPresenceWindows([]), "");
  assert.equal(
    formatPresenceWindows([
      { weekday: 1, from: "09:00", to: "12:00" },
      { weekday: 3, from: "09:00", to: "12:00" },
      { weekday: 6, from: "08:00", to: "10:00" },
    ]),
    "ma, wo 09:00 tot 12:00; za 08:00 tot 10:00",
  );
  assert.equal(
    formatPresenceWindows([
      { weekday: 1, from: "09:00", to: "12:00" },
      { weekday: 2, from: "09:00", to: "12:00" },
    ]),
    "ma en di 09:00 tot 12:00",
  );
});
