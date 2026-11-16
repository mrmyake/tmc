"use client";

import { useState, useEffect, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  COOKIE_SETTINGS_EVENT,
  getStoredConsent,
  setConsent,
} from "@/lib/consent";
import { needsConsentPrompt } from "@/lib/consent-core";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";

/**
 * Cookiebanner met twee categorieen (spec-conversiemeting.md,
 * Consentmapping): analytische cookies (analytics_storage) en
 * advertentiemeting (ad_storage en ad_user_data). ad_personalization blijft
 * altijd denied.
 *
 * Verschijnt zonder keuze, en eenmalig opnieuw bij een keuze in het oude
 * formaat (die ging alleen over analytisch). De link "Cookie-instellingen"
 * (CookieSettingsButton) heropent hem met de huidige keuze voorgevuld.
 *
 * Een component, twee mounts: SiteShell en, via ProgrammaCookieConsent, de
 * layout van /12-weken-programma. Het gedrag is daardoor overal gelijk.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [ads, setAds] = useState(false);
  const analyticsId = useId();
  const adsId = useId();

  useEffect(() => {
    const prefill = () => {
      const stored = getStoredConsent();
      setAnalytics(stored?.choice.analytics === "granted");
      // Een oude keuze is nooit advertentietoestemming.
      setAds(Boolean(stored && !stored.legacy && stored.choice.ads === "granted"));
      return stored;
    };

    if (needsConsentPrompt(prefill())) setVisible(true);

    const reopen = () => {
      prefill();
      setExpanded(true);
      setVisible(true);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  const save = (choice: { analytics: boolean; ads: boolean }) => {
    setConsent({
      analytics: choice.analytics ? "granted" : "denied",
      ads: choice.ads ? "granted" : "denied",
    });
    setVisible(false);
    setExpanded(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
          role="dialog"
          aria-label="Cookie-instellingen"
        >
          <div className="mx-auto max-w-3xl max-h-[85vh] overflow-y-auto bg-bg-elevated border border-bg-subtle p-6 md:p-8 shadow-2xl">
            <p className="text-text text-sm leading-relaxed mb-1">
              {/* COPY: confirm met Marlon */}
              Wij gebruiken cookies
            </p>
            <p className="text-text-muted text-sm leading-relaxed mb-2">
              {/* COPY: confirm met Marlon */}
              We gebruiken analytische cookies om onze website te verbeteren.
              Met jouw toestemming meten we ook of onze advertenties tot een
              proefles of aanmelding leiden. We bouwen geen advertentieprofielen
              en doen niet aan remarketing.
            </p>
            <p className="text-text-muted text-sm leading-relaxed mb-6">
              {/* COPY: confirm met Marlon */}
              Meer weten? Lees onze{" "}
              <QuietLink href="/privacybeleid">privacyverklaring</QuietLink>.
            </p>

            {expanded && (
              <fieldset className="mb-6 border-y border-bg-subtle divide-y divide-bg-subtle">
                <legend className="sr-only">
                  {/* COPY: confirm met Marlon */}
                  Kies per categorie
                </legend>
                <label
                  htmlFor={analyticsId}
                  className="flex items-start gap-4 py-4 cursor-pointer"
                >
                  <input
                    id={analyticsId}
                    type="checkbox"
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="block text-text text-sm">
                      {/* COPY: confirm met Marlon */}
                      Analytische cookies
                    </span>
                    <span className="block text-text-muted text-sm leading-relaxed">
                      {/* COPY: confirm met Marlon */}
                      Bezoekersstatistieken via Google Analytics, zodat we zien
                      welke pagina&apos;s werken en welke niet.
                    </span>
                  </span>
                </label>
                <label
                  htmlFor={adsId}
                  className="flex items-start gap-4 py-4 cursor-pointer"
                >
                  <input
                    id={adsId}
                    type="checkbox"
                    checked={ads}
                    onChange={(e) => setAds(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="block text-text text-sm">
                      {/* COPY: confirm met Marlon */}
                      Advertentiemeting
                    </span>
                    <span className="block text-text-muted text-sm leading-relaxed">
                      {/* COPY: confirm met Marlon */}
                      Meten of een advertentie van Google tot een proefles of
                      aanmelding leidt. Geen persoonlijke advertenties en geen
                      remarketing.
                    </span>
                  </span>
                </label>
              </fieldset>
            )}

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <Button
                onClick={() => save({ analytics: true, ads: true })}
                className="text-sm"
              >
                {/* COPY: confirm met Marlon */}
                Accepteren
              </Button>
              <Button
                variant="secondary"
                onClick={() => save({ analytics: false, ads: false })}
                className="text-sm"
              >
                {/* COPY: confirm met Marlon */}
                Weigeren
              </Button>
              {expanded ? (
                <Button
                  variant="secondary"
                  onClick={() => save({ analytics, ads })}
                  className="text-sm"
                >
                  {/* COPY: confirm met Marlon */}
                  Keuze opslaan
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setExpanded(true)}
                  className="text-sm"
                >
                  {/* COPY: confirm met Marlon */}
                  Zelf kiezen
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
