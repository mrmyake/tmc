import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Dagelijks om 03:50 Amsterdam: refresh materialized view
 * `vw_admin_kpis`. Gebruikt CONCURRENTLY zodat lopende selects niet
 * blokkeren. Vercel Hobby staat geen sub-daily crons toe, dus dit is
 * de enige ververs-cadans — metrics zijn tot 24u stale.
 */
export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (auth) return auth;

  const admin = createAdminClient();
  const { error } = await admin.rpc("refresh_admin_kpis");

  if (error) {
    console.error("[cron/refresh-kpis] RPC failed", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, refreshed_at: new Date().toISOString() });
}
