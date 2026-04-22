import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email";
import BookingReminder from "@/emails/booking_reminder";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";

export const dynamic = "force-dynamic";

const WINDOW_START_HOURS = 23;
const WINDOW_END_HOURS = 25;

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

/**
 * Runs hourly. Picks booked rows for sessions 23–25h from now that haven't
 * had a reminder yet, sends the 24u email, stamps reminder_sent_at so a
 * re-run skips them. Fire-and-forget per mail — a MailerSend outage doesn't
 * block the stamping (we stamp first, email after) but an early-return cron
 * will retry uncovered rows on the next pass.
 *
 * Net effect: each booking receives at most one reminder, within an hour
 * of the 24h mark.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();

  const now = Date.now();
  const windowStart = new Date(now + WINDOW_START_HOURS * 3_600_000);
  const windowEnd = new Date(now + WINDOW_END_HOURS * 3_600_000);

  type Row = {
    id: string;
    session_id: string;
    profile_id: string;
    profile: {
      first_name: string | null;
      email: string | null;
    } | null;
    session: {
      start_at: string;
      end_at: string;
      status: string;
      class_type: { name: string | null } | null;
      trainer: { display_name: string | null } | null;
    } | null;
  };

  const { data: candidates, error } = await admin
    .from("bookings")
    .select(
      `
        id, session_id, profile_id,
        profile:profiles(first_name, email),
        session:class_sessions(
          start_at, end_at, status,
          class_type:class_types(name),
          trainer:trainers(display_name)
        )
      `,
    )
    .eq("status", "booked")
    .is("reminder_sent_at", null)
    .gte("session_date", windowStart.toISOString().slice(0, 10))
    .lte("session_date", windowEnd.toISOString().slice(0, 10))
    .returns<Row[]>();

  if (error) {
    console.error("[cron/send-reminders] query failed", error);
    return NextResponse.json(
      { ok: false, error: "query failed" },
      { status: 500 },
    );
  }

  const elig = (candidates ?? []).filter((r) => {
    const s = Array.isArray(r.session) ? r.session[0] : r.session;
    if (!s) return false;
    if (s.status !== "scheduled") return false;
    const startMs = new Date(s.start_at).getTime();
    return startMs >= windowStart.getTime() && startMs < windowEnd.getTime();
  });

  let sent = 0;
  let skipped = 0;

  for (const row of elig) {
    type P = { first_name: string | null; email: string | null } | null;
    type S = {
      start_at: string;
      end_at: string;
      class_type: { name: string | null } | { name: string | null }[] | null;
      trainer:
        | { display_name: string | null }
        | { display_name: string | null }[]
        | null;
    } | null;
    const profile = (Array.isArray(row.profile) ? row.profile[0] : row.profile) as P;
    const session = (Array.isArray(row.session) ? row.session[0] : row.session) as S;
    if (!profile?.email || !session) {
      skipped++;
      continue;
    }

    // Stamp first to prevent races across overlapping cron runs.
    const { error: stampErr } = await admin
      .from("bookings")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("reminder_sent_at", null);
    if (stampErr) {
      console.error("[cron/send-reminders] stamp failed", row.id, stampErr);
      skipped++;
      continue;
    }

    const ct = (Array.isArray(session.class_type)
      ? session.class_type[0]
      : session.class_type) as { name: string | null } | null;
    const tr = (Array.isArray(session.trainer)
      ? session.trainer[0]
      : session.trainer) as { display_name: string | null } | null;

    const start = new Date(session.start_at);
    const end = new Date(session.end_at);
    const whenLabel = `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`;

    await sendEmail({
      to: profile.email,
      toName: profile.first_name ?? undefined,
      subject: `Morgen: ${ct?.name ?? "Sessie"}`,
      react: BookingReminder({
        firstName: profile.first_name ?? "",
        className: ct?.name ?? "Sessie",
        trainerName: tr?.display_name ?? "je coach",
        whenLabel,
        siteUrl: siteUrl(),
      }),
    });

    sent++;
  }

  return NextResponse.json({
    ok: true,
    checked: candidates?.length ?? 0,
    eligible: elig.length,
    sent,
    skipped,
  });
}
