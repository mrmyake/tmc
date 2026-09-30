import "server-only";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import type { PresenceWindow } from "@/lib/presence";

/**
 * De aanwezigheidsvensters van Marlon uit tmc.trainer_presence_windows, de
 * enige bron (spec-vrij-trainen-slots.md). De tabel is alleen voor
 * service_role leesbaar; dezelfde tabel leest de RPC tmc.redeem_trial_code.
 * Bij een fout of een lege tabel: lege lijst (de site toont dan geen tijden
 * en de bezoekersslotkiezer geen uren), nooit een gokwaarde.
 */
export async function getTrainerPresenceWindows(): Promise<PresenceWindow[]> {
  if (!isAdminConfigured()) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trainer_presence_windows")
    .select("weekday, from_time, to_time")
    .order("weekday", { ascending: true })
    .order("from_time", { ascending: true });
  if (error) {
    console.error("[trainer-presence] query failed", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    weekday: r.weekday,
    from: String(r.from_time).slice(0, 5),
    to: String(r.to_time).slice(0, 5),
  }));
}
