"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { createPaymentRequest } from "@/lib/admin/payment-request-actions";
import BookingConfirmation from "@/emails/booking_confirmation";

/**
 * PT-agenda C1: de boek-backend voor Marlon-boekt-alles. Dit zijn de
 * server actions waar het Boek-voor-klant-scherm (PR C2) op landt; hier
 * zit bewust nog geen UI.
 *
 * Betaling losse sessie: 'credits' (debit via de geauditeerde kern in de
 * RPC), 'already_paid' (kas of pin) of 'payment_link' (order plus
 * Mollie-betaallink via de bestaande pipeline, order gekoppeld aan de
 * pt_session zodat activate_order er geen credit-membership van maakt).
 * Programma: prepaid via betaallink op de bestaande catalogus-rijen
 * program_studio_12w / program_online_12w, of reeds-betaald-override.
 */

// COPY: confirm met Marlon (alle onderstaande meldingen)
const PT_REASON_COPY: Record<string, string> = {
  pt_overlap: "Dit moment overlapt met een bestaande afspraak.",
  pt_no_turnaround: "Te weinig omkleedtijd tot de aangrenzende afspraak.",
  pt_slot_conflicts:
    "Een of meer momenten botsen met bestaande afspraken. Verschuif de startmomenten.",
  slot_unavailable: "Dit moment is niet beschikbaar.",
  session_in_past: "Dit moment is al voorbij.",
  profile_not_found: "Dit profiel bestaat niet.",
  trainer_unavailable: "Deze trainer is niet actief.",
  format_not_supported: "Dit format wordt niet ondersteund.",
  invalid_payment_mode: "Ongeldige betaalwijze.",
  invalid_repeat: "Het aantal herhalingen moet tussen 1 en 26 liggen.",
  invalid_duration: "De duur moet tussen 1 minuut en 8 uur liggen.",
  payment_link_single_only:
    "Een betaallink kan alleen voor een losse sessie. Boek een reeks met credits of als reeds betaald.",
  no_credits: "Geen passend PT-tegoed met voldoende credits gevonden.",
  invalid_program_type: "Ongeldig programmatype.",
  second_slot_required:
    "Een studio-programma heeft twee wekelijkse momenten nodig.",
  intake_required: "Een online programma heeft een moment voor de beginmeting nodig.",
};

export interface BookPtForMemberInput {
  profileId: string;
  trainerId: string;
  /** ISO-timestamp van de (eerste) sessie. */
  startAt: string;
  format?: "one_on_one" | "duo";
  paymentMode: "credits" | "payment_link" | "already_paid";
  /** Vrije duur in minuten; default de sessieduur uit pt_settings (60). */
  durationMin?: number;
  /** Duo: naam van de introducee op dezelfde boeking. */
  introduceeName?: string;
  /** Override: sla alleen de overlap-check over. */
  allowOverlap?: boolean;
  /** Override: sla alleen de omkleedtijd-check over. */
  allowNoTurnaround?: boolean;
  /** Wekelijkse reeks: totaal aantal sessies, zelfde tijd en duur. */
  repeatWeeks?: number;
}

interface RpcBookingRow {
  booking_id: string;
  pt_session_id: string;
  start_at: string;
  end_at: string;
}

export type BookPtForMemberResult =
  | {
      ok: true;
      bookings: Array<{ bookingId: string; ptSessionId: string; startAt: string; endAt: string }>;
      paymentMode: string;
      /** Alleen bij payment_link: de betaallink voor de klant. */
      payUrl: string | null;
      /** Waarschuwing wanneer de boeking staat maar de link/mail faalde. */
      warning: string | null;
    }
  | { ok: false; message: string; conflictAt?: string };

