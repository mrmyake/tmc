import type { AttributionParams } from "@/lib/attribution/params";

/**
 * Pure helpers voor de intake-mail aan Marlon (geen server-only, geen
 * netwerk): ontvanger, onderwerp, tijdstip en bronregels. De verzending zelf
 * staat in notify.ts.
 */

export const PROGRAMMA_INTAKE_RECIPIENT = "marlon@themovementclub.nl";

export interface RecipientDecision {
  /** Het adres waar de mail heen gaat, of null als hij overgeslagen wordt. */
  to: string | null;
  /** True als de mail buiten productie is omgeleid. */
  redirected: boolean;
}

/**
 * Productie (VERCEL_ENV === "production") gaat naar Marlon. Overal elders
 * (preview, lokaal) gaat de mail uitsluitend naar PROGRAMMA_INTAKE_REDIRECT_EMAIL;
 * ontbreekt die, dan geen mail, zodat een testaanvraag nooit Marlons inbox
 * bereikt. Zelfde patroon als LAST_MINUTE_ALERT_REDIRECT_EMAIL.
 */
export function decideRecipient(env: {
  vercelEnv: string | undefined;
  redirectEmail: string | undefined;
}): RecipientDecision {
  if (env.vercelEnv === "production") {
    return { to: PROGRAMMA_INTAKE_RECIPIENT, redirected: false };
  }
  const redirect = (env.redirectEmail ?? "").trim();
  if (!redirect || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(redirect)) {
    return { to: null, redirected: true };
  }
  return { to: redirect, redirected: true };
}

export function buildSubject(firstName: string, lastName: string, redirected: boolean): string {
  // COPY: confirm met Marlon
  const base = `Nieuwe intake-aanvraag 12 weken: ${firstName} ${lastName}`.trim();
  return redirected ? `[TEST] ${base}` : base;
}

/** "zondag 15 november 2026 om 14:32", altijd Europe/Amsterdam. */
export function formatSubmittedAt(date: Date): string {
  const day = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} om ${time}`;
}

/**
 * Leesbare bronregels uit de attributie; leeg zonder enige parameter.
 * Alleen paden, geen volledige URL's (linkregel van de mail).
 */
export function buildSourceLines(params: AttributionParams | null | undefined): string[] {
  if (!params) return [];
  const lines: string[] = [];
  const utm = [params.utm_source, params.utm_medium, params.utm_campaign].filter(Boolean);
  // COPY: confirm met Marlon
  if (utm.length > 0) lines.push(`Campagne: ${utm.join(" / ")}`);
  // COPY: confirm met Marlon
  if (params.utm_term) lines.push(`Zoekterm: ${params.utm_term}`);
  // COPY: confirm met Marlon
  if (params.utm_content) lines.push(`Advertentie: ${params.utm_content}`);
  const clickId = params.gclid ?? params.gbraid ?? params.wbraid;
  // COPY: confirm met Marlon
  if (clickId) lines.push(`Google Ads klik-id: ${clickId}`);
  // COPY: confirm met Marlon
  if (params.fbclid) lines.push(`Meta klik-id: ${params.fbclid}`);
  // COPY: confirm met Marlon
  if (params.landing_path) lines.push(`Landingspad: ${params.landing_path}`);
  return lines;
}
