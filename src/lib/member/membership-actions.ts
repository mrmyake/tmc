"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";

export type PauseReason = "pregnancy" | "medical" | "other_approved";

export type MembershipActionResult =
  | { ok: true; message: string; effectiveDate?: string }
  | { ok: false; message: string };

interface PauseInput {
  membershipId: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  reason: PauseReason;
  notes?: string;
}

export async function requestMembershipPause(
  input: PauseInput,
): Promise<MembershipActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  if (
    !input.membershipId ||
    !input.startDate ||
    !input.endDate ||
    !input.reason
  ) {
    return { ok: false, message: "Vul alle velden in." };
  }
  if (input.endDate < input.startDate) {
    return { ok: false, message: "Einddatum moet na startdatum liggen." };
  }

  const { data: membership, error: mErr } = await supabase
    .from("memberships")
    .select("id, profile_id, status")
    .eq("id", input.membershipId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (mErr || !membership) {
    return { ok: false, message: "Abonnement niet gevonden." };
  }
  if (membership.status !== "active" && membership.status !== "paused") {
    return {
      ok: false,
      message: "Je abonnement staat niet open voor een pauze-verzoek.",
    };
  }

  const { data: pause, error } = await supabase
    .from("membership_pauses")
    .insert({
      membership_id: input.membershipId,
      requested_by: user.id,
      start_date: input.startDate,
      end_date: input.endDate,
      reason: input.reason,
      notes: input.notes?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[requestMembershipPause] insert failed", error);
    return {
      ok: false,
      message: "Verzoek kon niet worden opgeslagen. Probeer het opnieuw.",
    };
  }

  await emitEvent({
    type: "membership.pause_requested",
    actorType: "member",
    actorId: user.id,
    subjectType: "membership",
    subjectId: input.membershipId,
    payload: {
      profile_id: user.id,
      pause_id: pause.id,
      membership_id: input.membershipId,
      start_date: input.startDate,
      end_date: input.endDate,
      reason: input.reason,
    },
  });

  revalidatePath("/app/abonnement");

  return {
    ok: true,
    message:
      "Je pauze-verzoek staat. We beoordelen 'm en laten je zo snel mogelijk iets weten.",
  };
}

interface CancellationInput {
  membershipId: string;
}

/**
 * Self-service opzegging. De transitie + autorisatie zitten in de
 * SECURITY DEFINER RPC `tmc.request_membership_cancellation` (audit-fix #1):
 * `memberships` heeft geen self-UPDATE-policy (prijs-/lock-in-/mollie-
 * kolommen mag een lid nooit zelf raken), dus een kale `.update()` hier
 * matchte vroeger geen RLS-policy en raakte stil 0 rijen — geen error, wel
 * een "gelukt"-melding, en de incasso liep door. De RPC raise't nu een
 * echte exception bij een ongeldige/niet-eigen aanroep.
 */
export async function requestMembershipCancellation(
  input: CancellationInput,
): Promise<MembershipActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data, error } = await supabase
    .rpc("request_membership_cancellation", {
      p_membership_id: input.membershipId,
    })
    .select("cancellation_effective_date")
    .maybeSingle();

  if (error) {
    console.error("[requestMembershipCancellation] rpc failed", error);
    return {
      ok: false,
      message:
        error.message ||
        "Opzegging kon niet worden verwerkt. Probeer het opnieuw.",
    };
  }

  const effectiveDate = data?.cancellation_effective_date ?? null;

  await emitEvent({
    type: "membership.cancellation_requested",
    actorType: "member",
    actorId: user.id,
    subjectType: "membership",
    subjectId: input.membershipId,
    payload: {
      profile_id: user.id,
      membership_id: input.membershipId,
      effective_date: effectiveDate,
    },
  });

  revalidatePath("/app/abonnement");
  revalidatePath("/app");

  return {
    ok: true,
    message:
      "Je opzegverzoek staat. We bevestigen binnen een werkdag en zetten de incasso stop per einddatum.",
    effectiveDate: effectiveDate ?? undefined,
  };
}
