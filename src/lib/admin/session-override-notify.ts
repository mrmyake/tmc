import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sendPushToProfile } from "@/lib/push";
import SessionCancelledByAdmin from "@/emails/session_cancelled_by_admin";
import SessionRescheduled from "@/emails/session_rescheduled";
import GuestSessionCancelled from "@/emails/guest_session_cancelled";
import VisitorSessionRescheduled from "@/emails/visitor_session_rescheduled";
import { siteUrl as publicSiteUrl } from "@/lib/site-url";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { bookingTimes } from "@/lib/member/booking-times";

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

    // Vrij trainen: elk lid heeft een eigen slot binnen de dagsessie; dat
    // slot is de tijd in de melding (spec-vrij-trainen-slots.md).
    const slotByBooking = new Map<string, { slot_start_at: string | null; slot_end_at: string | null }>();
    if (result.bookings.length > 0) {
      const { data: slotRows } = await createAdminClient()
        .from("bookings")
        .select("id, slot_start_at, slot_end_at")
        .in("id", result.bookings.map((b) => b.booking_id));
      for (const row of slotRows ?? []) slotByBooking.set(row.id, row);
    }
    const sessionTimes = { start_at: result.start_at, end_at: result.end_at };

    const recipients: Array<{ profileId: string; audience: "booking" | "waitlist"; creditRestored: boolean; when: string }> = [
      ...result.bookings.map((b) => {
        const t = bookingTimes(slotByBooking.get(b.booking_id) ?? {}, sessionTimes);
        return {
          profileId: b.profile_id,
          audience: "booking" as const,
          creditRestored: b.credits_refunded,
          when: whenLabel(t.startAt, t.endAt),
        };
      }),
      ...result.waitlist.map((w) => ({
        profileId: w.profile_id,
        audience: "waitlist" as const,
        creditRestored: false,
        when,
      })),
    ];

    for (const r of recipients) {
      const p = profiles.get(r.profileId);
      if (p?.email) {
        await sendEmail({
          to: p.email,
          toName: p.first_name ?? undefined,
          // COPY: confirm met Marlon
          subject: `${name} geannuleerd: ${r.when}`,
          react: SessionCancelledByAdmin({
            firstName: p.first_name ?? "",
            className: name,
            whenLabel: r.when,
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
        body: `${r.when}. Reden: ${reason}`,
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

/**
 * Antwoordadres voor bezoekersmails: een inbox die Marlon leest. De
 * standaardafzender (MAILERSEND_FROM_EMAIL) is een no-reply-adres.
 */
const VISITOR_REPLY_TO = { email: "marlon@themovementclub.nl", name: "The Movement Club" };

/**
 * Mail en push naar geboekte leden met oude en nieuwe tijd, daarna een mail
 * (geen push, geen account) naar betaalde proefles-bezoekers en gasten.
 */
export async function notifySessionRescheduled(
  result: RescheduledSessionResult,
): Promise<void> {
  try {
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

    await notifyVisitorsRescheduled({
      sessionId: result.session_id,
      className: name,
      oldWhen,
      newWhen,
    });
  } catch (err) {
    console.error("[notifySessionRescheduled] overgeslagen", err);
  }
}

/**
 * Proefles-bezoekers (status 'paid', dus betaald of gratis via code; is_test
 * bewust niet uitgesloten) en gasten (status 'booked') van de verschoven
 * les. Opgehaald direct na de geslaagde RPC; wie daarna nog boekt, ziet de
 * nieuwe tijd al. Pending proeflessen horen bij een lopende betaling en
 * krijgen geen mail.
 */
async function notifyVisitorsRescheduled(args: {
  sessionId: string;
  className: string;
  oldWhen: string;
  newWhen: string;
}): Promise<void> {
  const admin = createAdminClient();
  const [trialsRes, guestsRes] = await Promise.all([
    admin
      .from("trial_bookings")
      .select("id, name, email, cancel_token, price_paid_cents")
      .eq("session_id", args.sessionId)
      .eq("status", "paid"),
    admin
      .from("guest_bookings")
      .select("id, guest_name, guest_email, booked_by")
      .eq("session_id", args.sessionId)
      .eq("status", "booked"),
  ]);
  if (trialsRes.error) console.error("[notifyVisitorsRescheduled] trials", trialsRes.error);
  if (guestsRes.error) console.error("[notifyVisitorsRescheduled] guests", guestsRes.error);

  for (const t of trialsRes.data ?? []) {
    const firstName = (t.name ?? "").trim().split(" ")[0] ?? "";
    await sendEmail({
      to: t.email,
      toName: firstName || undefined,
      // COPY: confirm met Marlon
      subject: `Nieuwe tijd voor je proefles: ${args.newWhen}`,
      replyTo: VISITOR_REPLY_TO,
      react: VisitorSessionRescheduled({
        recipient: "trial",
        trialKind: (t.price_paid_cents ?? 0) > 0 ? "paid" : "code",
        firstName,
        className: args.className,
        oldWhenLabel: args.oldWhen,
        newWhenLabel: args.newWhen,
        cancelUrl: `${publicSiteUrl()}/proefles/annuleren/${t.cancel_token}`,
      }),
    });
  }

  const guests = guestsRes.data ?? [];
  const hosts = await profilesById(guests.map((g) => g.booked_by));
  for (const g of guests) {
    const guestFirstName = (g.guest_name ?? "").trim().split(" ")[0] ?? "";
    // Alleen de voornaam van het lid (besluit Ilja).
    // COPY: confirm met Marlon
    const hostFirstName = hosts.get(g.booked_by)?.first_name?.trim() || "het lid dat je uitnodigde";
    await sendEmail({
      to: g.guest_email,
      toName: guestFirstName || undefined,
      // COPY: confirm met Marlon
      subject: `Nieuwe tijd voor ${args.className}: ${args.newWhen}`,
      replyTo: VISITOR_REPLY_TO,
      react: VisitorSessionRescheduled({
        recipient: "guest",
        firstName: guestFirstName,
        hostFirstName,
        className: args.className,
        oldWhenLabel: args.oldWhen,
        newWhenLabel: args.newWhen,
      }),
    });
  }
}
