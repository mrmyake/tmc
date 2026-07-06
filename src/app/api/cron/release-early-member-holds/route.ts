import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Zet verlopen Early Member-holds op 'expired'.
 *
 * Puur boekhouding: de bezettingstelling in reserve_early_member_slot() en
 * get_early_member_availability() telt 'reserved' alleen mee zolang
 * expires_at in de toekomst ligt, dus een verlopen hold blokkeert nooit een
 * plek — ook niet tussen twee cron-runs in. Idempotent.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("early_member_reservations")
    .update({ status: "expired" })
    .eq("status", "reserved")
    .lt("expires_at", nowIso)
    .select("id");

  if (error) {
    console.error("[cron/release-early-member-holds]", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, released: data?.length ?? 0 });
}
