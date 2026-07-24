import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import TrialCodeConfirmation from "@/emails/trial_code_confirmation";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";
import { formatPriceEuro } from "@/lib/member/pt-pricing";
import { siteUrl } from "@/lib/site-url";

/**
 * Fire-and-forget bevestigingsmail naar de bezoeker na een geslaagde
 * proefles-betaling. Twee callers, allebei "trial_booking wordt paid":
 * /api/trial-bookings/webhook (het normale pad) en de expire-orders cron
 * (reconciliatie tegen Mollie als de webhook nooit aankwam — de cron
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

    const startAt = new Date(session.start_at);
    const endAt = new Date(session.end_at);
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
      subject: `Je proefles staat vast: ${className} · ${whenLabel}`,
      react: TrialCodeConfirmation({
        firstName,
        className,
        trainerName,
        whenLabel,
        cancelUrl,
        cancellationWindowHours,
        priceLabel: formatPriceEuro(trial.price_paid_cents),
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
