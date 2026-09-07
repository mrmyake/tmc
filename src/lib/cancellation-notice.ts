import { unstable_cache } from "next/cache";
import { getPublicClient } from "@/lib/supabase";

/**
 * Opzegtermijn in dagen. Enige bron is
 * tmc.booking_settings.cancellation_notice_days, ontsloten via de
 * SECURITY DEFINER-RPC tmc.get_cancellation_notice_days() (migratie
 * 20260907120000). Dezelfde functie voedt tmc.request_membership_cancellation,
 * dus wat de UI belooft is wat de RPC rekent. De 28 hieronder is alleen een
 * outage-fallback, nooit de bron.
 */
const FALLBACK_NOTICE_DAYS = 28;

async function fetchCancellationNoticeDays(): Promise<number> {
  const supabase = getPublicClient();
  if (!supabase) return FALLBACK_NOTICE_DAYS;
  const { data, error } = await supabase.rpc("get_cancellation_notice_days");
  const days = typeof data === "number" ? data : Number(data);
  if (error || !Number.isInteger(days) || days <= 0) {
    console.error("[cancellation-notice] get_cancellation_notice_days fetch failed:", error);
    return FALLBACK_NOTICE_DAYS;
  }
  return days;
}

export const getCancellationNoticeDays = unstable_cache(
  fetchCancellationNoticeDays,
  ["cancellation-notice-days"],
  { revalidate: 300, tags: ["booking-settings"] },
);

/** "4 weken" als het een heel aantal weken is, anders "28 dagen". */
export function formatNoticePeriod(days: number): string {
  if (days % 7 === 0) {
    const weeks = days / 7;
    // COPY: confirm met Marlon
    return weeks === 1 ? "1 week" : `${weeks} weken`;
  }
  // COPY: confirm met Marlon
  return days === 1 ? "1 dag" : `${days} dagen`;
}
