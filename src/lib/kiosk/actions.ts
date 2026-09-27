"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { KIOSK_SESSION_COOKIE } from "./constants";
import { buildKioskGateDeps, requireKioskActor, resolveKioskDevice } from "./gate";
import { sessionPayloadFromCookie, type KioskFailReason } from "./gate-core";
import { unlockKioskCore, type UnlockResult } from "./unlock-core";

export type { UnlockResult } from "./unlock-core";

export interface KioskStaffOption {
  profileId: string;
  name: string;
}

/**
 * Namen voor het slotscherm: staf met een actieve PIN. Alleen bereikbaar
 * met een geldig apparaat-cookie of een staff-login; zonder die twee is er
 * niets te ontgrendelen en dus ook geen lijst.
 */
export async function listKioskStaff(): Promise<KioskStaffOption[]> {
  const device = await resolveKioskDevice();
  if (!device.ok) {
    const actor = await requireKioskActor({ extend: false });
    if (!actor.ok) return [];
  }
  const admin = createAdminClient();
  const { data: pins } = await admin.from("staff_pins").select("profile_id").eq("is_active", true);
  const ids = (pins ?? []).map((p) => p.profile_id as string);
  if (ids.length === 0) return [];
  const [{ data: profiles }, { data: trainers }] = await Promise.all([
    admin.from("profiles").select("id, first_name, role").in("id", ids),
    admin.from("trainers").select("profile_id, display_name, is_active").in("profile_id", ids),
  ]);
  const trainerName = new Map<string, string>();
  for (const t of trainers ?? []) {
    if (t.is_active) trainerName.set(t.profile_id as string, t.display_name as string);
  }
  return (profiles ?? [])
    .filter((p) => p.role === "admin" || trainerName.has(p.id as string))
    .map((p) => ({
      profileId: p.id as string,
      name: trainerName.get(p.id as string) ?? (p.first_name as string) ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

/** Naam gekozen, PIN ingevoerd. Zet bij succes het sessie-cookie. */
export async function unlockKiosk(input: { profileId: string; pin: string }): Promise<UnlockResult> {
  const deps = await buildKioskGateDeps({ canWriteCookies: true });
  const admin = createAdminClient();
  return unlockKioskCore(
    {
      ...deps,
      registerAttempt: async (profileId, deviceId) => {
        const { data, error } = await admin.rpc("register_kiosk_pin_attempt", {
          p_profile_id: profileId,
          p_device_id: deviceId,
        });
        if (error) {
          console.error("[unlockKiosk] register_kiosk_pin_attempt", error);
          return null;
        }
        return data as { allowed: boolean; retry_after_seconds?: number; fail_count?: number };
      },
      verifyPin: async (profileId, pin) => {
        const { data, error } = await admin.rpc("verify_staff_pin", {
          p_profile_id: profileId,
          p_pin: pin,
        });
        if (error) {
          console.error("[unlockKiosk] verify_staff_pin", error);
          return null;
        }
        return data as { ok: boolean; pin_version?: number };
      },
      clearAttempts: async (profileId, deviceId) => {
        const { error } = await admin
          .from("kiosk_pin_attempts")
          .delete()
          .eq("profile_id", profileId)
          .eq("device_id", deviceId);
        if (error) console.error("[unlockKiosk] teller-reset", error);
      },
      emit: emitEvent,
    },
    { profileId: String(input.profileId ?? ""), pin: String(input.pin ?? "") },
  );
}

/** Vergrendelen: cookie weg, event als er een sessie was. */
export async function lockKiosk(): Promise<{ ok: true }> {
  const store = await cookies();
  const deps = await buildKioskGateDeps({ canWriteCookies: false });
  const session = sessionPayloadFromCookie(deps);
  store.delete(KIOSK_SESSION_COOKIE);
  if (session) {
    const staff = await deps.staff(session.staff_profile_id);
    await emitEvent({
      type: "kiosk.locked",
      actorType: staff?.actorType ?? "system",
      actorId: staff ? session.staff_profile_id : null,
      subjectType: "kiosk_device",
      subjectId: session.device_id,
      payload: { device_id: session.device_id, source: "manual_or_idle" },
    });
  }
  return { ok: true };
}

/**
 * Achtergrondcontrole (elke 60 s): verlengt NIET. Alleen het antwoord of de
 * sessie nog geldig is, zodat de tablet zichzelf op slot kan zetten.
 */
export async function peekKioskSession(): Promise<{ ok: true } | { ok: false; reason: KioskFailReason }> {
  const actor = await requireKioskActor({ extend: false });
  return actor.ok ? { ok: true } : { ok: false, reason: actor.reason };
}

/** Door de gebruiker gestart (navigeren, tikken): verlengt de sessie. */
export async function touchKioskSession(): Promise<{ ok: boolean }> {
  const actor = await requireKioskActor({ extend: true });
  return { ok: actor.ok };
}
