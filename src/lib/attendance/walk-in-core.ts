import type { SupabaseClient } from "@supabase/supabase-js";
import { isoDateAmsterdam } from "@/lib/format-date";
import { PILLAR_LABELS, planCovers, type Pillar } from "@/lib/member/plan-coverage";
import { setMemberAttendance, type AttendanceActor, type AttendanceDeps } from "./core";

/**
 * Walk-in vanuit de deelnemerslijst (fase-2-checkin-model.md, check-in-spoor
 * PR 3): een trainer of admin voegt een bestaand lid ter plekke aan een
 * groepsles toe en checkt het direct in. De regels staan in de database
 * (tmc.book_walk_in en tmc.undo_walk_in, migratie 20261022120000); hier
 * alleen het venster voor de knop, de zoeklijst met statusregel, en de
 * koppeling met de aanwezigheidskern. Geen auth: de server actions doen de
 * gate (authorizeForSession) en geven de actor door. Alles via deps, zodat
 * scripts/attendance/walk-in.test.mts zonder database draait.
 *
 * Volgorde bij toevoegen: RPC als de ingelogde gebruiker (auth.uid() is de
 * gate in de database), daarna setMemberAttendance met present true, method
 * admin_web, source walk_in. De RPC geeft bij een bestaande boeking
 * already_booked met de booking_id terug; dan wordt alleen ingecheckt.
 *
 * Volgorde bij ongedaan maken: eerst setMemberAttendance met present false
 * (de kern weigert op een geannuleerde boeking), dan de RPC die annuleert en
 * de rit terugboekt. Faalt de RPC, dan wordt de check-in hersteld.
 */

/** Minuten voor de start waarop de knop verschijnt (mockups/kiosk-prototype.html). */
export const WALK_IN_OPENS_BEFORE_MINUTES = 15;

export type WalkInWindow = "before" | "open" | "closed";

/**
 * Het venster: vanaf 15 minuten voor de start tot het einde van de dag van
 * de sessie in Europe/Amsterdam. Spiegel van de check in tmc.book_walk_in.
 */
export function walkInWindow(startAtIso: string, now: Date): WalkInWindow {
  const start = new Date(startAtIso);
  if (now.getTime() < start.getTime() - WALK_IN_OPENS_BEFORE_MINUTES * 60_000) {
    return "before";
  }
  if (isoDateAmsterdam(now) !== isoDateAmsterdam(start)) return "closed";
  return "open";
}

/**
 * Weigerredenen uit tmc.book_walk_in (eigen plus die van booking_gate) en
 * tmc.undo_walk_in, plus de TS-kant. De RPC is leidend; de statusregel in
 * de zoeklijst is een indicatie.
 */
export type WalkInReason =
  | "unauthorized"
  | "profile_not_found"
  | "session_not_found"
  | "not_a_class"
  | "session_not_scheduled"
  | "outside_window"
  | "already_booked"
  | "age_mismatch"
  | "booking_window_closed"
  | "daily_cap_reached"
  | "no_coverage"
  | "weekly_cap_reached"
  | "credit_failed"
  | "not_a_walk_in"
  | "not_booked"
  | "booking_not_found"
  | "attendance_failed"
  | "db_error";

// COPY: confirm met Marlon
export const WALK_IN_REASON_COPY: Record<WalkInReason, string> = {
  unauthorized: "Geen toegang tot deze les.",
  profile_not_found: "Lid niet gevonden.",
  session_not_found: "Les niet gevonden.",
  not_a_class: "Walk-in werkt alleen bij groepslessen.",
  session_not_scheduled: "Deze les is geannuleerd.",
  outside_window: "Walk-in kan vanaf 15 minuten voor de start, tot het einde van de dag.",
  already_booked: "Staat al op de lijst.",
  age_mismatch: "Deze les is niet voor de leeftijdscategorie van dit lid.",
  booking_window_closed: "Deze les is nog niet open voor boekingen.",
  daily_cap_reached: "Dit lid heeft vandaag al het maximale aantal lessen.",
  no_coverage: "Geen geldig abonnement of rittenkaart voor deze les.",
  weekly_cap_reached: "Dit lid zit deze week aan de weeklimiet.",
  credit_failed: "De rit kon niet worden afgeschreven. Niets is gewijzigd.",
  not_a_walk_in: "Dit is geen walk-in-boeking.",
  not_booked: "Deze boeking is al geannuleerd.",
  booking_not_found: "Boeking niet gevonden.",
  attendance_failed: "Toegevoegd, maar inchecken lukte niet. Vink het lid handmatig aan.",
  db_error: "Toevoegen lukte niet. Probeer het opnieuw.",
};

