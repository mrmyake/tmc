"use client";

import dynamic from "next/dynamic";

// `dynamic(..., { ssr: false })` mag alleen vanuit een Client Component,
// vandaar dit losse wrapper-bestand voor layouts die buiten de SiteShell
// vallen en toch de cookiebanner nodig hebben (zelfde patroon als
// ProgrammaCookieConsent van /12-weken-programma).
const CookieConsent = dynamic(
  () => import("@/components/layout/CookieConsent").then((m) => m.CookieConsent),
  { ssr: false },
);

export function CookieConsentClient() {
  return <CookieConsent />;
}
