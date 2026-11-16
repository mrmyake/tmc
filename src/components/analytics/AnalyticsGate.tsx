"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { DeferredAnalytics } from "./DeferredAnalytics";
import {
  ensureConsentDefaults,
  syncGate,
  type GateWindow,
} from "@/lib/analytics-gate-core";

interface Props {
  gaId: string;
  isProduction: boolean;
}

/**
 * De pad-gate voor GA4 (zie spec-analytics-scope.md).
 *
 * - `ga-disable-<id>` volgt het pad en de native-status bij elke
 *   pathname-wijziging, in beide richtingen. Tijdens render gezet (client
 *   only, idempotent), zodat er geen hit ontsnapt voor een effect draait.
 * - Op gemeten paden (web): consent-defaults, uitgestelde gtag.js en
 *   precies een handmatige page_view per pathname-wijziging, inclusief de
 *   eerste load. De config staat op send_page_view:false.
 * - Op productroutes en in de native app: niets. Bij een harde load geen
 *   script, geen dataLayer, geen stub.
 */
export function AnalyticsGate({ gaId, isProduction }: Props) {
  const pathname = usePathname();
  const [configured, setConfigured] = useState(false);
  const lastSent = useRef<string | null>(null);
  const onConfigured = useCallback(() => setConfigured(true), []);

  let shouldLoad = false;
  if (typeof window !== "undefined") {
    const win = window as unknown as GateWindow;
    shouldLoad = syncGate(win, pathname, Capacitor);
    if (shouldLoad) ensureConsentDefaults(win);
  }

  useEffect(() => {
    if (!shouldLoad) {
      lastSent.current = null;
      return;
    }
    if (!configured || lastSent.current === pathname) return;
    lastSent.current = pathname;
    // Korte vertraging: Next werkt document.title na een soft nav net na
    // de pathname-wijziging bij.
    const t = window.setTimeout(() => {
      window.gtag?.("event", "page_view", {
        page_location: window.location.href,
        page_title: document.title,
      });
    }, 50);
    return () => window.clearTimeout(t);
  }, [shouldLoad, configured, pathname]);

  if (!shouldLoad) return null;
  return (
    <DeferredAnalytics
      gaId={gaId}
      isProduction={isProduction}
      configured={configured}
      onConfigured={onConfigured}
    />
  );
}
