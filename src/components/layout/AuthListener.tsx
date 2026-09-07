"use client";

import { useEffect } from "react";

/**
 * Wired in de root layout. Doet op dit moment GEEN analytics meer.
 *
 * Vuurde eerder `portal_login` op het Supabase-event `SIGNED_IN`. Dat was
 * fout: `SIGNED_IN` vuurt niet alleen bij een verse login maar ook bij
 * sessieherstel uit storage (`_recoverAndRefresh` vanuit `_initialize`) en
 * bij elke tab-refocus (`visibilitychange`). Omdat deze component in de
 * root layout hangt, telde het event daardoor "sessies bevestigd" in plaats
 * van logins — opgeblazen op elke pagina-boot, ook publiek voor een al
 * ingelogde bezoeker. Eén echte login leverde er minstens twee op, want
 * `LoginForm` vuurt 'm zelf al en navigeert daarna hard.
 *
 * `portal_login` leeft nu uitsluitend in `src/app/login/LoginForm.tsx`, na
 * een geslaagde `verifyLoginOtp` — een echte gebruikershandeling. Zie het
 * principe in `spec-analytics.md`: events hangen aan handelingen, nooit aan
 * mount, auth-state of visibility.
 *
 * Zet ook bewust géén GA4 `user_id` meer. Onder de meetgrens (zie
 * `src/lib/analytics.ts`) meet GA4 alleen acquisitie op de publieke site;
 * gedrag achter login gaat naar `tmc.events`, waar het al aan een
 * `profile_id` hangt.
 *
 * Wat overblijft is een lege auth-state-listener. Die staat er bewust nog:
 * of deze component nog bestaansrecht heeft — hij importeert de forse
 * Supabase-browserclient op elke publieke pagina zonder er nog iets mee te
 * doen — is een auth-vraag, niet een analytics-vraag, en hoort in een
 * aparte PR thuis.
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
      const { createClient } = await import("@/lib/supabase/client");
      if (!mounted) return;

      const supabase = createClient();

      // Geen handler-body: zie de toelichting bovenaan. De subscription blijft
      // staan zodat de auth-PR die over deze component gaat een intacte
      // structuur aantreft, niet een half weggehaalde.
      const { data: sub } = supabase.auth.onAuthStateChange(() => {});
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
