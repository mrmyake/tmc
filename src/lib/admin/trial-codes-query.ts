import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Leesqueries voor de admin-pagina proefcodes (spec-community-growth.md §1
 * "Proefcodes"). Service-role, alleen lezen; schrijven loopt via de RPC's
 * in trial-codes-actions.ts.
 */

export type TrialCodeStatus = "active" | "exhausted" | "revoked";
export type TrialCodeStatusFilter = TrialCodeStatus | "all";

export interface TrialCodeRow {
  id: string;
  code: string;
  label: string;
  /** null = onbeperkt, 1 = eenmalig, >1 = X keer. */
  maxUses: number | null;
  usesCount: number;
  status: TrialCodeStatus;
  createdAt: string;
  createdByName: string | null;
  revokedAt: string | null;
  revokedByName: string | null;
  /** Aantal inwisselingen ooit, inclusief teruggegeven (geannuleerde). */
  redemptionsTotal: number;
}

export interface TrialCodeRedemptionRow {
  id: string;
  trialBookingId: string;
  name: string;
  email: string;
  phone: string;
  bookingStatus: string;
  redeemedAt: string;
  releasedAt: string | null;
  sessionId: string;
  sessionStartAt: string | null;
  sessionEndAt: string | null;
  className: string | null;
  /** Aantal gratis proeflessen van dit e-mailadres over alle codes heen. */
  emailFreeCount: number;
  /** Boeking staat op 'paid' en de les is nog niet begonnen: admin mag annuleren. */
  canCancel: boolean;
}

export interface TrialCodeDetail extends TrialCodeRow {
  redemptions: TrialCodeRedemptionRow[];
}

export interface TrialCodeKpis {
  activeNow: number;
  exhausted: number;
  revoked: number;
  redemptionsOpen: number;
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function deriveStatus(row: {
  revoked_at: string | null;
  max_uses: number | null;
  uses_count: number;
}): TrialCodeStatus {
  if (row.revoked_at) return "revoked";
  if (row.max_uses !== null && row.uses_count >= row.max_uses) return "exhausted";
  return "active";
}

type RawProfile = { first_name: string | null } | { first_name: string | null }[] | null;

type RawTrialCodeRow = {
  id: string;
  code: string;
  label: string;
  max_uses: number | null;
  uses_count: number;
  created_at: string;
  revoked_at: string | null;
  created_by_profile: RawProfile;
  revoked_by_profile: RawProfile;
};

// Twee FK's van trial_codes naar profiles (created_by en revoked_by):
// PostgREST kan de relatie niet raden zonder de expliciete FK-naam.
const TRIAL_CODE_SELECT = `
  id, code, label, max_uses, uses_count, created_at, revoked_at,
  created_by_profile:profiles!trial_codes_created_by_fkey(first_name),
  revoked_by_profile:profiles!trial_codes_revoked_by_fkey(first_name)
`;

async function redemptionTotals(codeIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (codeIds.length === 0) return totals;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_code_redemptions")
    .select("code_id")
    .in("code_id", codeIds);
  if (error) {
    console.error("[trial-codes-query] redemption totals failed", error);
    return totals;
  }
  for (const r of data ?? []) {
    totals.set(r.code_id, (totals.get(r.code_id) ?? 0) + 1);
  }
  return totals;
}

function mapRow(r: RawTrialCodeRow, redemptionsTotal: number): TrialCodeRow {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    maxUses: r.max_uses,
    usesCount: r.uses_count,
    status: deriveStatus(r),
    createdAt: r.created_at,
    createdByName: firstOf(r.created_by_profile)?.first_name ?? null,
    revokedAt: r.revoked_at,
    revokedByName: firstOf(r.revoked_by_profile)?.first_name ?? null,
    redemptionsTotal,
  };
}

/** Altijd over de volledige tabel geteld, ongeacht de filters eronder. */
export async function getTrialCodeKpis(): Promise<TrialCodeKpis> {
  const admin = createAdminClient();
  const [codesRes, openRes] = await Promise.all([
    admin.from("trial_codes").select("revoked_at, max_uses, uses_count"),
    admin
      .from("trial_code_redemptions")
      .select("id", { count: "exact", head: true })
      .is("released_at", null),
  ]);

  const kpis: TrialCodeKpis = {
    activeNow: 0,
    exhausted: 0,
    revoked: 0,
    redemptionsOpen: openRes.count ?? 0,
  };
  for (const row of codesRes.data ?? []) {
    const status = deriveStatus(row);
    if (status === "active") kpis.activeNow += 1;
    else if (status === "exhausted") kpis.exhausted += 1;
    else kpis.revoked += 1;
  }
  return kpis;
}

