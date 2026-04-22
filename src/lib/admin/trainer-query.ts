import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmploymentTier = "head_trainer" | "trainer" | "intern";
export type HoursStatus = "pending" | "approved" | "rejected";

export interface TrainerListItem {
  id: string;
  profileId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  sanityId: string | null;
  employmentTier: EmploymentTier;
  pillarSpecialties: string[];
  isActive: boolean;
  isPtAvailable: boolean;
  ptTier: string;
  hoursThisWeek: number;
  hoursThisMonth: number;
  pendingHoursCount: number;
}

export interface TrainerScheduleSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  classTypeName: string;
  pillar: string;
  capacity: number;
}

export interface TrainerHoursRow {
  id: string;
  workDate: string;
  hours: number;
  notes: string | null;
  status: HoursStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  submittedAt: string;
}

export interface TrainerDetail extends TrainerListItem {
  bio: string | null;
  specialties: string[];
  hourlyRateInCents: number | null;
  scheduleSlots: TrainerScheduleSlot[];
  hoursHistory: TrainerHoursRow[];
}

function startOfIsoWeekIso(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function listTrainers(): Promise<TrainerListItem[]> {
  const admin = createAdminClient();

  type TrainerRow = {
    id: string;
    profile_id: string;
    sanity_id: string | null;
    display_name: string;
    pillar_specialties: string[];
    is_active: boolean;
    is_pt_available: boolean;
    pt_tier: string;
    employment_tier: EmploymentTier;
    display_order: number;
    profile: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      avatar_url: string | null;
    } | null;
  };

  const { data: trainers, error } = await admin
    .from("trainers")
    .select(
      `
        id, profile_id, sanity_id, display_name,
        pillar_specialties, is_active, is_pt_available, pt_tier,
        employment_tier, display_order,
        profile:profiles!profile_id(first_name, last_name, email, phone, avatar_url)
      `,
    )
    .order("display_order", { ascending: true })
    .returns<TrainerRow[]>();

  if (error) {
    console.error("[listTrainers] query failed", error);
    return [];
  }

  const trainerIds = (trainers ?? []).map((t) => t.id);
  if (trainerIds.length === 0) return [];

  const weekStart = startOfIsoWeekIso();
  const monthStart = startOfMonthIso();

  type HoursRow = {
    trainer_id: string;
    work_date: string;
    hours: number | string;
    status: HoursStatus;
  };

  const { data: hoursRows } = await admin
    .from("trainer_hours")
    .select("trainer_id, work_date, hours, status")
    .in("trainer_id", trainerIds)
    .gte("work_date", monthStart)
    .returns<HoursRow[]>();

  const weekSum = new Map<string, number>();
  const monthSum = new Map<string, number>();
  const pendingCount = new Map<string, number>();
  for (const row of hoursRows ?? []) {
    if (row.status === "pending") {
      pendingCount.set(
        row.trainer_id,
        (pendingCount.get(row.trainer_id) ?? 0) + 1,
      );
    }
    if (row.status !== "approved") continue;
    const n = toNumber(row.hours);
    if (row.work_date >= monthStart) {
      monthSum.set(row.trainer_id, (monthSum.get(row.trainer_id) ?? 0) + n);
    }
    if (row.work_date >= weekStart) {
      weekSum.set(row.trainer_id, (weekSum.get(row.trainer_id) ?? 0) + n);
    }
  }

  return (trainers ?? []).map((t) => ({
    id: t.id,
    profileId: t.profile_id,
    displayName: t.display_name,
    firstName: t.profile?.first_name ?? "",
    lastName: t.profile?.last_name ?? "",
    email: t.profile?.email ?? "",
    phone: t.profile?.phone ?? null,
    avatarUrl: t.profile?.avatar_url ?? null,
    sanityId: t.sanity_id,
    employmentTier: t.employment_tier,
    pillarSpecialties: t.pillar_specialties ?? [],
    isActive: t.is_active,
    isPtAvailable: t.is_pt_available,
    ptTier: t.pt_tier,
    hoursThisWeek: weekSum.get(t.id) ?? 0,
    hoursThisMonth: monthSum.get(t.id) ?? 0,
    pendingHoursCount: pendingCount.get(t.id) ?? 0,
  }));
}

