import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDayOverlaps } from "../../src/lib/scheduling/day-overlap-layout.ts";

// fix/admin-rooster-overlapping-sessions: het admin-rooster legt overlappende
// lessen in lanen naast elkaar; de trainer-agenda gebruikt dezelfde functie
// zonder comparator en moet identiek blijven.

type S = { id: string; startOffsetMin: number; durationMin: number; status?: string };
const s = (id: string, start: number, dur: number, status = "scheduled"): S => ({
  id,
  startOffsetMin: start,
  durationMin: dur,
  status,
});
const byId = (r: ReturnType<typeof layoutDayOverlaps<S>>) =>
  Object.fromEntries(r.map((x) => [x.id, x]));

test("losse sessies: een laan, geen overlap", () => {
  const r = byId(layoutDayOverlaps([s("a", 0, 60), s("b", 60, 60)]));
  assert.equal(r.a.laneCount, 1);
  assert.equal(r.b.laneCount, 1);
  assert.equal(r.a.overlapping, false);
});

test("drie identieke sessies krijgen drie lanen", () => {
  const r = layoutDayOverlaps([s("a", 180, 60), s("b", 180, 60), s("c", 180, 60)]);
  assert.deepEqual(r.map((x) => x.lane).sort(), [0, 1, 2]);
  assert.ok(r.every((x) => x.laneCount === 3 && x.overlapping));
});

test("zonder comparator: laan volgt invoervolgorde bij gelijke start", () => {
  const r = byId(layoutDayOverlaps([s("x", 0, 60), s("a", 0, 60)]));
  assert.equal(r.x.lane, 0);
  assert.equal(r.a.lane, 1);
});

test("comparator: geplande vóór geannuleerde, id als tiebreaker", () => {
  const rank = (x: S) => (x.status === "cancelled" ? 1 : 0);
  const cmp = (a: S, b: S) => rank(a) - rank(b) || a.id.localeCompare(b.id);
  const input = [s("1-cancelled", 180, 60, "cancelled"), s("b", 180, 60), s("a", 180, 60)];
  const r = byId(layoutDayOverlaps(input, cmp));
  assert.equal(r.a.lane, 0);
  assert.equal(r.b.lane, 1);
  assert.equal(r["1-cancelled"].lane, 2);
  // Volgorde van de invoer verandert de uitkomst niet.
  const r2 = byId(layoutDayOverlaps([...input].reverse(), cmp));
  assert.deepEqual(
    Object.fromEntries(Object.entries(r2).map(([k, v]) => [k, v.lane])),
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.lane])),
  );
});

test("comparator: geen enkele laan bevat overlappende sessies", () => {
  const rank = (x: S) => (x.status === "cancelled" ? 1 : 0);
  const cmp = (a: S, b: S) => rank(a) - rank(b) || a.id.localeCompare(b.id);
  const r = layoutDayOverlaps(
    [s("c", 0, 120, "cancelled"), s("a", 30, 60), s("b", 60, 90), s("d", 150, 30)],
    cmp,
  );
  for (const x of r)
    for (const y of r) {
      if (x.id === y.id || x.lane !== y.lane) continue;
      const overlap =
        x.startOffsetMin < y.startOffsetMin + y.durationMin &&
        y.startOffsetMin < x.startOffsetMin + x.durationMin;
      assert.equal(overlap, false, `${x.id} en ${y.id} overlappen in laan ${x.lane}`);
    }
});
