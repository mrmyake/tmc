"use client";

import { useEffect } from "react";
import { trackPurchase } from "@/lib/analytics";

interface Props {
  transactionId: string;
  tierId: string;
  tierName: string;
  value: number;
}

export function PurchaseTracker({
  transactionId,
  tierId,
  tierName,
  value,
}: Props) {
  useEffect(() => {
    const key = `purchase_fired_${transactionId}`;
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* sessionStorage kan falen in edge cases — dan vuren we toch */
    }
    trackPurchase({ transactionId, tierId, tierName, value });
  }, [transactionId, tierId, tierName, value]);

  return null;
}
