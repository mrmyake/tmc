/**
 * Kern van de POST op /welkom/[token] (scherm 8 naar ingelogd): het
 * inlogtoken verbruiken, server-side een verse Supabase-magiclink maken,
 * die direct verifiëren en de sessie zetten. Geen netwerk hier; de action
 * levert de afhankelijkheden, scripts/checkout/welcome-login-core.test.mts
 * bewijst de volgorde en de foutpaden.
 *
 * Volgorde is bewust: consume eerst (eenmalig, atomisch in de RPC), daarna
 * pas de magiclink. Faalt iets ná consume, dan is het token op en valt de
 * bezoeker terug op scherm 9 (inlogcode per mail); dat is veiliger dan een
 * token dat na een halve login nog werkt.
 */

export type ConsumeReason = "not_found" | "used" | "expired" | "not_converted";

export interface WelcomeLoginDeps {
  consume(loginToken: string): Promise<
    { ok: true; profileId: string; email: string | null } | { ok: false; reason: ConsumeReason }
  >;
  /** admin.generateLink({ type: "magiclink" }); geeft hashed_token en type. */
  generateMagicLink(email: string): Promise<{ tokenHash: string; type: "magiclink" } | null>;
  /** verifyOtp met token_hash op een bare client (Sb-Forwarded-For). */
  verify(args: { tokenHash: string; type: "magiclink" }): Promise<
    { ok: true; accessToken: string; refreshToken: string; userId: string } | { ok: false }
  >;
  /** Zet de sessie in de cookies (SSR-client). */
  setSession(args: { accessToken: string; refreshToken: string }): Promise<boolean>;
  /** Landing per rol, zelfde helper als /login en /auth/confirm. */
  landing(userId: string): Promise<string>;
}

export type WelcomeLoginResult =
  | { ok: true; redirectTo: string }
  | { ok: false; reason: ConsumeReason | "login_failed"; email: string | null };

const TOKEN_RE = /^[0-9a-f]{64}$/;

export function isValidLoginToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export async function welcomeLoginCore(
  deps: WelcomeLoginDeps,
  loginToken: string,
): Promise<WelcomeLoginResult> {
  if (!isValidLoginToken(loginToken)) return { ok: false, reason: "not_found", email: null };

  const consumed = await deps.consume(loginToken);
  if (!consumed.ok) return { ok: false, reason: consumed.reason, email: null };
  if (!consumed.email) return { ok: false, reason: "login_failed", email: null };

  const link = await deps.generateMagicLink(consumed.email);
  if (!link) return { ok: false, reason: "login_failed", email: consumed.email };

  const verified = await deps.verify({ tokenHash: link.tokenHash, type: link.type });
  if (!verified.ok || verified.userId !== consumed.profileId) {
    return { ok: false, reason: "login_failed", email: consumed.email };
  }

  const set = await deps.setSession({
    accessToken: verified.accessToken,
    refreshToken: verified.refreshToken,
  });
  if (!set) return { ok: false, reason: "login_failed", email: consumed.email };

  return { ok: true, redirectTo: await deps.landing(consumed.profileId) };
}
