/**
 * Kern van de accountverwijdering (spec-ios-app.md workstream D.2, PR 2).
 * Pure orchestratie op DeletionDeps; geen Supabase, Akiles, Mollie of
 * MailerLite hier. De wiring staat in service.ts, de tests in
 * scripts/account-deletion/core.test.mts.
 *
 * Twee fasen, allebei idempotent:
 *
 *  1. Verzoek (requestDeletionCore). Snapshot van de externe ids in een
 *     rij in tmc.account_deletions, dan meteen het veiligheidsdeel: sessies
 *     dicht (ban), Akiles-toegang en device-tokens ingetrokken, push-tokens
 *     weg, toekomstige boekingen en wachtlijstplekken geannuleerd,
 *     marketingtoestemming ingetrokken, en de opzegging van het abonnement
 *     gestart via de bestaande RPC. Dit deel wacht nooit op een termijn.
 *     Een lopend abonnement stelt de purge uit, nooit het verzoek.
 *
 *  2. Purge (runPurgeCore), door de cron zodra purge_after verstreken is,
 *     in deze volgorde: freeze (opnieuw), Mollie-subscriptions, Akiles
 *     (intrekken plus member weg), MailerLite, push, profiel (anonimiseren
 *     via tmc.anonymise_profile of hard delete zonder financiele historie),
 *     afsluitmail vanaf het gesnapshotte adres. De Mollie-customer volgt
 *     pas na de retentietermijn, via dezelfde cron.
 *
 * Waarom die volgorde: de FK-cascade van een hard delete wist de rijen
 * met de externe ids, en mollieModeForProfile valt bij een verdwenen
 * profiel terug op live. Dus eerst snapshotten, dan Mollie en Akiles, en
 * het profiel als laatste.
 *
 * Blokkeren: een gefaalde stap houdt alleen de stappen tegen die er
 * inhoudelijk van afhangen. Mollie-subscription niet gestopt of een
 * device-token nog open: geen profielstap (geld, deur). MailerLite of
 * de afsluitmail mislukt: het profiel gaat gewoon door; MailerLite mag de
 * afronding nooit tegenhouden, de mail wel (die wordt herkanst).
 */
import type { DeletionConfig } from "./config";
import { DELETION_CANCELLATION_REASON } from "./config";
import type {
  DeletionDeps,
  DeletionProfileSnapshot,
  DeletionRow,
  FreezeResult,
  ProcessResult,
  PurgeResult,
  RequestDeletionInput,
  RequestDeletionResult,
  StepName,
  StepState,
} from "./types";

const LIVE_MEMBERSHIP_STATUSES = new Set([
  "pending",
  "active",
  "paused",
  "cancellation_requested",
  "payment_failed",
]);
const CANCELLABLE_STATUSES = new Set(["active", "paused", "payment_failed"]);

