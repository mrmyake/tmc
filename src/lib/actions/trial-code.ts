"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupUsableTrialCodeScope } from "@/lib/trial-codes/lookup";
import type { TrialCodeScope } from "@/lib/trial-codes/scope";
import { isValidTrialCodeFormat, normalizeTrialCode } from "@/lib/trial-codes/normalize";
import { clientIp, setTrialCodeCookie } from "@/lib/trial-codes/server";
import {
  CODE_INVALID_MESSAGE,
  CODE_RATE_LIMITED_MESSAGE,
} from "@/lib/trial-codes/messages";

export type CheckTrialCodeResult =
  | { ok: true; scope: TrialCodeScope }
  | { ok: false; message: string };

/**
 * Een mislukte codepoging op de IP-teller zetten (tmc.register_trial_code_failure).
 * Alleen missers tellen: na 10 in 30 minuten gaat het IP 15 minuten op slot.
 * Een geslaagde controle of boeking laat de teller met rust, zodat bezoekers
 * achter een gedeeld mobiel IP elkaar niet blokkeren. Logt en gaat door bij
 * een fout; de weigering zelf staat al vast.
 */
export async function registerTrialCodeFailure(ip: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("register_trial_code_failure", { p_ip: ip });
  if (error) console.error("[trial-code] register_trial_code_failure failed", error);
}

/**
 * Codestap op /proefles/code. Eerst de poortcheck (tmc.register_trial_code_attempt,
 * alleen lezen: staat dit IP op slot?), dan de opzoeking. Alleen een
 * afgewezen code telt als misser (registerTrialCodeFailure). De voorwaarden
 * spiegelen de live tmc.redeem_trial_code: bestaat, niet ingetrokken,
 * (max_uses IS NULL OR uses_count < max_uses) en de einddatum nog niet
 * voorbij. De uitkomst is een momentopname; bij het boeken beslist de RPC
 * opnieuw. De scope komt uit deze server-side opzoeking van de code en gaat
 * nooit mee in het cookie; de pagina zoekt hem bij elke render opnieuw op.
 */
export async function checkTrialCode(rawCode: string): Promise<CheckTrialCodeResult> {
  const admin = createAdminClient();
  const ip = await clientIp();

  const { data: attempt, error: attemptErr } = await admin.rpc(
    "register_trial_code_attempt",
    { p_ip: ip },
  );
  if (attemptErr) {
    console.error("[checkTrialCode] register_trial_code_attempt failed", attemptErr);
    return { ok: false, message: CODE_INVALID_MESSAGE };
  }
  if (!(attempt as { allowed?: boolean } | null)?.allowed) {
    return { ok: false, message: CODE_RATE_LIMITED_MESSAGE };
  }

  const code = normalizeTrialCode(rawCode);
  if (!isValidTrialCodeFormat(code)) {
    await registerTrialCodeFailure(ip);
    return { ok: false, message: CODE_INVALID_MESSAGE };
  }

  const scope = await lookupUsableTrialCodeScope(code);
  if (!scope) {
    await registerTrialCodeFailure(ip);
    return { ok: false, message: CODE_INVALID_MESSAGE };
  }
  if (!(await setTrialCodeCookie(code))) {
    console.error("[checkTrialCode] cookie niet gezet (geen signeersleutel)");
    // COPY: confirm met Marlon
    return { ok: false, message: "Er ging iets mis. Probeer het opnieuw." };
  }
  return { ok: true, scope };
}
