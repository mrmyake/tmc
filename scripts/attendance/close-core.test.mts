/**
 * Contract van src/lib/attendance/close-core.ts (check-in-spoor PR 4, cron
 * close-sessions): geboekt is aanwezig tenzij de trainer no-show heeft
 * aangetikt. Zonder database, met de gedeelde fake uit
 * scripts/_helpers/fake-admin.mts en een klein geheugenmodel dat de
 * schrijfacties toepast, zodat een tweede run echt niets meer doet. Dekt de
 * mix (booked, no-show, cancelled, walk-in, gast, proefles), idempotentie,
 * de kandidatenfilter (vrij trainen, geannuleerd, te vers, voor de
 * ondergrens, al afgesloten), het pre-push-venster (42703), correctie na
 * afsluiten in beide richtingen met de strike, en als bron-test dat de
 * bulkknop en de oude cron weg zijn. Run: npm run test:attendance
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EmitEventInput } from "../../src/lib/events/emit";
import { chainArg, eqValue, fakeAdmin, type Call } from "../_helpers/fake-admin";
import {
  CLOSE_AFTER_END_MINUTES,
  CLOSE_SESSIONS_MAX_PER_RUN,
  CLOSE_SESSIONS_NOT_BEFORE,
  closeSessionCore,
  findClosableSessions,
  runCloseSessions,
  SYSTEM_ACTOR,
  type CloseDeps,
} from "../../src/lib/attendance/close-core";
import { setMemberAttendance } from "../../src/lib/attendance/core";

const NOW = new Date("2026-10-24T19:45:00.000Z");
const SESSION = "s-1";

interface SessionRow {
  id: string;
  end_at: string;
  status: string;
  pillar: string;
  closed_at: string | null;
}
interface BookingRow {
  id: string;
  session_id: string;
  profile_id: string;
  status: string;
  credits_used: number;
  membership_id: string | null;
  attended_at: string | null;
  no_show_at: string | null;
}
interface World {
  sessions: SessionRow[];
  bookings: BookingRow[];
  checkIns: Array<{ id: string; session_id: string; profile_id: string; booking_id: string | null }>;
  strikes: Array<{ id: string; booking_id: string }>;
  guests: Array<{ id: string; session_id: string; status: string }>;
  trials: Array<{ id: string; session_id: string; status: string }>;
  /** Simuleert het pre-push-venster: class_sessions.closed_at bestaat nog niet. */
  missingClosedAt?: boolean;
  /** Simuleert een databasefout bij het schrijven van een check-in. */
  failCheckInInsert?: boolean;
}

function session(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SESSION,
    // Eindigde 45 minuten voor NOW: afsluitbaar.
    end_at: "2026-10-24T19:00:00.000Z",
    status: "scheduled",
    pillar: "kettlebell",
    closed_at: null,
    ...over,
  };
}

function booking(id: string, over: Partial<BookingRow> = {}): BookingRow {
  return {
    id,
    session_id: SESSION,
    profile_id: `p-${id}`,
    status: "booked",
    credits_used: 0,
    membership_id: "m-1",
    attended_at: null,
    no_show_at: null,
    ...over,
  };
}

/** De les van 21 oktober: zes boekingen, nul check-ins, plus de randgevallen. */
function mixedWorld(): World {
  return {
    sessions: [session()],
    bookings: [
      booking("b-open"),
      booking("b-open-card", { credits_used: 1, membership_id: "card-1" }),
      booking("b-noshow", { no_show_at: "2026-10-24T18:30:00.000Z" }),
      booking("b-cancelled", { status: "cancelled" }),
      booking("b-walkin", { attended_at: "2026-10-24T18:05:00.000Z" }),
      booking("b-waitlisted", { status: "waitlisted" }),
    ],
    checkIns: [{ id: "ci-walkin", session_id: SESSION, profile_id: "p-b-walkin", booking_id: "b-walkin" }],
    strikes: [{ id: "strike-1", booking_id: "b-noshow" }],
    guests: [
      { id: "g-open", session_id: SESSION, status: "booked" },
      { id: "g-noshow", session_id: SESSION, status: "no_show" },
      { id: "g-cancelled", session_id: SESSION, status: "cancelled" },
    ],
    trials: [
      { id: "t-paid", session_id: SESSION, status: "paid" },
      { id: "t-pending", session_id: SESSION, status: "pending" },
      { id: "t-attended", session_id: SESSION, status: "attended" },
      { id: "t-cancelled", session_id: SESSION, status: "cancelled" },
    ],
  };
}

