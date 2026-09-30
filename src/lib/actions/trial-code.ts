"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isValidTrialCodeFormat, normalizeTrialCode } from "@/lib/trial-codes/normalize";
import { clientIp, setTrialCodeCookie } from "@/lib/trial-codes/server";
import { CODE_INVALID_MESSAGE, CODE_RATE_LIMITED_MESSAGE } from "@/lib/trial-codes/messages";

export type CheckTrialCodeResult = { ok: true } | { ok: false; message: string };

/**
 * Codestap op /proefles/code. Alleen lezen: telt als poging op de IP-teller
 * (tmc.register_trial_code_attempt) en reset die teller nooit. Alleen een
 * geslaagde boeking via tmc.redeem_trial_code wist de teller, anders kon
 * iemand met een geldige code de teller steeds resetten en onbeperkt codes
 * raden. De voorwaarden spiegelen de live tmc.redeem_trial_code: bestaat,
 * niet ingetrokken en (max_uses IS NULL OR uses_count < max_uses). De
 * uitkomst is een momentopname; bij het boeken beslist de RPC opnieuw.
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

  const { data: row, error } = await admin
    .from("trial_codes")
    .select("revoked_at, max_uses, uses_count")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error("[checkTrialCode] query failed", error);
    return { ok: false, message: CODE_INVALID_MESSAGE };
  }

  const usable =
    row !== null &&
    row.revoked_at === null &&
    (row.max_uses === null || row.uses_count < row.max_uses);
  if (!usable) {
    return { ok: false, message: CODE_INVALID_MESSAGE };
  }

  if (!(await setTrialCodeCookie(code))) {
    console.error("[checkTrialCode] cookie niet gezet (geen signeersleutel)");
    // COPY: confirm met Marlon
    return { ok: false, message: "Er ging iets mis. Probeer het opnieuw." };
  }
  return { ok: true };
}
