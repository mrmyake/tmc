import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const RELEASE_MINUTES_FALLBACK = 10;

/**
 * Release-no-shows cron.
 *
 * Vindt bookings met status='booked' waarvan de sessie binnen
 * `no_show_release_minutes` minuten start en waarvoor nog geen check_in
 * is geregistreerd. Markeert die bookings als cancelled met
 * `cancellation_reason = 'no_show_release'`, zodat de plek direct vrij
 * komt voor waitlist-promote.
 *
 * Bewust GEEN strike: dit is hybride-beleid ("plek vrij, geen straf",
 * fase-2 spec §No-show beleid). Strike-logica blijft aan de admin via
 * markAttendance OF de auto-no-show flow na afloop van de sessie.
 *
 * Idempotent — een tweede run pakt dezelfde sessies niet nog eens op
 * omdat hun bookings na update niet meer aan status='booked' voldoen.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("booking_settings")
    .select("no_show_release_minutes")
    .limit(1)
    .maybeSingle();
  const releaseMinutes =
    settings?.no_show_release_minutes ?? RELEASE_MINUTES_FALLBACK;

  const now = new Date();
  const cutoff = new Date(now.getTime() + releaseMinutes * 60_000);

  // Fetch candidates: future sessions starting within the release window.
  // Nested select trekt alleen de sessie-id + start_at; filtering op
  // session.start_at gebeurt via de alias-pad `session.start_at`.
  type Row = {
    id: string;
    session_id: string;
    profile_id: string;
    session: { id: string; start_at: string } | null;
  };
  const { data: candidates, error: candErr } = await admin
    .from("bookings")
    .select(
      `id, session_id, profile_id,
       session:class_sessions!inner(id, start_at)`,
    )
    .eq("status", "booked")
    .gte("session.start_at", now.toISOString())
    .lte("session.start_at", cutoff.toISOString())
    .returns<Row[]>();

  if (candErr) {
    console.error("[cron/release-no-shows] candidates fetch", candErr);
    return NextResponse.json(
      { ok: false, error: candErr.message },
      { status: 500 },
    );
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, released: 0 });
  }

  // Voor elke kandidaat checken of er een check_in bestaat. Eén query
  // tegelijk: we trekken alle check_ins in scope en matchen lokaal.
  const sessionIds = Array.from(new Set(candidates.map((r) => r.session_id)));
  const profileIds = Array.from(new Set(candidates.map((r) => r.profile_id)));

  const { data: checkIns } = await admin
    .from("check_ins")
    .select("profile_id, session_id")
    .in("session_id", sessionIds)
    .in("profile_id", profileIds);

  const checkedInKeys = new Set(
    (checkIns ?? []).map((c) => `${c.profile_id}:${c.session_id}`),
  );

  const toRelease = candidates.filter(
    (r) => !checkedInKeys.has(`${r.profile_id}:${r.session_id}`),
  );

  if (toRelease.length === 0) {
    return NextResponse.json({ ok: true, released: 0 });
  }

  const nowIso = now.toISOString();
  const { error: updErr } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      cancellation_reason: "no_show_release",
    })
    .in(
      "id",
      toRelease.map((r) => r.id),
    );

  if (updErr) {
    console.error("[cron/release-no-shows] update failed", updErr);
    return NextResponse.json(
      { ok: false, error: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    released: toRelease.length,
    releaseMinutes,
  });
}
