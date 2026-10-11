import "server-only";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { trialBookingMode } from "@/lib/mollie-mode";
import { getTrialSessionOptions, type TrialSessionOption } from "@/lib/trial-sessions";
import {
  loadVisitorSlotPicker,
  type VisitorSlotData,
} from "@/lib/trial-codes/vrij-trainen-query";
import { openingSpotsLeft } from "./rules";

/**
 * De groepslessen die nu als gratis proefles te boeken zijn: dezelfde lijst
 * als de betaalde en de codeflow (komende 14 dagen, pillars yoga_mobility,
 * kettlebell, kids, senior, met een vrije plek), beperkt tot lessen waar het
 * openingsquotum van 4 nog niet vol is. `spotsAvailable` wordt het aantal
 * gratis plekken dat nog over is (het kleinste van capaciteit en quotum), zodat
 * de lijst dat getal toont. Zelfde is_test-modus als de boeking
 * (trialBookingMode): preview telt testrijen, productie echte rijen.
 * Weergave; de RPC telt opnieuw onder de sessielock.
 */
export async function getOpeningTrialSessionOptions(): Promise<TrialSessionOption[]> {
  const options = await getTrialSessionOptions({ withPrices: false });
  if (options.length === 0 || !isAdminConfigured()) return [];

  const admin = createAdminClient();
  const isTest = trialBookingMode() === "test";
  const { data, error } = await admin
    .from("trial_bookings")
    .select("session_id")
    .in("session_id", options.map((o) => o.id))
    .eq("source", "opening")
    .eq("is_test", isTest)
    .in("status", ["pending", "paid", "attended"]);
  if (error) {
    console.error("[opening-trial] quota query failed", error);
    return [];
  }

  const bookedBySession = new Map<string, number>();
  for (const row of data ?? []) {
    bookedBySession.set(row.session_id, (bookedBySession.get(row.session_id) ?? 0) + 1);
  }

  return options
    .map((o) => ({
      ...o,
      spotsAvailable: openingSpotsLeft(o.spotsAvailable, bookedBySession.get(o.id) ?? 0),
      priceCents: 0,
    }))
    .filter((o) => (o.spotsAvailable ?? 0) > 0);
}

/**
 * De slotkiezer voor een gratis proefuur vrij trainen: dezelfde dagstrip en
 * kwartieren als de codeflow, met per kwartier het kleinste van de gewone
 * vrije plekken (maximum van 5) en wat er van het openingsquotum van 4 over
 * is. Kwartieren waar al 4 gratis proefgasten zitten tonen daardoor als vol.
 */
export async function loadOpeningSlotPicker(
  requestedDate: string | undefined,
  now: Date = new Date(),
): Promise<VisitorSlotData> {
  return loadVisitorSlotPicker(requestedDate, now, {
    availabilityRpc: "vrij_trainen_opening_availability",
    isTest: trialBookingMode() === "test",
  });
}
