import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const DROPOFF_THRESHOLD_DAYS = 14;

/**
 * Dropoff-signal cron (spec-community-growth.md, besluit).
 *
 * Vlagt actieve leden die minstens DROPOFF_THRESHOLD_DAYS dagen geen
 * bezoek hebben gebracht, via tmc.v_member_last_attendance (geen
 * bezoek ooit telt ook mee). Admin-facing signaal, bewust geen
 * geautomatiseerd bericht naar het lid zelf: het punt van dit signaal
 * is dat Marlon persoonlijk contact opneemt, niet een generiek
 * "we missen je"-automatisme.
 *
 * 14 dagen, niet de bestaande 30-dagen admin-UI-drempel (die is een
 * achteraf-opschoonfilter; dit signaal moet vroeg genoeg vuren om nog
 * actie te kunnen ondernemen, en 14 dagen valt ongeveer op de helft
 * van de 4-wekelijkse factuurcyclus).
 *
 * Dedup: alleen een nieuw member.dropoff_flagged-event als er nog
 * geen event voor dit profiel bestaat sinds hun laatste bezoek (of
 * ooit, als ze nooit zijn geweest) — anders zou een aanhoudend
 * inactief lid elke dag opnieuw gevlagd worden.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DROPOFF_THRESHOLD_DAYS);
  const cutoffIso = cutoff.toISOString().split("T")[0];

  const { data: members, error } = await admin
    .from("memberships")
    .select("profile_id")
    .eq("status", "active");

  if (error) {
    console.error("[cron/flag-dropoff] fetch memberships failed", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const profileIds = Array.from(
    new Set((members ?? []).map((m) => m.profile_id)),
  );
  if (profileIds.length === 0) {
    return NextResponse.json({ ok: true, flagged: 0 });
  }

  const { data: attendance } = await admin
    .from("v_member_last_attendance")
    .select("profile_id, last_attended_at")
    .in("profile_id", profileIds);

  const lastAttendedById = new Map<string, string | null>();
  for (const row of attendance ?? []) {
    lastAttendedById.set(row.profile_id, row.last_attended_at);
  }

  const candidates = profileIds.filter((id) => {
    const last = lastAttendedById.get(id) ?? null;
    return last === null || last < cutoffIso;
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, flagged: 0 });
  }

  // Meest recente member.dropoff_flagged per kandidaat, om te bepalen of
  // een nieuwe vlag nog nodig is.
  const { data: existingFlags } = await admin
    .from("events")
    .select("subject_id, created_at")
    .eq("type", "member.dropoff_flagged")
    .in("subject_id", candidates)
    .order("created_at", { ascending: false });

  const lastFlagAtById = new Map<string, string>();
  for (const row of existingFlags ?? []) {
    if (!row.subject_id) continue;
    if (!lastFlagAtById.has(row.subject_id)) {
      lastFlagAtById.set(row.subject_id, row.created_at);
    }
  }

  let flagged = 0;
  for (const profileId of candidates) {
    const lastAttended = lastAttendedById.get(profileId) ?? null;
    const lastFlaggedAt = lastFlagAtById.get(profileId);

    if (lastFlaggedAt) {
      // Al gevlagd zonder tussentijds bezoek: sla over.
      if (lastAttended === null) continue;
      if (lastFlaggedAt > lastAttended) continue;
    }

    await emitEvent({
      type: "member.dropoff_flagged",
      actorType: "system",
      actorId: null,
      subjectType: "profile",
      subjectId: profileId,
      payload: {
        last_attended_at: lastAttended,
        threshold_days: DROPOFF_THRESHOLD_DAYS,
      },
    });
    flagged++;
  }

  return NextResponse.json({ ok: true, flagged });
}
