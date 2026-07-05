import type { Metadata } from "next";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import { TrialBookingList, type TrialSessionOption } from "./TrialBookingList";

export const metadata: Metadata = {
  title: "Boek direct een Proefles | The Movement Club",
  description:
    "Kies zelf een sessie en boek direct een proefles bij The Movement Club in Loosdrecht.",
  alternates: { canonical: "/proefles/boeken" },
};

export const dynamic = "force-dynamic";

// vrij_trainen heeft geen drop-in-prijs, dus geen proefles-optie (zie
// dropInPriceCentsForPillar in src/lib/actions/trial-booking.ts).
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

export default async function TrialBookingPage() {
  const admin = isAdminConfigured() ? createAdminClient() : null;

  let options: TrialSessionOption[] = [];

  if (admin) {
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86400000);

    const { data: settings } = await admin
      .from("booking_settings")
      .select(
        "drop_in_yoga_cents, drop_in_kettlebell_cents, drop_in_kids_cents, drop_in_senior_cents",
      )
      .limit(1)
      .maybeSingle();

    const priceByPillar: Record<string, number> = {
      yoga_mobility: settings?.drop_in_yoga_cents ?? 0,
      kettlebell: settings?.drop_in_kettlebell_cents ?? 0,
      kids: settings?.drop_in_kids_cents ?? 0,
      senior: settings?.drop_in_senior_cents ?? 0,
    };

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
      .in("pillar", TRIAL_ELIGIBLE_PILLARS)
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

    options = (sessions ?? [])
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
          pillarLabel: PILLAR_LABELS[s.pillar as Pillar] ?? s.pillar,
          className: s.class_type?.name ?? "Sessie",
          trainerName: s.trainer?.display_name ?? "coach",
          spotsAvailable: spots === undefined ? 0 : spots,
          priceCents: priceByPillar[s.pillar] ?? 0,
        };
      });
  }

  return <TrialBookingList options={options} />;
}
