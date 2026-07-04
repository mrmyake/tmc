import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const ABANDONED_HOURS = 24;

/**
 * Ruimt afgebroken workout-sessies op: completed_at is null en started_at
 * ligt meer dan ABANDONED_HOURS geleden (spec-trainingsprotocol.md PR 4).
 * set_logs_session_id_fkey heeft ON DELETE CASCADE, dus de bijbehorende
 * sets verdwijnen automatisch mee.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - ABANDONED_HOURS);

  const { data, error } = await admin
    .from("workout_sessions")
    .delete()
    .is("completed_at", null)
    .lt("started_at", cutoff.toISOString())
    .select("id");

  if (error) {
    console.error("[cron/cleanup-workout-sessions] delete failed", error);
    return NextResponse.json(
      { ok: false, error: "delete failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    removed: data?.length ?? 0,
  });
}
