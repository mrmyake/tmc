import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";
import {
  KIOSK_DEVICE_TOUCH_MS,
  KIOSK_SECRET_ENV,
  KIOSK_SESSION_COOKIE,
} from "./constants";
import {
  requireKioskActorCore,
  resolveDevice,
  type DeviceResolution,
  type GateOptions,
  type KioskActor,
  type KioskGateDeps,
  type StaffPinInfo,
} from "./gate-core";

export type { KioskActor, KioskFailReason } from "./gate-core";
export { asStaffGate, KIOSK_FAIL_COPY } from "./gate-core";

/**
 * Wiring van de kiosk-gate op echte cookies en de service-role-client
 * (check-in PR 2). Eén gate voor alle kiosk- en check-in-actions:
 * requireKioskActor() accepteert een ingelogde staff-sessie, of een geldig
 * apparaat-cookie plus een geldige kiosk-sessie waarvan pin_version nog
 * klopt. Geeft het echte staflid-id en het actor-type terug.
 *
 * extend: false voor alles wat niet door de gebruiker gestart is (het
 * renderen van pagina's, de 60-secondencontrole); die verlengen de sessie
 * niet. Server components kunnen sowieso geen cookie zetten, dus vanuit een
 * page of layout is extend: false verplicht.
 */

export function kioskSecret(): string | null {
  const value = process.env[KIOSK_SECRET_ENV];
  return value && value.length >= 32 ? value : null;
}

const lastTouched = new Map<string, number>();

async function readCookieValue(name: string): Promise<string | null> {
  const store = await cookies();
  return store.get(name)?.value ?? null;
}

export async function buildKioskGateDeps(options: { canWriteCookies: boolean }): Promise<KioskGateDeps> {
  const store = await cookies();
  const admin = createAdminClient();
  return {
    now: () => Date.now(),
    secret: kioskSecret(),
    staffLogin: () => requireTrainerOrAdmin(),
    readCookie: (name) => store.get(name)?.value ?? null,
    writeSessionCookie: (value) => {
      if (!options.canWriteCookies) return;
      if (value === null) {
        store.delete(KIOSK_SESSION_COOKIE);
        return;
      }
      store.set(KIOSK_SESSION_COOKIE, value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });
    },
    device: async (deviceId) => {
      const { data } = await admin
        .from("kiosk_devices")
        .select("id, revoked_at")
        .eq("id", deviceId)
        .maybeSingle();
      if (!data) return null;
      return { revoked: data.revoked_at !== null };
    },
    staff: async (profileId) => readStaffPinInfo(profileId),
    touchDevice: async (deviceId) => {
      const now = Date.now();
      const last = lastTouched.get(deviceId) ?? 0;
      if (now - last < KIOSK_DEVICE_TOUCH_MS) return;
      lastTouched.set(deviceId, now);
      await admin
        .from("kiosk_devices")
        .update({ last_seen_at: new Date(now).toISOString() })
        .eq("id", deviceId);
    },
  };
}

/** PIN-versie, actief, en of het profiel nog staf is (admin-rol of actieve trainers-rij). */
export async function readStaffPinInfo(profileId: string): Promise<StaffPinInfo | null> {
  const admin = createAdminClient();
  const [{ data: pin }, { data: profile }, { data: trainer }] = await Promise.all([
    admin.from("staff_pins").select("pin_version, is_active").eq("profile_id", profileId).maybeSingle(),
    admin.from("profiles").select("role").eq("id", profileId).maybeSingle(),
    admin.from("trainers").select("id").eq("profile_id", profileId).eq("is_active", true).maybeSingle(),
  ]);
  if (!pin || !profile) return null;
  const isAdmin = profile.role === "admin";
  return {
    pinVersion: pin.pin_version,
    pinActive: pin.is_active,
    isStaff: isAdmin || Boolean(trainer),
    actorType: isAdmin ? "admin" : "trainer",
  };
}

/**
 * De ene gate. Vanuit een server action mag extend true zijn (default);
 * vanuit een page of layout altijd { extend: false }.
 */
export async function requireKioskActor(options: GateOptions = {}): Promise<KioskActor> {
  const extend = options.extend ?? true;
  const deps = await buildKioskGateDeps({ canWriteCookies: extend });
  return requireKioskActorCore(deps, { extend });
}

/** Alleen het apparaat, voor het slotscherm en de namenlijst. */
export async function resolveKioskDevice(): Promise<DeviceResolution> {
  const deps = await buildKioskGateDeps({ canWriteCookies: false });
  return resolveDevice(deps);
}

/** Ruwe cookie-lezer voor de admin-koppelpagina (welk apparaat is dit). */
export async function currentDeviceCookie(): Promise<string | null> {
  return readCookieValue("tmc_kiosk_device");
}