export async function loadTrainerDetail(
  trainerId: string,
): Promise<TrainerDetail | null> {
  const admin = createAdminClient();

  type TrainerRow = {
    id: string;
    profile_id: string;
    sanity_id: string | null;
    display_name: string;
    bio: string | null;
    specialties: string[];
    pillar_specialties: string[];
    is_active: boolean;
    is_pt_available: boolean;
    pt_tier: string;
    employment_tier: EmploymentTier;
    hourly_rate_in_cents: number | null;
    profile: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      avatar_url: string | null;
    } | null;
  };

  const [trainerRes, templatesRes, hoursRes] = await Promise.all([
    admin
      .from("trainers")
      .select(
        `
          id, profile_id, sanity_id, display_name, bio,
          specialties, pillar_specialties, is_active, is_pt_available,
          pt_tier, employment_tier, hourly_rate_in_cents,
          profile:profiles!profile_id(first_name, last_name, email, phone, avatar_url)
        `,
      )
      .eq("id", trainerId)
      .maybeSingle<TrainerRow>(),
    admin
      .from("schedule_templates")
      .select(
        `
          id, day_of_week, start_time, duration_minutes, capacity,
          class_type:class_types(name, pillar)
        `,
      )
      .eq("trainer_id", trainerId)
      .eq("is_active", true)
      .order("day_of_week")
      .order("start_time"),
    admin
      .from("trainer_hours")
      .select(
        `
          id, work_date, hours, notes, status,
          approved_at, rejection_reason, submitted_at,
          approver:profiles!approved_by(first_name, last_name)
        `,
      )
      .eq("trainer_id", trainerId)
      .order("work_date", { ascending: false })
      .limit(100),
  ]);

  const t = trainerRes.data;
  if (!t) return null;

  type ClassTypeRef = { name: string | null; pillar: string | null };
  const scheduleSlots: TrainerScheduleSlot[] = (templatesRes.data ?? []).map(
    (r) => {
      const ct = (Array.isArray(r.class_type) ? r.class_type[0] : r.class_type) as
        | ClassTypeRef
        | null;
      return {
        id: r.id,
        dayOfWeek: r.day_of_week,
        startTime: r.start_time,
        durationMinutes: r.duration_minutes,
        classTypeName: ct?.name ?? "Sessie",
        pillar: ct?.pillar ?? "",
        capacity: r.capacity,
      };
    },
  );

  type NameRef = { first_name: string | null; last_name: string | null } | null;
  function nameOf(ref: NameRef | NameRef[] | null | undefined): string | null {
    const n = Array.isArray(ref) ? ref[0] : ref;
    const full = [n?.first_name, n?.last_name].filter(Boolean).join(" ");
    return full || null;
  }

  const hoursHistory: TrainerHoursRow[] = (hoursRes.data ?? []).map((h) => ({
    id: h.id,
    workDate: h.work_date,
    hours: toNumber(h.hours),
    notes: h.notes,
    status: h.status as HoursStatus,
    approvedByName: nameOf(h.approver as NameRef | NameRef[] | null),
    approvedAt: h.approved_at,
    rejectionReason: h.rejection_reason,
    submittedAt: h.submitted_at,
  }));

  const weekStart = startOfIsoWeekIso();
  const monthStart = startOfMonthIso();
  let weekSum = 0;
  let monthSum = 0;
  let pending = 0;
  for (const h of hoursHistory) {
    if (h.status === "pending") pending += 1;
    if (h.status !== "approved") continue;
    if (h.workDate >= monthStart) monthSum += h.hours;
    if (h.workDate >= weekStart) weekSum += h.hours;
  }

  return {
    id: t.id,
    profileId: t.profile_id,
    displayName: t.display_name,
    firstName: t.profile?.first_name ?? "",
    lastName: t.profile?.last_name ?? "",
    email: t.profile?.email ?? "",
    phone: t.profile?.phone ?? null,
    avatarUrl: t.profile?.avatar_url ?? null,
    sanityId: t.sanity_id,
    employmentTier: t.employment_tier,
    pillarSpecialties: t.pillar_specialties ?? [],
    isActive: t.is_active,
    isPtAvailable: t.is_pt_available,
    ptTier: t.pt_tier,
    bio: t.bio,
    specialties: t.specialties ?? [],
    hourlyRateInCents: t.hourly_rate_in_cents,
    scheduleSlots,
    hoursHistory,
    hoursThisWeek: weekSum,
    hoursThisMonth: monthSum,
    pendingHoursCount: pending,
  };
}
