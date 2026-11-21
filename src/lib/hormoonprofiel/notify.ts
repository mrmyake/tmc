import "server-only";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import type { AttributionParams } from "@/lib/attribution/params";
import ProgrammaIntake from "@/emails/programma_intake";
import {
  PROGRAMMA_INTAKE_RECIPIENT,
  buildSourceLines,
  decideRecipient,
  formatSubmittedAt,
} from "@/lib/programma-intake/mail";
import type { HpIntakeInput } from "./intake";

/** Onderwerp van de mail aan Marlon; buiten productie met [TEST] ervoor. */
export function buildHormoonprofielSubject(redirected: boolean): string {
  // COPY: confirm met Marlon
  const base = "Kennismaking hormoonprofiel";
  return redirected ? `[TEST] ${base}` : base;
}

export interface SendHormoonprofielMailArgs {
  intakeId: string;
  input: HpIntakeInput;
  /** Attributie plus het landingspad met host en modus. */
  params: AttributionParams;
  createdAt: Date;
}

/**
 * Mailt Marlon over een nieuwe kennismaking. Hergebruikt de ontvangerregel,
 * het mailtemplate en de bronregels van de 12 weken-intake: geen tweede
 * mailsysteem. Throwt nooit. Geen voorkeursdag in de mail.
 */
export async function sendHormoonprofielMail(args: SendHormoonprofielMailArgs): Promise<boolean> {
  const { intakeId, input, params, createdAt } = args;
  const decision = decideRecipient({
    vercelEnv: process.env.VERCEL_ENV,
    redirectEmail: process.env.PROGRAMMA_INTAKE_REDIRECT_EMAIL,
  });
  if (!decision.to) {
    console.warn(
      "[hormoonprofiel] PROGRAMMA_INTAKE_REDIRECT_EMAIL ontbreekt buiten productie; mail overgeslagen",
      { intakeId },
    );
    return false;
  }

  const ok = await sendEmail({
    to: decision.to,
    subject: buildHormoonprofielSubject(decision.redirected),
    replyTo: { email: input.email, name: `${input.firstName} ${input.lastName}`.trim() },
    react: ProgrammaIntake({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      preferredDay: null,
      message: input.message,
      submittedAtLabel: formatSubmittedAt(createdAt),
      sourceLines: buildSourceLines(params),
      dashboardUrl: `${siteUrl()}/app/admin/intakes`,
      originalRecipientLabel: decision.redirected ? PROGRAMMA_INTAKE_RECIPIENT : null,
      // COPY: confirm met Marlon
      eyebrow: "Kennismaking hormoonprofiel",
      // COPY: confirm met Marlon
      previewSuffix: "vraagt een kennismaking aan voor het hormoonprofiel",
    }),
  });
  if (!ok) console.error("[hormoonprofiel] mail aan Marlon niet verstuurd", { intakeId });
  return ok;
}