/** Stappen die allemaal done moeten zijn voor status completed. mailerlite en mollie_customer bewust niet. */
const REQUIRED_FOR_COMPLETION: StepName[] = [
  "freeze",
  "mollie_subscription",
  "akiles",
  "push",
  "profile",
  "confirmation_mail",
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

/** Pseudoniem voor Akiles en logs: nooit de naam. */
export function pseudonymFor(memberCode: string): string {
  return `Verwijderd lid ${memberCode}`;
}

/**
 * Vroegste purge-moment. Bedenktijd vanaf nu, en nooit voor de laatste
 * ingangsdatum van een opzegging plus de marge voor de laatste factuur.
 * Hardstop (admin): nu.
 */
export function computePurgeAfter(
  now: Date,
  config: DeletionConfig,
  effectiveDates: Array<string | null>,
  hardStop: boolean,
): Date {
  if (hardStop) return now;
  let purgeAfter = addDays(now, config.coolingOffDays);
  for (const date of effectiveDates) {
    if (!date) continue;
    const settled = addDays(new Date(`${date}T00:00:00Z`), config.invoiceSettleDays + 1);
    if (settled > purgeAfter) purgeAfter = settled;
  }
  return purgeAfter;
}

function withStep(
  row: DeletionRow,
  step: StepName,
  state: StepState,
  error?: string | null,
): Pick<DeletionRow, "step_status" | "last_error"> {
  const step_status = { ...row.step_status, [step]: state };
  const last_error = { ...row.last_error };
  if (error) last_error[step] = error;
  else delete last_error[step];
  return { step_status, last_error };
}

async function saveStep(
  deps: DeletionDeps,
  row: DeletionRow,
  step: StepName,
  state: StepState,
  error?: string | null,
): Promise<DeletionRow> {
  return deps.db.updateDeletion(row.id, withStep(row, step, state, error));
}

// ---------------------------------------------------------------------------
// Freeze: het veiligheidsdeel, bij aanvraag en opnieuw bij elke purge-run
// ---------------------------------------------------------------------------

/**
 * Sluit alles wat een lid nog kan doen of waar hij nog in staat. Elke
 * deelactie apart in try/catch: een fout in de ene mag de andere niet
 * tegenhouden. Geeft de tellingen terug plus de foutteksten.
 */
export async function runFreezeCore(
  deps: DeletionDeps,
  profileId: string,
  email: string | null,
): Promise<{ result: FreezeResult; errors: string[] }> {
  const now = deps.now();
  const errors: string[] = [];
  const result: FreezeResult = {
    bookingsCancelled: 0,
    waitlistRemoved: 0,
    ptBookingsCancelled: 0,
    guestBookingsCancelled: 0,
    pushTokensRemoved: 0,
    deviceTokensRevoked: 0,
    deviceTokensDeferred: 0,
  };

  const attempt = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      const text = `${label}: ${errorText(err)}`;
      errors.push(text);
      deps.log.error("[account-deletion] freeze-deel mislukt", { profileId, label });
    }
  };

  // Sessies dicht: ban op de auth-user. Lopende JWT's verlopen binnen een
  // uur; verversen en opnieuw inloggen lukt niet meer.
  await attempt("ban", () => deps.db.banAuthUser(profileId));

  // Deur dicht. De sync leest de open verwijderrij (desired-state:
  // account_deletion) en trekt PIN, einddatum en tokens in, ook als de
  // membership formeel nog loopt. Daarna expliciet de device-tokens, zodat
  // een falende sync het toestel niet open laat.
  await attempt("akiles_sync", async () => {
    const sync = await deps.akiles.syncAccess(profileId);
    if (!sync.ok) throw new Error(sync.error ?? "sync mislukt");
  });
  await attempt("device_tokens", async () => {
    const r = await deps.akiles.revokeAllDeviceTokens(profileId, DELETION_CANCELLATION_REASON);
    result.deviceTokensRevoked = r.revoked;
    result.deviceTokensDeferred = r.deferred;
  });

  await attempt("push", async () => {
    result.pushTokensRemoved = await deps.db.removePushTokens(profileId);
  });
  await attempt("bookings", async () => {
    result.bookingsCancelled = await deps.db.cancelFutureBookings(
      profileId,
      isoDate(now),
      DELETION_CANCELLATION_REASON,
    );
  });
  await attempt("waitlist", async () => {
    result.waitlistRemoved = await deps.db.removeWaitlistEntries(profileId);
  });
  await attempt("pt_bookings", async () => {
    result.ptBookingsCancelled = await deps.db.cancelFuturePtBookings(
      profileId,
      now.toISOString(),
      DELETION_CANCELLATION_REASON,
    );
  });
  await attempt("guest_bookings", async () => {
    result.guestBookingsCancelled = await deps.db.cancelFutureGuestBookings(
      profileId,
      now.toISOString(),
    );
  });
  await attempt("marketing", async () => {
    await deps.db.setMarketingOptOut(profileId);
    // Uitschrijven is het snelle deel; forget (AVG-wissing) komt bij de purge.
    if (email) await deps.mailerlite.unsubscribe(email);
  });

  return { result, errors };
}

