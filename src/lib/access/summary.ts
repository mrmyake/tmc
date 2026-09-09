import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessGroup } from "./constants";

/**
 * Samenvatting van de deurtoegang van een profiel voor het ledenscherm,
 * zonder de PIN zelf. tmc.access_credentials is service-role only (geen
 * RLS-policies), dus dit leest via de admin-client; de aanroeper geeft
 * uitsluitend auth.uid() door.
 *
 * state:
 *  - "none": geen credential-rij, of geen Akiles-member (nog nooit
 *    gesynchroniseerd, of geen dekkend abonnement gehad).
 *  - "expired": er is een member, maar access_ends_at ligt in het
 *    verleden (toegang ingetrokken of verlopen).
 *  - "active": member met PIN en einddatum in de toekomst.
 */
export type AccessSummary =
  | { state: "none" }
  | { state: "expired"; group: AccessGroup | null }
  | { state: "active"; group: AccessGroup | null; endsAt: string; hasPin: boolean };

export async function getAccessSummary(profileId: string): Promise<AccessSummary> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("access_credentials")
    .select("akiles_member_id, akiles_pin_id, access_group, access_ends_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) {
    console.error("[access-summary] lezen mislukt", profileId, error.message);
    return { state: "none" };
  }
  const row = data as {
    akiles_member_id: string | null;
    akiles_pin_id: string | null;
    access_group: AccessGroup | null;
    access_ends_at: string | null;
  } | null;
  if (!row?.akiles_member_id) return { state: "none" };
  if (!row.access_ends_at || new Date(row.access_ends_at) <= new Date()) {
    return { state: "expired", group: row.access_group };
  }
  return {
    state: "active",
    group: row.access_group,
    endsAt: row.access_ends_at,
    hasPin: Boolean(row.akiles_pin_id),
  };
}
