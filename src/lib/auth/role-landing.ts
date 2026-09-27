import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ADMIN_LANDING,
  MEMBER_LANDING,
  TRAINER_HOME,
  TRAINER_LANDING,
  safeNextPath,
} from "./safe-next";

export { ADMIN_LANDING, MEMBER_LANDING, TRAINER_HOME, TRAINER_LANDING, safeNextPath };

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
 * - trainer MET is_pt_available op de eigen actieve rij: /app/trainer/agenda
 * - trainer zonder PT (fix/trainer-pt-scope): /app/trainer, de trainer-home
 *   met eigen lessen en uren. Ook zonder trainers-rij (page-level
 *   requireTrainerOrAdmin vangt een inactieve trainer op)
 * - anders: /app (ledenlanding sinds de landing-flip van 2026-07-12)
 *
 * /app/page.tsx gebruikt dezelfde functie voor de doorverwijzing van een
 * trainer die op de ledenlanding binnenkomt, zodat de mapping op een plek
 * blijft.
 */
/**
 * Landing op basis van de profielrol. Het profiel wordt met de meegegeven
 * client gelezen (onder RLS als de ingelogde gebruiker); de trainers-lookup
 * voor admins via de service role, zie hieronder. Zonder profiel valt het
 * terug op de ledenlanding.
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
    // Via de service-role-client, zoals requireTrainerOrAdmin
    // (fix/trainer-rls-lockdown): stafbepaling in de app hangt niet van de
    // kolom-grants op tmc.trainers af. Alleen-lezen, alleen voor een admin.
    const admin = createAdminClient();
    const { data: trainerRow } = await admin
      .from("trainers")
      .select("id")
      .eq("profile_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    return trainerRow ? TRAINER_LANDING : ADMIN_LANDING;
  }
  if (role === "trainer") {
    // Zelfde service-role-lookup als hierboven: is_pt_available is voor
    // authenticated niet leesbaar (kolom-grants uit fix/trainer-rls-lockdown).
    const admin = createAdminClient();
    const { data: trainerRow } = await admin
      .from("trainers")
      .select("is_pt_available")
      .eq("profile_id", userId)
      .eq("is_active", true)
      .maybeSingle<{ is_pt_available: boolean }>();
    return trainerRow?.is_pt_available ? TRAINER_LANDING : TRAINER_HOME;
  }
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
