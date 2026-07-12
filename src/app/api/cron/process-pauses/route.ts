import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/ntfy";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Process-pauses cron.
 *
 * Effectueert geplande pauzes op hun ingangsdatum via de service-role-RPC
 * tmc.process_due_membership_pauses: status active naar paused, veegronde
 * over boekingen die na het plannen alsnog in het pauzevenster belandden,
 * en het pauzevenster in membership_pauses op 'active'.
 *
 * Er is hier bewust GEEN Mollie-werk: de subscription is al bij het plannen
 * geannuleerd (Mollie-eerst, zie admin_pause_membership en de servicelaag),
 * dus een gemiste run kost nooit geld, hooguit een dag boekingstoegang.
 * Er is ook bewust geen hervat-tak: hervatten is handmatig admin-werk
 * (beleid), nooit een cron.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_due_membership_pauses");

  if (error) {
    console.error("[cron/process-pauses] rpc failed", error);
    await sendNotification(
      "Pauze-effectuering mislukt",
      `De process-pauses cron faalde: ${error.message}. Geplande pauzes blijven staan; de volgende run herprobeert.`,
      "warning",
    );
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(data ?? { ok: true, processed: 0 });
}
