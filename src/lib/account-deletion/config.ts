/**
 * Termijnen en beleidskeuzes van de accountverwijdering, op een plek.
 * Geen van deze waarden hoort elders in de logica hardgecodeerd te staan.
 *
 * Vier waarden wachten op een besluit van Marlon (zie de PR-body van PR 2
 * en het discovery-rapport van 2026-09-21). De defaults hieronder zijn
 * verdedigbaar maar niet definitief:
 *
 *  - Opzegtermijn: NIET hier. De enige bron is
 *    tmc.booking_settings.cancellation_notice_days (28 dagen vandaag), via
 *    tmc.request_membership_cancellation en getCancellationNoticeDays(). De
 *    AV zegt "[een kalendermaand]"; zodra Marlon kiest, verandert dat op die
 *    ene plek, niet hier.
 *  - allowWithinCommitment: mag een lid binnen de eerste looptijd de route
 *    starten. Default true: Apple eist dat het verzoek altijd gestart kan
 *    worden; de opzegging landt dan gewoon op commit_end_date via de RPC en
 *    de purge wacht daarop. Op false wordt het verzoek geweigerd met
 *    reason "within_commitment" (alleen bruikbaar als Marlon dat juridisch
 *    onderbouwt; de Apple-regel blijft dan een risico).
 *  - paymentFailedPolicy: wat bij status payment_failed. "defer" (default):
 *    het verzoek gaat door, de purge wacht tot de membership is afgewikkeld.
 *    "block": het verzoek wordt geweigerd. Zie de harde eis hieronder.
 *  - coolingOffDays: bedenktijd tussen aanvraag en purge. Default 30 (Apple
 *    staat een gemelde termijn toe; de AVG-reactietermijn is een maand).
 *
 * Harde eis, los van die besluiten: een lopend abonnement stelt de purge
 * uit maar blokkeert het verzoek nooit. requestDeletionCore weigert daarom
 * alleen op allowWithinCommitment=false of paymentFailedPolicy="block", en
 * beide staan default zo dat het verzoek altijd doorgaat.
 *
 * Overrides via env (alleen voor preview en tests; productie draait op de
 * defaults tot Marlon besluit): ACCOUNT_DELETION_COOLING_OFF_DAYS,
 * ACCOUNT_DELETION_ALLOW_WITHIN_COMMITMENT (true/false),
 * ACCOUNT_DELETION_PAYMENT_FAILED_POLICY (defer/block),
 * ACCOUNT_DELETION_MAILERLITE_MODE (forget/unsubscribe).
 */

export type PaymentFailedPolicy = "defer" | "block";
export type MailerliteMode = "forget" | "unsubscribe";

export interface DeletionConfig {
  /** Bedenktijd in dagen tussen aanvraag en de vroegste purge. */
  coolingOffDays: number;
  /** Mag een lid binnen commit_end_date de route starten. */
  allowWithinCommitment: boolean;
  /** Gedrag bij memberships.status = 'payment_failed'. */
  paymentFailedPolicy: PaymentFailedPolicy;
  /**
   * Dagen na de laatste ingangsdatum van een opzegging voordat het profiel
   * geanonimiseerd mag worden. finalize_invoice leest NAW uit profiles,
   * dus de laatste factuur moet definitief zijn voor de placeholder erin
   * komt. De nachtelijke crons (process-cancellations, facturatie) lopen
   * ruim binnen deze marge.
   */
  invoiceSettleDays: number;
  /**
   * Maanden na afronding voordat de Mollie-customer wordt verwijderd. SEPA
   * Core Rulebook 4.3: een ongeautoriseerde incasso is tot 13 maanden na de
   * debetdatum betwistbaar; completed_at ligt altijd na de laatste incasso,
   * dus dit is de conservatieve bovengrens.
   */
  mollieCustomerRetentionMonths: number;
  /** forget = AVG-wissing bij MailerLite (ook lead-historie); unsubscribe = alleen uitschrijven. */
  mailerliteMode: MailerliteMode;
  /** Vanaf dit aantal mislukte runs van een rij gaat er een melding naar ntfy. */
  notifyAfterAttempts: number;
}

const DEFAULTS: DeletionConfig = {
  coolingOffDays: 30,
  allowWithinCommitment: true,
  paymentFailedPolicy: "defer",
  invoiceSettleDays: 7,
  mollieCustomerRetentionMonths: 13,
  mailerliteMode: "forget",
  notifyAfterAttempts: 3,
};

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

function enumFromEnv<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[name];
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** Per aanroep gelezen, niet bij module-load, zodat tests en preview de env kunnen zetten. */
export function getDeletionConfig(): DeletionConfig {
  return {
    coolingOffDays: intFromEnv("ACCOUNT_DELETION_COOLING_OFF_DAYS", DEFAULTS.coolingOffDays),
    allowWithinCommitment: boolFromEnv(
      "ACCOUNT_DELETION_ALLOW_WITHIN_COMMITMENT",
      DEFAULTS.allowWithinCommitment,
    ),
    paymentFailedPolicy: enumFromEnv(
      "ACCOUNT_DELETION_PAYMENT_FAILED_POLICY",
      ["defer", "block"] as const,
      DEFAULTS.paymentFailedPolicy,
    ),
    invoiceSettleDays: DEFAULTS.invoiceSettleDays,
    mollieCustomerRetentionMonths: DEFAULTS.mollieCustomerRetentionMonths,
    mailerliteMode: enumFromEnv(
      "ACCOUNT_DELETION_MAILERLITE_MODE",
      ["forget", "unsubscribe"] as const,
      DEFAULTS.mailerliteMode,
    ),
    notifyAfterAttempts: DEFAULTS.notifyAfterAttempts,
  };
}

/** Tijdsbudget van de cron; zelfde model als SYNC_TIME_BUDGET_MS (maxDuration 300 s). */
export const DELETION_TIME_BUDGET_MS = 240_000;

/** Annuleerreden op bookings, pt_bookings en guest_bookings die de freeze zet. */
export const DELETION_CANCELLATION_REASON = "account_deletion";

/** Ban op auth.users bij aanvraag; ver genoeg dat hij nooit vanzelf afloopt. */
export const AUTH_BAN_DURATION = "876000h";
