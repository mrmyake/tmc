"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type MemberActionResult =
  | { ok: true; message: string }
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

function revalidateDetail(profileId: string) {
  revalidatePath(`/app/admin/leden/${profileId}`);
  revalidatePath("/app/admin/leden");
  revalidatePath("/app/admin");
}

// ----------------------------------------------------------------------------
// Grant a pause directly (admin approves without pending flow)
// ----------------------------------------------------------------------------

interface GrantPauseInput {
  profileId: string;
  membershipId: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  reason: string;
}

const PAUSE_REASONS = ["pregnancy", "medical", "other_approved"] as const;
type PauseReason = (typeof PAUSE_REASONS)[number];

export async function grantPause(
  input: GrantPauseInput,
): Promise<MemberActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!input.membershipId || !input.startDate || !input.endDate) {
    return { ok: false, message: "Vul alle velden in." };
  }
  if (input.endDate < input.startDate) {
    return { ok: false, message: "Einddatum moet na startdatum liggen." };
  }
  const reason = (PAUSE_REASONS as readonly string[]).includes(input.reason)
    ? (input.reason as PauseReason)
    : "other_approved";

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("id, profile_id, status")
    .eq("id", input.membershipId)
    .maybeSingle();

  if (!membership) return { ok: false, message: "Abonnement niet gevonden." };
  if (membership.profile_id !== input.profileId) {
    return { ok: false, message: "Abonnement hoort niet bij dit lid." };
  }

  const nowIso = new Date().toISOString();

  const { data: pause, error: pauseErr } = await admin
    .from("membership_pauses")
    .insert({
      membership_id: input.membershipId,
      requested_by: input.profileId,
      start_date: input.startDate,
      end_date: input.endDate,
      reason,
      status: "approved",
      approved_by: auth.userId,
      approved_at: nowIso,
    })
    .select("id")
    .single();

  if (pauseErr) {
    console.error("[grantPause] insert failed", pauseErr);
    return { ok: false, message: "Pauze toekennen lukte niet." };
  }

  // Als de pauze vandaag of in verleden start, zet abbo meteen op paused.
  const today = nowIso.slice(0, 10);
  if (
    input.startDate <= today &&
    input.endDate >= today &&
    membership.status === "active"
  ) {
    await admin
      .from("memberships")
      .update({ status: "paused" })
      .eq("id", input.membershipId);
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "pause_granted",
    target_type: "profile",
    target_id: input.profileId,
    details: {
      membership_id: input.membershipId,
      pause_id: pause?.id,
      start_date: input.startDate,
      end_date: input.endDate,
      reason,
    },
  });

  revalidateDetail(input.profileId);
  return { ok: true, message: "Pauze toegekend." };
}

// ----------------------------------------------------------------------------
// Add (or subtract) credits on a membership
// ----------------------------------------------------------------------------

interface AddCreditsInput {
  profileId: string;
  membershipId: string;
  delta: number;
  reason: string;
}

export async function addCredits(
  input: AddCreditsInput,
): Promise<MemberActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!Number.isInteger(input.delta) || input.delta === 0) {
    return { ok: false, message: "Geef een heel aantal (niet 0)." };
  }
  if (input.delta < -20 || input.delta > 20) {
    return {
      ok: false,
      message: "Delta buiten bereik (−20 t/m +20).",
    };
  }
  if (!input.reason.trim()) {
    return { ok: false, message: "Geef een reden op." };
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("id, profile_id, credits_remaining")
    .eq("id", input.membershipId)
    .maybeSingle();

  if (!membership) return { ok: false, message: "Abonnement niet gevonden." };
  if (membership.profile_id !== input.profileId) {
    return { ok: false, message: "Abonnement hoort niet bij dit lid." };
  }

  const previous = membership.credits_remaining ?? 0;
  const next = Math.max(0, previous + input.delta);

  const { error } = await admin
    .from("memberships")
    .update({ credits_remaining: next })
    .eq("id", input.membershipId);

  if (error) {
    console.error("[addCredits] update failed", error);
    return { ok: false, message: "Credits aanpassen lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "credits_adjusted",
    target_type: "profile",
    target_id: input.profileId,
    details: {
      membership_id: input.membershipId,
      delta: input.delta,
      previous_balance: previous,
      new_balance: next,
      reason: input.reason.trim(),
    },
  });

  revalidateDetail(input.profileId);
  return {
    ok: true,
    message: `Credits aangepast. Nieuw saldo: ${next}.`,
  };
}

