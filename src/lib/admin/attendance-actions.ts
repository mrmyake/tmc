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
  /** ISO-timestamp van fysieke check-in bij de tablet, null als nooit ingecheckt. */
  checkedInAt: string | null;
  hasInjury: boolean;
  /**
   * Full injury text from the intake. Alleen ingevuld als caller admin is
   * of trainer met `has_health_access = true`. Blijft null voor trainers
   * zonder opt-in, ook als het lid iets heeft ingevuld.
   */
  injuryText: string | null;
  rentalMat: boolean;
  rentalTowel: boolean;
}

function parseInjuryText(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { injuries?: string };
    const text = parsed?.injuries?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
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
  /**
   * True voor admins, en voor trainers met `has_health_access = true`.
   * Gebruikt door loadParticipants om bepalende intake-tekst wel of niet
   * mee te sturen.
   */
  canSeeHealthDetail: boolean;
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
    return {
      ok: true,
      ctx: { userId: user.id, role: "admin", canSeeHealthDetail: true },
    };
  }

  if (profile?.role !== "trainer") {
    return { ok: false, message: "Geen toegang." };
  }

  // Trainer — must own this session.
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("class_sessions")
    .select(
      "id, trainer:trainers!inner(profile_id, has_health_access)",
    )
    .eq("id", sessionId)
    .maybeSingle();

  type TrainerRef = {
    profile_id: string;
    has_health_access: boolean | null;
  };
  const trainer = (
    Array.isArray(session?.trainer) ? session?.trainer[0] : session?.trainer
  ) as TrainerRef | null | undefined;
  if (!session || trainer?.profile_id !== user.id) {
    return { ok: false, message: "Geen toegang tot deze sessie." };
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      role: "trainer",
      canSeeHealthDetail: Boolean(trainer.has_health_access),
    },
  };
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

  const [sessionRes, bookingsRes, checkInsRes] = await Promise.all([
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
          no_show_at, rental_mat, rental_towel,
          profile:profiles(first_name, last_name, avatar_url, health_notes),
          membership:memberships(plan_type, plan_variant, credits_remaining)
        `,
      )
      .eq("session_id", sessionId)
      .in("status", ["booked", "cancelled"])
      .order("booked_at", { ascending: true }),
    admin
      .from("check_ins")
      .select("profile_id, checked_in_at")
      .eq("session_id", sessionId),
  ]);

  const checkInByProfile = new Map<string, string>();
  for (const ci of checkInsRes.data ?? []) {
    if (ci.profile_id && ci.checked_in_at) {
      checkInByProfile.set(ci.profile_id, ci.checked_in_at);
    }
  }

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
    health_notes: string | null;
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
    const injuryText = parseInjuryText(p?.health_notes ?? null);
    const checkedInAt = checkInByProfile.get(b.profile_id) ?? null;
    const rawStatus = b.status as string;
    // Display-status derivation: check_in aanwezig wint, dan no_show_at,
    // anders valt de rauwe booking-status door (booked/cancelled/waitlisted).
    let displayStatus: AttendanceStatus;
    if (checkedInAt) {
      displayStatus = "attended";
    } else if (b.no_show_at) {
      displayStatus = "no_show";
    } else if (
      rawStatus === "cancelled" ||
      rawStatus === "booked"
    ) {
      displayStatus = rawStatus;
    } else {
      // waitlisted telt voor attendance-view als booked (zeldzaam hier
      // omdat query op booked/cancelled filtert, maar defensief).
      displayStatus = "booked";
    }
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
      status: displayStatus,
      bookedAt: b.booked_at,
      attendedAt: b.attended_at,
      checkedInAt,
      hasInjury: injuryText !== null,
      injuryText: auth.ctx.canSeeHealthDetail ? injuryText : null,
      rentalMat: Boolean(b.rental_mat),
      rentalTowel: Boolean(b.rental_towel),
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

  // Fetch current bookings + sessie (voor check_in insert: pillar) + bestaande
  // check_ins/strikes-koppelingen. De UI stuurt semantische tokens (attended/
  // booked/no_show) en wij vertalen naar check_ins + no_show_at + strikes.
  const ids = attendances.map((a) => a.bookingId);
  const [bookingsRes, sessionRes, checkInsRes, strikesRes] = await Promise.all([
    admin
      .from("bookings")
      .select("id, session_id, profile_id, status")
      .in("id", ids),
    admin
      .from("class_sessions")
      .select("id, pillar")
      .eq("id", sessionId)
      .maybeSingle(),
    admin
      .from("check_ins")
      .select("id, booking_id, profile_id")
      .eq("session_id", sessionId),
    admin
      .from("no_show_strikes")
      .select("id, booking_id")
      .in("booking_id", ids),
  ]);

  if (bookingsRes.error) {
    console.error("[markAttendance] fetch failed", bookingsRes.error);
    return { ok: false, message: "Kon boekingen niet laden." };
  }
  if (!sessionRes.data) {
    return { ok: false, message: "Sessie niet gevonden." };
  }

  const sessionPillar = sessionRes.data.pillar as string;
  const byId = new Map(
    (bookingsRes.data ?? []).map((b) => [
      b.id,
      {
        sessionId: b.session_id,
        profileId: b.profile_id,
        status: b.status as string,
      },
    ]),
  );
  const checkInByBooking = new Map<string, string>();
  const checkInByProfile = new Map<string, string>();
  for (const ci of checkInsRes.data ?? []) {
    if (ci.booking_id) checkInByBooking.set(ci.booking_id, ci.id);
    if (ci.profile_id) checkInByProfile.set(ci.profile_id, ci.id);
  }
  const strikesByBooking = new Map<string, string>();
  for (const s of strikesRes.data ?? []) {
    if (s.booking_id) strikesByBooking.set(s.booking_id, s.id);
  }

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
    if (cur.status === "cancelled") continue;

    if (a.status === "attended") {
      // check_ins-row garanderen (idempotent via unique-index session+profile).
      const existingCi =
        checkInByBooking.get(a.bookingId) ??
        checkInByProfile.get(cur.profileId);
      if (!existingCi) {
        const { error: ciErr } = await admin.from("check_ins").insert({
          profile_id: cur.profileId,
          session_id: sessionId,
          booking_id: a.bookingId,
          check_in_method: "admin_web",
          access_type: "membership",
          pillar: sessionPillar,
          checked_in_at: nowIso,
          checked_in_by: auth.ctx.userId,
        });
        if (ciErr && ciErr.code !== "23505") {
          console.error("[markAttendance] check_in insert failed", ciErr);
          return { ok: false, message: "Bijwerken lukte niet." };
        }
      } else if (!checkInByBooking.get(a.bookingId)) {
        // Check_in bestond wel op sessie+profiel niveau maar booking_id
        // was null — koppel even bij.
        await admin
          .from("check_ins")
          .update({ booking_id: a.bookingId })
          .eq("id", existingCi);
      }
      // Attended overrulet no_show/strike signals — opruimen.
      await admin
        .from("bookings")
        .update({ no_show_at: null, attended_at: nowIso })
        .eq("id", a.bookingId);
      const strikeId = strikesByBooking.get(a.bookingId);
      if (strikeId) {
        await admin.from("no_show_strikes").delete().eq("id", strikeId);
      }
    } else if (a.status === "no_show") {
      await admin
        .from("bookings")
        .update({ no_show_at: nowIso, attended_at: null })
        .eq("id", a.bookingId);
      // Eventueel eerder gezette check_in die nu wordt "corrected".
      const ciId = checkInByBooking.get(a.bookingId);
      if (ciId) {
        await admin.from("check_ins").delete().eq("id", ciId);
      }
      if (!strikesByBooking.has(a.bookingId)) {
        newStrikeRows.push({
          id: a.bookingId,
          profile_id: cur.profileId,
          prevStatus: cur.status,
        });
      }
    } else {
      // "booked" = reset naar neutraal — verwijder check_in, strike, no_show_at.
      await admin
        .from("bookings")
        .update({ no_show_at: null, attended_at: null })
        .eq("id", a.bookingId);
      const ciId = checkInByBooking.get(a.bookingId);
      if (ciId) {
        await admin.from("check_ins").delete().eq("id", ciId);
      }
      const strikeId = strikesByBooking.get(a.bookingId);
      if (strikeId) {
        await admin.from("no_show_strikes").delete().eq("id", strikeId);
      }
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
    .select("id, profile_id, status, no_show_at")
    .eq("session_id", sessionId)
    .eq("status", "booked")
    .is("no_show_at", null);

  if (!remaining || remaining.length === 0) {
    return { ok: true, message: "Geen open boekingen meer." };
  }

  // Filter op wie geen check_in heeft (die waren wel aanwezig).
  const { data: checkIns } = await admin
    .from("check_ins")
    .select("profile_id")
    .eq("session_id", sessionId);
  const checkedInProfiles = new Set(
    (checkIns ?? []).map((c) => c.profile_id).filter(Boolean),
  );
  const trulyNoShow = remaining.filter(
    (r) => !checkedInProfiles.has(r.profile_id),
  );

  if (trulyNoShow.length === 0) {
    return { ok: true, message: "Alle aanwezigen ingecheckt." };
  }

  const nowIso = new Date().toISOString();

  const { error } = await admin
    .from("bookings")
    .update({ no_show_at: nowIso, attended_at: null })
    .in(
      "id",
      trulyNoShow.map((r) => r.id),
    );

  if (error) {
    console.error("[autoMarkNoShows] update failed", error);
    return { ok: false, message: "Kon geen no-shows markeren." };
  }

  await writeStrikesForNewNoShows(
    admin,
    trulyNoShow.map((r) => ({
      id: r.id,
      profile_id: r.profile_id,
      prevStatus: r.status,
    })),
  );

  revalidatePath(`/app/admin/sessies/${sessionId}`);
  revalidatePath(`/app/trainer/sessies/${sessionId}`);

  return {
    ok: true,
    message: `${trulyNoShow.length} boeking(en) als no-show gemarkeerd.`,
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
