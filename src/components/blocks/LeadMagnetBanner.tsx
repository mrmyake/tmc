"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { trackLead, trackFormStart } from "@/lib/analytics";

const inputStyles =
  "w-full bg-bg border border-bg-subtle px-3 py-2 text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

export function LeadMagnetBanner() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const tracked = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't show on lead magnet pages
    const excludedPaths = ["/beweeg-beter", "/mobility-reset", "/mobility-check"];
    if (excludedPaths.some((p) => pathname.startsWith(p))) return;

    // Don't show if already dismissed this session
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

    // Trigger after 30s OR 50% scroll
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
  }, []);

  const handleFocus = () => {
    if (!tracked.current) {
      trackFormStart("banner_beweeg_beter");
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
      await fetch("/api/leads/beweeg-beter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      // Continue
    }

    trackLead("pdf_beweeg_beter", 1);
    setVisible(false);
    router.push("/beweeg-beter/bedankt");
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed bottom-4 right-4 z-40 w-[340px] max-w-[calc(100vw-2rem)] bg-bg-elevated border border-bg-subtle shadow-2xl p-5"
        >
          <button
            onClick={() => setVisible(false)}
            className="absolute top-3 right-3 text-text-muted hover:text-text transition-colors"
            aria-label="Sluiten"
          >
            <X size={18} />
          </button>
          <p className="font-[family-name:var(--font-playfair)] text-lg text-text mb-1 pr-6">
            Gratis guide
          </p>
          <p className="text-text-muted text-sm mb-4">
            5 oefeningen voor betere mobiliteit
          </p>
          <form
            onSubmit={handleSubmit}
            onFocus={handleFocus}
            className="space-y-3"
          >
            <input
              type="text"
              name="name"
              placeholder="Voornaam"
              required
              className={inputStyles}
            />
            <input
              type="email"
              name="email"
              placeholder="E-mailadres"
              required
              className={inputStyles}
            />
            <Button
              type="submit"
              className={`w-full text-center text-xs ${loading ? "opacity-50 pointer-events-none" : ""}`}
            >
              {loading ? "Bezig..." : "Download gratis"}
            </Button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
