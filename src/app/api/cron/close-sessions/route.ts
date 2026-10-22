import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runCloseSessions } from "@/lib/attendance/close-core";

export const dynamic = "force-dynamic";

/**
 * Close-sessions cron (fase-2-checkin-model.md, check-in-spoor PR 4), elke
 * 15 minuten. Sluit groepslessen af die 30 minuten voorbij zijn: wie geboekt
 * stond en niet als no-show is gemarkeerd, telt als aanwezig. De regels en
 * de volgorde staan in src/lib/attendance/close-core.ts; dit is de dunne
 * wrapper met de cron-gate. Zolang migratie 20261023120000 niet is gepusht
 * meldt de run migration_pending en schrijft hij niets.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const res = await runCloseSessions({ admin: createAdminClient(), emit: emitEvent });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.message }, { status: 500 });
  }
  if (res.migrationPending) {
    console.warn("[cron/close-sessions] class_sessions.closed_at ontbreekt nog; niets gedaan");
    return NextResponse.json({ ok: true, closed: 0, migration_pending: true });
  }
  if (res.failed.length > 0) {
    console.error("[cron/close-sessions] niet afgesloten", res.failed);
  }
  return NextResponse.json({
    ok: true,
    closed: res.closed,
    auto_marked: res.autoMarked,
    failed: res.failed,
  });
}
