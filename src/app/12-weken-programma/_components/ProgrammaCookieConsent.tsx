"use client";

import dynamic from "next/dynamic";

// `dynamic(..., { ssr: false })` mag alleen vanuit een Client Component
// (Turbopack build error anders), vandaar dit losse wrapper-bestandje in
// plaats van de dynamic() direct in het server-component layout.tsx.
const CookieConsent = dynamic(
  () =>
    import("@/components/layout/CookieConsent").then((m) => m.CookieConsent),
  { ssr: false },
);

export function ProgrammaCookieConsent() {
  return <CookieConsent />;
}
