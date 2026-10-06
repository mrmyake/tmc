/**
 * Gedeelde constanten voor de admin-pagina Aanmeldingen. Geen
 * "server-only": de toolbar en de chips zijn client-componenten; de
 * MailerLite-aanroepen zelf staan in src/lib/admin/email-signups-query.ts.
 */

export const SIGNUP_STATUSES = [
  "active",
  "unsubscribed",
  "unconfirmed",
  "bounced",
  "junk",
] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export function isSignupStatus(value: unknown): value is SignupStatus {
  return typeof value === "string" && (SIGNUP_STATUSES as readonly string[]).includes(value);
}

// COPY: confirm met Marlon
export const SIGNUP_STATUS_LABEL: Record<SignupStatus, string> = {
  active: "Actief",
  unsubscribed: "Afgemeld",
  unconfirmed: "Onbevestigd",
  bounced: "Bounced",
  junk: "Junk",
};

/** Standaard verborgen; de toggle "Toon afgemeld" laat ze zien. */
export const HIDDEN_STATUSES: readonly SignupStatus[] = ["unsubscribed", "bounced", "junk"];

export interface SignupSource {
  key: string;
  label: string;
}
