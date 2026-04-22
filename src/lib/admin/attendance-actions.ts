"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AttendanceStatus = "booked" | "attended" | "no_show" | "cancelled";

export interface SessionSummary {
  id: string;
  classTypeName: string;
  trainerName: string;
  pillar: string;
  startAt: string;
  endAt: string;
  capacity: number;
  status: "scheduled" | "cancelled" | "completed";
}

export interface ParticipantRow {
  bookingId: string;
  profileId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  planType: string | null;
  planVariant: string | null;
  membershipId: string | null;
  creditsUsed: number;
  creditsRemaining: number | null;
  status: AttendanceStatus;
  bookedAt: string;
  attendedAt: string | null;
}

export type AttendanceActionResult =
  | { ok: true; message: string; data?: unknown }
  | { ok: false; message: string };

// ----------------------------------------------------------------------------
// Authorization: admin OR trainer-of-this-session
// ----------------------------------------------------------------------------

interface AuthContext {
  userId: string;
  role: "admin" | "trainer";
}

async function authorizeForSession(
  sessionId: string,
): Promise<{ ok: true; ctx: AuthContext } | { ok: false; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") {
    return { ok: true, ctx: { userId: user.id, role: "admin" } };
  }

  if (profile?.role !== "trainer") {
    return { ok: false, message: "Geen toegang." };
  }

  // Trainer — must own this session.
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("class_sessions")
    .select("id, trainer:trainers!inner(profile_id)")
    .eq("id", sessionId)
    .maybeSingle();

  type TrainerRef = { profile_id: string };
  const trainer = (
    Array.isArray(session?.trainer) ? session?.trainer[0] : session?.trainer
  ) as TrainerRef | null | undefined;
  if (!session || trainer?.profile_id !== user.id) {
    return { ok: false, message: "Geen toegang tot deze sessie." };
  }

  return { ok: true, ctx: { userId: user.id, role: "trainer" } };
}

// ----------------------------------------------------------------------------
// Load participants
// ----------------------------------------------------------------------------

export async function loadParticipants(
  sessionId: string,
): Promise<
  | { ok: true; session: SessionSummary; participants: ParticipantRow[] }
  | { ok: false; message: string }
