# capacitor-shell

Losstaand van de Next.js-app — bewust géén Next.js-buildoutput. `webDir` in
`capacitor.config.ts` wijst hierheen, niet naar `.next/` of een geëxporteerde
static build.

**Waarom een losse map:** de member-app leunt op Server Actions en live
Supabase-auth per request — `next export` (static output) ondersteunt dat
niet, en Capacitor's `cap sync` doet toch niets anders dan bestanden uit
`webDir` kopiëren (geen build-stap). De echte app draait via
`server.url` (zie `capacitor.config.ts`) rechtstreeks tegen de
productie-Vercel-deployment; deze map is alleen het allereerste scherm dat
Capacitor toont vóórdat die navigatie overneemt.

Dit lost twee bekende server.url-pijnpunten op (zie PR-beschrijving voor de
volledige discovery):
- een blanco scherm bij een koude start zonder netwerk;
- geen "kale webview"-gevoel bij het openen van de app.

`www/index.html` is met opzet inline (geen externe CSS/JS/fonts) — moet
zonder netwerkverbinding kunnen renderen.
