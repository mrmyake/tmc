import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MemberStatus } from "./members-query";

export interface MemberDetailProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  ageCategory: "adult" | "kids" | "senior";
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  streetAddress: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  marketingOptIn: boolean;
  createdAt: string;
  healthIntakeCompletedAt: string | null;
  healthNotes: HealthIntakeData | null;
}

export interface HealthIntakeData {
  injuries: string;
  medications: string;
  pregnancy_status:
    | "none"
    | "pregnant"
    | "post_partum"
    | "not_applicable"
    | string;
  pregnancy_notes: string;
  goals: string;
  experience_level: "beginner" | "intermediate" | "advanced" | string;
  additional_notes: string;
}

export interface MemberDetailMembership {
  id: string;
  planType: string;
  planVariant: string | null;
  status: string;
  creditsRemaining: number | null;
  pricePerCycleCents: number;
  billingCycleWeeks: number;
  startDate: string;
  commitEndDate: string;
  endDate: string | null;
  cancellationRequestedAt: string | null;
  cancellationEffectiveDate: string | null;
}

export interface MemberBookingRow {
  id: string;
  sessionId: string;
  status: string;
  startAt: string;
  endAt: string;
  className: string;
  trainerName: string;
  pillar: string;
  attendedAt: string | null;
  creditsUsed: number;
}

export interface MemberPaymentRow {
  id: string;
  mollieId: string;
  amountCents: number;
  status: string;
  description: string | null;
  method: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface MemberNoteRow {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
}

export interface MemberAuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  adminName: string;
}

export interface MemberStats {
  totalSessions: number;
  attendedSessions: number;
  favoritePillar: string | null;
  lastSessionAt: string | null;
  mrrCents: number;
  activeStrikes: number;
}

export interface MemberDetail {
  profile: MemberDetailProfile;
  memberships: MemberDetailMembership[];
  primaryMembership: MemberDetailMembership | null;
  primaryStatus: MemberStatus;
  upcomingBookings: MemberBookingRow[];
  pastBookings: MemberBookingRow[];
  payments: MemberPaymentRow[];
  notes: MemberNoteRow[];
  audit: MemberAuditRow[];
  stats: MemberStats;
}

function pickPrimary(
  memberships: MemberDetailMembership[],
): { primary: MemberDetailMembership | null; status: MemberStatus } {
  if (memberships.length === 0) return { primary: null, status: "none" };
  const priority = [
    "active",
    "paused",
    "payment_failed",
    "cancellation_requested",
    "pending",
    "cancelled",
    "expired",
  ];
  for (const s of priority) {
    const found = memberships.find((m) => m.status === s);
    if (found) return { primary: found, status: s as MemberStatus };
  }
  return { primary: memberships[0], status: memberships[0].status as MemberStatus };
}

function parseHealthNotes(raw: string | null): HealthIntakeData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HealthIntakeData>;
    return {
      injuries: parsed.injuries ?? "",
      medications: parsed.medications ?? "",
      pregnancy_status: parsed.pregnancy_status ?? "not_applicable",
      pregnancy_notes: parsed.pregnancy_notes ?? "",
      goals: parsed.goals ?? "",
      experience_level: parsed.experience_level ?? "beginner",
      additional_notes: parsed.additional_notes ?? "",
    };
  } catch {
    return null;
  }
}

