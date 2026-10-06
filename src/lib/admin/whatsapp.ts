import "server-only";
import { parsePhone } from "@/lib/phone-parse";

/**
 * WhatsApp-link voor een vrij ingevoerd telefoonnummer (proefboekingen en
 * terugbelaanvragen in de admin-cockpit). Zelfde parser als de profielen
 * (parsePhone, default land NL), dus 06 12345678, +31 6 12345678 en
 * 0031 6 12345678 geven dezelfde link en een Belgisch nummer houdt +32.
 * Ongeldig of leeg: null, de knop wordt dan niet gerenderd en het nummer
 * blijft wel als tekst zichtbaar.
 *
 * server-only omdat libphonenumber-js (ca. 29 KB gzip) niet in de
 * clientbundel van de admin hoort; de href wordt in de queries berekend.
 */
export function toWhatsAppHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parsePhone(raw);
  if (!parsed.ok) return null;
  // wa.me verwacht het nummer in E.164 zonder de plus.
  return `https://wa.me/${parsed.e164.slice(1)}`;
}
