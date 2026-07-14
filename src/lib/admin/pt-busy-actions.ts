"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";

/**
 * PT-agenda C2: dunne wrapper om de bestaande RPC tmc.get_pt_busy
 * (PR A/C1) — hulp bij het prikken van een vrij moment. Geeft uitsluitend
 * bezette intervallen incl. omkleedtijd terug, nooit prospect-data of wie
 * geboekt heeft (de RPC zelf laat dat al weg).
 */

export interface PtBusyBlock {
  ptSessionId: string;
  kind: string;
  startAt: string;
  endAt: string;
  blockedFrom: string;
  blockedUntil: string;
}

export async function getPtBusy(
  trainerId: string,
  fromIso: string,
  toIso: string,
): Promise<PtBusyBlock[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_pt_busy", {
    p_trainer_id: trainerId,
    p_from: fromIso,
    p_to: toIso,
  });
  if (error) {
    console.error("[getPtBusy] rpc", error);
    return [];
  }

  return (data ?? []).map(
    (row: {
      pt_session_id: string;
      kind: string;
      start_at: string;
      end_at: string;
      blocked_from: string;
      blocked_until: string;
    }) => ({
      ptSessionId: row.pt_session_id,
      kind: row.kind,
      startAt: row.start_at,
      endAt: row.end_at,
      blockedFrom: row.blocked_from,
      blockedUntil: row.blocked_until,
    }),
  );
}
