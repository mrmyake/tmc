import "server-only";
import { render } from "@react-email/render";
import { MailerSend, EmailParams, Recipient, Sender } from "mailersend";

interface SendArgs {
  to: string;
  toName?: string;
  subject: string;
  react: React.ReactElement;
}

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
 */
export async function sendEmail({
  to,
  toName,
  subject,
  react,
}: SendArgs): Promise<void> {
  const apiKey = process.env.MAILERSEND_API_KEY;
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL;
  const fromName = process.env.MAILERSEND_FROM_NAME ?? "The Movement Club";

  if (!apiKey || !fromEmail) {
    console.warn(
      "[email] MAILERSEND niet geconfigureerd — skipping",
      { to, subject },
    );
    return;
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

    await mailerSend.email.send(params);
  } catch (err) {
    console.error("[email] send failed", { to, subject, err });
  }
}
