import type { CapacitorConfig } from '@capacitor/cli';

// Server-mode, geen static export (zie capacitor-shell/README.md voor de
// volledige onderbouwing): server.url wijst naar de live Vercel-deployment,
// want de member-app leunt op Server Actions + live Supabase-auth per
// request — dat kan geen lokaal gebundelde static webDir zijn.
//
// LET OP (bevestigde bevinding tijdens discovery, niet zelf opgelost hier):
// betaal-flows (abonnement-signup, PT-boeken met betaling) doen
// `window.location.href = checkoutUrl` naar Mollie's hosted checkout —
// een ander origin, en bij iDEAL/3-D Secure loopt dat door via
// bank-/kaartuitgever-domeinen die niet vooraf op te sommen zijn.
// allowNavigation hieronder dekt *.mollie.com als stopgap, maar de
// robuuste fix is die redirects via @capacitor/browser (in-app-browser,
// geen navigatie-restrictie) te openen i.p.v. in de hoofd-webview te
// laten navigeren. Nog niet gebouwd — zie PR-beschrijving. Vóór livegang
// met echte betalingen moet dit opgelost zijn, anders breekt de
// betaalflow (of voelt hij kapot) binnen de gewrapte app.
const config: CapacitorConfig = {
  appId: 'nl.themovementclub.app',
  appName: 'The Movement Club',
  webDir: 'capacitor-shell/www',
  server: {
    url: 'https://www.themovementclub.nl/app/rooster',
    androidScheme: 'https',
    allowNavigation: ['*.mollie.com'],
  },
  // Native chrome (PR6). Beide blokken zijn hier declaratief te zetten —
  // toegepast door de native laag vóórdat de webview zelfs maar bestaat,
  // dus geen enkel risico op een flits van de OS-default (witte
  // statusbar-tekst / verkeerde achtergrond) tussen app-start en de eerste
  // JS-tick. Geen runtime StatusBar-JS-call nodig: het merk heeft één
  // vaste donkere achtergrond (#0B0B0B, zie CLAUDE.md) over de hele app —
  // marketing-site én member-app — dus er is geen per-pagina lichte
  // variant die een dynamische stijl-switch zou rechtvaardigen.
  plugins: {
    StatusBar: {
      // Style.Dark = "lichte tekst/iconen op donkere achtergrond" in
      // Capacitor-termen (contra-intuïtieve naam: "Dark" beschrijft de
      // *achtergrond* onder de statusbar, niet de iconkleur) — bevestigd
      // in node_modules/@capacitor/status-bar se definitions.d.ts.
      // Correct voor onze near-black achtergrond.
      style: 'DARK',
      backgroundColor: '#0B0B0B',
    },
    SplashScreen: {
      // launchAutoHide bewust UIT: zie SplashScreenHide.tsx voor de
      // volledige onderbouwing — in server-mode is er geen lokaal
      // tussenscherm dat de netwerk-laadtijd van server.url opvangt, dus
      // een vaste timer zou moeten gokken. Handmatig verbergen zodra de
      // pagina client-side mount is de betrouwbare vervanging.
      launchAutoHide: false,
      backgroundColor: '#0B0B0B',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