> {
  const auth = await authorizeForSession(sessionId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const [sessionRes, bookingsRes] = await Promise.all([
    admin
      .from("class_sessions")
      .select(
        `
          id, start_at, end_at, capacity, pillar, status,
          class_type:class_types(name),
          trainer:trainers(display_name)
        `,
      )
      .eq("id", sessionId)
      .maybeSingle(),
    admin
      .from("bookings")
      .select(
        `
          id, profile_id, status, credits_used, membership_id, booked_at, attended_at,
          profile:profiles(first_name, last_name, avatar_url),
          membership:memberships(plan_type, plan_variant, credits_remaining)
        `,
      )
      .eq("session_id", sessionId)
      .in("status", ["booked", "attended", "no_show", "cancelled"])
      .order("booked_at", { ascending: true }),
  ]);

  const row = sessionRes.data;
  if (!row) return { ok: false, message: "Sessie niet gevonden." };

  type ClassTypeRef = { name: string | null };
  type TrainerRef = { display_name: string | null };
  const classType = (
    Array.isArray(row.class_type) ? row.class_type[0] : row.class_type
  ) as ClassTypeRef | null;
  const trainer = (
    Array.isArray(row.trainer) ? row.trainer[0] : row.trainer
  ) as TrainerRef | null;

  const session: SessionSummary = {
    id: row.id,
    classTypeName: classType?.name ?? "Sessie",
    trainerName: trainer?.display_name ?? "—",
    pillar: row.pillar,
    startAt: row.start_at,
    endAt: row.end_at,
    capacity: row.capacity,
    status: row.status,
  };

  type ProfileRef = {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
  type MembershipRef = {
    plan_type: string | null;
    plan_variant: string | null;
    credits_remaining: number | null;
  };

  const participants: ParticipantRow[] = (bookingsRes.data ?? []).map((b) => {
    const p = (Array.isArray(b.profile) ? b.profile[0] : b.profile) as
      | ProfileRef
      | null;
    const m = (
      Array.isArray(b.membership) ? b.membership[0] : b.membership
    ) as MembershipRef | null;
    return {
      bookingId: b.id,
      profileId: b.profile_id,
      firstName: p?.first_name ?? "",
      lastName: p?.last_name ?? "",
      avatarUrl: p?.avatar_url ?? null,
      planType: m?.plan_type ?? null,
      planVariant: m?.plan_variant ?? null,
      membershipId: b.membership_id,
      creditsUsed: b.credits_used ?? 0,
      creditsRemaining: m?.credits_remaining ?? null,
      status: b.status as AttendanceStatus,
      bookedAt: b.booked_at,
      attendedAt: b.attended_at,
    };
  });

  return { ok: true, session, participants };
}

// ----------------------------------------------------------------------------
// Mark attendance (bulk)
// ----------------------------------------------------------------------------

interface AttendanceInput {
  bookingId: string;
  status: "attended" | "booked" | "no_show";
}

const STRIKE_WINDOW_DAYS = 30;

async function writeStrikesForNewNoShows(
  admin: ReturnType<typeof createAdminClient>,
  affected: Array<{ id: string; profile_id: string; prevStatus: string }>,
) {
  const newNoShows = affected.filter((a) => a.prevStatus !== "no_show");
  if (newNoShows.length === 0) return;

  const now = new Date();
  const expires = new Date(
    now.getTime() + STRIKE_WINDOW_DAYS * 86_400_000,
  ).toISOString();
  const rows = newNoShows.map((a) => ({
    profile_id: a.profile_id,
    booking_id: a.id,
    occurred_at: now.toISOString(),
    expires_at: expires,
  }));
  const { error } = await admin.from("no_show_strikes").insert(rows);
  if (error) {
    console.error("[markAttendance] strike insert failed", error);
  }
}

export async function markAttendance(
  sessionId: string,
  attendances: AttendanceInput[],
): Promise<AttendanceActionResult> {
  if (!sessionId) return { ok: false, message: "Geen sessie." };
  if (attendances.length === 0) {
    return { ok: true, message: "Geen wijzigingen." };
  }

  const auth = await authorizeForSession(sessionId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  // Fetch current bookings for this session so we can validate each id belongs
  // to the session and detect which updates introduce a new no_show strike.
  const ids = attendances.map((a) => a.bookingId);
  const { data: existing, error: exErr } = await admin
    .from("bookings")
    .select("id, session_id, profile_id, status")
    .in("id", ids);

  if (exErr) {
    console.error("[markAttendance] fetch failed", exErr);
    return { ok: false, message: "Kon boekingen niet laden." };
  }

  const byId = new Map(
    (existing ?? []).map((b) => [
      b.id,
      {
        sessionId: b.session_id,
        profileId: b.profile_id,
        status: b.status as string,
      },
    ]),
  );

  const nowIso = new Date().toISOString();
  const newStrikeRows: Array<{
    id: string;
    profile_id: string;
    prevStatus: string;
  }> = [];

  for (const a of attendances) {
    const cur = byId.get(a.bookingId);
    if (!cur) return { ok: false, message: "Boeking niet gevonden." };
    if (cur.sessionId !== sessionId) {
      return { ok: false, message: "Boeking hoort niet bij deze sessie." };
    }
    // Can't mark cancelled bookings.
    if (cur.status === "cancelled") continue;

    const patch: Record<string, unknown> = { status: a.status };
    if (a.status === "attended") patch.attended_at = nowIso;
    if (a.status === "booked") patch.attended_at = null;

    const { error } = await admin
      .from("bookings")
      .update(patch)
      .eq("id", a.bookingId);

    if (error) {
      console.error("[markAttendance] update failed", error);
      return { ok: false, message: "Bijwerken lukte niet." };
    }

    if (a.status === "no_show") {
      newStrikeRows.push({
        id: a.bookingId,
        profile_id: cur.profileId,
        prevStatus: cur.status,
      });
    }
  }

  await writeStrikesForNewNoShows(admin, newStrikeRows);

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/rooster");
  revalidatePath(`/app/admin/sessies/${sessionId}`);
  revalidatePath(`/app/trainer/sessies/${sessionId}`);

  return { ok: true, message: "Aanwezigheid opgeslagen." };
}

// ----------------------------------------------------------------------------
// Auto-mark no-shows (all remaining `booked` on ended session)
// ----------------------------------------------------------------------------

export async function autoMarkNoShows(
  sessionId: string,
): Promise<AttendanceActionResult> {
  const auth = await authorizeForSession(sessionId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("class_sessions")
    .select("id, end_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { ok: false, message: "Sessie niet gevonden." };
  if (new Date(session.end_at).getTime() > Date.now()) {
    return {
      ok: false,
      message: "Sessie is nog niet afgelopen.",
    };
  }

  const { data: remaining } = await admin
    .from("bookings")
    .select("id, profile_id, status")
    .eq("session_id", sessionId)
    .eq("status", "booked");

  if (!remaining || remaining.length === 0) {
    return { ok: true, message: "Geen open boekingen meer." };
  }

  const nowIso = new Date().toISOString();

  const { error } = await admin
    .from("bookings")
    .update({ status: "no_show", attended_at: null, cancelled_at: nowIso })
    .in(
      "id",
      remaining.map((r) => r.id),
    );

  if (error) {
    console.error("[autoMarkNoShows] update failed", error);
    return { ok: false, message: "Kon geen no-shows markeren." };
  }

  await writeStrikesForNewNoShows(
    admin,
    remaining.map((r) => ({
      id: r.id,
      profile_id: r.profile_id,
      prevStatus: r.status,
    })),
  );

  revalidatePath(`/app/admin/sessies/${sessionId}`);
  revalidatePath(`/app/trainer/sessies/${sessionId}`);

  return {
    ok: true,
    message: `${remaining.length} boeking(en) als no-show gemarkeerd.`,
  };
}

// ----------------------------------------------------------------------------
// Refund credit (admin only, audit-logged)
// ----------------------------------------------------------------------------

export async function refundCredit(
  bookingId: string,
  reason: string,
): Promise<AttendanceActionResult> {
  const trimmed = reason?.trim();
  if (!trimmed) return { ok: false, message: "Geef een reden op." };

  // Admin-only.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { ok: false, message: "Geen toegang." };
  }

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, session_id, membership_id, credits_used")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { ok: false, message: "Boeking niet gevonden." };
  if (!booking.membership_id || !booking.credits_used) {
    return {
      ok: false,
      message: "Deze boeking gebruikte geen credits.",
    };
  }

  const { data: membership } = await admin
    .from("memberships")
    .select("id, credits_remaining")
    .eq("id", booking.membership_id)
    .maybeSingle();

  if (!membership) {
    return { ok: false, message: "Abonnement niet gevonden." };
  }

  const newBalance =
    (membership.credits_remaining ?? 0) + booking.credits_used;

  const { error: mErr } = await admin
    .from("memberships")
    .update({ credits_remaining: newBalance })
    .eq("id", membership.id);

  if (mErr) {
    console.error("[refundCredit] membership update failed", mErr);
    return { ok: false, message: "Credit terugzetten lukte niet." };
  }

  // Mark the credit as no longer attributed to this booking — refund is final.
  const { error: bErr } = await admin
    .from("bookings")
    .update({ credits_used: 0 })
    .eq("id", booking.id);
  if (bErr) {
    console.error("[refundCredit] booking update failed", bErr);
  }

  const { error: logErr } = await admin.from("admin_audit_log").insert({
    admin_id: user.id,
    action: "credit_refund",
    target_type: "booking",
    target_id: bookingId,
    details: {
      reason: trimmed,
      credits: booking.credits_used,
      membership_id: membership.id,
      previous_balance: membership.credits_remaining,
      new_balance: newBalance,
    },
  });
  if (logErr) {
    console.error("[refundCredit] audit log failed", logErr);
  }

  if (booking.session_id) {
    revalidatePath(`/app/admin/sessies/${booking.session_id}`);
  }

  return {
    ok: true,
    message: `Credit teruggezet. Nieuw saldo: ${newBalance}.`,
  };
}
