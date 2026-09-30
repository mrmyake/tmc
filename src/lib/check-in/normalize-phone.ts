/**
 * Telefoon-normalisatie naar E.164 voor de tablet en het signup-form. De
 * regels staan op een plek, parsePhone in src/lib/phone-parse.ts (ook
 * gebruikt door /abonnement, /kopen en de profielpagina); deze wrapper houdt
 * alleen het gooi-contract (InvalidPhoneError) voor de bestaande
 * kiosk-aanroepers.
 */

import { parsePhone } from "../phone-parse";

export class InvalidPhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPhoneError";
  }
}

/**
 * Accepted input formats (default land NL, buitenland met + of 00):
 *   06-12345678, 06 12345678, 0612345678       -> +31612345678
 *   +31 6 12345678, +31 (0)6 12345678          -> +31612345678
 *   0031612345678                               -> +31612345678
 *   +44 7911 123456                             -> +447911123456
 *
 * Throws InvalidPhoneError op alles wat geen geldig nummer is. Caller vangt
 * en toont inline validation error.
 */
export function normalizePhone(raw: string): string {
  const r = parsePhone(raw);
  if (r.ok) return r.e164;
  throw new InvalidPhoneError(
    r.reason === "empty" ? "Nummer is leeg." : "Ongeldig telefoonnummer.",
  );
}

/**
 * True als input eruitziet als een identifier. Tablet routeert op basis
 * van lengte/format: 10-cijfer = phone (na normalisatie), 6-cijfer =
 * member_code. Deze helper is puur format-check, niet DB-lookup.
 */
export function classifyIdentifier(
  raw: string,
): { kind: "phone"; value: string } | { kind: "member_code"; value: string } | null {
  const digits = raw.replace(/[^0-9+]/g, "");
  if (digits.length === 6 && /^[0-9]{6}$/.test(digits)) {
    return { kind: "member_code", value: digits };
  }
  try {
    const phone = normalizePhone(raw);
    return { kind: "phone", value: phone };
  } catch {
    return null;
  }
}
