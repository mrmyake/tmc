"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

/**
 * Verbergt het NATIVE launch-scherm (Capacitor's `@capacitor/splash-screen`
 * — de gegenereerde `ios/App/App/Assets.xcassets/Splash.imageset` resp. de
 * `android/app/src/main/res/drawable-*`-varianten (elk met een
 * `splash.png`) uit PR2) zodra déze pagina daadwerkelijk client-side
 * gemount is.
 *
 * Waarom handmatig i.p.v. `launchAutoHide` (config-default)?
 *
 * Gecontroleerd (niet aangenomen) door `CAPBridgeViewController.swift`
 * (`loadWebView()`, regel ~176: `bridge.config.appStartServerURL`) en
 * Android's `Bridge.java` (`appUrlConfig = this.getServerUrl()`) te lezen:
 * in server-mode laadt de webview op BEIDE platforms rechtstreeks
 * `server.url` — `capacitor-shell/www/index.html` (`webDir`) wordt daarbij
 * NOOIT als tussenscherm getoond, alleen als aanwezigheids-check gebruikt
 * (iOS gooit een fatal load error als het bestand ontbreekt). Er is dus
 * geen lokaal, netwerk-onafhankelijk scherm dat de laadtijd van de live
 * Vercel-pagina opvangt tussen "native splash weg" en "content zichtbaar".
 *
 * Een vaste `launchShowDuration` zou daarom moeten gokken: te kort geeft
 * een blanco/witte flits vóórdat de pagina-content verschijnt (erger op
 * traag netwerk of een koude Vercel-lambda), te lang voelt traag — precies
 * tegen de "vlotte overgang"-eis in. Verbergen zodra React daadwerkelijk
 * gemount is, is de betrouwbare vervanging: de splash blijft exact zo lang
 * staan als de content nodig heeft om er te zijn, nooit korter.
 *
 * BELANGRIJK: gemount in de ROOT layout (`src/app/layout.tsx`), niet in
 * `/app/layout.tsx`. Bij een koude start zonder actieve sessie redirect
 * `server.url` (`/app/rooster`) server-side naar `/login`, dat BUITEN
 * `/app/**` valt — als dit component alleen in de app-layout zou hangen,
 * zou de native splash op dat pad nooit verborgen worden en zou een
 * nieuwe gebruiker vast blijven zitten op het laadscherm.
 */
export function SplashScreenHide() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void SplashScreen.hide().catch((err) => {
      console.error("[splash] hide failed", err);
    });
  }, []);

  return null;
}
