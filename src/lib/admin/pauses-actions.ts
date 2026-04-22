"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PausesActionResult =
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
      "id, status, membership_id, start_date, end_date, membership:memberships(profile_id, status)",
    )
    .eq("id", pauseId)
    .maybeSingle();

  if (!pause) return { ok: false, message: "Pauze-aanvraag niet gevonden." };
  if (pause.status !== "pending") {
    return { ok: false, message: "Deze aanvraag is al verwerkt." };
  }

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const { error: pauseErr } = await admin
    .from("membership_pauses")
    .update({
      status: "approved",
      approved_by: auth.userId,
      approved_at: nowIso,
    })
    .eq("id", pauseId);

  if (pauseErr) {
    console.error("[approveMembershipPause] update failed", pauseErr);
    return { ok: false, message: "Goedkeuren lukte niet." };
  }

  // Activeer pauze meteen als de startdatum vandaag of eerder is.
  type MembershipRef =
    | { profile_id: string; status: string }
    | { profile_id: string; status: string }[]
    | null;
  const m = (
    Array.isArray(pause.membership) ? pause.membership[0] : pause.membership
  ) as MembershipRef extends null
    ? never
    : { profile_id: string; status: string } | null;

  if (
    pause.start_date <= today &&
    pause.end_date >= today &&
    m?.status === "active"
  ) {
    await admin
      .from("memberships")
      .update({ status: "paused" })
      .eq("id", pause.membership_id);
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "pause_approved",
    target_type: "profile",
    target_id: m?.profile_id ?? pauseId,
    details: {
      pause_id: pauseId,
      membership_id: pause.membership_id,
      start_date: pause.start_date,
      end_date: pause.end_date,
    },
  });

  revalidateAll(m?.profile_id);
  return { ok: true, message: "Pauze goedgekeurd." };
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

  revalidateAll(m?.profile_id);
  return { ok: true, message: "Aanvraag afgewezen." };
}
