import { bookingTimes } from "@/lib/member/booking-times";
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import TrialCodeConfirmation from "@/emails/trial_code_confirmation";
import TrialBookingReminder from "@/emails/trial_booking_reminder";
import TrialBookingCancelledByStudio from "@/emails/trial_booking_cancelled_by_studio";
import type { TrialBookingSource } from "@/lib/opening-trial/rules";
import { isMissingColumnError } from "@/lib/supabase/missing-column";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";
import { formatPriceEuro } from "@/lib/member/pt-pricing";
import { siteUrl } from "@/lib/site-url";

/**
 * Fire-and-forget bevestigingsmail naar de bezoeker na een geslaagde
 * proefles-betaling of een gratis boeking met proefcode. Drie callers,
 * allemaal "trial_booking is paid": /api/trial-bookings/webhook (het
 * normale betaalde pad), startTrialBooking met proefcode (gratis, direct
 * bevestigd, price_paid_cents 0 dus zonder prijsregel) en de expire-orders
 * cron (reconciliatie tegen Mollie als de webhook nooit aankwam; de cron
 * beweerde al "hetzelfde vervolg als de webhook", dat klopte tot deze fix
 * niet voor de e-mail zelf). Vóór deze functie stuurde alleen de ntfy naar
 * de staf: de bezoeker kreeg de cancel_token nooit te zien, terwijl het
 * annuleringsvenster (booking_settings.cancellation_window_hours) wel werd
 * gehandhaafd — iemand kon dus niet annuleren en verloor zijn geld zonder
 * ooit de kans te hebben gekregen. Blokkerend voor de studio-opening op
 * 2026-08-15.
 *
 * Zelfde template als de gratis code-variant (trial_code_confirmation.tsx,
 * community-growth PR D): één template, twee gevallen, priceLabel is het
 * enige verschil. Nooit throwen: try/catch hier is de backstop naast
 * sendEmail's eigen interne catch, zodat een mislukte mail nooit de
 * webhook een niet-2xx laat teruggeven of de cron laat falen.
 */
export async function sendTrialBookingConfirmationEmail(trial: {
  id: string;
  session_id: string;
  name: string;
  email: string;
  cancel_token: string;
  price_paid_cents: number;
  /**
   * trial_bookings.source. Ontbreekt bij de webhook en de cron (die lezen
   * de rij niet opnieuw); dan wordt hij hier uit de rij gelezen. "opening"
   * voegt in de mail de regel over de gratis openingsperiode toe.
   */
  source?: TrialBookingSource;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: session } = await admin
      .from("class_sessions")
      .select(
        `
          start_at, end_at,
          class_type:class_types(name),
          trainer:trainers(display_name)
        `,
      )
      .eq("id", trial.session_id)
      .maybeSingle();

    if (!session) {
      console.error(
        "[trial-booking-email] skipped: session not found",
        trial.session_id,
      );
      return;
    }

    type ClassTypeRel = { name: string } | { name: string }[] | null;
    type TrainerRel = { display_name: string } | { display_name: string }[] | null;
    const classTypeRaw = session.class_type as ClassTypeRel;
    const trainerRaw = session.trainer as TrainerRel;
    const className = Array.isArray(classTypeRaw)
      ? (classTypeRaw[0]?.name ?? "Proefles")
      : (classTypeRaw?.name ?? "Proefles");
    const trainerName = Array.isArray(trainerRaw)
      ? (trainerRaw[0]?.display_name ?? "coach")
      : (trainerRaw?.display_name ?? "coach");

    // Een proefuur vrij trainen toont het slot (bv. 18:00 tot 19:00), niet de
    // dagsessie van 07:00 tot 21:00.
    // Zonder de kolom source (tot de migratie van de gratis openingsperiode
    // is gepusht) dezelfde rij zonder die kolom.
    let slotRes = await admin
      .from("trial_bookings")
      .select("slot_start_at, slot_end_at, source")
      .eq("id", trial.id)
      .maybeSingle();
    if (slotRes.error && isMissingColumnError(slotRes.error)) {
      slotRes = await admin
        .from("trial_bookings")
        .select("slot_start_at, slot_end_at")
        .eq("id", trial.id)
        .maybeSingle();
    }
    const slotRow = slotRes.data as
      | { slot_start_at: string | null; slot_end_at: string | null; source?: string | null }
      | null;
    const isSlot = Boolean(slotRow?.slot_start_at);
    const source: TrialBookingSource =
      trial.source ??
      (slotRow?.source === "opening" || slotRow?.source === "code" ? slotRow.source : "paid");
    const times = bookingTimes(
      { slot_start_at: slotRow?.slot_start_at, slot_end_at: slotRow?.slot_end_at },
      { start_at: session.start_at, end_at: session.end_at },
    );
    const startAt = new Date(times.startAt);
    const endAt = new Date(times.endAt);
    const whenLabel = `${formatWeekdayDate(startAt)} · ${formatTimeRange(startAt, endAt)}`;

    const { data: settings } = await admin
      .from("booking_settings")
      .select("cancellation_window_hours")
      .limit(1)
      .maybeSingle();
    const cancellationWindowHours = settings?.cancellation_window_hours ?? 6;

    const cancelUrl = `${siteUrl()}/proefles/annuleren/${trial.cancel_token}`;
    const firstName = trial.name.split(" ")[0] ?? "";

    await sendEmail({
      to: trial.email,
      toName: firstName,
      // COPY: confirm met Marlon
      subject: `Je proefles staat vast: ${isSlot ? "Vrij trainen" : className} · ${whenLabel}`,
      react: TrialCodeConfirmation({
        firstName,
        // COPY: confirm met Marlon
        className: isSlot ? "Vrij trainen" : className,
        // Bij vrij trainen is Marlon er altijd bij (aanwezigheidsvenster).
        trainerName: isSlot ? "Marlon" : trainerName,
        whenLabel,
        cancelUrl,
        cancellationWindowHours,
        variant: isSlot ? "vrij_trainen" : "group",
        source,
        // Gratis (code of openingsperiode): geen prijsregel en geen
        // betaalverwijzing.
        priceLabel:
          trial.price_paid_cents > 0 ? formatPriceEuro(trial.price_paid_cents) : null,
      }),
    });
  } catch (err) {
    console.error(
      "[trial-booking-email] confirmation email failed",
      trial.id,
      err,
    );
  }
}

