import { zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";
import { ROLLING_ACCESS_WINDOW_DAYS, type AccessGroup } from "./constants";

/**
 * Gewenste deurtoegang per profiel, afgeleid uit profiles.role en de
 * memberships-rijen. Pure functie: geen DB, geen Akiles, zodat de regels
 * hieronder met node:test aantoonbaar zijn (scripts/access/).
 *
 * Statusregels (bouwopdracht, spec-akiles-access.md):
 *   aan:  active; cancellation_requested tot en met cancellation_effective_date;
 *         payment_failed (zie het commentaar in rowAccess, dit is bewust).
 *   uit:  pending, paused, cancelled, expired.
 *   Bij een geplande pauze (status active met pause_effective_date) is
 *   pause_effective_date de einddatum: de eerste dag zonder dekking.
 *
 * Alleen abonnementsrijen tellen mee. Rittenkaarten (plan_type
 * ten_ride_card) en PT-pakketten (pt_package) staan ook in tmc.memberships,
 * bereiken nooit een eindstatus (ze blijven 'active' tot een admin ze
 * opruimt) en geven geen zelfstandige deurtoegang: die leden komen voor
 * een sessie met een trainer erbij, en de trainer opent de deur. Zonder
 * dit filter zou een opgezegd abonnement naast een rittenkaart-rij
 * eindeloos toegang houden (PR #170, punt A).
 *
 * Groep: extended bij memberships.extended_access true, anders standard.
 * Profielen met rol trainer of admin krijgen staff, ook zonder membership.
 *
 * Einddatum (fail closed): per rij wint een harde datum altijd; een rij
 * zonder harde datum draagt nu plus ROLLING_ACCESS_WINDOW_DAYS bij, nooit
 * oneindig. Bij meerdere rijen geldt het maximum. endsAt is daardoor
 * altijd gevuld zodra enabled true is.
 */

/** plan_type-waarden die geen abonnement zijn en dus geen deurtoegang dragen. */
export const NON_SUBSCRIPTION_PLAN_TYPES: ReadonlySet<string> = new Set([
  "ten_ride_card",
  "pt_package",
  "twelve_week_program",
]);

export function isSubscriptionRow(row: { plan_type: string }): boolean {
  return !NON_SUBSCRIPTION_PLAN_TYPES.has(row.plan_type);
}

export interface AccessMembershipRow {
  plan_type: string;
  status: string;
  extended_access: boolean;
  /** ISO-datum (yyyy-mm-dd), laatste dag met dekking. */
  cancellation_effective_date: string | null;
  /** ISO-datum (yyyy-mm-dd), eerste dag zonder dekking. */
  pause_effective_date: string | null;
}

export interface ProfileAccessInput {
  role: string;
  memberships: readonly AccessMembershipRow[];
}

export interface DesiredAccess {
  enabled: boolean;
  group: AccessGroup | null;
  /** Einddatum voor Akiles; altijd gevuld als enabled true is, nooit "voor altijd". */
  endsAt: Date | null;
  reason: string;
}

const STAFF_ROLES = new Set(["trainer", "admin"]);

/** 00:00 Europe/Amsterdam op de gegeven ISO-datum, als UTC-instant. */
export function amsterdamMidnight(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Ongeldige datum: ${isoDate}`);
  return zonedWallClockToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    0,
    0,
  );
}

/** 00:00 Europe/Amsterdam op de dag NA de gegeven datum ("tot en met"). */
export function amsterdamEndOfDay(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Ongeldige datum: ${isoDate}`);
  // Date.UTC normaliseert dag+1 over maand- en jaargrenzen heen.
  const next = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1),
  );
  return zonedWallClockToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
  );
}

export function rollingWindowEnd(now: Date): Date {
  return new Date(now.getTime() + ROLLING_ACCESS_WINDOW_DAYS * 86_400_000);
}

interface RowAccess {
  enabled: boolean;
  /** Harde einddatum, of null voor rollend. Alleen relevant als enabled. */
  hardEnd: Date | null;
}

function rowAccess(row: AccessMembershipRow, now: Date): RowAccess {
  switch (row.status) {
    case "active": {
      if (row.pause_effective_date) {
        const pauseStart = amsterdamMidnight(row.pause_effective_date);
        // Geplande pauze: toegang tot de eerste dag zonder dekking. Is die
        // dag al aangebroken maar heeft process-pauses de status nog niet
        // omgezet, dan is de toegang al voorbij.
        return { enabled: pauseStart > now, hardEnd: pauseStart };
      }
      return { enabled: true, hardEnd: null };
    }
    case "cancellation_requested": {
      // Zonder effectieve datum is er geen "tot en met" te bepalen; de RPC
      // zet die altijd, dus dit is een datafout. Fail closed.
      if (!row.cancellation_effective_date) return { enabled: false, hardEnd: null };
      const end = amsterdamEndOfDay(row.cancellation_effective_date);
      return { enabled: end > now, hardEnd: end };
    }
    case "payment_failed":
      // BEWUST TOEGANG. Een mislukte incasso is een betaalprobleem, geen
      // reden om iemand voor een dichte deur te zetten; Marlon lost dit
      // persoonlijk op en de webhook zet de status terug naar active zodra
      // de volgende incasso slaagt. Rollend venster, dus valt de opvolging
      // weg, dan sluit de deur vanzelf na ROLLING_ACCESS_WINDOW_DAYS.
      // Niet dichtzetten zonder expliciet besluit in spec-akiles-access.md.
      return { enabled: true, hardEnd: null };
    case "pending":
    case "paused":
    case "cancelled":
    case "expired":
    default:
      return { enabled: false, hardEnd: null };
  }
}

export function resolveDesiredAccess(
  input: ProfileAccessInput,
  now: Date,
): DesiredAccess {
  if (STAFF_ROLES.has(input.role)) {
    return {
      enabled: true,
      group: "staff",
      endsAt: rollingWindowEnd(now),
      reason: `role:${input.role}`,
    };
  }

  const enabledRows = input.memberships
    .filter(isSubscriptionRow)
    .map((row) => ({ row, access: rowAccess(row, now) }))
    .filter((r) => r.access.enabled);

  if (enabledRows.length === 0) {
    return { enabled: false, group: null, endsAt: null, reason: "no_covering_membership" };
  }

  const group: AccessGroup = enabledRows.some((r) => r.row.extended_access)
    ? "extended"
    : "standard";

  // Per rij: harde datum, anders nu plus zeven dagen. Over de rijen het
  // maximum. Een rij zonder harde datum draagt dus nooit oneindig bij; bij
  // een enkele rij komt dit neer op "harde datum wint altijd".
  const rolling = rollingWindowEnd(now);
  const endsAt = enabledRows.reduce<Date>((latest, r) => {
    const end = r.access.hardEnd ?? rolling;
    return end > latest ? end : latest;
  }, new Date(0));

  const statuses = enabledRows.map((r) => r.row.status).sort().join(",");
  return { enabled: true, group, endsAt, reason: `membership:${statuses}` };
}
