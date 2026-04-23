"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { trackSelectItem } from "@/lib/analytics";
import type { SanityCrowdfundingTier } from "../../../../sanity/lib/fetch";

interface Props {
  tier: SanityCrowdfundingTier;
  slotsClaimed: number;
  onSelect: (tier: SanityCrowdfundingTier) => void;
  disabled?: boolean;
  index: number;
}

export function TierCard({
  tier,
  slotsClaimed,
  onSelect,
  disabled = false,
  index,
}: Props) {
  const hasLimit = typeof tier.maxSlots === "number" && tier.maxSlots > 0;
  const slotsRemaining = hasLimit ? Math.max(0, tier.maxSlots! - slotsClaimed) : null;
  const soldOut = hasLimit && slotsRemaining === 0;
  const claimedPct = hasLimit
    ? Math.min(100, (slotsClaimed / tier.maxSlots!) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: "easeOut" }}
      whileHover={soldOut ? undefined : { y: -4 }}
      className={`relative flex flex-col h-full border transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
        tier.highlighted
          ? "border-accent bg-bg-elevated"
          : "border-[color:var(--ink-500)]/60 bg-bg-elevated hover:border-accent/40"
      } ${soldOut ? "opacity-50" : ""}`}
    >
      {tier.badge && (
        <div
          className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium ${
            tier.highlighted
              ? "bg-accent text-bg"
              : "bg-bg-subtle border border-accent/40 text-accent"
          }`}
        >
          {tier.badge}
        </div>
      )}

      <div className="p-6 md:p-8 flex-1 flex flex-col">
        <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text tracking-tight">
          {tier.name}
        </h3>
        {tier.tagline && (
          <p className="text-text-muted text-sm mt-2 mb-5">{tier.tagline}</p>
        )}

        <div className="mb-6">
          <div className="flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text">
              {formatEuro(tier.price)}
            </span>
            {tier.normalPrice && tier.normalPrice > tier.price && (
              <span className="text-text-muted line-through text-sm">
                {formatEuro(tier.normalPrice)}
              </span>
            )}
          </div>
          {tier.description && (
            <p className="text-text-muted text-sm mt-2 leading-relaxed">
              {tier.description}
            </p>
          )}
        </div>

        <ul className="space-y-3 mb-6 flex-1">
          {(tier.includes ?? []).map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-text">
              <Check
                className="text-accent flex-shrink-0 mt-0.5"
                size={16}
                strokeWidth={2}
              />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>

        {hasLimit && (
          <div className="mb-5">
            <div className="flex items-center justify-between text-xs text-text-muted mb-2">
              <span>
                {slotsClaimed} van {tier.maxSlots} geclaimd
              </span>
              {!soldOut && slotsRemaining! <= 5 && (
                <span className="text-accent font-medium">
                  Nog {slotsRemaining}
                </span>
              )}
            </div>
            <div className="h-1 bg-bg-subtle overflow-hidden">
              <div
                className="h-full bg-accent transition-[width] duration-700"
                style={{ width: `${claimedPct}%` }}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            trackSelectItem(tier.tierId, tier.name);
            onSelect(tier);
          }}
          disabled={soldOut || disabled}
          className={`w-full inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
            soldOut
              ? "bg-bg-subtle text-text-muted cursor-not-allowed"
              : disabled
                ? "border border-[color:var(--ink-500)]/60 text-text-muted cursor-not-allowed"
                : tier.highlighted
                  ? "bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
                  : "border border-text-muted/30 text-text hover:border-accent hover:text-accent active:scale-[0.99] cursor-pointer"
          }`}
        >
          {soldOut
            ? "Uitverkocht"
            : disabled
            ? "Binnenkort beschikbaar"
            : "Kies deze tier"}
        </button>
      </div>
    </motion.div>
  );
}
