"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadTrainerDetail as loadTrainerDetailInternal,
  type EmploymentTier,
  type TrainerDetail,
} from "./trainer-query";

/**
 * Client-callable wrapper around the server-only detail query. The drawer
 * on /app/admin/trainers imports this and NOT trainer-query.ts directly
 * (which would drag `import "server-only"` into the client bundle).
 */
export async function loadTrainerDetailAction(
  trainerId: string,
): Promise<TrainerDetail | null> {
  const auth = await requireAdmin();
  if (!auth.ok) return null;
  return loadTrainerDetailInternal(trainerId);
}

export type TrainerActionResult =
  | { ok: true; message: string; trainerId?: string }
  | { ok: false; message: string };

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
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
  return { ok: true, userId: user.id };
}

function revalidateTrainers() {
  revalidatePath("/app/admin/trainers");
  revalidatePath("/app/admin");
}

// ----------------------------------------------------------------------------
// Approve pending hours
// ----------------------------------------------------------------------------

export async function approveTrainerHours(
  hoursId: string,
): Promise<TrainerActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: row } = await admin
    .from("trainer_hours")
    .select("id, status, trainer_id")
    .eq("id", hoursId)
    .maybeSingle();

  if (!row) return { ok: false, message: "Regel niet gevonden." };
  if (row.status !== "pending") {
    return { ok: false, message: "Deze regel is al verwerkt." };
  }

  const { error } = await admin
    .from("trainer_hours")
    .update({
      status: "approved",
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", hoursId);

  if (error) {
    console.error("[approveTrainerHours] failed", error);
    return { ok: false, message: "Goedkeuren lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "hours_approved",
    target_type: "trainer_hours",
    target_id: hoursId,
    details: { trainer_id: row.trainer_id },
  });

  revalidateTrainers();
  return { ok: true, message: "Uren goedgekeurd." };
}

// ----------------------------------------------------------------------------
// Reject pending hours
// ----------------------------------------------------------------------------

export async function rejectTrainerHours(
  hoursId: string,
  reason: string,
): Promise<TrainerActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const trimmed = reason?.trim();
  if (!trimmed) return { ok: false, message: "Geef een reden op." };

  const admin = createAdminClient();

  const { data: row } = await admin
    .from("trainer_hours")
    .select("id, status, trainer_id")
    .eq("id", hoursId)
    .maybeSingle();

  if (!row) return { ok: false, message: "Regel niet gevonden." };
  if (row.status !== "pending") {
    return { ok: false, message: "Deze regel is al verwerkt." };
  }

  const { error } = await admin
    .from("trainer_hours")
    .update({
      status: "rejected",
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
      rejection_reason: trimmed,
    })
    .eq("id", hoursId);

  if (error) {
    console.error("[rejectTrainerHours] failed", error);
    return { ok: false, message: "Afwijzen lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "hours_rejected",
    target_type: "trainer_hours",
    target_id: hoursId,
    details: { trainer_id: row.trainer_id, reason: trimmed },
  });

  revalidateTrainers();
  return { ok: true, message: "Uren afgewezen." };
}

// ----------------------------------------------------------------------------
// Admin logs hours on behalf of a trainer (skips approval flow)
// ----------------------------------------------------------------------------

interface LogHoursInput {
  trainerId: string;
  workDate: string; // yyyy-mm-dd
  hours: number;
  notes?: string;
}

export async function logAdminHours(
  input: LogHoursInput,
): Promise<TrainerActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!input.trainerId || !input.workDate) {
    return { ok: false, message: "Vul alle velden in." };
  }
  if (!(input.hours > 0 && input.hours <= 24)) {
    return { ok: false, message: "Uren moeten tussen 0 en 24 liggen." };
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("trainer_hours")
    .insert({
      trainer_id: input.trainerId,
      work_date: input.workDate,
      hours: input.hours,
      notes: input.notes?.trim() || null,
      status: "approved",
      approved_by: auth.userId,
      approved_at: nowIso,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[logAdminHours] failed", error);
    return { ok: false, message: "Uren opslaan lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "hours_logged_by_admin",
    target_type: "trainer_hours",
    target_id: data.id,
    details: {
      trainer_id: input.trainerId,
      work_date: input.workDate,
      hours: input.hours,
    },
  });

  revalidateTrainers();
  return { ok: true, message: "Uren geboekt." };
}

// ----------------------------------------------------------------------------
// Toggle active / inactive
// ----------------------------------------------------------------------------

export async function toggleTrainerActive(
  trainerId: string,
  isActive: boolean,
): Promise<TrainerActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { error } = await admin
    .from("trainers")
    .update({ is_active: isActive })
    .eq("id", trainerId);

  if (error) {
    console.error("[toggleTrainerActive] failed", error);
    return { ok: false, message: "Status wijzigen lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "trainer_toggle_active",
    target_type: "trainer",
    target_id: trainerId,
    details: { is_active: isActive },
  });

  revalidateTrainers();
  return {
    ok: true,
    message: isActive ? "Trainer geactiveerd." : "Trainer gedeactiveerd.",
  };
}

