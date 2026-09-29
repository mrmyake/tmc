// Stub voor src/lib/email (zie hooks.mjs): verstuurt niets, maar rendert de
// mail net als sendEmail (plain text via @react-email/render) en registreert
// elke aanroep in globalThis.__sentEmails, zodat een test exact kan tellen wie
// welke mail krijgt en op de uiteindelijke tekst kan toetsen.
import { render } from "@react-email/render";

export async function sendEmail(args) {
  const text = await render(args.react, { plainText: true });
  globalThis.__sentEmails ??= [];
  globalThis.__sentEmails.push({
    to: args.to,
    subject: args.subject,
    replyTo: args.replyTo ?? null,
    text,
  });
  return true;
}
