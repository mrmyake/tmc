import { unstable_cache } from "next/cache";
import { STUDIO_OPENING_DATE } from "@/lib/constants";
import { getPublicClient } from "@/lib/supabase";

/**
 * EARLY_MEMBER_DEADLINE — sluitingsmoment van de Early Member-actie.
 * Losgekoppeld van STUDIO_OPENING_DATE (src/lib/constants.ts) sinds
 * fix/campagne-fasering (2026-09-06): de studio-opening en de Early
 * Member-actie zijn onafhankelijk combineerbaar, de actie mag lopen terwijl
 * de studio nog niet open is. Zelfde datum als tmc.early_member_pools.closes_at
 * (migratie 20260906_decouple_studio_open_from_em_deadline.sql), waar
 * _compute_order_price server-side tegen handhaaft.
 *
 * Let op wintertijd: 1 november 2026 valt na de laatste-zondag-van-oktober
 * DST-omslag, dus +01:00 en niet +02:00.
 */
export const EARLY_MEMBER_DEADLINE = new Date("2026-11-01T00:00:00+01:00");

// Outage-only fallback, nooit de bron van waarheid: zelfde instant als de
// live tmc.early_member_pools.closes_at op het moment van schrijven. Wordt
// alleen gebruikt als de Supabase-call hieronder faalt.
const FALLBACK_DEADLINE_ISO = EARLY_MEMBER_DEADLINE.toISOString();

export interface CampaignWindow {
  closesAtIso: string;
}

const FALLBACK_WINDOW: CampaignWindow = {
  closesAtIso: FALLBACK_DEADLINE_ISO,
};

async function fetchCampaignWindow(): Promise<CampaignWindow> {
  const supabase = getPublicClient();
  if (!supabase) return FALLBACK_WINDOW;
  const { data, error } = await supabase.rpc("get_campaign_window");
  const row = data as { closes_at?: string } | null;
  if (error || !row?.closes_at) {
    console.error("[campaign] get_campaign_window fetch failed:", error);
    return FALLBACK_WINDOW;
  }
  return { closesAtIso: row.closes_at };
}

/**
 * Single source of truth voor de Early Member-deadline:
 * tmc.early_member_pools.closes_at via de get_campaign_window() RPC (die
 * ook opens_at teruggeeft, maar dat veld heeft sinds 20260906 geen lezer
 * meer, zie STUDIO_OPENING_DATE hierboven). De echte checkout-poort is
 * server-side tmc.create_order, dat via _compute_order_price tegen
 * dezelfde closes_at checkt, dus weergave en handhaving kunnen niet
 * uiteenlopen.
 *
 * Getagd + met een 300s-venster gecached zodat de root layout (ISR,
 * revalidate=60) geen per-request DB-call krijgt: deze call gebeurt hooguit
 * eens per 300s ongeacht hoeveel ISR-renders er binnen dat venster vallen.
 * De EM-status klapt vanzelf om zodra closes_at verstrijkt (elke ISR-render
 * herberekent isEarlyMemberActive() tegen de huidige tijd); alleen als
 * Marlon een datum zelf verzet is een revalidateTag("campaign") nodig, dat
 * is nog niet gebouwd (zie ws1-catalogue-design.md §5, WS-2).
 */
export const getCampaignWindow = unstable_cache(
  fetchCampaignWindow,
  ["campaign-window"],
  { revalidate: 300, tags: ["campaign"] },
);

/**
 * Is de studio open. Puur STUDIO_OPENING_DATE, geen DB-afhankelijkheid en
 * geen relatie meer met de Early Member-deadline (zie STUDIO_OPENING_DATE
 * in constants.ts). Bepaalt uitsluitend copy (hero-framing op
 * /early-member, de campagne-teaser-tekst); er is geen server-side
 * "studio open"-gate, want er valt niets af te dwingen -- de studio is
 * fysiek open of niet, dat raakt geen prijs.
 */
export function isStudioOpen(now: Date = new Date()): boolean {
  return now >= STUDIO_OPENING_DATE;
}

/**
 * Loopt de Early Member-actie nog. Enige grens is closes_at (via
 * getCampaignWindow()); er is bewust geen ondergrens meer (sinds
 * migratie 20260906 verwijderd uit _compute_order_price) -- EM is per
 * direct actief zodra dit true teruggeeft.
 */
export function isEarlyMemberActive(
  window: CampaignWindow,
  now: Date = new Date(),
): boolean {
  return now < new Date(window.closesAtIso);
}

/** "1 november" — compact vorm voor de teaser-bar, geen jaartal. */
export function formatCampaignDeadline(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
  }).format(date);
}
