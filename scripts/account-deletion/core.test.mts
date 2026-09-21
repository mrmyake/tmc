/**
 * Draait de ECHTE kern van de accountverwijdering
 * (src/lib/account-deletion/core.ts) met fakes. Bewijst: het verzoek
 * snapshot eerst en bevriest direct, is idempotent, stelt de purge uit op
 * een lopend abonnement maar weigert het verzoek nooit; de purge volgt de
 * vaste volgorde, blokkeert het profiel alleen op geld en deur, laat
 * MailerLite nooit blokkeren, kiest anonimiseren bij financiele historie
 * en hard delete zonder, herkanst wat faalt, en meldt alleen ids.
 * Run: npm run test:account-deletion
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancelDeletionRequestCore,
  computePurgeAfter,
  processDueDeletionsCore,
  requestDeletionCore,
  runCustomerRetentionCore,
  runPurgeCore,
} from "../../src/lib/account-deletion/core";
import type { DeletionConfig } from "../../src/lib/account-deletion/config";
import type {
  DeletionDeps,
  DeletionProfileSnapshot,
  DeletionRow,
  DeletionRowPatch,
} from "../../src/lib/account-deletion/types";

const NOW = new Date("2026-09-21T10:00:00.000Z");
const PROFILE = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP = "22222222-2222-4222-8222-222222222222";
const EMAIL = "lid@example.com";

const CONFIG: DeletionConfig = {
  coolingOffDays: 30,
  allowWithinCommitment: true,
  paymentFailedPolicy: "defer",
  invoiceSettleDays: 7,
  mollieCustomerRetentionMonths: 13,
  mailerliteMode: "forget",
  notifyAfterAttempts: 3,
};

function snapshot(overrides: Partial<DeletionProfileSnapshot> = {}): DeletionProfileSnapshot {
  return {
    id: PROFILE,
    member_code: "123456",
    email: EMAIL,
    role: "member",
    is_test: true,
    first_name: "Test",
    mollie_customer_id: "cst_abc",
    akiles_member_id: "mem_abc",
    akiles_magic_link_id: "ml_abc",
    memberships: [
      {
        id: MEMBERSHIP,
        status: "active",
        mollie_customer_id: "cst_abc",
        mollie_subscription_id: "sub_abc",
        commit_end_date: "2027-03-01",
        cancellation_effective_date: null,
        billing_cycle_weeks: 4,
      },
    ],
    ...overrides,
  };
}

class Fake implements DeletionDeps {
  profile: DeletionProfileSnapshot | null = snapshot();
  rows = new Map<string, DeletionRow>();
  live: DeletionProfileSnapshot["memberships"] = [];
  calls: string[] = [];
  notifications: string[] = [];
  events: string[] = [];
  openDeviceTokens = false;
  financialHistory = true;
  mollieOk = true;
  mailerliteOk = true;
  mailOk = true;
  anonymiseResult: Awaited<ReturnType<DeletionDeps["db"]["anonymiseProfile"]>> = { ok: true, anonymised: true };
  cancelOutcome: Awaited<ReturnType<DeletionDeps["cancelMembership"]>> = {
    ok: true,
    effectiveDate: "2027-03-01",
  };
  clock = NOW;
  private seq = 0;

  now = () => this.clock;
  log = { info: () => {}, error: () => {} };

  db: DeletionDeps["db"] = {
    getProfileSnapshot: async () => {
      this.calls.push("getProfileSnapshot");
      return this.profile;
    },
    findOpenDeletion: async (profileId) =>
      [...this.rows.values()].find(
        (r) => r.profile_id === profileId && ["requested", "in_progress", "blocked"].includes(r.status),
      ) ?? null,
    insertDeletion: async (row) => {
      this.calls.push("insertDeletion");
      const full = { ...row, id: `del-${++this.seq}` } as DeletionRow;
      this.rows.set(full.id, full);
      return full;
    },
    getDeletion: async (id) => this.rows.get(id) ?? null,
    updateDeletion: async (id, patch: DeletionRowPatch) => {
      const cur = this.rows.get(id);
      if (!cur) throw new Error("rij weg");
      const next = { ...cur, ...patch } as DeletionRow;
      this.rows.set(id, next);
      return next;
    },
    listDueDeletions: async (nowIso) =>
      [...this.rows.values()].filter(
        (r) => ["requested", "in_progress", "blocked"].includes(r.status) && r.purge_after <= nowIso,
      ),
    listCustomerRetentionDue: async (beforeIso) =>
      [...this.rows.values()].filter(
        (r) => r.status === "completed" && r.mollie_customer_id && (r.completed_at ?? "") <= beforeIso,
      ),
    listLiveMemberships: async () => this.live,
    cancelFutureBookings: async () => {
      this.calls.push("cancelFutureBookings");
      return 2;
    },
    removeWaitlistEntries: async () => {
      this.calls.push("removeWaitlistEntries");
      return 1;
    },
    cancelFuturePtBookings: async () => {
      this.calls.push("cancelFuturePtBookings");
      return 0;
    },
    cancelFutureGuestBookings: async () => {
      this.calls.push("cancelFutureGuestBookings");
      return 0;
    },
    removePushTokens: async () => {
      this.calls.push("removePushTokens");
      return 1;
    },
    setMarketingOptOut: async () => {
      this.calls.push("setMarketingOptOut");
    },
    hasOpenDeviceTokens: async () => this.openDeviceTokens,
    hasFinancialHistory: async () => this.financialHistory,
    removeAvatar: async () => {
      this.calls.push("removeAvatar");
    },
    anonymiseProfile: async () => {
      this.calls.push("anonymiseProfile");
      return this.anonymiseResult;
    },
    hardDeleteAuthUser: async (profileId) => {
      this.calls.push("hardDeleteAuthUser");
      // FK account_deletions.profile_id is ON DELETE SET NULL (PR #206).
      for (const [id, r] of this.rows) {
        if (r.profile_id === profileId) this.rows.set(id, { ...r, profile_id: null });
      }
    },
    banAuthUser: async () => {
      this.calls.push("banAuthUser");
    },
    unbanAuthUser: async () => {
      this.calls.push("unbanAuthUser");
    },
  };
  cancelMembership = async (id: string) => {
    this.calls.push(`cancelMembership:${id}`);
    return this.cancelOutcome;
  };
  mollie: DeletionDeps["mollie"] = {
    cancelSubscription: async (_t, _c, id) => {
      this.calls.push(`mollie.cancelSubscription:${id}`);
      return this.mollieOk;
    },
    deleteCustomer: async (_t, id) => {
      this.calls.push(`mollie.deleteCustomer:${id}`);
      return this.mollieOk;
    },
  };
  akiles: DeletionDeps["akiles"] = {
    syncAccess: async () => {
      this.calls.push("akiles.syncAccess");
      return { ok: true };
    },
    revokeAllDeviceTokens: async () => {
      this.calls.push("akiles.revokeAllDeviceTokens");
      return { revoked: 1, deferred: 0 };
    },
    deleteMember: async (_p, id, pseudonym) => {
      this.calls.push(`akiles.deleteMember:${id}:${pseudonym}`);
      return { ok: true };
    },
  };
  mailerlite: DeletionDeps["mailerlite"] = {
    findSubscriberId: async () => {
      this.calls.push("mailerlite.findSubscriberId");
      return "987";
    },
    forget: async (id) => {
      this.calls.push(`mailerlite.forget:${id}`);
      return this.mailerliteOk;
    },
    unsubscribe: async () => {
      this.calls.push("mailerlite.unsubscribe");
      return true;
    },
  };
  sendClosingMail = async (email: string) => {
    this.calls.push(`sendClosingMail:${email}`);
    return this.mailOk;
  };
  emit = async (event: Parameters<DeletionDeps["emit"]>[0]) => {
    this.events.push(event.type);
  };
  notify = async (title: string, message: string) => {
    this.notifications.push(`${title}: ${message}`);
  };
}

async function requested(fake: Fake, hardStop = false) {
  const r = await requestDeletionCore(fake, CONFIG, {
    profileId: PROFILE,
    requestedVia: hardStop ? "admin" : "member_app",
    reason: "geen tijd meer",
    actorType: hardStop ? "admin" : "member",
    actorId: PROFILE,
    hardStop,
  });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("unreachable");
  return r;
}

test("computePurgeAfter: bedenktijd, of later als een opzegging later ingaat; hardstop is nu", () => {
  const cooling = computePurgeAfter(NOW, CONFIG, [], false);
  assert.equal(cooling.toISOString(), "2026-10-21T10:00:00.000Z");
  const later = computePurgeAfter(NOW, CONFIG, ["2027-03-01"], false);
  assert.equal(later.toISOString(), "2027-03-09T00:00:00.000Z");
  const earlier = computePurgeAfter(NOW, CONFIG, ["2026-09-25"], false);
  assert.equal(earlier.toISOString(), "2026-10-21T10:00:00.000Z");
  assert.equal(computePurgeAfter(NOW, CONFIG, ["2027-03-01"], true), NOW);
});

test("verzoek: snapshot eerst, dan freeze, dan opzegging; purge wacht op het abonnement; melding alleen ids", async () => {
  const fake = new Fake();
  const r = await requested(fake);
  assert.equal(r.alreadyOpen, false);
  assert.equal(fake.calls[0], "getProfileSnapshot");
  assert.equal(fake.calls[1], "insertDeletion", "snapshot voor de eerste externe aanroep");
  assert.ok(fake.calls.indexOf("banAuthUser") < fake.calls.indexOf(`cancelMembership:${MEMBERSHIP}`));
  for (const c of [
    "banAuthUser",
    "akiles.syncAccess",
    "akiles.revokeAllDeviceTokens",
    "removePushTokens",
    "cancelFutureBookings",
    "removeWaitlistEntries",
    "setMarketingOptOut",
    "mailerlite.unsubscribe",
  ]) {
    assert.ok(fake.calls.includes(c), `freeze mist ${c}`);
  }
  assert.equal(r.row.status, "requested");
  assert.equal(r.row.email_at_request, EMAIL);
  assert.equal(r.row.akiles_member_id, "mem_abc");
  assert.equal(r.row.mollie_customer_id, "cst_abc");
  assert.deepEqual(r.row.mollie_subscription_ids, ["sub_abc"]);
  assert.equal(r.row.step_status.freeze, "done");
  // Opzegging landt op commit_end_date 2027-03-01: purge pas daarna plus marge.
  assert.equal(r.row.purge_after, "2027-03-09T00:00:00.000Z");
  assert.deepEqual(fake.events, ["member.deletion_requested"]);
  assert.equal(fake.notifications.length, 1);
  assert.ok(!fake.notifications[0].includes("@"), "geen e-mailadres in de melding");
  assert.ok(!fake.notifications[0].includes("Test"), "geen naam in de melding");
  assert.ok(fake.notifications[0].includes(PROFILE));
});

test("verzoek is idempotent: tweede aanvraag geeft dezelfde rij, geen tweede insert, wel opnieuw de freeze", async () => {
  const fake = new Fake();
  const first = await requested(fake);
  const inserts = fake.calls.filter((c) => c === "insertDeletion").length;
  const second = await requested(fake);
  assert.equal(second.alreadyOpen, true);
  assert.equal(second.row.id, first.row.id);
  assert.equal(fake.calls.filter((c) => c === "insertDeletion").length, inserts);
  assert.equal(fake.calls.filter((c) => c === "banAuthUser").length, 2);
});

test("verzoek wordt nooit geweigerd op een lopend abonnement met de default config, ook niet binnen commitment of bij payment_failed", async () => {
  const fake = new Fake();
  fake.profile = snapshot({
    memberships: [
      { ...snapshot().memberships[0], status: "payment_failed", commit_end_date: "2028-01-01" },
    ],
  });
  const r = await requested(fake);
  assert.equal(r.ok, true);
  assert.ok(fake.calls.includes(`cancelMembership:${MEMBERSHIP}`));
});

test("verzoek: config.block-varianten weigeren netjes zonder rij of freeze", async () => {
  const fake = new Fake();
  const r = await requestDeletionCore(
    fake,
    { ...CONFIG, allowWithinCommitment: false },
    { profileId: PROFILE, requestedVia: "member_app", reason: null, actorType: "member", actorId: PROFILE },
  );
  assert.deepEqual(r, { ok: false, reason: "within_commitment" });
  assert.ok(!fake.calls.includes("insertDeletion"));
  assert.ok(!fake.calls.includes("banAuthUser"));
});

test("verzoek: staf wordt geweigerd", async () => {
  const fake = new Fake();
  fake.profile = snapshot({ role: "trainer" });
  const r = await requestDeletionCore(fake, CONFIG, {
    profileId: PROFILE, requestedVia: "admin", reason: null, actorType: "admin", actorId: null,
  });
  assert.deepEqual(r, { ok: false, reason: "staff_role" });
});

test("purge: abonnement in opzegtermijn stelt uit (purge_after naar ingangsdatum), geen profielstap", async () => {
  const fake = new Fake();
  const { row } = await requested(fake, true);
  fake.live = [{ ...snapshot().memberships[0], status: "cancellation_requested", cancellation_effective_date: "2026-10-15" }];
  const out = await runPurgeCore(fake, CONFIG, row);
  assert.equal(out.completed, false);
  assert.equal(out.blocked, false);
  assert.equal(out.row.status, "in_progress");
  assert.equal(out.row.purge_after, "2026-10-23T00:00:00.000Z");
  assert.ok(!fake.calls.includes("anonymiseProfile"));
  assert.ok(!fake.calls.some((c) => c.startsWith("mollie.cancelSubscription")));
});

test("purge: membership die nooit op cancellation_requested kwam blokkeert met melding; geen directe update", async () => {
  const fake = new Fake();
  const { row } = await requested(fake, true);
  fake.live = [{ ...snapshot().memberships[0], status: "active" }];
  const out = await runPurgeCore(fake, CONFIG, row);
  assert.equal(out.blocked, true);
  assert.equal(out.row.status, "blocked");
  assert.match(out.row.last_error.mollie_subscription ?? "", /admin-hardstop nodig/);
  assert.equal(fake.notifications.at(-1)?.startsWith("Accountverwijdering geblokkeerd"), true);
});

test("purge happy path met financiele historie: vaste volgorde, anonimiseren, mail vanaf snapshot, completed, customer op pending", async () => {
  const fake = new Fake();
  const { row } = await requested(fake, true);
  fake.calls = [];
  const out = await runPurgeCore(fake, CONFIG, row);
  assert.equal(out.completed, true);
  assert.equal(out.row.status, "completed");
  // akiles.syncAccess zit al in de freeze (veiligheidsdeel, voor Mollie);
  // de Akiles-stap zelf (member weg) volgt na Mollie.
  const order = [
    "mollie.cancelSubscription:sub_abc",
    "akiles.deleteMember:mem_abc:Verwijderd lid 123456",
    "mailerlite.findSubscriberId",
    "mailerlite.forget:987",
    "removeAvatar",
    "anonymiseProfile",
    `sendClosingMail:${EMAIL}`,
  ].map((c) => fake.calls.indexOf(c));
  assert.ok(order.every((i) => i >= 0), `ontbrekende stap: ${JSON.stringify(fake.calls)}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "stappen in de vaste volgorde");
  assert.ok(!fake.calls.includes("hardDeleteAuthUser"));
  assert.equal(out.row.email_at_request, null, "adres gewist na de afsluitmail");
  assert.equal(out.row.mailerlite_subscriber_id, "987");
  assert.equal(out.row.step_status.mollie_customer, "pending");
  assert.ok(fake.events.includes("member.deleted"));
  for (const step of ["freeze", "mollie_subscription", "akiles", "mailerlite", "push", "profile", "confirmation_mail"]) {
    assert.equal(out.row.step_status[step as keyof typeof out.row.step_status], "done", step);
  }
});

test("purge zonder financiele historie: hard delete, geen anonimiseren", async () => {
  const fake = new Fake();
  fake.financialHistory = false;
  const { row } = await requested(fake, true);
  const out = await runPurgeCore(fake, CONFIG, row);
  assert.equal(out.completed, true);
  assert.ok(fake.calls.includes("hardDeleteAuthUser"));
  assert.ok(!fake.calls.includes("anonymiseProfile"));
  assert.equal(out.row.profile_id, null);
});

test("purge: Mollie-cancel mislukt houdt het profiel tegen; volgende run rondt af", async () => {
  const fake = new Fake();
  fake.mollieOk = false;
  const { row } = await requested(fake, true);
  const first = await runPurgeCore(fake, CONFIG, row);
  assert.equal(first.completed, false);
  assert.equal(first.row.status, "in_progress");
  assert.equal(first.row.step_status.mollie_subscription, "failed");
  assert.equal(first.row.step_status.profile, "failed");
  assert.match(first.row.last_error.profile ?? "", /mollie_subscription/);
  assert.ok(!fake.calls.includes("anonymiseProfile"));
  assert.equal(first.row.attempts, 1);

  fake.mollieOk = true;
  const second = await runPurgeCore(fake, CONFIG, first.row);
  assert.equal(second.completed, true);
  assert.equal(second.row.attempts, 2);
  assert.equal(second.row.last_error.mollie_subscription, undefined);
});

test("purge: open device-token houdt het profiel tegen", async () => {
  const fake = new Fake();
  fake.openDeviceTokens = true;
  const { row } = await requested(fake, true);
  const out = await runPurgeCore(fake, CONFIG, row);
  assert.equal(out.completed, false);
  assert.equal(out.row.step_status.akiles, "failed");
  assert.equal(out.row.step_status.profile, "failed");
  assert.ok(!fake.calls.includes("anonymiseProfile"));
});

test("purge: MailerLite mislukt blokkeert niets en wordt skipped bij afronding", async () => {
  const fake = new Fake();
  fake.mailerliteOk = false;
  const { row } = await requested(fake, true);
  const out = await runPurgeCore(fake, CONFIG, row);
  assert.equal(out.completed, true);
  assert.equal(out.row.step_status.mailerlite, "skipped");
  assert.equal(out.row.last_error.mailerlite, "forget mislukt");
});

test("purge: afsluitmail mislukt houdt de rij open maar het profiel is wel weg; herkansing stuurt en wist het adres", async () => {
  const fake = new Fake();
  fake.mailOk = false;
  const { row } = await requested(fake, true);
  const first = await runPurgeCore(fake, CONFIG, row);
  assert.equal(first.completed, false);
  assert.equal(first.row.step_status.profile, "done");
  assert.equal(first.row.step_status.confirmation_mail, "failed");
  assert.equal(first.row.email_at_request, EMAIL);
  fake.mailOk = true;
  const second = await runPurgeCore(fake, CONFIG, first.row);
  assert.equal(second.completed, true);
  assert.equal(second.row.email_at_request, null);
  assert.equal(fake.calls.filter((c) => c === "anonymiseProfile").length, 1, "profiel niet twee keer");
});

test("purge: anonimiseren geweigerd door de RPC zet de rij op blocked met melding", async () => {
  const fake = new Fake();
  fake.anonymiseResult = { ok: false, reason: "blocked", blockers: ["open_order"] };
  const { row } = await requested(fake, true);
  const out = await runPurgeCore(fake, CONFIG, row);
  assert.equal(out.blocked, true);
  assert.equal(out.row.status, "blocked");
  assert.match(out.row.last_error.profile ?? "", /open_order/);
  assert.ok(fake.notifications.at(-1)?.includes(row.id));
});

test("purge: na drie mislukte pogingen een melding met alleen ids", async () => {
  const fake = new Fake();
  fake.mollieOk = false;
  let { row } = await requested(fake, true);
  fake.notifications = [];
  for (let i = 0; i < 3; i++) row = (await runPurgeCore(fake, CONFIG, row)).row;
  assert.equal(fake.notifications.length, 1);
  assert.ok(fake.notifications[0].includes(row.id));
  assert.ok(!fake.notifications[0].includes("@"));
});

test("retentie: Mollie-customer pas na 13 maanden, via processDueDeletionsCore", async () => {
  const fake = new Fake();
  const { row } = await requested(fake, true);
  await runPurgeCore(fake, CONFIG, row);
  fake.calls = [];
  fake.clock = new Date("2027-06-01T10:00:00.000Z");
  const early = await processDueDeletionsCore(fake, CONFIG, { deadlineMs: Date.now() + 60_000 });
  assert.equal(early.customersDeleted, 0);
  assert.ok(!fake.calls.some((c) => c.startsWith("mollie.deleteCustomer")));
  fake.clock = new Date("2027-11-01T10:00:00.000Z");
  const late = await processDueDeletionsCore(fake, CONFIG, { deadlineMs: Date.now() + 60_000 });
  assert.equal(late.customersDeleted, 1);
  assert.ok(fake.calls.includes("mollie.deleteCustomer:cst_abc"));
  assert.equal(fake.rows.get(row.id)?.mollie_customer_id, null);
  assert.equal(fake.rows.get(row.id)?.step_status.mollie_customer, "done");
});

test("retentie: mislukte delete laat het id staan met last_error", async () => {
  const fake = new Fake();
  const { row } = await requested(fake, true);
  const purged = await runPurgeCore(fake, CONFIG, row);
  fake.mollieOk = false;
  const r = await runCustomerRetentionCore(fake, purged.row);
  assert.equal(r.ok, false);
  assert.equal(fake.rows.get(row.id)?.mollie_customer_id, "cst_abc");
  assert.equal(fake.rows.get(row.id)?.step_status.mollie_customer, "failed");
});

test("cron: rijen na purge_after, oudste eerst, en het tijdsbudget stopt tussen rijen", async () => {
  const fake = new Fake();
  const { row } = await requested(fake, true);
  const expired = await processDueDeletionsCore(fake, CONFIG, { deadlineMs: Date.now() - 1 });
  assert.equal(expired.processed, 0);
  assert.equal(expired.remaining, 1);
  const ran = await processDueDeletionsCore(fake, CONFIG, { deadlineMs: Date.now() + 60_000 });
  assert.equal(ran.processed, 1);
  assert.equal(ran.completed, 1);
  assert.equal(fake.rows.get(row.id)?.status, "completed");
});

test("annuleren van een open verzoek: ban eraf, status cancelled; na de profielstap niet meer", async () => {
  const fake = new Fake();
  const { row } = await requested(fake);
  const cancelled = await cancelDeletionRequestCore(fake, row.id, { actorType: "admin", actorId: null });
  assert.equal(cancelled.ok, true);
  assert.ok(fake.calls.includes("unbanAuthUser"));
  assert.equal(fake.rows.get(row.id)?.status, "cancelled");
  assert.ok(fake.events.includes("member.deletion_cancelled"));

  const again = await cancelDeletionRequestCore(fake, row.id, { actorType: "admin", actorId: null });
  assert.deepEqual(again, { ok: false, reason: "not_open" });
});