// ---------------------------------------------------------------------------
// Verzoek
// ---------------------------------------------------------------------------

function liveMemberships(snapshot: DeletionProfileSnapshot) {
  return snapshot.memberships.filter((m) => LIVE_MEMBERSHIP_STATUSES.has(m.status));
}

export async function requestDeletionCore(
  deps: DeletionDeps,
  config: DeletionConfig,
  input: RequestDeletionInput,
): Promise<RequestDeletionResult> {
  const now = deps.now();
  const snapshot = await deps.db.getProfileSnapshot(input.profileId);
  if (!snapshot) return { ok: false, reason: "profile_not_found" };
  if (snapshot.role !== "member") return { ok: false, reason: "staff_role" };

  // Idempotent: een open verzoek is het antwoord. Wel de freeze opnieuw,
  // die is goedkoop en sluit wat sinds de vorige keer weer open kwam.
  const existing = await deps.db.findOpenDeletion(input.profileId);
  if (existing) {
    const { result } = await runFreezeCore(deps, input.profileId, snapshot.email);
    return { ok: true, row: existing, alreadyOpen: true, freeze: result };
  }

  // Beleidspoorten (config.ts). Default staan ze allebei open: Apple eist
  // dat het verzoek altijd gestart kan worden.
  const live = liveMemberships(snapshot);
  const today = isoDate(now);
  if (!input.hardStop) {
    if (
      !config.allowWithinCommitment &&
      live.some((m) => CANCELLABLE_STATUSES.has(m.status) && m.commit_end_date > today)
    ) {
      return { ok: false, reason: "within_commitment" };
    }
    if (
      config.paymentFailedPolicy === "block" &&
      live.some((m) => m.status === "payment_failed")
    ) {
      return { ok: false, reason: "payment_failed" };
    }
  }

  // 1. Snapshot, voor de eerste externe aanroep.
  const subscriptionIds = snapshot.memberships
    .map((m) => m.mollie_subscription_id)
    .filter((id): id is string => Boolean(id));
  const provisionalPurge = computePurgeAfter(now, config, [], Boolean(input.hardStop));
  const row = await deps.db.insertDeletion({
    profile_id: snapshot.id,
    member_code: snapshot.member_code,
    status: "requested",
    requested_via: input.requestedVia,
    reason: input.reason?.trim() || null,
    is_test: snapshot.is_test,
    requested_at: now.toISOString(),
    purge_after: provisionalPurge.toISOString(),
    completed_at: null,
    cancelled_at: null,
    email_at_request: snapshot.email,
    akiles_member_id: snapshot.akiles_member_id,
    mollie_customer_id:
      snapshot.mollie_customer_id ??
      snapshot.memberships.find((m) => m.mollie_customer_id)?.mollie_customer_id ??
      null,
    mollie_subscription_ids: subscriptionIds,
    mailerlite_subscriber_id: null,
    step_status: {},
    last_error: {},
    attempts: 0,
    last_attempt_at: null,
  });

  // 2. Veiligheidsdeel, direct.
  const freeze = await runFreezeCore(deps, snapshot.id, snapshot.email);

  // 3. Opzegging via het pad van de aanroeper (lid-RPC of admin-hardstop).
  //    Een al lopende opzegging telt mee voor de purge-datum.
  const effectiveDates: Array<string | null> = live
    .filter((m) => m.status === "cancellation_requested")
    .map((m) => m.cancellation_effective_date);
  const cancelErrors: string[] = [];
  for (const m of live) {
    if (!CANCELLABLE_STATUSES.has(m.status)) continue;
    try {
      const outcome = await deps.cancelMembership(m.id);
      if (outcome.ok) effectiveDates.push(outcome.effectiveDate);
      else cancelErrors.push(`membership ${m.id}: ${outcome.reason}`);
    } catch (err) {
      cancelErrors.push(`membership ${m.id}: ${errorText(err)}`);
    }
  }

  const purgeAfter = computePurgeAfter(now, config, effectiveDates, Boolean(input.hardStop));
  const freezeErrors = [...freeze.errors, ...cancelErrors];
  const updated = await deps.db.updateDeletion(row.id, {
    purge_after: purgeAfter.toISOString(),
    ...withStep(
      row,
      "freeze",
      freezeErrors.length === 0 ? "done" : "failed",
      freezeErrors.length === 0 ? null : freezeErrors.join(" | "),
    ),
  });

  await deps.emit({
    type: "member.deletion_requested",
    actorType: input.actorType,
    actorId: input.actorId,
    profileId: snapshot.id,
    payload: {
      deletion_id: row.id,
      member_code: snapshot.member_code,
      requested_via: input.requestedVia,
      hard_stop: Boolean(input.hardStop),
      purge_after: purgeAfter.toISOString(),
      memberships_cancelled: live.length - cancelErrors.length,
      freeze_errors: freezeErrors.length,
    },
  });
  await deps.notify(
    "Account-verwijder verzoek",
    `Profiel ${snapshot.id} (verzoek ${row.id}) heeft accountverwijdering aangevraagd via ${input.requestedVia}. Purge na ${isoDate(purgeAfter)}.${
      freezeErrors.length > 0 ? ` ${freezeErrors.length} deel(en) van de freeze mislukt; zie last_error.` : ""
    }`,
  );

  return { ok: true, row: updated, alreadyOpen: false, freeze: freeze.result };
}

