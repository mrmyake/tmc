"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import {
  grantFailureMessage,
  revokeFailureMessage,
  validateGrantInput,
  type GrantInput,
} from "@/lib/product-grants/core";

/**
 * Product toekennen zonder betaling (spec-facturatie.md 9.8). requireAdmin()
 * is de tweede laag; de eerste is tmc.is_admin() in de RPC, die daarom met de
 * COOKIE-client wordt aangeroepen (zelfde laagdeling als finalizeInvoice).
 * De RPC schrijft de membership, de herkomstrij en het event in een
 * transactie; deze action voegt de regel in admin_audit_log toe.
 *
 * Geen order, geen betaling, geen mail aan het lid en geen Akiles-sync: een
 * los product geeft geen deurtoegang.
 */

/** `reason` is de reden van de RPC bij een weigering (voor de override-stap). */
export type ProductGrantActionResult = { ok: boolean; message: string; reason?: string };

function revalidate(profileId: string, invoiceId: string | null | undefined) {
  revalidatePath(`/app/admin/leden/${profileId}`);
  if (invoiceId) revalidatePath(`/app/admin/facturen/${invoiceId}`);
}

export async function grantProduct(input: GrantInput): Promise<ProductGrantActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const invalid = validateGrantInput(input);
  if (invalid) return { ok: false, message: invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_grant_product", {
    p_profile_id: input.profileId,
    p_slug: input.slug,
    p_reason: input.reason.trim(),
    p_invoice_id: input.invoiceId || null,
    p_allow_duplicate: input.allowDuplicate === true,
  });

  const result = data as {
    ok?: boolean;
    reason?: string;
    grant_id?: string;
    membership_id?: string;
    credits?: number;
    expires_at?: string | null;
    duplicate_override?: boolean;
    granted?: number;
    allowed?: number;
  } | null;

  if (error || !result?.ok) {
    if (error) console.error("[grantProduct] admin_grant_product", error);
    return {
      ok: false,
      reason: result?.reason,
      message: grantFailureMessage(result?.reason, {
        granted: result?.granted,
        allowed: result?.allowed,
      }),
    };
  }

  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "product_granted",
    target_type: "profile",
    target_id: input.profileId,
    details: {
      grant_id: result.grant_id,
      membership_id: result.membership_id,
      catalogue_slug: input.slug,
      credits: result.credits,
      expires_at: result.expires_at ?? null,
      invoice_id: input.invoiceId || null,
      duplicate_override: result.duplicate_override === true,
      reason: input.reason.trim(),
    },
  });

  revalidate(input.profileId, input.invoiceId);
  // COPY: confirm met Marlon
  return {
    ok: true,
    message: `Product toegekend: ${result.credits} ${result.credits === 1 ? "credit" : "credits"} staan klaar.`,
  };
}

export async function revokeProductGrant(input: {
  grantId: string;
  reason: string;
}): Promise<ProductGrantActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  // COPY: confirm met Marlon
  if (!input.reason || !input.reason.trim()) return { ok: false, message: "Geef een reden op." };

  const admin = createAdminClient();
  const { data: grant } = await admin
    .from("product_grants")
    .select("id, profile_id, invoice_id, catalogue_slug, membership_id")
    .eq("id", input.grantId)
    .maybeSingle();
  if (!grant) return { ok: false, message: revokeFailureMessage("grant_not_found") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_revoke_product_grant", {
    p_grant_id: input.grantId,
    p_reason: input.reason.trim(),
  });
  const result = data as {
    ok?: boolean;
    reason?: string;
    credits_remaining?: number;
    credits_total?: number;
  } | null;

  if (error || !result?.ok) {
    if (error) console.error("[revokeProductGrant] admin_revoke_product_grant", error);
    return {
      ok: false,
      message: revokeFailureMessage(result?.reason, {
        creditsRemaining: result?.credits_remaining,
        creditsTotal: result?.credits_total,
      }),
    };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "product_grant_revoked",
    target_type: "profile",
    target_id: grant.profile_id,
    details: {
      grant_id: grant.id,
      membership_id: grant.membership_id,
      catalogue_slug: grant.catalogue_slug,
      invoice_id: grant.invoice_id,
      reason: input.reason.trim(),
    },
  });

  revalidate(grant.profile_id as string, grant.invoice_id as string | null);
  // COPY: confirm met Marlon
  return { ok: true, message: "Toekenning ingetrokken." };
}
