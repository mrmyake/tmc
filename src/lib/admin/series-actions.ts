"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import {
  materializeSessionsForTemplates,
  MATERIALIZATION_HORIZON_DAYS,
  type TemplateForMaterialization,
} from "@/lib/scheduling/materialize-sessions";

export type SeriesActionResult =
  | {
      ok: true;
      message: string;
      id?: string;
      materializedCount?: number;
      skippedWithBookings?: number;
    }
  | { ok: false; message: string };

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // COPY: confirm met Marlon
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    // COPY: confirm met Marlon
    return { ok: false, message: "Geen toegang." };
  }
  return { ok: true, userId: user.id };
}

function revalidateAll() {
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/rooster");
  revalidatePath("/app/rooster");
  revalidatePath("/app");
  revalidatePath("/rooster");
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

interface SeriesFieldsInput {
  classTypeId: string;
  trainerId: string;
  dayOfWeek: number;
  startTime: string; // "HH:mm"
  durationMinutes: number;
  capacity: number;
  validFrom?: string; // ISO date, default vandaag
  validUntil?: string | null; // ISO date, null = oneindig
  blocksFreeTraining?: boolean; // default false
}

interface ValidatedSeriesFields {
  classTypeId: string;
  trainerId: string;
  pillar: string;
  ageCategory: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  capacity: number;
  validFrom: string;
  validUntil: string | null;
  blocksFreeTraining: boolean;
}

async function validateSeriesFields(
  admin: ReturnType<typeof createAdminClient>,
  input: SeriesFieldsInput,
): Promise<{ ok: true; fields: ValidatedSeriesFields } | { ok: false; message: string }> {
  if (!input.classTypeId || !input.trainerId) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Vul alle velden in." };
  }
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Ongeldige weekdag." };
  }
  if (!isValidTime(input.startTime)) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Starttijd moet HH:mm zijn." };
  }
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Duur moet een positief getal zijn." };
  }
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Capaciteit moet minstens 1 zijn." };
  }

  const validFrom = input.validFrom?.trim() || new Date().toISOString().slice(0, 10);
  const validUntil = input.validUntil?.trim() || null;
  if (validUntil && validUntil < validFrom) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Einddatum moet na startdatum liggen." };
  }

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
    // COPY: confirm met Marlon
    return { ok: false, message: "Lestype is niet actief." };
  }
  const trainer = trainerRes.data;
  if (!trainer) return { ok: false, message: "Trainer niet gevonden." };
  if (!trainer.is_active) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Trainer is niet actief." };
  }

  return {
    ok: true,
    fields: {
      classTypeId: input.classTypeId,
      trainerId: input.trainerId,
      pillar: classType.pillar,
      ageCategory: classType.age_category,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      capacity: input.capacity,
      validFrom,
      validUntil,
      blocksFreeTraining: input.blocksFreeTraining ?? false,
    },
  };
}

async function fetchTemplateForMaterialization(
  admin: ReturnType<typeof createAdminClient>,
  templateId: string,
): Promise<TemplateForMaterialization | null> {
  const { data } = await admin
    .from("schedule_templates")
    .select(
      `
        id, class_type_id, trainer_id, day_of_week, start_time,
        duration_minutes, capacity, valid_from, valid_until,
        blocks_free_training,
        class_type:class_types(pillar, age_category)
      `,
    )
    .eq("id", templateId)
    .maybeSingle<TemplateForMaterialization>();
  return data ?? null;
}

/**
 * Vindt toekomstige, geplande sessies van een template en splitst ze in
 * "zonder actieve boekingen of wachtlijst" (veilig aan te passen/
 * annuleren) en "bezet" (nooit stilzwijgend wijzigen — blijft ongemoeid,
 * gerapporteerd aan de admin). Een actieve wachtlijst-entry telt ook als
 * bezet, ook zonder bevestigde boeking.
 */
async function splitFutureSessionsByBookings(
  admin: ReturnType<typeof createAdminClient>,
  templateId: string,
): Promise<{ emptyIds: string[]; skippedCount: number }> {
  const nowIso = new Date().toISOString();
  const { data: sessions } = await admin
    .from("class_sessions")
    .select("id")
    .eq("template_id", templateId)
    .eq("status", "scheduled")
    .gt("start_at", nowIso);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return { emptyIds: [], skippedCount: 0 };

  const [bookedRes, waitlistRes] = await Promise.all([
    admin
      .from("bookings")
      .select("session_id")
      .in("session_id", sessionIds)
      .eq("status", "booked"),
    // Actieve wachtlijst = nog niet bevestigd en niet verlopen (zelfde
    // definitie als de waitlist-promote cron); ook zonder boekingen telt
    // een sessie met actieve wachtlijst niet als "leeg".
    admin
      .from("waitlist_entries")
      .select("session_id")
      .in("session_id", sessionIds)
      .is("confirmed_at", null)
      .is("expired_at", null),
  ]);

  const occupiedIds = new Set([
    ...(bookedRes.data ?? []).map((b) => b.session_id),
    ...(waitlistRes.data ?? []).map((w) => w.session_id),
  ]);
  const emptyIds = sessionIds.filter((id) => !occupiedIds.has(id));

  return { emptyIds, skippedCount: occupiedIds.size };
}

