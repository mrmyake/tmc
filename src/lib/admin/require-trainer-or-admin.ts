import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type RequireTrainerOrAdminResult =
  | { ok: true; userId: string; actorType: "admin" | "trainer" }
  | { ok: false; message: string };

/**
 * PT-agenda C3: gedeelde gate voor acties die een admin OF een actieve
 * trainer mag doen. TS-spiegel van tmc.is_staff() in de DB: profiel-rol
 * admin, of een trainers-rij met is_active=true. is_pt_available doet
 * bewust niet mee: die vlag bepaalt of leden iemand als boekbare PT zien,
 * niet of iemand als trainer mag werken. Zelfde vorm en foutafhandeling
 * als requireAdmin (src/lib/admin/require-admin.ts); actorType erbij
 * zodat de aanroeper het juiste event-actortype kan loggen.
 */
export async function requireTrainerOrAdmin(): Promise<RequireTrainerOrAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // COPY: confirm met Marlon
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role === "admin") {
    return { ok: true, userId: user.id, actorType: "admin" };
  }

  // Trainers-rij via de service-role-client: RLS geeft een trainer geen
  // gegarandeerd leespad op de eigen rij, en dit is alleen-lezen.
  const admin = createAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!trainer) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Geen toegang." };
  }
  return { ok: true, userId: user.id, actorType: "trainer" };
}
