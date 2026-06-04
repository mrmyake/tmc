"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

interface Props {
  gaId: string;
}

/**
 * Laadt gtag.js pas ná de eerste user-interactie of bij idle, in plaats
 * van eager bij page-load. gtag.js is ~66 KiB ongebruikte JS op de
 * kritieke render-path; uitstellen verlaagt TBT/LCP fors op mobiel.
 *
 * De Consent Mode v2 defaults + de `gtag()`-stub staan al inline in de
 * <head> (layout.tsx), dus events die vóór het laden via window.gtag
 * worden aangeroepen queuen netjes in dataLayer en flushen zodra gtag.js
 * binnen is. De idle-fallback (met timeout) zorgt dat ook bezoekers die
 * niet interacteren alsnog geteld worden.
 */
export function DeferredAnalytics({ gaId }: Props) {
  const [load, setLoad] = useState(false);

  useEffect(() => {
    if (load) return;

    let triggered = false;
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    const opts: AddEventListenerOptions = { passive: true, once: true };

    const trigger = () => {
      if (triggered) return;
      triggered = true;
      cleanup();
      setLoad(true);
    };

    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const w = window as IdleWindow;

    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(trigger, { timeout: 3500 });
    } else {
      timeoutId = window.setTimeout(trigger, 3000);
    }

    events.forEach((e) => window.addEventListener(e, trigger, opts));

    function cleanup() {
      events.forEach((e) => window.removeEventListener(e, trigger, opts));
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }

    return cleanup;
  }, [load]);

  if (!load) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  );
}