// ----------------------------------------------------------------------------
// Serie aanmaken (schedule_templates) + direct materialiseren
// ----------------------------------------------------------------------------

export async function adminCreateSeries(
  input: SeriesFieldsInput,
): Promise<SeriesActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const validated = await validateSeriesFields(admin, input);
  if (!validated.ok) return validated;
  const f = validated.fields;

  const { data, error } = await admin
    .from("schedule_templates")
    .insert({
      class_type_id: f.classTypeId,
      trainer_id: f.trainerId,
      day_of_week: f.dayOfWeek,
      start_time: `${f.startTime}:00`,
      duration_minutes: f.durationMinutes,
      capacity: f.capacity,
      valid_from: f.validFrom,
      valid_until: f.validUntil,
      blocks_free_training: f.blocksFreeTraining,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[adminCreateSeries] insert failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Aanmaken van de serie lukte niet." };
  }

  const template = await fetchTemplateForMaterialization(admin, data.id);
  const { attempts, errors } = template
    ? await materializeSessionsForTemplates(admin, [template], {
        horizonDays: MATERIALIZATION_HORIZON_DAYS,
      })
    : { attempts: 0, errors: 0 };

  await emitEvent({
    type: "series.created",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "schedule_template",
    subjectId: data.id,
    payload: {
      template_id: data.id,
      class_type_id: f.classTypeId,
      trainer_id: f.trainerId,
      day_of_week: f.dayOfWeek,
      materialized: attempts,
    },
  });

  if (errors > 0) {
    console.error(
      `[adminCreateSeries] materialisatie had ${errors} fout(en) voor template ${data.id}`,
    );
  }

  revalidateAll();

  return {
    ok: true,
    // COPY: confirm met Marlon
    message: `Serie aangemaakt. ${attempts} sessie(s) ingepland voor de komende ${MATERIALIZATION_HORIZON_DAYS} dagen.`,
    id: data.id,
    materializedCount: attempts,
  };
}

// ----------------------------------------------------------------------------
// Serie bewerken — raakt alleen toekomstige sessies zonder boekingen
// ----------------------------------------------------------------------------

interface UpdateSeriesInput extends Partial<SeriesFieldsInput> {
  templateId: string;
}

