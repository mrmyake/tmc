import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type RequirePtTrainerOrAdminResult =
  | {
      ok: true;
      userId: string;
      actorType: "admin" | "trainer";
      /**
       * De eigen actieve trainers-rij van de aanroeper, indien aanwezig.
       * Voor een trainer altijd gevuld (en PT); voor een admin alleen als
       * die zelf ook een actieve trainers-rij heeft (bv. Marlon).
       */
      ownTrainerId: string | null;
    }
  | { ok: false; reason: "unauthenticated" | "forbidden"; message: string };

/**
 * fix/trainer-pt-scope: gate voor alles wat PT raakt. TS-spiegel van
 * tmc.is_pt_trainer_for(p_trainer_id) in de DB.
 *
 * - admin: altijd toegestaan, voor elke trainer.
 * - trainer: alleen met rol trainer EN een actieve eigen trainers-rij met
 *   is_pt_available = true. Komt er een trainerId mee, dan moet dat de eigen
 *   rij zijn; een PT-trainer handelt nooit voor een collega.
 * - een trainer zonder PT (alleen yoga/mobility en/of kettlebell) krijgt
 *   "forbidden", ook op leesacties zoals agenda, bezette tijden,
 *   klantzoeken en PT-tegoed.
 *
 * Staat naast requireTrainerOrAdmin (src/lib/admin/require-trainer-or-admin.ts),
 * dat de gate blijft voor niet-PT-stafwerk: check-in, kiosk, room-control,
 * eigen lessen en aanwezigheid. Zelfde vorm en foutafhandeling, zodat
 * bestaande callers alleen de import en (waar van toepassing) het
 * trainerId-argument hoeven te wisselen.
 */
export async function requirePtTrainerOrAdmin(
  trainerId?: string | null,
): Promise<RequirePtTrainerOrAdminResult> {
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

  const role = profile?.role;
  if (role !== "admin" && role !== "trainer") {
    // COPY: confirm met Marlon
    return { ok: false, reason: "forbidden", message: "Geen toegang." };
  }

  // Trainers-rij via de service-role-client (alleen-lezen), zoals
  // requireTrainerOrAdmin: stafbepaling hangt niet van kolom-grants af
  // (is_pt_available is voor authenticated niet leesbaar sinds
  // fix/trainer-rls-lockdown).
  const admin = createAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, is_pt_available")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle<{ id: string; is_pt_available: boolean }>();

  if (role === "admin") {
    return {
      ok: true,
      userId: user.id,
      actorType: "admin",
      ownTrainerId: trainer?.id ?? null,
    };
  }

  if (!trainer || !trainer.is_pt_available) {
    // COPY: confirm met Marlon
    return { ok: false, reason: "forbidden", message: "Geen toegang." };
  }
  if (trainerId && trainerId !== trainer.id) {
    // COPY: confirm met Marlon
    return {
      ok: false,
      reason: "forbidden",
      message: "Je kunt alleen in je eigen PT-agenda werken.",
    };
  }
  return {
    ok: true,
    userId: user.id,
    actorType: "trainer",
    ownTrainerId: trainer.id,
  };
}
