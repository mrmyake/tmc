"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import PtCancellationRequest from "@/emails/pt_cancellation_request";

/**
 * PT-agenda PR E2: een lid dient een ANNULEER-VERZOEK in op een eigen
 * PT-boeking. Het verzoek muteert de agenda nooit zelf; de sessie blijft
 * staan tot staf het verzoek afhandelt (src/lib/admin/
 * pt-cancellation-actions.ts). De RPC autoriseert zelf (alleen de
 * eigenaar, status booked, toekomstige sessie, geen tweede pending
 * verzoek); deze action verzorgt het event-spoor en de trainer-mail.
 *
 * De mail gaat naar de trainer van de sessie (trainers.profile_id naar
 * profiles.email), nooit hardcoded naar Marlon; zelfde conventie als
 * notifyTrainerOfChange in pt-manage-actions.ts. Push blijft een stille
 * no-op tot het Firebase-project bestaat.
 */

// COPY: confirm met Marlon
const REQUEST_REASON_COPY: Record<string, string> = {
  not_found: "Deze boeking bestaat niet (meer).",
  not_requestable: "Voor deze boeking kan geen annulering aangevraagd worden.",
  session_in_past: "Deze sessie is al geweest.",
  pending_exists: "Er staat al een annuleringsverzoek voor deze sessie.",
};

// COPY: confirm met Marlon
const SESSION_LABEL: Record<string, string> = {
  one_on_one: "PT-sessie",
  duo: "duo-sessie",
  small_group_4: "small group-sessie",
};

export type RequestPtCancellationResult =
  | { ok: true }
  | { ok: false; message: string; reason?: string };

export async function requestPtCancellation(
  ptBookingId: string,
  reason?: string,
): Promise<RequestPtCancellationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // COPY: confirm met Marlon
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const trimmedReason = reason?.trim() || null;

  const { data: result, error: rpcError } = await supabase.rpc(
    "request_pt_cancellation",
    {
      p_pt_booking_id: ptBookingId,
      p_reason: trimmedReason,
    },
  );
  if (rpcError) {
    console.error("[requestPtCancellation] rpc", rpcError);
    // COPY: confirm met Marlon
    return { ok: false, message: "Aanvragen lukte niet. Probeer opnieuw." };
  }
  if (!result?.ok) {
    return {
      ok: false,
      message:
        // COPY: confirm met Marlon
        REQUEST_REASON_COPY[result?.reason] ?? "Aanvragen lukte niet.",
      reason: result?.reason ?? undefined,
    };
  }

  await emitEvent({
    type: "pt_booking.cancellation_requested",
    actorType: "member",
    actorId: user.id,
    subjectType: "pt_booking",
    subjectId: ptBookingId,
    payload: {
      request_id: result.request_id,
      pt_session_id: result.pt_session_id,
      trainer_id: result.trainer_id,
      start_at: result.start_at,
      has_reason: Boolean(trimmedReason),
    },
  });

  await notifyTrainerOfRequest({
    trainerId: result.trainer_id,
    memberProfileId: result.profile_id,
    format: result.format,
    startAt: result.start_at,
    endAt: result.end_at,
    reason: trimmedReason,
  });

  revalidatePath("/app/boekingen");

  return { ok: true };
}

/** Trainer-mail bij een nieuw annuleer-verzoek. Faalt stil. */
async function notifyTrainerOfRequest(args: {
  trainerId: string;
  memberProfileId: string;
  format: string | null;
  startAt: string;
  endAt: string;
  reason: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: trainer }, { data: member }] = await Promise.all([
      admin
        .from("trainers")
        .select(
          "display_name, profile:profiles!trainers_profile_id_fkey(first_name, email)",
        )
        .eq("id", args.trainerId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", args.memberProfileId)
        .maybeSingle(),
    ]);
    const trainerProfile = Array.isArray(trainer?.profile)
      ? trainer?.profile[0]
      : trainer?.profile;
    if (!trainerProfile?.email) {
      console.error(
        "[notifyTrainerOfRequest] trainer zonder e-mail",
        args.trainerId,
      );
      return;
    }
    const memberLabel =
      [member?.first_name, member?.last_name].filter(Boolean).join(" ") ||
      member?.email ||
      "Een lid";
    const start = new Date(args.startAt);
    const end = new Date(args.endAt);
    await sendEmail({
      to: trainerProfile.email,
      toName: trainerProfile.first_name ?? trainer?.display_name ?? undefined,
      // COPY: confirm met Marlon
      subject: "Annulering aangevraagd voor een PT-sessie",
      react: PtCancellationRequest({
        trainerName:
          trainerProfile.first_name ?? trainer?.display_name ?? "coach",
        memberLabel,
        sessionLabel:
          (args.format && SESSION_LABEL[args.format]) ?? "PT-sessie",
        whenLabel: `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`,
        reason: args.reason,
        siteUrl: siteUrl(),
      }),
    });
  } catch (err) {
    console.error("[notifyTrainerOfRequest] skipped", err);
  }
}
