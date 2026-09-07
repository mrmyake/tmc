import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAkilesClient } from "@/lib/akiles";

/**
 * Onthullen van de PIN en de magic link van een lid, on demand en
 * server-side. Gebouwd voor PR 2 (tabblad Toegang, Wallet-pas).
 *
 * De teruggegeven waarde wordt NOOIT gepersisteerd en NOOIT gelogd: niet
 * hier, niet in tmc.events, niet in console-output. Alleen de Akiles-ids
 * staan in tmc.access_credentials; de waarde zelf leeft uitsluitend bij
 * Akiles en in de response richting de aanroeper.
 *
 * Autorisatie is de verantwoordelijkheid van de aanroeper: deze functies
 * nemen een profileId aan en controleren zelf niet wie vraagt. De server
 * action in PR 2 mag alleen auth.uid() als profileId doorgeven.
 */

export type RevealResult<K extends string> =
  | ({ ok: true } & Record<K, string>)
  | {
      ok: false;
      reason: "not_configured" | "no_credentials" | "no_access" | "akiles_error";
    };

async function loadCredentials(profileId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("access_credentials")
    .select("akiles_member_id, akiles_pin_id, akiles_magic_link_id, access_ends_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) {
    console.error("[access-reveal] credentials lezen mislukt", profileId, error.message);
    return null;
  }
  return data as {
    akiles_member_id: string | null;
    akiles_pin_id: string | null;
    akiles_magic_link_id: string | null;
    access_ends_at: string | null;
  } | null;
}

function accessIsOpen(endsAt: string | null): boolean {
  return Boolean(endsAt) && new Date(endsAt as string) > new Date();
}

export async function revealAccessPin(
  profileId: string,
): Promise<RevealResult<"pin">> {
  const akiles = getAkilesClient();
  if (!akiles) return { ok: false, reason: "not_configured" };
  const cred = await loadCredentials(profileId);
  if (!cred?.akiles_member_id || !cred.akiles_pin_id) {
    return { ok: false, reason: "no_credentials" };
  }
  if (!accessIsOpen(cred.access_ends_at)) return { ok: false, reason: "no_access" };
  try {
    const { pin } = await akiles.revealPin(cred.akiles_member_id, cred.akiles_pin_id);
    // Geen log, geen event, geen opslag: de waarde gaat direct terug.
    return { ok: true, pin };
  } catch (err) {
    console.error(
      "[access-reveal] pin reveal mislukt",
      profileId,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, reason: "akiles_error" };
  }
}

export async function revealMagicLink(
  profileId: string,
): Promise<RevealResult<"link">> {
  const akiles = getAkilesClient();
  if (!akiles) return { ok: false, reason: "not_configured" };
  const cred = await loadCredentials(profileId);
  if (!cred?.akiles_member_id || !cred.akiles_magic_link_id) {
    return { ok: false, reason: "no_credentials" };
  }
  if (!accessIsOpen(cred.access_ends_at)) return { ok: false, reason: "no_access" };
  try {
    const { link } = await akiles.revealMagicLink(
      cred.akiles_member_id,
      cred.akiles_magic_link_id,
    );
    // Geen log, geen event, geen opslag: de waarde gaat direct terug.
    return { ok: true, link };
  } catch (err) {
    console.error(
      "[access-reveal] magic link reveal mislukt",
      profileId,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, reason: "akiles_error" };
  }
}
