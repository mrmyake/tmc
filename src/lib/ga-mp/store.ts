import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeGaClientId, sanitizeGaSessionId } from "./core";
import { writeAdConsent } from "./send";

/**
 * Wat de client bij een proefles-submit of checkout meestuurt voor de
 * server-side events (spec-conversiemeting.md): de GA4-id's van de sessie
 * (readGaIds) en de advertentiekeuze uit de cookiebanner
 * (adConsentFromBanner). Alles is optioneel en wordt server-side opnieuw
 * gevalideerd.
 */
export interface GaSubmitMeta {
  gaClientId?: string;
  gaSessionId?: string;
  adConsent?: string;
}

/**
 * Schrijft de GA4-id's en de advertentiekeuze op de proefboeking, met losse
 * service-role-updates NA de insert of RPC. Nooit in de insert of RPC zelf:
 * zo breekt een boeking niet als de migratie nog niet gepusht is. Twee
 * updates: de id's samen, ad_consent apart. Een mislukte update wordt alleen
 * gelogd; deze functie throwt nooit.
 */
export async function storeTrialBookingGaMeta(
  admin: SupabaseClient,
  trialBookingId: string,
  meta: GaSubmitMeta | undefined,
): Promise<void> {
  if (!meta || !trialBookingId) return;
  const clientId = sanitizeGaClientId(meta.gaClientId);
  if (clientId) {
    try {
      const { error } = await admin
        .from("trial_bookings")
        .update({
          ga_client_id: clientId,
          ga_session_id: sanitizeGaSessionId(meta.gaSessionId),
        })
        .eq("id", trialBookingId);
      if (error) console.error("[trial-ga-meta] ga-id's schrijven mislukt", trialBookingId, error);
    } catch (e) {
      console.error("[trial-ga-meta] ga-id's schrijven gooide", trialBookingId, e);
    }
  }
  if (meta.adConsent !== undefined) {
    await writeAdConsent(admin, "trial_bookings", trialBookingId, meta.adConsent, "trial-ga-meta");
  }
}
