#!/usr/bin/env node
/**
 * Verstuurt een test-push naar de device-tokens van een profiel, via de
 * bestaande sendPushToProfile() uit src/lib/push.ts. Doel: verifiëren dat
 * FIREBASE_SERVICE_ACCOUNT_KEY klopt en dat push.ts daadwerkelijk bij
 * Firebase/APNs uitkomt, zonder een echte boeking te hoeven maken. Geen
 * eigen Firebase-aanroep, geen wijziging aan push.ts.
 *
 * sendPushToProfile() throwt nooit en logt fouten per token zelf via
 * console.error() (met de volledige firebase-admin foutmelding, inclusief
 * error.code en error.message). Dat is precies het per-token foutdetail dat
 * dit script nodig heeft (zegt of het aan de key, het token of APNs ligt),
 * dus dit script leest die output mee in plaats van hem te herhalen. Geen
 * [sendPushToProfile]-foutregel na het versturen betekent dat elk token
 * door Firebase is geaccepteerd.
 *
 * Run:
 *   npm run push:test [email]
 *   (default e-mailadres: me@ilja.com)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToProfile } from "@/lib/push";

const DEFAULT_EMAIL = "me@ilja.com";

async function main(): Promise<void> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error(
      "[push:test] FIREBASE_SERVICE_ACCOUNT_KEY ontbreekt in .env.local. " +
        "Dit staat los van de waarde in Vercel, zet 'm lokaal in .env.local " +
        "(bv. via 'vercel env pull .env.local') voordat je dit script draait.",
    );
    process.exit(1);
  }

  const email = (process.argv[2] ?? DEFAULT_EMAIL).trim().toLowerCase();
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    console.error(`[push:test] profiel-lookup mislukt voor ${email}: ${profileError.message}`);
    process.exit(1);
  }
  if (!profile) {
    console.error(`[push:test] geen profiel gevonden voor ${email}.`);
    process.exit(1);
  }

  const { data: tokens, error: tokensError } = await admin
    .from("device_push_tokens")
    .select("token, platform")
    .eq("profile_id", profile.id);

  if (tokensError) {
    console.error(`[push:test] token-lookup mislukt voor ${email}: ${tokensError.message}`);
    process.exit(1);
  }
  if (!tokens || tokens.length === 0) {
    console.error(
      `[push:test] geen device-tokens gevonden voor ${email} in tmc.device_push_tokens. ` +
        "Registreer eerst een device via de app voordat je test.",
    );
    process.exit(1);
  }

  console.log(
    `[push:test] ${tokens.length} token(s) gevonden voor ${email}: ` +
      tokens.map((t) => `${t.platform}:...${String(t.token).slice(-8)}`).join(", "),
  );
  console.log("[push:test] versturen via sendPushToProfile()...");

  // COPY: confirm met Marlon is hier niet nodig omdat het geen productiecopy is.
  await sendPushToProfile(profile.id, {
    title: "Testmelding TMC",
    body: "Dit is een testpush vanuit scripts/push/send-test.mts.",
  });

  console.log(
    `[push:test] verzoek verstuurd naar ${tokens.length} token(s). Zie eventuele ` +
      "[sendPushToProfile]-foutregels hierboven voor details per token " +
      "(key-, token- of APNs-probleem). Geen foutregel = geaccepteerd door Firebase.",
  );
}

main().catch((err) => {
  console.error("[push:test] onverwachte fout:", err);
  process.exit(1);
});
