import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MollieMode } from "@/lib/mollie";

/**
 * Modus voor de publieke proefles-route (spec-facturatie.md 2.9/6.6): de
 * deployment bepaalt, nooit de bezoeker. Preview en lokale ontwikkeling
 * draaien altijd test, productie altijd live. Bewust geen publieke
 * override: een query-parameter waarmee een bezoeker in productie een
 * testbetaling start, geeft hem een proeflesplek voor nul euro.
 */
export function trialBookingMode(): MollieMode {
  return process.env.VERCEL_ENV === "production" ? "live" : "test";
}

/**
 * Modus van een profiel (spec-facturatie.md 6.1: de testmodus leeft op
 * tmc.profiles.is_test). Onbekend of onvindbaar profiel telt als live:
 * een testbetaling die per abuis op de live-key draait faalt hard bij
 * Mollie (404), terwijl een echte betaling op de testkey stil nepgeld
 * voor een echte dienst zou opleveren.
 */
export async function mollieModeForProfile(
  profileId: string | null | undefined,
): Promise<MollieMode> {
  if (!profileId) return "live";
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_test")
    .eq("id", profileId)
    .maybeSingle();
  return data?.is_test ? "test" : "live";
}

/** Modus via een membership: membership -> profiel -> is_test. */
export async function mollieModeForMembership(
  membershipId: string | null | undefined,
): Promise<MollieMode> {
  if (!membershipId) return "live";
  const admin = createAdminClient();
  const { data } = await admin
    .from("memberships")
    .select("profile:profiles!profile_id(is_test)")
    .eq("id", membershipId)
    .maybeSingle();
  const ref = Array.isArray(data?.profile) ? data?.profile[0] : data?.profile;
  return ref?.is_test ? "test" : "live";
}