export function walkInReasonCopy(reason: string | null | undefined): string {
  return WALK_IN_REASON_COPY[(reason ?? "db_error") as WalkInReason] ?? WALK_IN_REASON_COPY.db_error;
}

export interface WalkInDeps extends AttendanceDeps {
  /** Cookie-client van de ingelogde staf (createClient()); auth.uid() is de gate in de RPC. */
  user: Pick<SupabaseClient, "rpc">;
}

type RpcError = { code?: string; message?: string } | null;

function reasonFromRpcError(error: RpcError): WalkInReason {
  if (!error) return "db_error";
  if (error.code === "42501") return "unauthorized";
  if (typeof error.message === "string" && error.message.startsWith("walk_in_credit_failed")) {
    return "credit_failed";
  }
  if (typeof error.message === "string" && error.message.startsWith("walk_in_refund_failed")) {
    return "credit_failed";
  }
  return "db_error";
}

export type AddWalkInResult =
  | {
      ok: true;
      bookingId: string;
      /** True als het lid al geboekt stond; dan is er alleen ingecheckt. */
      alreadyBooked: boolean;
      creditsUsed: number;
    }
  | { ok: false; reason: WalkInReason; message: string };

interface BookWalkInRpc {
  ok: boolean;
  reason?: string;
  booking_id?: string;
  credits_used?: number;
}

export async function addWalkInCore(
  deps: WalkInDeps,
  input: { sessionId: string; profileId: string; actor: AttendanceActor },
): Promise<AddWalkInResult> {
  const { data, error } = await deps.user.rpc("book_walk_in", {
    p_session_id: input.sessionId,
    p_profile_id: input.profileId,
  });
  if (error) {
    console.error("[addWalkIn] rpc failed", error);
    const reason = reasonFromRpcError(error as RpcError);
    return { ok: false, reason, message: WALK_IN_REASON_COPY[reason] };
  }
  const res = (data ?? { ok: false }) as BookWalkInRpc;
  if (!res.ok || !res.booking_id) {
    const reason = (res.reason ?? "db_error") as WalkInReason;
    return { ok: false, reason, message: walkInReasonCopy(reason) };
  }

  const attendance = await setMemberAttendance(
    { admin: deps.admin, emit: deps.emit },
    {
      sessionId: input.sessionId,
      bookingId: res.booking_id,
      present: true,
      actor: input.actor,
      method: "admin_web",
      source: "walk_in",
    },
  );
  if (!attendance.ok) {
    // De boeking staat; de trainer kan het vinkje zelf zetten.
    console.error("[addWalkIn] attendance failed", attendance.reason);
    return { ok: false, reason: "attendance_failed", message: WALK_IN_REASON_COPY.attendance_failed };
  }

  return {
    ok: true,
    bookingId: res.booking_id,
    alreadyBooked: res.reason === "already_booked",
    creditsUsed: res.credits_used ?? 0,
  };
}

export type UndoWalkInResult =
  | { ok: true; bookingId: string; creditsRefunded: number }
  | { ok: false; reason: WalkInReason; message: string };

interface UndoWalkInRpc {
  ok: boolean;
  reason?: string;
  booking_id?: string;
  credits_refunded?: number;
}