function chainValue(call: Call, method: string, column: string): unknown {
  return call.chain.find(([m, args]) => m === method && args[0] === column)?.[1][1];
}
function inValues(call: Call, column: string): unknown[] | undefined {
  return chainValue(call, "in", column) as unknown[] | undefined;
}
function selectColumns(call: Call): string {
  return String(chainArg(call, "select")?.[0] ?? "");
}

const MISSING = { code: "42703", message: "column class_sessions.closed_at does not exist" };

let seq = 0;
function harness(world: World) {
  const { client, calls } = fakeAdmin((call) => {
    const { table, op } = call;

    if (table === "class_sessions") {
      if (world.missingClosedAt) return { data: null, error: MISSING };
      if (op === "update") {
        const patch = chainArg(call, "update")?.[0] as { closed_at: string };
        const id = eqValue(call, "id") as string;
        const row = world.sessions.find((s) => s.id === id);
        if (!row || row.closed_at) return { data: [] };
        row.closed_at = patch.closed_at;
        return { data: [{ id }] };
      }
      const id = eqValue(call, "id") as string | undefined;
      if (id) return { data: world.sessions.find((s) => s.id === id) ?? null };
      const gte = chainValue(call, "gte", "end_at") as string;
      const lte = chainValue(call, "lte", "end_at") as string;
      const limit = Number(chainArg(call, "limit")?.[0] ?? 1000);
      const rows = world.sessions
        .filter((s) => s.status === "scheduled" && s.pillar !== "vrij_trainen" && s.closed_at === null)
        .filter((s) => s.end_at >= gte && s.end_at <= lte)
        .sort((a, b) => a.end_at.localeCompare(b.end_at))
        .slice(0, limit)
        .map((s) => ({ id: s.id, end_at: s.end_at }));
      return { data: rows };
    }

    if (table === "bookings") {
      if (op === "update") {
        const patch = chainArg(call, "update")?.[0] as Partial<BookingRow>;
        const id = eqValue(call, "id") as string;
        const row = world.bookings.find((b) => b.id === id);
        if (row) Object.assign(row, patch);
        return { data: null };
      }
      const id = eqValue(call, "id") as string | undefined;
      if (id) return { data: world.bookings.find((b) => b.id === id) ?? null };
      const sessionId = eqValue(call, "session_id") as string;
      const status = eqValue(call, "status") as string | undefined;
      return {
        data: world.bookings.filter(
          (b) => b.session_id === sessionId && (status === undefined || b.status === status),
        ),
      };
    }

    if (table === "check_ins") {
      if (op === "insert") {
        if (world.failCheckInInsert) return { data: null, error: { code: "XX000", message: "boom" } };
        const row = chainArg(call, "insert")?.[0] as { session_id: string; profile_id: string; booking_id: string };
        const id = `ci-${++seq}`;
        world.checkIns.push({ id, session_id: row.session_id, profile_id: row.profile_id, booking_id: row.booking_id });
        return { data: { id } };
      }
      if (op === "delete") {
        const id = eqValue(call, "id") as string;
        world.checkIns = world.checkIns.filter((c) => c.id !== id);
        return { data: null };
      }
      if (op === "update") return { data: null };
      const sessionId = eqValue(call, "session_id") as string;
      const profileId = eqValue(call, "profile_id") as string;
      return {
        data: world.checkIns.find((c) => c.session_id === sessionId && c.profile_id === profileId) ?? null,
      };
    }

    if (table === "no_show_strikes") {
      if (op === "delete") {
        const id = eqValue(call, "id") as string;
        world.strikes = world.strikes.filter((s) => s.id !== id);
        return { data: null };
      }
      if (op === "insert") {
        const row = chainArg(call, "insert")?.[0] as { booking_id: string };
        world.strikes.push({ id: `strike-${++seq}`, booking_id: row.booking_id });
        return { data: null };
      }
      const bookingId = eqValue(call, "booking_id") as string;
      return { data: world.strikes.find((s) => s.booking_id === bookingId) ?? null };
    }

    if (table === "guest_bookings" || table === "trial_bookings") {
      const rows = table === "guest_bookings" ? world.guests : world.trials;
      if (op === "update") {
        const patch = chainArg(call, "update")?.[0] as { status: string };
        const id = eqValue(call, "id") as string;
        const allowed = inValues(call, "status") as string[];
        const row = rows.find((r) => r.id === id);
        if (!row || !allowed.includes(row.status)) return { data: [] };
        row.status = patch.status;
        return { data: [{ id }] };
      }
      const ids = inValues(call, "id") as string[] | undefined;
      if (ids) return { data: rows.filter((r) => ids.includes(r.id)) };
      const sessionId = eqValue(call, "session_id") as string;
      return { data: rows.filter((r) => r.session_id === sessionId) };
    }

    return undefined;
  });
  const events: EmitEventInput[] = [];
  const deps: CloseDeps = {
    admin: client,
    emit: async (e) => {
      events.push(e);
      return true;
    },
  };
  return { deps, calls, events, world };
}

