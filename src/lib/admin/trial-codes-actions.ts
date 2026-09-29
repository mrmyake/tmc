"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./require-admin";
import { isValidTrialCodeFormat, normalizeTrialCode } from "@/lib/trial-codes/normalize";

/**
 * De RPC's (tmc.create_trial_code, tmc.revoke_trial_code) checken zelf
 * auth.uid() plus
 * tmc.is_admin() (SECURITY DEFINER). Ze lopen dus via de sessie-gebonden
 * client (createClient), niet via de service-role admin-client: die heeft
 * geen auth.uid() en zou altijd op de is_admin()-guard stuklopen.
 * requireAdmin() blijft ervoor als dezelfde defense-in-depth-laag die alle
 * andere admin-actions ook gebruiken.
 */

export type TrialCodeKind = "single" | "multi" | "unlimited";

export interface CreatedTrialCode {
  id: string;
  code: string;
  label: string;
  maxUses: number | null;
}

export type CreateTrialCodeResult =
  | { ok: true; code: CreatedTrialCode }
  | { ok: false; message: string };

const CREATE_REASON_COPY: Record<string, string> = {
  // COPY: confirm met Marlon
  label_required: "Geef een omschrijving op.",
  // COPY: confirm met Marlon
  code_invalid: "Een code bestaat uit 4 tot 32 letters en cijfers.",
  // COPY: confirm met Marlon
  code_exists: "Deze code bestaat al. Kies een andere.",
  // COPY: confirm met Marlon
  max_uses_invalid: "Aantal keer moet minstens 1 zijn.",
};

export async function createTrialCode(input: {
  code: string;
  label: string;
  kind: TrialCodeKind;
  maxUses?: number;
}): Promise<CreateTrialCodeResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const label = input.label.trim();
  if (!label) return { ok: false, message: CREATE_REASON_COPY.label_required };

  const code = normalizeTrialCode(input.code ?? "");
  if (code && !isValidTrialCodeFormat(code)) {
    return { ok: false, message: CREATE_REASON_COPY.code_invalid };
  }

  let maxUses: number | null;
  if (input.kind === "single") maxUses = 1;
  else if (input.kind === "unlimited") maxUses = null;
  else {
    if (!Number.isInteger(input.maxUses) || (input.maxUses ?? 0) < 1) {
      return { ok: false, message: CREATE_REASON_COPY.max_uses_invalid };
    }
    maxUses = input.maxUses as number;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_trial_code", {
    p_code: code || null,
    p_label: label,
    p_max_uses: maxUses,
  });

  if (error) {
    console.error("[createTrialCode] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Aanmaken lukte niet. Probeer opnieuw." };
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    id?: string;
    code?: string;
    label?: string;
    max_uses?: number | null;
  };
  if (!result.ok) {
    return {
      ok: false,
      message:
        CREATE_REASON_COPY[result.reason ?? ""] ??
        // COPY: confirm met Marlon
        "Aanmaken lukte niet.",
    };
  }

  revalidatePath("/app/admin/proefcodes");
  return {
    ok: true,
    code: {
      id: result.id ?? "",
      code: result.code ?? code,
      label: result.label ?? label,
      maxUses: result.max_uses ?? null,
    },
  };
}

export type TrialCodeActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const REVOKE_REASON_COPY: Record<string, string> = {
  // COPY: confirm met Marlon
  code_not_found: "Deze code bestaat niet (meer).",
  // COPY: confirm met Marlon
  code_already_revoked: "Deze code is al ingetrokken.",
};

export async function revokeTrialCode(id: string): Promise<TrialCodeActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_trial_code", { p_id: id });

  if (error) {
    console.error("[revokeTrialCode] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Intrekken lukte niet. Probeer opnieuw." };
  }

  const result = data as { ok: boolean; reason?: string };
  if (!result.ok) {
    return {
      ok: false,
      message:
        REVOKE_REASON_COPY[result.reason ?? ""] ??
        // COPY: confirm met Marlon
        "Intrekken lukte niet.",
    };
  }

  revalidatePath("/app/admin/proefcodes");
  revalidatePath(`/app/admin/proefcodes/${id}`);
  // COPY: confirm met Marlon
  return { ok: true, message: "Code ingetrokken." };
}
