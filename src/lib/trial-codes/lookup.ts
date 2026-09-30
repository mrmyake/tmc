import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrialCodeScope, type TrialCodeScope } from "@/lib/trial-codes/scope";

/**
 * Read-only opzoeking van een (al genormaliseerde) code: de scope als de code
 * bestaat, niet is ingetrokken en nog niet op is, anders null. Dit is een
 * momentopname voor de weergave (welke lijst of kiezer tonen we); bij het
 * boeken beslist tmc.redeem_trial_code opnieuw onder de rijlocks. De scope
 * komt dus altijd uit de database, nooit uit het cookie of de client.
 */
export async function lookupUsableTrialCodeScope(code: string): Promise<TrialCodeScope | null> {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("trial_codes")
    .select("revoked_at, max_uses, uses_count, scope")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("[lookupUsableTrialCodeScope] query failed", error);
    return null;
  }
  const usable =
    row !== null &&
    row.revoked_at === null &&
    (row.max_uses === null || row.uses_count < row.max_uses);
  if (!usable) return null;
  return isTrialCodeScope(row.scope) ? row.scope : null;
}
