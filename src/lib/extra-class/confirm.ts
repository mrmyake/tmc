import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/events/emit";
import { sendEmail } from "@/lib/email";
import { sendNotification } from "@/lib/ntfy";
import { processPaymentRefund } from "@/lib/refunds/process";
import { notifyTrainerLastMinuteBooking } from "@/lib/alerts/last-minute-trainer";
import BookingConfirmation from "@/emails/booking_confirmation";
import { formatRelativeWhen, formatTimeRange } from "@/lib/format-date";
import { bookingTimes } from "@/lib/member/booking-times";
import { siteUrl } from "@/lib/site-url";
import { euroLabel, type ExtraClassOutcome } from "./core";

/**
 * De uitkomst van een betaling voor een extra les toepassen: webhook en cron
 * komen hier allebei langs (spec-weekcap-extra-les.md). De statusovergang
 * zelf doet tmc.confirm_extra_class_booking (service_role, idempotent);
 * hier alleen het vervolg per uitkomst.
 *
 *  confirmed, confirmed_late: event, bevestigingsmail, trainersmelding.
 *  released: event (de plek is vrij).
 *  refund_needed: te late betaling zonder plek of buiten de regels: refund-
 *    intentie via tmc.request_booking_refund, direct ingediend bij Mollie via
 *    processPaymentRefund, ntfy en event.
 *  already_confirmed, ignored: niets (herhaling).
 * Throwt nooit richting de aanroeper; een mislukte mail of melding draait
 * de boeking niet terug.
 */

export type ConfirmResult =
  | "confirmed"
  | "confirmed_late"
  | "released"
  | "refund_needed"
  | "already_confirmed"
  | "ignored"
  | "error";

type ConfirmRpc = {
  ok: boolean;
  result?: string;
  reason?: string;
  profile_id?: string;
  session_id?: string;
  pillar?: string;
  slot_start_at?: string | null;
  slot_end_at?: string | null;
  waitlist_confirmed?: boolean;
};

export async function applyExtraClassOutcome(args: {
  admin: SupabaseClient;
  bookingId: string;
  molliePaymentId: string | null;
  outcome: ExtraClassOutcome;
  amountCents: number | null;
  via: "webhook" | "cron" | "resume";
}): Promise<ConfirmResult> {
  const { admin, bookingId, outcome } = args;
  const { data, error } = await admin.rpc("confirm_extra_class_booking", {
    p_booking_id: bookingId,
    p_mollie_payment_id: args.molliePaymentId,
    p_outcome: outcome,
  });
  if (error) {
    console.error("[extra-class] confirm rpc failed", bookingId, error);
    return "error";
  }
  const r = (data ?? {}) as ConfirmRpc;
  if (!r.ok) {
    console.warn("[extra-class] confirm refused", bookingId, r.reason);
    return "error";
  }

  if (r.result === "confirmed" || r.result === "confirmed_late") {
    await emitEvent({
      type: "booking.extra_class_confirmed",
      actorType: "system",
      actorId: null,
      subjectType: "booking",
      subjectId: bookingId,
      payload: {
        profile_id: r.profile_id ?? null,
        session_id: r.session_id ?? null,
        pillar: r.pillar ?? null,
        payment_id: args.molliePaymentId,
        amount_cents: args.amountCents,
        late: r.result === "confirmed_late",
        via: args.via,
      },
    });
    if (r.profile_id && r.session_id) {
      await sendExtraClassConfirmationEmail(admin, {
        profileId: r.profile_id,
        sessionId: r.session_id,
        slotStartAt: r.slot_start_at ?? null,
        slotEndAt: r.slot_end_at ?? null,
        amountCents: args.amountCents,
      });
      await notifyTrainerLastMinuteBooking({
        sessionId: r.session_id,
        source: r.waitlist_confirmed ? "waitlist" : "member",
        participantId: bookingId,
      });
    }
    return r.result;
  }

  if (r.result === "released") {
    await emitEvent({
      type: "booking.extra_class_released",
      actorType: "system",
      actorId: null,
      subjectType: "booking",
      subjectId: bookingId,
      payload: {
        profile_id: r.profile_id ?? null,
        session_id: r.session_id ?? null,
        payment_id: args.molliePaymentId,
        outcome,
        via: args.via,
      },
    });
    return "released";
  }

  if (r.result === "refund_needed") {
    const { data: refundData, error: refundErr } = await admin.rpc("request_booking_refund", {
      p_booking_id: bookingId,
      p_reason: `Te late betaling, geen plek meer (${r.reason ?? "onbekend"})`,
      p_actor_type: "system",
      p_actor_id: null,
    });
    const refund = (refundData ?? {}) as { ok?: boolean; refund_id?: string; skipped?: string };
    let refundStatus: string | null = null;
    if (refundErr) {
      console.error("[extra-class] refund request failed", bookingId, refundErr);
    } else if (refund.ok && refund.refund_id) {
      const processed = await processPaymentRefund(refund.refund_id);
      refundStatus = processed.status;
    } else {
      refundStatus = refund.skipped ?? null;
    }
    await emitEvent({
      type: "booking.extra_class_refunded",
      actorType: "system",
      actorId: null,
      subjectType: "booking",
      subjectId: bookingId,
      payload: {
        profile_id: r.profile_id ?? null,
        session_id: r.session_id ?? null,
        payment_id: args.molliePaymentId,
        amount_cents: args.amountCents,
        gate_reason: r.reason ?? null,
        refund_id: refund.refund_id ?? null,
        refund_status: refundStatus,
        via: args.via,
      },
    });
    await sendNotification(
      // COPY: confirm met Marlon
      "Extra les te laat betaald",
      `Boeking ${bookingId} is betaald nadat de plek was vrijgegeven en past niet meer (${r.reason ?? "onbekend"}). Terugbetaling: ${refundStatus ?? "niet aangemaakt"}. Controleer in het Mollie-dashboard als dit niet 'pending' of 'refunded' is.`,
      "warning",
    );
    return "refund_needed";
  }

  if (r.result === "already_confirmed") return "already_confirmed";
  return "ignored";
}

