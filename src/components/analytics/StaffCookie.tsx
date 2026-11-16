"use client";

import { useEffect } from "react";
import {
  isStaffRole,
  staffCookieClear,
  staffCookieSet,
} from "@/lib/analytics-gate-core";

/**
 * Zet `tmc_staff=1` voor admin en trainer, wist het voor elke andere rol.
 * Alleen een marker voor GA4 (`traffic_type: internal` op marketingpagina's),
 * geen PII en geen autorisatie. Eerste partij, niet httpOnly. Gemount in de
 * outer /app layout, die de rol al kent. signOut en accountverwijdering
 * wissen het server-side.
 */
export function StaffCookie({ role }: { role: string }) {
  useEffect(() => {
    document.cookie = isStaffRole(role) ? staffCookieSet() : staffCookieClear();
  }, [role]);
  return null;
}