const by = (calls: Call[], table: string, op: Call["op"]) =>
  calls.filter((c) => c.table === table && c.op === op);
const writes = (calls: Call[]) => calls.filter((c) => c.op !== "select");

// ---------------------------------------------------------------------------
// De mix: wie niet als no-show stond wordt aanwezig, de rest blijft staan
// ---------------------------------------------------------------------------

test("mix: open boekingen, gast en proefles worden aanwezig; no-show, cancelled, waitlisted, walk-in en pending blijven", async () => {
  const { deps, calls, events, world } = harness(mixedWorld());
  const res = await closeSessionCore(deps, { sessionId: SESSION, now: NOW });
  assert.ok(res.ok, "afsluiten faalde");
  assert.deepEqual(res.counts, {
    members_present: 3, // b-open, b-open-card, b-walkin
    members_no_show: 1,
    guests_present: 1,
    guests_no_show: 1,
    trials_present: 2, // t-paid (nu), t-attended (al)
    trials_no_show: 0,
    auto_marked: 4, // twee leden, een gast, een proefles
  });

  // Leden: twee nieuwe check_ins, method auto_close, geen staflid, access_type uit de boeking.
  const inserts = by(calls, "check_ins", "insert").map((c) => chainArg(c, "insert")?.[0] as Record<string, unknown>);
  assert.deepEqual(
    inserts.map((r) => [r.booking_id, r.check_in_method, r.checked_in_by, r.access_type]).sort(),
    [
      ["b-open", "auto_close", null, "membership"],
      ["b-open-card", "auto_close", null, "credit"],
    ],
  );
  const open = world.bookings.find((b) => b.id === "b-open")!;
  assert.ok(open.attended_at, "attended_at niet gezet");
  assert.equal(open.no_show_at, null);
  // No-show blijft no-show met strike; walk-in krijgt geen tweede rij.
  const noShow = world.bookings.find((b) => b.id === "b-noshow")!;
  assert.ok(noShow.no_show_at);
  assert.equal(noShow.attended_at, null);
  assert.ok(world.strikes.some((s) => s.booking_id === "b-noshow"), "strike van de no-show is weg");
  assert.equal(world.checkIns.filter((c) => c.profile_id === "p-b-walkin").length, 1);
  assert.equal(world.checkIns.some((c) => c.profile_id === "p-b-noshow"), false);
  assert.equal(world.bookings.find((b) => b.id === "b-cancelled")!.attended_at, null);
  assert.equal(world.bookings.find((b) => b.id === "b-waitlisted")!.attended_at, null);

  // Gasten en proeflessen.
  assert.equal(world.guests.find((g) => g.id === "g-open")!.status, "attended");
  assert.equal(world.guests.find((g) => g.id === "g-noshow")!.status, "no_show");
  assert.equal(world.guests.find((g) => g.id === "g-cancelled")!.status, "cancelled");
  assert.equal(world.trials.find((t) => t.id === "t-paid")!.status, "attended");
  assert.equal(world.trials.find((t) => t.id === "t-pending")!.status, "pending");
  assert.equal(world.trials.find((t) => t.id === "t-cancelled")!.status, "cancelled");

  // Afgesloten, met het event als laatste.
  assert.equal(world.sessions[0].closed_at, NOW.toISOString());
  const types = events.map((e) => e.type);
  assert.deepEqual(types.filter((t) => t === "checkin.recorded").length, 2);
  assert.deepEqual(types.filter((t) => t === "guest.attendance_marked").length, 1);
  assert.deepEqual(types.filter((t) => t === "trial_booking.attended").length, 1);
  assert.equal(types.at(-1), "session.closed");
  for (const e of events) {
    assert.equal(e.actorType, "system", `${e.type}: actor is geen system`);
    assert.equal(e.actorId, null, `${e.type}: actorId moet null zijn`);
    if (e.type !== "session.closed") {
      assert.equal((e.payload as { source: string }).source, "auto_close", `${e.type}: source`);
    }
  }
  const closedEvent = events.at(-1)!;
  assert.equal(closedEvent.subjectType, "session");
  assert.equal(closedEvent.subjectId, SESSION);
  assert.equal((closedEvent.payload as { auto_marked: number }).auto_marked, 4);
  // Geen credits en geen no-shows gezet door de cron.
  assert.equal(calls.filter((c) => c.op === "rpc").length, 0);
  assert.equal(world.bookings.filter((b) => b.no_show_at).length, 1);
});