export async function undoWalkInCore(
  deps: WalkInDeps,
  input: { sessionId: string; bookingId: string; actor: AttendanceActor },
): Promise<UndoWalkInResult> {
  const attendanceDeps = { admin: deps.admin, emit: deps.emit };
  const reverted = await setMemberAttendance(attendanceDeps, {
    sessionId: input.sessionId,
    bookingId: input.bookingId,
    present: false,
    actor: input.actor,
    source: "walk_in_undo",
  });
  if (!reverted.ok) {
    const reason: WalkInReason =
      reverted.reason === "booking_cancelled" ? "not_booked" : "booking_not_found";
    return { ok: false, reason, message: WALK_IN_REASON_COPY[reason] };
  }

  const { data, error } = await deps.user.rpc("undo_walk_in", {
    p_booking_id: input.bookingId,
  });
  const res = (data ?? { ok: false }) as UndoWalkInRpc;
  if (error || !res.ok) {
    if (error) console.error("[undoWalkIn] rpc failed", error);
    // Check-in terugzetten zodat de lijst weer klopt met de database.
    await setMemberAttendance(attendanceDeps, {
      sessionId: input.sessionId,
      bookingId: input.bookingId,
      present: true,
      actor: input.actor,
      method: "admin_web",
      source: "walk_in_undo_restored",
    });
    const reason = error
      ? reasonFromRpcError(error as RpcError)
      : ((res.reason ?? "db_error") as WalkInReason);
    return { ok: false, reason, message: walkInReasonCopy(reason) };
  }

  return { ok: true, bookingId: input.bookingId, creditsRefunded: res.credits_refunded ?? 0 };
}

// ---------------------------------------------------------------------------
// Zoeklijst
// ---------------------------------------------------------------------------

export type WalkInCandidateState = "eligible" | "on_list" | "no_coverage";

export interface WalkInCandidate {
  profileId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  state: WalkInCandidateState;
  /** Statusregel onder de naam. Indicatie; de RPC is leidend. */
  statusLabel: string;
}

export const WALK_IN_SEARCH_MIN_CHARS = 2;
export const WALK_IN_SEARCH_LIMIT = 10;

/** PostgREST or-filter: komma's en haakjes breken de syntax, LIKE-tekens escapen. */
function searchPattern(q: string): string {
  const cleaned = q.replace(/[,()]/g, "").replace(/[\\%_]/g, (m) => `\\${m}`);
  return `${cleaned}%`;
}

interface CandidateMembership {
  plan_type: string | null;
  status: string | null;
  credits_remaining: number | null;
  credits_expires_at: string | null;
  cancellation_effective_date: string | null;
  pause_effective_date: string | null;
  start_date: string | null;
}

interface CandidateRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email: string | null;
  memberships: CandidateMembership[] | null;
}

// COPY: confirm met Marlon
const PLAN_LABEL: Record<string, string> = {
  vrij_trainen: "Vrij trainen",
  yoga_mobility: "Yoga & mobility",
  kettlebell: "Kettlebell",
  groepslessen: "Groepslessen",
  all_inclusive: "All Access",
  kids: "Kids",
  senior: "Senior",
  twelve_week_program: "12-weken programma",
};

/**
 * Dezelfde dekkingskeuze als tmc.booking_gate, zonder lock: actief of
 * opgezegd met effective date op of na de sessiedatum, geen pauze op of voor
 * de sessiedatum, plan dekt de pillar, rittenkaart met ritten en niet
 * verlopen. Abonnement wint van rittenkaart, dan nieuwste start_date.
 */