async function sendCustomerConfirmation(args: {
  profileId: string;
  trainerId: string;
  className: string;
  whenLabel: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: profile }, { data: trainer }] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name, email")
        .eq("id", args.profileId)
        .maybeSingle(),
      admin
        .from("trainers")
        .select("display_name")
        .eq("id", args.trainerId)
        .maybeSingle(),
    ]);
    if (!profile?.email) return;
    await sendEmail({
      to: profile.email,
      toName: profile.first_name ?? undefined,
      subject: `Je sessie staat: ${args.className}`, // COPY: confirm met Marlon
      react: BookingConfirmation({
        firstName: profile.first_name ?? "",
        className: args.className,
        trainerName: trainer?.display_name ?? "je coach",
        whenLabel: args.whenLabel,
        siteUrl: siteUrl(),
      }),
    });
  } catch (err) {
    console.error("[sendCustomerConfirmation] skipped", err);
  }
}

export async function bookPtForMember(
  input: BookPtForMemberInput,
): Promise<BookPtForMemberResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const supabase = await createClient();
  const { data: result, error: rpcError } = await supabase.rpc(
    "admin_book_pt_for_member",
    {
      p_profile_id: input.profileId,
      p_trainer_id: input.trainerId,
      p_start_at: input.startAt,
      p_format: input.format ?? "one_on_one",
      p_payment_mode: input.paymentMode,
      p_duration_min: input.durationMin ?? null,
      p_introducee_name: input.introduceeName ?? null,
      p_allow_overlap: input.allowOverlap ?? false,
      p_allow_no_turnaround: input.allowNoTurnaround ?? false,
      p_repeat_weeks: input.repeatWeeks ?? 1,
    },
  );
  if (rpcError) {
    console.error("[bookPtForMember] rpc", rpcError);
    return { ok: false, message: "Boeken lukte niet. Probeer opnieuw." };
  }
  if (!result?.ok) {
    return {
      ok: false,
      message: PT_REASON_COPY[result?.reason] ?? "Boeken lukte niet.",
      conflictAt: result?.conflict_at ?? undefined,
    };
  }

  const bookings = (result.bookings as RpcBookingRow[]).map((b) => ({
    bookingId: b.booking_id,
    ptSessionId: b.pt_session_id,
    startAt: b.start_at,
    endAt: b.end_at,
  }));

  for (const b of bookings) {
    await emitEvent({
      type: "pt_booking.created",
      actorType: "admin",
      actorId: gate.userId,
      subjectType: "pt_booking",
      subjectId: b.bookingId,
      payload: {
        profile_id: input.profileId,
        pt_session_id: b.ptSessionId,
        funded: input.paymentMode,
        price_paid_cents: result.price_cents_per_session ?? 0,
        repeat_weeks: input.repeatWeeks ?? 1,
      },
    });
  }

  // Betaallink: order gekoppeld aan de pt_session, mail via de bestaande
  // payment-request-flow. De boeking staat al; een falende link is een
  // waarschuwing, geen rollback (Marlon kan opnieuw een verzoek sturen).
  let payUrl: string | null = null;
  let warning: string | null = null;
  if (input.paymentMode === "payment_link") {
    const link = await createPaymentRequest({
      profileId: input.profileId,
      slug: (input.format ?? "one_on_one") === "duo" ? "duo_single" : "pt_single",
      ptSessionId: bookings[0].ptSessionId,
    });
    if (link.ok) {
      payUrl = link.payUrl;
      if (!link.emailSent) {
        warning = "De boeking staat, maar de klant heeft geen e-mailadres; deel de betaallink handmatig."; // COPY: confirm met Marlon
      }
    } else {
      warning = `De boeking staat, maar de betaallink kon niet gemaakt worden: ${link.error}`; // COPY: confirm met Marlon
    }
  }

  const first = new Date(bookings[0].startAt);
  const firstEnd = new Date(bookings[0].endAt);
  const className =
    (input.format ?? "one_on_one") === "duo"
      ? "Personal training duo"
      : "Personal training";
  const repeat = input.repeatWeeks ?? 1;
  const whenLabel =
    `${formatWeekdayDate(first)} · ${formatTimeRange(first, firstEnd)}` +
    (repeat > 1 ? ` · wekelijks, ${repeat} sessies` : ""); // COPY: confirm met Marlon
  await sendCustomerConfirmation({
    profileId: input.profileId,
    trainerId: input.trainerId,
    className,
    whenLabel,
  });

  return { ok: true, bookings, paymentMode: input.paymentMode, payUrl, warning };
}

