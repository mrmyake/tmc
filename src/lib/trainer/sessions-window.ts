import { amsterdamYmd, zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";

/**
 * Welke lessen /app/trainer/sessies toont (fase-2-checkin-model.md PR 4).
 * Naast de komende vier weken ook de lessen van vandaag (Europe/Amsterdam)
 * die al bezig of afgelopen zijn maar nog niet door de cron close-sessions
 * zijn afgesloten: daar tikt de trainer tijdens en direct na de les de
 * no-shows aan. Na het afsluiten verdwijnt de les uit de lijst; corrigeren
 * kan dan nog via de kiosk of het admin-rooster.
 */

export const TRAINER_SESSIONS_HORIZON_DAYS = 28;

export interface TrainerSessionsWindow {
  nowIso: string;
  horizonIso: string;
  dayStartIso: string;
  dayEndIso: string;
  /**
   * PostgREST or-filter: komend, of vandaag en nog niet afgesloten. Alleen
   * bruikbaar als class_sessions.closed_at bestaat (migratie 20261023120000).
   */
  orFilter: string;
}

export function trainerSessionsWindow(now: Date): TrainerSessionsWindow {
  const { year, month, day } = amsterdamYmd(now);
  const dayStart = zonedWallClockToUtc(year, month, day, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const nowIso = now.toISOString();
  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();
  return {
    nowIso,
    horizonIso: new Date(now.getTime() + TRAINER_SESSIONS_HORIZON_DAYS * 86_400_000).toISOString(),
    dayStartIso,
    dayEndIso,
    orFilter: `start_at.gte.${nowIso},and(closed_at.is.null,start_at.gte.${dayStartIso},start_at.lt.${dayEndIso})`,
  };
}

export type SessionPhase = "upcoming" | "ongoing" | "ended";

/** Komend, bezig of afgelopen, op start_at en end_at. */
export function sessionPhase(
  startAtIso: string,
  endAtIso: string,
  now: Date,
): SessionPhase {
  const t = now.getTime();
  if (t < new Date(startAtIso).getTime()) return "upcoming";
  if (t < new Date(endAtIso).getTime()) return "ongoing";
  return "ended";
}

// COPY: confirm met Marlon
export const SESSION_PHASE_LABEL: Record<Exclude<SessionPhase, "upcoming">, string> = {
  ongoing: "Nu bezig",
  ended: "Afgelopen, nog niet afgesloten",
};
