import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CrowdfundingContent } from "@/components/blocks/crowdfunding/CrowdfundingContent";
import { StorySection } from "@/components/blocks/crowdfunding/StorySection";
import { OfferingPills } from "@/components/blocks/crowdfunding/OfferingPills";
import { CrowdfundingFaq } from "@/components/blocks/crowdfunding/CrowdfundingFaq";
import {
  getCrowdfundingSettings,
  getCrowdfundingTiers,
  getFaqs,
} from "../../../sanity/lib/fetch";
import { getPublicClient, type CrowdfundingBacker, type CrowdfundingStats } from "@/lib/supabase";
import { daysUntil } from "@/lib/crowdfunding-helpers";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Make A Move | Crowdfunding",
  description:
    "Word founding member van The Movement Club in Loosdrecht. Kies jouw tier, claim je plek, en bouw met ons mee.",
  alternates: { canonical: "https://themovementclub.nl/crowdfunding" },
  openGraph: {
    title: "Make A Move | The Movement Club Crowdfunding",
    description:
      "Word founding member van The Movement Club in Loosdrecht. Geen anonieme investeerders. Wij bouwen deze gym samen.",
    url: "https://themovementclub.nl/crowdfunding",
    type: "website",
  },
};

async function getInitialLiveData(tierIds: string[]): Promise<{
  stats: CrowdfundingStats;
  slotsByTier: Record<string, number>;
  recentBackers: CrowdfundingBacker[];
}> {
  const fallback = {
    stats: { total_raised: 0, total_backers: 0 },
    slotsByTier: Object.fromEntries(tierIds.map((id) => [id, 0])),
    recentBackers: [] as CrowdfundingBacker[],
  };

  const supabase = getPublicClient();
  if (!supabase) return fallback;

  try {
    const [statsRes, tiersRes, backersRes] = await Promise.all([
      supabase
        .from("crowdfunding_stats")
        .select("total_raised,total_backers")
        .eq("id", 1)
        .maybeSingle(),
      supabase.from("crowdfunding_tiers").select("id,slots_claimed"),
      supabase
        .from("crowdfunding_backers")
        .select("id,created_at,tier_id,tier_name,amount,name,show_on_wall,payment_status")
        .eq("payment_status", "paid")
        .eq("show_on_wall", true)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const slotsByTier = { ...fallback.slotsByTier };
    for (const row of (tiersRes.data ?? []) as { id: string; slots_claimed: number }[]) {
      slotsByTier[row.id] = row.slots_claimed ?? 0;
    }

    return {
      stats:
        (statsRes.data as CrowdfundingStats | null) ?? fallback.stats,
      slotsByTier,
      recentBackers: (backersRes.data as CrowdfundingBacker[] | null) ?? [],
    };
  } catch (e) {
    console.warn("[Supabase] initial live fetch failed:", e);
    return fallback;
  }
}

export default async function CrowdfundingPage() {
  const [settings, tiers, faqs] = await Promise.all([
    getCrowdfundingSettings(),
    getCrowdfundingTiers(),
    getFaqs("crowdfunding"),
  ]);

  if (!settings) notFound();

  const live = await getInitialLiveData(tiers.map((t) => t.tierId));

  const shareUrl = "https://themovementclub.nl/crowdfunding";
  const shareText =
    settings.whatsappShareText ??
    "Ik heb mijn move gemaakt. Jij ook? Word founding member van The Movement Club in Loosdrecht:";

  return (
    <CrowdfundingContent
      active={settings.active}
      headline={settings.headline}
      subline={settings.subline}
      heroImage={settings.heroImage}
      goal={settings.goal}
      daysLeft={daysUntil(settings.endDate)}
      tiers={tiers}
      initialStats={live.stats}
      initialSlotsByTier={live.slotsByTier}
      initialRecentBackers={live.recentBackers}
      shareUrl={shareUrl}
      shareText={shareText}
      afterHero={
        <>
          <StorySection
            story={settings.story}
            budgetItems={settings.budgetItems}
          />
          <OfferingPills />
        </>
      }
      beforeFooter={<CrowdfundingFaq faqs={faqs} />}
    />
  );
}
