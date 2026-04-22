import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("no_show_strikes")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    console.error("[cron/expire-strikes] delete failed", error);
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
