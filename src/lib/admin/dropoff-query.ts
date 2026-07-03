import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DropoffRow {
  profileId: string;
  firstName: string;
  lastName: string;
  email: string;
  lastAttendedAt: string | null;
  flaggedAt: string;
}

/**
 * Leden die nog "open" staan als dropoff-signaal: hun laatste
 * member.dropoff_flagged-event (flag-dropoff cron) heeft geen bezoek
 * erna. Zodra een lid weer inchecke, verdwijnt het vanzelf uit deze
 * lijst zonder dat er iets bijgewerkt hoeft te worden (tmc.events is
 * append-only, dus "opgelost" wordt hier afgeleid, niet opgeslagen).
 */
export async function listOpenDropoffFlags(): Promise<DropoffRow[]> {
  const admin = createAdminClient();

  const { data: flagRows, error: flagErr } = await admin
    .from("events")
    .select("subject_id, created_at")
    .eq("type", "member.dropoff_flagged")
    .order("created_at", { ascending: false });

  if (flagErr) {
    console.error("[listOpenDropoffFlags] events query failed", flagErr);
    return [];
  }

  const latestFlagByProfile = new Map<string, string>();
  for (const row of flagRows ?? []) {
    if (!row.subject_id) continue;
    if (!latestFlagByProfile.has(row.subject_id)) {
      latestFlagByProfile.set(row.subject_id, row.created_at);
    }
  }

  const profileIds = Array.from(latestFlagByProfile.keys());
  if (profileIds.length === 0) return [];

  const [attendanceRes, membershipRes, profileRes] = await Promise.all([
    admin
      .from("v_member_last_attendance")
      .select("profile_id, last_attended_at")
      .in("profile_id", profileIds),
    admin
      .from("memberships")
      .select("profile_id")
      .eq("status", "active")
      .in("profile_id", profileIds),
    admin
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", profileIds),
  ]);

  const lastAttendedByProfile = new Map<string, string | null>();
  for (const row of attendanceRes.data ?? []) {
    lastAttendedByProfile.set(row.profile_id, row.last_attended_at);
  }

  const activeProfileIds = new Set(
    (membershipRes.data ?? []).map((m) => m.profile_id),
  );

  const profileById = new Map(
    (profileRes.data ?? []).map((p) => [p.id, p]),
  );

  const rows: DropoffRow[] = [];
  for (const profileId of profileIds) {
    if (!activeProfileIds.has(profileId)) continue;

    const flaggedAt = latestFlagByProfile.get(profileId);
    if (!flaggedAt) continue;
    const lastAttended = lastAttendedByProfile.get(profileId) ?? null;

    // Nog open: geen bezoek, of het laatste bezoek ligt vóór de vlag.
    const stillOpen = lastAttended === null || lastAttended < flaggedAt;
    if (!stillOpen) continue;

    const profile = profileById.get(profileId);
    if (!profile) continue;

    rows.push({
      profileId,
      firstName: profile.first_name,
      lastName: profile.last_name,
      email: profile.email,
      lastAttendedAt: lastAttended,
      flaggedAt,
    });
  }

  return rows;
}

export async function countOpenDropoffFlags(): Promise<number> {
  const rows = await listOpenDropoffFlags();
  return rows.length;
}
