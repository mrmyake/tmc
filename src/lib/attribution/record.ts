import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeLeadAttribution } from "./params";

export type LeadSourceType = "trial_booking" | "trial_request";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_MAX = 254;

export interface RecordLeadAttributionArgs {
  sourceType: LeadSourceType;
  /** Id van de trial_booking of trial_request die net is aangemaakt. */
  sourceId: string;
  email: string;
  /** Wat de client meestuurde (action-input of JSON-body); wordt hier opnieuw gevalideerd. */
  attribution: unknown;
}

/**
 * Schrijft de attributierij na een geslaagde boeking of aanvraag
 * (spec-marketing-attribution.md). Nooit throwen en nooit de aanroeper laten
 * falen: elke fout wordt gelogd en verder niets. Zonder minstens een
 * advertentie- of campagneparameter komt er geen rij. De unieke index op
 * (source_type, source_id) plus on conflict do nothing maakt een dubbele
 * aanroep onschadelijk.
 *
 * Het resultaat is alleen voor tests en logging; productiecode negeert het.
 */
export async function recordLeadAttribution(
  args: RecordLeadAttributionArgs,
  deps: { admin?: SupabaseClient } = {},
): Promise<"inserted" | "skipped" | "failed"> {
  try {
    const sanitized = sanitizeLeadAttribution(args.attribution);
    if (!sanitized) return "skipped";
    if (!UUID_RE.test(args.sourceId)) {
      console.error("[lead-attribution] ongeldig source_id", args.sourceType);
      return "failed";
    }
    const email = (args.email ?? "").trim().toLowerCase().slice(0, EMAIL_MAX);
    if (!email) {
      console.error("[lead-attribution] geen e-mail", args.sourceType, args.sourceId);
      return "failed";
    }

    const admin = deps.admin ?? createAdminClient();
    const { error } = await admin.from("lead_attributions").upsert(
      {
        source_type: args.sourceType,
        source_id: args.sourceId,
        email,
        gclid: sanitized.params.gclid ?? null,
        gbraid: sanitized.params.gbraid ?? null,
        wbraid: sanitized.params.wbraid ?? null,
        fbclid: sanitized.params.fbclid ?? null,
        utm_source: sanitized.params.utm_source ?? null,
        utm_medium: sanitized.params.utm_medium ?? null,
        utm_campaign: sanitized.params.utm_campaign ?? null,
        utm_term: sanitized.params.utm_term ?? null,
        utm_content: sanitized.params.utm_content ?? null,
        landing_path: sanitized.params.landing_path ?? null,
        ad_consent: sanitized.adConsent,
      },
      { onConflict: "source_type,source_id", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[lead-attribution] insert failed", args.sourceType, args.sourceId, error);
      return "failed";
    }
    return "inserted";
  } catch (err) {
    console.error("[lead-attribution] insert threw", args.sourceType, args.sourceId, err);
    return "failed";
  }
}
