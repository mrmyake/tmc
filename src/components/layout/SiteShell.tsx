"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { PageTransition } from "./PageTransition";
import { FooterCTA } from "@/components/blocks/FooterCTA";
import { LeadMagnetBanner } from "@/components/blocks/LeadMagnetBanner";
import { Analytics } from "./Analytics";
import { CookieConsent } from "./CookieConsent";
import { UtmTracker } from "./UtmTracker";
import type { SanitySettings } from "../../../sanity/lib/fetch";

interface SiteShellProps {
  children: React.ReactNode;
  settings: SanitySettings;
}

export function SiteShell({ children, settings }: SiteShellProps) {
  const pathname = usePathname();
  const isStudio = pathname.startsWith("/studio");
  const isApp = pathname === "/app" || pathname.startsWith("/app/");
  const isLogin = pathname === "/login";

  if (isStudio || isApp || isLogin) {
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
      <Analytics />
      <CookieConsent />
      <UtmTracker />
    </>
  );
}
