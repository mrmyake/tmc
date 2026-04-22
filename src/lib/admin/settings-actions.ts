"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SettingsActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { ok: false, message: "Geen toegang." };
  }
  return { ok: true, userId: user.id };
}

export interface BookingSettingsInput {
  cancellationWindowHours: number;
  vrijTrainenCancelWindowMinutes: number;
  bookingWindowDays: number;
  waitlistConfirmationMinutes: number;
  fairUseDailyMax: number;
  noShowStrikeWindowDays: number;
  noShowStrikeThreshold: number;
  noShowBlockDays: number;
  registrationFeeCents: number;
  dropInYogaCents: number;
  dropInKettlebellCents: number;
  dropInKidsCents: number;
  dropInSeniorCents: number;
  tenRideCardCents: number;
  kidsTenRideCardCents: number;
  seniorTenRideCardCents: number;
  tenRideCardValidityMonths: number;
  ptIntakeDiscountCents: number;
  memberPtDiscountPercent: number;
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
    ["registrationFeeCents", 0, 100_000],
    ["dropInYogaCents", 0, 100_000],
    ["dropInKettlebellCents", 0, 100_000],
    ["dropInKidsCents", 0, 100_000],
    ["dropInSeniorCents", 0, 100_000],
    ["tenRideCardCents", 0, 1_000_000],
    ["kidsTenRideCardCents", 0, 1_000_000],
    ["seniorTenRideCardCents", 0, 1_000_000],
    ["tenRideCardValidityMonths", 1, 24],
    ["ptIntakeDiscountCents", 0, 100_000],
    ["memberPtDiscountPercent", 0, 100],
  ];
  for (const [key, min, max] of checks) {
    if (!isPositiveInt(input[key], min, max)) {
      return {
        ok: false,
        message: `Waarde voor "${key}" moet een geheel getal tussen ${min} en ${max} zijn.`,
      };
    }
  }

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
    registration_fee_cents: input.registrationFeeCents,
    drop_in_yoga_cents: input.dropInYogaCents,
    drop_in_kettlebell_cents: input.dropInKettlebellCents,
    drop_in_kids_cents: input.dropInKidsCents,
    drop_in_senior_cents: input.dropInSeniorCents,
    ten_ride_card_cents: input.tenRideCardCents,
    kids_ten_ride_card_cents: input.kidsTenRideCardCents,
    senior_ten_ride_card_cents: input.seniorTenRideCardCents,
    ten_ride_card_validity_months: input.tenRideCardValidityMonths,
    pt_intake_discount_cents: input.ptIntakeDiscountCents,
    member_pt_discount_percent: input.memberPtDiscountPercent,
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
