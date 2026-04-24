/**
 * NL-mobiel normalisatie naar E.164 (+31...). Accepteert gangbare input-
 * varianten van de tablet en het signup-form, gooit op zichtbaar fout
 * input. Houdt bewust smal — geen volledige libphonenumber, we
 * ondersteunen alleen NL-mobiel (begint met 6 na landcode) en drop-in-
 * friendly format-tolerantie (spaties, streepjes, leading zero).
 */

const E164_NL_MOBILE = /^\+31[0-9]{9}$/;

export class InvalidPhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPhoneError";
  }
}

/**
 * Accepted input formats:
 *   06-12345678, 06 12345678, 0612345678      → +31612345678
 *   +31 6 12345678, +316 12 34 56 78           → +31612345678
 *   +31612345678                                → +31612345678
 *
 * Throws InvalidPhoneError op alles anders (vaste lijn, buitenlands,
 * onvolledig). Caller vangt en toont inline validation error.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.replace(/[\s\-().]/g, "").trim();
  if (!trimmed) {
    throw new InvalidPhoneError("Nummer is leeg.");
  }

  let normalized: string;
  if (trimmed.startsWith("+31")) {
    normalized = trimmed;
  } else if (trimmed.startsWith("0031")) {
    normalized = "+31" + trimmed.slice(4);
  } else if (trimmed.startsWith("06")) {
    normalized = "+316" + trimmed.slice(2);
  } else if (trimmed.startsWith("6") && trimmed.length === 9) {
    // iemand die alleen "612345678" typt
    normalized = "+31" + trimmed;
  } else {
    throw new InvalidPhoneError("Ongeldig NL-mobiel nummer.");
  }

  if (!E164_NL_MOBILE.test(normalized)) {
    throw new InvalidPhoneError("Voer een geldig NL-mobiel nummer in.");
  }
  return normalized;
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
