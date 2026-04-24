"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { PageTransition } from "./PageTransition";
import { FooterCTA } from "@/components/blocks/FooterCTA";
import { UtmTracker } from "./UtmTracker";
import type { SanitySettings } from "../../../sanity/lib/fetch";

// Below-the-fold + interaction-triggered. Both ship framer-motion.
// Dynamic import with ssr:false keeps that weight out of the critical
// bundle — they stream in after the page is interactive.
const LeadMagnetBanner = dynamic(
  () =>
    import("@/components/blocks/LeadMagnetBanner").then(
      (m) => m.LeadMagnetBanner,
    ),
  { ssr: false },
);
const CookieConsent = dynamic(
  () => import("./CookieConsent").then((m) => m.CookieConsent),
  { ssr: false },
);

interface SiteShellProps {
  children: React.ReactNode;
  settings: SanitySettings;
}

export function SiteShell({ children, settings }: SiteShellProps) {
  const pathname = usePathname();
  const isStudio = pathname.startsWith("/studio");
  const isApp = pathname === "/app" || pathname.startsWith("/app/");
  const isLogin = pathname === "/login";
  const isCheckin = pathname === "/checkin" || pathname.startsWith("/checkin/");

  if (isStudio || isApp || isLogin || isCheckin) {
    // Member-app en login: eigen chrome (AppNav / kaal). Geen marketing
    // navbar, footer CTA of lead magnet banner.
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <FooterCTA />
      <Footer settings={settings} />
      <LeadMagnetBanner />
      <CookieConsent />
      <UtmTracker />
    </>
  );
}
