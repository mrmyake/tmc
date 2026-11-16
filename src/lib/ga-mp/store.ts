import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAdConsent, sanitizeGaClientId, sanitizeGaSessionId } from "./core";
import { writeAdConsent } from "./send";

/**
 * Wat de client bij een proefles-submit of checkout meestuurt voor de
 * server-side events (spec-conversiemeting.md): de GA4-id's van de sessie
 * (readGaIds) en de twee keuzes uit de cookiebanner: analytisch
 * (analyticsConsentFromBanner) en advertentiemeting (adConsentFromBanner).
 * Alles is optioneel en wordt server-side opnieuw gevalideerd.
 */
export interface GaSubmitMeta {
  gaClientId?: string;
  gaSessionId?: string;
  /** granted, denied of unknown. Alleen bij granted worden de id's opgeslagen. */
  analyticsConsent?: string;
  adConsent?: string;
}

/**
 * Server-side vangrail (spec-conversiemeting.md): de GA4-id's alleen
 * bewaren als de client ze meestuurt MET analytische toestemming. De client
 * (readGaIds) geeft zonder die toestemming al niets terug; dit vangt een
 * oudere of afwijkende client af. Zonder "granted" komt er null terug, en
 * zonder opgeslagen ga_client_id vertrekt er geen Measurement
 * Protocol-event. Gedeeld door de proefboekingen en de orders.
 */
export function gaIdsForStorage(
  meta: Pick<GaSubmitMeta, "gaClientId" | "gaSessionId" | "analyticsConsent"> | undefined,
): { ga_client_id: string; ga_session_id: string | null } | null {
  if (!meta) return null;
  if (normalizeAdConsent(meta.analyticsConsent) !== "granted") return null;
  const clientId = sanitizeGaClientId(meta.gaClientId);
  if (!clientId) return null;
  return { ga_client_id: clientId, ga_session_id: sanitizeGaSessionId(meta.gaSessionId) };
}

/**
 * Schrijft de GA4-id's en de advertentiekeuze op de proefboeking, met losse
 * service-role-updates NA de insert of RPC. Nooit in de insert of RPC zelf:
 * zo breekt een boeking niet als de migratie nog niet gepusht is. Twee
 * updates: de id's samen (alleen met analytische toestemming, zie
 * gaIdsForStorage), ad_consent apart. Een mislukte update wordt alleen
 * gelogd; deze functie throwt nooit.
 */
export async function storeTrialBookingGaMeta(
  admin: SupabaseClient,
  trialBookingId: string,
  meta: GaSubmitMeta | undefined,
): Promise<void> {
  if (!meta || !trialBookingId) return;
  const gaIds = gaIdsForStorage(meta);
  if (gaIds) {
    try {
      const { error } = await admin
        .from("trial_bookings")
        .update(gaIds)
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
