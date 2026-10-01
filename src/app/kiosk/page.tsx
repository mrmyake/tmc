import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireKioskActor } from "@/lib/kiosk/gate";
import {
  amsterdamYmd,
  zonedWallClockToUtc,
} from "@/lib/scheduling/amsterdam-time";
import { KioskFrame, type KioskSession } from "./_components/KioskFrame";

export const dynamic = "force-dynamic";

interface SessionRow {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  pillar: string | null;
  rescheduled_at: string | null;
  occurrence_start_at: string;
  class_type: { name: string | null } | { name: string | null }[] | null;
  trainer:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
}

/**
 * /kiosk: vandaag-weergave voor de muurtablet, tweede ingang naar
 * dezelfde deelnemerslijst/markAttendance() als /app/trainer/sessies/[id].
 * Geen nieuwe incheck-logica hier. Sinds check-in PR 2 komt de actor uit
 * de kiosk-gate (staff-login óf apparaat plus kiosk-sessie); een admin ziet
 * alle sessies van vandaag, een trainer de eigen (via de trainers-rij op
 * het staflid-id). Renderen verlengt de sessie niet.
 */
export default async function KioskPage() {
  const actor = await requireKioskActor({ extend: false });
  // Layout gate al af; dit is defensief voor het geval de sessie
  // tussentijds wegvalt.
  if (!actor.ok) redirect("/kiosk");

  const now = new Date();
  const admin = createAdminClient();
  const { year, month, day } = amsterdamYmd(now);
  const dayStart = zonedWallClockToUtc(year, month, day, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  let trainerFilterId: string | null = null;
  if (actor.actorType !== "admin") {
    const { data: trainer } = await admin
      .from("trainers")
      .select("id")
      .eq("profile_id", actor.userId)
      .eq("is_active", true)
      .maybeSingle();
    trainerFilterId = trainer?.id ?? null;
  }
  // Trainer zonder (actieve) eigen trainers-rij: niets te tonen, geen
  // query nodig.
  const skipQuery = actor.actorType !== "admin" && !trainerFilterId;

  let sessions: KioskSession[] = [];

  if (!skipQuery) {
    let query = admin
      .from("class_sessions")
      .select(
        `id, start_at, end_at, status, pillar, rescheduled_at, occurrence_start_at,
         class_type:class_types(name),
         trainer:trainers(display_name)`,
      )
      .gte("start_at", dayStart.toISOString())
      .lt("start_at", dayEnd.toISOString())
      // Vrij trainen is een dagsessie met eigen slots en hoort niet op de
      // kiosk (spec-vrij-trainen-slots.md); check-in loopt via /kiosk/paneel.
      .neq("pillar", "vrij_trainen")
      // Geannuleerde lessen blijven zichtbaar als "Vervalt"
      // (spec-session-overrides.md); KioskFrame maakt ze niet klikbaar.
      .order("start_at", { ascending: true });

    if (trainerFilterId) {
      query = query.eq("trainer_id", trainerFilterId);
    }

    const { data: sessionRows } = await query.returns<SessionRow[]>();
    const rows = sessionRows ?? [];
    const sessionIds = rows.map((r) => r.id);

    // Geboekt: de totale bezetting uit tmc.v_session_availability (leden,
    // proeflessen, gasten, open promoties), zelfde getal als rooster en
    // deelnemerslijst. Een geannuleerde sessie staat niet in de view en
    // blijft op 0; KioskFrame toont die als "Vervalt".
    // Ingecheckt: leden uit tmc.check_ins (sessie-gebonden check-ins
    // ontstaan uitsluitend via de kern uit #214) plus aanwezige gasten en
    // proeflessen, die hun aanwezigheid in de eigen tabel dragen.
    const none = Promise.resolve({ data: [] as { session_id: string | null }[] });
    const [
      { data: availabilityRows },
      { data: checkinRows },
      { data: guestRows },
      { data: trialRows },
    ] = await Promise.all([
      sessionIds.length
        ? admin
            .from("v_session_availability")
            .select("id, taken_count")
            .in("id", sessionIds)
        : Promise.resolve({ data: [] as { id: string; taken_count: number | null }[] }),
      sessionIds.length
        ? admin.from("check_ins").select("session_id").in("session_id", sessionIds)
        : none,
      sessionIds.length
        ? admin
            .from("guest_bookings")
            .select("session_id")
            .in("session_id", sessionIds)
            .eq("status", "attended")
        : none,
      sessionIds.length
        ? admin
            .from("trial_bookings")
            .select("session_id")
            .in("session_id", sessionIds)
            .eq("status", "attended")
            .eq("is_test", false)
        : none,
    ]);

    const bookedCounts = new Map<string, number>();
    for (const r of availabilityRows ?? []) {
      if (r.id) bookedCounts.set(r.id, r.taken_count ?? 0);
    }
    const checkedInCounts = new Map<string, number>();
    for (const c of [
      ...(checkinRows ?? []),
      ...(guestRows ?? []),
      ...(trialRows ?? []),
    ]) {
      if (!c.session_id) continue;
      checkedInCounts.set(
        c.session_id,
        (checkedInCounts.get(c.session_id) ?? 0) + 1,
      );
    }

    sessions = rows.map((r) => {
      const classType = Array.isArray(r.class_type)
        ? r.class_type[0]
        : r.class_type;
      const trainer = Array.isArray(r.trainer) ? r.trainer[0] : r.trainer;
      return {
        id: r.id,
        startAt: new Date(r.start_at),
        endAt: new Date(r.end_at),
        className: classType?.name ?? "Sessie",
        trainerName: trainer?.display_name ?? "",
        bookedCount: bookedCounts.get(r.id) ?? 0,
        checkedInCount: checkedInCounts.get(r.id) ?? 0,
        pillar: r.pillar ?? null,
        cancelled: r.status === "cancelled",
        rescheduledFrom:
          r.rescheduled_at && r.occurrence_start_at !== r.start_at
            ? new Date(r.occurrence_start_at)
            : null,
      };
    });
  }

  return (
    <KioskFrame
      now={now}
      sessions={sessions}
      showControl={actor.via === "login"}
      lockable={actor.via === "kiosk"}
    />
  );
}
