import { STUDIO_OPENING_DATE } from "@/lib/constants";

// Single source of truth voor de campagne-fase: de teaser-bar, het Early
// Member-menuslot (Navbar) en de countdown op /early-member lezen allemaal
// van deze twee datums. Bewust statisch (geen Supabase-call): de echte
// checkout-poort blijft server-side tmc.reserve_early_member_slot, die
// tegen tmc.early_member_pools.closes_at checkt (zie
// 20260712000000_early_member_time_only_gate.sql). Deze constante is de
// weergave-deadline, niet de handhaving — zelfde scheiding als de
// bestaande Countdown-component al documenteert ("cosmetic only"). Als de
// pool-deadline in Supabase ooit wijzigt, moet deze constante handmatig
// mee-schuiven totdat de datum-config naar Sanity siteSettings verhuist.
export const OPENING_DATE = STUDIO_OPENING_DATE;

// COPY: confirm met Marlon — placeholder, zelfde instant als de vroegere
// fallback-deadline (2026-09-30T22:00:00+00:00 UTC = 1 okt 00:00 Amsterdam).
export const EARLY_MEMBER_DEADLINE = new Date("2026-10-01T00:00:00+02:00");

export type CampaignPhase = "pre-open" | "open-em" | "closed";

export function getCampaignPhase(now: Date = new Date()): CampaignPhase {
  if (now < OPENING_DATE) return "pre-open";
  if (now < EARLY_MEMBER_DEADLINE) return "open-em";
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
