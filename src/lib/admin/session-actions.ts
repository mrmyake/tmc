"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { sendEmail } from "@/lib/email";
import SessionCancelledByAdmin from "@/emails/session_cancelled_by_admin";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

export type AdminActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

function revalidateAll() {
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/rooster");
  revalidatePath("/app/rooster");
  revalidatePath("/app");
  revalidatePath("/rooster");
}

// ----------------------------------------------------------------------------
// Update a session — trainer / capacity / notes
// ----------------------------------------------------------------------------

interface UpdateSessionInput {
  id: string;
  trainerId?: string;
  /** NULL betekent onbeperkt (alleen kettlebell); undefined betekent niet wijzigen. */
  capacity?: number | null;
  notes?: string | null;
  blocksFreeTraining?: boolean;
}

export async function adminUpdateSession(
  input: UpdateSessionInput,
): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("class_sessions")
    .select("id, status, capacity")
    .eq("id", input.id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { ok: false, message: "Sessie niet gevonden." };
  }
  if (existing.status === "cancelled") {
    return { ok: false, message: "Deze sessie is al geannuleerd." };
  }

  const patch: Record<string, unknown> = {};

  if (input.trainerId !== undefined) {
    const { data: trainer } = await admin
      .from("trainers")
      .select("id, is_active")
      .eq("id", input.trainerId)
      .maybeSingle();
    if (!trainer) return { ok: false, message: "Trainer niet gevonden." };
    if (!trainer.is_active) {
      return { ok: false, message: "Trainer is niet actief." };
    }
    patch.trainer_id = input.trainerId;
  }

  if (input.capacity !== undefined) {
    if (input.capacity !== null) {
      if (!Number.isInteger(input.capacity) || input.capacity < 1) {
        // COPY: confirm met Marlon
        return {
          ok: false,
          message: "Capaciteit moet minstens 1 zijn, of leeg voor onbeperkt.",
        };
      }
      const { count } = await admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("session_id", input.id)
        .eq("status", "booked");
      const booked = count ?? 0;
      if (input.capacity < booked) {
        return {
          ok: false,
          message: `Er staan al ${booked} boekingen. Capaciteit moet minstens ${booked} zijn.`,
        };
      }
    }
    patch.capacity = input.capacity;
  }

  if (input.notes !== undefined) {
    patch.notes = input.notes?.trim() || null;
  }

  if (input.blocksFreeTraining !== undefined) {
    patch.blocks_free_training = input.blocksFreeTraining;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, message: "Geen wijzigingen." };
  }

  const { error } = await admin
    .from("class_sessions")
    .update(patch)
    .eq("id", input.id);

  if (error) {
    console.error("[adminUpdateSession] update failed", error);
    return { ok: false, message: "Bijwerken lukte niet. Probeer het opnieuw." };
  }

  await emitEvent({
    type: "session.updated",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "session",
    subjectId: input.id,
    payload: {
      session_id: input.id,
      changed: Object.keys(patch),
      trainer_id: patch.trainer_id ?? null,
      capacity: patch.capacity ?? null,
      blocks_free_training: patch.blocks_free_training ?? null,
    },
  });

  revalidateAll();
  return { ok: true, message: "Sessie bijgewerkt." };
}

// ----------------------------------------------------------------------------
// Cancel a session — cascade cancel bookings + refund credits
// ----------------------------------------------------------------------------

interface CancelSessionInput {
  id: string;
  reason: string;
}