test("tweede run op een afgesloten les schrijft niets en stuurt geen event", async () => {
  const { deps, calls, events, world } = harness(mixedWorld());
  const first = await closeSessionCore(deps, { sessionId: SESSION, now: NOW });
  assert.ok(first.ok);
  const before = { calls: calls.length, events: events.length };

  const second = await closeSessionCore(deps, { sessionId: SESSION, now: new Date(NOW.getTime() + 900_000) });
  assert.ok(second.ok);
  assert.deepEqual(second.counts, { ...first.counts, auto_marked: 0 });
  assert.deepEqual(writes(calls.slice(before.calls)), [], "tweede run schrijft");
  assert.equal(events.length, before.events, "tweede run stuurt een event");
  assert.equal(world.sessions[0].closed_at, NOW.toISOString(), "closed_at is overschreven");
});

test("mislukt een lid, dan blijft de les open voor de volgende run", async () => {
  const { deps, world, events } = harness({ ...mixedWorld(), failCheckInInsert: true });
  const res = await closeSessionCore(deps, { sessionId: SESSION, now: NOW });
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.reason, "attendance_failed");
  assert.equal(world.sessions[0].closed_at, null, "closed_at gezet ondanks fout");
  assert.equal(events.some((e) => e.type === "session.closed"), false);
  // Gasten en proeflessen zijn nog niet aangeraakt: leden gaan eerst.
  assert.equal(world.guests.find((g) => g.id === "g-open")!.status, "booked");
  assert.equal(world.trials.find((t) => t.id === "t-paid")!.status, "paid");
});

// ---------------------------------------------------------------------------
// Kandidaten: alleen afgelopen groepslessen na de ondergrens
// ---------------------------------------------------------------------------

