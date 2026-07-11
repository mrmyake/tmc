import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCatalogue } from "@/lib/catalogue";
import { siteUrl } from "@/lib/site-url";

/** Volledige statusdomein op tmc.orders (orders_status_check). */
export type PaymentRequestStatus =
  | "draft"
  | "pending"
  | "paid"
  | "activated"
  | "expired"
  | "cancelled";

/** orders_blocked_reason_check: de enige twee waarden die de kolom toestaat. */
export type BlockedReason = "duplicate_membership" | "product_not_supported";

/**
 * Weergavestatus voor het overzicht, afgeleid uit status + expires_at + de
 * klok (zie discovery-ws5-betaalverzoek-overzicht.md §1). draft/pending met
 * een verstreken expires_at telt hier al als verlopen, ook al heeft de cron
 * (expire-orders) de rij nog niet omgezet — zelfde nuance als
 * /betaal/[token]/page.tsx hanteert voor de klant.
 */
export type PaymentRequestDisplayStatus =
  | "wacht_op_betaling"
  | "betaald"
  | "betaald_geblokkeerd"
  | "verlopen"
  | "geannuleerd";

export type PaymentRequestGroup = "open" | "paid" | "expired" | "cancelled";

export interface PaymentRequestRow {
  orderId: string;
  profileId: string;
  firstName: string;
  lastName: string;
  email: string;
  catalogueSlug: string;
  productLabel: string;
  firstChargeCents: number;
  recurringCents: number | null;
  status: PaymentRequestStatus;
  blockedReason: BlockedReason | null;
  createdAt: string;
  expiresAt: string;
  token: string;
  payUrl: string;
  displayStatus: PaymentRequestDisplayStatus;
  group: PaymentRequestGroup;
}

type OrderJoinRow = {
  id: string;
  profile_id: string;
  catalogue_slug: string;
  first_charge_cents: number;
  recurring_cents: number | null;
  status: PaymentRequestStatus;
  blocked_reason: BlockedReason | null;
  created_at: string;
  expires_at: string;
  token: string;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
};

/**
 * Deze rijen worden nooit groot: elke rij is een handmatig door Marlon
 * aangemaakt betaalverzoek. 500 is een ruime marge boven wat realistisch
 * ooit binnen één overzicht opgevraagd wordt.
 */
const FETCH_LIMIT = 500;

function deriveDisplayStatus(
  status: PaymentRequestStatus,
  expiresAt: string,
): PaymentRequestDisplayStatus {
  if (status === "cancelled") return "geannuleerd";
  if (status === "activated") return "betaald";
  if (status === "paid") return "betaald_geblokkeerd";
  if (status === "expired") return "verlopen";
  // draft / pending: de klok kan al verstreken zijn vóórdat de cron langskomt.
  return new Date(expiresAt).getTime() <= Date.now()
    ? "verlopen"
    : "wacht_op_betaling";
}

function groupOf(displayStatus: PaymentRequestDisplayStatus): PaymentRequestGroup {
  switch (displayStatus) {
    case "wacht_op_betaling":
      return "open";
    case "betaald":
    case "betaald_geblokkeerd":
      return "paid";
    case "verlopen":
      return "expired";
    case "geannuleerd":
      return "cancelled";
  }
}

/**
 * Alle door Marlon via de wizard aangemaakte betaalverzoeken
 * (created_by='admin'), nieuwste eerst. Puur lezen: service-role select op
 * orders + profiles + de gecachete catalogus, geen enkele write.
 *
 * Zelfservice-orders (created_by='self') worden hier nooit getoond — het
 * filter is exact created_by='admin', bevestigd in de discovery tegen de
 * live orders_admin_provenance_check-constraint.
 */
export async function listPaymentRequests(): Promise<PaymentRequestRow[]> {
  const admin = createAdminClient();
  const catalogue = await getCatalogue();

  const { data, error } = await admin
    .from("orders")
    .select(
      `id, profile_id, catalogue_slug, first_charge_cents, recurring_cents,
       status, blocked_reason, created_at, expires_at, token,
       customer:profiles!orders_profile_id_fkey(first_name, last_name, email)`,
    )
    .eq("created_by", "admin")
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT)
    .returns<OrderJoinRow[]>();

  if (error) {
    console.error("[listPaymentRequests] query failed", error);
    return [];
  }

  return (data ?? []).map((o) => {
    const displayStatus = deriveDisplayStatus(o.status, o.expires_at);
    return {
      orderId: o.id,
      profileId: o.profile_id,
      firstName: o.customer?.first_name ?? "",
      lastName: o.customer?.last_name ?? "",
      email: o.customer?.email ?? "",
      catalogueSlug: o.catalogue_slug,
      productLabel: catalogue.get(o.catalogue_slug)?.display_name ?? o.catalogue_slug,
      firstChargeCents: o.first_charge_cents,
      recurringCents: o.recurring_cents,
      status: o.status,
      blockedReason: o.blocked_reason,
      createdAt: o.created_at,
      expiresAt: o.expires_at,
      token: o.token,
      payUrl: `${siteUrl()}/betaal/${o.token}`,
      displayStatus,
      group: groupOf(displayStatus),
    };
  });
}
