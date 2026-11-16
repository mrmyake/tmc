"use client";

import { adConsentFromBanner } from "@/lib/consent";
import { readGaIds } from "@/lib/ga-ids";

/**
 * Wat een proefles-submit of checkout meestuurt voor de server-side
 * GA4-events (spec-conversiemeting.md): de GA4-id's van deze sessie en de
 * advertentiekeuze uit de cookiebanner op dit moment. Best-effort: readGaIds
 * heeft een harde timeout, en zonder analytische toestemming zijn de id's
 * undefined. Throwt nooit; de submit mag nooit op analytics wachten of
 * falen.
 */
export async function readGaSubmitMeta(): Promise<{
  gaClientId?: string;
  gaSessionId?: string;
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
  let adConsent = "unknown";
  try {
    adConsent = adConsentFromBanner();
  } catch {
    /* geblokkeerde storage: unknown telt server-side als denied */
  }
  return { gaClientId, gaSessionId, adConsent };
}
