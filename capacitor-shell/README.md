# capacitor-shell

Losstaand van de Next.js-app — bewust géén Next.js-buildoutput. `webDir` in
`capacitor.config.ts` wijst hierheen, niet naar `.next/` of een geëxporteerde
static build.

**Waarom een losse map:** de member-app leunt op Server Actions en live
Supabase-auth per request — `next export` (static output) ondersteunt dat
niet, en Capacitor's `cap sync` doet toch niets anders dan bestanden uit
`webDir` kopiëren (geen build-stap). De echte app draait via `server.url`
(zie `capacitor.config.ts`) rechtstreeks tegen de productie-Vercel-
deployment.

**CORRECTIE (vastgesteld tijdens PR6, native chrome-polish):** dit
`www/index.html`-bestand wordt in server-mode NOOIT als tussenscherm
getoond — dat was de oorspronkelijke aanname bij het schrijven van deze map
(PR1), maar bleek onjuist na het lezen van de daadwerkelijke Capacitor-
broncode (`CAPInstanceDescriptor.swift`/`CAPBridgeViewController.swift`
resp. Android's `Bridge.java`): de webview laadt op beide platforms
rechtstreeks `server.url`, zonder tussenstap via `webDir`. Dit bestand
bestaat dus puur omdat Capacitor's tooling een niet-leeg `webDir` vereist
om te kunnen scaffolden (iOS gooit zelfs een fatal load-error als het
ontbreekt) — het lost het koude-start/"blanco scherm"-probleem NIET op
zoals hier eerder beweerd werd.

Die twee pijnpunten (blanco scherm bij koude start, "kale webview"-gevoel)
worden in plaats daarvan opgelost door het NATIVE Capacitor-launchscherm
(`@capacitor/splash-screen`, PR2's gegenereerde assets + PR6's
`launchAutoHide: false` + `src/components/capacitor/SplashScreenHide.tsx`,
die het pas verbergt zodra de live pagina daadwerkelijk client-side gemount
is) — niet door dit bestand.

`www/index.html` blijft inline (geen externe CSS/JS/fonts) puur om aan
Capacitor's aanwezigheids-eis te voldoen, niet omdat het ooit gerenderd
wordt.
