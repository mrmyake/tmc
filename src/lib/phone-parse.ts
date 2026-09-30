import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * Validatie en normalisatie van telefoonnummers naar E.164, voor opslag in
 * profiles.phone (CHECK profiles_phone_e164: ^\+[1-9][0-9]{7,14}$).
 *
 * Bewust een eigen module, los van src/lib/phone.ts: die wordt door de
 * marketingpagina's (Footer, ContactContent) geimporteerd voor tel:-links,
 * en libphonenumber-js/min (ca. 29 KB gzip) hoort niet in die bundels.
 * Importeer deze module alleen waar echt gevalideerd wordt: IdentifyStage,
 * ProfileForm, de profiel-server-actions en de kiosk-helper.
 */

export type ParsePhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: "empty" | "invalid" };

/**
 * Accepteert elk geldig nummer (isValid, geen mobiel-eis). Nummers zonder
 * landcode worden als Nederlands gelezen: 06 12345678, 0031 6 12345678 en
 * +31 (0)6 12345678 geven allemaal +31612345678. Een buitenlands nummer
 * moet met + of 00 en landcode.
 */
export function parsePhone(raw: string): ParsePhoneResult {
  const s = raw.trim();
  if (!s) return { ok: false, reason: "empty" };
  const p = parsePhoneNumberFromString(s, "NL");
  // Een toevoeging (ext.) zou stilzwijgend wegvallen: liever afwijzen.
  if (!p || !p.isValid() || p.ext) return { ok: false, reason: "invalid" };
  return { ok: true, e164: p.number };
}
