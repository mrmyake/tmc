import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTrialBookedPayload, isProductionEnv } from "@/lib/ga-mp/core";
import { postMpEvent, readAdConsent, type MpSendDeps, type MpSendResult } from "@/lib/ga-mp/send";
import { trialValueSlugForPillar } from "@/lib/trial-pricing";

const LABEL = "sendTrialBookedToGa4";

export interface TrialBookedDeps extends MpSendDeps {
  admin?: SupabaseClient;
  isProduction?: boolean;
}

/**
 * Server-side GA4 `trial_booked` (spec-conversiemeting.md): de belangrijkste
 * conversie, een keer per definitieve proefboeking, via het Measurement
 * Protocol en met dezelfde regels als `purchase` (ga-purchase.ts): throwt
 * nooit, geen user_id, stil overslaan zonder ga_client_id of zonder
 * GA4_API_SECRET.
 *
 * Aanroepers, altijd ge-awaited binnen after():
 * - betaald: de trial-webhook en de cron expire-trial-bookings, direct na de
 *   geslaagde overgang pending naar paid (de rijtelling van die update is
 *   het exactly-once-signaal) en na de controle op een geannuleerde sessie;
 * - code: startTrialBooking na een geslaagde redeem_trial_code;
 * - gratis: startOpeningTrialBooking na een geslaagde book_opening_trial.
 *
 * De helper leest alles zelf op het boeking-id. amountCents is alleen bij
 * een betaalde proefles gevuld: het bedrag dat Mollie verwerkte. Bij code en
 * gratis is de value de drop-in-prijs van de pillar uit tmc.catalogue.
 *
 * In productie nooit voor een is_test-boeking; buiten productie wel, als
 * intern verkeer (traffic_type en debug_mode, zie ga-mp/core.ts).
 *
 * De nieuwe kolommen worden in losse selects gelezen: ga_client_id,
 * ga_session_id en action_page samen, ad_consent apart. Ontbreken ze nog
 * (migratie niet gepusht), dan is er geen client_id en dus geen event; de
 * boeking zelf merkt daar niets van.
 */
export async function sendTrialBookedToGa4(
  args: { trialBookingId: string; amountCents?: number | null },
  deps: TrialBookedDeps = {},
): Promise<MpSendResult> {
  try {
    const apiSecret = "apiSecret" in deps ? deps.apiSecret : process.env.GA4_API_SECRET;
    if (!apiSecret) {
      console.warn(`[${LABEL}] GA4_API_SECRET ontbreekt, overgeslagen`);
      return "skipped";
    }
    const isProduction = deps.isProduction ?? isProductionEnv();
    const admin = deps.admin ?? createAdminClient();

    // Bestaande kolommen.
    const { data: trial, error } = await admin
      .from("trial_bookings")
      .select("id, is_test, source, session_id, trial_code_id")
      .eq("id", args.trialBookingId)
      .maybeSingle();
    if (error || !trial) {
      console.error(`[${LABEL}] trial read failed`, args.trialBookingId, error);
      return "failed";
    }
    if (trial.is_test === true && isProduction) return "skipped";

    // Nieuwe kolommen, eigen select.
    const { data: ga, error: gaErr } = await admin
      .from("trial_bookings")
      .select("ga_client_id, ga_session_id, action_page")
      .eq("id", args.trialBookingId)
      .maybeSingle();
    if (gaErr) {
      console.error(`[${LABEL}] ga-kolommen lezen mislukt`, args.trialBookingId, gaErr);
      return "skipped";
    }
    if (!ga?.ga_client_id) {
      // Normale situatie: consent denied, of gtag was nog niet geladen.
      return "skipped";
    }

    const adConsent = await readAdConsent(admin, "trial_bookings", args.trialBookingId, LABEL);

    const { data: session } = await admin
      .from("class_sessions")
      .select("pillar")
      .eq("id", trial.session_id)
      .maybeSingle();
    const pillar = (session?.pillar as string | undefined) ?? null;

    let code: { code: string | null; max_uses: number | null } | null = null;
    if (trial.source === "code" && trial.trial_code_id) {
      const { data: codeRow } = await admin
        .from("trial_codes")
        .select("code, max_uses")
        .eq("id", trial.trial_code_id)
        .maybeSingle();
      code = (codeRow as { code: string | null; max_uses: number | null } | null) ?? null;
    }

    let valueCents: number | null = null;
    if (trial.source === "paid") {
      valueCents = typeof args.amountCents === "number" ? args.amountCents : null;
    } else if (pillar) {
      valueCents = await readDropInPriceCents(admin, pillar);
    }

    const payload = buildTrialBookedPayload({
      trialBookingId: args.trialBookingId,
      isTest: trial.is_test === true,
      isProduction,
      clientId: ga.ga_client_id,
      sessionId: ga.ga_session_id,
      adConsent,
      source: trial.source,
      pillar,
      code,
      actionPage: ga.action_page,
      valueCents,
    });
    if (!payload) return "skipped";

    return await postMpEvent(payload, LABEL, `trial ${args.trialBookingId}`, {
      apiSecret,
      fetchImpl: deps.fetchImpl,
    });
  } catch (e) {
    console.error(`[${LABEL}] skipped`, e);
    return "failed";
  }
}

/**
 * Drop-in-prijs van de pillar uit tmc.catalogue, op slug: dezelfde rij als
 * startTrialBooking gebruikt (trial-pricing.ts). Nooit een bedrag uit de
 * code. Null als de rij niet te lezen is; dan gaat er geen value mee.
 */
async function readDropInPriceCents(
  admin: SupabaseClient,
  pillar: string,
): Promise<number | null> {
  const slug = trialValueSlugForPillar(pillar);
  if (!slug) return null;
  try {
    const { data, error } = await admin
      .from("catalogue")
      .select("price_cents")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) {
      console.error(`[${LABEL}] catalogue read failed`, slug, error);
      return null;
    }
    const price = (data as { price_cents: number | null }).price_cents;
    return typeof price === "number" ? price : null;
  } catch (e) {
    console.error(`[${LABEL}] catalogue read threw`, slug, e);
    return null;
  }
}
