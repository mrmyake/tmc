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
};

export default config;
