/**
 * Termijnen en beleidskeuzes van de accountverwijdering, op een plek.
 * Geen van deze waarden hoort elders in de logica hardgecodeerd te staan.
 *
 * Uitgangspunt (correctie op de eerste versie van PR 2): een
 * verwijderverzoek beeindigt geen overeenkomst en vervalt geen
 * betaalverplichting. Account verwijderen en lidmaatschap opzeggen zijn
 * twee beslissingen. Een lid kan het verzoek daarom alleen indienen als
 * het lidmaatschap is opgezegd (cancellation_requested) of al afgelopen is;
 * loopt het nog, dan wijst de kern het verzoek af met reason
 * "membership_active" en de aanroeper verwijst naar het opzegscherm. Dat is
 * geen weigering van de verwijdering zelf: opzeggen kan altijd, verwijderen
 * daarna ook, dus dit blijft binnen Apple 5.1.1(v).
 *
 * Openstaande beslissing voor Marlon: opzeggen eerst (deze variant), of een
 * gekoppelde knop die opzegt en verwijdert in een handeling, met expliciete
 * bevestiging. De admin-hardstop (deleteMember) doet wel beide, omdat dat
 * een handeling van Marlon met een eigen afweging is.
 *
 * Waarden die op een besluit van Marlon wachten (zie de PR-body van PR 2
 * en het discovery-rapport van 2026-09-21):
 *
 *  - Opzegtermijn: NIET hier. De enige bron is
 *    tmc.booking_settings.cancellation_notice_days (28 dagen vandaag), via
 *    tmc.request_membership_cancellation en getCancellationNoticeDays(). De
 *    AV zegt "[een kalendermaand]"; zodra Marlon kiest, verandert dat op die
 *    ene plek, niet hier.
 *  - coolingOffDays: bedenktijd tussen aanvraag en purge. Default 30 (Apple
 *    staat een gemelde termijn toe; de AVG-reactietermijn is een maand).
 *  - mailerliteMode: forget (AVG-wissing, ook lead-historie) of alleen
 *    uitschrijven.
 *
 * De purge wacht altijd op de laatste van: de ingangsdatum van de
 * opzegging, de datum van de laatste factuur, en de bedenktijd. Zolang er
 * nog gefactureerd moet worden blijft het profiel intact: finalize_invoice
 * leest de NAW uit profiles.
 *
 * Overrides via env (alleen voor preview en tests; productie draait op de
 * defaults tot Marlon besluit): ACCOUNT_DELETION_COOLING_OFF_DAYS,
 * ACCOUNT_DELETION_MAILERLITE_MODE (forget/unsubscribe).
 */

export type MailerliteMode = "forget" | "unsubscribe";

export interface DeletionConfig {
  /** Bedenktijd in dagen tussen aanvraag en de vroegste purge. */
  coolingOffDays: number;
  /**
   * Dagen na de laatste ingangsdatum van een opzegging en na de laatste
   * factuurdatum voordat het profiel geanonimiseerd mag worden.
   * finalize_invoice leest NAW uit profiles, dus de laatste factuur moet
   * definitief zijn voor de placeholder erin komt. De nachtelijke crons
   * (process-cancellations, facturatie) lopen ruim binnen deze marge.
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

function enumFromEnv<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[name];
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** Per aanroep gelezen, niet bij module-load, zodat tests en preview de env kunnen zetten. */
export function getDeletionConfig(): DeletionConfig {
  return {
    coolingOffDays: intFromEnv("ACCOUNT_DELETION_COOLING_OFF_DAYS", DEFAULTS.coolingOffDays),
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
