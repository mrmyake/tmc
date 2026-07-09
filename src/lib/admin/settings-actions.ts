"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import {
  CHECK_IN_PILLAR_OPTIONS,
  type CheckInPillar,
} from "./settings-constants";

export type SettingsActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

// Prijsvelden bestaan hier niet meer: prijzen leven uitsluitend in
// tmc.catalogue en wijzigen per migratie (Migratie B dropte de
// booking_settings-prijskolommen en daarmee de admin-prijseditor).
export interface BookingSettingsInput {
  cancellationWindowHours: number;
  vrijTrainenCancelWindowMinutes: number;
  bookingWindowDays: number;
  waitlistConfirmationMinutes: number;
  fairUseDailyMax: number;
  noShowStrikeWindowDays: number;
  noShowStrikeThreshold: number;
  noShowBlockDays: number;
  checkInEnabled: boolean;
  checkInPillars: CheckInPillar[];
  noShowReleaseMinutes: number;
}

function isPositiveInt(n: number, min = 0, max = 10_000_000): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

export async function saveBookingSettings(
  input: BookingSettingsInput,
): Promise<SettingsActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  // Simple bounds — catch fat-fingered entries. Not a full validation
  // framework; the DB column defaults and not-null constraints backstop.
  const checks: Array<[keyof BookingSettingsInput, number, number]> = [
    ["cancellationWindowHours", 0, 48],
    ["vrijTrainenCancelWindowMinutes", 0, 600],
    ["bookingWindowDays", 1, 90],
    ["waitlistConfirmationMinutes", 5, 240],
    ["fairUseDailyMax", 1, 10],
    ["noShowStrikeWindowDays", 1, 365],
    ["noShowStrikeThreshold", 1, 10],
    ["noShowBlockDays", 0, 90],
    ["noShowReleaseMinutes", 0, 120],
  ];
  for (const [key, min, max] of checks) {
    if (!isPositiveInt(input[key] as number, min, max)) {
      return {
        ok: false,
        message: `Waarde voor "${key}" moet een geheel getal tussen ${min} en ${max} zijn.`,
      };
    }
  }

  if (typeof input.checkInEnabled !== "boolean") {
    return { ok: false, message: "Check-in toggle ontbreekt." };
  }
  if (!Array.isArray(input.checkInPillars)) {
    return { ok: false, message: "Check-in pillars ontbreken." };
  }
  const allowed = new Set<string>(CHECK_IN_PILLAR_OPTIONS);
  for (const p of input.checkInPillars) {
    if (!allowed.has(p)) {
      return { ok: false, message: `Onbekende pillar: ${p}` };
    }
  }
  const dedupedPillars = Array.from(new Set(input.checkInPillars));

  const admin = createAdminClient();

  const patch = {
    cancellation_window_hours: input.cancellationWindowHours,
    vrij_trainen_cancel_window_minutes: input.vrijTrainenCancelWindowMinutes,
    booking_window_days: input.bookingWindowDays,
    waitlist_confirmation_minutes: input.waitlistConfirmationMinutes,
    fair_use_daily_max: input.fairUseDailyMax,
    no_show_strike_window_days: input.noShowStrikeWindowDays,
    no_show_strike_threshold: input.noShowStrikeThreshold,
    no_show_block_days: input.noShowBlockDays,
    check_in_enabled: input.checkInEnabled,
    check_in_pillars: dedupedPillars,
    no_show_release_minutes: input.noShowReleaseMinutes,
  };

  const { error } = await admin
    .from("booking_settings")
    .update(patch)
    .eq("id", "singleton");

  if (error) {
    console.error("[saveBookingSettings] update failed", error);
    return { ok: false, message: "Opslaan lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "booking_settings_updated",
    target_type: "booking_settings",
    target_id: crypto.randomUUID(),
    details: patch,
  });

  revalidatePath("/app/admin/instellingen");
  revalidatePath("/app/admin");

  return { ok: true, message: "Instellingen opgeslagen." };
}
