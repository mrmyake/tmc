import { CookieConsentClient } from "@/components/layout/CookieConsentClient";

/**
 * Actiepagina's /actie/[slug] (spec-proefles-funnel.md): landingspagina's
 * voor advertenties en flyers, zonder site-nav en footer. SiteShell sluit
 * /actie/ uit van de marketing-chrome (isActie), dus dit layout levert zelf
 * de cookiebanner: campagneverkeer landt hier rechtstreeks, en zonder banner
 * kan een bezoeker nooit toestemming geven en is de boeking niet meetbaar
 * (ga_client_id voor het server-side event trial_booked).
 */
export default function ActieLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CookieConsentClient />
    </>
  );
}
