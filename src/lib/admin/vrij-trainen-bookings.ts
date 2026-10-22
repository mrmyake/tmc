import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysIsoAmsterdam, todayIsoAmsterdam, parseIsoDateToAmsterdamMidnight } from "@/lib/format-date";
import { TRIAL_HOURS_HORIZON_DAYS } from "@/lib/admin/trial-hours";

/**
 * Komende ledenboekingen vrij trainen (tmc.bookings met een slot op een
 * vrij-trainen-sessie), voor het admin-rooster naast de proefuren uit
 * trial-hours.ts. Alleen status `booked` (vrij trainen kent geen wachtlijst),
 * geen geannuleerde dagsessies, vanaf het begin van vandaag (Amsterdam) tot
 * twee weken vooruit. Telefoon haalt deze query bewust niet op: die staat in
 * de ledendetail.
 */
export interface VrijTrainenBookingRow {
  id: string;
  profileId: string;
  name: string;
  slotStartAt: string;
  slotEndAt: string;
  isTest: boolean;
}

interface BookingQueryRow {
  id: string;
  profile_id: string;
  slot_start_at: string | null;
  slot_end_at: string | null;
  profile: { first_name: string | null; last_name: string | null; is_test: boolean | null } | null;
}

export async function getUpcomingVrijTrainenBookings(
  now: Date = new Date(),
): Promise<VrijTrainenBookingRow[]> {
  const admin = createAdminClient();
  const todayIso = todayIsoAmsterdam(now);
  const from = parseIsoDateToAmsterdamMidnight(todayIso)!;
  const to = parseIsoDateToAmsterdamMidnight(addDaysIsoAmsterdam(todayIso, TRIAL_HOURS_HORIZON_DAYS))!;

  const { data, error } = await admin
    .from("bookings")
    .select(
      `id, profile_id, slot_start_at, slot_end_at,
       profile:profiles!bookings_profile_id_fkey!inner(first_name, last_name, is_test),
       session:class_sessions!bookings_session_id_fkey!inner(status)`,
    )
    .eq("pillar", "vrij_trainen")
    .eq("status", "booked")
    .neq("session.status", "cancelled")
    .not("slot_start_at", "is", null)
    .gte("slot_start_at", from.toISOString())
    .lt("slot_start_at", to.toISOString())
    .order("slot_start_at", { ascending: true })
    .returns<BookingQueryRow[]>();
  if (error) {
    console.error("[vrij-trainen-bookings] query failed", error);
    return [];
  }
  return (data ?? []).flatMap((r) =>
    r.slot_start_at && r.slot_end_at
      ? [
          {
            id: r.id,
            profileId: r.profile_id,
            // COPY: confirm met Marlon
            name: [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ").trim() || "Onbekend lid",
            slotStartAt: r.slot_start_at,
            slotEndAt: r.slot_end_at,
            isTest: r.profile?.is_test === true,
          },
        ]
      : [],
  );
}
