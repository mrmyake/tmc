/**
 * Types van de accountverwijdering (spec-ios-app.md workstream D.2, PR 2).
 * De kern (core.ts) kent alleen deze interfaces; de wiring (service.ts)
 * vult ze met de service-role-client, Akiles, Mollie, MailerLite, storage
 * en MailerSend. Tests (scripts/account-deletion/) draaien de kern met fakes.
 */

export const STEP_NAMES = [
  "freeze",
  "mollie_subscription",
  "akiles",
  "mailerlite",
  "push",
  "profile",
  "confirmation_mail",
  "mollie_customer",
] as const;
export type StepName = (typeof STEP_NAMES)[number];

/** running: alleen voor freeze, tussen het moment dat hij start en klaar is (de toegangssync leest dit). */
export type StepState = "pending" | "running" | "done" | "failed" | "skipped" | "blocked";

export type DeletionStatus =
  | "requested"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export type RequestedVia = "member_app" | "admin";

/** Rij in tmc.account_deletions, zoals de kern hem leest en schrijft. */
export interface DeletionRow {
  id: string;
  profile_id: string | null;
  member_code: string;
  status: DeletionStatus;
  requested_via: RequestedVia;
  reason: string | null;
  is_test: boolean;
  requested_at: string;
  purge_after: string;
  completed_at: string | null;
  cancelled_at: string | null;
  email_at_request: string | null;
  akiles_member_id: string | null;
  mollie_customer_id: string | null;
  mollie_subscription_ids: string[];
  mailerlite_subscriber_id: string | null;
  step_status: Partial<Record<StepName, StepState>>;
  last_error: Partial<Record<StepName, string>>;
  attempts: number;
  last_attempt_at: string | null;
}

export type DeletionRowPatch = Partial<
  Omit<DeletionRow, "id" | "profile_id" | "member_code" | "requested_at" | "requested_via">
>;

/** Wat de kern van een profiel moet weten om te snapshotten en te toetsen. */
export interface DeletionProfileSnapshot {
  id: string;
  member_code: string;
  email: string;
  role: string;
  is_test: boolean;
  first_name: string;
  mollie_customer_id: string | null;
  akiles_member_id: string | null;
  akiles_magic_link_id: string | null;
  memberships: Array<{
    id: string;
    status: string;
    mollie_customer_id: string | null;
    mollie_subscription_id: string | null;
    commit_end_date: string;
    cancellation_effective_date: string | null;
    billing_cycle_weeks: number;
  }>;
}

export type MembershipCancelOutcome =
  | { ok: true; effectiveDate: string | null }
  | { ok: false; reason: string };

export interface FreezeResult {
  creditRowsExpired: number;
  creditsForfeited: number;
  bookingsCancelled: number;
  waitlistRemoved: number;
  ptBookingsCancelled: number;
  guestBookingsCancelled: number;
  pushTokensRemoved: number;
  deviceTokensRevoked: number;
  deviceTokensDeferred: number;
}

/**
 * Alles wat de kern van buiten nodig heeft. Elke operatie is idempotent
 * of 404-tolerant; de kern vertrouwt daarop en herkanst zonder te
 * deduppen. Geen enkele operatie mag throwen om een verwachte toestand
 * (object al weg, al gecanceld); een throw betekent "onbekende fout" en
 * landt in last_error van de stap.
 */
