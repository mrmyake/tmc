"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import { emitEvent } from "@/lib/events/emit";
import { pauseMembershipCore } from "./membership-lifecycle";

export type PausesActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function revalidateAll(profileId?: string) {
  revalidatePath("/app/admin/pauzes");
  revalidatePath("/app/admin");
  if (profileId) revalidatePath(`/app/admin/leden/${profileId}`);
}

export async function approveMembershipPause(
  pauseId: string,
): Promise<PausesActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: pause } = await admin
    .from("membership_pauses")
    .select(
      "id, status, membership_id, reason, membership:memberships(profile_id, status)",
    )
    .eq("id", pauseId)
    .maybeSingle();

  if (!pause) return { ok: false, message: "Pauze-aanvraag niet gevonden." };
  if (pause.status !== "pending") {
    return { ok: false, message: "Deze aanvraag is al verwerkt." };
  }

  type MembershipRef =
    | { profile_id: string; status: string }
    | { profile_id: string; status: string }[]
    | null;
  const m = (
    Array.isArray(pause.membership) ? pause.membership[0] : pause.membership
  ) as MembershipRef extends null
    ? never
    : { profile_id: string; status: string } | null;

  // Goedkeuren loopt volledig via de gedeelde lifecycle-laag: Mollie-incasso
  // eerst gestopt, daarna de definer-RPC tmc.admin_pause_membership die de
  // aanvraag-rij effectueert, het pauzevenster opent en boekingen in het
  // venster annuleert. Beleid: de pauze gaat in op het einde van de lopende
  // betaalde cyclus; de aangevraagde datums zijn adviserend.
  const result = await pauseMembershipCore({
    membershipId: pause.membership_id,
    pauseRequestId: pauseId,
    reason: pause.reason,
  });
  if (!result.ok) return { ok: false, message: result.message };

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "pause_approved",
    target_type: "profile",
    target_id: m?.profile_id ?? pauseId,
    details: {
      pause_id: pauseId,
      membership_id: pause.membership_id,
      pause_effective_date: result.effectiveDate ?? null,
      cancelled_bookings: result.cancelledBookings ?? 0,
    },
  });

  await emitEvent({
    type: "membership.pause_granted",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "membership",
    subjectId: pause.membership_id,
    payload: {
      profile_id: m?.profile_id ?? null,
      pause_id: pauseId,
      membership_id: pause.membership_id,
      pause_effective_date: result.effectiveDate ?? null,
    },
  });

  revalidateAll(m?.profile_id);
  return { ok: true, message: result.message };
}

export async function rejectMembershipPause(
  pauseId: string,
  reason: string,
): Promise<PausesActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const trimmed = reason?.trim();
  if (!trimmed) return { ok: false, message: "Geef een reden op." };

  const admin = createAdminClient();
  const { data: pause } = await admin
    .from("membership_pauses")
    .select(
      "id, status, membership_id, membership:memberships(profile_id)",
    )
    .eq("id", pauseId)
    .maybeSingle();

  if (!pause) return { ok: false, message: "Pauze-aanvraag niet gevonden." };
  if (pause.status !== "pending") {
    return { ok: false, message: "Deze aanvraag is al verwerkt." };
  }

  const nowIso = new Date().toISOString();

  const { error } = await admin
    .from("membership_pauses")
    .update({
      status: "rejected",
      approved_by: auth.userId,
      approved_at: nowIso,
      notes: trimmed,
    })
    .eq("id", pauseId);

  if (error) {
    console.error("[rejectMembershipPause] update failed", error);
    return { ok: false, message: "Afwijzen lukte niet." };
  }

  type MembershipRef =
    | { profile_id: string }
    | { profile_id: string }[]
    | null;
  const m = (
    Array.isArray(pause.membership) ? pause.membership[0] : pause.membership
  ) as { profile_id: string } | null;
  void (0 as unknown as MembershipRef);

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "pause_rejected",
    target_type: "profile",
    target_id: m?.profile_id ?? pauseId,
    details: {
      pause_id: pauseId,
      membership_id: pause.membership_id,
      reason: trimmed,
    },
  });

  await emitEvent({
    type: "membership.pause_rejected",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "membership",
    subjectId: pause.membership_id,
    payload: {
      profile_id: m?.profile_id ?? null,
      pause_id: pauseId,
      membership_id: pause.membership_id,
      reason: trimmed,
    },
  });

  revalidateAll(m?.profile_id);
  return { ok: true, message: "Aanvraag afgewezen." };
}