export function coverageLabel(
  memberships: CandidateMembership[],
  pillar: string,
  sessionDateIso: string,
  todayIso: string,
): { covered: boolean; label: string } {
  const eligible = memberships.filter((m) => {
    const statusOk =
      m.status === "active" ||
      (m.status === "cancellation_requested" &&
        m.cancellation_effective_date !== null &&
        m.cancellation_effective_date >= sessionDateIso);
    if (!statusOk) return false;
    if (m.pause_effective_date !== null && sessionDateIso >= m.pause_effective_date) return false;
    if (!m.plan_type || !planCovers(m.plan_type, pillar)) return false;
    if (m.plan_type === "ten_ride_card") {
      if ((m.credits_remaining ?? 0) <= 0) return false;
      if (m.credits_expires_at !== null && m.credits_expires_at < todayIso) return false;
    }
    return true;
  });
  eligible.sort((a, b) => {
    const cardA = a.plan_type === "ten_ride_card" ? 1 : 0;
    const cardB = b.plan_type === "ten_ride_card" ? 1 : 0;
    if (cardA !== cardB) return cardA - cardB;
    return (b.start_date ?? "").localeCompare(a.start_date ?? "");
  });
  const covering = eligible[0];
  if (!covering) {
    // COPY: confirm met Marlon
    const pillarLabel = PILLAR_LABELS[pillar as Pillar] ?? pillar;
    return { covered: false, label: `Geen dekking voor ${pillarLabel}` };
  }
  if (covering.plan_type === "ten_ride_card") {
    const left = covering.credits_remaining ?? 0;
    // COPY: confirm met Marlon
    return { covered: true, label: `Rittenkaart, ${left} ${left === 1 ? "rit" : "ritten"} over` };
  }
  // COPY: confirm met Marlon
  return { covered: true, label: `Abonnement ${PLAN_LABEL[covering.plan_type ?? ""] ?? covering.plan_type}` };
}

export async function searchWalkInMembersCore(
  admin: SupabaseClient,
  input: {
    pillar: string;
    /** Sessiedatum zoals booking_gate die rekent (UTC-datum van start_at). */
    sessionDateIso: string;
    query: string;
    /** Profielen die al met status booked op de lijst staan. */
    onListProfileIds: ReadonlySet<string>;
    now?: Date;
  },
): Promise<WalkInCandidate[]> {
  const q = input.query.trim();
  if (q.length < WALK_IN_SEARCH_MIN_CHARS) return [];
  const pattern = searchPattern(q);

  // Service role, want een trainer leest via RLS alleen zijn eigen profiel.
  // Bewust geen e-mail, telefoon of member_code in het resultaat.
  const { data, error } = await admin
    .from("profiles")
    .select(
      `id, first_name, last_name, avatar_url, email,
       memberships(plan_type, status, credits_remaining, credits_expires_at,
                   cancellation_effective_date, pause_effective_date, start_date)`,
    )
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
    .order("first_name", { ascending: true })
    .limit(40);
  if (error) {
    console.error("[searchWalkInMembers]", error);
    return [];
  }

  const todayIso = (input.now ?? new Date()).toISOString().slice(0, 10);
  const rows = ((data ?? []) as CandidateRow[])
    // Walk-in-placeholderaccounts van het oude pad (walkin-*@walkin.tmc.internal)
    // zijn geen leden met dekking.
    .filter((r) => !/\.internal$/i.test(r.email ?? ""))
    // Alleen leden: minstens een lopend of opgezegd-maar-nog-geldig lidmaatschap.
    .filter((r) =>
      (r.memberships ?? []).some(
        (m) => m.status === "active" || m.status === "cancellation_requested" || m.status === "paused",
      ),
    );

  return rows.slice(0, WALK_IN_SEARCH_LIMIT).map((r) => {
    if (input.onListProfileIds.has(r.id)) {
      return {
        profileId: r.id,
        firstName: r.first_name ?? "",
        lastName: r.last_name ?? "",
        avatarUrl: r.avatar_url ?? null,
        state: "on_list" as const,
        // COPY: confirm met Marlon
        statusLabel: "Staat al op de lijst",
      };
    }
    const cov = coverageLabel(r.memberships ?? [], input.pillar, input.sessionDateIso, todayIso);
    return {
      profileId: r.id,
      firstName: r.first_name ?? "",
      lastName: r.last_name ?? "",
      avatarUrl: r.avatar_url ?? null,
      state: cov.covered ? ("eligible" as const) : ("no_coverage" as const),
      statusLabel: cov.label,
    };
  });
}
