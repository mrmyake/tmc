"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import { emitEvent } from "@/lib/events/emit";
import { cancelMollieSubscription } from "@/lib/mollie";
import { sendNotification } from "@/lib/ntfy";
import {
  cancelMembershipCore,
  pauseMembershipCore,
  resumeMembershipCore,
} from "./membership-lifecycle";

export type MemberActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

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

  // Toekennen loopt volledig via de gedeelde lifecycle-laag (Mollie-incasso
  // eerst gestopt, dan de definer-RPC tmc.admin_pause_membership). Beleid:
  // de pauze gaat in op het einde van de lopende betaalde cyclus en is
  // open-einde tot admin handmatig hervat; de datums uit het formulier zijn
  // adviserend en bepalen de ingang of duur niet.
  const result = await pauseMembershipCore({
    membershipId: input.membershipId,
    reason,
  });
  if (!result.ok) return { ok: false, message: result.message };

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "pause_granted",
    target_type: "profile",
    target_id: input.profileId,
    details: {
      membership_id: input.membershipId,
      pause_effective_date: result.effectiveDate ?? null,
      cancelled_bookings: result.cancelledBookings ?? 0,
      reason,
    },
  });

  await emitEvent({
    type: "membership.pause_granted",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "membership",
    subjectId: input.membershipId,
    payload: {
      profile_id: input.profileId,
      membership_id: input.membershipId,
      pause_effective_date: result.effectiveDate ?? null,
      reason,
    },
  });

  revalidateDetail(input.profileId);
  return { ok: true, message: result.message };
}

// ----------------------------------------------------------------------------
// Resume a paused membership (new subscription on the existing mandate)
// ----------------------------------------------------------------------------

interface ResumeMembershipInput {
  profileId: string;
  membershipId: string;
}

export async function resumeMembership(
  input: ResumeMembershipInput,
): Promise<MemberActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("id, profile_id")
    .eq("id", input.membershipId)
    .maybeSingle();

  if (!membership) return { ok: false, message: "Abonnement niet gevonden." };
  if (membership.profile_id !== input.profileId) {
    return { ok: false, message: "Abonnement hoort niet bij dit lid." };
  }

  const result = await resumeMembershipCore({
    membershipId: input.membershipId,
  });
  if (!result.ok) return { ok: false, message: result.message };

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "membership_resumed",
    target_type: "profile",
    target_id: input.profileId,
    details: {
      membership_id: input.membershipId,
      resumed_from: result.effectiveDate ?? null,
      shift_days: result.shiftDays ?? 0,
    },
  });

  revalidateDetail(input.profileId);
  return { ok: true, message: result.message };
}

// ----------------------------------------------------------------------------
// Cancel a membership on admin authority (terminal; default completes the
// paid cycle, hardStop is the marked coulance/geschil branch)
// ----------------------------------------------------------------------------

interface CancelMembershipInput {
  profileId: string;
  membershipId: string;
  reason: string;
  hardStop?: boolean;
}

