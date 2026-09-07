#!/usr/bin/env node
/**
 * Zet de rol van bestaande profielen voor Marlon's reviewaccounts.
 * Werkt uitsluitend op profielen die al bestaan, dus die persoon moet
 * al minstens een keer via de OTP-flow op /login ingelogd zijn. Maakt
 * nooit een auth-account of profiel aan en schrijft nooit in het
 * auth-schema (geen inserts in auth.users, geen wachtwoorden).
 *
 * Dry-run by default. Voeg --apply toe om daadwerkelijk te schrijven.
 * Raakt uitsluitend tmc.profiles.role. tmc.events blijft ongemoeid.
 *
 * Run:
 *   node --env-file=.env.local scripts/set-review-roles.ts \
 *     --member=marlonvanderleij@gmail.com \
 *     --trainer=marlon@ptloosdrecht.nl \
 *     --admin=marlon@themovementclub.nl
 *
 *   (voeg --apply toe om te schrijven, zonder is het een dry run)
 *
 * Adressen mogen ook via env vars: REVIEW_MEMBER_EMAIL, REVIEW_TRAINER_EMAIL,
 * REVIEW_ADMIN_EMAIL. Geen adressen hardcoded, geen defaults in de code.
 */

import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    member: { type: "string" },
    trainer: { type: "string" },
    admin: { type: "string" },
    apply: { type: "boolean", default: false },
  },
});

const ROLES = ["member", "trainer", "admin"] as const;
type Role = (typeof ROLES)[number];

type Target = {
  role: Role;
  email: string | undefined;
  flag: string;
  envVar: string;
};

const targets: Target[] = [
  { role: "member", email: values.member ?? process.env.REVIEW_MEMBER_EMAIL, flag: "--member", envVar: "REVIEW_MEMBER_EMAIL" },
  { role: "trainer", email: values.trainer ?? process.env.REVIEW_TRAINER_EMAIL, flag: "--trainer", envVar: "REVIEW_TRAINER_EMAIL" },
  { role: "admin", email: values.admin ?? process.env.REVIEW_ADMIN_EMAIL, flag: "--admin", envVar: "REVIEW_ADMIN_EMAIL" },
];

const missing = targets.filter((t) => !t.email);
if (missing.length > 0) {
  console.error("Ontbrekende adressen. Geef ze mee via CLI-argument of env var:");
  for (const m of missing) {
    console.error(`  ${m.flag}=<email>   (of env var ${m.envVar})`);
  }
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Ontbrekende NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY. Run met node --env-file=.env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const APPLY = values.apply === true;

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "[set-review-roles] APPLY — schrijft naar tmc.profiles.role"
      : "[set-review-roles] DRY RUN — er wordt niets geschreven (voeg --apply toe om te schrijven)",
  );

  let hadIssue = false;

  for (const target of targets) {
    const normalizedEmail = target.email!.trim().toLowerCase();

    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, email, role")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error) {
      console.error(`  ✗ ${normalizedEmail}: query mislukt — ${error.message}`);
      hadIssue = true;
      continue;
    }

    if (!profile) {
      console.log(
        `  ✗ ${normalizedEmail}: geen profiel gevonden. Deze persoon moet eerst een keer inloggen via de OTP-flow op /login voordat de rol gezet kan worden. Er wordt geen account aangemaakt.`,
      );
      hadIssue = true;
      continue;
    }

    if (profile.role === target.role) {
      console.log(`  = ${normalizedEmail}: rol is al "${target.role}", geen wijziging nodig.`);
      continue;
    }

    console.log(
      `  → ${normalizedEmail}: "${profile.role}" wordt "${target.role}"${APPLY ? "" : " (dry run, niet geschreven)"}`,
    );

    if (APPLY) {
      const { error: updateError } = await admin
        .from("profiles")
        .update({ role: target.role })
        .eq("id", profile.id);

      if (updateError) {
        console.error(`  ✗ ${normalizedEmail}: update mislukt — ${updateError.message}`);
        hadIssue = true;
      }
    }
  }

  if (hadIssue) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
