import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SiteShell } from "@/components/layout/SiteShell";
import {
  getLocalBusinessSchema,
  getWebsiteSchema,
} from "@/lib/structuredData";
import { getSiteSettings } from "../../sanity/lib/fetch";

export const revalidate = 60;

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
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
        url: "/images/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "The Movement Club | Boutique Training Studio Loosdrecht",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
  },
  alternates: {
    canonical: "https://themovementclub.nl",
  },
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
        {/* Connect early to the CDN that serves the LCP image (Sanity)
            and the Google Font file host. Cuts ~100-300ms off first
            paint on slow 4G. next/font already preloads the font CSS,
            but the underlying .woff2 is on fonts.gstatic.com. */}
        <link rel="preconnect" href="https://cdn.sanity.io" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Google Reviews widget origin (TestimonialCarousel, below
            the fold). Preconnect during idle saves ~330ms on the
            carousel fetch when the user scrolls that far. */}
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