export async function adminUpdateSeries(
  input: UpdateSeriesInput,
): Promise<SeriesActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("schedule_templates")
    .select(
      "id, class_type_id, trainer_id, day_of_week, start_time, duration_minutes, capacity, valid_from, valid_until, blocks_free_training, is_active",
    )
    .eq("id", input.templateId)
    .maybeSingle();

  if (!existing) return { ok: false, message: "Serie niet gevonden." };
  if (!existing.is_active) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Deze serie is niet actief." };
  }

  const merged: SeriesFieldsInput = {
    classTypeId: input.classTypeId ?? existing.class_type_id,
    trainerId: input.trainerId ?? existing.trainer_id,
    dayOfWeek: input.dayOfWeek ?? existing.day_of_week,
    startTime: input.startTime ?? existing.start_time.slice(0, 5),
    durationMinutes: input.durationMinutes ?? existing.duration_minutes,
    capacity: input.capacity ?? existing.capacity,
    validFrom: input.validFrom ?? existing.valid_from,
    validUntil:
      input.validUntil !== undefined ? input.validUntil : existing.valid_until,
    blocksFreeTraining:
      input.blocksFreeTraining ?? existing.blocks_free_training,
  };

  const validated = await validateSeriesFields(admin, merged);
  if (!validated.ok) return validated;
  const f = validated.fields;

  const { error: updateErr } = await admin
    .from("schedule_templates")
    .update({
      class_type_id: f.classTypeId,
      trainer_id: f.trainerId,
      day_of_week: f.dayOfWeek,
      start_time: `${f.startTime}:00`,
      duration_minutes: f.durationMinutes,
      capacity: f.capacity,
      valid_from: f.validFrom,
      valid_until: f.validUntil,
      blocks_free_training: f.blocksFreeTraining,
    })
    .eq("id", input.templateId);

  if (updateErr) {
    console.error("[adminUpdateSeries] update failed", updateErr);
    // COPY: confirm met Marlon
    return { ok: false, message: "Bijwerken van de serie lukte niet." };
  }

  // Dag/tijd ongewijzigd: bestaande boekingloze occurrences vallen op
  // dezelfde (template_id, start_at) als voorheen. Die direct patchen i.p.v.
  // annuleren + her-materialiseren — de materialisatie-upsert slaat een
  // reeds bestaande (ook geannuleerde) rij op die sleutel over
  // (ignoreDuplicates), dus annuleren zou de sessie stilzwijgend geannuleerd
  // laten staan in plaats van bijgewerkt.
  //
  // Dag of tijd wél gewijzigd: de oude occurrences vallen op de verkeerde
  // datum. Die annuleren en opnieuw materialiseren op de nieuwe dag/tijd —
  // dat botst niet, want de nieuwe start_at wijkt af van de oude.
  const timeChanged =
    f.dayOfWeek !== existing.day_of_week ||
    f.startTime !== existing.start_time.slice(0, 5);

  const { emptyIds, skippedCount } = await splitFutureSessionsByBookings(
    admin,
    input.templateId,
  );

  if (emptyIds.length > 0) {
    if (timeChanged) {
      const { error: cancelErr } = await admin
        .from("class_sessions")
        .update({ status: "cancelled", cancellation_reason: "series_updated" })
        .in("id", emptyIds);
      if (cancelErr) {
        console.error(
          "[adminUpdateSeries] cancel of stale occurrences failed",
          cancelErr,
        );
      }
    } else {
      // Duur kan zijn gewijzigd: end_at hangt af van elke rij's eigen
      // start_at, dus per rij herberekenen i.p.v. één statische waarde
      // over alle emptyIds heen te zetten.
      const { data: emptySessions, error: fetchErr } = await admin
        .from("class_sessions")
        .select("id, start_at")
        .in("id", emptyIds);

      if (fetchErr) {
        console.error(
          "[adminUpdateSeries] fetch of existing occurrences failed",
          fetchErr,
        );
      }

      for (const s of emptySessions ?? []) {
        const endAt = new Date(
          new Date(s.start_at).getTime() + f.durationMinutes * 60_000,
        ).toISOString();
        const { error: patchErr } = await admin
          .from("class_sessions")
          .update({
            class_type_id: f.classTypeId,
            trainer_id: f.trainerId,
            pillar: f.pillar,
            age_category: f.ageCategory,
            capacity: f.capacity,
            blocks_free_training: f.blocksFreeTraining,
            end_at: endAt,
          })
          .eq("id", s.id);
        if (patchErr) {
          console.error(
            "[adminUpdateSeries] patch of existing occurrence failed",
            s.id,
            patchErr,
          );
        }
      }
    }
  }

  const template = await fetchTemplateForMaterialization(admin, input.templateId);
  const { attempts, errors } = template
    ? await materializeSessionsForTemplates(admin, [template], {
        horizonDays: MATERIALIZATION_HORIZON_DAYS,
      })
    : { attempts: 0, errors: 0 };

  await emitEvent({
    type: "series.updated",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "schedule_template",
    subjectId: input.templateId,
    payload: {
      template_id: input.templateId,
      rematerialized: attempts,
      skipped_with_bookings: skippedCount,
    },
  });

  if (errors > 0) {
    console.error(
      `[adminUpdateSeries] materialisatie had ${errors} fout(en) voor template ${input.templateId}`,
    );
  }

  revalidateAll();

  return {
    ok: true,
    message:
      skippedCount > 0
        ? // COPY: confirm met Marlon
          `Serie bijgewerkt. ${skippedCount} sessie(s) met boekingen of wachtlijst zijn ongewijzigd gelaten.`
        : // COPY: confirm met Marlon
          "Serie bijgewerkt.",
    materializedCount: attempts,
    skippedWithBookings: skippedCount,
  };
}

// ----------------------------------------------------------------------------
// Serie stoppen — deactiveert template, annuleert toekomstige boekingloze
// sessies. Sessies met boekingen blijven staan (los annuleren via het
// bestaande sessie-paneel indien gewenst).
// ----------------------------------------------------------------------------

export async function adminCancelSeries(
  templateId: string,
): Promise<SeriesActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("schedule_templates")
    .select("id, is_active")
    .eq("id", templateId)
    .maybeSingle();

  if (!existing) return { ok: false, message: "Serie niet gevonden." };
  if (!existing.is_active) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Deze serie is al gestopt." };
  }

  const { error: deactivateErr } = await admin
    .from("schedule_templates")
    .update({ is_active: false })
    .eq("id", templateId);

  if (deactivateErr) {
    console.error("[adminCancelSeries] deactivate failed", deactivateErr);
    // COPY: confirm met Marlon
    return { ok: false, message: "Stoppen van de serie lukte niet." };
  }

  const { emptyIds, skippedCount } = await splitFutureSessionsByBookings(
    admin,
    templateId,
  );

  if (emptyIds.length > 0) {
    const { error: cancelErr } = await admin
      .from("class_sessions")
      .update({ status: "cancelled", cancellation_reason: "series_cancelled" })
      .in("id", emptyIds);
    if (cancelErr) {
      console.error(
        "[adminCancelSeries] cancel of future occurrences failed",
        cancelErr,
      );
    }
  }

  await emitEvent({
    type: "series.cancelled",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "schedule_template",
    subjectId: templateId,
    payload: {
      template_id: templateId,
      cancelled_sessions: emptyIds.length,
      skipped_with_bookings: skippedCount,
    },
  });

  revalidateAll();

  return {
    ok: true,
    message:
      skippedCount > 0
        ? // COPY: confirm met Marlon
          `Serie gestopt. ${emptyIds.length} sessie(s) geannuleerd, ${skippedCount} sessie(s) met boekingen of wachtlijst blijven staan.`
        : // COPY: confirm met Marlon
          `Serie gestopt. ${emptyIds.length} sessie(s) geannuleerd.`,
    skippedWithBookings: skippedCount,
  };
}