export async function adminCancelSession(
  input: CancelSessionInput,
): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const reason = input.reason?.trim();
  if (!reason) return { ok: false, message: "Geef een reden op." };

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("class_sessions")
    .select("id, status, start_at")
    .eq("id", input.id)
    .maybeSingle();
  if (!session) return { ok: false, message: "Sessie niet gevonden." };
  if (session.status === "cancelled") {
    return { ok: false, message: "Sessie is al geannuleerd." };
  }

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, profile_id, membership_id, credits_used")
    .eq("session_id", input.id)
    .eq("status", "booked");

  const affected = bookings ?? [];

  // Refund credits for any bookings that used them, per boeking via de
  // RPC-laag: lockt membership plus boeking, zet credits_used atomair op
  // 0 (een retry van deze actie geeft already_refunded en refundt dus
  // nooit dubbel) en schrijft het credits.adjusted-event mee. Eén
  // mislukte refund blokkeert de annulering van de sessie niet.
  for (const b of affected) {
    if (!b.membership_id || !b.credits_used || b.credits_used <= 0) continue;
    const { data: result, error } = await admin.rpc(
      "adjust_membership_credits",
      {
        p_membership_id: b.membership_id,
        p_delta: b.credits_used,
        p_reason: `Sessie geannuleerd: ${reason}`,
        p_source: "session_cancelled",
        p_actor_type: "admin",
        p_actor_id: auth.userId,
        p_booking_id: b.id,
      },
    );
    if (error || !(result as { ok?: boolean } | null)?.ok) {
      console.error(
        "[adminCancelSession] credit-refund faalde",
        b.id,
        error ?? result,
      );
    }
  }

  const nowIso = new Date().toISOString();

  if (affected.length > 0) {
    const { error: bErr } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        cancellation_reason: "session_cancelled",
      })
      .eq("session_id", input.id)
      .eq("status", "booked");
    if (bErr) {
      console.error("[adminCancelSession] bookings update failed", bErr);
    }
  }

  const { error: sErr } = await admin
    .from("class_sessions")
    .update({
      status: "cancelled",
      cancellation_reason: reason,
    })
    .eq("id", input.id);

  if (sErr) {
    console.error("[adminCancelSession] session update failed", sErr);
    return { ok: false, message: "Annuleren lukte niet." };
  }

  await emitEvent({
    type: "session.cancelled",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "session",
    subjectId: input.id,
    payload: {
      session_id: input.id,
      reason,
      affected_booking_count: affected.length,
    },
  });
  for (const b of affected) {
    await emitEvent({
      type: "booking.cancelled",
      actorType: "admin",
      actorId: auth.userId,
      subjectType: "booking",
      subjectId: b.id,
      payload: {
        profile_id: b.profile_id,
        session_id: input.id,
        reason: "session_cancelled",
        credits_refunded:
          Boolean(b.membership_id) && (b.credits_used ?? 0) > 0,
      },
    });
  }

  await sendNotification(
    "Sessie geannuleerd",
    `${affected.length} boeking(en) geannuleerd — reden: ${reason}`,
    "warning",
  );

  // Fire-and-forget member mails. Errors only get logged.
  if (affected.length > 0) {
    void notifyAffectedMembers({
      sessionId: input.id,
      bookings: affected,
      reason,
    });
  }

  revalidateAll();

  return {
    ok: true,
    message:
      affected.length === 0
        ? "Sessie geannuleerd."
        : `Sessie geannuleerd. ${affected.length} boeking(en) teruggezet en credits hersteld.`,
  };
}

// ----------------------------------------------------------------------------
// Create an ad-hoc session
// ----------------------------------------------------------------------------

interface CreateSessionInput {
  classTypeId: string;
  trainerId: string;
  startAt: string; // ISO
  endAt: string; // ISO
  /** NULL betekent onbeperkt (alleen kettlebell). */
  capacity: number | null;
  notes?: string;
  blocksFreeTraining?: boolean;
}

