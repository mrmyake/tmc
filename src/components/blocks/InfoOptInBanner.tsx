"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { trackLead, trackFormStart } from "@/lib/analytics";

export function InfoOptInBanner() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const tracked = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    const excludedPaths = ["/beweeg-beter", "/mobility-reset", "/mobility-check"];
    if (excludedPaths.some((p) => pathname.startsWith(p))) return;
    if (sessionStorage.getItem("tmc_banner_shown")) return;

    const handleTrigger = () => {
      const scrollPercent =
        window.scrollY / (document.body.scrollHeight - window.innerHeight);
      if (scrollPercent > 0.5) {
        setVisible(true);
        sessionStorage.setItem("tmc_banner_shown", "1");
        window.removeEventListener("scroll", handleTrigger);
        clearTimeout(timer);
      }
    };

    const timer = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem("tmc_banner_shown", "1");
      window.removeEventListener("scroll", handleTrigger);
    }, 30000);

    window.addEventListener("scroll", handleTrigger, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", handleTrigger);
    };
  }, [pathname]);

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("banner_info_optin");
      tracked.current = true;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
    };

    try {
      await fetch("/api/leads/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      /* continue */
    }

    trackLead("info_optin", 1);
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.1, 1] }}
          className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] bg-bg-elevated border border-bg-subtle"
        >
          <div
            aria-hidden
            className="h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
          />
          <div className="p-6">
            <button
              onClick={() => setVisible(false)}
              className="absolute top-3 right-3 text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text"
              aria-label="Sluiten"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
            {submitted ? (
              // COPY: confirm met Marlon
              <p className="text-text text-base font-medium tracking-[-0.01em] pr-6">
                Bedankt, we houden je op de hoogte.
              </p>
            ) : (
              <>
                {/* COPY: confirm met Marlon */}
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
                  Blijf op de hoogte
                </span>
                {/* COPY: confirm met Marlon */}
                <p className="text-text text-base font-medium mb-5 tracking-[-0.01em] pr-6">
                  Laat je e-mailadres achter en we houden je op de hoogte.
                </p>
                <form
                  onSubmit={handleSubmit}
                  onFocus={handleFocus}
                  className="space-y-5"
                >
                  <Field label="Voornaam">
                    <input
                      type="text"
                      name="name"
                      required
                      autoComplete="given-name"
                      className={fieldInputClasses}
                    />
                  </Field>
                  <Field label="E-mailadres">
                    <input
                      type="email"
                      name="email"
                      required
                      autoComplete="email"
                      className={fieldInputClasses}
                    />
                  </Field>
                  <Button
                    type="submit"
                    className={`w-full text-center ${loading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    {/* COPY: confirm met Marlon */}
                    {loading ? "Versturen" : "Aanmelden"}
                  </Button>
                </form>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
