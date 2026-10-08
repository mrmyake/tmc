import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { emitEvent } from "@/lib/events/emit";
import { formatWeekdayDate, formatTimeRange, formatShortDateWithYear } from "@/lib/format-date";
import { siteUrl } from "@/lib/site-url";
import TrialCodeAbuseAlert, { type PriorFreeTrial } from "@/emails/trial_code_abuse_alert";
import { TRIAL_CODE_ABUSE_RECIPIENTS } from "./normalize";

interface AbuseAlertInput {
  trialBookingId: string;
  codeId: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  className: string;
  whenLabel: string;
}

type RedemptionRow = {
  id: string;
  redeemed_at: string;
  released_at: string | null;
  code: { code: string } | { code: string }[] | null;
  session:
    | {
        start_at: string;
        end_at: string;
        class_type: { name: string } | { name: string }[] | null;
      }
    | {
        start_at: string;
        end_at: string;
        class_type: { name: string } | { name: string }[] | null;
      }[]
    | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Misbruikmelding na een herhaalde gratis proefles (spec-community-growth.md
 * §1 "Proefcodes"). Wordt na de commit van de boeking aangeroepen; een
 * mislukte mail draait de boeking nooit terug en wordt alleen gelogd.
 * Nooit throwen.
 */
export async function sendTrialCodeAbuseAlert(input: AbuseAlertInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const emailNormalized = input.email.trim().toLowerCase();

    const { data, error } = await admin
      .from("trial_code_redemptions")
      .select(
        `
          id, redeemed_at, released_at,
          code:trial_codes(code),
          session:class_sessions(start_at, end_at, class_type:class_types(name))
        `,
      )
      .eq("email_normalized", emailNormalized)
      .neq("trial_booking_id", input.trialBookingId)
      .order("redeemed_at", { ascending: false })
      .returns<RedemptionRow[]>();

    if (error) {
      console.error("[trial-code-abuse] redemptions query failed", error);
    }

    const prior: PriorFreeTrial[] = (data ?? []).map((r) => {
      const session = firstOf(r.session);
      const classType = session ? firstOf(session.class_type) : null;
      const start = session ? new Date(session.start_at) : null;
      const end = session ? new Date(session.end_at) : start;
      return {
        code: firstOf(r.code)?.code ?? "?",
        className: classType?.name ?? "Proefles",
        whenLabel:
          start && end ? `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}` : "?",
        redeemedAtLabel: formatShortDateWithYear(new Date(r.redeemed_at)),
        cancelled: r.released_at !== null,
      };
    });

    const adminUrl = `${siteUrl()}/app/admin/proefcodes/${input.codeId}`;
    const react = TrialCodeAbuseAlert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      code: input.code,
      className: input.className,
      whenLabel: input.whenLabel,
      prior,
      adminUrl,
    });

    const results = await Promise.all(
      TRIAL_CODE_ABUSE_RECIPIENTS.map((to) =>
        sendEmail({
          to,
          // COPY: confirm met Marlon
          subject: `Herhaalde gratis proefles: ${input.email}`,
          replyTo: null, // stafmail
          react,
        }),
      ),
    );
    const delivered = results.filter(Boolean).length;
    if (delivered < TRIAL_CODE_ABUSE_RECIPIENTS.length) {
      console.error("[trial-code-abuse] alert niet bij alle ontvangers afgeleverd", {
        trialBookingId: input.trialBookingId,
        delivered,
        expected: TRIAL_CODE_ABUSE_RECIPIENTS.length,
      });
    }

    await emitEvent({
      type: "trial_code.abuse_alert_sent",
      actorType: "system",
      actorId: null,
      subjectType: "trial_booking",
      subjectId: input.trialBookingId,
      payload: {
        code_id: input.codeId,
        prior_free_count: prior.length,
        delivered,
        expected: TRIAL_CODE_ABUSE_RECIPIENTS.length,
      },
    });
  } catch (err) {
    console.error("[trial-code-abuse] alert failed", input.trialBookingId, err);
  }
}
