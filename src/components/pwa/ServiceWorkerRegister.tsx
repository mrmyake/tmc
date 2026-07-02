"use client";

import { useEffect } from "react";

/**
 * Registreert de service worker met scope `/app`, expliciet smaller dan
 * het script's eigen (maximale) scope `/` — consistent met de
 * manifest-scope uit PR1. Rendert niets; puur een side-effect bij mount.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/app" })
      .catch((err) => {
        console.error("[sw] registration failed", err);
      });
  }, []);

  return null;
}
