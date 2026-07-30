"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { PageTransition } from "./PageTransition";
import { FooterCTA } from "@/components/blocks/FooterCTA";
import { UtmTracker } from "./UtmTracker";
import type { CampaignPhase } from "@/lib/campaign";
import type { SanitySettings } from "../../../sanity/lib/fetch";

// Below-the-fold + interaction-triggered. Both ship framer-motion.
// Dynamic import with ssr:false keeps that weight out of the critical
// bundle — they stream in after the page is interactive.
const InfoOptInBanner = dynamic(
  () =>
    import("@/components/blocks/InfoOptInBanner").then(
      (m) => m.InfoOptInBanner,
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
  campaignPhase: CampaignPhase;
  campaignDeadline: string;
}

export function SiteShell({
  children,
  settings,
  campaignPhase,
  campaignDeadline,
}: SiteShellProps) {
  const pathname = usePathname();
  const isStudio = pathname.startsWith("/studio");
  const isApp = pathname === "/app" || pathname.startsWith("/app/");
  const isLogin = pathname === "/login";
  const isCheckin = pathname === "/checkin" || pathname.startsWith("/checkin/");
  // WS-5 PR C: een betaallink-ontvanger heeft nog nooit ingelogd en komt
  // hier vaak rechtstreeks vanuit een mail of WhatsApp-bericht binnen. De
  // pagina zelf (src/app/betaal/[token]/page.tsx) is al zelfstandig
  // (eigen <main> + gecentreerde Container), dus alleen de marketing-
  // navbar/footer/EM-banner eromheen uitsluiten is genoeg voor een kale,
  // gefocuste betaalpagina. Geen wijziging aan de betaal-logica zelf.
  const isBetaal = pathname.startsWith("/betaal/");
  // /12-weken-programma heeft een eigen topbar (merk + één CTA, transparant
  // over de donkere hero) en eigen footer (merk, adres, disclaimer, geen
  // 3-koloms nav-footer) — zie src/app/12-weken-programma/layout.tsx. Beide
  // routes (incl. /intake) uitsluiten voorkomt de dubbele-header bug die
  // /beweeg-beter vandaag heeft (LeadPageLayout's eigen header + de
  // standaard Navbar allebei renderen omdat die route hier niet uitgesloten
  // is — niet hier herhalen).
  const isProgramma = pathname.startsWith("/12-weken-programma");

  if (isStudio || isApp || isLogin || isCheckin || isProgramma || isBetaal) {
    // Member-app en login: eigen chrome (AppNav / kaal). Geen marketing
    // navbar, footer CTA of lead magnet banner.
    //
    // UtmTracker hoort hier wél op de twee kale routes waar een campagne
    // rechtstreeks op kan landen: /login (MailerLite-mails) en
    // /betaal/<token> (WS-5 betaallink via mail/WhatsApp). Zonder deze mount
    // leest signInWithOtp een lege sessionStorage en schrijft de signup lege
    // acquisition_*-velden weg — door ON CONFLICT DO NOTHING in
    // handle_new_auth_user zijn die daarna permanent leeg. UtmTracker rendert
    // niets en raakt geen consent-state aan (sessionStorage, geen cookie).
    //
    // Bewust NIET op /app/**: de consent-architectuur voor de member-app is
    // een aparte, nog open beslissing. CookieConsent blijft hier op elke
    // route ongewijzigd afwezig.
    return (
      <>
        {children}
        {(isLogin || isBetaal) && <UtmTracker />}
      </>
    );
  }

  return (
    <>
      <Navbar campaignPhase={campaignPhase} campaignDeadline={campaignDeadline} />
      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <FooterCTA />
      <Footer settings={settings} />
      <InfoOptInBanner />
      <CookieConsent />
      <UtmTracker />
    </>
  );
}
