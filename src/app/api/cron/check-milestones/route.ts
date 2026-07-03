import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendPushToProfile } from "@/lib/push";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// Klassen-mijlpalen (spec-community-growth.md §3, besluit). Bewust geen
// streaks, alleen aantal-bijgewoonde-lessen-drempels en lidmaatschap-
// jubilea.
const CLASS_MILESTONES = [10, 25, 50, 100] as const;

// COPY: confirm with Marlon
const CLASS_MILESTONE_COPY: Record<number, { title: string; body: string }> = {
  10: {
    title: "10 lessen!",
    body: "Je hebt je 10e les afgerond. Lekker bezig.",
  },
  25: {
    title: "25 lessen!",
    body: "25 lessen achter de rug. Knap volgehouden.",
  },
  50: {
    title: "50 lessen!",
    body: "50 lessen. Dat begint op toewijding te lijken.",
  },
  100: {
    title: "100 lessen!",
    body: "100 lessen bij The Movement Club. Indrukwekkend.",
  },
};

// COPY: confirm with Marlon
function anniversaryCopy(years: number): { title: string; body: string } {
  const jaarWoord = years === 1 ? "jaar" : "jaar";
  return {
    title: `${years} ${jaarWoord} lid!`,
    body: `Al ${years} ${jaarWoord} onderdeel van The Movement Club. Bedankt dat je erbij bent.`,
  };
}

interface MilestonePayload {
  milestone_type?: "classes_attended" | "anniversary";
  threshold?: number;
  years?: number;
}

/**
 * Check-milestones cron (spec-community-growth.md §3, besluit).
 *
 * Detectie via een dagelijkse cron, niet via de check-in-flow zelf:
 * bookings.status wordt pas 'attended' via markAttendance (admin/
 * trainer-actie na afloop van een sessie), niet direct bij het
 * inchecken op de tablet (zie check-in/actions.ts, booking_id is daar
 * nog null). Een check-in-trigger zou dus niet betrouwbaar correleren
 * met wanneer de attended-telling daadwerkelijk verandert.
 *
 * Telling: query-time count() per lid. Afwijking van de letterlijke
 * spec-tekst ("bookings.status = 'attended'"): live schema-check
 * (pg_get_constraintdef) bevestigt dat bookings.status sinds de PR3e-
 * refactor ("slim bookings.status") nooit meer 'attended' bevat, alleen
 * nog {booked, cancelled, waitlisted}. Aanwezigheid wordt sindsdien
 * bijgehouden via bookings.attended_at (not null), status blijft
 * 'booked'. De telling gebruikt daarom attended_at is not null in
 * plaats van de spec-letterlijke status-check, anders zou de teller
 * altijd op 0 blijven staan. Bij TMC's schaal (boutique studio, max 6
 * per groep) is dit triviaal, geen aparte tellerkolom nodig.
 *
 * Dedup: leest bestaande member.milestone_reached-events per lid om
 * te bepalen welke drempels/jaren al gemeld zijn, zodat een lid niet
 * elke dag opnieuw dezelfde mijlpaal krijgt.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  let notified = 0;

  const { data: memberships, error: membershipsErr } = await admin
    .from("memberships")
    .select("profile_id, start_date")
    .eq("status", "active");

  if (membershipsErr) {
    console.error(
      "[cron/check-milestones] fetch memberships failed",
      membershipsErr,
    );
    return NextResponse.json(
      { ok: false, error: membershipsErr.message },
      { status: 500 },
    );
  }

  const profileIds = Array.from(
    new Set((memberships ?? []).map((m) => m.profile_id)),
  );
  if (profileIds.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  const { data: attendedRows } = await admin
    .from("bookings")
    .select("profile_id")
    .not("attended_at", "is", null)
    .in("profile_id", profileIds);

  const countByProfile = new Map<string, number>();
  for (const row of attendedRows ?? []) {
    countByProfile.set(row.profile_id, (countByProfile.get(row.profile_id) ?? 0) + 1);
  }

  const { data: existingMilestones } = await admin
    .from("events")
    .select("subject_id, payload")
    .eq("type", "member.milestone_reached")
    .in("subject_id", profileIds);

  const notifiedThresholds = new Map<string, Set<number>>();
  const notifiedYears = new Map<string, Set<number>>();
  for (const ev of existingMilestones ?? []) {
    if (!ev.subject_id) continue;
    const payload = (ev.payload ?? {}) as MilestonePayload;
    if (payload.milestone_type === "classes_attended" && typeof payload.threshold === "number") {
      if (!notifiedThresholds.has(ev.subject_id)) {
        notifiedThresholds.set(ev.subject_id, new Set());
      }
      notifiedThresholds.get(ev.subject_id)!.add(payload.threshold);
    }
    if (payload.milestone_type === "anniversary" && typeof payload.years === "number") {
      if (!notifiedYears.has(ev.subject_id)) {
        notifiedYears.set(ev.subject_id, new Set());
      }
      notifiedYears.get(ev.subject_id)!.add(payload.years);
    }
  }

  // -- Klassen-mijlpalen -----------------------------------------------
  for (const profileId of profileIds) {
    const count = countByProfile.get(profileId) ?? 0;
    const already = notifiedThresholds.get(profileId) ?? new Set<number>();

    for (const threshold of CLASS_MILESTONES) {
      if (count < threshold || already.has(threshold)) continue;

      const copy = CLASS_MILESTONE_COPY[threshold];
      await emitEvent({
        type: "member.milestone_reached",
        actorType: "system",
        actorId: null,
        subjectType: "profile",
        subjectId: profileId,
        payload: { milestone_type: "classes_attended", threshold },
      });
      await sendPushToProfile(profileId, { title: copy.title, body: copy.body });
      notified++;
    }
  }

  // -- Lidmaatschap-jubilea ----------------------------------------------
  const today = new Date();
  const todayMonth = today.getUTCMonth();
  const todayDate = today.getUTCDate();
  const processedAnniversaryProfiles = new Set<string>();

  for (const m of memberships ?? []) {
    if (processedAnniversaryProfiles.has(m.profile_id)) continue;

    const start = new Date(m.start_date);
    if (start.getUTCMonth() !== todayMonth || start.getUTCDate() !== todayDate) {
      continue;
    }
    const years = today.getUTCFullYear() - start.getUTCFullYear();
    if (years < 1) continue;

    processedAnniversaryProfiles.add(m.profile_id);

    const already = notifiedYears.get(m.profile_id) ?? new Set<number>();
    if (already.has(years)) continue;

    const copy = anniversaryCopy(years);
    await emitEvent({
      type: "member.milestone_reached",
      actorType: "system",
      actorId: null,
      subjectType: "profile",
      subjectId: m.profile_id,
      payload: { milestone_type: "anniversary", years },
    });
    await sendPushToProfile(m.profile_id, { title: copy.title, body: copy.body });
    notified++;
  }

  return NextResponse.json({ ok: true, notified });
}
