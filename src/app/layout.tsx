import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { DeferredAnalytics } from "@/components/analytics/DeferredAnalytics";
import { SiteShell } from "@/components/layout/SiteShell";
import { AuthListener } from "@/components/layout/AuthListener";
import { getCampaignWindow, getCampaignPhase } from "@/lib/campaign";
import { SplashScreenHide } from "@/components/capacitor/SplashScreenHide";
import {
  getLocalBusinessSchema,
  getWebsiteSchema,
} from "@/lib/structuredData";
import { SITE_URL } from "@/lib/constants";
import { getSiteSettings, getSiteImages } from "../../sanity/lib/fetch";
import { urlFor } from "../../sanity/lib/client";

const GA_MEASUREMENT_ID = "G-2VFCDM4KRZ";

// Chrome/Safari cachen het tab-favicon los van de normale HTTP-cache en
// negeren daarbij vaak Cache-Control — na een icoonwijziging blijft het
// oude icoon soms dagenlang hangen op een domein dat al eerder bezocht is
// (preview-URLs zijn altijd vers, dus daar valt dit nooit op). Bump deze
// versie bij elke favicon-wijziging zodat de URL verandert en browsers
// het als een nieuwe resource ophalen.
const FAVICON_VERSION = "2";

/**
 * Consent Mode v2 defaults — MOET geïnjecteerd worden vóór gtag.js
 * loadt. Inline in <head> zodat dataLayer bestaat voordat
 * GoogleAnalytics component gtag.js fetched. Bij eerste page-load:
 * alle storage = denied, gtag stuurt cookieless pings. Bij accept
 * flipt CookieConsent dit via `gtag("consent", "update", granted)`.
 */
const CONSENT_DEFAULTS_SCRIPT = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
var stored = null;
try { stored = localStorage.getItem("tmc_cookie_consent"); } catch(e) {}
var state = stored === "granted" ? "granted" : "denied";
gtag("consent", "default", {
  analytics_storage: state,
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  wait_for_update: 500
});
`.trim();

export const revalidate = 60;

// Fraunces wordt alleen in 400 + 500 gebruikt (zie CLAUDE.md §
// Typografie — display weight 400+, geen 300). Geen axes —
// grep confirmed dat geen enkele component `font-variation-settings`
// aanroept. Pinnen houdt payload rond ~25 KiB ipv ~120 KiB
// multi-axis variable.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "500"],
});

// Inter in 400/500/600 — body, eyebrows, CTA-labels.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});

// Async generateMetadata zodat de OG-image uit Sanity (`siteImages.ogImage`)
// direct in de social preview terechtkomt. Valt terug op de statische
// /images/og-default.jpg als er nog geen Sanity-image geüpload is.
export async function generateMetadata(): Promise<Metadata> {
  const images = await getSiteImages();
  const ogUrl = images.ogImage?.asset
    ? urlFor(images.ogImage).width(1200).height(630).url()
    : "/images/og-default.jpg";

  return {
    title: {
      default: "The Movement Club | Boutique Training Studio Loosdrecht",
      template: "%s | The Movement Club",
    },
    description:
      "Exclusieve boutique gym in Loosdrecht. Personal training, small group sessions, mobility en strength. Boek je gratis proefles.",
    metadataBase: new URL(SITE_URL),
    openGraph: {
      type: "website",
      locale: "nl_NL",
      siteName: "The Movement Club",
      images: [
        {
          url: ogUrl,
          width: 1200,
          height: 630,
          alt: "The Movement Club | Boutique Training Studio Loosdrecht",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogUrl],
    },
    alternates: {
      canonical: SITE_URL,
    },
    icons: {
      // SVG eerst voor moderne browsers; de .ico in /app blijft de fallback
      // voor clients die hardcoded /favicon.ico opvragen. Query param
      // voorkomt stale browser-favicon-cache na een icoonwijziging, zie
      // FAVICON_VERSION hierboven.
      icon: [
        {
          url: `/images/tmc-favicon.svg?v=${FAVICON_VERSION}`,
          type: "image/svg+xml",
        },
        { url: `/favicon.ico?v=${FAVICON_VERSION}`, sizes: "256x256" },
      ],
      shortcut: `/favicon.ico?v=${FAVICON_VERSION}`,
    },
  };
}

// Explicit viewport config. These values match Next's defaults but
// documenting them makes future iteration obvious. `initial-scale=1`
// keeps the browser from zooming on orientation change. We
// deliberately do NOT set `maximum-scale=1` because that blocks user
// pinch-zoom which is an accessibility regression. The inputs are
// sized to 16px so Safari doesn't auto-zoom on focus anyway.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSiteSettings();
  // getCampaignWindow() is getagd + 300s-gecached (src/lib/campaign.ts),
  // dus dit voegt geen per-request DB-call toe: de root layout blijft
  // binnen de bestaande ISR (revalidate=60) i.p.v. dynamic.
  const campaignWindow = await getCampaignWindow();
  const campaignDeadlineIso = campaignWindow.closesAtIso;
  const campaignPhase = getCampaignPhase(campaignWindow);

  return (
    <html
      lang="nl"
      className={`${fraunces.variable} ${inter.variable} antialiased`}
    >
      <head>
        {/* Consent Mode v2 defaults. MUST be inline in <head> before
            gtag.js, zodat default-consent is gezet voordat er events
            worden gequeued. Leest optioneel localStorage zodat
            returning visitors met eerdere "granted" meteen granted
            beginnen. */}
        <script
          dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULTS_SCRIPT }}
        />
        {/* Connect early to de Sanity-CDN voor de LCP image. next/font
            self-host de .woff2, die komen dus vanaf onze eigen origin
            (geen preconnect nodig). */}
        <link rel="preconnect" href="https://cdn.sanity.io" />
        {/* Google Reviews widget origin (TestimonialCarousel, below
            the fold). Preconnect during idle saves ~330ms op de
            carousel fetch zodra de user scrollt. */}
        <link rel="preconnect" href="https://featurable.com" />
      </head>
      <body className="min-h-screen flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getLocalBusinessSchema()),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getWebsiteSchema()),
          }}
        />
        <SiteShell
          settings={settings}
          campaignPhase={campaignPhase}
          campaignDeadline={campaignDeadlineIso}
        >
          {children}
        </SiteShell>
        {/* Verbergt het native Capacitor-launchscherm zodra déze pagina
            client-side mount — no-op in de browser-PWA
            (Capacitor.isNativePlatform()-guard). In de root layout, niet
            `/app/layout.tsx`: moet ook op `/login` vuren (zie
            SplashScreenHide.tsx voor de volledige onderbouwing). */}
        <SplashScreenHide />
        {/* gtag.js wordt uitgesteld tot eerste interactie of idle
            (DeferredAnalytics) zodat het niet op de kritieke render-path
            zit. Respecteert de consent-default state die inline in <head>
            is gezet; events queuen in dataLayer tot gtag.js binnen is. */}
        <DeferredAnalytics gaId={GA_MEASUREMENT_ID} />
        {/* AuthListener: zet GA4 user_id + vuurt portal_login bij
            SIGNED_IN / clear bij SIGNED_OUT. Alleen actief als
            consent-state granted is. */}
        <AuthListener />
        {/* Vercel Speed Insights — only ships the collector script in
            production (no-op on localhost + preview deployments without
            the project linked in the Vercel dashboard). */}
        <SpeedInsights />
      </body>
    </html>
  );
}
