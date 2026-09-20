"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { appUrlToPath } from "@/lib/native/return-url";

/**
 * Terugkeer in de native app na een Mollie-betaling (workstream A).
 *
 * Twee ingangen voor dezelfde URL: `appUrlOpen` als de app al draait (de
 * gebruiker zat in de in-app browser en Mollie stuurde naar het custom
 * scheme), en `App.getLaunchUrl()` bij een koude start (iOS heeft de app
 * intussen opgeruimd; de webview laadt opnieuw server.url en de
 * client-state van de checkout is weg). In beide gevallen draagt de URL
 * zelf het pad met order-, token- of trial-id, dus de returnpagina werkt
 * zonder bewaarde state.
 *
 * Volgorde: eerst de in-app browser sluiten (op iOS staat de
 * SFSafariViewController nog over de app; op Android is close() niet
 * ondersteund voor Custom Tabs en rejected hij, de app staat dan al op de
 * voorgrond), dan client-side navigeren zodat de sessiecookies van de
 * webview gewoon meegaan. Dezelfde URL wordt nooit twee keer afgehandeld:
 * bij een koude start kunnen beide ingangen vuren.
 *
 * Gemount in de ROOT layout, om dezelfde reden als SplashScreenHide: bij
 * een koude start zonder sessie zit de webview op /login, buiten /app.
 * No-op in de browser.
 */
export function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handled = new Set<string>();
    const handle = async (url: string | undefined | null) => {
      if (!url || handled.has(url)) return;
      const path = appUrlToPath(url);
      if (!path) return;
      handled.add(url);
      try {
        await Browser.close();
      } catch {
        // Android Custom Tabs: close() niet ondersteund; de intent heeft de
        // app al naar de voorgrond gehaald.
      }
      router.push(path);
    };

    const listener = App.addListener("appUrlOpen", (event) => {
      void handle(event.url);
    });
    void App.getLaunchUrl()
      .then((launch) => handle(launch?.url))
      .catch((err) => console.error("[deeplink] getLaunchUrl failed", err));

    return () => {
      void listener.then((l) => l.remove()).catch(() => undefined);
    };
  }, [router]);

  return null;
}
