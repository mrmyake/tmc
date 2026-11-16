"use client";

import { analyticsConsentFromBanner } from "@/lib/attribution/consent";
import { adConsentFromBanner } from "@/lib/consent";
import { readGaIds } from "@/lib/ga-ids";

/**
 * Wat een proefles-submit of checkout meestuurt voor de server-side
 * GA4-events (spec-conversiemeting.md): de GA4-id's van deze sessie en de
 * twee keuzes uit de cookiebanner op dit moment. Best-effort: readGaIds
 * heeft een harde timeout en geeft zonder analytische toestemming niets
 * terug. analyticsConsent (zelfde bron als analyticsConsentFromBanner) gaat
 * mee als extra vangrail: de server slaat de id's alleen op bij "granted".
 * Throwt nooit; de submit mag nooit op analytics wachten of falen.
 */
export async function readGaSubmitMeta(): Promise<{
  gaClientId?: string;
  gaSessionId?: string;
  analyticsConsent: string;
  adConsent: string;
}> {
  let gaClientId: string | undefined;
  let gaSessionId: string | undefined;
  try {
    const ids = await readGaIds();
    gaClientId = ids.clientId;
    gaSessionId = ids.sessionId;
  } catch {
    /* geen id's: de server slaat het event dan over */
  }
  // analyticsConsentFromBanner vangt geblokkeerde storage zelf af (unknown).
  const analyticsConsent = analyticsConsentFromBanner();
  let adConsent = "unknown";
  try {
    adConsent = adConsentFromBanner();
  } catch {
    /* geblokkeerde storage: unknown telt server-side als denied */
  }
  return { gaClientId, gaSessionId, analyticsConsent, adConsent };
}
