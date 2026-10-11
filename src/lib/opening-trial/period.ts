import "server-only";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { isOpeningPeriodActive, type OpeningTrialPeriod } from "./rules";

/**
 * De gratis openingsperiode uit tmc.booking_settings (free_trial_start_at,
 * free_trial_end_at). Eén lezer voor /proefles, /proefles/boeken en
 * /proefles/gratis, zodat de kaarten en de redirects dezelfde klok volgen.
 * Dit is weergave en routering; tmc.book_opening_trial controleert de periode
 * bij het boeken opnieuw. Zonder service-role-env (lokale dev zonder
 * .env.local) nooit actief.
 */
export async function getOpeningTrialPeriod(): Promise<OpeningTrialPeriod | null> {
  if (!isAdminConfigured()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("booking_settings")
    .select("free_trial_start_at, free_trial_end_at")
    .eq("id", "singleton")
    .maybeSingle();
  if (error) {
    console.error("[opening-trial] period query failed", error);
    return null;
  }
  if (!data) return null;
  return { startAt: data.free_trial_start_at ?? null, endAt: data.free_trial_end_at ?? null };
}

export async function isOpeningTrialActive(now: Date = new Date()): Promise<boolean> {
  return isOpeningPeriodActive(await getOpeningTrialPeriod(), now);
}
