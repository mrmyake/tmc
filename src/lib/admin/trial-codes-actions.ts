"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./require-admin";
import { isValidTrialCodeFormat, normalizeTrialCode } from "@/lib/trial-codes/normalize";
import {
  SELECTABLE_TRIAL_CODE_SCOPES,
  isTrialCodeScope,
  type TrialCodeScope,
} from "@/lib/trial-codes/scope";

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
  scope: TrialCodeScope;
  createdAt: string;
  /** Laatste geldige kalenderdag (YYYY-MM-DD) of null zonder einddatum. */
  validThrough: string | null;
  newCustomersOnly: boolean;
  onePerPerson: boolean;
}

export type CreateTrialCodeResult =
  | { ok: true; code: CreatedTrialCode }
  | { ok: false; message: string };

export type CreateTrialCodesBatchResult =
  | { ok: true; batchId: string; codes: CreatedTrialCode[] }
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
  // COPY: confirm met Marlon
  valid_through_past: "De einddatum ligt in het verleden. Kies vandaag of later.",
  // COPY: confirm met Marlon
  scope_invalid: "Kies waarvoor de code geldt.",
  // COPY: confirm met Marlon
  count_invalid: "Kies een aantal tussen 1 en 50.",
};

/** Soort (eenmalig, X keer, onbeperkt) naar max_uses; null = onbeperkt. */
function resolveMaxUses(
  kind: TrialCodeKind,
  maxUses: number | undefined,
): { ok: true; maxUses: number | null } | { ok: false; message: string } {
  if (kind === "single") return { ok: true, maxUses: 1 };
  if (kind === "unlimited") return { ok: true, maxUses: null };
  if (!Number.isInteger(maxUses) || (maxUses ?? 0) < 1) {
    return { ok: false, message: CREATE_REASON_COPY.max_uses_invalid };
  }
  return { ok: true, maxUses: maxUses as number };
}

// Alleen bekende scopes; de RPC valideert ze opnieuw.
function validScope(scope: unknown): scope is TrialCodeScope {
  return isTrialCodeScope(scope) && SELECTABLE_TRIAL_CODE_SCOPES.includes(scope);
}

type RawCreated = {
  id?: string;
  code?: string;
  label?: string;
  max_uses?: number | null;
  scope?: string;
  created_at?: string;
  valid_through?: string | null;
  new_customers_only?: boolean;
  one_per_person?: boolean;
};

function mapCreated(raw: RawCreated, fallback: { label: string; scope: TrialCodeScope }): CreatedTrialCode {
  return {
    id: raw.id ?? "",
    code: raw.code ?? "",
    label: raw.label ?? fallback.label,
    maxUses: raw.max_uses ?? null,
    scope: isTrialCodeScope(raw.scope) ? raw.scope : fallback.scope,
    createdAt: raw.created_at ?? new Date().toISOString(),
    validThrough: raw.valid_through ?? null,
    newCustomersOnly: raw.new_customers_only ?? false,
    onePerPerson: raw.one_per_person ?? false,
  };
}

/** Alleen een kale kalenderdatum (YYYY-MM-DD); de RPC weigert een datum in het verleden. */
function validDateInput(value: string | undefined): string | null | undefined {
  const v = value?.trim() ?? "";
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return undefined;
  return v;
}

export async function createTrialCode(input: {
  code: string;
  label: string;
  kind: TrialCodeKind;
  maxUses?: number;
  scope: TrialCodeScope;
  /** Laatste geldige kalenderdag (YYYY-MM-DD, Europe/Amsterdam); leeg = geen einddatum. */
  validThrough?: string;
  newCustomersOnly?: boolean;
  onePerPerson?: boolean;
}): Promise<CreateTrialCodeResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const label = input.label.trim();
  if (!label) return { ok: false, message: CREATE_REASON_COPY.label_required };

  const code = normalizeTrialCode(input.code ?? "");
  if (code && !isValidTrialCodeFormat(code)) {
    return { ok: false, message: CREATE_REASON_COPY.code_invalid };
  }

  const uses = resolveMaxUses(input.kind, input.maxUses);
  if (!uses.ok) return uses;
  if (!validScope(input.scope)) return { ok: false, message: CREATE_REASON_COPY.scope_invalid };
  const validThrough = validDateInput(input.validThrough);
  if (validThrough === undefined) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Kies een geldige einddatum." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_trial_code", {
    p_code: code || null,
    p_label: label,
    p_max_uses: uses.maxUses,
    p_scope: input.scope,
    p_valid_through: validThrough ?? undefined,
    p_new_customers_only: Boolean(input.newCustomersOnly),
    p_one_per_person: Boolean(input.onePerPerson),
  });

  if (error) {
    console.error("[createTrialCode] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Aanmaken lukte niet. Probeer opnieuw." };
  }

  const result = data as { ok: boolean; reason?: string } & RawCreated;
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
    code: mapCreated({ ...result, code: result.code ?? code }, { label, scope: input.scope }),
  };
}

/**
 * Een batch van 1 tot 50 codes met hetzelfde label, dezelfde soort en
 * dezelfde scope, atomair in een RPC (alle codes of geen, een event per
 * batch). De nummers en uniciteit regelt tmc.create_trial_codes_batch.
 */
export async function createTrialCodesBatch(input: {
  count: number;
  label: string;
  kind: TrialCodeKind;
  maxUses?: number;
  scope: TrialCodeScope;
}): Promise<CreateTrialCodesBatchResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const label = input.label.trim();
  if (!label) return { ok: false, message: CREATE_REASON_COPY.label_required };
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50) {
    return { ok: false, message: CREATE_REASON_COPY.count_invalid };
  }
  const uses = resolveMaxUses(input.kind, input.maxUses);
  if (!uses.ok) return uses;
  if (!validScope(input.scope)) return { ok: false, message: CREATE_REASON_COPY.scope_invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_trial_codes_batch", {
    p_count: input.count,
    p_label: label,
    p_max_uses: uses.maxUses,
    p_scope: input.scope,
  });

  if (error) {
    console.error("[createTrialCodesBatch] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Aanmaken lukte niet. Probeer opnieuw." };
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    batch_id?: string;
    codes?: RawCreated[];
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
    batchId: result.batch_id ?? "",
    codes: (result.codes ?? []).map((c) => mapCreated(c, { label, scope: input.scope })),
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
