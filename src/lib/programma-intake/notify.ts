import "server-only";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import type { AttributionParams } from "@/lib/attribution/params";
import ProgrammaIntake from "@/emails/programma_intake";
import {
  PROGRAMMA_INTAKE_RECIPIENT,
  buildSourceLines,
  buildSubject,
  decideRecipient,
  formatSubmittedAt,
} from "./mail";
import type { ProgrammaIntakeInput } from "./validate";

export interface SendIntakeMailArgs {
  intakeId: string;
  input: ProgrammaIntakeInput;
  params: AttributionParams;
  createdAt: Date;
}

/**
 * Mailt Marlon over een nieuwe intake. Throwt nooit (sendEmail ook niet);
 * geeft true terug als MailerSend de mail heeft geaccepteerd. Buiten
 * productie gaat de mail naar PROGRAMMA_INTAKE_REDIRECT_EMAIL, zonder die
 * variabele wordt niets verstuurd.
 */
export async function sendProgrammaIntakeMail(args: SendIntakeMailArgs): Promise<boolean> {
  const { intakeId, input, params, createdAt } = args;
  const decision = decideRecipient({
    vercelEnv: process.env.VERCEL_ENV,
    redirectEmail: process.env.PROGRAMMA_INTAKE_REDIRECT_EMAIL,
  });
  if (!decision.to) {
    console.warn(
      "[programma-intake] PROGRAMMA_INTAKE_REDIRECT_EMAIL ontbreekt buiten productie; mail overgeslagen",
      { intakeId },
    );
    return false;
  }

  const ok = await sendEmail({
    to: decision.to,
    subject: buildSubject(input.firstName, input.lastName, decision.redirected),
    replyTo: { email: input.email, name: `${input.firstName} ${input.lastName}`.trim() },
    react: ProgrammaIntake({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      preferredDay: input.day,
      message: input.message,
      submittedAtLabel: formatSubmittedAt(createdAt),
      sourceLines: buildSourceLines(params),
      dashboardUrl: `${siteUrl()}/app/admin/intakes`,
      originalRecipientLabel: decision.redirected ? PROGRAMMA_INTAKE_RECIPIENT : null,
    }),
  });
  if (!ok) console.error("[programma-intake] mail aan Marlon niet verstuurd", { intakeId });
  return ok;
}
