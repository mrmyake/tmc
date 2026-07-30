"use client";

import { useEffect } from "react";

/**
 * Wired in de root layout. Luistert op auth state changes en vuurt bij
 * SIGNED_IN `portal_login` — het conversie-moment, niet het gedrag daarna.
 *
 * Zet bewust géén GA4 `user_id` meer. Onder de meetgrens (zie
 * `src/lib/analytics.ts`) meet GA4 alleen acquisitie op de publieke site;
 * gedrag achter login gaat naar `tmc.events`, waar het al aan een
 * `profile_id` hangt. Een GA4-identiteit koppelen aan iemand die daar toch
 * niet meer gemeten wordt, levert niets op en breidt alleen de
 * PII-oppervlakte uit.
 *
 * Performance: de Supabase-browserclient (+ @supabase/ssr) is een fors
 * bundle die alleen voor ingelogde flows nodig is. We importeren 'm
 * daarom dynamisch (code-split, uit de eerste bundle van elke publieke
 * pagina) en starten pas bij idle, zodat het niet concurreert met de
 * initiële render.
 */
export function AuthListener() {
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const start = async () => {
      const [{ createClient }, { trackPortalLogin }] = await Promise.all([
        import("@/lib/supabase/client"),
        import("@/lib/analytics"),
      ]);
      if (!mounted) return;

      const supabase = createClient();

      const { data: sub } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!mounted) return;
          if (event === "SIGNED_IN" && session?.user) {
            trackPortalLogin("otp");
          }
        },
      );
      unsubscribe = () => sub.subscription.unsubscribe();
    };

    type IdleWindow = Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const w = window as IdleWindow;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(() => start(), { timeout: 4000 });
    } else {
      timeoutId = window.setTimeout(() => start(), 1);
    }

    return () => {
      mounted = false;
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return null;
}
