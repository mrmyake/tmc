import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingInstructionText } from "../../src/lib/member/booking-instruction.ts";
import {
  formatRelativeWhen,
  formatWeekdayDate,
  formatWeekdayDateHeading,
} from "../../src/lib/format-date.ts";

test("vrij trainen: alleen de annuleerregel, geen groepsinstructie", () => {
  const text = bookingInstructionText("vrij_trainen");
  assert.equal(text, "Annuleren kan tot twee uur van tevoren via de app.");
  assert.ok(!text.includes("tien minuten"));
});

test("groepslessen en begeleide sessies: volledige instructie met ontspan", () => {
  for (const pillar of ["yoga_mobility", "kettlebell", "pt", null, undefined]) {
    const text = bookingInstructionText(pillar);
    assert.match(text, /kleed je om en ontspan\./);
    assert.match(text, /zes uur van tevoren/);
    assert.ok(!text.includes("ademt"));
  }
});

const NOW = new Date("2026-10-05T10:00:00Z"); // maandag 5 oktober, Amsterdam

test("dag-label: hoofdletter standaard, kleine letter inline", () => {
  const tomorrow = new Date("2026-10-06T06:15:00Z"); // 08:15 Amsterdam
  assert.equal(formatRelativeWhen(tomorrow, NOW), "Morgen \u00b7 08:15");
  assert.equal(
    formatRelativeWhen(tomorrow, NOW, { inline: true }),
    "morgen \u00b7 08:15",
  );
  const later = new Date("2026-10-08T06:15:00Z");
  assert.equal(formatRelativeWhen(later, NOW), "Donderdag \u00b7 08:15");
  assert.equal(
    formatRelativeWhen(later, NOW, { inline: true }),
    "donderdag \u00b7 08:15",
  );
});

test("datumvorm: klein midden in zin, hoofdletter als kop", () => {
  const d = new Date("2026-10-06T10:00:00Z");
  assert.equal(formatWeekdayDate(d), "dinsdag 6 oktober");
  assert.equal(formatWeekdayDateHeading(d), "Dinsdag 6 oktober");
});
