import type { EmitEventInput } from "@/lib/events/emit";
import { newSessionPayload, signToken } from "./session";
import { KIOSK_PIN_LENGTH } from "./constants";
import { resolveDevice, type KioskGateDeps, type StaffPinInfo } from "./gate-core";


/**
 * Ontgrendelen op het slotscherm (naam gekozen, PIN ingevoerd), zonder
 * next/headers en zonder database. Volgorde: apparaat, vorm van de PIN,
 * poging registreren (blokkade na vijf fouten per staflid per apparaat),
 * PIN verifiëren, teller wissen, sessie tekenen. De RPC's zelf zijn SQL
 * (migratie 20260927120000); hier de flow eromheen.
 */

export interface UnlockDeps extends Pick<
  KioskGateDeps,
  "now" | "secret" | "readCookie" | "writeSessionCookie" | "device" | "staff"
> {
  registerAttempt: (
    profileId: string,
    deviceId: string,
  ) => Promise<{ allowed: boolean; retry_after_seconds?: number; fail_count?: number } | null>;
  verifyPin: (profileId: string, pin: string) => Promise<{ ok: boolean; pin_version?: number } | null>;
  clearAttempts: (profileId: string, deviceId: string) => Promise<void>;
  emit: (input: EmitEventInput) => Promise<boolean>;
}

export type UnlockResult =
  | { ok: true; userId: string; actorType: "admin" | "trainer" }
  | {
      ok: false;
      reason: "not_configured" | "device_not_paired" | "device_revoked" | "invalid_pin" | "locked" | "db_error";
      message: string;
      retryAfterSeconds?: number;
    };

// COPY: confirm met Marlon
export const UNLOCK_COPY = {
  invalidPin: "Onjuiste pincode",
  locked: (minutes: number) =>
    `Te veel pogingen. Probeer het over ${minutes} ${minutes === 1 ? "minuut" : "minuten"} opnieuw.`,
  notPaired: "Dit apparaat is niet gekoppeld.",
  revoked: "De koppeling van dit apparaat is ingetrokken.",
  notConfigured: "De kiosk is niet ingesteld op deze omgeving.",
  dbError: "Er ging iets mis. Probeer het opnieuw.",
} as const;

const PIN_PATTERN = new RegExp(`^[0-9]{${KIOSK_PIN_LENGTH}}$`);

export async function unlockKioskCore(
  deps: UnlockDeps,
  input: { profileId: string; pin: string },
): Promise<UnlockResult> {
  const device = await resolveDevice(deps);
  if (!device.ok) {
    if (device.reason === "not_configured") return { ok: false, reason: "not_configured", message: UNLOCK_COPY.notConfigured };
    if (device.reason === "device_revoked") return { ok: false, reason: "device_revoked", message: UNLOCK_COPY.revoked };
    return { ok: false, reason: "device_not_paired", message: UNLOCK_COPY.notPaired };
  }

  // Vorm eerst: een onmogelijke PIN kost geen poging en geen bcrypt.
  if (!PIN_PATTERN.test(input.pin) || !input.profileId) {
    return { ok: false, reason: "invalid_pin", message: UNLOCK_COPY.invalidPin };
  }

  const attempt = await deps.registerAttempt(input.profileId, device.deviceId);
  if (!attempt) {
    // Fail closed: zonder werkende teller geen verify.
    return { ok: false, reason: "db_error", message: UNLOCK_COPY.dbError };
  }
  if (!attempt.allowed) {
    const seconds = attempt.retry_after_seconds ?? 900;
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return { ok: false, reason: "locked", message: UNLOCK_COPY.locked(minutes), retryAfterSeconds: seconds };
  }

  const verified = await deps.verifyPin(input.profileId, input.pin);
  if (!verified) return { ok: false, reason: "db_error", message: UNLOCK_COPY.dbError };
  if (!verified.ok || typeof verified.pin_version !== "number") {
    await deps.emit({
      type: "kiosk.unlock_failed",
      actorType: "system",
      actorId: null,
      subjectType: "kiosk_device",
      subjectId: device.deviceId,
      payload: { profile_id: input.profileId, device_id: device.deviceId, fail_count: attempt.fail_count ?? null },
    });
    return { ok: false, reason: "invalid_pin", message: UNLOCK_COPY.invalidPin };
  }

  const staff: StaffPinInfo | null = await deps.staff(input.profileId);
  if (!staff || !staff.isStaff || !staff.pinActive) {
    return { ok: false, reason: "invalid_pin", message: UNLOCK_COPY.invalidPin };
  }

  await deps.clearAttempts(input.profileId, device.deviceId);

  const now = deps.now();
  const payload = newSessionPayload(
    { staffProfileId: input.profileId, pinVersion: verified.pin_version, deviceId: device.deviceId },
    now,
  );
  deps.writeSessionCookie(signToken<"session">(payload, deps.secret as string));

  await deps.emit({
    type: "kiosk.unlocked",
    actorType: staff.actorType,
    actorId: input.profileId,
    subjectType: "kiosk_device",
    subjectId: device.deviceId,
    payload: { device_id: device.deviceId, pin_version: verified.pin_version },
  });

  return { ok: true, userId: input.profileId, actorType: staff.actorType };
}
