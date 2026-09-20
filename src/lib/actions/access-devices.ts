"use server";

import { createClient } from "@/lib/supabase/server";
import { issueDeviceToken, revokeDeviceToken } from "@/lib/access/device-tokens";
import type { DevicePlatform, DeviceTokenRow } from "@/lib/access/types";

/**
 * Server actions voor per-device Akiles member tokens (E1,
 * spec-akiles-access.md). Alle drie geven uitsluitend auth.uid() door;
 * platform en label komen van de client maar bepalen nooit wiens token het
 * is. De tokenwaarde uit issueMyAccessDeviceToken gaat een keer terug naar
 * de aanroeper en wordt hier niet gelogd of opgeslagen. De aanroepers
 * (Capacitor-plugin en ledenscherm) komen in E2 en E3.
 */

export type IssueMyDeviceTokenResult =
  | { ok: true; id: string; token: string }
  | { ok: false; error: string };

export type MyAccessDevice = Pick<
  DeviceTokenRow,
  "id" | "platform" | "device_label" | "issued_at" | "last_seen_at" | "revoked_at"
>;

function isPlatform(value: unknown): value is DevicePlatform {
  return value === "ios" || value === "android";
}

export async function issueMyAccessDeviceToken(
  platform: DevicePlatform,
  deviceLabel?: string | null,
): Promise<IssueMyDeviceTokenResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Je bent niet ingelogd." };
  }
  if (!isPlatform(platform)) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Deurtoegang via de app werkt alleen in de iOS- of Android-app." };
  }

  const result = await issueDeviceToken(user.id, { platform, deviceLabel });
  if (result.ok) return { ok: true, id: result.row.id, token: result.token };

  switch (result.reason) {
    case "no_credentials":
      // COPY: confirm met Marlon
      return { ok: false, error: "Er is nog geen deurtoegang voor je aangemaakt. Dat gebeurt automatisch zodra je abonnement actief is; duurt het langer dan een dag, laat het ons weten." };
    case "no_access":
      // COPY: confirm met Marlon
      return { ok: false, error: "Je deurtoegang is op dit moment niet actief." };
    case "not_configured":
      // COPY: confirm met Marlon
      return { ok: false, error: "Deurtoegang via de app is tijdelijk niet beschikbaar. Je deurcode werkt gewoon." };
    case "akiles_error":
    case "db_error":
    default:
      // COPY: confirm met Marlon
      return { ok: false, error: "Koppelen lukte niet. Probeer het zo nog eens." };
  }
}

export async function revokeMyAccessDeviceToken(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Je bent niet ingelogd." };
  }

  const result = await revokeDeviceToken(user.id, id, "member_removed_device");
  if (result.ok) return { ok: true };
  switch (result.reason) {
    case "not_found":
      // COPY: confirm met Marlon
      return { ok: false, error: "Dit toestel is niet (meer) gekoppeld." };
    case "not_configured":
    default:
      // COPY: confirm met Marlon
      return { ok: false, error: "Ontkoppelen is tijdelijk niet mogelijk. Probeer het later opnieuw." };
  }
}

/**
 * Eigen toestellen, voor het ledenscherm (E3). Leest via de user-scoped
 * client: de self-read-policy op tmc.access_device_tokens beperkt tot
 * profile_id = auth.uid(). Geen Akiles-ids in het antwoord.
 */
export async function listMyAccessDevices(): Promise<MyAccessDevice[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("access_device_tokens")
    .select("id, platform, device_label, issued_at, last_seen_at, revoked_at")
    .eq("profile_id", user.id)
    .is("revoked_at", null)
    .order("issued_at", { ascending: false });
  if (error) {
    console.error("[listMyAccessDevices] lezen mislukt", error.message);
    return [];
  }
  return (data ?? []) as MyAccessDevice[];
}
