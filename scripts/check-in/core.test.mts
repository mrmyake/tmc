/**
 * Contract van src/lib/check-in/core.ts (fix/checkin-cookie-gate): elke
 * actie weigert een geweigerde gate vóór ze de database, emit of
 * revalidate aanraakt, en met een goede gate komen actor-id en actor-type
 * uit de gate (nooit meer "tablet" zonder id).
 * Run: npm run test:check-in
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmitEventInput } from "../../src/lib/events/emit";
import { chainArg, fakeAdmin, type Respond } from "../_helpers/fake-admin";
import {
  checkInByProfileIdCore,
  createWalkInProfileCore,
  getCheckInsThisWeekCore,
  getTodayCheckInRowsCore,
  getTodayCheckInsCore,
  searchProfilesCore,
  undoCheckInCore,
  type CheckInDeps,
  type StaffGate,
} from "../../src/lib/check-in/core";

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

const UNAUTHENTICATED: StaffGate = {
  ok: false,
  reason: "unauthenticated",
  message: "Je bent uitgelogd.",
};
const FORBIDDEN: StaffGate = { ok: false, reason: "forbidden", message: "Geen toegang." };
const DENIED: Array<[string, StaffGate]> = [
  ["uitgelogd", UNAUTHENTICATED],
  ["ingelogd maar geen staff", FORBIDDEN],
];

function okGate(actorType: "admin" | "trainer", userId = "staff-1"): StaffGate {
  return { ok: true, userId, actorType };
}

// ---------------------------------------------------------------------------
// Deps die ontploffen zodra iets ze aanraakt
// ---------------------------------------------------------------------------

function explodingDeps(): CheckInDeps {
  const boom = (what: string) => {
    throw new Error(`geweigerde gate raakte ${what} aan`);
  };
  const admin = new Proxy(
    {},
    {
      get(_target, prop) {
        return boom(`admin.${String(prop)}`);
      },
    },
  ) as unknown as SupabaseClient;
  return {
    admin,
    emit: async () => boom("emit"),
    revalidate: () => boom("revalidate"),
  };
}

// ---------------------------------------------------------------------------
// Fake Supabase-client: scripts/_helpers/fake-admin.mts (gedeeld met attendance)
// ---------------------------------------------------------------------------

function recordingDeps(respond: Respond) {
  const { client, calls } = fakeAdmin(respond);
  const events: EmitEventInput[] = [];
  const revalidated: string[] = [];
  const deps: CheckInDeps = {
    admin: client,
    emit: async (e) => {
      events.push(e);
      return true;
    },
    revalidate: (p) => {
      revalidated.push(p);
    },
  };
  return { deps, calls, events, revalidated };
}

// ---------------------------------------------------------------------------
// Geweigerde gate: geen enkele actie raakt iets aan
// ---------------------------------------------------------------------------

for (const [label, gate] of DENIED) {
  test(`checkInByProfileId weigert (${label}) zonder database`, async () => {
    const res = await checkInByProfileIdCore(gate, explodingDeps(), {
      profileId: "p1",
      pillar: "yoga_mobility",
    });
    assert.deepEqual(res, {
      ok: false,
      reason: "unauthorized",
      message: "Geen toegang tot deze actie.",
    });
  });

  test(`undoCheckIn weigert (${label}) zonder database`, async () => {
    const res = await undoCheckInCore(gate, explodingDeps(), "ci-1");
    assert.deepEqual(res, { ok: false, message: "Geen toegang tot deze actie." });
  });

  test(`createWalkInProfile weigert (${label}) zonder database`, async () => {
    const res = await createWalkInProfileCore(gate, explodingDeps(), {
      firstName: "A",
      lastName: "B",
      phoneRaw: "0612345678",
    });
    assert.deepEqual(res, { ok: false, message: "Geen toegang tot deze actie." });
  });

  test(`getCheckInsThisWeek weigert (${label}) zonder database`, async () => {
    assert.equal(await getCheckInsThisWeekCore(gate, explodingDeps(), "p1", "kettlebell"), 0);
  });

  test(`getTodayCheckIns (rooster) weigert (${label}) zonder database`, async () => {
    assert.deepEqual(await getTodayCheckInsCore(gate, explodingDeps()), []);
  });

  test(`searchProfiles weigert (${label}) zonder database`, async () => {
    assert.deepEqual(await searchProfilesCore(gate, explodingDeps(), "anna"), []);
  });

  test(`getTodayCheckIns (paneel) weigert (${label}) zonder database`, async () => {
    assert.deepEqual(await getTodayCheckInRowsCore(gate, explodingDeps()), []);
  });
}

// ---------------------------------------------------------------------------
// Goede gate: bedrading en actor-herkomst
// ---------------------------------------------------------------------------

test("checkInByProfileId schrijft checked_in_by en het event met de gate-actor", async () => {
  const { deps, calls, events, revalidated } = recordingDeps((call) => {
    if (call.table === "profiles") return { data: { first_name: "Anna", last_name: "Bakker" } };
    if (call.table === "booking_settings") {
      return { data: { check_in_enabled: true, check_in_pillars: ["yoga_mobility"] } };
    }
    if (call.table === "check_ins" && call.op === "insert") return { data: { id: "ci-9" } };
    return undefined;
  });

  const res = await checkInByProfileIdCore(okGate("trainer", "trainer-7"), deps, {
    profileId: "p1",
    pillar: "yoga_mobility",
    accessType: "membership",
    method: "admin_tablet",
  });

  assert.deepEqual(res, {
    ok: true,
    checkInId: "ci-9",
    profile: { id: "p1", firstName: "Anna", lastInitial: "B" },
    accessType: "membership",
    pillar: "yoga_mobility",
  });
  const insert = calls.find((c) => c.table === "check_ins" && c.op === "insert");
  assert.ok(insert, "check_ins insert ontbreekt");
  const row = chainArg(insert, "insert")?.[0] as Record<string, unknown>;
  assert.equal(row.checked_in_by, "trainer-7");
  assert.equal(row.check_in_method, "admin_tablet");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "checkin.recorded");
  assert.equal(events[0].actorType, "trainer");
  assert.equal(events[0].actorId, "trainer-7");
  assert.deepEqual(revalidated, ["/checkin", "/app/admin"]);
});

test("checkInByProfileId dwingt een onbekende method (bv. het oude self_tablet) af naar admin_web", async () => {
  const { deps, calls } = recordingDeps((call) => {
    if (call.table === "profiles") return { data: { first_name: "Anna", last_name: "B" } };
    if (call.table === "booking_settings") {
      return { data: { check_in_enabled: true, check_in_pillars: ["kettlebell"] } };
    }
    if (call.table === "check_ins" && call.op === "insert") return { data: { id: "ci-1" } };
    return undefined;
  });
  const res = await checkInByProfileIdCore(okGate("admin"), deps, {
    profileId: "p1",
    pillar: "kettlebell",
    accessType: "membership",
    // Een oude client kan dit nog sturen; het type kent de waarde niet meer.
    method: "self_tablet" as unknown as "admin_web",
  });
  assert.equal(res.ok, true);
  const insert = calls.find((c) => c.table === "check_ins" && c.op === "insert");
  const row = chainArg(insert!, "insert")?.[0] as Record<string, unknown>;
  assert.equal(row.check_in_method, "admin_web");
});

test("undoCheckIn verwijdert de rij en logt de gate-actor", async () => {
  const { deps, calls, events } = recordingDeps((call) => {
    if (call.table === "check_ins" && call.op === "select") {
      return { data: { profile_id: "p1", session_id: null, access_type: "membership" } };
    }
    return undefined;
  });
  const res = await undoCheckInCore(okGate("admin", "admin-1"), deps, "ci-1");
  assert.deepEqual(res, { ok: true });
  assert.ok(calls.some((c) => c.table === "check_ins" && c.op === "delete"));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "checkin.reverted");
  assert.equal(events[0].actorType, "admin");
  assert.equal(events[0].actorId, "admin-1");
});

test("undoCheckIn boekt een credit-rit terug op naam van de gate-actor", async () => {
  const { deps, calls } = recordingDeps((call) => {
    if (call.table === "check_ins" && call.op === "select") {
      return { data: { profile_id: "p1", session_id: null, access_type: "credit" } };
    }
    if (call.table === "memberships") return { data: { id: "m-1" } };
    return undefined;
  });
  const res = await undoCheckInCore(okGate("trainer", "trainer-2"), deps, "ci-1");
  assert.deepEqual(res, { ok: true });
  const rpc = calls.find((c) => c.table === "rpc:adjust_membership_credits");
  assert.ok(rpc, "refund-RPC ontbreekt");
  const args = chainArg(rpc, "adjust_membership_credits")?.[0] as Record<string, unknown>;
  assert.equal(args.p_actor_type, "trainer");
  assert.equal(args.p_actor_id, "trainer-2");
  assert.equal(args.p_delta, 1);
});

test("createWalkInProfile maakt de user aan en logt de gate-actor", async () => {
  const { deps, events } = recordingDeps((call) => {
    if (call.table === "profiles" && call.op === "select") return { data: null };
    return undefined;
  });
  const res = await createWalkInProfileCore(okGate("admin", "admin-1"), deps, {
    firstName: "Anna",
    lastName: "Bakker",
    phoneRaw: "06 12345678",
  });
  assert.deepEqual(res, { ok: true, profileId: "new-user" });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "member.created");
  assert.equal(events[0].actorType, "admin");
  assert.equal(events[0].actorId, "admin-1");
});

test("searchProfiles geeft gemapte rijen terug met een goede gate", async () => {
  const { deps } = recordingDeps((call) => {
    if (call.table === "profiles") {
      return {
        data: [
          {
            id: "p1",
            first_name: "Anna",
            last_name: "Bakker",
            phone: "+31612345678",
            member_code: "TMC-001",
            memberships: [{ covered_pillars: ["yoga_mobility"], status: "active" }],
          },
        ],
      };
    }
    return undefined;
  });
  const rows = await searchProfilesCore(okGate("trainer"), deps, "an");
  assert.deepEqual(rows, [
    {
      id: "p1",
      firstName: "Anna",
      lastName: "Bakker",
      phone: "+31612345678",
      memberCode: "TMC-001",
      coveredPillars: ["yoga_mobility"],
    },
  ]);
});

test("searchProfiles slaat de database over bij een te korte zoekterm", async () => {
  assert.deepEqual(await searchProfilesCore(okGate("admin"), explodingDeps(), "a"), []);
});
