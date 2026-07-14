"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import PtTrainerChange from "@/emails/pt_trainer_change";

/**
 * PT-agenda C1: annuleren en verzetten van een PT-boeking. De RPC's
 * autoriseren zelf (eigen boeking, eigen-sessie-trainer of admin, sinds
 * C4); deze actions verzorgen het event-spoor en de trainer-notificatie.
 * De notificatie gaat UITSLUITEND
 * bij een lid-geinitieerde actie (via trainers.profile_id naar
 * profiles.email), nooit bij Marlon-eigen acties. Per gebeurtenis, geen
 * digest. Push volgt later (stille no-op tot het Firebase-project er is).
 *
 * PR E hangt hier de leden-UI aan (/app/boekingen); PR C2 het
 * admin-scherm.
 *
 * PR J: cancel_pt accepteert nu ook een expliciete p_with_restitution
 * (staff-only, true/false); zonder die parameter (null) blijft het
 * annuleringsvenster de refund-beslissing nemen zoals voorheen. Het
 * lid-pad (cancelPtBooking zonder tweede argument) verandert dus niet.
 */

// COPY: confirm met Marlon
const PT_MANAGE_REASON_COPY: Record<string, string> = {
  not_found: "Deze boeking bestaat niet (meer).",
  not_cancellable: "Deze boeking kan niet meer geannuleerd worden.",
  not_reschedulable: "Deze boeking kan niet meer verzet worden.",
  session_in_past: "Deze sessie is al geweest.",
  new_start_in_past: "Het nieuwe moment ligt in het verleden.",
  outside_window: "Verzetten kan niet meer zo kort voor de sessie.",
  override_not_allowed: "Deze optie is alleen voor de studio.",
  pt_overlap: "Het nieuwe moment overlapt met een bestaande afspraak.",
  pt_no_turnaround: "Te weinig omkleedtijd rond het nieuwe moment.",
  // COPY: confirm met Marlon
  restitution_not_allowed:
    "Alleen een trainer of beheerder kan de restitutie-keuze maken.",
};

export type PtManageResult =
  | { ok: true; withinWindow?: boolean; creditsRefunded?: boolean }
  | { ok: false; message: string; reason?: string; conflictAt?: string };

/**
 * C4: actor-afleiding server-side (niet via een parameter, die zou vanaf
 * de client spoofbaar zijn). Admin via profiel-rol; trainer via een
 * actieve trainers-rij, dezelfde definitie als tmc.is_staff(). Rollen
 * zijn single-string (geen trainer+member combos), dus een actieve
 * trainer handelt hier per definitie als trainer.
 */
async function callerActorType(
  userId: string,
): Promise<"admin" | "trainer" | "member"> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (data?.role === "admin") return "admin";

  const admin = createAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select("id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return trainer ? "trainer" : "member";
}

/** Trainer-mail bij een lid-geinitieerde wijziging. Faalt stil. */
async function notifyTrainerOfChange(args: {
  trainerId: string;
  memberProfileId: string;
  kind: "cancelled" | "rescheduled";
  whenLabel: string;
  newWhenLabel?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: trainer }, { data: member }] = await Promise.all([
      admin
        .from("trainers")
        .select("display_name, profile:profiles!trainers_profile_id_fkey(first_name, email)")
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
      console.error("[notifyTrainerOfChange] trainer zonder e-mail", args.trainerId);
      return;
    }
    const memberLabel =
      [member?.first_name, member?.last_name].filter(Boolean).join(" ") ||
      member?.email ||
      "Een lid";
    await sendEmail({
      to: trainerProfile.email,
      toName: trainerProfile.first_name ?? trainer?.display_name ?? undefined,
      subject:
        args.kind === "cancelled"
          ? "PT-sessie geannuleerd" // COPY: confirm met Marlon
          : "PT-sessie verzet", // COPY: confirm met Marlon
      react: PtTrainerChange({
        trainerName: trainerProfile.first_name ?? trainer?.display_name ?? "coach",
        memberLabel,
        kind: args.kind,
        whenLabel: args.whenLabel,
        newWhenLabel: args.newWhenLabel,
        siteUrl: siteUrl(),
      }),
    });
  } catch (err) {
    console.error("[notifyTrainerOfChange] skipped", err);
  }
}

