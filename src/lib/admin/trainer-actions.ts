"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateRequest } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateIdFromEntropySize } from "lucia";
import { pool } from "@/lib/db";
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
  const { user } = await validateRequest();
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

export async function toggleTrainerHealthAccess(
  trainerId: string,
  hasHealthAccess: boolean,
): Promise<TrainerActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("trainers")
    .update({ has_health_access: hasHealthAccess })
    .eq("id", trainerId);

  if (error) {
    console.error("[toggleTrainerHealthAccess] failed", error);
    return { ok: false, message: "Bijwerken lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "trainer_health_access_toggled",
    target_type: "trainer",
    target_id: trainerId,
    details: { has_health_access: hasHealthAccess },
  });

  revalidateTrainers();
  return {
    ok: true,
    message: hasHealthAccess
      ? "Blessure-inzage aangezet."
      : "Blessure-inzage uitgezet.",
  };
}

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

  // Create a Lucia auth_user + profile for the trainer. No invite email is sent
  // anymore — share the login link; the trainer signs in with this email via
  // Google or by setting a password (password-reset flow).
  const userId = generateIdFromEntropySize(16);
  try {
    await pool.query(
      "insert into auth_user (id, email, email_verified) values ($1,$2,true) on conflict do nothing",
      [userId, email]
    );
  } catch (e) {
    console.error("[inviteTrainer] create auth_user failed", e);
    return { ok: false, message: "Uitnodigen lukte niet." };
  }

  // Upsert the profile row with role + name.
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        email,
        role: "trainer",
      },
      { onConflict: "id" }
    );

  if (profileErr) {
    console.error("[inviteTrainer] profile upsert failed", profileErr);
    return { ok: false, message: "Trainer-profiel aanmaken lukte niet." };
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
