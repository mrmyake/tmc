"use client";

import { useEffect } from "react";

/**
 * Wired in de root layout. Leest de huidige sessie en, als die er is +
 * consent = granted, zet GA4 user_id. Luistert daarna op auth state
 * changes om bij SIGNED_IN / SIGNED_OUT de user_id te flippen en
 * portal_login te vuren.
 *
 * Performance: de Supabase-browserclient (+ @supabase/ssr) is een fors
 * bundle die alleen voor ingelogde flows nodig is. We importeren 'm
 * daarom dynamisch (code-split, uit de eerste bundle van elke publieke
 * pagina) en starten pas bij idle, zodat het niet concurreert met de
 * initiële render.
 *
 * Consent-gate: setUserId wordt altijd aangeroepen, maar alleen bij
 * consent granted identificeert gtag daadwerkelijk (Consent Mode v2).
 */
export function AuthListener() {
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const start = async () => {
      const [{ createClient }, { setUserId, trackPortalLogin }, { getConsent }] =
        await Promise.all([
          import("@/lib/supabase/client"),
          import("@/lib/analytics"),
          import("@/lib/consent"),
        ]);
      if (!mounted) return;

      const supabase = createClient();

      // Initial sync — als er al een sessie is bij eerste mount.
      supabase.auth.getUser().then(({ data }) => {
        if (!mounted) return;
        if (data.user && getConsent() === "granted") {
          setUserId(data.user.id);
        }
      });

      const { data: sub } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!mounted) return;
          if (event === "SIGNED_IN" && session?.user) {
            if (getConsent() === "granted") {
              setUserId(session.user.id);
            }
            trackPortalLogin("otp");
          }
          if (event === "SIGNED_OUT") {
            setUserId(null);
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
