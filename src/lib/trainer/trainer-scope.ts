import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";

export interface TrainerScopeOption {
  id: string;
  displayName: string;
  slug: string;
}

export type TrainerScope =
  | { ok: false }
  | {
      ok: true;
      userId: string;
      /** Admin is een superset: mag elke actieve trainer bekijken via de kiezer. */
      isAdmin: boolean;
      /** Alle trainers die de kiezer mag tonen. Voor een trainer: alleen de eigen rij. */
      options: TrainerScopeOption[];
      /** De trainer wiens data getoond moet worden. Null als er niets te tonen valt. */
      selectedTrainerId: string | null;
      /** De eigen trainers-rij van de ingelogde gebruiker, indien aanwezig. */
      ownTrainerId: string | null;
      /**
       * True als de getoonde trainer de eigen rij is. Schermen met een
       * persoonlijke schrijfactie (bv. uren indienen) mogen die actie
       * alleen tonen als dit true is.
       */
      isOwnData: boolean;
      /**
       * fix/trainer-pt-scope: mag de ingelogde gebruiker PT-schermen zien?
       * Admin altijd; een trainer alleen met is_pt_available op de eigen
       * actieve rij. Agenda, boeken en de klantpagina sturen anders naar
       * /app/trainer (trainer-home met eigen lessen en uren).
       */
      isPtTrainer: boolean;
    };

interface TrainerRow {
  id: string;
  display_name: string;
  slug: string;
}

interface OwnTrainerRow extends TrainerRow {
  is_pt_available: boolean;
}

/**
 * Rolhiërarchie, één plek. Bepaalt welke trainer-data de ingelogde
 * gebruiker mag zien op de /app/trainer/**-schermen.
 *
 * - Admin is een superset van trainer: krijgt alle actieve trainers in de
 *   kiezer en mag via de trainerId-queryparam wisselen.
 * - Een trainer krijgt uitsluitend de eigen rij en kan de queryparam niet
 *   gebruiken om andermans data te bekijken.
 * - isPtTrainer (fix/trainer-pt-scope) zegt of de PT-schermen open zijn:
 *   admin altijd, een trainer alleen met is_pt_available op de eigen rij.
 *
 * Dit is de TS-kant van dezelfde hiërarchie die de database al afdwingt
 * (tmc.is_staff() poort de PT-RPC's, en elke trainer-tabel heeft naast de
 * trainer-policy een *_admin_all-policy op tmc.is_admin()). Er verandert
 * hier dus niets aan de rechten zelf, alleen aan welke data een scherm
 * kiest te tonen.
 */
export async function resolveTrainerScope(
  requestedTrainerId?: string,
): Promise<TrainerScope> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const isAdmin = gate.actorType === "admin";
  const admin = createAdminClient();

  const [{ data: ownRow }, { data: allRows }] = await Promise.all([
    admin
      .from("trainers")
      .select("id, display_name, slug, is_pt_available")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle<OwnTrainerRow>(),
    isAdmin
      ? admin
          .from("trainers")
          .select("id, display_name, slug")
          .eq("is_active", true)
          .order("display_order", { ascending: true })
          .returns<TrainerRow[]>()
      : Promise.resolve({ data: null }),
  ]);

  const toOption = (t: TrainerRow): TrainerScopeOption => ({
    id: t.id,
    displayName: t.display_name,
    slug: t.slug,
  });

  const options: TrainerScopeOption[] = isAdmin
    ? (allRows ?? []).map(toOption)
    : ownRow
      ? [toOption(ownRow)]
      : [];

  // Een trainer kan de queryparam niet gebruiken om andermans data te zien.
  const requested = isAdmin ? requestedTrainerId : undefined;
  const fallback = isAdmin
    ? (ownRow?.id ??
        options.find((t) => t.slug === "marlon")?.id ??
        options[0]?.id ??
        null)
    : (ownRow?.id ?? null);
  const selectedTrainerId =
    requested && options.some((t) => t.id === requested) ? requested : fallback;

  return {
    ok: true,
    userId: user.id,
    isAdmin,
    options,
    selectedTrainerId,
    ownTrainerId: ownRow?.id ?? null,
    isOwnData: selectedTrainerId !== null && selectedTrainerId === ownRow?.id,
    isPtTrainer: isAdmin || Boolean(ownRow?.is_pt_available),
  };
}
