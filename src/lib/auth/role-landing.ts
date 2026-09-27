import type { createClient } from "@/lib/supabase/server";

/** De cookie-aware SSR-client uit lib/supabase/server.ts (leest onder RLS). */
type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Post-login landing per rol, op één plek. Tot fix/trainer-invite-landing
 * leefde deze mapping gedupliceerd in verifyLoginOtp (lib/actions/auth.ts)
 * en in /auth/callback, en /login had helemaal geen rolbepaling voor een
 * al ingelogde bezoeker. Alle inlogpaden (OTP, PKCE-callback, invite via
 * /auth/confirm, implicit-fallback, /login met sessie) komen nu hier uit.
 *
 * Mapping (spec §2, PT-agenda PR D):
 * - admin MET actieve eigen trainers-rij (bv. Marlon): /app/trainer/agenda
 *   met trainer-kiezer
 * - admin zonder: /app/admin
 * - trainer: /app/trainer/agenda (page-level requireTrainerOrAdmin vangt
 *   een inactieve trainer op, geen losse is_active-check hier)
 * - anders: /app (ledenlanding sinds de landing-flip van 2026-07-12)
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

/**
 * Landing op basis van de profielrol. Leest met de meegegeven client, dus
 * onder RLS als de ingelogde gebruiker (profiles_self_read en de eigen
 * trainers-rij zijn leesbaar). Zonder profiel valt het terug op de
 * ledenlanding.
 */
export async function resolveRoleLanding(
  supabase: ServerClient,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = profile?.role as string | null | undefined;

  if (role === "admin") {
    const { data: trainerRow } = await supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    return trainerRow ? TRAINER_LANDING : ADMIN_LANDING;
  }
  if (role === "trainer") return TRAINER_LANDING;
  return MEMBER_LANDING;
}

/**
 * Een expliciete, veilige `next` wint; anders de rol-default.
 */
export async function postLoginTarget(
  supabase: ServerClient,
  userId: string,
  next: string | null | undefined,
): Promise<string> {
  return safeNextPath(next) ?? (await resolveRoleLanding(supabase, userId));
}