test("kandidaten: vrij trainen, geannuleerd, te vers, voor de ondergrens en al afgesloten vallen af", async () => {
  const w: World = {
    ...mixedWorld(),
    sessions: [
      session({ id: "ok-oud", end_at: "2026-10-24T17:00:00.000Z" }),
      session({ id: "ok", end_at: "2026-10-24T19:15:00.000Z" }),
      session({ id: "vrij", pillar: "vrij_trainen" }),
      session({ id: "cancelled", status: "cancelled" }),
      // Eindigde 20 minuten geleden: nog binnen de 30 minuten.
      session({ id: "vers", end_at: "2026-10-24T19:25:00.000Z" }),
      session({ id: "voor-deploy", end_at: "2026-10-01T18:00:00.000Z" }),
      session({ id: "al-dicht", closed_at: "2026-10-24T19:31:00.000Z" }),
    ],
  };
  const { deps, calls } = harness(w);
  const res = await findClosableSessions(deps, NOW);
  assert.ok(res.ok);
  assert.deepEqual(res.sessions.map((s) => s.id), ["ok-oud", "ok"]);

  // De filter staat in de query zelf, niet alleen in de fake.
  const [q] = by(calls, "class_sessions", "select");
  assert.equal(eqValue(q, "status"), "scheduled");
  assert.deepEqual(chainArg(q, "neq"), ["pillar", "vrij_trainen"]);
  assert.deepEqual(chainArg(q, "is"), ["closed_at", null]);
  assert.equal(chainValue(q, "gte", "end_at"), new Date(CLOSE_SESSIONS_NOT_BEFORE).toISOString());
  assert.equal(
    chainValue(q, "lte", "end_at"),
    new Date(NOW.getTime() - CLOSE_AFTER_END_MINUTES * 60_000).toISOString(),
  );
  assert.deepEqual(chainArg(q, "limit"), [CLOSE_SESSIONS_MAX_PER_RUN]);
});

test("ondergrens is de mergedag om middernacht Europe/Amsterdam", () => {
  assert.equal(new Date(CLOSE_SESSIONS_NOT_BEFORE).toISOString(), "2026-10-22T22:00:00.000Z");
});

test("runCloseSessions sluit alle kandidaten af en telt", async () => {
  const w: World = {
    ...mixedWorld(),
    sessions: [session(), session({ id: "s-2", end_at: "2026-10-24T18:00:00.000Z" })],
  };
  w.bookings.push(booking("b-s2", { session_id: "s-2", profile_id: "p-s2" }));
  const { deps, world, events } = harness(w);
  const res = await runCloseSessions(deps, NOW);
  assert.ok(res.ok && !res.migrationPending);
  assert.equal(res.closed, 2);
  assert.deepEqual(res.failed, []);
  assert.equal(res.autoMarked, 5);
  assert.ok(world.sessions.every((s) => s.closed_at));
  assert.equal(events.filter((e) => e.type === "session.closed").length, 2);
});

// ---------------------------------------------------------------------------
// Pre-push-venster: zonder closed_at gebeurt er niets
// ---------------------------------------------------------------------------

test("ontbreekt class_sessions.closed_at (42703), dan meldt de run migration_pending en schrijft niets", async () => {
  const { deps, calls, events } = harness({ ...mixedWorld(), missingClosedAt: true });
  const res = await runCloseSessions(deps, NOW);
  assert.deepEqual(res, { ok: true, migrationPending: true, closed: 0 });
  assert.deepEqual(writes(calls), []);
  assert.deepEqual(events, []);
});

// ---------------------------------------------------------------------------
// Corrigeren na afsluiten: beide richtingen, met de strike
// ---------------------------------------------------------------------------

