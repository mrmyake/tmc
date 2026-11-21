import type { Metadata } from "next";
import { CookieConsentClient } from "@/components/layout/CookieConsentClient";
import { UtmTracker } from "@/components/layout/UtmTracker";
import { HP_ORIGIN } from "@/lib/hormoonprofiel/slugs";

/**
 * Standalone-schil van hormoonprofiel.com (spec-hormoonprofiel.md). Deze route
 * is intern: de proxy herschrijft hormoonprofiel.com/<pad> naar /hp-site/<pad>
 * en geeft op elke andere host een 404. SiteShell geeft hier bewust kale
 * chrome (het geselecteerde segment is "hp-site"); nav en footer staan in de
 * pagina's zelf. De cookiebanner staat hier, want SiteShell mount hem niet.
 */
export const metadata: Metadata = {
  metadataBase: new URL(HP_ORIGIN),
  title: {
    default: "Persoonlijk hormoonprofiel in Loosdrecht | Hormoonprofiel",
    template: "%s | Hormoonprofiel",
  },
  // Standaard-canonical (o.a. voor de 404); elke pagina zet zijn eigen.
  alternates: { canonical: HP_ORIGIN },
  // Tijdelijk icoon: een "h" op salie (open punt in spec-hormoonprofiel.md).
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export default function HpSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <UtmTracker />
      <CookieConsentClient />
    </>
  );
}
