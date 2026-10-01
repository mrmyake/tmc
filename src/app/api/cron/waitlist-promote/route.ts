import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email";
import { sendPushToProfile } from "@/lib/push";
import WaitlistPromoted from "@/emails/waitlist_promoted";
import { capitalizeFirst, formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { confirmDeadlineLabel } from "@/lib/member/waitlist";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

export const dynamic = "force-dynamic";

/**
 * Dunne wrapper om tmc.promote_waitlist_entries (spec-community-growth.md,
 * sectie Wachtlijst). De RPC sluit verlopen promoties, promoveert per les
 * onder de sessie-lock zoveel wachtenden als er plekken vrij zijn (grens:
 * start meer dan 15 minuten weg), zet de deadline met rustvenster en
 * schrijft de events, alles in een transactie. Overlappende runs zijn
 * daardoor veilig: de tweede wacht op de lock en ziet niets meer te doen.
 *
 * Hier alleen mail en push per gepromoveerde rij, met "bevestig voor HH:MM"
 * in Amsterdamse tijd (de deadline kan door de start geplafonneerd zijn).
 * Draait elke vijf minuten (vercel.json).
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("promote_waitlist_entries");
  if (error) {
    console.error("[cron/waitlist-promote] rpc failed", error);
    return NextResponse.json(
      { ok: false, error: "promote_waitlist_entries mislukt" },
      { status: 500 },
    );
  }

  const result = data as PromoteResult;
  const promoted = result.promoted ?? [];

  // Bewust awaited, geen fire-and-forget: de functie mag niet eindigen
  // voordat de berichten de deur uit zijn. Elke notify vangt zijn eigen
  // fouten; een mislukte mail breekt de run niet.
  await Promise.all(promoted.map((row) => notifyPromoted(row)));

  return NextResponse.json({
    ok: true,
    expired: result.expired ?? 0,
    promoted: promoted.length,
    promotedIds: promoted.map((row) => row.entry_id),
  });
}

type PromotedRow = {
  entry_id: string;
  profile_id: string;
  session_id: string;
  position: number;
  start_at: string;
  confirmation_deadline: string;
};

type PromoteResult = {
  ok: boolean;
  expired?: number;
  promoted?: PromotedRow[];
};

/** Profiel en les ophalen, mail en push sturen. Throwt nooit. */
async function notifyPromoted(row: PromotedRow): Promise<void> {
  try {
    const admin = createAdminClient();
    const [profileRes, sessionRes] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name, email")
        .eq("id", row.profile_id)
        .maybeSingle(),
      admin
        .from("class_sessions")
        .select("start_at, end_at, class_type:class_types(name)")
        .eq("id", row.session_id)
        .maybeSingle(),
    ]);
    const profile = profileRes.data;
    const session = sessionRes.data;
    if (!session) return;

    const ct = (Array.isArray(session.class_type)
      ? session.class_type[0]
      : session.class_type) as { name: string | null } | null;
    const className = ct?.name ?? "Sessie";
    const start = new Date(session.start_at);
    const end = new Date(session.end_at);
    const whenLabel = `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`;
    const deadlineLabel = confirmDeadlineLabel(
      new Date(row.confirmation_deadline),
    );

    if (profile?.email) {
      await sendEmail({
        to: profile.email,
        toName: profile.first_name ?? undefined,
        // COPY: confirm met Marlon
        subject: `Plek vrij: ${className} ${whenLabel}`,
        react: WaitlistPromoted({
          firstName: profile.first_name ?? "",
          className,
          whenLabel,
          deadlineLabel,
          siteUrl: siteUrl(),
        }),
      });
    }

    // Los kanaal naast de e-mail: de deadline is kort, een directe push is
    // hier meer waard dan wachten tot iemand zijn mail leest.
    await sendPushToProfile(row.profile_id, {
      // COPY: confirm met Marlon
      title: `Plek vrij: ${className}`,
      // COPY: confirm met Marlon
      body: `${capitalizeFirst(whenLabel)}. Bevestig ${deadlineLabel}.`,
      data: { type: "waitlist_promoted", waitlistEntryId: row.entry_id },
    });
  } catch (err) {
    console.error("[cron/waitlist-promote notify] skipped", row.entry_id, err);
  }
}
