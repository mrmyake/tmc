"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./require-admin";

/**
 * Deze drie RPC's (tmc.generate_trial_codes, tmc.revoke_trial_code,
 * tmc.revoke_trial_batch) checken zelf auth.uid() plus tmc.is_admin()
 * (SECURITY DEFINER). Ze moeten dus via de sessie-gebonden client
 * (createClient) lopen, niet via de service-role admin-client: die laatste
 * heeft geen auth.uid() en zou altijd op de is_admin()-guard stuklopen.
 * requireAdmin() blijft ervoor als dezelfde defense-in-depth-laag die alle
 * andere admin-actions ook gebruiken.
 */

export type PillarChoice = "yoga_mobility" | "kettlebell" | "both";

export interface GeneratedTrialCode {
  code: string;
  pillar: string | null;
  batchId: string;
  batchLabel: string | null;
  expiresAt: string;
}

export type GenerateTrialCodesResult =
  | { ok: true; codes: GeneratedTrialCode[] }
  | { ok: false; message: string };

export async function generateTrialCodes(input: {
  count: number;
  pillar: PillarChoice;
  label: string;
  validDays: number;
}): Promise<GenerateTrialCodesResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const label = input.label.trim();
  if (!label) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Geef een batch-label op." };
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Aantal moet tussen 1 en 50 liggen." };
  }
  if (!Number.isInteger(input.validDays) || input.validDays < 1) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Geldigheidsduur moet minstens 1 dag zijn." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_trial_codes", {
    p_count: input.count,
    p_pillar: input.pillar === "both" ? null : input.pillar,
    p_label: label,
    p_valid_days: input.validDays,
  });

  if (error) {
    console.error("[generateTrialCodes] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Genereren lukte niet. Probeer opnieuw." };
  }

  const rows = (data ?? []) as Array<{
    code: string;
    pillar: string | null;
    batch_id: string;
    batch_label: string | null;
    expires_at: string;
  }>;

  revalidatePath("/app/admin/proefcodes");

  return {
    ok: true,
    codes: rows.map((r) => ({
      code: r.code,
      pillar: r.pillar,
      batchId: r.batch_id,
      batchLabel: r.batch_label,
      expiresAt: r.expires_at,
    })),
  };
}

export type TrialCodeActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const REVOKE_REASON_COPY: Record<string, string> = {
  // COPY: confirm met Marlon
  code_not_found: "Deze code bestaat niet (meer).",
  // COPY: confirm met Marlon
  code_not_active: "Deze code is al verzilverd of ingetrokken.",
};

export async function revokeTrialCode(
  id: string,
): Promise<TrialCodeActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_trial_code", {
    p_id: id,
  });

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
  // COPY: confirm met Marlon
  return { ok: true, message: "Code ingetrokken." };
}

export type RevokeBatchResult =
  | { ok: true; message: string; revokedCount: number }
  | { ok: false; message: string };

export async function revokeTrialCodeBatch(
  batchId: string,
): Promise<RevokeBatchResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_trial_batch", {
    p_batch_id: batchId,
  });

  if (error) {
    console.error("[revokeTrialCodeBatch] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Intrekken lukte niet. Probeer opnieuw." };
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    revoked_count?: number;
  };
  if (!result.ok) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Deze batch bestaat niet (meer)." };
  }

  revalidatePath("/app/admin/proefcodes");
  const count = result.revoked_count ?? 0;
  return {
    ok: true,
    message:
      count === 0
        ? // COPY: confirm met Marlon
          "Geen actieve codes meer in deze batch om in te trekken."
        : // COPY: confirm met Marlon
          `${count} ${count === 1 ? "code" : "codes"} ingetrokken.`,
    revokedCount: count,
  };
}
