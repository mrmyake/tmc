import {
  sessionFreshness,
  signToken,
  touchSession,
  verifyToken,
  type SessionPayload,
} from "./session";
import { KIOSK_DEVICE_COOKIE, KIOSK_SESSION_COOKIE } from "./constants";

/**
 * Beslislogica van de kiosk-gate (check-in PR 2), zonder next/headers en
 * zonder database: alles via KioskGateDeps, zodat scripts/kiosk/gate.test.mts
 * elke combinatie doorloopt. De wiring op echte cookies en de service-role-
 * client staat in gate.ts.
 *
 * Volgorde: eerst een echte staff-login (telefoon van de trainer, geen PIN),
 * anders apparaat-cookie plus kiosk-sessie. Alleen een door de gebruiker
 * gestarte actie verlengt de sessie (extend: true); achtergrondverversing
 * en het renderen van pagina's gebruiken extend: false en laten het cookie
 * met rust, zodat een tablet die alleen ververst na tien minuten op slot
 * gaat.
 */

export type StaffLoginResult =
  | { ok: true; userId: string; actorType: "admin" | "trainer" }
  | { ok: false; reason: "unauthenticated" | "forbidden"; message: string };

export interface StaffPinInfo {
  pinVersion: number;
  pinActive: boolean;
  /** Admin-rol of actieve trainers-rij; anders geen staf meer. */
  isStaff: boolean;
  actorType: "admin" | "trainer";
}

export interface KioskGateDeps {
  now: () => number;
  secret: string | null;
  staffLogin: () => Promise<StaffLoginResult>;
  readCookie: (name: string) => string | null;
  /** null verwijdert het cookie. */
  writeSessionCookie: (value: string | null) => void;
  device: (deviceId: string) => Promise<{ revoked: boolean } | null>;
  staff: (profileId: string) => Promise<StaffPinInfo | null>;
  /** Mag zelf throttlen; wordt bij elke geslaagde kiosk-gate aangeroepen. */
  touchDevice: (deviceId: string) => Promise<void>;
}

export type KioskFailReason =
  | "unauthenticated"
  | "forbidden"
  | "not_configured"
  | "device_not_paired"
  | "device_revoked"
  | "session_expired"
  | "pin_changed";

export type KioskActor =
  | {
      ok: true;
      userId: string;
      actorType: "admin" | "trainer";
      via: "login" | "kiosk";
      deviceId: string | null;
    }
  | { ok: false; reason: KioskFailReason; message: string };

// COPY: confirm met Marlon
export const KIOSK_FAIL_COPY: Record<KioskFailReason, string> = {
  unauthenticated: "Je bent uitgelogd.",
  forbidden: "Geen toegang.",
  not_configured: "De kiosk is niet ingesteld op deze omgeving.",
  device_not_paired: "Dit apparaat is niet gekoppeld.",
  device_revoked: "De koppeling van dit apparaat is ingetrokken.",
  session_expired: "Vergrendeld. Ontgrendel met je pincode.",
  pin_changed: "Je pincode is gewijzigd. Ontgrendel opnieuw.",
};

function fail(reason: KioskFailReason): KioskActor {
  return { ok: false, reason, message: KIOSK_FAIL_COPY[reason] };
}

export type DeviceResolution =
  | { ok: true; deviceId: string }
  | { ok: false; reason: "not_configured" | "device_not_paired" | "device_revoked" };

export type DeviceDeps = Pick<KioskGateDeps, "secret" | "readCookie" | "device">;

/** Alleen het apparaat: voor het slotscherm en de namenlijst (nog geen sessie). */
export async function resolveDevice(deps: DeviceDeps): Promise<DeviceResolution> {
  if (!deps.secret) return { ok: false, reason: "not_configured" };
  const payload = verifyToken("device", deps.readCookie(KIOSK_DEVICE_COOKIE), deps.secret);
  if (!payload) return { ok: false, reason: "device_not_paired" };
  const row = await deps.device(payload.device_id);
  if (!row) return { ok: false, reason: "device_not_paired" };
  if (row.revoked) return { ok: false, reason: "device_revoked" };
  return { ok: true, deviceId: payload.device_id };
}

export interface GateOptions {
  /** true: door de gebruiker gestart, cookie krijgt last = now. Default true. */
  extend?: boolean;
}

export async function requireKioskActorCore(
  deps: KioskGateDeps,
  options: GateOptions = {},
): Promise<KioskActor> {
  const extend = options.extend ?? true;

  const login = await deps.staffLogin();
  if (login.ok) {
    return { ok: true, userId: login.userId, actorType: login.actorType, via: "login", deviceId: null };
  }

  const device = await resolveDevice(deps);
  if (!device.ok) return fail(device.reason);

  const session = verifyToken("session", deps.readCookie(KIOSK_SESSION_COOKIE), deps.secret);
  if (!session) return fail("session_expired");
  if (session.device_id !== device.deviceId) {
    deps.writeSessionCookie(null);
    return fail("session_expired");
  }
  const now = deps.now();
  if (sessionFreshness(session, now) !== "ok") {
    deps.writeSessionCookie(null);
    return fail("session_expired");
  }

  const staff = await deps.staff(session.staff_profile_id);
  if (!staff || !staff.isStaff || !staff.pinActive || staff.pinVersion !== session.pin_version) {
    deps.writeSessionCookie(null);
    return fail("pin_changed");
  }

  if (extend) {
    deps.writeSessionCookie(signToken<"session">(touchSession(session, now), deps.secret as string));
  }
  await deps.touchDevice(device.deviceId);

  return {
    ok: true,
    userId: session.staff_profile_id,
    actorType: staff.actorType,
    via: "kiosk",
    deviceId: device.deviceId,
  };
}

/** Voor de check-in-kernen, die de vorm van requireTrainerOrAdmin() verwachten. */
export function asStaffGate(actor: KioskActor): StaffLoginResult {
  if (actor.ok) return { ok: true, userId: actor.userId, actorType: actor.actorType };
  return {
    ok: false,
    reason: actor.reason === "forbidden" ? "forbidden" : "unauthenticated",
    message: actor.message,
  };
}

/** Kleine helper voor de tests en het slotscherm: hoe lang is de sessie nog geldig. */
export function sessionPayloadFromCookie(
  deps: Pick<KioskGateDeps, "readCookie" | "secret">,
): SessionPayload | null {
  return verifyToken("session", deps.readCookie(KIOSK_SESSION_COOKIE), deps.secret);
}
