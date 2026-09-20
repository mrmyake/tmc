import "server-only";
import { buildDeps } from "./sync";
import {
  issueDeviceTokenCore,
  revokeAllDeviceTokensCore,
  revokeDeviceTokenCore,
  type IssueDeviceTokenResult,
  type RevokeDeviceTokenResult,
} from "./device-tokens-core";
import type { DevicePlatform } from "./types";

/**
 * Wiring van de per-device member tokens op de echte service-role-client
 * en de Akiles-client (spec-akiles-access.md, E1). Een implementatie
 * (device-tokens-core.ts), twee ingangen:
 *
 *  - issueDeviceToken(profileId, ...): bij eerste app-open na login. Geeft
 *    de tokenwaarde EEN keer terug aan de aanroeper; die geeft hem aan de
 *    SDK en gooit hem weg. Nergens opgeslagen, nergens gelogd.
 *  - revokeDeviceToken(profileId, id, reason): bij logout en bij "verwijder
 *    dit toestel". Verwijdert bij Akiles; lukt dat niet, dan gaat de rij in
 *    de wachtrij die de nachtelijke sync herkanst.
 *
 * Autorisatie ligt bij de aanroeper: deze functies nemen een profileId aan
 * en controleren niet wie vraagt. De server actions geven alleen auth.uid()
 * door. Buiten productie geeft getAkilesClient() null en komt
 * not_configured terug, zonder DB-writes.
 *
 * Beide throwen nooit richting de aanroeper.
 */

export async function issueDeviceToken(
  profileId: string,
  input: { platform: DevicePlatform; deviceLabel?: string | null },
): Promise<IssueDeviceTokenResult> {
  try {
    return await issueDeviceTokenCore(await buildDeps(), { profileId, ...input });
  } catch (err) {
    console.error(
      "[access-device-tokens] issueDeviceToken threw",
      profileId,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, reason: "db_error" };
  }
}

/** Alle open tokens van het profiel, rij voor rij met wachtrij. Zie revokeAllDeviceTokensCore. */
export async function revokeAllDeviceTokens(
  profileId: string,
  reason: string,
): Promise<{ revoked: number; deferred: number }> {
  try {
    const result = await revokeAllDeviceTokensCore(await buildDeps(), { profileId, reason });
    return { revoked: result.revoked, deferred: result.deferred };
  } catch (err) {
    console.error(
      "[access-device-tokens] revokeAllDeviceTokens threw",
      profileId,
      err instanceof Error ? err.message : String(err),
    );
    return { revoked: 0, deferred: 0 };
  }
}

export async function revokeDeviceToken(
  profileId: string,
  id: string,
  reason: string,
): Promise<RevokeDeviceTokenResult> {
  try {
    return await revokeDeviceTokenCore(await buildDeps(), { profileId, id, reason });
  } catch (err) {
    console.error(
      "[access-device-tokens] revokeDeviceToken threw",
      profileId,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, reason: "not_found" };
  }
}
