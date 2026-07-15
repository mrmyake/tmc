"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";
import { emitEvent } from "@/lib/events/emit";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { formatTime, formatWeekdayDate } from "@/lib/format-date";
import PtCancellationOutcome, {
  type PtCancellationOutcomeVariant,
} from "@/emails/pt_cancellation_outcome";

/**
 * PT-agenda PR E2: staf handelt een annuleer-verzoek van een lid af. De
 * KERN is de restitutie-keuze, niet goedkeuren-versus-afwijzen: bij
 * goedkeuren loopt de annulering integraal via het bestaande
 * tmc.cancel_pt-pad (PR J) met de gekozen restitutie; bij afwijzen
 * blijft de sessie ongemoeid. De RPC bewaakt de eigen-sessie-grens
 * (andermans sessie blijft not_found) en is idempotent (een al opgelost
 * verzoek weigert met already_resolved).
 *
 * Het lid krijgt altijd een uitkomst-mail (drie varianten); de
 * discriminator voor "credit terug" is credits_refunded uit de RPC, niet
 * de gekozen with_restitution, zodat een boeking zonder verrekende
 * credit (betaallink) nooit "credit teruggezet" leest.
 */

// COPY: confirm met Marlon
const RESOLVE_REASON_COPY: Record<string, string> = {
  not_found:
    "Dit verzoek bestaat niet (meer) of hoort niet bij jouw agenda.",
  already_resolved: "Dit verzoek is al afgehandeld.",
  restitution_required: "Kies eerst met of zonder restitutie.",
  session_in_past:
    "Deze sessie is al geweest. Wijs het verzoek af of markeer aanwezigheid.",
  not_cancellable:
    "Deze boeking is al geannuleerd of afgerond. Wijs het verzoek af.",
  restitution_not_allowed:
    "Alleen een trainer of beheerder kan de restitutie-keuze maken.",
};

// COPY: confirm met Marlon
const SESSION_LABEL: Record<string, string> = {
  one_on_one: "PT-sessie",
  duo: "duo-sessie",
  small_group_4: "small group-sessie",
};

export type ResolvePtCancellationResult =
  | { ok: true; outcome: "approved" | "rejected"; creditsRefunded: boolean }
  | { ok: false; message: string; reason?: string };

export async function resolvePtCancellation(args: {
  requestId: string;
  approve: boolean;
  withRestitution?: boolean;
  note?: string;
}): Promise<ResolvePtCancellationResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const supabase = await createClient();
  const { data: result, error: rpcError } = await supabase.rpc(
    "resolve_pt_cancellation",
    {
      p_request_id: args.requestId,
      p_approve: args.approve,
      p_with_restitution: args.withRestitution ?? null,
      p_note: args.note?.trim() || null,
    },
  );
  if (rpcError) {
    console.error("[resolvePtCancellation] rpc", rpcError);
    // COPY: confirm met Marlon
    return { ok: false, message: "Afhandelen lukte niet. Probeer opnieuw." };
  }
  if (!result?.ok) {
    const reason = result?.reason as string | undefined;
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: RESOLVE_REASON_COPY[reason ?? ""] ?? "Afhandelen lukte niet.",
      reason,
    };
  }

  const approved = result.outcome === "approved";
  const creditsRefunded = Boolean(result.credits_refunded);

  if (approved) {
    // De boeking is daadwerkelijk geannuleerd (via cancel_pt in de RPC),
    // dus het reguliere annulerings-event hoort ook in het spoor; de
    // TS-laag emit het hier omdat de RPC zelf niets in tmc.events
    // schrijft (zelfde conventie als alle pt_booking-events).
    await emitEvent({
      type: "pt_booking.cancelled",
      actorType: gate.actorType,
      actorId: gate.userId,
      subjectType: "pt_booking",
      subjectId: result.pt_booking_id,
      payload: {
        profile_id: result.profile_id,
        pt_session_id: result.pt_session_id,
        within_window: result.within_window,
        credits_refunded: creditsRefunded,
        restitution_explicit: true,
        via_cancellation_request: result.request_id,
      },
    });
  }

  await emitEvent({
    type: approved
      ? "pt_booking.cancellation_approved"
      : "pt_booking.cancellation_rejected",
    actorType: gate.actorType,
    actorId: gate.userId,
    subjectType: "pt_booking",
    subjectId: result.pt_booking_id,
    payload: {
      request_id: result.request_id,
      profile_id: result.profile_id,
      pt_session_id: result.pt_session_id,
      ...(approved
        ? {
            with_restitution: Boolean(result.with_restitution),
            credits_refunded: creditsRefunded,
          }
        : { has_note: Boolean(args.note?.trim()) }),
    },
  });

  await notifyMemberOfOutcome({
    memberProfileId: result.profile_id,
    variant: approved
      ? creditsRefunded
        ? "approved_refund"
        : "approved_no_refund"
      : "rejected",
    format: result.format,
    startAt: result.start_at,
    note: args.note?.trim() || null,
  });

  revalidatePath("/app/admin/pauzes");
  revalidatePath("/app/boekingen");
  revalidatePath("/app");

  return {
    ok: true,
    outcome: approved ? "approved" : "rejected",
    creditsRefunded,
  };
}

/** Uitkomst-mail naar het lid. Faalt stil. */
async function notifyMemberOfOutcome(args: {
  memberProfileId: string;
  variant: PtCancellationOutcomeVariant;
  format: string | null;
  startAt: string;
  note: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: member } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", args.memberProfileId)
      .maybeSingle();
    if (!member?.email) {
      console.error(
        "[notifyMemberOfOutcome] lid zonder e-mail",
        args.memberProfileId,
      );
      return;
    }
    const start = new Date(args.startAt);
    // COPY: confirm met Marlon
    const subject =
      args.variant === "rejected"
        ? "Je annuleringsverzoek is afgewezen"
        : "Je PT-sessie is geannuleerd";
    await sendEmail({
      to: member.email,
      toName: member.first_name ?? undefined,
      subject,
      react: PtCancellationOutcome({
        firstName: member.first_name ?? "sporter",
        variant: args.variant,
        sessionLabel:
          (args.format && SESSION_LABEL[args.format]) ?? "PT-sessie",
        whenLabel: `${formatWeekdayDate(start)} · ${formatTime(start)}`,
        creditLabel: args.format === "duo" ? "duo-credit" : "PT-credit",
        note: args.note,
        siteUrl: siteUrl(),
      }),
    });
  } catch (err) {
    console.error("[notifyMemberOfOutcome] skipped", err);
  }
}