export async function loadMemberDetail(
  profileId: string,
): Promise<MemberDetail | null> {
  const admin = createAdminClient();

  type ProfileRow = {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    date_of_birth: string | null;
    age_category: "adult" | "kids" | "senior";
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    street_address: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    marketing_opt_in: boolean;
    created_at: string;
    health_intake_completed_at: string | null;
    health_notes: string | null;
  };

  const [
    profileRes,
    membershipsRes,
    bookingsRes,
    paymentsRes,
    notesRes,
    strikesRes,
    checkInsRes,
  ] = await Promise.all([
      admin
        .from("profiles")
        .select(
          `
            id, first_name, last_name, email, phone, avatar_url,
            date_of_birth, age_category,
            emergency_contact_name, emergency_contact_phone,
            street_address, postal_code, city, country,
            marketing_opt_in, created_at,
            health_intake_completed_at, health_notes
          `,
        )
        .eq("id", profileId)
        .maybeSingle<ProfileRow>(),
      admin
        .from("memberships")
        .select(
          `
            id, plan_type, plan_variant, status,
            credits_remaining, price_per_cycle_cents, billing_cycle_weeks,
            start_date, commit_end_date, end_date,
            cancellation_requested_at, cancellation_effective_date
          `,
        )
        .eq("profile_id", profileId)
        .order("start_date", { ascending: false }),
      admin
        .from("bookings")
        .select(
          `
            id, session_id, status, credits_used, attended_at, no_show_at,
            session:class_sessions(
              start_at, end_at, pillar,
              class_type:class_types(name),
              trainer:trainers(display_name)
            )
          `,
        )
        .eq("profile_id", profileId)
        .order("session_date", { ascending: false })
        .limit(100),
      admin
        .from("payments")
        .select(
          `id, mollie_payment_id, amount_cents, status, description, method, paid_at, created_at`,
        )
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("member_notes")
        .select(
          `id, body, created_at, author:profiles!author_id(first_name, last_name)`,
        )
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("v_active_strikes")
        .select("strike_count")
        .eq("profile_id", profileId)
        .maybeSingle(),
      admin
        .from("check_ins")
        .select("session_id, pillar, checked_in_at, booking_id")
        .eq("profile_id", profileId)
        .order("checked_in_at", { ascending: false })
        .limit(200),
    ]);

  const profile = profileRes.data;
  if (!profile) return null;

  // Audit log for this profile (separate because target_id can also be
  // a membership/booking/payment id owned by this profile — keep simple and
  // just match target_id=profileId for now).
  const { data: auditData } = await admin
    .from("admin_audit_log")
    .select(
      `id, action, target_type, target_id, details, created_at,
       admin:profiles!admin_id(first_name, last_name)`,
    )
    .or(`target_id.eq.${profileId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  type JoinedName = {
    first_name: string | null;
    last_name: string | null;
  } | null;

  function nameOf(ref: JoinedName | JoinedName[] | null | undefined): string {
    const n = Array.isArray(ref) ? ref[0] : ref;
    return [n?.first_name, n?.last_name].filter(Boolean).join(" ") || "Admin";
  }

  const memberships: MemberDetailMembership[] = (
    membershipsRes.data ?? []
  ).map((m) => ({
    id: m.id,
    planType: m.plan_type,
    planVariant: m.plan_variant,
    status: m.status,
    creditsRemaining: m.credits_remaining,
    pricePerCycleCents: m.price_per_cycle_cents,
    billingCycleWeeks: m.billing_cycle_weeks,
    startDate: m.start_date,
    commitEndDate: m.commit_end_date,
    endDate: m.end_date,
    cancellationRequestedAt: m.cancellation_requested_at,
    cancellationEffectiveDate: m.cancellation_effective_date,
  }));

  const { primary, status: primaryStatus } = pickPrimary(memberships);

  type SessionJoin = {
    start_at: string;
    end_at: string;
    pillar: string;
    class_type: { name: string | null } | { name: string | null }[] | null;
    trainer:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
  };

  const checkInBySession = new Map<string, string>();
  const checkInByBooking = new Map<string, string>();
  for (const ci of checkInsRes.data ?? []) {
    if (ci.session_id) checkInBySession.set(ci.session_id, ci.checked_in_at);
    if (ci.booking_id) checkInByBooking.set(ci.booking_id, ci.checked_in_at);
  }

  const bookings: MemberBookingRow[] = (bookingsRes.data ?? []).map((b) => {
    const s = (Array.isArray(b.session) ? b.session[0] : b.session) as
      | SessionJoin
      | null;
    const ct = s
      ? ((Array.isArray(s.class_type) ? s.class_type[0] : s.class_type) as {
          name: string | null;
        } | null)
      : null;
    const tr = s
      ? ((Array.isArray(s.trainer) ? s.trainer[0] : s.trainer) as {
          display_name: string | null;
        } | null)
      : null;
    const checkedInAt =
      checkInByBooking.get(b.id) ??
      (b.session_id ? checkInBySession.get(b.session_id) : undefined) ??
      null;
    // Display-status: check_in > no_show_at > raw status.
    let displayStatus = b.status as string;
    if (checkedInAt) displayStatus = "attended";
    else if (b.no_show_at) displayStatus = "no_show";
    return {
      id: b.id,
      sessionId: b.session_id,
      status: displayStatus,
      startAt: s?.start_at ?? "",
      endAt: s?.end_at ?? "",
      className: ct?.name ?? "Sessie",
      trainerName: tr?.display_name ?? "—",
      pillar: s?.pillar ?? "",
      attendedAt: b.attended_at ?? checkedInAt,
      creditsUsed: b.credits_used ?? 0,
    };
  });

  const now = Date.now();
  const upcomingBookings = bookings
    .filter(
      (b) =>
        b.startAt &&
        new Date(b.startAt).getTime() >= now &&
        (b.status === "booked" || b.status === "waitlisted"),
    )
    .sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  const pastBookings = bookings.filter(
    (b) => !upcomingBookings.find((u) => u.id === b.id),
  );

  const payments: MemberPaymentRow[] = (paymentsRes.data ?? []).map((p) => ({
    id: p.id,
    mollieId: p.mollie_payment_id,
    amountCents: p.amount_cents,
    status: p.status,
    description: p.description,
    method: p.method,
    paidAt: p.paid_at,
    createdAt: p.created_at,
  }));

  const notes: MemberNoteRow[] = (notesRes.data ?? []).map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.created_at,
    authorName: nameOf(n.author as JoinedName | JoinedName[] | null),
  }));

  const audit: MemberAuditRow[] = (auditData ?? []).map((a) => ({
    id: a.id,
    action: a.action,
    targetType: a.target_type,
    targetId: a.target_id,
    details: (a.details ?? null) as Record<string, unknown> | null,
    createdAt: a.created_at,
    adminName: nameOf(a.admin as JoinedName | JoinedName[] | null),
  }));

  // Stats
  const attendedList = bookings.filter((b) => b.status === "attended");
  const pillarCounts = new Map<string, number>();
  for (const b of attendedList) {
    if (!b.pillar) continue;
    pillarCounts.set(b.pillar, (pillarCounts.get(b.pillar) ?? 0) + 1);
  }
  let favoritePillar: string | null = null;
  let favoriteCount = 0;
  for (const [p, c] of pillarCounts) {
    if (c > favoriteCount) {
      favoritePillar = p;
      favoriteCount = c;
    }
  }
  const lastSession = attendedList[0]?.attendedAt ?? bookings[0]?.startAt ?? null;
  const mrrCents =
    primary?.status === "active"
      ? Math.round((primary.pricePerCycleCents ?? 0) * (13 / 12))
      : 0;
  const activeStrikes = (strikesRes.data as { strike_count: number } | null)
    ?.strike_count ?? 0;

  const detailProfile: MemberDetailProfile = {
    id: profile.id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: profile.email,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    dateOfBirth: profile.date_of_birth,
    ageCategory: profile.age_category,
    emergencyContactName: profile.emergency_contact_name,
    emergencyContactPhone: profile.emergency_contact_phone,
    streetAddress: profile.street_address,
    postalCode: profile.postal_code,
    city: profile.city,
    country: profile.country,
    marketingOptIn: profile.marketing_opt_in,
    createdAt: profile.created_at,
    healthIntakeCompletedAt: profile.health_intake_completed_at,
    healthNotes: parseHealthNotes(profile.health_notes),
  };

  return {
    profile: detailProfile,
    memberships,
    primaryMembership: primary,
    primaryStatus,
    upcomingBookings,
    pastBookings,
    payments,
    notes,
    audit,
    stats: {
      totalSessions: bookings.length,
      attendedSessions: attendedList.length,
      favoritePillar,
      lastSessionAt: lastSession,
      mrrCents,
      activeStrikes,
    },
  };
}