export async function cancelPtBooking(
  ptBookingId: string,
  withRestitution?: boolean,
): Promise<PtManageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: result, error: rpcError } = await supabase.rpc("cancel_pt", {
    p_pt_booking_id: ptBookingId,
    p_with_restitution: withRestitution ?? null,
  });
  if (rpcError) {
    console.error("[cancelPtBooking] rpc", rpcError);
    return { ok: false, message: "Annuleren lukte niet. Probeer opnieuw." };
  }
  if (!result?.ok) {
    return {
      ok: false,
      message:
        PT_MANAGE_REASON_COPY[result?.reason] ?? "Annuleren lukte niet.",
      reason: result?.reason ?? undefined,
    };
  }

  const actorType = await callerActorType(user.id);

  await emitEvent({
    type: "pt_booking.cancelled",
    actorType,
    actorId: user.id,
    subjectType: "pt_booking",
    subjectId: ptBookingId,
    payload: {
      profile_id: result.profile_id,
      pt_session_id: result.pt_session_id,
      within_window: result.within_window,
      credits_refunded: result.credits_refunded,
      restitution_explicit: result.restitution_explicit,
    },
  });

  if (actorType === "member") {
    const start = new Date(result.start_at);
    await notifyTrainerOfChange({
      trainerId: result.trainer_id,
      memberProfileId: result.profile_id,
      kind: "cancelled",
      whenLabel: formatWeekdayDate(start) + " · " + start.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }),
    });
  }

  revalidatePath("/app/boekingen");
  revalidatePath("/app");

  return {
    ok: true,
    withinWindow: Boolean(result.within_window),
    creditsRefunded: Boolean(result.credits_refunded),
  };
}

export async function reschedulePtBooking(
  ptBookingId: string,
  newStartAt: string,
  opts?: { allowOverlap?: boolean; allowNoTurnaround?: boolean },
): Promise<PtManageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: result, error: rpcError } = await supabase.rpc(
    "reschedule_pt",
    {
      p_pt_booking_id: ptBookingId,
      p_new_start_at: newStartAt,
      p_allow_overlap: opts?.allowOverlap ?? false,
      p_allow_no_turnaround: opts?.allowNoTurnaround ?? false,
    },
  );
  if (rpcError) {
    console.error("[reschedulePtBooking] rpc", rpcError);
    return { ok: false, message: "Verzetten lukte niet. Probeer opnieuw." };
  }
  if (!result?.ok) {
    return {
      ok: false,
      message:
        PT_MANAGE_REASON_COPY[result?.reason] ?? "Verzetten lukte niet.",
      reason: result?.reason ?? undefined,
      conflictAt: result?.conflict_at ?? undefined,
    };
  }

  const actorType = await callerActorType(user.id);

  await emitEvent({
    type: "pt_booking.rescheduled",
    actorType,
    actorId: user.id,
    subjectType: "pt_booking",
    subjectId: ptBookingId,
    payload: {
      profile_id: result.profile_id,
      pt_session_id: result.pt_session_id,
      old_start_at: result.old_start_at,
      new_start_at: result.new_start_at,
    },
  });

  if (actorType === "member") {
    const oldStart = new Date(result.old_start_at);
    const newStart = new Date(result.new_start_at);
    const newEnd = new Date(result.new_end_at);
    await notifyTrainerOfChange({
      trainerId: result.trainer_id,
      memberProfileId: result.profile_id,
      kind: "rescheduled",
      whenLabel: formatWeekdayDate(oldStart) + " · " + oldStart.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }),
      newWhenLabel: `${formatWeekdayDate(newStart)} · ${formatTimeRange(newStart, newEnd)}`,
    });
  }

  revalidatePath("/app/boekingen");
  revalidatePath("/app");

  return { ok: true };
}
