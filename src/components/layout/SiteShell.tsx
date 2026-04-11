"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { PageTransition } from "./PageTransition";
import { FooterCTA } from "@/components/blocks/FooterCTA";
import { LeadMagnetBanner } from "@/components/blocks/LeadMagnetBanner";
import { Analytics } from "./Analytics";
import { CookieConsent } from "./CookieConsent";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStudio = pathname.startsWith("/studio");

  if (isStudio) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <FooterCTA />
      <Footer />
      <LeadMagnetBanner />
      <Analytics />
      <CookieConsent />
    </>
  );
}
