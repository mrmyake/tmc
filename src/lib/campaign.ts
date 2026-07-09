import { unstable_cache } from "next/cache";
import { STUDIO_OPENING_DATE } from "@/lib/constants";
import { getPublicClient } from "@/lib/supabase";

// OPENING_DATE blijft een statische constante: deliberately decoupled van de
// Early Member-deadline (zie spec-membership-flow.md), bepaalt alleen de
// pre-open vs. open framing, geen checkout-gate.
export const OPENING_DATE = STUDIO_OPENING_DATE;

// Outage-only fallback, nooit de bron van waarheid: zelfde instant als de
// live tmc.early_member_pools.closes_at op het moment van schrijven. Wordt
// alleen gebruikt als de Supabase-call hieronder faalt.
const FALLBACK_DEADLINE_ISO = "2026-10-01T00:00:00+02:00";

async function fetchCampaignDeadline(): Promise<string> {
  const supabase = getPublicClient();
  if (!supabase) return FALLBACK_DEADLINE_ISO;
  const { data, error } = await supabase.rpc("get_campaign_deadline");
  if (error || !data) {
    console.error("[campaign] get_campaign_deadline fetch failed:", error);
    return FALLBACK_DEADLINE_ISO;
  }
  return data as string;
}

/**
 * Single source of truth voor de campagne-deadline: tmc.early_member_pools
 * .closes_at, via de get_campaign_deadline() RPC (WS-1). De echte
 * checkout-poort is server-side tmc.create_order, dat via
 * _compute_order_price tegen dezelfde closes_at checkt, dus weergave en
 * handhaving kunnen niet uiteenlopen.
 *
 * Getagd + met een 300s-venster gecached zodat de root layout (ISR,
 * revalidate=60) geen per-request DB-call krijgt: deze call gebeurt hooguit
 * eens per 300s ongeacht hoeveel ISR-renders er binnen dat venster vallen.
 * De fase klapt vanzelf om zodra de deadline verstrijkt (elke ISR-render
 * herberekent getCampaignPhase() tegen de huidige tijd); alleen als Marlon
 * de datum zelf verzet is een revalidateTag("campaign") nodig, dat is nog
 * niet gebouwd (zie ws1-catalogue-design.md §5, WS-2).
 */
export const getCampaignDeadline = unstable_cache(
  fetchCampaignDeadline,
  ["campaign-deadline"],
  { revalidate: 300, tags: ["campaign"] },
);

export type CampaignPhase = "pre-open" | "open-em" | "closed";

export function getCampaignPhase(
  deadline: Date,
  now: Date = new Date(),
): CampaignPhase {
  if (now < OPENING_DATE) return "pre-open";
  if (now < deadline) return "open-em";
  return "closed";
}

/** "1 oktober" — compact vorm voor de teaser-bar, geen jaartal. */
export function formatCampaignDeadline(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
  }).format(date);
}
