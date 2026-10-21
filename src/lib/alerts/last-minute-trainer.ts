import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { emitEvent } from "@/lib/events/emit";
import { siteUrl } from "@/lib/site-url";
import LastMinuteBooking from "@/emails/last_minute_booking";
import {
  runLastMinuteAlert,
  type LastMinuteDeps,
  type LastMinuteInput,
  type LastMinuteSource,
  type Recipient,
  type StampResult,
} from "./last-minute-core";

/**
 * Last-minute trainersmelding (spec-last-minute-alerts.md): de wrapper die de
 * pure kern (last-minute-core.ts) aan Supabase, MailerSend en tmc.events
 * koppelt. Aangeroepen na de commit van elke definitieve inschrijving op een
 * groepsles: lid (ook een bevestigde wachtlijstpromotie), proefles (betaald
 * via webhook of reconciliatie, code, openingsperiode) en gast. Throwt nooit
 * en blokkeert niets: een mislukte mail draait de inschrijving niet terug.
 */

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const STAMP_TABLE: Record<LastMinuteSource, "bookings" | "trial_bookings" | "guest_bookings"> = {
  member: "bookings",
  waitlist: "bookings",
  trial: "trial_bookings",
  guest: "guest_bookings",
};

function buildDeps(): LastMinuteDeps {
  const admin = createAdminClient();

  async function profileRecipient(profileId: string): Promise<Recipient | null> {
    const { data, error } = await admin
      .from("profiles")
      .select("email, first_name")
      .eq("id", profileId)
      .maybeSingle();
    if (error) {
      console.error("[last-minute-alert] profiel lezen mislukt", profileId, error);
      return null;
    }
    if (!data) return null;
    return { email: data.email ?? "", firstName: data.first_name ?? "" };
  }

  return {
    now: () => new Date(),
    env: {
      vercelEnv: process.env.VERCEL_ENV,
      redirectEmail: process.env.LAST_MINUTE_ALERT_REDIRECT_EMAIL,
      siteUrl: siteUrl(),
    },

    async loadSession(sessionId) {
      const { data, error } = await admin
        .from("class_sessions")
        .select(
          `id, pillar, status, start_at, end_at,
           class_type:class_types(name),
           trainer:trainers(profile_id, is_active, display_name)`,
        )
        .eq("id", sessionId)
        .maybeSingle();
      if (error) {
        console.error("[last-minute-alert] sessie lezen mislukt", sessionId, error);
        return null;
      }
      if (!data) return null;
      const ct = firstOf(data.class_type as { name: string | null } | { name: string | null }[] | null);
      const tr = firstOf(
        data.trainer as
          | { profile_id: string; is_active: boolean; display_name: string | null }
          | { profile_id: string; is_active: boolean; display_name: string | null }[]
          | null,
      );
      return {
        id: data.id,
        pillar: data.pillar,
        status: data.status,
        start_at: data.start_at,
        end_at: data.end_at,
        // COPY: confirm met Marlon
        className: ct?.name ?? "Sessie",
        trainer: tr
          ? { profileId: tr.profile_id, isActive: Boolean(tr.is_active), displayName: tr.display_name ?? "" }
          : null,
      };
    },

    async loadParticipant(source, participantId) {
      if (source === "trial") {
        const { data } = await admin
          .from("trial_bookings")
          .select("name, is_test")
          .eq("id", participantId)
          .maybeSingle();
        if (!data) return null;
        return { name: (data.name ?? "").trim() || "Proefles-bezoeker", isTest: data.is_test === true };
      }
      if (source === "guest") {
        const { data } = await admin
          .from("guest_bookings")
          .select("guest_name, booked_by")
          .eq("id", participantId)
          .maybeSingle();
        if (!data) return null;
        const { data: host } = await admin
          .from("profiles")
          .select("first_name, is_test")
          .eq("id", data.booked_by)
          .maybeSingle();
        return {
          name: (data.guest_name ?? "").trim() || "Gast",
          isTest: host?.is_test === true,
          hostFirstName: host?.first_name ?? null,
        };
      }
      const { data: booking } = await admin
        .from("bookings")
        .select("profile_id")
        .eq("id", participantId)
        .maybeSingle();
      if (!booking) return null;
      const { data: profile } = await admin
        .from("profiles")
        .select("first_name, last_name, is_test")
        .eq("id", booking.profile_id)
        .maybeSingle();
      if (!profile) return null;
      const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
      return { name: name || "Lid", isTest: profile.is_test === true };
    },

    async stampAlerted(source, participantId): Promise<StampResult> {
      // Stamp-first met de null-guard in de WHERE: nul geraakte rijen betekent
      // dat een andere aanroep (dubbele webhook, cron opnieuw) al gemeld heeft.
      const { data, error } = await admin
        .from(STAMP_TABLE[source])
        .update({ trainer_alerted_at: new Date().toISOString() })
        .eq("id", participantId)
        .is("trainer_alerted_at", null)
        .select("id");
      if (error) {
        console.error("[last-minute-alert] stempel mislukt", { source, participantId }, error);
        return "error";
      }
      return (data?.length ?? 0) > 0 ? "stamped" : "already";
    },

    async countParticipants(sessionId) {
      // Dezelfde drie bronnen als tmc.session_occupancy, maar alleen wat
      // definitief is: geen pending proeflessen en geen open promoties.
      const [members, trials, guests] = await Promise.all([
        admin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId)
          .eq("status", "booked"),
        admin
          .from("trial_bookings")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId)
          .in("status", ["paid", "attended"])
          .eq("is_test", false),
        admin
          .from("guest_bookings")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId)
          .in("status", ["booked", "attended"]),
      ]);
      for (const r of [members, trials, guests]) {
        if (r.error) console.error("[last-minute-alert] telling mislukt", sessionId, r.error);
      }
      return (members.count ?? 0) + (trials.count ?? 0) + (guests.count ?? 0);
    },

    loadProfileRecipient: profileRecipient,

    async loadHeadTrainerRecipient() {
      const { data } = await admin
        .from("trainers")
        .select("profile_id")
        .eq("employment_tier", "head_trainer")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!data?.profile_id) return null;
      return profileRecipient(data.profile_id);
    },

    async loadAdminRecipients() {
      const { data } = await admin
        .from("profiles")
        .select("email, first_name")
        .eq("role", "admin");
      return (data ?? []).map((p) => ({ email: p.email ?? "", firstName: p.first_name ?? "" }));
    },

    send: ({ to, toName, subject, props }) =>
      sendEmail({ to, toName, subject, react: LastMinuteBooking(props) }),

    emit: (event) => emitEvent(event),

    log: console,
  };
}

/**
 * Fire-and-forget vanuit server actions (`void notifyTrainerLastMinuteBooking(...)`),
 * awaited vanuit de webhook en de cron (daar wacht de bestaande code ook op
 * de bevestigingsmail). Beide veilig: de functie throwt nooit.
 */
export async function notifyTrainerLastMinuteBooking(input: LastMinuteInput): Promise<void> {
  try {
    const result = await runLastMinuteAlert(input, buildDeps());
    if (result.outcome !== "skipped") {
      console.info("[last-minute-alert]", {
        sessionId: input.sessionId,
        source: input.source,
        outcome: result.outcome,
        recipientKind: result.recipientKind,
        delivered: result.delivered,
        reason: result.reason ?? null,
      });
    }
  } catch (err) {
    console.error("[last-minute-alert] overgeslagen", input, err);
  }
}
