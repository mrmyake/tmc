import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeTrialBookingCancellation, type CancelCoreResult } from "@/lib/trial-booking-cancel";

// COPY: confirm met Marlon
const SESSION_CANCELLED_REASON = "De les is inmiddels geannuleerd";

/**
 * Webhook-bijvangst (spec-community-growth.md §1 "Annulering door de
 * studio"): een betaling komt binnen op een sessie die intussen door de
 * studio is geannuleerd. De boeking is dan net naar 'paid' gezet; hier
 * wordt hij meteen weer geannuleerd via tmc.system_cancel_trial_booking
 * (service_role), met refund en annuleringsmail. Geeft true terug als de
 * aanroeper de gewone bevestigingsmail moet overslaan.
 */
export async function cancelIfSessionCancelled(trial: {
  id: string;
  session_id: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("class_sessions")
    .select("status")
    .eq("id", trial.session_id)
    .maybeSingle();
  if (session?.status !== "cancelled") return false;

  const { data, error } = await admin.rpc("system_cancel_trial_booking", {
    p_id: trial.id,
    p_reason: SESSION_CANCELLED_REASON,
  });
  if (error) {
    console.error("[trial-booking] system cancel on cancelled session failed", trial.id, error);
    return false;
  }
  const result = data as CancelCoreResult;
  if (!result.ok) {
    console.error("[trial-booking] system cancel refused", trial.id, result.reason);
    return false;
  }
  await finalizeTrialBookingCancellation(result, SESSION_CANCELLED_REASON);
  return true;
}
