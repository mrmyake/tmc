import { unstable_cache } from "next/cache";
import { STUDIO_OPENING_DATE } from "@/lib/constants";
import { getPublicClient } from "@/lib/supabase";

// Outage-only fallbacks, nooit de bron van waarheid: zelfde instants als de
// live tmc.early_member_pools-rijen (opens_at, closes_at) op het moment van
// schrijven. Worden alleen gebruikt als de Supabase-call hieronder faalt.
// STUDIO_OPENING_DATE (constants.ts) is sinds migratie 20260813 gedegradeerd
// tot deze fallback-rol; de database is de enige bron van waarheid voor
// beide campagnedatums.
const FALLBACK_DEADLINE_ISO = "2026-10-01T00:00:00+02:00";
const FALLBACK_OPENS_ISO = STUDIO_OPENING_DATE.toISOString();

export interface CampaignWindow {
  opensAtIso: string;
  closesAtIso: string;
}

const FALLBACK_WINDOW: CampaignWindow = {
  opensAtIso: FALLBACK_OPENS_ISO,
  closesAtIso: FALLBACK_DEADLINE_ISO,
};

async function fetchCampaignWindow(): Promise<CampaignWindow> {
  const supabase = getPublicClient();
  if (!supabase) return FALLBACK_WINDOW;
  const { data, error } = await supabase.rpc("get_campaign_window");
  const row = data as { opens_at?: string; closes_at?: string } | null;
  if (error || !row?.opens_at || !row?.closes_at) {
    console.error("[campaign] get_campaign_window fetch failed:", error);
    return FALLBACK_WINDOW;
  }
  return { opensAtIso: row.opens_at, closesAtIso: row.closes_at };
}

/**
 * Single source of truth voor het campagnevenster: tmc.early_member_pools
 * (opens_at, closes_at) via de get_campaign_window() RPC. De echte
 * checkout-poort is server-side tmc.create_order, dat via
 * _compute_order_price tegen dezelfde twee grenzen checkt (sinds migratie
 * 20260813 ook de ondergrens), dus weergave en handhaving kunnen niet
 * uiteenlopen.
 *
 * Getagd + met een 300s-venster gecached zodat de root layout (ISR,
 * revalidate=60) geen per-request DB-call krijgt: deze call gebeurt hooguit
 * eens per 300s ongeacht hoeveel ISR-renders er binnen dat venster vallen.
 * De fase klapt vanzelf om zodra een grens verstrijkt (elke ISR-render
 * herberekent getCampaignPhase() tegen de huidige tijd); alleen als Marlon
 * een datum zelf verzet is een revalidateTag("campaign") nodig, dat is nog
 * niet gebouwd (zie ws1-catalogue-design.md §5, WS-2).
 */
export const getCampaignWindow = unstable_cache(
  fetchCampaignWindow,
  ["campaign-window"],
  { revalidate: 300, tags: ["campaign"] },
);

export type CampaignPhase = "pre-open" | "open-em" | "closed";

export function getCampaignPhase(
  window: CampaignWindow,
  now: Date = new Date(),
): CampaignPhase {
  if (now < new Date(window.opensAtIso)) return "pre-open";
  if (now < new Date(window.closesAtIso)) return "open-em";
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
