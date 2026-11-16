"use client";

import { useEffect } from "react";
import { pushDataLayer } from "@/lib/data-layer";

/**
 * dataLayer-haakje proefles_booked op de bedankpagina
 * (spec-proefles-funnel.md). Rendert niets. Vuurt een keer per boeking, ook
 * bij verversen of de terugknop: sessionStorage onthoudt het boeking-id. De
 * server rendert deze component alleen bij een definitieve boeking (status
 * paid), dus een betaling die nog loopt of mislukt telt niet.
 *
 * variant: "actie" als de boeking via een actiepagina liep (action_page
 * gevuld), anders "organic". Geen persoonsgegevens en nooit een code.
 */
export function ProeflesBookedHook({
  trialId,
  source,
  slug,
}: {
  trialId: string;
  /** tmc.trial_bookings.source: paid, code of opening. */
  source: string | null;
  /** tmc.trial_bookings.action_page: de slug van de actiepagina, of null. */
  slug: string | null;
}) {
  useEffect(() => {
    const key = `tmc_proefles_booked_${trialId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Geen sessionStorage (privemodus): liever een keer te veel dan nooit.
    }
    pushDataLayer("proefles_booked", {
      variant: slug ? "actie" : "organic",
      slug,
      source,
    });
  }, [trialId, source, slug]);

  return null;
}
