import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/ntfy";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Pending rijen zonder mollie_payment_id zijn wezen: het proces is
 * gecrasht tussen de insert en het koppelen van het payment-id (of de
 * betaling-aanmaak faalde en de delete miste). De webhook kan ze nooit
 * meer vinden, dus na dit venster gaan ze naar cancelled zodat de plek
 * vrijkomt. Het gat tussen insert en koppeling is normaal seconden.
 */
const TRIAL_ORPHAN_HOURS = 1;

/**
 * Expiry-sweep voor tmc.orders plus opruimen van verweesde pending
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
 * Stap 2 ruimt pending trial_bookings zonder payment-id op. De
 * reconciliatie van pending rijen met een payment-id tegen Mollie (in
 * beide richtingen) zit sinds de vrijgave-fix in
 * /api/cron/expire-trial-bookings, elke 15 minuten; hier was dat dagelijks
 * en bleef een plek tot een dag bezet.
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

  // -- 2. Verweesde pending trial_bookings opruimen -------------------------

  let trialsCancelled = 0;

  // Wezen zonder payment-id: nooit door de webhook te vinden.
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

  return NextResponse.json({
    ok: true,
    expired: expired?.length ?? 0,
    adminExpired: adminExpired.length,
    trialsCancelled,
  });
}