// ---------------------------------------------------------------------------
// Annuleren van een open verzoek (bedenktijd)
// ---------------------------------------------------------------------------

/**
 * Zet alleen de ban terug en sluit de rij. Geannuleerde boekingen en een
 * gestarte opzegging worden NIET hersteld; dat is een admin-handeling
 * (undo van de opzegging via admin_undo_cancellation).
 */
export async function cancelDeletionRequestCore(
  deps: DeletionDeps,
  deletionId: string,
  actor: { actorType: "member" | "admin"; actorId: string | null },
): Promise<{ ok: true; row: DeletionRow } | { ok: false; reason: "not_found" | "not_open" }> {
  const row = await deps.db.getDeletion(deletionId);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "completed" || row.status === "cancelled") {
    return { ok: false, reason: "not_open" };
  }
  if (row.step_status.profile === "done") return { ok: false, reason: "not_open" };
  if (row.profile_id) await deps.db.unbanAuthUser(row.profile_id);
  const updated = await deps.db.updateDeletion(row.id, {
    status: "cancelled",
    cancelled_at: deps.now().toISOString(),
  });
  if (row.profile_id) {
    await deps.emit({
      type: "member.deletion_cancelled",
      actorType: actor.actorType,
      actorId: actor.actorId,
      profileId: row.profile_id,
      payload: { deletion_id: row.id, member_code: row.member_code },
    });
  }
  return { ok: true, row: updated };
}

// ---------------------------------------------------------------------------
// Purge
// ---------------------------------------------------------------------------

