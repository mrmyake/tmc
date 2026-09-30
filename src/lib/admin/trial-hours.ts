import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysIsoAmsterdam, todayIsoAmsterdam, parseIsoDateToAmsterdamMidnight } from "@/lib/format-date";

/**
 * Komende proefuren vrij trainen (gratis boekingen met een vrij-trainen-code,
 * trial_bookings met een slot), voor het admin-rooster: Marlon moet weten wie
 * wanneer komt. Vrij trainen staat bewust niet in de gewone roosterweergave
 * (spec-vrij-trainen-slots.md); dit is de enige plek waar de proefbezoekers
 * per slot staan. Alleen actieve boekingen (paid of attended), vanaf het begin
 * van vandaag (Amsterdam) tot twee weken vooruit.
 */
export interface TrialHourRow {
  id: string;
  name: string;
  phone: string;
  slotStartAt: string;
  slotEndAt: string;
  isTest: boolean;
}

export const TRIAL_HOURS_HORIZON_DAYS = 14;

export async function getUpcomingTrialHours(now: Date = new Date()): Promise<TrialHourRow[]> {
  const admin = createAdminClient();
  const todayIso = todayIsoAmsterdam(now);
  const from = parseIsoDateToAmsterdamMidnight(todayIso)!;
  const to = parseIsoDateToAmsterdamMidnight(addDaysIsoAmsterdam(todayIso, TRIAL_HOURS_HORIZON_DAYS))!;

  const { data, error } = await admin
    .from("trial_bookings")
    .select("id, name, phone, slot_start_at, slot_end_at, is_test")
    .not("slot_start_at", "is", null)
    .in("status", ["paid", "attended"])
    .gte("slot_start_at", from.toISOString())
    .lt("slot_start_at", to.toISOString())
    .order("slot_start_at", { ascending: true });
  if (error) {
    console.error("[trial-hours] query failed", error);
    return [];
  }
  return (data ?? []).flatMap((r) =>
    r.slot_start_at && r.slot_end_at
      ? [
          {
            id: r.id,
            name: r.name,
            phone: r.phone,
            slotStartAt: r.slot_start_at,
            slotEndAt: r.slot_end_at,
            isTest: r.is_test,
          },
        ]
      : [],
  );
}
