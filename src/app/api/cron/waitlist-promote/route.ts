import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const CONFIRMATION_MINUTES_FALLBACK = 30;

/**
 * Two jobs per run:
 *   1. Expire promotions whose confirmation_deadline is in the past
 *      (member never confirmed). Sets expired_at.
 *   2. For each scheduled future session with free spots and a waitlist,
 *      promote the top entry — set promoted_at + confirmation_deadline.
 *
 * Idempotent: a second run sees nothing to do.
 *
 * Email-sending for promoted entries is wired from Phase 2 (email infra).
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();

  // -- 1. Expire stale promotions ------------------------------------------
  const nowIso = new Date().toISOString();
  const { data: expiredRows } = await admin
    .from("waitlist_entries")
    .update({ expired_at: nowIso })
    .lt("confirmation_deadline", nowIso)
    .is("confirmed_at", null)
    .is("expired_at", null)
    .not("promoted_at", "is", null)
    .select("id");

  const expired = expiredRows?.length ?? 0;

  // -- 2. Promote top of waitlist for sessions with spots ------------------
  // Fetch settings for the confirmation window.
  const { data: settings } = await admin
    .from("booking_settings")
    .select("waitlist_confirmation_minutes")
    .limit(1)
    .maybeSingle();
  const confirmMinutes =
    settings?.waitlist_confirmation_minutes ?? CONFIRMATION_MINUTES_FALLBACK;

  // All future scheduled sessions. (Filter in the app rather than a joined
  // view so we can correlate with waitlist entries cleanly.)
  const { data: sessions } = await admin
    .from("v_session_availability")
    .select("id, spots_available, waitlist_count, start_at")
    .gt("start_at", nowIso)
    .eq("status", "scheduled");

  const promoted: string[] = [];

  for (const s of sessions ?? []) {
    const spots = s.spots_available ?? 0;
    const wl = s.waitlist_count ?? 0;
    if (spots <= 0 || wl <= 0) continue;

    // Is there already an active (not-yet-expired, not-confirmed) promotion?
    const { count: activePromos } = await admin
      .from("waitlist_entries")
      .select("id", { count: "exact", head: true })
      .eq("session_id", s.id)
      .not("promoted_at", "is", null)
      .is("confirmed_at", null)
      .is("expired_at", null);

    if ((activePromos ?? 0) > 0) continue;

    // Find the top-of-queue unpromoted entry.
    const { data: candidate } = await admin
      .from("waitlist_entries")
      .select("id")
      .eq("session_id", s.id)
      .is("promoted_at", null)
      .is("expired_at", null)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!candidate) continue;

    const deadline = new Date(
      Date.now() + confirmMinutes * 60_000,
    ).toISOString();

    const { error } = await admin
      .from("waitlist_entries")
      .update({
        promoted_at: new Date().toISOString(),
        confirmation_deadline: deadline,
      })
      .eq("id", candidate.id);

    if (error) {
      console.error("[cron/waitlist-promote] promote failed", candidate.id, error);
      continue;
    }

    promoted.push(candidate.id);
  }

  return NextResponse.json({
    ok: true,
    expired,
    promoted: promoted.length,
    promotedIds: promoted,
  });
}