export async function adminCreateSession(
  input: CreateSessionInput,
): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!input.classTypeId || !input.trainerId || !input.startAt || !input.endAt) {
    return { ok: false, message: "Vul alle velden in." };
  }
  if (
    input.capacity !== null &&
    (!Number.isInteger(input.capacity) || input.capacity < 1)
  ) {
    // COPY: confirm met Marlon
    return {
      ok: false,
      message: "Capaciteit moet minstens 1 zijn, of leeg voor onbeperkt.",
    };
  }

  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: "Ongeldige datum." };
  }
  if (end <= start) {
    return { ok: false, message: "Einde moet na start liggen." };
  }

  const admin = createAdminClient();

  const [classTypeRes, trainerRes] = await Promise.all([
    admin
      .from("class_types")
      .select("id, pillar, age_category, is_active")
      .eq("id", input.classTypeId)
      .maybeSingle(),
    admin
      .from("trainers")
      .select("id, is_active")
      .eq("id", input.trainerId)
      .maybeSingle(),
  ]);

  const classType = classTypeRes.data;
  if (!classType) return { ok: false, message: "Lestype niet gevonden." };
  if (!classType.is_active) {
    return { ok: false, message: "Lestype is niet actief." };
  }
  const trainer = trainerRes.data;
  if (!trainer) return { ok: false, message: "Trainer niet gevonden." };
  if (!trainer.is_active) {
    return { ok: false, message: "Trainer is niet actief." };
  }

  const { data, error } = await admin
    .from("class_sessions")
    .insert({
      class_type_id: input.classTypeId,
      trainer_id: input.trainerId,
      pillar: classType.pillar,
      age_category: classType.age_category,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      capacity: input.capacity,
      status: "scheduled",
      notes: input.notes?.trim() || null,
      template_id: null,
      blocks_free_training: input.blocksFreeTraining ?? false,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[adminCreateSession] insert failed", error);
    return { ok: false, message: "Aanmaken lukte niet." };
  }

  await emitEvent({
    type: "session.created",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "session",
    subjectId: data.id,
    payload: {
      session_id: data.id,
      class_type_id: input.classTypeId,
      trainer_id: input.trainerId,
      pillar: classType.pillar,
      start_at: start.toISOString(),
      capacity: input.capacity,
    },
  });

  revalidateAll();

  return { ok: true, message: "Sessie aangemaakt.", id: data.id };
}

// ----------------------------------------------------------------------------
// Notify affected members when a session is cancelled by admin
// ----------------------------------------------------------------------------

interface AffectedBooking {
  id: string;
  profile_id: string;
  membership_id: string | null;
  credits_used: number;
}

async function notifyAffectedMembers(args: {
  sessionId: string;
  bookings: AffectedBooking[];
  reason: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: sessionRow } = await admin
      .from("class_sessions")
      .select(
        `start_at, end_at,
         class_type:class_types(name)`,
      )
      .eq("id", args.sessionId)
      .maybeSingle();
    if (!sessionRow) return;

    const ct = (Array.isArray(sessionRow.class_type)
      ? sessionRow.class_type[0]
      : sessionRow.class_type) as { name: string | null } | null;

    const start = new Date(sessionRow.start_at);
    const end = new Date(sessionRow.end_at);
    const whenLabel = `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`;

    const profileIds = args.bookings.map((b) => b.profile_id);
    if (profileIds.length === 0) return;

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, first_name")
      .in("id", profileIds);

    const profileById = new Map(
      (profiles ?? []).map((p) => [p.id, p]),
    );

    for (const b of args.bookings) {
      const profile = profileById.get(b.profile_id);
      if (!profile?.email) continue;
      const creditRestored =
        Boolean(b.membership_id) && (b.credits_used ?? 0) > 0;
      await sendEmail({
        to: profile.email,
        toName: profile.first_name ?? undefined,
        subject: `${ct?.name ?? "Sessie"} geannuleerd: ${whenLabel}`,
        react: SessionCancelledByAdmin({
          firstName: profile.first_name ?? "",
          className: ct?.name ?? "Sessie",
          whenLabel,
          reason: args.reason,
          creditRestored,
          siteUrl: siteUrl(),
        }),
      });
    }
  } catch (err) {
    console.error("[notifyAffectedMembers] skipped", err);
  }
}