// ----------------------------------------------------------------------------
// Override a single booking's attendance status (admin)
// ----------------------------------------------------------------------------

type BookingStatus = "attended" | "booked" | "no_show";

interface OverrideNoShowInput {
  profileId: string;
  bookingId: string;
  newStatus: BookingStatus;
}

export async function overrideNoShow(
  input: OverrideNoShowInput,
): Promise<MemberActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, profile_id, status")
    .eq("id", input.bookingId)
    .maybeSingle();

  if (!booking) return { ok: false, message: "Boeking niet gevonden." };
  if (booking.profile_id !== input.profileId) {
    return { ok: false, message: "Boeking hoort niet bij dit lid." };
  }
  if (booking.status === "cancelled") {
    return {
      ok: false,
      message: "Geannuleerde boeking kan niet worden gemarkeerd.",
    };
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status: input.newStatus };
  if (input.newStatus === "attended") patch.attended_at = nowIso;
  if (input.newStatus === "booked") patch.attended_at = null;

  const { error } = await admin
    .from("bookings")
    .update(patch)
    .eq("id", input.bookingId);

  if (error) {
    console.error("[overrideNoShow] update failed", error);
    return { ok: false, message: "Bijwerken lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "attendance_override",
    target_type: "profile",
    target_id: input.profileId,
    details: {
      booking_id: input.bookingId,
      from: booking.status,
      to: input.newStatus,
    },
  });

  revalidateDetail(input.profileId);
  return { ok: true, message: "Status bijgewerkt." };
}

// ----------------------------------------------------------------------------
// Create a member note (admin-only)
// ----------------------------------------------------------------------------

interface CreateNoteInput {
  profileId: string;
  body: string;
}

export async function createNote(
  input: CreateNoteInput,
): Promise<MemberActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const body = input.body?.trim();
  if (!body) return { ok: false, message: "Leeg bericht." };
  if (body.length > 2000) {
    return { ok: false, message: "Notitie mag maximaal 2000 tekens zijn." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("member_notes").insert({
    profile_id: input.profileId,
    author_id: auth.userId,
    body,
  });

  if (error) {
    console.error("[createNote] insert failed", error);
    return { ok: false, message: "Notitie opslaan lukte niet." };
  }

  revalidateDetail(input.profileId);
  return { ok: true, message: "Notitie opgeslagen." };
}

// ----------------------------------------------------------------------------
// Delete member — hard delete via auth admin API
// ----------------------------------------------------------------------------

interface DeleteMemberInput {
  profileId: string;
  typedFirstName: string;
}

export async function deleteMember(
  input: DeleteMemberInput,
): Promise<MemberActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("id", input.profileId)
    .maybeSingle();

  if (!profile) return { ok: false, message: "Lid niet gevonden." };

  if (
    input.typedFirstName.trim().toLowerCase() !==
    profile.first_name.trim().toLowerCase()
  ) {
    return {
      ok: false,
      message: "Ingetypte voornaam komt niet overeen.",
    };
  }

  // Audit log VOOR de delete, anders is er geen profile meer om naar te
  // verwijzen voor `target_id`. We bewaren naam/email in `details`.
  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "member_deleted",
    target_type: "profile",
    target_id: profile.id,
    details: {
      captured_first_name: profile.first_name,
      captured_last_name: profile.last_name,
      captured_email: profile.email,
    },
  });

  // Cancel alle nog-actieve memberships (cleant ook Mollie niet; handmatig
  // stoppen in Mollie-dashboard). De FK-cascades op bookings, waitlist,
  // notes, strikes ruimen op zodra auth.users wordt verwijderd.
  await admin
    .from("memberships")
    .update({ status: "cancelled", end_date: new Date().toISOString().slice(0, 10) })
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused", "cancellation_requested", "payment_failed"]);

  const { error: delErr } = await admin.auth.admin.deleteUser(profile.id);
  if (delErr) {
    console.error("[deleteMember] auth delete failed", delErr);
    return {
      ok: false,
      message:
        "Auth-user verwijderen lukte niet. Check Supabase-logs. Memberships zijn wel al gecancelled.",
    };
  }

  revalidatePath("/app/admin/leden");
  revalidatePath("/app/admin");

  return { ok: true, message: "Lid verwijderd." };
}
