"use client";

import { CrowdfundingHero } from "./CrowdfundingHero";
import { TierGrid } from "./TierGrid";
import { BackersSection } from "./BackersSection";
import { CrowdfundingFooterCta } from "./CrowdfundingFooterCta";
import { useCrowdfundingLive } from "@/lib/useCrowdfundingLive";
import type {
  CrowdfundingBacker,
  CrowdfundingStats,
} from "@/lib/supabase";
import type {
  SanityCrowdfundingTier,
  SanityImage,
} from "../../../../sanity/lib/fetch";

interface Props {
  active: boolean;
  headline: string;
  subline?: string;
  heroImage?: SanityImage;
  goal: number;
  daysLeft: number | null;
  tiers: SanityCrowdfundingTier[];
  initialStats: CrowdfundingStats;
  initialSlotsByTier: Record<string, number>;
  initialRecentBackers: CrowdfundingBacker[];
  shareUrl: string;
  shareText: string;
  /** Server-rendered sections tussen hero en tiers (story + offering pills) */
  afterHero?: React.ReactNode;
  /** Server-rendered sectie tussen backers en footer CTA (FAQ) */
  beforeFooter?: React.ReactNode;
}

export function CrowdfundingContent({
  active,
  headline,
  subline,
  heroImage,
  goal,
  daysLeft,
  tiers,
  initialStats,
  initialSlotsByTier,
  initialRecentBackers,
  shareUrl,
  shareText,
  afterHero,
  beforeFooter,
}: Props) {
  const { stats, slotsByTier, recentBackers } = useCrowdfundingLive({
    initialStats,
    initialSlotsByTier,
    initialRecentBackers,
  });

  return (
    <>
      <CrowdfundingHero
        headline={headline}
        subline={subline}
        heroImage={heroImage}
        totalRaised={stats.total_raised}
        totalBackers={stats.total_backers}
        goal={goal}
        daysLeft={daysLeft}
        active={active}
      />
      {afterHero}
      <TierGrid tiers={tiers} slotsByTier={slotsByTier} active={active} />
      <BackersSection
        backers={recentBackers}
        totalBackers={stats.total_backers}
      />
      {beforeFooter}
      <CrowdfundingFooterCta
        totalRaised={stats.total_raised}
        totalBackers={stats.total_backers}
        goal={goal}
        daysLeft={daysLeft}
        shareUrl={shareUrl}
        shareText={shareText}
      />
    </>
  );
}
