import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email";
import { sendPushToProfile } from "@/lib/push";
import BookingReminder from "@/emails/booking_reminder";
import IntakeReminder from "@/emails/intake_reminder";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";

export const dynamic = "force-dynamic";

// PR K: het venster is bewust ruimer dan de uurlijkse cadans.
// Vercel-cron-levering is best-effort: een run kan wegvallen en dezelfde
// run kan dubbel vuren. Met 21-25u vooruit overleeft de reminder tot
// drie gemiste opeenvolgende runs (de sessie zit dan nog steeds in het
// venster van de eerstvolgende run die wel draait), en reminder_sent_at
// dedupet een dubbele run. De correctheid hangt dus niet op
// exact-elk-uur-precies; alleen de timing verschuift bij een gemiste
// run iets richting "ruim 21 uur van tevoren".
const WINDOW_START_HOURS = 21;
const WINDOW_END_HOURS = 25;

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

/**
 * Runs hourly (vercel.json "0 * * * *"; tot PR K stond die per abuis op
 * 1x/dag 18:00 UTC, waardoor vrijwel geen enkele sessie ooit een
 * reminder kreeg). Picks booked rows for sessions in the reminder window
 * that haven't had a reminder yet, sends the 24u email, stamps
 * reminder_sent_at so a re-run skips them. Fire-and-forget per mail — a
 * MailerSend outage doesn't block the stamping (we stamp first, email
 * after) but an early-return cron will retry uncovered rows on the next
 * pass.
 *
 * Net effect: each booking receives at most one reminder, around the
 * 24h mark. Three flavours share the same window and the same
 * stamp-first dedupe, each on its own kolom: groepslessen
 * (bookings.reminder_sent_at), PT-boekingen (pt_bookings.reminder_sent_at)
 * en intakes (pt_sessions.reminder_sent_at, account-loos dus zonder
 * pt_bookings-rij; PR K).
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

    // Los kanaal naast de e-mail — alleen iets doet als het lid de
    // native app heeft (zie src/lib/push.ts). Fire-and-forget, blokkeert
    // de cron niet.
    void sendPushToProfile(row.profile_id, {
      title: `Morgen: ${ct?.name ?? "Sessie"}`,
      body: `${whenLabel} met ${tr?.display_name ?? "je coach"}`,
      data: { type: "booking_reminder", sessionId: row.session_id },
    });

    sent++;
  }

  // PT-boekingen (PT-agenda C1): zelfde window, zelfde stamp-eerst-dedupe
  // op de eigen reminder_sent_at-kolom. Volume is klein (1-op-1 sessies),
  // dus dezelfde run kan het erbij hebben.
  type PtRow = {
    id: string;
    pt_session_id: string;
    profile_id: string;
    profile: { first_name: string | null; email: string | null } | null;
    session: {
      start_at: string;
      end_at: string;
      status: string;
      format: string | null;
      mode: string | null;
      trainer: { display_name: string | null } | null;
    } | null;
  };

  const { data: ptCandidates, error: ptError } = await admin
    .from("pt_bookings")
    .select(
      `
        id, pt_session_id, profile_id,
        profile:profiles(first_name, email),
        session:pt_sessions!inner(
          start_at, end_at, status, format, mode,
          trainer:trainers(display_name)
        )
      `,
    )
    .eq("status", "booked")
    .is("reminder_sent_at", null)
    .gte("session.start_at", windowStart.toISOString())
    .lt("session.start_at", windowEnd.toISOString())
    .returns<PtRow[]>();

  let ptSent = 0;
  let ptSkipped = 0;

  if (ptError) {
    console.error("[cron/send-reminders] pt query failed", ptError);
  } else {
    for (const row of ptCandidates ?? []) {
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      const session = Array.isArray(row.session) ? row.session[0] : row.session;
      if (!profile?.email || !session || session.status !== "scheduled") {
        ptSkipped++;
        continue;
      }

      const { error: stampErr } = await admin
        .from("pt_bookings")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("reminder_sent_at", null);
      if (stampErr) {
        console.error("[cron/send-reminders] pt stamp failed", row.id, stampErr);
        ptSkipped++;
        continue;
      }

      const tr = (Array.isArray(session.trainer)
        ? session.trainer[0]
        : session.trainer) as { display_name: string | null } | null;
      const start = new Date(session.start_at);
      const end = new Date(session.end_at);
      const whenLabel = `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`;
      // COPY: confirm met Marlon
      const className =
        session.format === "duo"
          ? "Personal training duo"
          : session.mode === "online"
            ? "Personal training (online)"
            : "Personal training";

      await sendEmail({
        to: profile.email,
        toName: profile.first_name ?? undefined,
        subject: `Morgen: ${className}`,
        react: BookingReminder({
          firstName: profile.first_name ?? "",
          className,
          trainerName: tr?.display_name ?? "je coach",
          whenLabel,
          siteUrl: siteUrl(),
        }),
      });

      void sendPushToProfile(row.profile_id, {
        title: `Morgen: ${className}`,
        body: `${whenLabel} met ${tr?.display_name ?? "je coach"}`,
        data: { type: "pt_booking_reminder", ptSessionId: row.pt_session_id },
      });

      ptSent++;
    }
  }

  // Intakes (PR K): kind='intake' is account-loos (prospect-velden op de
  // sessie, geen pt_bookings-rij), dus de stempel staat op
  // pt_sessions.reminder_sent_at zelf. Zelfde window, zelfde
  // stamp-eerst-dedupe. Alleen status 'scheduled': een geannuleerde
  // intake is hard gedelete (cancel_pt_intake) en een afgeronde staat op
  // 'completed', dus die krijgen hier nooit een reminder. Geen push:
  // een prospect heeft geen profiel.
  type IntakeRow = {
    id: string;
    start_at: string;
    end_at: string;
    prospect_name: string | null;
    prospect_email: string | null;
    trainer: { display_name: string | null } | null;
  };

  const { data: intakeCandidates, error: intakeError } = await admin
    .from("pt_sessions")
    .select(
      `
        id, start_at, end_at, prospect_name, prospect_email,
        trainer:trainers(display_name)
      `,
    )
    .eq("kind", "intake")
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .gte("start_at", windowStart.toISOString())
    .lt("start_at", windowEnd.toISOString())
    .returns<IntakeRow[]>();

  let intakeSent = 0;
  let intakeSkipped = 0;

  if (intakeError) {
    console.error("[cron/send-reminders] intake query failed", intakeError);
  } else {
    for (const row of intakeCandidates ?? []) {
      if (!row.prospect_email) {
        intakeSkipped++;
        continue;
      }

      const { error: stampErr } = await admin
        .from("pt_sessions")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("reminder_sent_at", null);
      if (stampErr) {
        console.error(
          "[cron/send-reminders] intake stamp failed",
          row.id,
          stampErr,
        );
        intakeSkipped++;
        continue;
      }

      const tr = (Array.isArray(row.trainer)
        ? row.trainer[0]
        : row.trainer) as { display_name: string | null } | null;
      const start = new Date(row.start_at);
      const end = new Date(row.end_at);
      const whenLabel = `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`;

      await sendEmail({
        to: row.prospect_email,
        toName: row.prospect_name ?? undefined,
        // COPY: confirm met Marlon
        subject: "Morgen: je intake bij The Movement Club",
        react: IntakeReminder({
          prospectName: row.prospect_name ?? "",
          trainerName: tr?.display_name ?? "je trainer",
          whenLabel,
          locationLabel: "Industrieweg 14P, Loosdrecht",
          siteUrl: siteUrl(),
        }),
      });

      intakeSent++;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: candidates?.length ?? 0,
    eligible: elig.length,
    sent,
    skipped,
    ptChecked: ptCandidates?.length ?? 0,
    ptSent,
    ptSkipped,
    intakeChecked: intakeCandidates?.length ?? 0,
    intakeSent,
    intakeSkipped,
  });
}
