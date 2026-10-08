// Admin-only: stuurt elke mailtemplate uit src/emails/registry.ts met
// dummydata naar één testadres (bv. een mail-tester.com-adres), via exact
// dezelfde sendEmail() als productie (MailerSend, zelfde from en reply-to).
//
// Standaard een dry run: er gaat niets de deur uit zonder --send.
//
//   node --env-file=.env.local --import tsx --import ./scripts/ts-loader.mjs \
//     scripts/send-test-emails.ts --to test-abc@srv1.mail-tester.com            (dry run)
//   ... scripts/send-test-emails.ts --to <adres> --send                         (verstuurt)
//   ... scripts/send-test-emails.ts --to <adres> --send --only trial_code_confirmation
//
// Vereist MAILERSEND_API_KEY, MAILERSEND_FROM_EMAIL en MAILERSEND_FROM_NAME
// (vercel env pull .env.local). Elk onderwerp krijgt het prefix "[TEST] ".
//
// Supabase Auth-mails (supabase/templates/) vallen erbuiten: die gaan niet
// via sendEmail() maar via Supabase's eigen SMTP-koppeling. Test ze door op
// /login een inlogcode aan te vragen voor het testadres (OTP-aanvraag). Voor
// de andere Auth-mails (invite, recovery) is een echte actie in Supabase
// nodig; de HTML wordt wel door scripts/check-emails.mts gecontroleerd.
import { sendEmail } from "../src/lib/email.ts";
import { loadRegistry } from "./emails/load.mts";

async function main() {
  const { emailRegistry } = await loadRegistry();

  function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
  }

  const to = arg("to");
  const send = process.argv.includes("--send");
  const only = arg("only");

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error("Gebruik: send-test-emails.ts --to <adres> [--send] [--only <template-id>]");
    process.exit(1);
  }

  const entries = only ? emailRegistry.filter((e) => e.id === only) : emailRegistry;
  if (entries.length === 0) {
    console.error(`Geen template met id "${only}" in src/emails/registry.ts`);
    process.exit(1);
  }

  console.log(`${send ? "VERSTUREN" : "DRY RUN"}: ${entries.length} mails naar ${to}`);
  let failed = 0;
  for (const entry of entries) {
    const subject = `[TEST] ${entry.subject}`;
    const label = `${entry.id}${entry.variant ? ` (${entry.variant})` : ""}`;
    if (!send) {
      console.log(`  - ${label}: ${subject}`);
      continue;
    }
    const ok = await sendEmail({
      to,
      subject,
      react: entry.render(),
      // Stafmails gaan in productie zonder reply-to; hier precies zo.
      ...(entry.staff ? { replyTo: null } : {}),
    });
    console.log(`  ${ok ? "ok    " : "MISLUKT"} ${label}`);
    if (!ok) failed += 1;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!send) console.log("\nNiets verstuurd. Voeg --send toe om echt te versturen.");
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