export async function listTrialCodes(params: {
  status: TrialCodeStatusFilter;
  q?: string;
}): Promise<TrialCodeRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_codes")
    .select(TRIAL_CODE_SELECT)
    .order("created_at", { ascending: false })
    .returns<RawTrialCodeRow[]>();

  if (error) {
    console.error("[listTrialCodes] query failed", error);
    return [];
  }

  const rows = data ?? [];
  const totals = await redemptionTotals(rows.map((r) => r.id));

  let mapped = rows.map((r) => mapRow(r, totals.get(r.id) ?? 0));

  if (params.status !== "all") {
    mapped = mapped.filter((r) => r.status === params.status);
  }

  const q = params.q?.trim().toLowerCase();
  if (q) {
    const qCode = q.replace(/[\s-]/g, "");
    mapped = mapped.filter(
      (r) =>
        (qCode.length > 0 && r.code.toLowerCase().includes(qCode)) ||
        r.label.toLowerCase().includes(q),
    );
  }

  return mapped;
}

type RawSession = {
  start_at: string;
  end_at: string;
  class_type: { name: string } | { name: string }[] | null;
};

type RawBooking = { name: string; email: string; phone: string; status: string };

type RawRedemptionRow = {
  id: string;
  trial_booking_id: string;
  session_id: string;
  email_normalized: string;
  redeemed_at: string;
  released_at: string | null;
  booking: RawBooking | RawBooking[] | null;
  session: RawSession | RawSession[] | null;
};

export async function getTrialCodeDetail(id: string): Promise<TrialCodeDetail | null> {
  const admin = createAdminClient();

  const { data: code, error } = await admin
    .from("trial_codes")
    .select(TRIAL_CODE_SELECT)
    .eq("id", id)
    .maybeSingle<RawTrialCodeRow>();

  if (error) {
    console.error("[getTrialCodeDetail] query failed", error);
    return null;
  }
  if (!code) return null;

  const { data: redemptions, error: redErr } = await admin
    .from("trial_code_redemptions")
    .select(
      `
        id, trial_booking_id, session_id, email_normalized, redeemed_at, released_at,
        booking:trial_bookings(name, email, phone, status),
        session:class_sessions(start_at, end_at, class_type:class_types(name))
      `,
    )
    .eq("code_id", id)
    .order("redeemed_at", { ascending: false })
    .returns<RawRedemptionRow[]>();

  if (redErr) {
    console.error("[getTrialCodeDetail] redemptions failed", redErr);
  }

  const rows = redemptions ?? [];

  // Markering: e-mailadressen die over alle codes heen meer dan een gratis
  // proefles hebben geboekt (inclusief geannuleerde).
  const emails = Array.from(new Set(rows.map((r) => r.email_normalized)));
  const emailCounts = new Map<string, number>();
  if (emails.length > 0) {
    const { data: all } = await admin
      .from("trial_code_redemptions")
      .select("email_normalized")
      .in("email_normalized", emails);
    for (const r of all ?? []) {
      emailCounts.set(r.email_normalized, (emailCounts.get(r.email_normalized) ?? 0) + 1);
    }
  }

  const nowMs = Date.now();
  const mappedRedemptions: TrialCodeRedemptionRow[] = rows.map((r) => {
    const booking = firstOf(r.booking);
    const session = firstOf(r.session);
    const classType = session ? firstOf(session.class_type) : null;
    const startAt = session?.start_at ?? null;
    const bookingStatus = booking?.status ?? "unknown";
    return {
      id: r.id,
      trialBookingId: r.trial_booking_id,
      name: booking?.name ?? "?",
      email: booking?.email ?? r.email_normalized,
      phone: booking?.phone ?? "",
      bookingStatus,
      redeemedAt: r.redeemed_at,
      releasedAt: r.released_at,
      sessionId: r.session_id,
      sessionStartAt: startAt,
      sessionEndAt: session?.end_at ?? null,
      className: classType?.name ?? null,
      emailFreeCount: emailCounts.get(r.email_normalized) ?? 1,
      canCancel:
        bookingStatus === "paid" &&
        r.released_at === null &&
        startAt !== null &&
        new Date(startAt).getTime() > nowMs,
    };
  });

  return {
    ...mapRow(code, rows.length),
    redemptions: mappedRedemptions,
  };
}
