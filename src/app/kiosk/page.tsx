import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTrainerScope } from "@/lib/trainer/trainer-scope";
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
  class_type: { name: string | null } | { name: string | null }[] | null;
  trainer:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
}

/**
 * /kiosk: vandaag-weergave voor de muurtablet, tweede ingang naar
 * dezelfde deelnemerslijst/markAttendance() als /app/trainer/sessies/[id].
 * Geen nieuwe incheck-logica hier. Admin ziet alle sessies van vandaag;
 * een trainer ziet wat resolveTrainerScope haar geeft (eigen sessies).
 */
export default async function KioskPage() {
  const scope = await resolveTrainerScope();
  // Layout gate al af; dit is defensief voor het geval de sessie
  // tussentijds wegvalt.
  if (!scope.ok) redirect("/app");

  const now = new Date();
  const admin = createAdminClient();
  const { year, month, day } = amsterdamYmd(now);
  const dayStart = zonedWallClockToUtc(year, month, day, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const trainerFilterId = scope.isAdmin ? null : scope.selectedTrainerId;
  // Trainer zonder (actieve) eigen trainers-rij: niets te tonen, geen
  // query nodig.
  const skipQuery = !scope.isAdmin && !trainerFilterId;

  let sessions: KioskSession[] = [];

  if (!skipQuery) {
    let query = admin
      .from("class_sessions")
      .select(
        `id, start_at, end_at, status,
         class_type:class_types(name),
         trainer:trainers(display_name)`,
      )
      .gte("start_at", dayStart.toISOString())
      .lt("start_at", dayEnd.toISOString())
      .neq("status", "cancelled")
      .order("start_at", { ascending: true });

    if (trainerFilterId) {
      query = query.eq("trainer_id", trainerFilterId);
    }

    const { data: sessionRows } = await query.returns<SessionRow[]>();
    const rows = sessionRows ?? [];
    const sessionIds = rows.map((r) => r.id);

    const [{ data: bookingRows }, { data: checkinRows }] = await Promise.all([
      sessionIds.length
        ? admin
            .from("bookings")
            .select("session_id")
            .in("session_id", sessionIds)
            .eq("status", "booked")
        : Promise.resolve({ data: [] as { session_id: string }[] }),
      // Ingecheckt-aantal komt uit tmc.check_ins, niet bookings.attended_at:
      // de admin-tablet (/checkin) schrijft attended_at niet. Zie de
      // PR-body voor de bevestiging dat een sessie-gebonden check_ins-rij
      // vandaag uitsluitend via markAttendance() ontstaat (dus via precies
      // deze deelnemerslijst), dus deze telling loopt niet uit de pas met
      // wat de trainer net heeft afgevinkt.
      sessionIds.length
        ? admin
            .from("check_ins")
            .select("session_id")
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [] as { session_id: string | null }[] }),
    ]);

    const bookedCounts = new Map<string, number>();
    for (const b of bookingRows ?? []) {
      bookedCounts.set(b.session_id, (bookedCounts.get(b.session_id) ?? 0) + 1);
    }
    const checkedInCounts = new Map<string, number>();
    for (const c of checkinRows ?? []) {
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
      };
    });
  }

  return <KioskFrame now={now} sessions={sessions} />;
}
