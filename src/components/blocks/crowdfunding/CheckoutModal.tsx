"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { trackBeginCheckout } from "@/lib/analytics";
import type { SanityCrowdfundingTier } from "../../../../sanity/lib/fetch";

interface Props {
  tier: SanityCrowdfundingTier | null;
  onClose: () => void;
}

const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

export function CheckoutModal({ tier, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!tier) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [tier]);

  useEffect(() => {
    if (!tier) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tier, onClose]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tier) return;
    setSubmitting(true);
    setError(null);

    trackBeginCheckout(tier.tierId, tier.name, tier.price);

    const formData = new FormData(e.currentTarget);
    const payload = {
      tierId: tier.tierId,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      showOnWall: formData.get("showOnWall") === "on",
    };

    try {
      const res = await fetch("/api/crowdfunding/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || !body.checkoutUrl) {
        throw new Error(body.error || "Betaling kon niet worden gestart");
      }
      window.location.href = body.checkoutUrl;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Er ging iets mis, probeer opnieuw";
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {tier && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg bg-bg-elevated border border-accent/20 p-6 md:p-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-accent text-xs uppercase tracking-[0.2em] mb-2">
                  Je kiest
                </div>
                <h3
                  id="checkout-title"
                  className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text"
                >
                  {tier.name}
                </h3>
                <div className="text-text-muted mt-1">
                  {formatEuro(tier.price)}
                  {tier.normalPrice ? (
                    <span className="ml-2 line-through text-text-muted/60">
                      {formatEuro(tier.normalPrice)}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Sluiten"
                className="text-text-muted hover:text-text transition-colors"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                name="name"
                placeholder="Volledige naam"
                required
                autoFocus
                className={inputStyles}
              />
              <input
                type="email"
                name="email"
                placeholder="E-mailadres"
                required
                className={inputStyles}
              />
              <input
                type="tel"
                name="phone"
                placeholder="Telefoonnummer (optioneel)"
                className={inputStyles}
              />
              <label className="flex items-start gap-3 text-sm text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  name="showOnWall"
                  defaultChecked
                  className="mt-1 accent-[var(--color-accent)]"
                />
                <span>
                  Laat mijn voornaam op de live backers-lijst zien (alleen
                  voornaam + eerste letter achternaam).
                </span>
              </label>

              {error && (
                <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
                  {error}
                </div>
              )}

              <p className="text-xs text-text-muted leading-relaxed">
                Je wordt doorgestuurd naar onze betaalprovider Mollie. Betaling
                via iDEAL, creditcard of Bancontact. Geen abonnement, geen
                automatische incasso.
              </p>

              <Button type="submit" className="w-full">
                {submitting
                  ? "Even geduld…"
                  : `Betaal ${formatEuro(tier.price)}`}
              </Button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
