import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Pending trial_bookings ouder dan dit venster worden tegen Mollie
 * gereconcilieerd. De trial-betaling is beperkt tot iDEAL (15 min
 * vervaltijd) en kaart (30 min), dus na 2 uur hoort de webhook allang
 * geweest te zijn; alles wat dan nog pending staat is een gemiste of
 * mislukte webhook-levering.
 */
const TRIAL_RECONCILE_HOURS = 2;

/**
 * Pending rijen zonder mollie_payment_id zijn wezen: het proces is
 * gecrasht tussen de insert en het koppelen van het payment-id (of de
 * betaling-aanmaak faalde en de delete miste). De webhook kan ze nooit
 * meer vinden, dus na dit venster gaan ze naar cancelled zodat de plek
 * vrijkomt. Het gat tussen insert en koppeling is normaal seconden.
 */
const TRIAL_ORPHAN_HOURS = 1;

/**
 * Expiry-sweep voor tmc.orders plus reconciliatie van pending
 * trial_bookings.
 *
 * Stap 1 verplaatst draft/pending orders wier expires_at is verstreken
 * naar status='expired'. Een late betaling op een expired order wordt
 * daarna nog steeds gehonoreerd door tmc.activate_order() (zie
 * ws2-order-pipeline-design.md §4), dus dit is puur opruimen van de
 * "openstaand"-status, geen harde deadline voor de klant.
 *
 * ntfy alleen voor admin-aangemaakte links (created_by='admin'): daar zit
 * een mens (Marlon) die moet weten dat de betaallink verlopen is en
 * opnieuw moet versturen. Zelfservice-orders die verlopen zijn normaal
 * volume (afgehaakte checkouts), niet actionable.
 *
 * Stap 2 is de backstop voor de trial-webhook (capacity-integrity,
 * 2026-07-23): een pending trial_booking telt mee in de sessiecapaciteit
 * (tmc.session_occupancy), dus een rij die de webhook nooit bereikt heeft
 * houdt anders eeuwig een plek bezet. Stale pending rijen worden tegen de
 * Mollie-status gereconcilieerd in beide richtingen: alsnog paid als de
 * betaling gelukt is, cancelled als de betaling definitief niet meer kan
 * slagen. Rijen zonder payment-id gaan direct naar cancelled.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // -- 1. Verlopen orders --------------------------------------------------

  const { data: expired, error } = await admin
    .from("orders")
    .update({ status: "expired" })
    .in("status", ["draft", "pending"])
    .lt("expires_at", now)
    .select("id, created_by, catalogue_slug, profile_id");

  if (error) {
    console.error("[cron/expire-orders] update failed", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const adminExpired = (expired ?? []).filter((o) => o.created_by === "admin");
  for (const order of adminExpired) {
    await sendNotification(
      "Betaallink verlopen",
      `Order ${order.id} (${order.catalogue_slug}) is verlopen zonder betaling. Opnieuw versturen?`,
      "warning",
    );
  }

  // -- 2. Stale pending trial_bookings reconcilieren -----------------------

  let trialsCancelled = 0;
  let trialsPaid = 0;
  let trialsSkipped = 0;

  // 2a. Wezen zonder payment-id: nooit door de webhook te vinden.
  const orphanCutoff = new Date(
    Date.now() - TRIAL_ORPHAN_HOURS * 3_600_000,
  ).toISOString();
  const { data: orphans, error: orphanErr } = await admin
    .from("trial_bookings")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("status", "pending")
    .is("mollie_payment_id", null)
    .lt("booked_at", orphanCutoff)
    .select("id");

  if (orphanErr) {
    console.error("[cron/expire-orders] orphan trial sweep failed", orphanErr);
  } else {
    trialsCancelled += orphans?.length ?? 0;
  }

  // 2b. Stale pending met payment-id: Mollie is de waarheid.
  const staleCutoff = new Date(
    Date.now() - TRIAL_RECONCILE_HOURS * 3_600_000,
  ).toISOString();
  const { data: stale, error: staleErr } = await admin
    .from("trial_bookings")
    .select("id, mollie_payment_id, session_id, name, email, phone")
    .eq("status", "pending")
    .not("mollie_payment_id", "is", null)
    .lt("booked_at", staleCutoff);

  if (staleErr) {
    console.error("[cron/expire-orders] stale trial query failed", staleErr);
  }

  const mollie = getMollieClient();
  if ((stale?.length ?? 0) > 0 && !mollie) {
    console.error(
      "[cron/expire-orders] mollie not configured; stale trials left as-is",
    );
  }

  for (const trial of stale ?? []) {
    if (!mollie || !trial.mollie_payment_id) {
      trialsSkipped += 1;
      continue;
    }
    try {
      const payment = await mollie.payments.get(trial.mollie_payment_id);

      if (payment.status === "paid") {
        // Gemiste webhook in de goede richting: alsnog bevestigen, met
        // hetzelfde vervolg als de webhook (event + ntfy). De statusguard
        // maakt dit idempotent tegen een gelijktijdige webhook-levering.
        const { data: updated, error: upErr } = await admin
          .from("trial_bookings")
          .update({ status: "paid" })
          .eq("id", trial.id)
          .eq("status", "pending")
          .select("id");
        if (upErr || (updated?.length ?? 0) === 0) {
          trialsSkipped += 1;
          continue;
        }
        await emitEvent({
          type: "trial_booking.paid",
          actorType: "system",
          actorId: null,
          subjectType: "trial_booking",
          subjectId: trial.id,
          payload: { session_id: trial.session_id, via: "cron_reconcile" },
        });
        await sendNotification(
          "Nieuwe proefles-boeking!",
          `${trial.name} (${trial.email}, ${trial.phone}) heeft betaald voor een proefles (via reconciliatie).`,
          "muscle,fire",
        );
        trialsPaid += 1;
      } else if (
        payment.status === "failed" ||
        payment.status === "canceled" ||
        payment.status === "expired"
      ) {
        const { data: cancelled, error: cancelErr } = await admin
          .from("trial_bookings")
          .update({ status: "cancelled", cancelled_at: now })
          .eq("id", trial.id)
          .eq("status", "pending")
          .select("id");
        if (cancelErr) {
          console.error(
            "[cron/expire-orders] trial cancel failed",
            trial.id,
            cancelErr,
          );
          trialsSkipped += 1;
          continue;
        }
        trialsCancelled += cancelled?.length ?? 0;
      } else {
        // Nog open bij Mollie: laten staan, volgende run kijkt opnieuw.
        trialsSkipped += 1;
      }
    } catch (err) {
      console.error(
        "[cron/expire-orders] mollie reconcile failed",
        trial.id,
        err,
      );
      trialsSkipped += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    expired: expired?.length ?? 0,
    adminExpired: adminExpired.length,
    trialsCancelled,
    trialsPaid,
    trialsSkipped,
  });
}
