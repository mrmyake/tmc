import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWhatsAppHref } from "@/lib/admin/whatsapp";
import {
  isTrialRequestStatus,
  type TrialRequestStatus,
} from "@/lib/trial-requests/status";

/**
 * Leesqueries voor /app/admin/proeflessen (spec-community-growth.md par. 1,
 * proefles-aanvragen). Service-role, alleen lezen; schrijven loopt via
 * trial-requests-actions.ts.
 */

/** "open" = new plus contacted (de default van de pagina). */
export type TrialRequestStatusFilter = TrialRequestStatus | "open" | "all";

export function parseTrialRequestStatusFilter(value: unknown): TrialRequestStatusFilter {
  if (value === "all" || value === "open") return value;
  if (isTrialRequestStatus(value)) return value;
  return "open";
}

export interface TrialRequestRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** null zonder of met een niet te normaliseren nummer; dan geen knop. */
  whatsappHref: string | null;
  preference: string | null;
  experience: string | null;
  message: string | null;
  status: TrialRequestStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TrialRequestKpis = Record<TrialRequestStatus, number>;

type RawTrialRequestRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  preference: string | null;
  experience: string | null;
  message: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const TRIAL_REQUEST_SELECT =
  "id, name, email, phone, preference, experience, message, status, notes, created_at, updated_at";

// Bovengrens voor de lijst; er is geen paginering. Ruim boven wat de studio
// aan terugbelverzoeken verwacht.
const LIST_LIMIT = 500;

/**
 * De zoekterm gaat in een PostgREST or-filter; komma's, haakjes en
 * wildcards hebben daar betekenis en worden tot spaties gemaakt.
 */
function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()\\]/g, " ").trim();
}

function mapRow(r: RawTrialRequestRow): TrialRequestRow {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    whatsappHref: toWhatsAppHref(r.phone),
    preference: r.preference,
    experience: r.experience,
    message: r.message,
    status: isTrialRequestStatus(r.status) ? r.status : "new",
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listTrialRequests(opts: {
  status: TrialRequestStatusFilter;
  q: string;
}): Promise<TrialRequestRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("trial_requests")
    .select(TRIAL_REQUEST_SELECT)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (opts.status === "open") {
    query = query.in("status", ["new", "contacted"]);
  } else if (opts.status !== "all") {
    query = query.eq("status", opts.status);
  }

  const term = sanitizeSearch(opts.q);
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[trial-requests-query] list failed", error);
    return [];
  }
  return ((data ?? []) as RawTrialRequestRow[]).map(mapRow);
}

export async function getTrialRequestById(id: string): Promise<TrialRequestRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_requests")
    .select(TRIAL_REQUEST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[trial-requests-query] detail failed", error);
    return null;
  }
  return data ? mapRow(data as RawTrialRequestRow) : null;
}

/** Telling per status over alle rijen, onafhankelijk van filter en zoekterm. */
export async function getTrialRequestKpis(): Promise<TrialRequestKpis> {
  const kpis: TrialRequestKpis = { new: 0, contacted: 0, booked: 0, lost: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin.from("trial_requests").select("status");
  if (error) {
    console.error("[trial-requests-query] kpis failed", error);
    return kpis;
  }
  for (const r of (data ?? []) as { status: string }[]) {
    if (isTrialRequestStatus(r.status)) kpis[r.status] += 1;
  }
  return kpis;
}
