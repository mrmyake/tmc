"use client";

import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import type { ReturnTarget } from "./return-url";

/**
 * Clientkant van de terugkeerflow (workstream A). Twee dingen die elke
 * checkout-knop nodig heeft: welk terugkeerdoel de server action moet
 * gebruiken, en hoe de Mollie-checkout geopend wordt.
 *
 * Op web ongewijzigd: volledige navigatie naar Mollie, terug via https.
 * Native: de checkout opent in de in-app browser (SFSafariViewController
 * op iOS, Custom Tab op Android) zodat de hoofd-webview met sessie en
 * client-state blijft staan; Mollie's redirect naar het custom scheme
 * brengt de gebruiker terug in de app, waar DeepLinkHandler het sheet
 * sluit en naar de returnpagina navigeert.
 */
export function returnTargetForThisClient(): ReturnTarget {
  return Capacitor.isNativePlatform() ? "app" : "web";
}

export async function openCheckout(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
}