/**
 * Herinnering een dag van tevoren voor een proefboeking (betaald, via code
 * of gratis in de openingsperiode), aangeroepen door de send-reminders cron
 * na de stempel op reminder_sent_at. Geeft terug of MailerSend de mail heeft
 * aangenomen; nooit throwen.
 */
export async function sendTrialBookingReminderEmail(args: {
  name: string;
  email: string;
  cancelToken: string;
  className: string;
  trainerName: string;
  startAt: Date;
  endAt: Date;
  isSlot: boolean;
  cancellationWindowHours: number;
}): Promise<boolean> {
  try {
    const firstName = args.name.split(" ")[0] ?? "";
    const whenLabel = `${formatWeekdayDate(args.startAt)} · ${formatTimeRange(args.startAt, args.endAt)}`;
    // COPY: confirm met Marlon
    const className = args.isSlot ? "Vrij trainen" : args.className;
    return await sendEmail({
      to: args.email,
      toName: firstName,
      // COPY: confirm met Marlon
      subject: `Morgen: je proefles ${className}`,
      react: TrialBookingReminder({
        firstName,
        className,
        // Bij vrij trainen is Marlon er altijd bij (aanwezigheidsvenster).
        trainerName: args.isSlot ? "Marlon" : args.trainerName,
        whenLabel,
        cancelUrl: `${siteUrl()}/proefles/annuleren/${args.cancelToken}`,
        cancellationWindowHours: args.cancellationWindowHours,
        variant: args.isSlot ? "vrij_trainen" : "group",
      }),
    });
  } catch (err) {
    console.error("[trial-booking-email] reminder failed", err);
    return false;
  }
}

/**
 * Annuleringsmail na een annulering door de studio (losse admin-annulering,
 * sessie-annulering of de webhook-bijvangst). Fire-and-forget: nooit
 * throwen, alleen loggen. Zelfservice-annulering door de bezoeker stuurt
 * bewust geen mail (spec-community-growth.md §1).
 */
export async function sendTrialBookingCancelledEmail(args: {
  trialBookingId: string;
  reason: string;
  /** Terug te betalen bedrag in centen; 0 of null bij een codeboeking. */
  refundAmountCents: number | null;
}): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data: trial } = await admin
      .from("trial_bookings")
      .select(
        `
          id, name, email, trial_code_id,
          session:class_sessions(start_at, end_at, class_type:class_types(name)),
          trial_code:trial_codes!trial_bookings_trial_code_id_fkey(revoked_at, max_uses, uses_count)
        `,
      )
      .eq("id", args.trialBookingId)
      .maybeSingle();
    if (!trial) {
      console.error("[trial-booking-email] cancel skipped: booking not found", args.trialBookingId);
      return false;
    }

    type SessionRel = {
      start_at: string;
      end_at: string;
      class_type: { name: string } | { name: string }[] | null;
    } | null;
    const session = (Array.isArray(trial.session) ? trial.session[0] : trial.session) as unknown as SessionRel;
    const classTypeRaw = session?.class_type;
    const className = Array.isArray(classTypeRaw)
      ? (classTypeRaw[0]?.name ?? "Proefles")
      : (classTypeRaw?.name ?? "Proefles");
    const startAt = session ? new Date(session.start_at) : new Date();
    const endAt = session ? new Date(session.end_at) : startAt;
    const whenLabel = `${formatWeekdayDate(startAt)} · ${formatTimeRange(startAt, endAt)}`;

    type CodeRel = { revoked_at: string | null; max_uses: number | null; uses_count: number };
    const codeRaw = trial.trial_code as unknown as CodeRel | CodeRel[] | null;
    const code = Array.isArray(codeRaw) ? (codeRaw[0] ?? null) : codeRaw;
    const codeReusable = Boolean(
      code && code.revoked_at === null && (code.max_uses === null || code.uses_count < code.max_uses),
    );

    const firstName = trial.name.split(" ")[0] ?? "";
    const refundAmountLabel =
      args.refundAmountCents && args.refundAmountCents > 0
        ? (args.refundAmountCents / 100).toFixed(2).replace(".", ",")
        : null;

    return await sendEmail({
      to: trial.email,
      toName: firstName,
      // COPY: confirm met Marlon
      subject: `Proefles geannuleerd: ${className} · ${whenLabel}`,
      react: TrialBookingCancelledByStudio({
        firstName,
        className,
        whenLabel,
        reason: args.reason,
        refundAmountLabel,
        codeReusable,
        siteUrl: siteUrl(),
      }),
    });
  } catch (err) {
    console.error("[trial-booking-email] cancel email failed", args.trialBookingId, err);
    return false;
  }
}
