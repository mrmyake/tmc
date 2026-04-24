import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SiteShell } from "@/components/layout/SiteShell";
import {
  getLocalBusinessSchema,
  getWebsiteSchema,
} from "@/lib/structuredData";
import { getSiteSettings, getSiteImages } from "../../sanity/lib/fetch";
import { urlFor } from "../../sanity/lib/client";

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
    metadataBase: new URL("https://themovementclub.nl"),
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
      canonical: "https://themovementclub.nl",
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

  return (
    <html
      lang="nl"
      className={`${fraunces.variable} ${inter.variable} antialiased`}
    >
      <head>
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
        <SiteShell settings={settings}>{children}</SiteShell>
        {/* Vercel Speed Insights — only ships the collector script in
            production (no-op on localhost + preview deployments without
            the project linked in the Vercel dashboard). */}
        <SpeedInsights />
      </body>
    </html>
  );
}
