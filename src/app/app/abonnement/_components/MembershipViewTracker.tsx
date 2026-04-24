"use client";

import { useEffect } from "react";
import { trackMembershipView } from "@/lib/analytics";

/**
 * Vuurt `membership_view` bij mount van `/app/abonnement`. Server
 * component kan geen GA events sturen, dus we delegeren naar een
 * hair-thin client component die alleen dit event fired.
 */
export function MembershipViewTracker({ currentPlan }: { currentPlan: string }) {
  useEffect(() => {
    trackMembershipView(currentPlan);
  }, [currentPlan]);
  return null;
}
