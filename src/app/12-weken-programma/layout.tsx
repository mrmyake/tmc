import { ProgrammaTopbar } from "./_components/ProgrammaTopbar";
import { ProgrammaFooter } from "./_components/ProgrammaFooter";
import { ProgrammaCookieConsent } from "./_components/ProgrammaCookieConsent";

/**
 * Gedeelde eigen chrome voor /12-weken-programma én /12-weken-programma/intake:
 * de mockup's topbar (transparant over de donkere hero) en footer (merk,
 * adres, disclaimer). SiteShell sluit beide routes uit van de standaard
 * Navbar/Footer/FooterCTA/LeadMagnetBanner (zie
 * src/components/layout/SiteShell.tsx), dus deze layout is de enige chrome
 * die deze twee pagina's krijgen.
 *
 * CookieConsent nemen we hier wél expliciet zelf mee: dit is een publieke
 * marketingpagina (vergelijkbaar met /mobility-check), geen auth/CMS-scherm
 * zoals /app, /studio, /login of /checkin — die andere door SiteShell
 * uitgesloten routes missen de banner bewust omdat ze geen publiek
 * marketingverkeer krijgen. GA4 laadt sitebreed (zie layout.tsx) met
 * Consent Mode v2 default "denied", dus zonder banner hier zou een
 * bezoeker die alleen deze pagina bezoekt nooit de kans krijgen om
 * toestemming te geven of te weigeren.
 */
export default function ProgrammaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <ProgrammaTopbar />
      {children}
      <ProgrammaFooter />
      <ProgrammaCookieConsent />
    </div>
  );
}
