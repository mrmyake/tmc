"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { lockKiosk, peekKioskSession, touchKioskSession } from "@/lib/kiosk/actions";
import { KIOSK_IDLE_MS, KIOSK_WATCH_MS } from "@/lib/kiosk/constants";

/**
 * Alleen onder een kiosk-sessie (niet bij een staff-login):
 *  - elke 60 s peekKioskSession(): verlengt NIET; is de sessie weg, dan
 *    router.refresh() zodat de layout het slotscherm toont;
 *  - na 10 min zonder aanraking lockKiosk() plus refresh (de server-expiry
 *    is de echte grens; dit maakt het zichtbaar);
 *  - een aanraking of toets na minstens 30 s stilte is een door de gebruiker
 *    gestarte actie en verlengt via touchKioskSession().
 */
export function KioskSessionGuard() {
  const router = useRouter();
  const lastActivity = useRef(0);
  const lastTouch = useRef(0);

  useEffect(() => {
    lastActivity.current = Date.now();
    lastTouch.current = Date.now();
    const onActivity = () => {
      const now = Date.now();
      lastActivity.current = now;
      if (now - lastTouch.current > 30_000) {
        lastTouch.current = now;
        void touchKioskSession().then((r) => {
          if (!r.ok) router.refresh();
        });
      }
    };
    document.addEventListener("pointerdown", onActivity, true);
    document.addEventListener("keydown", onActivity, true);

    const watch = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= KIOSK_IDLE_MS) {
        void lockKiosk().then(() => router.refresh());
        return;
      }
      void peekKioskSession().then((r) => {
        if (!r.ok) router.refresh();
      });
    }, KIOSK_WATCH_MS);

    return () => {
      document.removeEventListener("pointerdown", onActivity, true);
      document.removeEventListener("keydown", onActivity, true);
      window.clearInterval(watch);
    };
  }, [router]);

  return null;
}
