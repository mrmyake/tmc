/**
 * Pure helpers voor de post-login landing, zonder Supabase-import, zodat ook
 * een client component (de implicit-fallback op /auth/callback/implicit) ze
 * kan gebruiken. De rolbepaling zelf staat in role-landing.ts (server-only).
 */
export const MEMBER_LANDING = "/app";
export const TRAINER_LANDING = "/app/trainer/agenda";
export const ADMIN_LANDING = "/app/admin";

/**
 * Alleen interne paden accepteren voor `next` (voorkom open-redirect):
 * moet met "/" beginnen en mag niet met "//" beginnen (protocol-relatieve
 * URL). De bare ledenlanding telt als "geen next": wie daarmee binnenkomt
 * krijgt de rol-default, zodat een niet-lid met next=/app niet op de
 * ledenlanding strandt.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next === MEMBER_LANDING ? null : next;
}
