/**
 * Contract van src/lib/attendance/core.ts (check-in-spoor PR 1): één
 * schrijfkern voor aanwezigheid, zonder database, met de gedeelde fake uit
 * scripts/_helpers/fake-admin.mts. Dekt aanwezig en terugdraaien voor
 * abonnement en rittenkaart, strikes, elk van de vijf gelijkgetrokken
 * verschillen, idempotentie, de weigeringen, en dat de drie aanroepers
 * (deelnemerslijst, admin-override, tablet) dezelfde kern gebruiken.
 * Run: npm run test:attendance
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EmitEventInput } from "../../src/lib/events/emit";
import { chainArg, eqValue, fakeAdmin, type Call } from "../_helpers/fake-admin";
import {
  accessTypeForBooking,
  setMemberAttendance,
  type AttendanceDeps,
  type SetMemberAttendanceInput,
} from "../../src/lib/attendance/core";

const ACTOR = { userId: "staff-1", actorType: "trainer" as const };
const SESSION = "s-1";

interface World {
  booking: {
    id: string;
    session_id: string;
    profile_id: string;
    status: string;
    credits_used: number;
    membership_id: string | null;
    attended_at: string | null;
    no_show_at: string | null;
  } | null;
  session: { id: string; pillar: string } | null;
  checkIn: { id: string; booking_id: string | null } | null;
  strike: { id: string } | null;
}

function membershipWorld(over: Partial<World> = {}): World {
  return {
    booking: {
      id: "b-1",
      session_id: SESSION,
      profile_id: "p-1",
      status: "booked",
      credits_used: 0,
      membership_id: "m-1",
      attended_at: null,
      no_show_at: null,
    },
    session: { id: SESSION, pillar: "yoga_mobility" },
    checkIn: null,
    strike: null,
    ...over,
  };
}

function tenRideWorld(over: Partial<World> = {}): World {
  const w = membershipWorld(over);
  if (w.booking) w.booking = { ...w.booking, credits_used: 1, membership_id: "card-1" };
  return w;
}

function harness(world: World) {
  const { client, calls } = fakeAdmin((call) => {
    if (call.table === "bookings" && call.op === "select") return { data: world.booking };
    if (call.table === "class_sessions") return { data: world.session };
    if (call.table === "check_ins" && call.op === "select") return { data: world.checkIn };
    if (call.table === "check_ins" && call.op === "insert") return { data: { id: "ci-new" } };
    if (call.table === "no_show_strikes" && call.op === "select") return { data: world.strike };
    return undefined;
  });
  const events: EmitEventInput[] = [];
  const deps: AttendanceDeps = {
    admin: client,
    emit: async (e) => {
      events.push(e);
      return true;
    },
  };
  return { deps, calls, events };
}

const by = (calls: Call[], table: string, op: Call["op"]) =>
  calls.filter((c) => c.table === table && c.op === op);
const rpcCalls = (calls: Call[]) => calls.filter((c) => c.op === "rpc");

function present(over: Partial<SetMemberAttendanceInput> = {}): SetMemberAttendanceInput {
  return { sessionId: SESSION, bookingId: "b-1", present: true, actor: ACTOR, ...over } as SetMemberAttendanceInput;
}

// ---------------------------------------------------------------------------
// Aanwezig en terugdraaien: abonnement
// ---------------------------------------------------------------------------

test("abonnement, aanwezig: check_in met booking_id, attended_at gezet, event met subject booking", async () => {
  const { deps, calls, events } = harness(membershipWorld());
  const res = await setMemberAttendance(deps, present());
  assert.deepEqual(res, {
    ok: true,
    changed: true,
    bookingId: "b-1",
    profileId: "p-1",
    checkInId: "ci-new",
    accessType: "membership",
  });

  const [insert] = by(calls, "check_ins", "insert");
  assert.ok(insert, "check_ins insert ontbreekt");
  const row = chainArg(insert, "insert")?.[0] as Record<string, unknown>;
  assert.equal(row.booking_id, "b-1");
  assert.equal(row.session_id, SESSION);
  assert.equal(row.profile_id, "p-1");
  assert.equal(row.access_type, "membership");
  assert.equal(row.check_in_method, "admin_web");
  assert.equal(row.pillar, "yoga_mobility");
  assert.equal(row.checked_in_by, "staff-1");

  const [update] = by(calls, "bookings", "update");
  const patch = chainArg(update, "update")?.[0] as Record<string, unknown>;
  assert.equal(patch.no_show_at, null);
  assert.ok(typeof patch.attended_at === "string");
  assert.equal(eqValue(update, "id"), "b-1");

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "checkin.recorded");
  assert.equal(events[0].subjectType, "booking");
  assert.equal(events[0].subjectId, "b-1");
  assert.equal(events[0].actorType, "trainer");
  assert.equal(events[0].actorId, "staff-1");
  assert.equal(events[0].payload?.access_type, "membership");
  assert.equal(events[0].payload?.source, "attendance");
  assert.equal(rpcCalls(calls).length, 0);
});

test("abonnement, terugdraaien: rij weg, attended_at en no_show_at null, checkin.reverted", async () => {
  const { deps, calls, events } = harness(
    membershipWorld({
      checkIn: { id: "ci-1", booking_id: "b-1" },
      booking: { ...membershipWorld().booking!, attended_at: "2026-09-27T09:00:00Z" },
    }),
  );
  const res = await setMemberAttendance(deps, present({ present: false, source: "reset" }));
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.changed, true);
  assert.equal(res.ok && res.checkInId, null);

  const [del] = by(calls, "check_ins", "delete");
  assert.ok(del, "check_ins delete ontbreekt");
  assert.equal(eqValue(del, "id"), "ci-1");
  const [update] = by(calls, "bookings", "update");
  assert.deepEqual(chainArg(update, "update")?.[0], { no_show_at: null, attended_at: null });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "checkin.reverted");
  assert.equal(events[0].subjectType, "booking");
  assert.equal(events[0].payload?.source, "reset");
  assert.equal(rpcCalls(calls).length, 0);
});

// ---------------------------------------------------------------------------
// Aanwezig en terugdraaien: rittenkaart (verschil 2 en 3)
// ---------------------------------------------------------------------------

test("rittenkaart, aanwezig: access_type credit uit de booking, geen credit-RPC", async () => {
  const { deps, calls, events } = harness(tenRideWorld());
  const res = await setMemberAttendance(deps, present());
  assert.equal(res.ok && res.accessType, "credit");
  const [insert] = by(calls, "check_ins", "insert");
  const row = chainArg(insert, "insert")?.[0] as Record<string, unknown>;
  assert.equal(row.access_type, "credit");
  assert.equal(events[0].payload?.access_type, "credit");
  assert.equal(rpcCalls(calls).length, 0, "de rit is bij het boeken al afgeschreven; inchecken boekt niets af");
  assert.equal(by(calls, "memberships", "select").length, 0, "geen membership-heuristiek meer");
});

test("rittenkaart, terugdraaien: geen refund (de rit blijft verbruikt tot annulering)", async () => {
  const { deps, calls } = harness(tenRideWorld({ checkIn: { id: "ci-1", booking_id: "b-1" } }));
  const res = await setMemberAttendance(deps, present({ present: false }));
  assert.equal(res.ok, true);
  assert.equal(rpcCalls(calls).length, 0);
  assert.equal(by(calls, "memberships", "select").length, 0);
});

test("accessTypeForBooking: credits_used wint, dan membership_id, anders drop_in", () => {
  assert.equal(accessTypeForBooking({ credits_used: 1, membership_id: "m" }), "credit");
  assert.equal(accessTypeForBooking({ credits_used: 0, membership_id: "m" }), "membership");
  assert.equal(accessTypeForBooking({ credits_used: null, membership_id: null }), "drop_in");
});

// ---------------------------------------------------------------------------
// Strikes (verschil 4)
// ---------------------------------------------------------------------------

test("strike: aanwezig na een no-show wist no_show_at en de strike", async () => {
  const { deps, calls } = harness(
    membershipWorld({
      strike: { id: "st-1" },
      booking: { ...membershipWorld().booking!, no_show_at: "2026-09-26T20:00:00Z" },
    }),
  );
  const res = await setMemberAttendance(deps, present());
  assert.equal(res.ok && res.changed, true);
  const [strikeDel] = by(calls, "no_show_strikes", "delete");
  assert.ok(strikeDel, "strike delete ontbreekt");
  assert.equal(eqValue(strikeDel, "id"), "st-1");
  const [update] = by(calls, "bookings", "update");
  assert.equal((chainArg(update, "update")?.[0] as Record<string, unknown>).no_show_at, null);
});

test("strike: terugdraaien naar neutraal wist de strike, met keepStrike blijft hij staan", async () => {
  const plain = harness(membershipWorld({ strike: { id: "st-1" } }));
  await setMemberAttendance(plain.deps, present({ present: false }));
  assert.equal(by(plain.calls, "no_show_strikes", "delete").length, 1);

  const keep = harness(membershipWorld({ strike: { id: "st-1" }, checkIn: { id: "ci-1", booking_id: "b-1" } }));
  const res = await setMemberAttendance(keep.deps, present({ present: false, keepStrike: true, source: "no_show_correction" }));
  assert.equal(res.ok, true);
  assert.equal(by(keep.calls, "no_show_strikes", "delete").length, 0, "keepStrike laat de strike staan");
  assert.equal(by(keep.calls, "check_ins", "delete").length, 1, "de check-in gaat wel weg");
});

// ---------------------------------------------------------------------------
// Verschil 1: booking altijd gekoppeld
// ---------------------------------------------------------------------------

test("verschil 1: via profileId wordt de booking op (sessie, profiel) gezocht en gekoppeld", async () => {
  const { deps, calls } = harness(membershipWorld());
  const res = await setMemberAttendance(deps, {
    sessionId: SESSION,
    profileId: "p-1",
    present: true,
    actor: ACTOR,
  });
  assert.equal(res.ok && res.bookingId, "b-1");
  const [sel] = by(calls, "bookings", "select");
  assert.equal(eqValue(sel, "session_id"), SESSION);
  assert.equal(eqValue(sel, "profile_id"), "p-1");
  const [insert] = by(calls, "check_ins", "insert");
  assert.equal((chainArg(insert, "insert")?.[0] as Record<string, unknown>).booking_id, "b-1");
});

test("verschil 1: een losse check_in zonder booking_id wordt bijgekoppeld, geen nieuwe rij, geen event", async () => {
  const { deps, calls, events } = harness(membershipWorld({ checkIn: { id: "ci-los", booking_id: null } }));
  const res = await setMemberAttendance(deps, present());
  assert.equal(res.ok && res.checkInId, "ci-los");
  assert.equal(by(calls, "check_ins", "insert").length, 0);
  const [link] = by(calls, "check_ins", "update");
  assert.deepEqual(chainArg(link, "update")?.[0], { booking_id: "b-1" });
  assert.equal(events.length, 0, "geen nieuwe rij, dus geen checkin.recorded");
});

test("verschil 1: zonder booking wordt geweigerd en niets geschreven", async () => {
  const { deps, calls, events } = harness(membershipWorld({ booking: null }));
  const res = await setMemberAttendance(deps, { sessionId: SESSION, profileId: "p-9", present: true, actor: ACTOR });
  assert.deepEqual(res, { ok: false, reason: "no_booking", message: "Geen boeking voor deze les. Voeg eerst een boeking toe." });
  assert.equal(calls.filter((c) => c.op !== "select").length, 0);
  assert.equal(events.length, 0);
});

// ---------------------------------------------------------------------------
// Verschil 5: events alleen bij een echte wijziging; idempotent
// ---------------------------------------------------------------------------

test("idempotent: nogmaals aanwezig op een al aanwezige booking geeft changed false zonder event", async () => {
  const { deps, calls, events } = harness(
    membershipWorld({
      checkIn: { id: "ci-1", booking_id: "b-1" },
      booking: { ...membershipWorld().booking!, attended_at: "2026-09-27T09:00:00Z" },
    }),
  );
  const res = await setMemberAttendance(deps, present());
  assert.deepEqual(res, {
    ok: true,
    changed: false,
    bookingId: "b-1",
    profileId: "p-1",
    checkInId: "ci-1",
    accessType: "membership",
  });
  assert.equal(events.length, 0);
  assert.equal(calls.filter((c) => c.op !== "select").length, 0, "geen enkele schrijfactie");
});

test("idempotent: terugdraaien zonder check-in en zonder markers doet niets", async () => {
  const { deps, calls, events } = harness(membershipWorld());
  const res = await setMemberAttendance(deps, present({ present: false }));
  assert.equal(res.ok && res.changed, false);
  assert.equal(events.length, 0);
  assert.equal(calls.filter((c) => c.op !== "select").length, 0);
});

test("verschil 5: race op de unique-index (23505) wordt geen fout en geen dubbel event", async () => {
  const world = membershipWorld();
  const { client, calls } = fakeAdmin((call) => {
    if (call.table === "bookings") return { data: world.booking };
    if (call.table === "class_sessions") return { data: world.session };
    if (call.table === "check_ins" && call.op === "select") {
      // Eerste select ziet niets, de tweede (na de race) ziet de rij van de ander.
      const earlier = calls.filter((c) => c.table === "check_ins" && c.op === "select").length;
      return earlier <= 1 ? { data: null } : { data: { id: "ci-other" } };
    }
    if (call.table === "check_ins" && call.op === "insert") return { data: null, error: { code: "23505" } };
    if (call.table === "no_show_strikes") return { data: null };
    return undefined;
  });
  const events: EmitEventInput[] = [];
  const res = await setMemberAttendance(
    { admin: client, emit: async (e) => (events.push(e), true) },
    present(),
  );
  assert.equal(res.ok && res.checkInId, "ci-other");
  assert.equal(events.length, 0);
});

// ---------------------------------------------------------------------------
// Weigeringen
// ---------------------------------------------------------------------------

test("weigeringen: geannuleerd, wachtlijst, verkeerde sessie, onbekende booking, onbekende sessie", async () => {
  const cases: Array<[Partial<World>, string, string]> = [
    [{ booking: { ...membershipWorld().booking!, status: "cancelled" } }, "booking_cancelled", "b-1"],
    [{ booking: { ...membershipWorld().booking!, status: "waitlisted" } }, "no_booking", "b-1"],
    [{ booking: { ...membershipWorld().booking!, session_id: "s-other" } }, "booking_not_in_session", "b-1"],
    [{ booking: null }, "booking_not_found", "b-1"],
    [{ session: null }, "session_not_found", "b-1"],
  ];
  for (const [over, reason, bookingId] of cases) {
    const { deps, calls, events } = harness(membershipWorld(over));
    const res = await setMemberAttendance(deps, present({ bookingId }));
    assert.equal(res.ok, false, reason);
    assert.equal(res.ok === false && res.reason, reason);
    assert.equal(calls.filter((c) => c.op !== "select").length, 0, `${reason}: niets geschreven`);
    assert.equal(events.length, 0, `${reason}: geen event`);
  }
});

// ---------------------------------------------------------------------------
// Drie aanroepers, dezelfde uitkomst
// ---------------------------------------------------------------------------

test("dezelfde uitkomst via bookingId (deelnemerslijst), profileId (tablet) en source override", async () => {
  const variants: SetMemberAttendanceInput[] = [
    { sessionId: SESSION, bookingId: "b-1", present: true, actor: ACTOR, source: "attendance" },
    { sessionId: SESSION, profileId: "p-1", present: true, actor: ACTOR, source: "kiosk", method: "admin_tablet" },
    { sessionId: SESSION, bookingId: "b-1", present: true, actor: { userId: "admin-1", actorType: "admin" }, source: "override" },
  ];
  const rows: Record<string, unknown>[] = [];
  const patches: unknown[] = [];
  for (const input of variants) {
    const { deps, calls, events } = harness(tenRideWorld({ strike: { id: "st-1" } }));
    const res = await setMemberAttendance(deps, input);
    assert.equal(res.ok && res.changed, true);
    assert.equal(res.ok && res.accessType, "credit");
    const [insert] = by(calls, "check_ins", "insert");
    const row = { ...(chainArg(insert, "insert")?.[0] as Record<string, unknown>) };
    delete row.checked_in_at;
    rows.push(row);
    patches.push({ ...(chainArg(by(calls, "bookings", "update")[0], "update")?.[0] as object), attended_at: "x" });
    assert.equal(by(calls, "no_show_strikes", "delete").length, 1);
    assert.equal(rpcCalls(calls).length, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0].subjectType, "booking");
    assert.equal(events[0].subjectId, "b-1");
    assert.equal(events[0].actorId, input.actor.userId);
    assert.equal(events[0].payload?.source, input.source);
  }
  // Alleen de herkomst (method) en de actor mogen verschillen.
  const normalise = (r: Record<string, unknown>) => ({ ...r, check_in_method: "x", checked_in_by: "x" });
  assert.deepEqual(normalise(rows[1]), normalise(rows[0]));
  assert.deepEqual(normalise(rows[2]), normalise(rows[0]));
  assert.equal(rows[1].check_in_method, "admin_tablet");
  assert.deepEqual(patches[1], patches[0]);
  assert.deepEqual(patches[2], patches[0]);
});

// ---------------------------------------------------------------------------
// Bron-test: de drie aanroepers gebruiken de kern, self_tablet is weg
// ---------------------------------------------------------------------------

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test("markAttendance, overrideNoShow en checkInByProfileId roepen de kern aan en schrijven check_ins niet meer zelf", () => {
  for (const rel of ["lib/admin/attendance-actions.ts", "lib/admin/member-actions.ts", "lib/check-in/core.ts"]) {
    const code = stripComments(readFileSync(path.join(SRC, rel), "utf8"));
    assert.ok(code.includes("setMemberAttendance("), `${rel}: roept de kern niet aan`);
  }
  // Lezen mag (deelnemerslijst, auto-no-show); schrijven op check_ins niet meer.
  for (const rel of ["lib/admin/attendance-actions.ts", "lib/admin/member-actions.ts"]) {
    const code = stripComments(readFileSync(path.join(SRC, rel), "utf8"));
    const writes = [...code.matchAll(/from\("check_ins"\)\s*\.(insert|update|delete)\(/g)];
    assert.deepEqual(
      writes.map((m) => m[1]),
      [],
      `${rel}: schrijft nog rechtstreeks op check_ins`,
    );
  }
});

test("self_tablet komt niet meer voor in de check-in- en admin-code", () => {
  for (const rel of ["lib/check-in/core.ts", "lib/check-in/actions.ts", "lib/admin/attendance-actions.ts", "lib/admin/member-actions.ts", "lib/attendance/core.ts"]) {
    const code = stripComments(readFileSync(path.join(SRC, rel), "utf8"));
    assert.ok(!code.includes("self_tablet"), `${rel}: self_tablet staat er nog`);
  }
});
