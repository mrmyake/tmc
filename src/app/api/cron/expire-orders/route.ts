import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/ntfy";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Expiry-sweep voor tmc.orders. Verplaatst draft/pending orders wier
 * expires_at is verstreken naar status='expired'. Een late betaling op een
 * expired order wordt daarna nog steeds gehonoreerd door tmc.activate_order()
 * (zie ws2-order-pipeline-design.md §4), dus dit is puur opruimen van de
 * "openstaand"-status, geen harde deadline voor de klant.
 *
 * ntfy alleen voor admin-aangemaakte links (created_by='admin'): daar zit
 * een mens (Marlon) die moet weten dat de betaallink verlopen is en
 * opnieuw moet versturen. Zelfservice-orders die verlopen zijn normaal
 * volume (afgehaakte checkouts), niet actionable.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const now = new Date().toISOString();

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

  return NextResponse.json({
    ok: true,
    expired: expired?.length ?? 0,
    adminExpired: adminExpired.length,
  });
}
