"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { creditType } from "@/app/app/producten/lib";

/**
 * PT-agenda C2: het PT/duo-tegoedsaldo van een klant, voor de klantkaart
 * in het Boek-voor-klant-scherm. Marlon zet dit saldo in (payment mode
 * "credits" op admin_book_pt_for_member); het is puur informatief hier,
 * geen mutatie. Zelfde discriminatie als creditType() in
 * src/app/app/producten/lib.ts (spiegelt tmc.book_pt_credits/
 * admin_book_pt_for_member): pt_package zonder duo-variant is "pt",
 * pt_package met plan_variant LIKE 'duo%' is "duo".
 */

export interface PtCreditSummary {
  pt: { creditsRemaining: number; expiresAt: string | null } | null;
  duo: { creditsRemaining: number; expiresAt: string | null } | null;
}

export async function getPtCreditSummary(
  profileId: string,
): Promise<PtCreditSummary> {
  const gate = await requireAdmin();
  if (!gate.ok) return { pt: null, duo: null };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("memberships")
    .select("plan_type, plan_variant, credits_remaining, credits_expires_at")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .eq("plan_type", "pt_package")
    .gt("credits_remaining", 0);

  if (error) {
    console.error("[getPtCreditSummary]", error);
    return { pt: null, duo: null };
  }

  const summary: PtCreditSummary = { pt: null, duo: null };
  for (const row of data ?? []) {
    const type = creditType({
      plan_type: row.plan_type,
      plan_variant: row.plan_variant,
    });
    if (type === "pt" && !summary.pt) {
      summary.pt = {
        creditsRemaining: row.credits_remaining,
        expiresAt: row.credits_expires_at,
      };
    } else if (type === "duo" && !summary.duo) {
      summary.duo = {
        creditsRemaining: row.credits_remaining,
        expiresAt: row.credits_expires_at,
      };
    }
  }
  return summary;
}