test("na afsluiten: aanwezig naar no-show haalt de check-in weg en laat een strike zetten; terug wist hem", async () => {
  const { deps, world, events } = harness(mixedWorld());
  const closed = await closeSessionCore(deps, { sessionId: SESSION, now: NOW });
  assert.ok(closed.ok);
  const staff = { userId: "staff-1", actorType: "trainer" as const };

  // Richting 1, zoals markAttendance het doet: eerst de kern met keepStrike,
  // dan no_show_at en een strike omdat er voor deze boeking nog geen is.
  const toNoShow = await setMemberAttendance(deps, {
    sessionId: SESSION,
    bookingId: "b-open",
    present: false,
    actor: staff,
    source: "no_show_correction",
    keepStrike: true,
  });
  assert.ok(toNoShow.ok && toNoShow.changed);
  assert.equal(world.checkIns.some((c) => c.booking_id === "b-open"), false, "check-in staat er nog");
  assert.equal(events.at(-1)?.type, "checkin.reverted");
  assert.equal(world.strikes.some((s) => s.booking_id === "b-open"), false, "er was nog geen strike, markAttendance zet er nu een");
  const b = world.bookings.find((x) => x.id === "b-open")!;
  b.no_show_at = "2026-10-24T20:00:00.000Z";
  b.attended_at = null;
  world.strikes.push({ id: "strike-corr", booking_id: "b-open" });

  // Richting 2: no-show naar aanwezig wist de strike en zet de check-in terug.
  const toPresent = await setMemberAttendance(deps, {
    sessionId: SESSION,
    bookingId: "b-open",
    present: true,
    actor: staff,
    source: "attendance",
  });
  assert.ok(toPresent.ok && toPresent.changed);
  assert.equal(world.strikes.some((s) => s.booking_id === "b-open"), false, "strike niet gewist");
  assert.equal(b.no_show_at, null);
  assert.ok(b.attended_at);
  assert.ok(world.checkIns.some((c) => c.booking_id === "b-open"));
  assert.equal(events.at(-1)?.type, "checkin.recorded");
});

test("SYSTEM_ACTOR heeft geen staflid-id", () => {
  assert.deepEqual(SYSTEM_ACTOR, { userId: null, actorType: "system" });
});

// ---------------------------------------------------------------------------
// Bron-tests: de bulkknop, de server action en de oude cron zijn weg
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "src");
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test("autoMarkNoShows en autoMarkTrialNoShowsCore bestaan niet meer", () => {
  for (const rel of [
    "lib/admin/attendance-actions.ts",
    "lib/attendance/trial-core.ts",
    "app/app/_shared/attendance/MobileAttendanceList.tsx",
    "app/app/_shared/attendance/AttendanceList.tsx",
  ]) {
    const code = stripComments(readFileSync(path.join(SRC, rel), "utf8"));
    assert.ok(!code.includes("autoMarkNoShows"), `${rel}: autoMarkNoShows staat er nog`);
    assert.ok(!code.includes("autoMarkTrialNoShowsCore"), `${rel}: autoMarkTrialNoShowsCore staat er nog`);
    assert.ok(!code.includes("Auto-mark no-shows"), `${rel}: de bulkknop staat er nog`);
  }
});

test("markAttendance zet bij een no-show-correctie zelf de strike als die ontbreekt", () => {
  const code = stripComments(readFileSync(path.join(SRC, "lib/admin/attendance-actions.ts"), "utf8"));
  assert.ok(code.includes("const strikeIssued = !strikesByBooking.has(a.bookingId)"));
  assert.ok(code.includes("writeStrikesForNewNoShows(admin, newStrikeRows)"));
});

test("release-no-shows is weg en close-sessions staat elke 15 minuten in vercel.json", () => {
  assert.equal(existsSync(path.join(SRC, "app/api/cron/release-no-shows")), false, "oude cron-route bestaat nog");
  assert.ok(existsSync(path.join(SRC, "app/api/cron/close-sessions/route.ts")));
  const crons = (JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  }).crons;
  assert.equal(crons.some((c) => c.path.includes("release-no-shows")), false);
  const close = crons.find((c) => c.path === "/api/cron/close-sessions");
  assert.equal(close?.schedule, "*/15 * * * *");
});

test("de check_in_method-constraint krijgt auto_close in de migratie", () => {
  const sql = readFileSync(
    path.join(ROOT, "supabase/migrations/20261023120000_close_sessions.sql"),
    "utf8",
  );
  assert.ok(sql.includes("add column closed_at timestamptz"));
  assert.ok(/check_in_method = any \(array\['self_tablet', 'admin_tablet', 'admin_web', 'auto_close'\]\)/.test(sql));
});
