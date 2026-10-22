/**
 * Contract van src/lib/attendance/walk-in-core.ts (check-in-spoor PR 3):
 * het venster, de koppeling RPC plus aanwezigheidskern bij toevoegen en
 * ongedaan maken, de weigeringen uit de RPC (volle les telt niet, na de
 * start wel, buiten het venster, geen dekking, al geboekt, andere trainer,
 * vrij trainen), de rittenkaart (de debit zit in de RPC, de kern raakt geen
 * credits), en de statusregel van de zoeklijst. Geen database: de RPC is een
 * fake die per test een antwoord geeft; de echte regels staan in
 * scripts/test-walk-in.sql. Run: npm run test:attendance
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmitEventInput } from "../../src/lib/events/emit";
import { chainArg, eqValue, fakeAdmin, type Call } from "../_helpers/fake-admin";
import {
  addWalkInCore,
  coverageLabel,
  searchWalkInMembersCore,
  undoWalkInCore,
  walkInWindow,
  WALK_IN_OPENS_BEFORE_MINUTES,
  WALK_IN_REASON_COPY,
  type WalkInDeps,
} from "../../src/lib/attendance/walk-in-core";

const ACTOR = { userId: "staff-1", actorType: "trainer" as const };
const SESSION = "s-1";

type RpcAnswer = { data?: unknown; error?: unknown };

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
  checkIn: { id: string; booking_id: string | null } | null;
  rpc: Record<string, RpcAnswer>;
}

function world(over: Partial<World> = {}): World {
  return {
    booking: {
      id: "b-walk",
      session_id: SESSION,
      profile_id: "p-1",
      status: "booked",
      credits_used: 0,
      membership_id: "m-1",
      attended_at: null,
      no_show_at: null,
    },
    checkIn: null,
    rpc: {
      book_walk_in: { data: { ok: true, booking_id: "b-walk", membership_id: "m-1", credits_used: 0 } },
      undo_walk_in: { data: { ok: true, booking_id: "b-walk", session_id: SESSION, credits_refunded: 0 } },
    },
    ...over,
  };
}

function harness(w: World) {
  const { client, calls } = fakeAdmin((call) => {
    if (call.table === "bookings" && call.op === "select") return { data: w.booking };
    if (call.table === "class_sessions") return { data: { id: SESSION, pillar: "kettlebell" } };
    if (call.table === "check_ins" && call.op === "select") return { data: w.checkIn };
    if (call.table === "check_ins" && call.op === "insert") {
      // De fake houdt de wereld bij: na een insert bestaat de rij, na een
      // delete niet meer (herstel na een geweigerde undo leest dat terug).
      w.checkIn = { id: "ci-new", booking_id: w.booking?.id ?? null };
      return { data: { id: "ci-new" } };
    }
    if (call.table === "check_ins" && call.op === "delete") {
      w.checkIn = null;
      return { data: null };
    }
    if (call.table === "no_show_strikes" && call.op === "select") return { data: null };
    return undefined;
  });
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const user = {
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      const answer = w.rpc[name] ?? { data: { ok: false, reason: "db_error" } };
      return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
    },
  } as unknown as Pick<SupabaseClient, "rpc">;
  const events: EmitEventInput[] = [];
  const deps: WalkInDeps = {
    admin: client,
    user,
    emit: async (e) => {
      events.push(e);
      return true;
    },
  };
  return { deps, calls, rpcCalls, events };
}

const by = (calls: Call[], table: string, op: Call["op"]) =>
  calls.filter((c) => c.table === table && c.op === op);

// ---------------------------------------------------------------------------
// Venster
// ---------------------------------------------------------------------------

test("venster: dicht voor 15 minuten voor de start, open daarna, dicht na middernacht Amsterdam", () => {
  // 19:00 Amsterdam op 21 oktober 2026 (CEST, UTC+2) is 17:00Z.
  const start = "2026-10-21T17:00:00.000Z";
  assert.equal(WALK_IN_OPENS_BEFORE_MINUTES, 15);
  assert.equal(walkInWindow(start, new Date("2026-10-21T16:44:59Z")), "before");
  assert.equal(walkInWindow(start, new Date("2026-10-21T16:45:00Z")), "open");
  assert.equal(walkInWindow(start, new Date("2026-10-21T18:30:00Z")), "open", "tijdens en na de les");
  assert.equal(walkInWindow(start, new Date("2026-10-21T21:59:00Z")), "open", "23:59 Amsterdam");
  assert.equal(walkInWindow(start, new Date("2026-10-21T22:00:00Z")), "closed", "00:00 Amsterdam, volgende dag");
});

// ---------------------------------------------------------------------------
// Toevoegen
// ---------------------------------------------------------------------------

test("toevoegen: RPC als gebruiker, daarna aanwezig via de kern met method admin_web en source walk_in", async () => {
  const { deps, calls, rpcCalls, events } = harness(world());
  const res = await addWalkInCore(deps, { sessionId: SESSION, profileId: "p-1", actor: ACTOR });
  assert.deepEqual(res, { ok: true, bookingId: "b-walk", alreadyBooked: false, creditsUsed: 0 });

  assert.deepEqual(rpcCalls, [
    { name: "book_walk_in", args: { p_session_id: SESSION, p_profile_id: "p-1" } },
  ]);
  const [insert] = by(calls, "check_ins", "insert");
  assert.ok(insert, "check_ins insert ontbreekt");
  const row = chainArg(insert, "insert")?.[0] as Record<string, unknown>;
  assert.equal(row.booking_id, "b-walk");
  assert.equal(row.check_in_method, "admin_web");
  assert.equal(row.checked_in_by, "staff-1");

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "checkin.recorded");
  assert.equal(events[0].payload?.source, "walk_in");
  assert.equal(events[0].actorType, "trainer");
});

test("toevoegen op een volle les: de RPC weigert niet op capaciteit, de kern checkt gewoon in", async () => {
  // De RPC kent geen capacity_full (booking_gate met p_walk_in slaat die
  // over); een vol antwoord zou een regressie in de migratie zijn.
  const { deps, calls } = harness(world());
  const res = await addWalkInCore(deps, { sessionId: SESSION, profileId: "p-1", actor: ACTOR });
  assert.equal(res.ok, true);
  assert.equal(by(calls, "check_ins", "insert").length, 1);
});

test("toevoegen na de starttijd: geen session_in_past, de kern checkt in", async () => {
  const { deps } = harness(world());
  const res = await addWalkInCore(deps, { sessionId: SESSION, profileId: "p-1", actor: ACTOR });
  assert.equal(res.ok, true);
});

test("toevoegen, al geboekt: RPC geeft de bestaande booking_id, alleen inchecken, geen nieuwe boeking", async () => {
  const w = world();
  w.rpc.book_walk_in = { data: { ok: true, reason: "already_booked", booking_id: "b-walk", credits_used: 0 } };
  const { deps, calls } = harness(w);
  const res = await addWalkInCore(deps, { sessionId: SESSION, profileId: "p-1", actor: ACTOR });
  assert.deepEqual(res, { ok: true, bookingId: "b-walk", alreadyBooked: true, creditsUsed: 0 });
  assert.equal(by(calls, "check_ins", "insert").length, 1);
  assert.equal(by(calls, "bookings", "insert").length, 0, "de kern maakt nooit een boeking");
});

test("toevoegen met rittenkaart: credits_used uit de RPC, de kern raakt geen credits en geen RPC", async () => {
  const w = world({
    booking: { ...world().booking!, credits_used: 1, membership_id: "card-1" },
  });
  w.rpc.book_walk_in = { data: { ok: true, booking_id: "b-walk", membership_id: "card-1", credits_used: 1 } };
  const { deps, calls, rpcCalls, events } = harness(w);
  const res = await addWalkInCore(deps, { sessionId: SESSION, profileId: "p-1", actor: ACTOR });
  assert.deepEqual(res, { ok: true, bookingId: "b-walk", alreadyBooked: false, creditsUsed: 1 });
  // Alleen de boek-RPC; de debit zit in de database (apply_credit_adjustment
  // binnen book_walk_in), niet in TS.
  assert.deepEqual(rpcCalls.map((r) => r.name), ["book_walk_in"]);
  assert.equal(by(calls, "memberships", "update").length, 0);
  const [insert] = by(calls, "check_ins", "insert");
  assert.equal((chainArg(insert, "insert")?.[0] as Record<string, unknown>).access_type, "credit");
  assert.equal(events[0].payload?.access_type, "credit");
});

test("weigeringen uit de RPC: geen dekking, buiten venster, vrij trainen, geannuleerd; niets geschreven", async () => {
  for (const reason of ["no_coverage", "outside_window", "not_a_class", "session_not_scheduled", "daily_cap_reached"]) {
    const w = world();
    w.rpc.book_walk_in = { data: { ok: false, reason } };
    const { deps, calls, events } = harness(w);
    const res = await addWalkInCore(deps, { sessionId: SESSION, profileId: "p-1", actor: ACTOR });
    assert.deepEqual(res, { ok: false, reason, message: WALK_IN_REASON_COPY[reason as keyof typeof WALK_IN_REASON_COPY] });
    assert.equal(calls.length, 0, `${reason}: de kern is aangeroepen`);
    assert.equal(events.length, 0);
  }
});

test("trainer van een andere sessie: 42501 uit de RPC wordt unauthorized, niets geschreven", async () => {
  const w = world();
  w.rpc.book_walk_in = { error: { code: "42501", message: "Geen toegang tot deze sessie." } };
  const { deps, calls } = harness(w);
  const res = await addWalkInCore(deps, { sessionId: SESSION, profileId: "p-1", actor: ACTOR });
  assert.deepEqual(res, { ok: false, reason: "unauthorized", message: WALK_IN_REASON_COPY.unauthorized });
  assert.equal(calls.length, 0);
});

test("mislukte debit in de RPC (walk_in_credit_failed) wordt credit_failed; de boeking is teruggerold, dus niets ingecheckt", async () => {
  const w = world();
  w.rpc.book_walk_in = { error: { code: "P0001", message: "walk_in_credit_failed:insufficient_credits" } };
  const { deps, calls } = harness(w);
  const res = await addWalkInCore(deps, { sessionId: SESSION, profileId: "p-1", actor: ACTOR });
  assert.deepEqual(res, { ok: false, reason: "credit_failed", message: WALK_IN_REASON_COPY.credit_failed });
  assert.equal(calls.length, 0);
});

test("boeking staat maar inchecken faalt: attendance_failed, de boeking blijft", async () => {
  const w = world({ booking: null });
  const { deps } = harness(w);
  const res = await addWalkInCore(deps, { sessionId: SESSION, profileId: "p-1", actor: ACTOR });
  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, "attendance_failed");
});

// ---------------------------------------------------------------------------
// Ongedaan maken
// ---------------------------------------------------------------------------

test("ongedaan maken: eerst de check-in weg via de kern (source walk_in_undo), dan de RPC", async () => {
  const w = world({
    booking: { ...world().booking!, attended_at: "2026-10-21T17:05:00Z" },
    checkIn: { id: "ci-1", booking_id: "b-walk" },
  });
  w.rpc.undo_walk_in = { data: { ok: true, booking_id: "b-walk", session_id: SESSION, credits_refunded: 1 } };
  const { deps, calls, rpcCalls, events } = harness(w);
  const res = await undoWalkInCore(deps, { sessionId: SESSION, bookingId: "b-walk", actor: ACTOR });
  assert.deepEqual(res, { ok: true, bookingId: "b-walk", creditsRefunded: 1 });

  const del = by(calls, "check_ins", "delete");
  assert.equal(del.length, 1);
  assert.equal(eqValue(del[0], "id"), "ci-1");
  assert.deepEqual(rpcCalls, [{ name: "undo_walk_in", args: { p_booking_id: "b-walk" } }]);
  // Volgorde: de kern voor de RPC (de kern weigert op een geannuleerde boeking).
  const firstDelete = calls.indexOf(del[0]);
  assert.ok(firstDelete >= 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "checkin.reverted");
  assert.equal(events[0].payload?.source, "walk_in_undo");
  // Geen strike-aanraking: terugdraaien zonder keepStrike en zonder strike-rij.
  assert.equal(by(calls, "no_show_strikes", "insert").length, 0);
});

test("ongedaan maken, RPC weigert (buiten venster): check-in wordt hersteld, reden uit de RPC", async () => {
  const w = world({
    booking: { ...world().booking!, attended_at: "2026-10-21T17:05:00Z" },
    checkIn: { id: "ci-1", booking_id: "b-walk" },
  });
  w.rpc.undo_walk_in = { data: { ok: false, reason: "outside_window" } };
  const { deps, calls } = harness(w);
  const res = await undoWalkInCore(deps, { sessionId: SESSION, bookingId: "b-walk", actor: ACTOR });
  assert.deepEqual(res, { ok: false, reason: "outside_window", message: WALK_IN_REASON_COPY.outside_window });
  assert.equal(by(calls, "check_ins", "delete").length, 1);
  assert.equal(by(calls, "check_ins", "insert").length, 1, "check-in hersteld");
});

test("ongedaan maken op een gewone boeking: not_a_walk_in uit de RPC, check-in hersteld", async () => {
  const w = world({ checkIn: { id: "ci-1", booking_id: "b-walk" } });
  w.rpc.undo_walk_in = { data: { ok: false, reason: "not_a_walk_in" } };
  const { deps } = harness(w);
  const res = await undoWalkInCore(deps, { sessionId: SESSION, bookingId: "b-walk", actor: ACTOR });
  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, "not_a_walk_in");
});

test("ongedaan maken op een geannuleerde boeking: not_booked, geen RPC", async () => {
  const w = world({ booking: { ...world().booking!, status: "cancelled" } });
  const { deps, rpcCalls } = harness(w);
  const res = await undoWalkInCore(deps, { sessionId: SESSION, bookingId: "b-walk", actor: ACTOR });
  assert.deepEqual(res, { ok: false, reason: "not_booked", message: WALK_IN_REASON_COPY.not_booked });
  assert.equal(rpcCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Zoeklijst en statusregel
// ---------------------------------------------------------------------------

const DAY = "2026-10-21";

test("statusregel: abonnement wint van rittenkaart, rittenkaart toont ritten, anders geen dekking", () => {
  const sub = {
    plan_type: "groepslessen", status: "active", credits_remaining: null, credits_expires_at: null,
    cancellation_effective_date: null, pause_effective_date: null, start_date: "2026-09-01",
  };
  const card = { ...sub, plan_type: "ten_ride_card", credits_remaining: 3, start_date: "2026-10-01" };
  assert.deepEqual(coverageLabel([card, sub], "kettlebell", DAY, DAY), { covered: true, label: "Abonnement Groepslessen" });
  assert.deepEqual(coverageLabel([card], "kettlebell", DAY, DAY), { covered: true, label: "Rittenkaart, 3 ritten over" });
  assert.deepEqual(coverageLabel([{ ...card, credits_remaining: 1 }], "kettlebell", DAY, DAY), { covered: true, label: "Rittenkaart, 1 rit over" });
  assert.deepEqual(coverageLabel([{ ...card, credits_remaining: 0 }], "kettlebell", DAY, DAY), { covered: false, label: "Geen dekking voor Kettlebell" });
  assert.equal(coverageLabel([{ ...card, credits_expires_at: "2026-10-20" }], "kettlebell", DAY, DAY).covered, false, "verlopen kaart");
  assert.equal(coverageLabel([{ ...sub, plan_type: "yoga_mobility" }], "kettlebell", DAY, DAY).covered, false, "plan dekt pillar niet");
  assert.equal(coverageLabel([{ ...sub, status: "paused" }], "kettlebell", DAY, DAY).covered, false);
  assert.equal(coverageLabel([{ ...sub, pause_effective_date: "2026-10-21" }], "kettlebell", DAY, DAY).covered, false, "pauze gaat in op de sessiedag");
  assert.equal(coverageLabel([{ ...sub, status: "cancellation_requested", cancellation_effective_date: "2026-10-21" }], "kettlebell", DAY, DAY).covered, true, "opgezegd t/m de sessiedag");
  assert.equal(coverageLabel([{ ...sub, status: "cancellation_requested", cancellation_effective_date: "2026-10-20" }], "kettlebell", DAY, DAY).covered, false);
});

test("zoeken: prefix op naam, minimaal 2 tekens, geen e-mail of telefoon in het resultaat, op de lijst gaat voor", async () => {
  const profiles = [
    { id: "p-a", first_name: "Anna", last_name: "Bos", avatar_url: null, email: "anna@example.com",
      memberships: [{ plan_type: "groepslessen", status: "active", credits_remaining: null, credits_expires_at: null, cancellation_effective_date: null, pause_effective_date: null, start_date: "2026-09-01" }] },
    { id: "p-b", first_name: "Anne", last_name: "Kok", avatar_url: null, email: "anne@example.com",
      memberships: [{ plan_type: "vrij_trainen", status: "active", credits_remaining: null, credits_expires_at: null, cancellation_effective_date: null, pause_effective_date: null, start_date: "2026-09-01" }] },
    { id: "p-w", first_name: "Anja", last_name: "Walk", avatar_url: null, email: "walkin-12345678@walkin.tmc.internal",
      memberships: [{ plan_type: "groepslessen", status: "active", credits_remaining: null, credits_expires_at: null, cancellation_effective_date: null, pause_effective_date: null, start_date: "2026-09-01" }] },
    { id: "p-x", first_name: "Anouk", last_name: "Oud", avatar_url: null, email: "anouk@example.com",
      memberships: [{ plan_type: "groepslessen", status: "cancelled", credits_remaining: null, credits_expires_at: null, cancellation_effective_date: null, pause_effective_date: null, start_date: "2025-01-01" }] },
  ];
  const { client, calls } = fakeAdmin((call) => {
    if (call.table === "profiles") return { data: profiles };
    return undefined;
  });

  assert.deepEqual(await searchWalkInMembersCore(client, { pillar: "kettlebell", sessionDateIso: DAY, query: "a", onListProfileIds: new Set() }), []);
  assert.equal(calls.length, 0, "onder de 2 tekens geen query");

  const res = await searchWalkInMembersCore(client, {
    pillar: "kettlebell", sessionDateIso: DAY, query: "An", onListProfileIds: new Set(["p-b"]), now: new Date(`${DAY}T10:00:00Z`),
  });
  const [q] = calls;
  const orArg = chainArg(q, "or")?.[0] as string;
  assert.equal(orArg, "first_name.ilike.An%,last_name.ilike.An%");
  const selectArg = chainArg(q, "select")?.[0] as string;
  assert.ok(!/phone|member_code/.test(selectArg), "telefoon en member_code worden niet opgehaald");

  assert.deepEqual(res.map((r) => [r.profileId, r.state, r.statusLabel]), [
    ["p-a", "eligible", "Abonnement Groepslessen"],
    ["p-b", "on_list", "Staat al op de lijst"],
  ]);
  for (const r of res) {
    assert.ok(!("email" in r) && !("phone" in r), "geen contactgegevens in het resultaat");
  }
});

test("zoeken: like-tekens en komma's worden onschadelijk gemaakt", async () => {
  const { client, calls } = fakeAdmin(() => ({ data: [] }));
  await searchWalkInMembersCore(client, { pillar: "kettlebell", sessionDateIso: DAY, query: "a%,(b_", onListProfileIds: new Set() });
  const orArg = chainArg(calls[0], "or")?.[0] as string;
  assert.equal(orArg, "first_name.ilike.a\\%b\\_%,last_name.ilike.a\\%b\\_%");
});

// ---------------------------------------------------------------------------
// Bron: de actions gebruiken de kern en de RPC als gebruiker
// ---------------------------------------------------------------------------

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");

test("addWalkIn en undoWalkIn lopen via de kern; de actions schrijven zelf niet op bookings of check_ins", () => {
  const code = readFileSync(path.join(SRC, "lib/admin/attendance-actions.ts"), "utf8");
  assert.ok(code.includes("addWalkInCore("));
  assert.ok(code.includes("undoWalkInCore("));
  assert.ok(code.includes("searchWalkInMembersCore("));
  const core = readFileSync(path.join(SRC, "lib/attendance/walk-in-core.ts"), "utf8");
  assert.ok(core.includes('rpc("book_walk_in"'));
  assert.ok(core.includes('rpc("undo_walk_in"'));
  assert.ok(!/from\("bookings"\)\s*\.(insert|update|delete)\(/.test(core), "de kern schrijft niet zelf op bookings");
  assert.ok(!/from\("check_ins"\)/.test(core), "aanwezigheid alleen via setMemberAttendance");
});
