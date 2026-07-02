"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return !navigator.onLine;
}

function getServerSnapshot() {
  // SSR heeft geen navigator — nooit "offline" tonen tot de client
  // hydrateert en de echte status kent.
  return false;
}

/**
 * Rooster gebruikt StaleWhileRevalidate (public/sw.js): bij een bezoek
 * toont de SW meteen de laatst gecachete versie en ververst op de
 * achtergrond. Offline kan die achtergrond-refresh niet lukken, dus is de
 * getoonde data mogelijk verouderd — dit banner maakt dat expliciet i.p.v.
 * stilzwijgend een oud rooster te tonen alsof het actueel is.
 */
export function OfflineBanner() {
  const isOffline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="mb-8 inline-flex items-center gap-2 border border-accent/40 bg-bg-elevated px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-accent"
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-accent" />
      Je bent offline — dit rooster kan verouderd zijn
    </div>
  );
}
