"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupUsableTrialCodeScope } from "@/lib/trial-codes/lookup";
import type { TrialCodeScope } from "@/lib/trial-codes/scope";
import { isValidTrialCodeFormat, normalizeTrialCode } from "@/lib/trial-codes/normalize";
import { clientIp, setTrialCodeCookie } from "@/lib/trial-codes/server";
import {
  CODE_INVALID_MESSAGE,
  CODE_NOT_AVAILABLE_MESSAGE,
  CODE_RATE_LIMITED_MESSAGE,
} from "@/lib/trial-codes/messages";

export type CheckTrialCodeResult =
  | { ok: true; scope: TrialCodeScope }
  | { ok: false; message: string };

/**
 * Codestap op /proefles/code. Alleen lezen: telt als poging op de IP-teller
 * (tmc.register_trial_code_attempt) en reset die teller nooit. Alleen een
 * geslaagde boeking via tmc.redeem_trial_code wist de teller, anders kon
 * iemand met een geldige code de teller steeds resetten en onbeperkt codes
 * raden. De voorwaarden spiegelen de live tmc.redeem_trial_code: bestaat,
 * niet ingetrokken en (max_uses IS NULL OR uses_count < max_uses). De
 * uitkomst is een momentopname; bij het boeken beslist de RPC opnieuw.
 * De scope komt uit deze server-side opzoeking van de code en gaat nooit
 * mee in het cookie; de pagina zoekt hem bij elke render opnieuw op.
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
    return { ok: false, message: CODE_INVALID_MESSAGE };
  }

  const scope = await lookupUsableTrialCodeScope(code);
  if (!scope) {
    return { ok: false, message: CODE_INVALID_MESSAGE };
  }
  if (scope === "vrij_trainen") {
    // Bestaat, maar vrij trainen via een code is nog niet te boeken.
    return { ok: false, message: CODE_NOT_AVAILABLE_MESSAGE };
  }

  if (!(await setTrialCodeCookie(code))) {
    console.error("[checkTrialCode] cookie niet gezet (geen signeersleutel)");
    // COPY: confirm met Marlon
    return { ok: false, message: "Er ging iets mis. Probeer het opnieuw." };
  }
  return { ok: true, scope };
}
