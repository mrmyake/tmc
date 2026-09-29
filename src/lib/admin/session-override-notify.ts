import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sendPushToProfile } from "@/lib/push";
import SessionCancelledByAdmin from "@/emails/session_cancelled_by_admin";
import SessionRescheduled from "@/emails/session_rescheduled";
import GuestSessionCancelled from "@/emails/guest_session_cancelled";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";

/**
 * Meldingen bij eenmalige wijzigingen van een groepsles door de studio
 * (spec-session-overrides.md). De mutatie zelf zit atomair in de RPC's; dit
 * zijn de bijwerkingen daarna. Throwt nooit: een mislukte mail of push mag de
 * annulering of verschuiving niet laten mislukken (zelfde discipline als
 * sendEmail en sendPushToProfile zelf).
 *
 * Trainer vervangen stuurt bewust niets naar leden (besluit Ilja).
 */

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

function whenLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`;
}

async function className(sessionId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("class_sessions")
    .select("class_type:class_types(name)")
    .eq("id", sessionId)
    .maybeSingle();
  const ct = (Array.isArray(data?.class_type) ? data?.class_type[0] : data?.class_type) as
    | { name: string | null }
    | null
    | undefined;
  // COPY: confirm met Marlon
  return ct?.name ?? "Sessie";
}

async function profilesById(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, { email: string | null; first_name: string | null }>();
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, email, first_name")
    .in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

export interface CancelledSessionResult {
  session_id: string;
  start_at: string;
  end_at: string;
  bookings: Array<{ booking_id: string; profile_id: string; credits_refunded: boolean }>;
  waitlist: Array<{ waitlist_entry_id: string; profile_id: string }>;
  guests: Array<{
    guest_booking_id: string;
    booked_by: string;
    guest_name: string;
    guest_email: string;
  }>;
}

/** Mail en push naar geboekte leden en wachtlijst; mail naar gast en gastheer. */
export async function notifySessionCancelled(
  result: CancelledSessionResult,
  reason: string,
): Promise<void> {
  try {
    const name = await className(result.session_id);
    const when = whenLabel(result.start_at, result.end_at);
    const profiles = await profilesById([
      ...result.bookings.map((b) => b.profile_id),
      ...result.waitlist.map((w) => w.profile_id),
      ...result.guests.map((g) => g.booked_by),
    ]);

    const recipients: Array<{ profileId: string; audience: "booking" | "waitlist"; creditRestored: boolean }> = [
      ...result.bookings.map((b) => ({
        profileId: b.profile_id,
        audience: "booking" as const,
        creditRestored: b.credits_refunded,
      })),
      ...result.waitlist.map((w) => ({
        profileId: w.profile_id,
        audience: "waitlist" as const,
        creditRestored: false,
      })),
    ];

    for (const r of recipients) {
      const p = profiles.get(r.profileId);
      if (p?.email) {
        await sendEmail({
          to: p.email,
          toName: p.first_name ?? undefined,
          // COPY: confirm met Marlon
          subject: `${name} geannuleerd: ${when}`,
          react: SessionCancelledByAdmin({
            firstName: p.first_name ?? "",
            className: name,
            whenLabel: when,
            reason,
            creditRestored: r.creditRestored,
            siteUrl: siteUrl(),
            audience: r.audience,
          }),
        });
      }
      await sendPushToProfile(r.profileId, {
        // COPY: confirm met Marlon
        title: `${name} gaat niet door`,
        // COPY: confirm met Marlon
        body: `${when}. Reden: ${reason}`,
        data: { type: "session_cancelled", sessionId: result.session_id },
      });
    }

    for (const g of result.guests) {
      await sendEmail({
        to: g.guest_email,
        toName: g.guest_name,
        // COPY: confirm met Marlon
        subject: `${name} geannuleerd: ${when}`,
        react: GuestSessionCancelled({
          recipient: "guest",
          firstName: g.guest_name,
          guestName: g.guest_name,
          className: name,
          whenLabel: when,
          reason,
          siteUrl: siteUrl(),
        }),
      });
      const host = profiles.get(g.booked_by);
      if (host?.email) {
        await sendEmail({
          to: host.email,
          toName: host.first_name ?? undefined,
          // COPY: confirm met Marlon
          subject: `${name} geannuleerd, ook voor je gast`,
          react: GuestSessionCancelled({
            recipient: "host",
            firstName: host.first_name ?? "",
            guestName: g.guest_name,
            className: name,
            whenLabel: when,
            reason,
            siteUrl: siteUrl(),
          }),
        });
      }
    }
  } catch (err) {
    console.error("[notifySessionCancelled] overgeslagen", err);
  }
}

export interface RescheduledSessionResult {
  session_id: string;
  old_start_at: string;
  old_end_at: string;
  new_start_at: string;
  new_end_at: string;
  bookings: Array<{ booking_id: string; profile_id: string }>;
}

/** Mail en push naar geboekte leden met oude en nieuwe tijd. */
export async function notifySessionRescheduled(
  result: RescheduledSessionResult,
): Promise<void> {
  try {
    if (result.bookings.length === 0) return;
    const name = await className(result.session_id);
    const oldWhen = whenLabel(result.old_start_at, result.old_end_at);
    const newWhen = whenLabel(result.new_start_at, result.new_end_at);
    const profiles = await profilesById(result.bookings.map((b) => b.profile_id));

    for (const b of result.bookings) {
      const p = profiles.get(b.profile_id);
      if (p?.email) {
        await sendEmail({
          to: p.email,
          toName: p.first_name ?? undefined,
          // COPY: confirm met Marlon
          subject: `Nieuwe tijd voor ${name}: ${newWhen}`,
          react: SessionRescheduled({
            firstName: p.first_name ?? "",
            className: name,
            oldWhenLabel: oldWhen,
            newWhenLabel: newWhen,
            siteUrl: siteUrl(),
          }),
        });
      }
      await sendPushToProfile(b.profile_id, {
        // COPY: confirm met Marlon
        title: `Nieuwe tijd voor ${name}`,
        // COPY: confirm met Marlon
        body: `Nu ${newWhen} (was ${formatTimeRange(new Date(result.old_start_at), new Date(result.old_end_at))}). Kosteloos annuleren kan tot de start.`,
        data: { type: "session_rescheduled", sessionId: result.session_id },
      });
    }
  } catch (err) {
    console.error("[notifySessionRescheduled] overgeslagen", err);
  }
}
