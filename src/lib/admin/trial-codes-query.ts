import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type TrialCodeStatusFilter = "active" | "redeemed" | "revoked" | "all";

export interface TrialCodeBatchOption {
  batchId: string;
  label: string;
}

export interface TrialCodeRedeemer {
  name: string;
  email: string;
  phone: string;
  sessionStartAt: string | null;
  sessionEndAt: string | null;
  sessionPillar: string | null;
  className: string | null;
}

export interface TrialCodeRow {
  id: string;
  code: string;
  pillar: string | null;
  batchId: string;
  batchLabel: string | null;
  createdAt: string;
  expiresAt: string;
  status: "active" | "redeemed" | "revoked";
  redeemedAt: string | null;
  /** status 'active' met expires_at in het verleden: ongebruikt verlopen. */
  isExpired: boolean;
  /**
   * Laatste trial_code.released-event voor deze code, alleen gezet
   * wanneer status weer 'active' is. Onderscheidt een teruggegeven code
   * (na annulering van de bijbehorende boeking) van een nooit-gebruikte
   * code: de rij zelf is voor die twee gevallen identiek.
   */
  releasedAt: string | null;
  /**
   * trial_codes heeft geen revoked_at-kolom; dit komt uit tmc.events
   * (individuele of batch-intrekking). Een code kan maar één keer
   * intrekken, dus precedentie individueel-dan-batch is ondubbelzinnig.
   */
  revokedAt: string | null;
  redeemer: TrialCodeRedeemer | null;
}

export interface TrialCodeKpis {
  issuedTotal: number;
  activeNow: number;
  redeemed: number;
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type RawSession = {
  id: string;
  start_at: string;
  end_at: string;
  pillar: string;
  class_type: { name: string } | { name: string }[] | null;
};

type RawTrialBooking = {
  id: string;
  name: string;
  email: string;
  phone: string;
  session: RawSession | RawSession[] | null;
};

type RawTrialCodeRow = {
  id: string;
  code: string;
  pillar: string | null;
  batch_id: string;
  batch_label: string | null;
  created_at: string;
  expires_at: string;
  status: string;
  redeemed_at: string | null;
  trial_booking: RawTrialBooking | RawTrialBooking[] | null;
};

// trial_bookings heeft twee FK's naar trial_codes (trial_bookings.trial_code_id
// EN trial_codes.trial_booking_id): PostgREST kan de relatie niet raden en
// weigert de query zonder de expliciete FK-naam. We willen hier altijd de
// trial_codes.trial_booking_id-kant (de huidige, actuele boeking van deze
// code), niet de omgekeerde historische trial_code_id-relatie.
const TRIAL_CODE_SELECT = `
  id, code, pillar, batch_id, batch_label, created_at, expires_at, status, redeemed_at,
  trial_booking:trial_bookings!trial_codes_trial_booking_id_fkey(
    id, name, email, phone,
    session:class_sessions(
      id, start_at, end_at, pillar,
      class_type:class_types(name)
    )
  )
`;

/**
 * Altijd server-side geteld tegen de volledige tabel, ongeacht de
 * huidige toolbar-filters: de KPI-strip hoort niet mee te bewegen met
 * status/batch/zoek-filters op de tabel eronder.
 */
export async function getTrialCodeKpis(): Promise<TrialCodeKpis> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [issuedRes, activeRes, redeemedRes] = await Promise.all([
    admin.from("trial_codes").select("id", { count: "exact", head: true }),
    admin
      .from("trial_codes")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gt("expires_at", nowIso),
    admin
      .from("trial_codes")
      .select("id", { count: "exact", head: true })
      .eq("status", "redeemed"),
  ]);

  return {
    issuedTotal: issuedRes.count ?? 0,
    activeNow: activeRes.count ?? 0,
    redeemed: redeemedRes.count ?? 0,
  };
}

/** Distinct batches over alle codes, meest recent eerst. */
export async function listTrialCodeBatches(): Promise<TrialCodeBatchOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_codes")
    .select("batch_id, batch_label, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listTrialCodeBatches] query failed", error);
    return [];
  }

  const seen = new Set<string>();
  const batches: TrialCodeBatchOption[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.batch_id)) continue;
    seen.add(row.batch_id);
    batches.push({
      batchId: row.batch_id,
      label: row.batch_label || row.batch_id.slice(0, 8),
    });
  }
  return batches;
}

