"use client";

import { useEffect, useState } from "react";
import { getPublicClient, type CrowdfundingStats, type CrowdfundingTierSlots, type CrowdfundingBacker } from "./supabase";

export interface LiveData {
  stats: CrowdfundingStats;
  slotsByTier: Record<string, number>;
  recentBackers: CrowdfundingBacker[];
}

interface Options {
  initialStats: CrowdfundingStats;
  initialSlotsByTier: Record<string, number>;
  initialRecentBackers: CrowdfundingBacker[];
}

export function useCrowdfundingLive({
  initialStats,
  initialSlotsByTier,
  initialRecentBackers,
}: Options): LiveData {
  const [stats, setStats] = useState(initialStats);
  const [slotsByTier, setSlotsByTier] = useState(initialSlotsByTier);
  const [recentBackers, setRecentBackers] = useState(initialRecentBackers);

  useEffect(() => {
    const supabase = getPublicClient();
    if (!supabase) return;

    const statsChannel = supabase
      .channel("cf-stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crowdfunding_stats" },
        (payload) => {
          const row = payload.new as CrowdfundingStats | null;
          if (row) setStats(row);
        }
      )
      .subscribe();

    const tiersChannel = supabase
      .channel("cf-tiers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crowdfunding_tiers" },
        (payload) => {
          const row = payload.new as CrowdfundingTierSlots | null;
          if (row?.id) {
            setSlotsByTier((prev) => ({ ...prev, [row.id]: row.slots_claimed }));
          }
        }
      )
      .subscribe();

    const backersChannel = supabase
      .channel("cf-backers")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crowdfunding_backers" },
        (payload) => {
          const row = payload.new as CrowdfundingBacker | null;
          if (row?.payment_status === "paid" && row.show_on_wall) {
            setRecentBackers((prev) => [row, ...prev].slice(0, 12));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crowdfunding_backers" },
        (payload) => {
          const row = payload.new as CrowdfundingBacker | null;
          if (row?.payment_status === "paid" && row.show_on_wall) {
            setRecentBackers((prev) => {
              if (prev.some((b) => b.id === row.id)) return prev;
              return [row, ...prev].slice(0, 12);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(statsChannel);
      supabase.removeChannel(tiersChannel);
      supabase.removeChannel(backersChannel);
    };
  }, []);

  return { stats, slotsByTier, recentBackers };
}
