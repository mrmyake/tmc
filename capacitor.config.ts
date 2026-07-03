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
    // BUGFIX (native verificatie): www.themovementclub.nl staat hier expliciet
    // in allowNavigation. Capacitor's iOS-navigatiebeleid
    // (WebViewDelegationHandler.swift, decidePolicyFor) staat een top-level
    // navigatie alleen intern toe als de nieuwe URL letterlijk begint met de
    // VOLLEDIGE `server.url`-string (incl. pad `/app/rooster`) — zonder deze
    // regel matcht bv. `/login` daar niet tegen en werd élke same-origin
    // navigatie buiten dat ene pad naar de externe Safari gestuurd (empirisch
    // bevestigd: cold start zonder sessie opende /login in Safari i.p.v. in
    // de app). Android's equivalent (Bridge.java, launchIntent) vergelijkt
    // alleen host+scheme en had dit probleem niet — dit was iOS-only.
    //
    // AFGEWEZEN ALTERNATIEF: `server.appStartPath` (Capacitor's eigen
    // mechanisme om met een sub-pad te starten zonder dat pad in de
    // navigatie-whitelist-check te laten meewegen) lijkt de "schone"
    // oplossing, maar `appStartFileURL` (CAPInstanceConfiguration.swift)
    // hergebruikt datzelfde pad óók als vereiste LOKALE bestandslocatie
    // (`webDir/app/rooster`) — die bestaat niet in dit server-mode project
    // (zie capacitor-shell/README.md) en de app weigerde daardoor
    // fataal te starten ("Unable to load .../public//app/rooster"),
    // empirisch bevestigd op iOS Simulator. Vandaar deze eenvoudigere fix.
    url: 'https://www.themovementclub.nl/app/rooster',
    androidScheme: 'https',
    allowNavigation: ['*.mollie.com', 'www.themovementclub.nl'],
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