export async function runPurgeCore(
  deps: DeletionDeps,
  config: DeletionConfig,
  input: DeletionRow,
): Promise<PurgeResult> {
  const now = deps.now();
  const done: StepName[] = [];
  const failed: StepName[] = [];
  let row = await deps.db.updateDeletion(input.id, {
    status: "in_progress",
    attempts: input.attempts + 1,
    last_attempt_at: now.toISOString(),
  });
  const profileId = row.profile_id;

  const record = async (step: StepName, state: StepState, error?: string | null) => {
    row = await saveStep(deps, row, step, state, error);
    if (state === "done" || state === "skipped") done.push(step);
    else failed.push(step);
  };

  // --- freeze -------------------------------------------------------------
  if (profileId) {
    const freeze = await runFreezeCore(deps, profileId, row.email_at_request);
    await record(
      "freeze",
      freeze.errors.length === 0 ? "done" : "failed",
      freeze.errors.length === 0 ? null : freeze.errors.join(" | "),
    );
  } else {
    await record("freeze", "skipped");
  }

  // --- mollie_subscription -------------------------------------------------
  // Eerst de lokale staat: een membership die nog loopt (opzegging met
  // ingangsdatum in de toekomst) stelt de purge uit. Een membership die
  // nooit op cancellation_requested kwam (opzeg-RPC faalde bij aanvraag)
  // vraagt een mens: de kern doet geen directe update buiten de RPC's om.
  if (profileId) {
    const live = await deps.db.listLiveMemberships(profileId);
    const stillRunning = live.filter((m) => m.status === "cancellation_requested");
    const notCancelled = live.filter((m) => m.status !== "cancellation_requested");
    if (notCancelled.length > 0) {
      const text = `membership nog ${notCancelled.map((m) => `${m.id}:${m.status}`).join(", ")}; opzegging niet gelukt bij aanvraag, admin-hardstop nodig`;
      row = await deps.db.updateDeletion(row.id, {
        status: "blocked",
        ...withStep(row, "mollie_subscription", "blocked", text),
      });
      await deps.notify(
        "Accountverwijdering geblokkeerd",
        `Verzoek ${row.id}: ${text}.`,
      );
      return { row, done, failed: [...failed, "mollie_subscription"], blocked: true, completed: false };
    }
    if (stillRunning.length > 0) {
      const dates = stillRunning.map((m) => m.cancellation_effective_date);
      const purgeAfter = computePurgeAfter(now, config, dates, false);
      const latest = dates.filter(Boolean).sort().at(-1) ?? "?";
      row = await deps.db.updateDeletion(row.id, {
        purge_after: purgeAfter.toISOString(),
        ...withStep(row, "mollie_subscription", "pending", `abonnement loopt tot ${latest}; purge uitgesteld`),
      });
      deps.log.info("[account-deletion] purge uitgesteld, abonnement loopt nog", {
        deletionId: row.id,
        until: latest,
      });
      return { row, done, failed, blocked: false, completed: false };
    }
  }
  {
    const failures: string[] = [];
    for (const subscriptionId of row.mollie_subscription_ids) {
      try {
        const ok = await deps.mollie.cancelSubscription(row.is_test, row.mollie_customer_id, subscriptionId);
        if (!ok) failures.push(subscriptionId);
      } catch (err) {
        failures.push(`${subscriptionId} (${errorText(err)})`);
      }
    }
    await record(
      "mollie_subscription",
      failures.length === 0 ? "done" : "failed",
      failures.length === 0 ? null : `niet gestopt: ${failures.join(", ")}`,
    );
  }

  // --- akiles -------------------------------------------------------------
  if (profileId) {
    const errors: string[] = [];
    try {
      const sync = await deps.akiles.syncAccess(profileId);
      if (!sync.ok) errors.push(`sync: ${sync.error ?? "mislukt"}`);
    } catch (err) {
      errors.push(`sync: ${errorText(err)}`);
    }
    try {
      if (await deps.db.hasOpenDeviceTokens(profileId)) {
        errors.push("device-token(s) nog niet ingetrokken bij Akiles");
      }
    } catch (err) {
      errors.push(`device-tokens: ${errorText(err)}`);
    }
    if (errors.length === 0 && row.akiles_member_id) {
      try {
        const r = await deps.akiles.deleteMember(
          profileId,
          row.akiles_member_id,
          pseudonymFor(row.member_code),
        );
        if (r && !r.ok) errors.push(`member verwijderen: ${r.error ?? "mislukt"}`);
      } catch (err) {
        errors.push(`member verwijderen: ${errorText(err)}`);
      }
    }
    await record("akiles", errors.length === 0 ? "done" : "failed", errors.join(" | ") || null);
  } else {
    await record("akiles", "skipped");
  }

  // --- mailerlite (best effort, blokkeert nooit) ---------------------------
  if (row.step_status.mailerlite !== "done" && row.step_status.mailerlite !== "skipped") {
    try {
      const email = row.email_at_request;
      if (!email) {
        await record("mailerlite", "skipped");
      } else if (config.mailerliteMode === "unsubscribe") {
        const ok = await deps.mailerlite.unsubscribe(email);
        await record("mailerlite", ok ? "done" : "failed", ok ? null : "uitschrijven mislukt");
      } else {
        const subscriberId = row.mailerlite_subscriber_id ?? (await deps.mailerlite.findSubscriberId(email));
        if (!subscriberId) {
          await record("mailerlite", "done");
        } else {
          if (subscriberId !== row.mailerlite_subscriber_id) {
            row = await deps.db.updateDeletion(row.id, { mailerlite_subscriber_id: subscriberId });
          }
          const ok = await deps.mailerlite.forget(subscriberId);
          await record("mailerlite", ok ? "done" : "failed", ok ? null : "forget mislukt");
        }
      }
    } catch (err) {
      await record("mailerlite", "failed", errorText(err));
    }
  }

  // --- push ---------------------------------------------------------------
  if (profileId) {
    try {
      await deps.db.removePushTokens(profileId);
      await record("push", "done");
    } catch (err) {
      await record("push", "failed", errorText(err));
    }
  } else {
    await record("push", "skipped");
  }

  // --- profile ------------------------------------------------------------
  // Alleen als geld en deur dicht zijn. Anonimiseren als er orders of
  // facturen zijn (bewaarplicht; FK NOT NULL), anders hard delete.
  if (!profileId) {
    await record("profile", "skipped");
  } else if (row.step_status.profile === "done") {
    done.push("profile");
  } else if (row.step_status.mollie_subscription !== "done") {
    await record("profile", "failed", "wacht op mollie_subscription");
  } else if (row.step_status.akiles === "failed" && (row.last_error.akiles ?? "").includes("device-token")) {
    await record("profile", "failed", "wacht op intrekking van device-tokens");
  } else {
    try {
      await deps.db.removeAvatar(profileId);
    } catch (err) {
      deps.log.error("[account-deletion] avatar verwijderen mislukt", { profileId, error: errorText(err) });
    }
    try {
      const hasHistory = await deps.db.hasFinancialHistory(profileId);
      let mode: "anonymised" | "hard_deleted";
      if (hasHistory) {
        const r = await deps.db.anonymiseProfile(profileId);
        if (!r.ok) {
          const text = `${r.reason}${r.blockers ? `: ${r.blockers.join(", ")}` : ""}`;
          row = await deps.db.updateDeletion(row.id, {
            status: "blocked",
            ...withStep(row, "profile", "blocked", text),
          });
          await deps.notify(
            "Accountverwijdering geblokkeerd",
            `Verzoek ${row.id}, profiel ${profileId}: anonimiseren geweigerd (${text}).`,
          );
          return { row, done, failed: [...failed, "profile"], blocked: true, completed: false };
        }
        mode = "anonymised";
      } else {
        await deps.db.hardDeleteAuthUser(profileId);
        mode = "hard_deleted";
      }
      await deps.emit({
        type: "member.deleted",
        actorType: "system",
        actorId: null,
        profileId,
        payload: { deletion_id: row.id, member_code: row.member_code, mode, source: row.requested_via },
      });
      await record("profile", "done");
      // De FK op account_deletions.profile_id is SET NULL; na een hard delete
      // is de verwijzing weg, ook als de update hierboven nog de oude rij gaf.
      if (mode === "hard_deleted") row = { ...row, profile_id: null };
    } catch (err) {
      await record("profile", "failed", errorText(err));
    }
  }

  // --- confirmation_mail --------------------------------------------------
  if (row.step_status.profile !== "done") {
    // Pas na het profiel; anders belooft de mail iets dat nog niet gebeurd is.
  } else if (!row.email_at_request) {
    if (row.step_status.confirmation_mail !== "done") await record("confirmation_mail", "done");
    else done.push("confirmation_mail");
  } else {
    try {
      const ok = await deps.sendClosingMail(row.email_at_request, null);
      if (ok) {
        row = await deps.db.updateDeletion(row.id, { email_at_request: null });
        await record("confirmation_mail", "done");
      } else {
        await record("confirmation_mail", "failed", "verzenden mislukt");
      }
    } catch (err) {
      await record("confirmation_mail", "failed", errorText(err));
    }
  }

  // --- afronding ----------------------------------------------------------
  const allRequiredDone = REQUIRED_FOR_COMPLETION.every(
    (step) => row.step_status[step] === "done" || row.step_status[step] === "skipped",
  );
  if (allRequiredDone) {
    const patch: Parameters<DeletionDeps["db"]["updateDeletion"]>[1] = {
      status: "completed",
      completed_at: now.toISOString(),
    };
    const step_status = { ...row.step_status };
    const last_error = { ...row.last_error };
    // MailerLite mag de afronding niet tegenhouden: een blijvende fout
    // wordt skipped, met de fout erbij voor wie het handmatig wil doen.
    if (step_status.mailerlite === "failed") step_status.mailerlite = "skipped";
    step_status.mollie_customer = row.mollie_customer_id ? "pending" : "skipped";
    patch.step_status = step_status;
    patch.last_error = last_error;
    row = await deps.db.updateDeletion(row.id, patch);
    return { row, done, failed, blocked: false, completed: true };
  }

  if (failed.length > 0 && row.attempts >= config.notifyAfterAttempts) {
    await deps.notify(
      "Accountverwijdering blijft hangen",
      `Verzoek ${row.id}: na ${row.attempts} pogingen nog open: ${failed.join(", ")}. Zie last_error in tmc.account_deletions.`,
    );
  }
  return { row, done, failed, blocked: false, completed: false };
}

