"use client";

import { useEffect, useRef, useState } from "react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TierCard } from "./TierCard";
import { CheckoutModal } from "./CheckoutModal";
import { trackViewItemList } from "@/lib/analytics";
import type { SanityCrowdfundingTier } from "../../../../sanity/lib/fetch";

interface Props {
  tiers: SanityCrowdfundingTier[];
  slotsByTier: Record<string, number>;
  active: boolean;
}

export function TierGrid({ tiers, slotsByTier, active }: Props) {
  const [selected, setSelected] = useState<SanityCrowdfundingTier | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!gridRef.current || firedRef.current) return;
    const el = gridRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !firedRef.current) {
          firedRef.current = true;
          trackViewItemList("crowdfunding_tiers");
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Section id="tiers">
      <Container>
        <SectionHeading
          label="Reward tiers"
          heading="Kies jouw move"
          subtext="Hoe je instapt bepaal je zelf. Elke tier geeft je een plek aan de start van The Movement Club."
        />

        <div
          ref={gridRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pt-4"
        >
          {tiers.map((tier, i) => (
            <TierCard
              key={tier._id}
              tier={tier}
              slotsClaimed={slotsByTier[tier.tierId] ?? 0}
              onSelect={setSelected}
              disabled={!active}
              index={i}
            />
          ))}
        </div>

        {!active && (
          <p className="text-center text-text-muted text-sm mt-10">
            De campagne is nog niet live. Volg ons op Instagram voor de
            lancering.
          </p>
        )}
      </Container>

      <CheckoutModal tier={selected} onClose={() => setSelected(null)} />
    </Section>
  );
}
