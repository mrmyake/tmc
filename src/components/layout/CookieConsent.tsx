"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getConsent, setConsent } from "@/lib/consent";
import { Button } from "@/components/ui/Button";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if no choice has been made
    if (getConsent() === null) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    setConsent("granted");
    setVisible(false);
  };

  const deny = () => {
    setConsent("denied");
    setVisible(false);
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
        >
          <div className="mx-auto max-w-3xl bg-bg-elevated border border-bg-subtle p-6 md:p-8 shadow-2xl">
            <p className="text-text text-sm leading-relaxed mb-1">
              Wij gebruiken cookies
            </p>
            <p className="text-text-muted text-sm leading-relaxed mb-6">
              We gebruiken analytische cookies om onze website te verbeteren.
              Geen advertentiecookies, geen tracking door derden.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={accept} className="text-sm">
                Accepteren
              </Button>
              <Button variant="secondary" onClick={deny} className="text-sm">
                Weigeren
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