export async function cancelMembership(
  input: CancelMembershipInput,
): Promise<MemberActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("id, profile_id")
    .eq("id", input.membershipId)
    .maybeSingle();

  if (!membership) return { ok: false, message: "Abonnement niet gevonden." };
  if (membership.profile_id !== input.profileId) {
    return { ok: false, message: "Abonnement hoort niet bij dit lid." };
  }

  const result = await cancelMembershipCore({
    membershipId: input.membershipId,
    reason: input.reason,
    hardStop: input.hardStop ?? false,
  });
  if (!result.ok) return { ok: false, message: result.message };

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "membership_cancelled",
    target_type: "profile",
    target_id: input.profileId,
    details: {
      membership_id: input.membershipId,
      reason: input.reason,
      hard_stop: input.hardStop ?? false,
      effective_date: result.effectiveDate ?? null,
      cancelled_bookings: result.cancelledBookings ?? 0,
    },
  });

  revalidateDetail(input.profileId);
  return { ok: true, message: result.message };
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
    .select("id, profile_id")
    .eq("id", input.membershipId)
    .maybeSingle();

  if (!membership) return { ok: false, message: "Abonnement niet gevonden." };
  if (membership.profile_id !== input.profileId) {
    return { ok: false, message: "Abonnement hoort niet bij dit lid." };
  }

  // Mutatie via de RPC-laag onder row lock; die schrijft zelf het
  // credits.adjusted-event in dezelfde transactie. Geen stille clamp
  // meer: te veel aftrekken wordt geweigerd i.p.v. op 0 afgekapt.
  const { data: result, error } = await admin.rpc("adjust_membership_credits", {
    p_membership_id: input.membershipId,
    p_delta: input.delta,
    p_reason: input.reason.trim(),
    p_source: "manual",
    p_actor_type: "admin",
    p_actor_id: auth.userId,
  });

  const adjusted = result as {
    ok?: boolean;
    reason?: string;
    previous_balance?: number;
    new_balance?: number;
  } | null;

  if (error || !adjusted?.ok) {
    if (adjusted?.reason === "insufficient_credits") {
      // COPY: confirm met Marlon
      return { ok: false, message: "Onvoldoende saldo voor deze aftrek." };
    }
    if (adjusted?.reason === "credits_expired") {
      // COPY: confirm met Marlon
      return { ok: false, message: "Deze kaart is verlopen." };
    }
    console.error("[addCredits] adjust_membership_credits", error ?? adjusted);
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
      previous_balance: adjusted.previous_balance,
      new_balance: adjusted.new_balance,
      reason: input.reason.trim(),
    },
  });

  revalidateDetail(input.profileId);
  return {
    ok: true,
    message: `Credits aangepast. Nieuw saldo: ${adjusted.new_balance}.`,
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
    .select("id, profile_id, session_id, status")
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
  if (!booking.session_id) {
    return { ok: false, message: "Boeking zonder sessie." };
  }

  const { data: session } = await admin
    .from("class_sessions")
    .select("pillar")
    .eq("id", booking.session_id)
    .maybeSingle();
  if (!session) return { ok: false, message: "Sessie niet gevonden." };

  const nowIso = new Date().toISOString();

  if (input.newStatus === "attended") {
    // Check-in upserten; no_show_at wissen; strike verwijderen.
    const { error: ciErr } = await admin.from("check_ins").insert({
      profile_id: booking.profile_id,
      session_id: booking.session_id,
      booking_id: booking.id,
      check_in_method: "admin_web",
      access_type: "membership",
      pillar: session.pillar,
      checked_in_at: nowIso,
      checked_in_by: auth.userId,
    });
    if (ciErr && ciErr.code !== "23505") {
      console.error("[overrideNoShow] check_in insert failed", ciErr);
      return { ok: false, message: "Bijwerken lukte niet." };
    }
    await admin
      .from("bookings")
      .update({ no_show_at: null, attended_at: nowIso })
      .eq("id", booking.id);
    await admin
      .from("no_show_strikes")
      .delete()
      .eq("booking_id", booking.id);
  } else if (input.newStatus === "no_show") {
    await admin
      .from("bookings")
      .update({ no_show_at: nowIso, attended_at: null })
      .eq("id", booking.id);
    await admin
      .from("check_ins")
      .delete()
      .eq("booking_id", booking.id);
    // Strike idempotent toevoegen.
    const { data: existingStrike } = await admin
      .from("no_show_strikes")
      .select("id")
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (!existingStrike) {
      const expires = new Date(
        Date.now() + 30 * 86_400_000,
      ).toISOString();
      await admin.from("no_show_strikes").insert({
        profile_id: booking.profile_id,
        booking_id: booking.id,
        occurred_at: nowIso,
        expires_at: expires,
      });
    }
  } else {
    // Reset naar neutraal: check_in + strike + no_show_at weg.
    await admin
      .from("bookings")
      .update({ no_show_at: null, attended_at: null })
      .eq("id", booking.id);
    await admin
      .from("check_ins")
      .delete()
      .eq("booking_id", booking.id);
    await admin
      .from("no_show_strikes")
      .delete()
      .eq("booking_id", booking.id);
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

  // Outcome-event. Reset-naar-neutraal (attendance.cleared) is bewust
  // uitgesteld, dus daar emitten we niets.
  if (input.newStatus === "attended") {
    await emitEvent({
      type: "checkin.recorded",
      actorType: "admin",
      actorId: auth.userId,
      subjectType: "booking",
      subjectId: booking.id,
      payload: {
        profile_id: input.profileId,
        session_id: booking.session_id,
        booking_id: booking.id,
        source: "override",
      },
    });
  } else if (input.newStatus === "no_show") {
    await emitEvent({
      type: "attendance.no_show_marked",
      actorType: "admin",
      actorId: auth.userId,
      subjectType: "booking",
      subjectId: booking.id,
      payload: {
        profile_id: input.profileId,
        session_id: booking.session_id,
        booking_id: booking.id,
        strike_issued: true,
        source: "override",
      },
    });
  }

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

  // Cancel alle nog-actieve memberships en stop de bijbehorende Mollie-
  // subscriptions, zodat er na de hard-delete geen incasso doorloopt. De
  // FK-cascades op bookings, waitlist, notes, strikes ruimen op zodra
  // auth.users wordt verwijderd.
  const { data: cancelled } = await admin
    .from("memberships")
    .update({ status: "cancelled", end_date: new Date().toISOString().slice(0, 10) })
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused", "cancellation_requested", "payment_failed"])
    .select("id, mollie_customer_id, mollie_subscription_id");

  const mollieFailures: string[] = [];
  for (const m of cancelled ?? []) {
    if (m.mollie_subscription_id) {
      const stopped = await cancelMollieSubscription(
        m.mollie_customer_id,
        m.mollie_subscription_id,
      );
      if (!stopped) mollieFailures.push(m.id);
    }
    await emitEvent({
      type: "membership.cancelled",
      actorType: "admin",
      actorId: auth.userId,
      subjectType: "membership",
      subjectId: m.id,
      payload: {
        profile_id: profile.id,
        membership_id: m.id,
        reason: "member_deleted",
        subscription_cancelled: Boolean(m.mollie_subscription_id),
      },
    });
  }

  // Hard-delete gaat door, maar een mislukte Mollie-cancel betekent
  // doorlopende incasso voor een verwijderd lid: loud melden.
  if (mollieFailures.length > 0) {
    await sendNotification(
      "Mollie-incasso niet gestopt",
      `Lid ${profile.id} wordt verwijderd, maar ${mollieFailures.length} Mollie-subscription(s) konden niet worden geannuleerd. Stop ze handmatig in het Mollie-dashboard.`,
      "warning",
    );
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(profile.id);
  if (delErr) {
    console.error("[deleteMember] auth delete failed", delErr);
    return {
      ok: false,
      message:
        "Auth-user verwijderen lukte niet. Check Supabase-logs. Memberships zijn wel al gecancelled.",
    };
  }

  await emitEvent({
    type: "member.deleted",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "profile",
    subjectId: profile.id,
    payload: { profile_id: profile.id, source: "admin_delete" },
  });

  revalidatePath("/app/admin/leden");
  revalidatePath("/app/admin");

  return { ok: true, message: "Lid verwijderd." };
}
