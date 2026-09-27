import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type RequireTrainerOrAdminResult =
  | { ok: true; userId: string; actorType: "admin" | "trainer" }
  // reason (additief, spec-kiosk-room-control.md PR 2): "unauthenticated"
  // is niet ingelogd (HTTP 401-equivalent), "forbidden" is ingelogd maar
  // geen staff (403-equivalent). Bestaande callers lezen alleen ok/message.
  | { ok: false; reason: "unauthenticated" | "forbidden"; message: string };

/**
 * PT-agenda C3: gedeelde gate voor acties die een admin OF een actieve
 * trainer mag doen. TS-spiegel van tmc.is_staff() in de DB: profiel-rol
 * admin, of profiel-rol trainer MET een trainers-rij met is_active=true.
 * Beide voorwaarden (fix/trainer-rls-lockdown, migratie 20260928090000):
 * tot die fix telde een actieve trainers-rij alleen al, en die rij kon een
 * lid via de policy trainers_self zelf aanmaken. De rol wordt uitsluitend
 * door een admin gezet (inviteTrainer), de trainers-rij ook; samen zijn ze
 * de stafdefinitie. is_pt_available doet bewust niet mee: die vlag bepaalt
 * of leden iemand als boekbare PT zien, niet of iemand als trainer mag
 * werken. Zelfde vorm en foutafhandeling als requireAdmin
 * (src/lib/admin/require-admin.ts); actorType erbij zodat de aanroeper het
 * juiste event-actortype kan loggen.
 */
export async function requireTrainerOrAdmin(): Promise<RequireTrainerOrAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // COPY: confirm met Marlon
  if (!user) return { ok: false, reason: "unauthenticated", message: "Je bent uitgelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role === "admin") {
    return { ok: true, userId: user.id, actorType: "admin" };
  }
  if (profile?.role !== "trainer") {
    // COPY: confirm met Marlon
    return { ok: false, reason: "forbidden", message: "Geen toegang." };
  }

  // Trainers-rij via de service-role-client (alleen-lezen); de rolcheck
  // hierboven is de eerste helft van de stafdefinitie, dit de tweede.
  const admin = createAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!trainer) {
    // COPY: confirm met Marlon
    return { ok: false, reason: "forbidden", message: "Geen toegang." };
  }
  return { ok: true, userId: user.id, actorType: "trainer" };
}
