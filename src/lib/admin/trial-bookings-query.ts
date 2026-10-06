import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWhatsAppHref } from "@/lib/admin/whatsapp";
import {
  isTrialBookingStatus,
  type TrialBookingStatus,
} from "@/lib/trial-bookings/status";

/**
 * Leesqueries voor de tab Boekingen op /app/admin/proeflessen
 * (spec-community-growth.md par. 1, proefboekingen). Service-role, alleen
 * lezen; muteren van proefboekingen gebeurt elders (sessie-detail,
 * proefcode-detail) en bewust niet hier.
 *
 * Testboekingen (is_test) worden nooit getoond. Geannuleerde boekingen
 * alleen met showCancelled. Het moment van de les is
 * coalesce(slot_start_at, class_sessions.start_at): een proefuur vrij
 * trainen hangt aan de dagsessie en heeft het eigen uur in het slot.
 */

export type TrialBookingPeriod = "upcoming" | "past" | "all";

export function parseTrialBookingPeriod(value: unknown): TrialBookingPeriod {
  if (value === "past" || value === "all") return value;
  return "upcoming";
}

export interface TrialBookingRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** null als het nummer niet te normaliseren is; dan geen knop. */
  whatsappHref: string | null;
  status: TrialBookingStatus;
  /** Gratis via proefcode (anders betaald via Mollie). */
  viaCode: boolean;
  pricePaidCents: number;
  bookedAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface TrialBookingGroup {
  /** session_id plus slot_start_at; een proefuur per slot, een les per sessie. */
  key: string;
  sessionId: string;
  startAt: string;
  endAt: string;
  className: string;
  /** Proefuur vrij trainen: startAt en endAt zijn het slot, niet de dagsessie. */
  isSlot: boolean;
  sessionCancelled: boolean;
  bookings: TrialBookingRow[];
}

export interface TrialBookingKpis {
  /**
   * pending of paid, les binnen de komende 7 dagen. Boekingen op een
   * geannuleerde sessie tellen niet mee (die les gaat niet door), de rij
   * blijft wel zichtbaar in de lijst met de chip "Les geannuleerd".
   */
  upcomingWeek: number;
  attended: number;
}

type RawSession = {
  start_at: string;
  end_at: string;
  status: string;
  class_types: { name: string } | { name: string }[] | null;
};

type RawTrialBookingRow = {
  id: string;
  session_id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  trial_code_id: string | null;
  price_paid_cents: number;
  booked_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  slot_start_at: string | null;
  slot_end_at: string | null;
  class_sessions: RawSession | RawSession[] | null;
};

const TRIAL_BOOKING_SELECT = `
  id, session_id, name, email, phone, status, trial_code_id, price_paid_cents,
  booked_at, cancelled_at, cancellation_reason, slot_start_at, slot_end_at,
  class_sessions(start_at, end_at, status, class_types(name))
`;

// Bovengrens; geen paginering. Ruim boven wat de studio aan proeflessen
// verwacht, en de periode-filter houdt de lijst in de praktijk kort.
const LIST_LIMIT = 1000;
const UPCOMING_WEEK_DAYS = 7;

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * De zoekterm gaat in een PostgREST or-filter; komma's, haakjes en
 * wildcards hebben daar betekenis en worden tot spaties gemaakt (zelfde
 * regel als trial-requests-query.ts).
 */
function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()\\]/g, " ").trim();
}

/** Het moment van de les voor sortering en periode: slot, anders sessie. */
function occursAt(r: RawTrialBookingRow): string | null {
  if (r.slot_start_at) return r.slot_start_at;
  return firstOf(r.class_sessions)?.start_at ?? null;
}

function mapRow(r: RawTrialBookingRow): TrialBookingRow {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    whatsappHref: toWhatsAppHref(r.phone),
    status: isTrialBookingStatus(r.status) ? r.status : "pending",
    viaCode: r.trial_code_id !== null,
    pricePaidCents: r.price_paid_cents,
    bookedAt: r.booked_at,
    cancelledAt: r.cancelled_at,
    cancellationReason: r.cancellation_reason,
  };
}

