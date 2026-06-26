import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelMollieSubscription } from "@/lib/mollie";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Process-cancellations cron.
 *
 * Sluit opzeggingen af op hun einddatum. Pakt memberships met
 * status='cancellation_requested' waarvan cancellation_effective_date is
 * bereikt en:
 *   1. annuleert eerst de Mollie-subscription (stopt de incasso),
 *   2. zet daarna pas status='cancelled' + end_date,
 *   3. emit membership.cancelled.
 *
 * Volgorde is bewust: faalt de Mollie-cancel, dan blijft het lid op
 * cancellation_requested staan zodat de volgende run herprobeert. We
 * markeren nooit 'cancelled' terwijl de incasso nog doorloopt (geld + AVG).
 * Idempotent: al-gecancelde leden vallen buiten de selectie.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: due, error } = await admin
    .from("memberships")
    .select(
      "id, profile_id, plan_variant, mollie_customer_id, mollie_subscription_id",
    )
    .eq("status", "cancellation_requested")
    .lte("cancellation_effective_date", today);

  if (error) {
    console.error("[cron/process-cancellations] fetch failed", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let processed = 0;
  const failures: string[] = [];

  for (const m of due) {
    // 1. Stop de incasso bij Mollie. Geen subscription = niets te stoppen.
    if (m.mollie_subscription_id) {
      const stopped = await cancelMollieSubscription(
        m.mollie_customer_id,
        m.mollie_subscription_id,
      );
      if (!stopped) {
        // Niet flippen; volgende run herprobeert. Loud loggen.
        console.error(
          "[cron/process-cancellations] Mollie cancel failed, leaving as cancellation_requested",
          m.id,
        );
        failures.push(m.id);
        continue;
      }
    }

    // 2. Pas na bevestigde incasso-stop de status flippen. De status-guard
    //    voorkomt een race met een gelijktijdige mutatie.
    const { error: upErr } = await admin
      .from("memberships")
      .update({ status: "cancelled", end_date: today })
      .eq("id", m.id)
      .eq("status", "cancellation_requested");

    if (upErr) {
      console.error("[cron/process-cancellations] update failed", m.id, upErr);
      failures.push(m.id);
      continue;
    }

    await emitEvent({
      type: "membership.cancelled",
      actorType: "system",
      subjectType: "membership",
      subjectId: m.id,
      payload: {
        profile_id: m.profile_id,
        membership_id: m.id,
        reason: "notice_period_ended",
        subscription_cancelled: Boolean(m.mollie_subscription_id),
      },
    });
    processed++;
  }

  if (failures.length > 0) {
    await sendNotification(
      "Opzeggingen niet afgerond",
      `${failures.length} lidmaatschap(pen) konden niet worden afgerond (Mollie-cancel mislukt). Check de logs; de cron herprobeert.`,
      "warning",
    );
  }

  return NextResponse.json({ ok: true, processed, failed: failures.length });
}
