import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/ntfy";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Process-change-requests cron.
 *
 * Past pending wijzigingsverzoeken toe op hun factuurdatum via de
 * service-role-RPC tmc.process_due_membership_change_requests: de
 * entitlements (plan, frequentie, pillars, prijsvelden) wisselen naar de
 * snapshot van het verzoek. Het Mollie-bedrag is al bij het verzoek
 * verhoogd (zie requestMembershipChangeCore), dus hier is bewust GEEN
 * Mollie-werk: een gemiste run betekent hooguit dat de nieuwe rechten een
 * dag later ingaan, nooit een verkeerd incassobedrag.
 *
 * Defensieve weigeringen van de RPC (membership niet meer actief,
 * subscription gewisseld) komen terug als failures en worden luid gemeld:
 * daar is het Mollie-bedrag mogelijk al verhoogd zonder dat de rechten
 * volgen, en dat moet een admin zien.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "process_due_membership_change_requests",
  );

  if (error) {
    console.error("[cron/process-change-requests] rpc failed", error);
    await sendNotification(
      "Wijzigingsverzoeken niet verwerkt",
      `De process-change-requests cron faalde: ${error.message}. Pending verzoeken blijven staan; de volgende run herprobeert.`,
      "warning",
    );
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const failed = (data as { failed?: unknown[] } | null)?.failed;
  if (Array.isArray(failed) && failed.length > 0) {
    await sendNotification(
      "Wijzigingsverzoeken geweigerd bij verwerking",
      `${failed.length} wijzigingsverzoek(en) konden niet toegepast worden (membership niet actief of subscription gewisseld). Het Mollie-bedrag kan afwijken; controleer de betreffende leden.`,
      "warning",
    );
  }

  return NextResponse.json(data ?? { ok: true, applied: 0 });
}
