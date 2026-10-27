import "server-only";
import { render } from "@react-email/render";
import { MailerSend, EmailParams, Recipient, Sender } from "mailersend";
import { MAILERSEND_TIMEOUT_MS, withTimeout } from "@/lib/outbound-timeouts";

interface SendArgs {
  to: string;
  toName?: string;
  subject: string;
  react: React.ReactElement;
  /**
   * Antwoordadres. Weggelaten: DEFAULT_REPLY_TO (Marlons inbox), zodat een
   * antwoord van een lid of bezoeker bij een mens aankomt in plaats van bij
   * het no-reply-afzenderadres. `null` zet het antwoordadres uit; gebruik dat
   * voor stafmails (de ontvanger is geen lid of bezoeker). Een eigen adres
   * overschrijft de default.
   */
  replyTo?: { email: string; name?: string } | null;
}

export const DEFAULT_REPLY_TO = {
  email: "marlon@themovementclub.nl",
  name: "The Movement Club",
};

/**
 * Transactional email helper. Renders a React Email component to HTML and
 * sends via MailerSend. Non-blocking: failures are logged, never thrown.
 *
 * Requires env vars:
 *   MAILERSEND_API_KEY
 *   MAILERSEND_FROM_EMAIL (e.g. noreply@themovementclub.nl)
 *   MAILERSEND_FROM_NAME  (e.g. "The Movement Club")
 *
 * If MAILERSEND_API_KEY is unset we log-and-skip — this keeps local dev
 * and CI from hanging on missing creds.
 *
 * Geeft `true` terug als MailerSend de mail heeft geaccepteerd, `false` bij
 * skip (niet geconfigureerd) of fout. Bestaande callers negeren de waarde;
 * de bevestigingsmail (order-confirmation) gebruikt hem om het
 * `order.confirmation_sent`-event alleen na een geslaagde verzending te
 * schrijven.
 */
export async function sendEmail({
  to,
  toName,
  subject,
  react,
  replyTo,
}: SendArgs): Promise<boolean> {
  const apiKey = process.env.MAILERSEND_API_KEY;
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL;
  const fromName = process.env.MAILERSEND_FROM_NAME ?? "The Movement Club";

  if (!apiKey || !fromEmail) {
    console.warn(
      "[email] MAILERSEND niet geconfigureerd — skipping",
      { to, subject },
    );
    return false;
  }

  try {
    const html = await render(react);
    const text = await render(react, { plainText: true });

    const mailerSend = new MailerSend({ apiKey });
    const params = new EmailParams()
      .setFrom(new Sender(fromEmail, fromName))
      .setTo([new Recipient(to, toName)])
      .setSubject(subject)
      .setHtml(html)
      .setText(text);
    const effectiveReplyTo = replyTo === undefined ? DEFAULT_REPLY_TO : replyTo;
    if (effectiveReplyTo) {
      params.setReplyTo(
        new Recipient(effectiveReplyTo.email, effectiveReplyTo.name),
      );
    }

    // Timeout (3a-bis, outbound-timeouts.ts): de SDK loopt via gaxios
    // zonder timeout-optie, dus een race; een timeout valt in de catch
    // hieronder en levert false op, net als elke andere verzendfout.
    await withTimeout(mailerSend.email.send(params), MAILERSEND_TIMEOUT_MS, "mailersend.email.send");
    return true;
  } catch (err) {
    console.error("[email] send failed", { to, subject, err });
    return false;
  }
}