async function sendExtraClassConfirmationEmail(
  admin: SupabaseClient,
  args: {
    profileId: string;
    sessionId: string;
    slotStartAt: string | null;
    slotEndAt: string | null;
    amountCents: number | null;
  },
): Promise<void> {
  try {
    const [profileRes, sessionRes] = await Promise.all([
      admin.from("profiles").select("first_name, email").eq("id", args.profileId).maybeSingle(),
      admin
        .from("class_sessions")
        .select(
          `start_at, end_at,
           class_type:class_types(name),
           trainer:trainers(display_name)`,
        )
        .eq("id", args.sessionId)
        .maybeSingle(),
    ]);
    const profile = profileRes.data as { first_name: string | null; email: string | null } | null;
    const sessionRow = sessionRes.data as
      | {
          start_at: string;
          end_at: string;
          class_type: { name: string | null } | { name: string | null }[] | null;
          trainer: { display_name: string | null } | { display_name: string | null }[] | null;
        }
      | null;
    if (!profile?.email || !sessionRow) return;
    const ct = Array.isArray(sessionRow.class_type) ? sessionRow.class_type[0] : sessionRow.class_type;
    const tr = Array.isArray(sessionRow.trainer) ? sessionRow.trainer[0] : sessionRow.trainer;
    const times = bookingTimes(
      { slot_start_at: args.slotStartAt, slot_end_at: args.slotEndAt },
      sessionRow,
    );
    const start = new Date(times.startAt);
    const end = new Date(times.endAt);
    const whenLabel = `${formatRelativeWhen(start).replace(/\s·\s.*/, "")} · ${formatTimeRange(start, end)}`;
    await sendEmail({
      to: profile.email,
      toName: profile.first_name ?? undefined,
      subject: `Bevestigd: ${ct?.name ?? "Sessie"} ${whenLabel}`,
      react: BookingConfirmation({
        firstName: profile.first_name ?? "",
        className: ct?.name ?? "Sessie",
        trainerName: tr?.display_name ?? "je coach",
        whenLabel,
        siteUrl: siteUrl(),
        paidLabel:
          args.amountCents !== null
            ? // COPY: confirm met Marlon
              `Betaald als extra les: ${euroLabel(args.amountCents)}. Annuleer je op tijd, dan storten we het bedrag terug.`
            : null,
      }),
    });
  } catch (err) {
    console.error("[extra-class] confirmation email skipped", err);
  }
}