// ----------------------------------------------------------------------------
// Update employment tier
// ----------------------------------------------------------------------------

export async function updateTrainerTier(
  trainerId: string,
  tier: EmploymentTier,
): Promise<TrainerActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { error } = await admin
    .from("trainers")
    .update({ employment_tier: tier })
    .eq("id", trainerId);

  if (error) {
    console.error("[updateTrainerTier] failed", error);
    return { ok: false, message: "Rol wijzigen lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "trainer_tier_updated",
    target_type: "trainer",
    target_id: trainerId,
    details: { tier },
  });

  revalidateTrainers();
  return { ok: true, message: "Rol bijgewerkt." };
}

// ----------------------------------------------------------------------------
// Invite a new trainer (auth.admin.inviteUserByEmail + profile + trainers)
// ----------------------------------------------------------------------------

interface InviteTrainerInput {
  firstName: string;
  lastName: string;
  email: string;
  employmentTier: EmploymentTier;
  pillarSpecialties: string[];
  isPtAvailable: boolean;
}

function slugify(first: string, last: string): string {
  const base = `${first} ${last}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `trainer-${Date.now().toString(36)}`;
}

export async function inviteTrainer(
  input: InviteTrainerInput,
): Promise<TrainerActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!input.firstName.trim() || !input.lastName.trim() || !input.email.trim()) {
    return { ok: false, message: "Vul naam en e-mail in." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    return { ok: false, message: "E-mailadres lijkt niet te kloppen." };
  }

  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const displayName = `${firstName} ${lastName}`;

  // Invite user via auth admin. Supabase maakt een auth.users rij en stuurt
  // een magic-link mail.
  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName, last_name: lastName },
    });

  if (inviteErr || !invited?.user) {
    console.error("[inviteTrainer] invite failed", inviteErr);
    return {
      ok: false,
      message: inviteErr?.message ?? "Uitnodigen lukte niet.",
    };
  }

  const userId = invited.user.id;

  // De auth-trigger maakt al een profile-rij — hier bumpen we role + naam.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      role: "trainer",
    })
    .eq("id", userId);

  if (profileErr) {
    console.error("[inviteTrainer] profile update failed", profileErr);
    // Niet fataal — profile zelf bestaat, naam komt misschien uit user_metadata.
  }

  // Trainers-rij. Slug-uniqueness: append een suffix als nodig.
  const baseSlug = slugify(firstName, lastName);
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const { data: clash } = await admin
      .from("trainers")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}-${suffix++}`;
    if (suffix > 20) break;
  }

  const { data: trainer, error: trainerErr } = await admin
    .from("trainers")
    .insert({
      profile_id: userId,
      display_name: displayName,
      slug,
      pillar_specialties: input.pillarSpecialties,
      is_pt_available: input.isPtAvailable,
      is_active: true,
      employment_tier: input.employmentTier,
      sanity_id: null,
    })
    .select("id")
    .single();

  if (trainerErr || !trainer) {
    console.error("[inviteTrainer] trainer insert failed", trainerErr);
    return {
      ok: false,
      message:
        "Uitnodiging verstuurd, maar trainer-rij aanmaken faalde. Check Supabase-logs.",
    };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "trainer_invited",
    target_type: "trainer",
    target_id: trainer.id,
    details: {
      email,
      employment_tier: input.employmentTier,
      pillar_specialties: input.pillarSpecialties,
    },
  });

  revalidateTrainers();
  return {
    ok: true,
    trainerId: trainer.id,
    message: `Uitnodiging verzonden naar ${email}.`,
  };
}
