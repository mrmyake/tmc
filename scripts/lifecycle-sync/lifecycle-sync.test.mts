/**
 * Deurtoegang direct na elke lifecycle-mutatie (spec-akiles-access.md,
 * feat/akiles-sync-on-lifecycle). Per pad: syncMembershipAccess precies een
 * keer na een geslaagde mutatie, nul keer bij een geweigerde of mislukte
 * mutatie. De productiecode wordt echt geladen; alleen de randen zijn stubs
 * (zie hooks.mjs). Run: npm run test:lifecycle-sync
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eqValue, hasOp } from "./stubs/query-builder.mjs";

type Ops = Array<{ op: string; args: unknown[] }>;

interface TestState {
  syncCalls: string[];
  syncThrows: boolean;
  notifications: unknown[];
  events: Array<{ type: string }>;
  user: { id: string } | null;
  mollie: { cancelOk?: boolean; mandateValid?: boolean | null; info?: unknown; createSub?: unknown };
  admin: (table: string, ops: Ops) => unknown;
  adminRpc: (name: string, args: unknown) => unknown;
  server: (table: string, ops: Ops) => unknown;
  rpc: (name: string, args: unknown, ops: Ops) => unknown;
}

declare global {
  var __lifecycleTest: TestState;
}

const PROFILE = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP = "22222222-2222-4222-8222-222222222222";

const membershipRow = {
  id: MEMBERSHIP,
  profile_id: PROFILE,
  status: "active",
  start_date: "2026-09-01",
  billing_cycle_weeks: 4,
  mollie_customer_id: "cst_1",
  mollie_subscription_id: "sub_1",
  pause_effective_date: null as string | null,
  cancellation_effective_date: null as string | null,
  price_per_cycle_cents: 7900,
  extended_access_price_cents: 0,
  resume_blocked_reason: null,
};

function reset() {
  globalThis.__lifecycleTest = {
    syncCalls: [],
    syncThrows: false,
    notifications: [],
    events: [],
    user: { id: PROFILE },
    mollie: {},
    admin: (table) => {
      if (table === "memberships") return { data: { ...membershipRow }, error: null };
      return { data: null, error: null };
    },
    adminRpc: () => ({ data: null, error: null }),
    server: () => ({ data: null, error: null }),
    rpc: () => ({ data: { ok: true }, error: null }),
  };
}

beforeEach(reset);

const lifecycle = () => import("../../src/lib/admin/membership-lifecycle.ts");
const memberActions = () => import("../../src/lib/member/membership-actions.ts");
const cancellationsCron = () => import("../../src/app/api/cron/process-cancellations/route.ts");
const activationChain = () => import("../../src/lib/orders/activation-chain.ts");

// --- pauseMembershipCore ------------------------------------------------------

test("pauze gepland: een sync na de geslaagde RPC", async () => {
  const { pauseMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.rpc = () => ({ data: { ok: true, immediate: false, pause_effective_date: "2026-10-28" }, error: null });
  const r = await pauseMembershipCore({ membershipId: MEMBERSHIP, reason: "medical" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(t.syncCalls, [PROFILE]);
});

test("pauze per direct (immediate-tak): een sync", async () => {
  const { pauseMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.rpc = () => ({ data: { ok: true, immediate: true, pause_effective_date: "2026-09-30", cancelled_bookings: 2 }, error: null });
  const r = await pauseMembershipCore({ membershipId: MEMBERSHIP });
  assert.equal(r.ok, true);
  assert.deepEqual(t.syncCalls, [PROFILE]);
});

test("pauze geweigerd door de RPC, RPC-fout of Mollie-cancel mislukt: geen sync", async () => {
  const { pauseMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.rpc = () => ({ data: { ok: false, reason: "not_active" }, error: null });
  assert.equal((await pauseMembershipCore({ membershipId: MEMBERSHIP })).ok, false);
  t.rpc = () => ({ data: null, error: { message: "boom" } });
  assert.equal((await pauseMembershipCore({ membershipId: MEMBERSHIP })).ok, false);
  t.mollie.cancelOk = false;
  t.rpc = () => ({ data: { ok: true }, error: null });
  const r = await pauseMembershipCore({ membershipId: MEMBERSHIP });
  assert.equal(r.ok, false);
  assert.equal(r.ok ? "" : r.reason, "mollie_cancel_failed");
  assert.deepEqual(t.syncCalls, []);
});

test("pauze al gepland (vroege ok-return zonder mutatie): geen sync", async () => {
  const { pauseMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.admin = () => ({ data: { ...membershipRow, pause_effective_date: "2026-10-28" }, error: null });
  const r = await pauseMembershipCore({ membershipId: MEMBERSHIP });
  assert.equal(r.ok, true);
  assert.deepEqual(t.syncCalls, []);
});

// --- resumeMembershipCore -----------------------------------------------------

function pausedRow() {
  return { ...membershipRow, status: "paused", pause_effective_date: "2026-09-15", mollie_subscription_id: null };
}

test("hervatten: een sync na de geslaagde RPC", async () => {
  const { resumeMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.admin = () => ({ data: pausedRow(), error: null });
  t.rpc = (name) => (name === "admin_resume_membership" ? { data: { ok: true, shift_days: 15 }, error: null } : { data: null, error: null });
  const r = await resumeMembershipCore({ membershipId: MEMBERSHIP });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(t.syncCalls, [PROFILE]);
});

test("hervatten met already_active: ook een sync", async () => {
  const { resumeMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.admin = () => ({ data: pausedRow(), error: null });
  t.rpc = () => ({ data: { ok: true, already_active: true }, error: null });
  const r = await resumeMembershipCore({ membershipId: MEMBERSHIP });
  assert.equal(r.ok, true);
  assert.deepEqual(t.syncCalls, [PROFILE]);
});

test("hervatten geweigerd (mandaat ongeldig, RPC-fout, niet gepauzeerd): geen sync", async () => {
  const { resumeMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.admin = () => ({ data: pausedRow(), error: null });
  t.mollie.mandateValid = false;
  const a = await resumeMembershipCore({ membershipId: MEMBERSHIP });
  assert.equal(a.ok ? "" : a.reason, "mandate_invalid");
  t.mollie.mandateValid = true;
  t.rpc = (name) => (name === "admin_resume_membership" ? { data: null, error: { message: "boom" } } : { data: null, error: null });
  const b = await resumeMembershipCore({ membershipId: MEMBERSHIP });
  assert.equal(b.ok, false);
  t.admin = () => ({ data: { ...membershipRow, status: "cancelled" }, error: null });
  const c = await resumeMembershipCore({ membershipId: MEMBERSHIP });
  assert.equal(c.ok ? "" : c.reason, "not_paused");
  assert.deepEqual(t.syncCalls, []);
});

// --- cancelMembershipCore -----------------------------------------------------

test("stopzetten gepland en harde stop: telkens een sync", async () => {
  const { cancelMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.rpc = () => ({ data: { ok: true, mode: "scheduled", effective_date: "2026-10-28" }, error: null });
  assert.equal((await cancelMembershipCore({ membershipId: MEMBERSHIP, reason: "verhuisd" })).ok, true);
  t.rpc = () => ({ data: { ok: true, mode: "immediate", hard_stop: true }, error: null });
  assert.equal((await cancelMembershipCore({ membershipId: MEMBERSHIP, reason: "geschil", hardStop: true })).ok, true);
  assert.deepEqual(t.syncCalls, [PROFILE, PROFILE]);
});

test("stopzetten already_scheduled en already_cancelled uit de RPC: een sync (Mollie is dan wel gestopt)", async () => {
  const { cancelMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.rpc = () => ({ data: { ok: true, already_scheduled: true, effective_date: "2026-10-28" }, error: null });
  assert.equal((await cancelMembershipCore({ membershipId: MEMBERSHIP, reason: "x" })).ok, true);
  t.rpc = () => ({ data: { ok: true, already_cancelled: true }, error: null });
  assert.equal((await cancelMembershipCore({ membershipId: MEMBERSHIP, reason: "x" })).ok, true);
  assert.deepEqual(t.syncCalls, [PROFILE, PROFILE]);
});

test("stopzetten geweigerd (geen reden, RPC weigert, RPC-fout, al cancelled zonder mutatie): geen sync", async () => {
  const { cancelMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  assert.equal((await cancelMembershipCore({ membershipId: MEMBERSHIP, reason: "  " })).ok, false);
  t.rpc = () => ({ data: { ok: false, reason: "not_cancellable" }, error: null });
  assert.equal((await cancelMembershipCore({ membershipId: MEMBERSHIP, reason: "x" })).ok, false);
  t.rpc = () => ({ data: null, error: { message: "boom" } });
  assert.equal((await cancelMembershipCore({ membershipId: MEMBERSHIP, reason: "x" })).ok, false);
  t.admin = () => ({ data: { ...membershipRow, status: "cancelled" }, error: null });
  assert.equal((await cancelMembershipCore({ membershipId: MEMBERSHIP, reason: "x" })).ok, true);
  assert.deepEqual(t.syncCalls, []);
});

// --- undoMembershipCancellation -----------------------------------------------

test("opzegging ongedaan: profiel via de membership opgezocht, een sync", async () => {
  const { undoMembershipCancellation } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  const lookups: unknown[] = [];
  t.admin = (table, ops) => {
    lookups.push({ table, id: eqValue(ops, "id"), single: hasOp(ops, "maybeSingle") });
    return { data: { profile_id: PROFILE }, error: null };
  };
  t.rpc = () => ({ data: { ok: true, restored_status: "active", undone_effective_date: "2026-10-28" }, error: null });
  const r = await undoMembershipCancellation({ membershipId: MEMBERSHIP });
  assert.equal(r.ok, true);
  assert.deepEqual(t.syncCalls, [PROFILE]);
  assert.deepEqual(lookups, [{ table: "memberships", id: MEMBERSHIP, single: true }]);
});

test("opzegging ongedaan met already_active: een sync", async () => {
  const { undoMembershipCancellation } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.admin = () => ({ data: { profile_id: PROFILE }, error: null });
  t.rpc = () => ({ data: { ok: true, already_active: true }, error: null });
  assert.equal((await undoMembershipCancellation({ membershipId: MEMBERSHIP })).ok, true);
  assert.deepEqual(t.syncCalls, [PROFILE]);
});

test("opzegging ongedaan geweigerd of RPC-fout: geen sync", async () => {
  const { undoMembershipCancellation } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.admin = () => ({ data: { profile_id: PROFILE }, error: null });
  for (const reason of ["not_safely_undoable", "already_cancelled", "effectuation_due", "other"]) {
    t.rpc = () => ({ data: { ok: false, reason }, error: null });
    assert.equal((await undoMembershipCancellation({ membershipId: MEMBERSHIP })).ok, false);
  }
  t.rpc = () => ({ data: null, error: { message: "boom" } });
  assert.equal((await undoMembershipCancellation({ membershipId: MEMBERSHIP })).ok, false);
  assert.deepEqual(t.syncCalls, []);
});

// --- opzegactie lid -----------------------------------------------------------

test("lid zegt op: een sync met het eigen profiel na het event", async () => {
  const { requestMembershipCancellation } = await memberActions();
  const t = globalThis.__lifecycleTest;
  t.rpc = (name, _args, ops) => {
    assert.equal(name, "request_membership_cancellation");
    assert.ok(hasOp(ops, "select") && hasOp(ops, "maybeSingle"));
    return { data: { cancellation_effective_date: "2026-10-28" }, error: null };
  };
  const r = await requestMembershipCancellation({ membershipId: MEMBERSHIP });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(t.syncCalls, [PROFILE]);
  assert.ok(t.events.some((e) => e.type === "membership.cancellation_requested"));
});

test("lid zegt op maar de RPC weigert, of het lid is uitgelogd: geen sync", async () => {
  const { requestMembershipCancellation } = await memberActions();
  const t = globalThis.__lifecycleTest;
  t.rpc = () => ({ data: null, error: { message: "invalid transition" } });
  assert.equal((await requestMembershipCancellation({ membershipId: MEMBERSHIP })).ok, false);
  t.user = null;
  assert.equal((await requestMembershipCancellation({ membershipId: MEMBERSHIP })).ok, false);
  assert.deepEqual(t.syncCalls, []);
});

// --- process-cancellations ----------------------------------------------------

test("process-cancellations: een sync per afgeronde membership, geen sync bij Mollie- of update-fout", async () => {
  const { GET } = await cancellationsCron();
  const t = globalThis.__lifecycleTest;
  const due = [
    { id: "m-ok", profile_id: "p-ok", plan_variant: "x", mollie_customer_id: "cst", mollie_subscription_id: null },
    { id: "m-mollie", profile_id: "p-mollie", plan_variant: "x", mollie_customer_id: "cst", mollie_subscription_id: "sub_x" },
    { id: "m-update", profile_id: "p-update", plan_variant: "x", mollie_customer_id: "cst", mollie_subscription_id: null },
  ];
  t.mollie.cancelOk = false;
  t.admin = (table, ops) => {
    if (table !== "memberships") return { data: null, error: null };
    if (hasOp(ops, "update")) {
      return eqValue(ops, "id") === "m-update" ? { data: null, error: { message: "boom" } } : { data: null, error: null };
    }
    return { data: due, error: null };
  };
  const res = await GET(new Request("http://localhost/api/cron/process-cancellations"));
  const body = (await res.json()) as { processed: number; failed: number };
  assert.equal(body.processed, 1);
  assert.equal(body.failed, 2);
  assert.deepEqual(t.syncCalls, ["p-ok"]);
});

// --- activation-chain, retry-tak ---------------------------------------------

function chainInput(profileId: string | null) {
  const t = globalThis.__lifecycleTest;
  return {
    supabase: {
      rpc: async (name: string, args: unknown) => t.adminRpc(name, args),
      from: (table: string) => {
        const ops: Ops = [];
        const q: Record<string, unknown> = new Proxy(
          {},
          {
            get(_, prop) {
              if (prop === "then") {
                const p = Promise.resolve().then(() => t.admin(table, ops));
                return p.then.bind(p);
              }
              if (prop === "catch" || prop === "finally") return undefined;
              return (...args: unknown[]) => {
                ops.push({ op: String(prop), args });
                return q;
              };
            },
          },
        );
        return q;
      },
    },
    mollie: {} as never,
    mode: "test" as const,
    orderId: "order-1",
    payment: { id: "tr_1", amountCents: 7900 },
    profileId,
  };
}

test("activation-chain retry (already_activated) met membership: een sync, profiel via lookup als de aanroeper geen profileId heeft", async () => {
  const { runActivationChain } = await activationChain();
  const t = globalThis.__lifecycleTest;
  t.adminRpc = () => ({ data: { ok: true, already_activated: true, membership_id: MEMBERSHIP, needs_subscription: false }, error: null });
  t.admin = (table, ops) => (table === "memberships" && eqValue(ops, "id") === MEMBERSHIP ? { data: { profile_id: PROFILE }, error: null } : { data: null, error: null });
  const r = await runActivationChain({ source: "webhook", actorType: "system" } as never, chainInput(null) as never);
  assert.deepEqual(r, { outcome: "ok", step: "already_activated" });
  assert.deepEqual(t.syncCalls, [PROFILE]);
});

test("activation-chain retry met profileId van de aanroeper: een sync zonder lookup", async () => {
  const { runActivationChain } = await activationChain();
  const t = globalThis.__lifecycleTest;
  t.adminRpc = () => ({ data: { ok: true, already_activated: true, membership_id: MEMBERSHIP, needs_subscription: false }, error: null });
  t.admin = () => {
    throw new Error("geen lookup verwacht");
  };
  await runActivationChain({ source: "cron_reconcile", actorType: "system" } as never, chainInput(PROFILE) as never);
  assert.deepEqual(t.syncCalls, [PROFILE]);
});

test("activation-chain retry zonder membership (pt_order), geweigerde activatie of RPC-fout: geen sync", async () => {
  const { runActivationChain } = await activationChain();
  const t = globalThis.__lifecycleTest;
  t.adminRpc = () => ({ data: { ok: true, already_activated: true, membership_id: null, pt_order: true }, error: null });
  await runActivationChain({ source: "webhook", actorType: "system" } as never, chainInput(PROFILE) as never);
  t.adminRpc = () => ({ data: { ok: false, reason: "blocked_duplicate_membership" }, error: null });
  await runActivationChain({ source: "webhook", actorType: "system" } as never, chainInput(PROFILE) as never);
  t.adminRpc = () => ({ data: null, error: { message: "permanent", code: "P0001" } });
  await runActivationChain({ source: "webhook", actorType: "system" } as never, chainInput(PROFILE) as never);
  assert.deepEqual(t.syncCalls, []);
});

test("activation-chain eerste activatie: bestaande sync blijft precies een keer", async () => {
  const { runActivationChain } = await activationChain();
  const t = globalThis.__lifecycleTest;
  t.adminRpc = () => ({ data: { ok: true, already_activated: false, membership_id: MEMBERSHIP, needs_subscription: false }, error: null });
  await runActivationChain({ source: "webhook", actorType: "system" } as never, chainInput(PROFILE) as never);
  assert.deepEqual(t.syncCalls, [PROFILE]);
});

// --- de helper zelf -----------------------------------------------------------

test("syncAfterLifecycle throwt niet als de sync throwt, de lookup faalt of de membership onbekend is", async () => {
  const { syncAfterLifecycle } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.syncThrows = true;
  await syncAfterLifecycle({ profileId: PROFILE });
  assert.deepEqual(t.syncCalls, [PROFILE]);
  t.syncThrows = false;
  t.syncCalls = [];
  t.admin = () => ({ data: null, error: { message: "db weg" } });
  await syncAfterLifecycle({ membershipId: MEMBERSHIP });
  t.admin = () => ({ data: null, error: null });
  await syncAfterLifecycle({ membershipId: MEMBERSHIP });
  t.admin = () => {
    throw new Error("client kapot");
  };
  await syncAfterLifecycle({ membershipId: MEMBERSHIP });
  assert.deepEqual(t.syncCalls, [], "zonder profiel wordt niet gesynct");
});

test("een geslaagde mutatie blijft ok als de sync daarna faalt", async () => {
  const { pauseMembershipCore } = await lifecycle();
  const t = globalThis.__lifecycleTest;
  t.syncThrows = true;
  t.rpc = () => ({ data: { ok: true, immediate: true }, error: null });
  const r = await pauseMembershipCore({ membershipId: MEMBERSHIP });
  assert.equal(r.ok, true);
  assert.deepEqual(t.syncCalls, [PROFILE]);
});
