import "server-only";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import { getCatalogue } from "@/lib/catalogue";
import { pillarsForScope, type TrialCodeScope } from "@/lib/trial-codes/scope";

export interface TrialSessionOption {
  id: string;
  startAt: string;
  endAt: string;
  pillar: string;
  pillarLabel: string;
  className: string;
  trainerName: string;
  /** NULL betekent onbeperkt (alleen kettlebell). */
  spotsAvailable: number | null;
  /** Drop-in-prijs uit tmc.catalogue; 0 in de code-modus (wordt niet getoond). */
  priceCents: number;
}

// vrij_trainen heeft geen drop-in-prijs, dus geen proefles-optie (zie
// dropInSlugForPillar in src/lib/actions/trial-booking.ts).
const TRIAL_ELIGIBLE_PILLARS = ["yoga_mobility", "kettlebell", "kids", "senior"];
const HORIZON_DAYS = 14;

type SessionRow = {
  id: string;
  start_at: string;
  end_at: string;
  pillar: string;
  class_type: { name: string } | null;
  trainer: { display_name: string } | null;
};

/**
 * De boekbare proeflessen van de komende twee weken, gedeeld door de
 * betaalde flow (/proefles/boeken) en de codeflow (/proefles/code): dezelfde
 * lijst. Prijzen komen alleen uit tmc.catalogue (display-equals-charge);
 * de codeflow vraagt ze niet op (withPrices false) en toont ze nergens.
 *
 * `scope` (alleen de codeflow) beperkt de lijst tot de pillars van de code.
 * Dat is weergave: tmc.redeem_trial_code controleert de scope bij het boeken
 * opnieuw. Zonder scope de volledige lijst (de betaalde flow). Een scope
 * zonder pillars (vrij trainen) geeft een lege lijst.
 */
export async function getTrialSessionOptions(
  opts: { withPrices: boolean; scope?: TrialCodeScope },
): Promise<TrialSessionOption[]> {
  const admin = isAdminConfigured() ? createAdminClient() : null;
  if (!admin) return [];

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86400000);
  // yoga_mobility en kettlebell delen dezelfde 'drop_in'-rij (die twee
  // tarieven zijn altijd gelijk geweest, zie tmc.catalogue-seed en het
  // zelfde patroon in src/lib/actions/trial-booking.ts).
  const catalogue = opts.withPrices ? await getCatalogue() : null;
  const priceByPillar: Record<string, number> = {
    yoga_mobility: catalogue?.get("drop_in")?.price_cents ?? 0,
    kettlebell: catalogue?.get("drop_in")?.price_cents ?? 0,
    kids: catalogue?.get("drop_in_kids")?.price_cents ?? 0,
    senior: catalogue?.get("drop_in_senior")?.price_cents ?? 0,
  };

  const pillars = opts.scope ? pillarsForScope(opts.scope) : TRIAL_ELIGIBLE_PILLARS;
  if (pillars.length === 0) return [];

  const { data: sessions, error } = await admin
    .from("class_sessions")
    .select(
      `
        id, start_at, end_at, pillar,
        class_type:class_types(name),
        trainer:trainers(display_name)
      `,
    )
    .eq("status", "scheduled")
    .in("pillar", pillars)
    .gte("start_at", now.toISOString())
    .lt("start_at", horizonEnd.toISOString())
    .order("start_at", { ascending: true })
    .returns<SessionRow[]>();

  if (error) {
    console.error("[/proefles/boeken] sessions query", error);
  }

  const ids = (sessions ?? []).map((s) => s.id);
  // spots_available NULL betekent onbeperkte capaciteit (alleen
  // kettlebell): altijd boekbaar. Sessies zonder availability-rij
  // blijven, net als voorheen, uitgefilterd.
  const spotsBySession = new Map<string, number | null>();
  if (ids.length > 0) {
    const { data: availability } = await admin
      .from("v_session_availability")
      .select("id, spots_available")
      .in("id", ids);
    for (const row of availability ?? []) {
      spotsBySession.set(row.id, row.spots_available);
    }
  }

  return (sessions ?? [])
    .filter((s) => {
      const spots = spotsBySession.get(s.id);
      return spots === null || (spots ?? 0) > 0;
    })
    .map((s) => {
      const spots = spotsBySession.get(s.id);
      return {
        id: s.id,
        startAt: s.start_at,
        endAt: s.end_at,
        pillar: s.pillar,
        pillarLabel: PILLAR_LABELS[s.pillar as Pillar] ?? s.pillar,
        className: s.class_type?.name ?? "Sessie",
        trainerName: s.trainer?.display_name ?? "coach",
        spotsAvailable: spots === undefined ? 0 : spots,
        priceCents: priceByPillar[s.pillar] ?? 0,
      };
    });
}