export interface DeletionDeps {
  db: {
    getProfileSnapshot(profileId: string): Promise<DeletionProfileSnapshot | null>;
    findOpenDeletion(profileId: string): Promise<DeletionRow | null>;
    insertDeletion(row: Omit<DeletionRow, "id">): Promise<DeletionRow>;
    getDeletion(id: string): Promise<DeletionRow | null>;
    updateDeletion(id: string, patch: DeletionRowPatch): Promise<DeletionRow>;
    /** Open rijen (requested, in_progress, blocked) met purge_after <= now, oudste eerst. */
    listDueDeletions(nowIso: string): Promise<DeletionRow[]>;
    /** Rijen met status requested en step_status.freeze = 'pending': de sluiting wacht op de einddatum van het abonnement. */
    listFreezePending(): Promise<DeletionRow[]>;
    /** Afgeronde rijen met een Mollie-customer die nog verwijderd moet worden en completed_at <= before. */
    listCustomerRetentionDue(beforeIso: string): Promise<DeletionRow[]>;

    /** Alle memberships van het profiel in een niet-terminale status. */
    listLiveMemberships(profileId: string): Promise<DeletionProfileSnapshot["memberships"]>;
    cancelFutureBookings(profileId: string, todayIso: string, reason: string): Promise<number>;
    removeWaitlistEntries(profileId: string): Promise<number>;
    cancelFuturePtBookings(profileId: string, nowIso: string, reason: string): Promise<number>;
    cancelFutureGuestBookings(profileId: string, nowIso: string): Promise<number>;
    removePushTokens(profileId: string): Promise<number>;
    setMarketingOptOut(profileId: string): Promise<void>;
    /**
     * Tegoed (rittenkaart, PT-pakket: billing_cycle_weeks = 0) vervalt zonder
     * restitutie: rijen op expired met end_date vandaag. Geeft het aantal
     * rijen en de vervallen credits terug. Geen RPC beschikbaar voor
     * credit-rijen (admin_cancel_membership weigert ze), geen Mollie-kant.
     */
    expireCreditRows(profileId: string, todayIso: string): Promise<{ rows: number; credits: number }>;
    /** Er is nog een access_device_tokens-rij zonder revoked_at. */
    hasOpenDeviceTokens(profileId: string): Promise<boolean>;
    /** Geen orders en geen facturen: dan mag de auth-user hard weg (FK NOT NULL NO ACTION). */
    hasFinancialHistory(profileId: string): Promise<boolean>;
    /** Datum (yyyy-mm-dd) van de laatste factuur van het profiel, concept of definitief; null zonder facturen. */
    latestInvoiceDate(profileId: string): Promise<string | null>;
    removeAvatar(profileId: string): Promise<void>;
    /** tmc.anonymise_profile uit PR #206. */
    anonymiseProfile(profileId: string): Promise<AnonymiseResult>;
    hardDeleteAuthUser(profileId: string): Promise<void>;
    banAuthUser(profileId: string): Promise<void>;
    unbanAuthUser(profileId: string): Promise<void>;
  };
  /**
   * Opzegging van een membership. De aanroeper bepaalt het pad: het lid via
   * tmc.request_membership_cancellation (auth.uid()-gebonden), de admin via
   * cancelMembershipCore met hardStop (Mollie-eerst, admin-RPC). De kern
   * kent alleen de uitkomst.
   */
  cancelMembership(membershipId: string): Promise<MembershipCancelOutcome>;
  mollie: {
    cancelSubscription(isTest: boolean, customerId: string | null, subscriptionId: string): Promise<boolean>;
    deleteCustomer(isTest: boolean, customerId: string): Promise<boolean>;
  };
  akiles: {
    /** syncMembershipAccess: trekt in zodra memberships niet meer actief zijn. */
    syncAccess(profileId: string): Promise<{ ok: boolean; error?: string }>;
    revokeAllDeviceTokens(profileId: string, reason: string): Promise<{ revoked: number; deferred: number }>;
    /** Naam op pseudoniem, magic link weg, member weg. Alle drie 404-tolerant. null = niet geconfigureerd. */
    deleteMember(
      profileId: string,
      akilesMemberId: string,
      pseudonym: string,
    ): Promise<{ ok: boolean; error?: string } | null>;
  };
  mailerlite: {
    findSubscriberId(email: string): Promise<string | null>;
    forget(subscriberId: string): Promise<boolean>;
    unsubscribe(email: string): Promise<boolean>;
  };
  sendClosingMail(email: string, firstName: string | null): Promise<boolean>;
  emit(event: {
    type: "member.deletion_requested" | "member.deleted" | "member.deletion_cancelled";
    actorType: "member" | "admin" | "system";
    actorId: string | null;
    profileId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  /** Alleen ids in de tekst (PR #205). */
  notify(title: string, message: string): Promise<void>;
  now(): Date;
  log: {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
}

export type AnonymiseResult =
  | { ok: true; anonymised?: boolean; already_anonymised?: boolean }
  | { ok: false; reason: string; blockers?: string[] };

export interface RequestDeletionInput {
  profileId: string;
  requestedVia: RequestedVia;
  reason: string | null;
  actorType: "member" | "admin";
  actorId: string | null;
  /**
   * Admin-hardstop (Marlon): de enige route die opzeggen en verwijderen
   * in een handeling doet. Memberships worden per direct gestopt via
   * cancelMembership en de purge mag meteen; purge_after = nu. Zonder
   * hardStop start het verzoek geen opzegging: een lopend lidmaatschap
   * wijst het verzoek af (membership_active).
   */
  hardStop?: boolean;
}

export type RequestDeletionResult =
  | {
      ok: true;
      row: DeletionRow;
      alreadyOpen: boolean;
      /** Gevuld als de sluiting direct is uitgevoerd; null als die op closesOn wacht. */
      freeze: FreezeResult | null;
      /** Datum (yyyy-mm-dd) van de laatste dag van het opgezegde abonnement; null bij directe sluiting. */
      closesOn: string | null;
    }
  | { ok: false; reason: "profile_not_found" | "staff_role" }
  /**
   * Lidmaatschap loopt nog (active, paused, payment_failed of pending):
   * eerst opzeggen. Geen weigering van de verwijdering; de aanroeper
   * verwijst naar het opzegscherm met deze memberships.
   */
  | { ok: false; reason: "membership_active"; memberships: Array<{ id: string; status: string }> };

export type RequestDeletionFailure = Extract<RequestDeletionResult, { ok: false }>;

export interface PurgeResult {
  row: DeletionRow;
  /** Stappen die in deze run geslaagd zijn. */
  done: StepName[];
  failed: StepName[];
  blocked: boolean;
  completed: boolean;
}

export interface ProcessResult {
  /** Uitgestelde sluitingen die deze run zijn uitgevoerd (einddatum bereikt). */
  frozen: number;
  processed: number;
  completed: number;
  failed: number;
  blocked: number;
  remaining: number;
  customersDeleted: number;
  customersFailed: number;
}
