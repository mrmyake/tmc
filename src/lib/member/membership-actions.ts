"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PauseReason = "pregnancy" | "medical" | "other_approved";

export type MembershipActionResult =
  | { ok: true; message: string; effectiveDate?: string }
  | { ok: false; message: string };

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

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

  const { error } = await supabase.from("membership_pauses").insert({
    membership_id: input.membershipId,
    requested_by: user.id,
    start_date: input.startDate,
    end_date: input.endDate,
    reason: input.reason,
    notes: input.notes?.trim() || null,
    status: "pending",
  });

  if (error) {
    console.error("[requestMembershipPause] insert failed", error);
    return {
      ok: false,
      message: "Verzoek kon niet worden opgeslagen. Probeer het opnieuw.",
    };
  }

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

export async function requestMembershipCancellation(
  input: CancellationInput,
): Promise<MembershipActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: membership, error: mErr } = await supabase
    .from("memberships")
    .select("id, profile_id, status, commit_end_date")
    .eq("id", input.membershipId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (mErr || !membership) {
    return { ok: false, message: "Abonnement niet gevonden." };
  }
  if (membership.status === "cancellation_requested") {
    return { ok: false, message: "Je opzegverzoek staat al open." };
  }
  if (
    membership.status !== "active" &&
    membership.status !== "paused" &&
    membership.status !== "payment_failed"
  ) {
    return { ok: false, message: "Dit abonnement kan niet worden opgezegd." };
  }

  // Effective date: max of commit_end_date and today + 28 days (4 weeks notice).
  const effectiveDate = maxDate(
    membership.commit_end_date,
    todayPlus(28),
  );
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("memberships")
    .update({
      status: "cancellation_requested",
      cancellation_requested_at: nowIso,
      cancellation_effective_date: effectiveDate,
    })
    .eq("id", input.membershipId)
    .eq("profile_id", user.id);

  if (error) {
    console.error("[requestMembershipCancellation] update failed", error);
    return {
      ok: false,
      message: "Opzegging kon niet worden verwerkt. Probeer het opnieuw.",
    };
  }

  revalidatePath("/app/abonnement");
  revalidatePath("/app");

  return {
    ok: true,
    message:
      "Je opzegverzoek staat. We bevestigen binnen een werkdag en zetten de incasso stop per einddatum.",
    effectiveDate,
  };
}
