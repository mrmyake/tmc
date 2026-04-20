import type { Metadata } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import { SiteShell } from "@/components/layout/SiteShell";
import {
  getLocalBusinessSchema,
  getWebsiteSchema,
} from "@/lib/structuredData";
import { getSiteSettings } from "../../sanity/lib/fetch";

export const revalidate = 60;

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({
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
      className={`${playfair.variable} ${dmSans.variable} antialiased`}
    >
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
      </body>
    </html>
  );
}
