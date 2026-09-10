"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const SOFT_REFRESH_MS = 20_000;
const HARD_RELOAD_MS = 60 * 60_000;

/**
 * Houdt de klok, de actieve les en de tellers actueel zonder handmatige
 * refresh, en overleeft een dag onbewaakt op de muurtablet.
 *
 * Twee timers, bewust gescheiden:
 * - `router.refresh()` elke 20s: haalt de pagina server-side opnieuw op
 *   (nieuwe klok/actieve-les/tellers) zonder een volledige page-load,
 *   dus geen flits op het scherm.
 * - `location.reload()` elk uur: harde reset als vangnet. Een enkele
 *   RSC-refresh-timer die urenlang in dezelfde tab blijft draaien kan in
 *   theorie vastlopen of geheugen opstapelen; een uurlijkse volledige
 *   reload is de eenvoudigste garantie dat de kiosk-tab zichzelf
 *   herstelt zonder dat iemand er 's ochtends met de vinger aan hoeft.
 */
export function KioskAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const softTimer = window.setInterval(() => {
      router.refresh();
    }, SOFT_REFRESH_MS);
    const hardTimer = window.setInterval(() => {
      window.location.reload();
    }, HARD_RELOAD_MS);
    return () => {
      window.clearInterval(softTimer);
      window.clearInterval(hardTimer);
    };
  }, [router]);

  return null;
}
