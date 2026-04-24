"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { setUserId, trackPortalLogin } from "@/lib/analytics";
import { getConsent } from "@/lib/consent";

/**
 * Wired in de root layout. Op elke paint: lees de huidige sessie, en
 * als die er is + consent = granted, zet GA4 user_id. Luistert daarna
 * op auth state changes om bij SIGNED_IN / SIGNED_OUT de user_id te
 * flippen en portal_login te vuren.
 *
 * Consent-gate: we roepen setUserId altijd aan, maar alleen als
 * consent granted is gaat gtag daadwerkelijk identificeren — Consent
 * Mode v2 verwerpt user_id-writes bij analytics_storage=denied.
 */
export function AuthListener() {
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    // Initial sync — als er al een sessie is bij eerste mount
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
          trackPortalLogin("magic_link");
        }
        if (event === "SIGNED_OUT") {
          setUserId(null);
        }
      },
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
