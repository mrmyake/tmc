export type CreditType = "pt" | "strippenkaart" | "duo";

export interface CreditMembershipRow {
  id: string;
  plan_type: string;
  plan_variant: string | null;
  credits_remaining: number;
  credits_total: number;
  credits_expires_at: string | null;
  start_date: string;
}

/**
 * Exact dezelfde discriminatie als tmc.book_pt_credits (migratie 20260723):
 * ten_ride_card -> strippenkaart; pt_package + plan_variant LIKE 'duo%' ->
 * duo; pt_package + (plan_variant IS NULL OR NOT LIKE 'duo%') -> pt.
 */
export function creditType(row: {
  plan_type: string;
  plan_variant: string | null;
}): CreditType {
  if (row.plan_type === "ten_ride_card") return "strippenkaart";
  if (row.plan_variant?.startsWith("duo")) return "duo";
  return "pt";
}

// COPY: confirm met Marlon
export const CREDIT_TYPE_LABELS: Record<
  CreditType,
  { name: string; sub: string; emptyText: string }
> = {
  pt: {
    name: "PT rittenkaart",
    sub: "Personal training",
    emptyText: "Je hebt op dit moment geen PT-tegoed.",
  },
  strippenkaart: {
    name: "Strippenkaart",
    sub: "Groepslessen",
    emptyText: "Je hebt op dit moment geen strippenkaart.",
  },
  duo: {
    name: "Duo rittenkaart",
    sub: "Personal training duo",
    emptyText: "Je hebt op dit moment geen duo-tegoed.",
  },
};

export const CREDIT_TYPE_ORDER: CreditType[] = ["pt", "strippenkaart", "duo"];

// Geen vastgelegde drempel elders in de codebase voor "bijna verlopen";
// 14 dagen is een redelijke, expliciete keuze voor dit signaal.
const EXPIRY_WARNING_DAYS = 14;

export function daysUntil(dateIso: string): number {
  const ms = new Date(`${dateIso}T00:00:00`).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function isExpiringSoon(dateIso: string): boolean {
  const days = daysUntil(dateIso);
  return days >= 0 && days <= EXPIRY_WARNING_DAYS;
}
