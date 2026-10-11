/**
 * Contract van src/lib/attendance/trial-core.ts: de ene schrijfkern voor de
 * aanwezigheid van proefgasten, gedeeld door de sessie-detailpagina's
 * (markTrialAttendance) en de kiosk (kioskMarkTrialAttendance). Zonder
 * database, met de fake uit scripts/_helpers/fake-admin.mts. Dekt testplan k
 * op kernniveau: afvinken en terugdraaien, no-show en herstel na afsluiting,
 * autoMarkTrialNoShows raakt alleen niet-afgevinkte (paid) rijen, en de
 * weigeringen (pending, geannuleerd, andere sessie).
 * Run: npm run test:opening-trial
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EmitEventInput } from "../../src/lib/events/emit";
import { chainArg, fakeAdmin, type Call } from "../_helpers/fake-admin";
import {
  autoMarkTrialNoShowsCore,
  markTrialAttendanceCore,
} from "../../src/lib/attendance/trial-core";

const ACTOR = { userId: "staff-1", role: "trainer" as const };
const SESSION = "s-1";

function world(rows: Array<{ id: string; session_id: string; status: string }>) {
  const events: EmitEventInput[] = [];
  const state = new Map(rows.map((r) => [r.id, { ...r }]));
  const { client, calls } = fakeAdmin((call: Call) => {
    if (call.table !== "trial_bookings") return undefined;
    if (call.op === "select") {
      const inArgs = chainArg(call, "in");
      const eqSession = call.chain.find(([m, a]) => m === "eq" && a[0] === "session_id")?.[1][1];
      const eqStatus = call.chain.find(([m, a]) => m === "eq" && a[0] === "status")?.[1][1];
      let list = [...state.values()];
      if (inArgs && inArgs[0] === "id") list = list.filter((r) => (inArgs[1] as string[]).includes(r.id));
      if (eqSession) list = list.filter((r) => r.session_id === eqSession);
      if (eqStatus) list = list.filter((r) => r.status === eqStatus);
      return { data: list.map((r) => ({ ...r })), error: null };
    }
    if (call.op === "update") {
      const patch = chainArg(call, "update")?.[0] as { status: string };
      const id = call.chain.find(([m, a]) => m === "eq" && a[0] === "id")?.[1][1] as string;
      const allowed = call.chain.find(([m, a]) => m === "in" && a[0] === "status")?.[1][1] as string[];
      const row = state.get(id);
      if (!row || !allowed.includes(row.status)) return { data: [], error: null };
      row.status = patch.status;
      return { data: [{ id }], error: null };
    }
    return undefined;
  });
  const deps = {
    admin: client,
    emit: async (e: EmitEventInput) => {
      events.push(e);
      return true;
    },
  };
  return { deps, events, state, calls };
}

test("afvinken: paid naar attended met event, en terug met attendance_reverted", async () => {
  const w = world([{ id: "t1", session_id: SESSION, status: "paid" }]);
  const r1 = await markTrialAttendanceCore(w.deps, ACTOR, SESSION, [{ trialBookingId: "t1", status: "attended" }], "kiosk");
  assert.equal(r1.ok, true);
  assert.equal(w.state.get("t1")?.status, "attended");
  assert.equal(w.events[0]?.type, "trial_booking.attended");
  assert.equal((w.events[0]?.payload as { source: string }).source, "kiosk");
  const r2 = await markTrialAttendanceCore(w.deps, ACTOR, SESSION, [{ trialBookingId: "t1", status: "paid" }]);
  assert.equal(r2.ok, true);
  assert.equal(w.state.get("t1")?.status, "paid");
  assert.equal(w.events[1]?.type, "trial_booking.attendance_reverted");
});

test("no-show markeren en na afsluiting alsnog op aanwezig zetten", async () => {
  const w = world([{ id: "t1", session_id: SESSION, status: "paid" }]);
  const r1 = await markTrialAttendanceCore(w.deps, ACTOR, SESSION, [{ trialBookingId: "t1", status: "no_show" }]);
  assert.equal(r1.ok, true);
  assert.equal(w.state.get("t1")?.status, "no_show");
  assert.equal(w.events[0]?.type, "trial_booking.no_show_marked");
  const r2 = await markTrialAttendanceCore(w.deps, ACTOR, SESSION, [{ trialBookingId: "t1", status: "attended" }]);
  assert.equal(r2.ok, true);
  assert.equal(w.state.get("t1")?.status, "attended");
  assert.equal((w.events[1]?.payload as { previous_status: string }).previous_status, "no_show");
});

test("autoMarkTrialNoShows raakt alleen niet-afgevinkte proefgasten", async () => {
  const w = world([
    { id: "t1", session_id: SESSION, status: "paid" },
    { id: "t2", session_id: SESSION, status: "attended" },
    { id: "t3", session_id: SESSION, status: "cancelled" },
    { id: "t4", session_id: "andere", status: "paid" },
  ]);
  const res = await autoMarkTrialNoShowsCore(w.deps, ACTOR, SESSION);
  assert.deepEqual(res, { ok: true, count: 1 });
  assert.equal(w.state.get("t1")?.status, "no_show");
  assert.equal(w.state.get("t2")?.status, "attended");
  assert.equal(w.state.get("t3")?.status, "cancelled");
  assert.equal(w.state.get("t4")?.status, "paid");
  assert.equal(w.events.length, 1);
  assert.equal((w.events[0]?.payload as { source: string }).source, "auto");
});

test("weigeringen: pending, geannuleerd, andere sessie, onbekend", async () => {
  const w = world([
    { id: "p", session_id: SESSION, status: "pending" },
    { id: "c", session_id: SESSION, status: "cancelled" },
    { id: "o", session_id: "andere", status: "paid" },
  ]);
  const rp = await markTrialAttendanceCore(w.deps, ACTOR, SESSION, [{ trialBookingId: "p", status: "attended" }]);
  assert.equal(rp.ok, false);
  const rc = await markTrialAttendanceCore(w.deps, ACTOR, SESSION, [{ trialBookingId: "c", status: "attended" }]);
  assert.equal(rc.ok, false);
  const ro = await markTrialAttendanceCore(w.deps, ACTOR, SESSION, [{ trialBookingId: "o", status: "attended" }]);
  assert.equal(ro.ok, false);
  const rx = await markTrialAttendanceCore(w.deps, ACTOR, SESSION, [{ trialBookingId: "x", status: "attended" }]);
  assert.equal(rx.ok, false);
  assert.equal(w.events.length, 0);
});

test("gelijktijdige annulering wint: geen update, duidelijke melding", async () => {
  const w = world([{ id: "t1", session_id: SESSION, status: "paid" }]);
  // Tussen lezen en schrijven annuleert de webhook de rij.
  const original = w.deps.admin.from.bind(w.deps.admin);
  let reads = 0;
  w.deps.admin.from = ((table: string) => {
    if (table === "trial_bookings" && reads++ === 0) {
      const b = original(table);
      // Na de eerste read: rij geannuleerd.
      queueMicrotask(() => {
        w.state.get("t1")!.status = "cancelled";
      });
      return b;
    }
    return original(table);
  }) as typeof w.deps.admin.from;
  const r = await markTrialAttendanceCore(w.deps, ACTOR, SESSION, [{ trialBookingId: "t1", status: "attended" }]);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.message, /geannuleerd/);
  assert.equal(w.state.get("t1")?.status, "cancelled");
});