export interface PlanPtProgramInput {
  profileId: string;
  trainerId: string;
  type: "studio" | "online";
  /** ISO-timestamp van het eerste wekelijkse moment. */
  startAt: string;
  /** Studio: het tweede wekelijkse moment (2x per week). */
  secondStartAt?: string;
  /** Online: het moment van de fysieke beginmeting (60 min, studio). */
  intakeStartAt?: string;
  paymentMode: "payment_link" | "already_paid";
}

export type PlanPtProgramResult =
  | {
      ok: true;
      programId: string;
      totalSessions: number;
      payUrl: string | null;
      warning: string | null;
    }
  | {
      ok: false;
      message: string;
      conflicts?: Array<{ start_at: string; reason: string }>;
    };

export async function planPtProgram(
  input: PlanPtProgramInput,
): Promise<PlanPtProgramResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const supabase = await createClient();
  const { data: result, error: rpcError } = await supabase.rpc(
    "admin_plan_pt_program",
    {
      p_profile_id: input.profileId,
      p_trainer_id: input.trainerId,
      p_type: input.type,
      p_start_at: input.startAt,
      p_second_start_at: input.secondStartAt ?? null,
      p_intake_start_at: input.intakeStartAt ?? null,
      p_payment_mode: input.paymentMode,
    },
  );
  if (rpcError) {
    console.error("[planPtProgram] rpc", rpcError);
    return { ok: false, message: "Inplannen lukte niet. Probeer opnieuw." };
  }
  if (!result?.ok) {
    return {
      ok: false,
      message: PT_REASON_COPY[result?.reason] ?? "Inplannen lukte niet.",
      conflicts: result?.conflicts ?? undefined,
    };
  }

  const programId = result.program_id as string;
  const sessions = result.sessions as Array<{
    booking_id: string;
    pt_session_id: string;
    start_at: string;
    duration_min: number;
    mode: string;
  }>;

  for (const s of sessions) {
    await emitEvent({
      type: "pt_booking.created",
      actorType: "admin",
      actorId: gate.userId,
      subjectType: "pt_booking",
      subjectId: s.booking_id,
      payload: {
        profile_id: input.profileId,
        pt_session_id: s.pt_session_id,
        program_id: programId,
        mode: s.mode,
        funded: input.paymentMode === "already_paid" ? "program_paid" : "program_link",
      },
    });
  }

  // Prepaid via de bestaande order-pipeline: order op de programma-slug,
  // order-id als payment_ref op het programma, mail via payment-request.
  let payUrl: string | null = null;
  let warning: string | null = null;
  if (input.paymentMode === "payment_link") {
    const link = await createPaymentRequest({
      profileId: input.profileId,
      slug: result.catalogue_slug as string,
    });
    if (link.ok) {
      payUrl = link.payUrl;
      const admin = createAdminClient();
      const { error: refErr } = await admin
        .from("pt_programs")
        .update({ payment_ref: link.orderId })
        .eq("id", programId)
        .is("payment_ref", null);
      if (refErr) {
        console.error("[planPtProgram] payment_ref update", refErr);
      }
      if (!link.emailSent) {
        warning = "Het programma staat, maar de klant heeft geen e-mailadres; deel de betaallink handmatig."; // COPY: confirm met Marlon
      }
    } else {
      warning = `Het programma staat, maar de betaallink kon niet gemaakt worden: ${link.error}`; // COPY: confirm met Marlon
    }
  }

  const firstSession = sessions.reduce((min, s) =>
    new Date(s.start_at) < new Date(min.start_at) ? s : min,
  );
  const first = new Date(firstSession.start_at);
  const className =
    input.type === "studio"
      ? "12-weken programma (studio)"
      : "12-weken programma (online)";
  // COPY: confirm met Marlon
  const whenLabel = `start ${formatWeekdayDate(first)} · ${result.total_sessions} sessies`;
  await sendCustomerConfirmation({
    profileId: input.profileId,
    trainerId: input.trainerId,
    className,
    whenLabel,
  });

  return {
    ok: true,
    programId,
    totalSessions: result.total_sessions as number,
    payUrl,
    warning,
  };
}