// ---------------------------------------------------------------------------
// Retentie van de Mollie-customer
// ---------------------------------------------------------------------------

export async function runCustomerRetentionCore(
  deps: DeletionDeps,
  row: DeletionRow,
): Promise<{ ok: boolean }> {
  if (!row.mollie_customer_id) return { ok: true };
  try {
    const ok = await deps.mollie.deleteCustomer(row.is_test, row.mollie_customer_id);
    if (ok) {
      await deps.db.updateDeletion(row.id, {
        mollie_customer_id: null,
        ...withStep(row, "mollie_customer", "done"),
      });
      return { ok: true };
    }
    await deps.db.updateDeletion(row.id, withStep(row, "mollie_customer", "failed", "customer verwijderen mislukt"));
    return { ok: false };
  } catch (err) {
    await deps.db.updateDeletion(row.id, withStep(row, "mollie_customer", "failed", errorText(err)));
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Cron: rij voor rij binnen een tijdsbudget
// ---------------------------------------------------------------------------

export async function processDueDeletionsCore(
  deps: DeletionDeps,
  config: DeletionConfig,
  options: { deadlineMs: number },
): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
    remaining: 0,
    customersDeleted: 0,
    customersFailed: 0,
  };
  const now = deps.now();
  const due = await deps.db.listDueDeletions(now.toISOString());
  let index = 0;
  for (; index < due.length; index++) {
    if (Date.now() >= options.deadlineMs) break;
    const row = due[index];
    try {
      const outcome = await runPurgeCore(deps, config, row);
      result.processed += 1;
      if (outcome.completed) result.completed += 1;
      else if (outcome.blocked) result.blocked += 1;
      else if (outcome.failed.length > 0) result.failed += 1;
    } catch (err) {
      result.processed += 1;
      result.failed += 1;
      deps.log.error("[account-deletion] purge threw", { deletionId: row.id, error: errorText(err) });
    }
  }
  result.remaining = due.length - index;

  const before = addMonths(now, -config.mollieCustomerRetentionMonths).toISOString();
  const retention = await deps.db.listCustomerRetentionDue(before);
  for (const row of retention) {
    if (Date.now() >= options.deadlineMs) {
      result.remaining += 1;
      continue;
    }
    const r = await runCustomerRetentionCore(deps, row);
    if (r.ok) result.customersDeleted += 1;
    else result.customersFailed += 1;
  }
  return result;
}
