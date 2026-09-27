import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { KIOSK_ABSOLUTE_MS, KIOSK_IDLE_MS } from "./constants";

/**
 * Tekenen en verifiëren van de twee kiosk-cookies (check-in PR 2). Puur:
 * geen next/headers, geen database, tijd en secret worden meegegeven, zodat
 * scripts/kiosk/session.test.mts dit zonder omgeving doorloopt.
 *
 * Vorm: base64url(json).base64url(hmac-sha256(kind + "." + base64url(json))).
 * De kind-prefix in de HMAC-input zorgt dat een apparaat-token nooit als
 * sessie gelezen kan worden of andersom, ook al delen ze het secret.
 */

export type TokenKind = "device" | "session";

export interface DevicePayload {
  v: 1;
  kind: "device";
  device_id: string;
  /** ms sinds epoch */
  iat: number;
}

export interface SessionPayload {
  v: 1;
  kind: "session";
  sid: string;
  staff_profile_id: string;
  pin_version: number;
  device_id: string;
  /** ms sinds epoch: uitgifte */
  iat: number;
  /** ms sinds epoch: laatste door de gebruiker gestarte actie */
  last: number;
}

type PayloadFor<K extends TokenKind> = K extends "device" ? DevicePayload : SessionPayload;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function mac(kind: TokenKind, body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${kind}.${body}`).digest();
}

export function signToken<K extends TokenKind>(payload: PayloadFor<K>, secret: string): string {
  if (!secret) throw new Error("kiosk: secret ontbreekt");
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(mac(payload.kind, body, secret))}`;
}

/**
 * null bij elke afwijking: verkeerde vorm, verkeerde handtekening, verkeerd
 * kind, geen secret. Constant-time vergelijking van de handtekening.
 */
export function verifyToken<K extends TokenKind>(
  kind: K,
  token: string | null | undefined,
  secret: string | null | undefined,
): PayloadFor<K> | null {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  const expected = mac(kind, body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p.v !== 1 || p.kind !== kind) return null;
  if (kind === "device") {
    if (typeof p.device_id !== "string" || typeof p.iat !== "number") return null;
  } else {
    if (
      typeof p.sid !== "string" ||
      typeof p.staff_profile_id !== "string" ||
      typeof p.pin_version !== "number" ||
      typeof p.device_id !== "string" ||
      typeof p.iat !== "number" ||
      typeof p.last !== "number"
    ) {
      return null;
    }
  }
  return payload as PayloadFor<K>;
}

export function newDevicePayload(deviceId: string, now: number): DevicePayload {
  return { v: 1, kind: "device", device_id: deviceId, iat: now };
}

export function newSessionPayload(
  input: { staffProfileId: string; pinVersion: number; deviceId: string },
  now: number,
): SessionPayload {
  return {
    v: 1,
    kind: "session",
    sid: randomUUID(),
    staff_profile_id: input.staffProfileId,
    pin_version: input.pinVersion,
    device_id: input.deviceId,
    iat: now,
    last: now,
  };
}

export type SessionFreshness = "ok" | "idle_expired" | "absolute_expired";

/** Verlopen op inactiviteit (last) of op de absolute bovengrens (iat). */
export function sessionFreshness(p: SessionPayload, now: number): SessionFreshness {
  if (now - p.iat > KIOSK_ABSOLUTE_MS || now < p.iat) return "absolute_expired";
  if (now - p.last > KIOSK_IDLE_MS || now < p.last) return "idle_expired";
  return "ok";
}

/** Vers exemplaar met last = now; iat en sid blijven. */
export function touchSession(p: SessionPayload, now: number): SessionPayload {
  return { ...p, last: now };
}
