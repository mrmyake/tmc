import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PR4 — Event foundation.
 *
 * Append-only domein-events. emitEvent() schrijft via de service-role-client
 * (op het tmc-schema geconfigureerd) omdat `tmc.events` geen insert-policy
 * heeft. De helper throwt NOOIT: een gefaalde emit mag de business-logica niet
 * breken, dus bij falen alleen console.error naar de Vercel-logs.
 *
 * Aanroep synchroon en awaited in dezelfde request, direct na de geslaagde
 * mutation. Er zijn geen DB-transacties in de mutations, dus dit is het meest
 * haalbare durability-niveau; de bron van waarheid blijft de mutatie-tabel zelf.
 */

export type EventType =
  // Bookings
  | "booking.created"
  | "booking.cancelled"
  | "booking.waitlisted"
  | "waitlist.promoted"
  // Attendance / check-in
  | "checkin.recorded"
  | "checkin.reverted"
  | "attendance.no_show_marked"
  // Credits
  | "credits.adjusted"
  // Order pipeline (subscription and product orders, WS-2)
  | "order.created"
  | "order.activated"
  | "order.cancelled"
  // Membership lifecycle
  | "membership.signup_started"
  | "membership.activated"
  | "membership.payment_failed"
  | "membership.reactivated"
  | "membership.pause_requested"
  | "membership.pause_granted"
  | "membership.pause_rejected"
  // Lifecycle-primitieven (RPC-side inserts; hier voor het volledige domein)
  | "membership.pause_planned"
  | "membership.paused"
  | "membership.resumed"
  | "membership.resume_blocked"
  | "membership.change_requested"
  | "membership.change_cancelled"
  | "membership.changed"
  | "member.email_changed"
  | "membership.cancellation_requested"
  | "membership.cancelled"
  // Payments
  | "payment.received"
  | "payment.failed"
  // PT
  | "pt_booking.created"
  | "pt_booking.confirmed"
  | "pt_booking.cancelled"
  | "pt_booking.rescheduled"
  | "pt_booking.attendance_marked"
  | "pt_intake.created"
  // Guest
  | "guest.booked"
  // Sessions (admin)
  | "session.created"
  | "session.updated"
  | "session.cancelled"
  // Recurring series (admin, schedule_templates)
  | "series.created"
  | "series.updated"
  | "series.cancelled"
  // Member lifecycle
  | "member.created"
  | "member.deleted"
  // Trainer
  | "trainer_hours.submitted"
  // Auth (OTP-login, zie src/lib/actions/auth.ts)
  | "auth.otp_failed"
  // Community & growth (spec-community-growth.md)
  | "member.dropoff_flagged"
  | "trial_booking.created"
  | "trial_booking.paid"
  | "trial_booking.cancelled"
  | "member.milestone_reached";

export type ActorType =
  | "member"
  | "admin"
  | "trainer"
  | "system"
  | "tablet"
  | "visitor";

export type SubjectType =
  | "profile"
  | "order"
  | "membership"
  | "session"
  | "schedule_template"
  | "booking"
  | "payment"
  | "pt_booking"
  | "pt_session"
  | "pause"
  | "waitlist"
  | "guest_booking"
  | "trainer_hours"
  | "check_in"
  | "trial_booking";

export interface EmitEventInput {
  type: EventType;
  actorType: ActorType;
  /** profiles.id van de actor, of null voor system/cron/tablet. */
  actorId?: string | null;
  subjectType?: SubjectType | null;
  subjectId?: string | null;
  /** Minimale payload: id's, enums, timestamps. Geen PII. */
  payload?: Record<string, unknown>;
}

export async function emitEvent(input: EmitEventInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("events").insert({
      type: input.type,
      actor_type: input.actorType,
      actor_id: input.actorId ?? null,
      subject_type: input.subjectType ?? null,
      subject_id: input.subjectId ?? null,
      payload: input.payload ?? {},
    });
    if (error) {
      console.error(`[emitEvent] insert failed type=${input.type}`, error);
    }
  } catch (err) {
    console.error(`[emitEvent] threw type=${input.type}`, err);
  }
}
