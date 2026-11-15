import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWhatsAppHref } from "@/lib/admin/whatsapp";
import {
  isProgrammaIntakeStatus,
  type ProgrammaIntakeStatus,
} from "@/lib/programma-intake/status";
import { buildSourceLines } from "@/lib/programma-intake/mail";

/**
 * Leesqueries voor /app/admin/intakes (intake-aanvragen 12 weken programma).
 * Service-role, alleen lezen; schrijven loopt via programma-intakes-actions.ts.
 * Rijen met is_test staan standaard buiten de lijst en buiten de tellingen.
 */

/** "open" = new plus contacted (de default van de pagina). */
export type ProgrammaIntakeStatusFilter = ProgrammaIntakeStatus | "open" | "all";

export function parseProgrammaIntakeStatusFilter(value: unknown): ProgrammaIntakeStatusFilter {
  if (value === "all" || value === "open") return value;
  if (isProgrammaIntakeStatus(value)) return value;
  return "open";
}

export interface ProgrammaIntakeRow {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  whatsappHref: string | null;
  preferredDay: string;
  message: string | null;
  sourceLines: string[];
  status: ProgrammaIntakeStatus;
  notes: string | null;
  contactedAt: string | null;
  isTest: boolean;
  createdAt: string;
}

type RawRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  preferred_day: string;
  message: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_path: string | null;
  status: string;
  notes: string | null;
  contacted_at: string | null;
  is_test: boolean;
  created_at: string;
};

const SELECT =
  "id, first_name, last_name, email, phone, preferred_day, message, gclid, gbraid, wbraid, fbclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path, status, notes, contacted_at, is_test, created_at";

const LIST_LIMIT = 500;

function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()\\]/g, " ").trim();
}

function mapRow(r: RawRow): ProgrammaIntakeRow {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    name: `${r.first_name} ${r.last_name}`.trim(),
    email: r.email,
    phone: r.phone,
    whatsappHref: toWhatsAppHref(r.phone),
    preferredDay: r.preferred_day,
    message: r.message,
    sourceLines: buildSourceLines({
      gclid: r.gclid ?? undefined,
      gbraid: r.gbraid ?? undefined,
      wbraid: r.wbraid ?? undefined,
      fbclid: r.fbclid ?? undefined,
      utm_source: r.utm_source ?? undefined,
      utm_medium: r.utm_medium ?? undefined,
      utm_campaign: r.utm_campaign ?? undefined,
      utm_term: r.utm_term ?? undefined,
      utm_content: r.utm_content ?? undefined,
      landing_path: r.landing_path ?? undefined,
    }),
    status: isProgrammaIntakeStatus(r.status) ? r.status : "new",
    notes: r.notes,
    contactedAt: r.contacted_at,
    isTest: r.is_test,
    createdAt: r.created_at,
  };
}

export async function listProgrammaIntakes(opts: {
  status: ProgrammaIntakeStatusFilter;
  q: string;
  showTest: boolean;
}): Promise<ProgrammaIntakeRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("programma_intakes")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (!opts.showTest) query = query.eq("is_test", false);

  if (opts.status === "open") {
    query = query.in("status", ["new", "contacted"]);
  } else if (opts.status !== "all") {
    query = query.eq("status", opts.status);
  }

  const term = sanitizeSearch(opts.q);
  if (term) {
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[programma-intakes-query] list failed", error);
    return [];
  }
  return ((data ?? []) as RawRow[]).map(mapRow);
}

export type ProgrammaIntakeKpis = Record<ProgrammaIntakeStatus, number>;

/** Telling per status over alle niet-test rijen, onafhankelijk van filter en zoekterm. */
export async function getProgrammaIntakeKpis(): Promise<ProgrammaIntakeKpis> {
  const kpis: ProgrammaIntakeKpis = { new: 0, contacted: 0, booked: 0, lost: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("programma_intakes")
    .select("status")
    .eq("is_test", false);
  if (error) {
    console.error("[programma-intakes-query] kpis failed", error);
    return kpis;
  }
  for (const r of (data ?? []) as { status: string }[]) {
    if (isProgrammaIntakeStatus(r.status)) kpis[r.status] += 1;
  }
  return kpis;
}

/** Aantal nieuwe, niet-test intakes voor de badge in de sidebar. Nooit throwen. */
export async function countNewProgrammaIntakes(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("programma_intakes")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .eq("is_test", false);
    if (error) {
      console.error("[programma-intakes-query] count new failed", error);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[programma-intakes-query] count new threw", err);
    return 0;
  }
}
