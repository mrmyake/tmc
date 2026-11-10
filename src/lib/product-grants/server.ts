import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  invoiceGrantCounters,
  toGrantableProducts,
  type GrantCatalogueRow,
  type GrantableProduct,
  type InvoiceGrantCounter,
} from "./core";

/**
 * Leeskant van product toekennen zonder betaling (spec-facturatie.md 9.8),
 * voor het ledendetail en het factuurscherm in admin. Alleen aanroepen
 * achter de admin-layout; schrijven gaat via de RPC's in
 * src/lib/admin/product-grant-actions.ts.
 */

export interface ProductGrantRow {
  id: string;
  membershipId: string;
  profileId: string;
  catalogueSlug: string;
  displayName: string;
  credits: number;
  creditsRemaining: number | null;
  expiresAt: string | null;
  reason: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  duplicateOverride: boolean;
  grantedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  /** Alleen een ongebruikte, actieve toekenning is in te trekken. */
  canRevoke: boolean;
}

export interface PaidInvoiceOption {
  id: string;
  number: string;
  totalGrossCents: number;
}

/** Catalogusrijen ongecachet: de poort moet de actuele is_active zien. */
export async function listGrantableProducts(): Promise<GrantableProduct[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catalogue")
    .select("slug, kind, display_name, credits, validity_months, billing_cycle_weeks, is_active, display_order")
    .eq("kind", "product")
    .order("display_order");
  if (error) {
    console.error("[product-grants] catalogue", error);
    return [];
  }
  return toGrantableProducts((data ?? []) as GrantCatalogueRow[]);
}

type GrantJoinRow = {
  id: string;
  membership_id: string;
  profile_id: string;
  catalogue_slug: string;
  credits: number;
  expires_at: string | null;
  reason: string;
  invoice_id: string | null;
  duplicate_override: boolean;
  granted_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  membership:
    | { status: string; credits_remaining: number | null; credits_total: number | null }
    | { status: string; credits_remaining: number | null; credits_total: number | null }[]
    | null;
  invoice: { invoice_number: string | null } | { invoice_number: string | null }[] | null;
};

const GRANT_SELECT = `id, membership_id, profile_id, catalogue_slug, credits, expires_at, reason,
  invoice_id, duplicate_override, granted_at, revoked_at, revoke_reason,
  membership:memberships!membership_id(status, credits_remaining, credits_total),
  invoice:invoices!invoice_id(invoice_number)`;

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function mapGrants(rows: GrantJoinRow[]): Promise<ProductGrantRow[]> {
  if (rows.length === 0) return [];
  const admin = createAdminClient();
  const slugs = Array.from(new Set(rows.map((r) => r.catalogue_slug)));
  const { data: cat } = await admin.from("catalogue").select("slug, display_name").in("slug", slugs);
  const names = new Map((cat ?? []).map((c) => [c.slug as string, c.display_name as string]));
  return rows.map((r) => {
    const m = one(r.membership);
    const inv = one(r.invoice);
    return {
      id: r.id,
      membershipId: r.membership_id,
      profileId: r.profile_id,
      catalogueSlug: r.catalogue_slug,
      displayName: names.get(r.catalogue_slug) ?? r.catalogue_slug,
      credits: r.credits,
      creditsRemaining: m?.credits_remaining ?? null,
      expiresAt: r.expires_at,
      reason: r.reason,
      invoiceId: r.invoice_id,
      invoiceNumber: inv?.invoice_number ?? null,
      duplicateOverride: r.duplicate_override,
      grantedAt: r.granted_at,
      revokedAt: r.revoked_at,
      revokeReason: r.revoke_reason,
      canRevoke:
        r.revoked_at === null &&
        m?.status === "active" &&
        m.credits_remaining !== null &&
        m.credits_remaining === m.credits_total,
    };
  });
}

export async function listGrantsForProfile(profileId: string): Promise<ProductGrantRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_grants")
    .select(GRANT_SELECT)
    .eq("profile_id", profileId)
    .order("granted_at", { ascending: false });
  if (error) {
    // Voor de migratie bestaat de tabel nog niet: dan is er niets te tonen.
    console.error("[product-grants] listGrantsForProfile", error);
    return [];
  }
  return mapGrants((data ?? []) as unknown as GrantJoinRow[]);
}

export async function listGrantsForInvoice(invoiceId: string): Promise<ProductGrantRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_grants")
    .select(GRANT_SELECT)
    .eq("invoice_id", invoiceId)
    .order("granted_at", { ascending: false });
  if (error) {
    console.error("[product-grants] listGrantsForInvoice", error);
    return [];
  }
  return mapGrants((data ?? []) as unknown as GrantJoinRow[]);
}

/**
 * Betaalde, niet gecrediteerde facturen van een lid: de keuzelijst in de
 * dialoog op het ledendetail. Dezelfde regels als de RPC, die het laatste
 * woord heeft.
 */
export async function listPaidInvoicesForProfile(profileId: string): Promise<PaidInvoiceOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invoices")
    .select("id, invoice_number, total_gross_cents, issued_at")
    .eq("profile_id", profileId)
    .eq("status", "finalised")
    .is("credit_of_invoice_id", null)
    .not("payment_id", "is", null)
    .order("issued_at", { ascending: false })
    .limit(50);
  if (error || !data || data.length === 0) return [];
  const ids = data.map((i) => i.id as string);
  const { data: credits } = await admin
    .from("invoices")
    .select("credit_of_invoice_id")
    .in("credit_of_invoice_id", ids)
    .eq("status", "finalised");
  const credited = new Set((credits ?? []).map((c) => c.credit_of_invoice_id as string));
  return data
    .filter((i) => !credited.has(i.id as string))
    .map((i) => ({
      id: i.id as string,
      number: (i.invoice_number as string | null) ?? "",
      totalGrossCents: (i.total_gross_cents as number | null) ?? 0,
    }));
}

export interface InvoiceGrantState {
  counters: InvoiceGrantCounter[];
  grants: ProductGrantRow[];
  products: GrantableProduct[];
}

/** Tellers en toekenningen voor "Product klaarzetten" op het factuurscherm. */
export async function loadInvoiceGrantState(
  invoiceId: string,
  lines: { catalogueSlug: string | null; quantity: number }[],
): Promise<InvoiceGrantState> {
  const [products, grants] = await Promise.all([
    listGrantableProducts(),
    listGrantsForInvoice(invoiceId),
  ]);
  const activeSlugs = grants.filter((g) => g.revokedAt === null).map((g) => g.catalogueSlug);
  return {
    counters: invoiceGrantCounters(lines, activeSlugs, products),
    grants,
    products,
  };
}
