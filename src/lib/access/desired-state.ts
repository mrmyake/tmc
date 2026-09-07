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
 * Groep: extended bij memberships.extended_access true, anders standard.
 * Profielen met rol trainer of admin krijgen staff, ook zonder membership.
 *
 * Einddatum (fail closed): een harde datum wint altijd; anders geeft
 * resolveDesiredAccess endsAt null terug en vult de sync een rollend
 * venster van nu plus ROLLING_ACCESS_WINDOW_DAYS in, elke run opnieuw.
 */

export interface AccessMembershipRow {
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
  /** Harde einddatum; null betekent "rollend venster", nooit "voor altijd". */
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
    return { enabled: true, group: "staff", endsAt: null, reason: `role:${input.role}` };
  }

  const enabledRows = input.memberships
    .map((row) => ({ row, access: rowAccess(row, now) }))
    .filter((r) => r.access.enabled);

  if (enabledRows.length === 0) {
    return { enabled: false, group: null, endsAt: null, reason: "no_covering_membership" };
  }

  const group: AccessGroup = enabledRows.some((r) => r.row.extended_access)
    ? "extended"
    : "standard";

  // Meerdere dekkende rijen: een rij zonder harde einddatum loopt door, dus
  // dan geldt het rollende venster; anders de laatste harde einddatum. Bij
  // een enkele rij komt dit neer op "harde datum wint altijd".
  const anyRolling = enabledRows.some((r) => r.access.hardEnd === null);
  const endsAt = anyRolling
    ? null
    : enabledRows.reduce<Date | null>((latest, r) => {
        const end = r.access.hardEnd as Date;
        return latest === null || end > latest ? end : latest;
      }, null);

  const statuses = enabledRows.map((r) => r.row.status).sort().join(",");
  return { enabled: true, group, endsAt, reason: `membership:${statuses}` };
}