/**
 * Lijst per les, gefilterd op periode, zoekterm en annuleringen. De
 * periode-filter en de sortering gebeuren in TS omdat ze op
 * coalesce(slot_start_at, start_at) werken en PostgREST niet op een
 * embedded kolom kan filteren of sorteren zonder inner join op beide.
 */
export async function listTrialBookingGroups(opts: {
  period: TrialBookingPeriod;
  q: string;
  showCancelled: boolean;
  now?: Date;
}): Promise<TrialBookingGroup[]> {
  const now = opts.now ?? new Date();
  const admin = createAdminClient();
  let query = admin
    .from("trial_bookings")
    .select(TRIAL_BOOKING_SELECT)
    .eq("is_test", false)
    .limit(LIST_LIMIT);

  if (!opts.showCancelled) query = query.neq("status", "cancelled");

  const term = sanitizeSearch(opts.q);
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[trial-bookings-query] list failed", error);
    return [];
  }

  const nowMs = now.getTime();
  const groups = new Map<string, TrialBookingGroup>();

  for (const r of (data ?? []) as RawTrialBookingRow[]) {
    const session = firstOf(r.class_sessions);
    const at = occursAt(r);
    // Zonder sessie (FK cascade heeft hem weggehaald tussen twee reads) is
    // er niets om onder te groeperen.
    if (!session || !at) continue;

    const atMs = new Date(at).getTime();
    if (opts.period === "upcoming" && atMs < nowMs) continue;
    if (opts.period === "past" && atMs >= nowMs) continue;

    const key = `${r.session_id}:${r.slot_start_at ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      const isSlot = r.slot_start_at !== null && r.slot_end_at !== null;
      group = {
        key,
        sessionId: r.session_id,
        startAt: isSlot ? (r.slot_start_at as string) : session.start_at,
        endAt: isSlot ? (r.slot_end_at as string) : session.end_at,
        // COPY: confirm met Marlon
        className: firstOf(session.class_types)?.name ?? "Les",
        isSlot,
        sessionCancelled: session.status === "cancelled",
        bookings: [],
      };
      groups.set(key, group);
    }
    group.bookings.push(mapRow(r));
  }

  const ascending = opts.period === "upcoming";
  const sorted = [...groups.values()].sort((a, b) => {
    const diff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    return ascending ? diff : -diff;
  });
  for (const g of sorted) {
    g.bookings.sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }
  return sorted;
}

/** KPI's over alle niet-testboekingen, onafhankelijk van filter en zoekterm. */
export async function getTrialBookingKpis(now: Date = new Date()): Promise<TrialBookingKpis> {
  const kpis: TrialBookingKpis = { upcomingWeek: 0, attended: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_bookings")
    .select("status, slot_start_at, class_sessions(start_at, status)")
    .eq("is_test", false)
    .in("status", ["pending", "paid", "attended"]);
  if (error) {
    console.error("[trial-bookings-query] kpis failed", error);
    return kpis;
  }

  const nowMs = now.getTime();
  const weekMs = nowMs + UPCOMING_WEEK_DAYS * 24 * 60 * 60 * 1000;
  for (const r of (data ?? []) as Array<{
    status: string;
    slot_start_at: string | null;
    class_sessions:
      | { start_at: string; status: string }
      | { start_at: string; status: string }[]
      | null;
  }>) {
    if (r.status === "attended") {
      kpis.attended += 1;
      continue;
    }
    const session = firstOf(r.class_sessions);
    if (!session || session.status === "cancelled") continue;
    const at = r.slot_start_at ?? session.start_at;
    const atMs = new Date(at).getTime();
    if (atMs >= nowMs && atMs < weekMs) kpis.upcomingWeek += 1;
  }
  return kpis;
}
