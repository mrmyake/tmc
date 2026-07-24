import type { Metadata } from "next";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import { CodeRedeemFlow, type TrialCodeSessionOption } from "./CodeRedeemFlow";

export const metadata: Metadata = {
  title: "Proefles met code | The Movement Club",
  description:
    "Heb je een code van Marlon gekregen? Boek hier je gratis proefles.",
  alternates: { canonical: "/proefles/code" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Codes gelden alleen voor yoga_mobility en kettlebell (zie de
// pillar-check op tmc.trial_codes); geen prijs, dus geen catalogue-lookup
// zoals /proefles/boeken die wel nodig heeft.
const CODE_ELIGIBLE_PILLARS = ["yoga_mobility", "kettlebell"];
const HORIZON_DAYS = 14;

type SessionRow = {
  id: string;
  start_at: string;
  end_at: string;
  pillar: string;
  class_type: { name: string } | null;
  trainer: { display_name: string } | null;
};

export default async function TrialCodePage() {
  const admin = isAdminConfigured() ? createAdminClient() : null;

  let options: TrialCodeSessionOption[] = [];

  if (admin) {
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86400000);

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
      .in("pillar", CODE_ELIGIBLE_PILLARS)
      .gte("start_at", now.toISOString())
      .lt("start_at", horizonEnd.toISOString())
      .order("start_at", { ascending: true })
      .returns<SessionRow[]>();

    if (error) {
      console.error("[/proefles/code] sessions query", error);
    }

    const ids = (sessions ?? []).map((s) => s.id);
    // spots_available NULL betekent onbeperkte capaciteit (alleen
    // kettlebell): altijd boekbaar.
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
      .map((s) => ({
        id: s.id,
        startAt: s.start_at,
        endAt: s.end_at,
        pillar: s.pillar,
        pillarLabel: PILLAR_LABELS[s.pillar as Pillar] ?? s.pillar,
        className: s.class_type?.name ?? "Sessie",
        trainerName: s.trainer?.display_name ?? "coach",
        spotsAvailable:
          spotsBySession.get(s.id) === undefined
            ? 0
            : (spotsBySession.get(s.id) ?? null),
      }));
  }

  return <CodeRedeemFlow options={options} />;
}