export async function listTrialCodes(params: {
  status: TrialCodeStatusFilter;
  batchId?: string;
  q?: string;
}): Promise<TrialCodeRow[]> {
  const admin = createAdminClient();

  let query = admin
    .from("trial_codes")
    .select(TRIAL_CODE_SELECT)
    .order("created_at", { ascending: false });

  if (params.status !== "all") {
    query = query.eq("status", params.status);
  }
  if (params.batchId) {
    query = query.eq("batch_id", params.batchId);
  }

  const { data, error } = await query.returns<RawTrialCodeRow[]>();
  if (error) {
    console.error("[listTrialCodes] query failed", error);
    return [];
  }

  const rows = data ?? [];
  const nowMs = Date.now();

  const codeIds = rows.map((r) => r.id);
  const batchIds = Array.from(new Set(rows.map((r) => r.batch_id)));

  // Read-only lookup in tmc.events voor twee dingen die niet uit de
  // trial_codes-rij zelf zijn af te leiden: een teruggegeven code (de
  // release-trigger zet 'm terug naar 'active', ononderscheidbaar van
  // een nooit-gebruikte code) en het intrek-moment (geen revoked_at-
  // kolom op trial_codes). Schrijft niets, leest alleen.
  const [releaseEventsRes, revokeEventsRes, batchRevokeEventsRes] = await Promise.all([
    codeIds.length
      ? admin
          .from("events")
          .select("subject_id, created_at")
          .eq("type", "trial_code.released")
          .in("subject_id", codeIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { subject_id: string; created_at: string }[] }),
    codeIds.length
      ? admin
          .from("events")
          .select("subject_id, created_at")
          .eq("type", "trial_code.revoked")
          .in("subject_id", codeIds)
      : Promise.resolve({ data: [] as { subject_id: string; created_at: string }[] }),
    batchIds.length
      ? admin
          .from("events")
          .select("subject_id, created_at")
          .eq("type", "trial_code.batch_revoked")
          .in("subject_id", batchIds)
      : Promise.resolve({ data: [] as { subject_id: string; created_at: string }[] }),
  ]);

  const releasedAtByCode = new Map<string, string>();
  for (const e of releaseEventsRes.data ?? []) {
    // Al aflopend gesorteerd op created_at: de eerste treffer per code is
    // de meest recente release.
    if (!releasedAtByCode.has(e.subject_id)) {
      releasedAtByCode.set(e.subject_id, e.created_at);
    }
  }
  const revokedAtByCode = new Map<string, string>();
  for (const e of revokeEventsRes.data ?? []) {
    revokedAtByCode.set(e.subject_id, e.created_at);
  }
  const batchRevokedAtByBatch = new Map<string, string>();
  for (const e of batchRevokeEventsRes.data ?? []) {
    batchRevokedAtByBatch.set(e.subject_id, e.created_at);
  }

  let mapped: TrialCodeRow[] = rows.map((r) => {
    const booking = firstOf(r.trial_booking);
    const session = booking ? firstOf(booking.session) : null;
    const classType = session ? firstOf(session.class_type) : null;
    const status = r.status as TrialCodeRow["status"];

    return {
      id: r.id,
      code: r.code,
      pillar: r.pillar,
      batchId: r.batch_id,
      batchLabel: r.batch_label,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      status,
      redeemedAt: r.redeemed_at,
      isExpired: status === "active" && new Date(r.expires_at).getTime() <= nowMs,
      releasedAt: status === "active" ? (releasedAtByCode.get(r.id) ?? null) : null,
      revokedAt:
        status === "revoked"
          ? (revokedAtByCode.get(r.id) ?? batchRevokedAtByBatch.get(r.batch_id) ?? null)
          : null,
      redeemer: booking
        ? {
            name: booking.name,
            email: booking.email,
            phone: booking.phone,
            sessionStartAt: session?.start_at ?? null,
            sessionEndAt: session?.end_at ?? null,
            sessionPillar: session?.pillar ?? null,
            className: classType?.name ?? null,
          }
        : null,
    };
  });

  const q = params.q?.trim().toLowerCase();
  if (q) {
    mapped = mapped.filter((r) => {
      if (r.code.toLowerCase().includes(q)) return true;
      if (r.batchLabel?.toLowerCase().includes(q)) return true;
      if (r.redeemer?.name.toLowerCase().includes(q)) return true;
      if (r.redeemer?.email.toLowerCase().includes(q)) return true;
      return false;
    });
  }

  return mapped;
}
