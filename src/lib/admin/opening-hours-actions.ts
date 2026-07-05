"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type OpeningHoursActionResult =
  | { ok: true; message: string; id?: string }
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
  if (profile?.role !== "admin") {
    // COPY: confirm met Marlon
    return { ok: false, message: "Geen toegang." };
  }
  return { ok: true, userId: user.id };
}

function revalidateAll() {
  revalidatePath("/app/admin/instellingen");
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// ----------------------------------------------------------------------------
// Reguliere openingstijden — 7 rijen in één keer opslaan (zelfde
// "één formulier, één opslaan-knop"-patroon als saveBookingSettings).
// ----------------------------------------------------------------------------

export interface OpeningHoursRowInput {
  weekday: number; // 0-6, 0 = zondag (JS getDay)
  isClosed: boolean;
  opensAt: string | null; // "HH:mm"
  closesAt: string | null;
}

export async function saveOpeningHours(
  rows: OpeningHoursRowInput[],
): Promise<OpeningHoursActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (rows.length !== 7) {
    return { ok: false, message: "Verwacht precies 7 dagen." };
  }

  const seen = new Set<number>();
  for (const r of rows) {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Ongeldige weekdag." };
    }
    if (seen.has(r.weekday)) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Elke weekdag mag maar één keer voorkomen." };
    }
    seen.add(r.weekday);

    if (!r.isClosed) {
      if (!r.opensAt || !r.closesAt) {
        // COPY: confirm met Marlon
        return { ok: false, message: "Vul open- en sluitingstijd in, of markeer de dag als gesloten." };
      }
      if (!isValidTime(r.opensAt) || !isValidTime(r.closesAt)) {
        // COPY: confirm met Marlon
        return { ok: false, message: "Tijden moeten HH:mm zijn." };
      }
      if (r.opensAt >= r.closesAt) {
        // COPY: confirm met Marlon
        return { ok: false, message: "Sluitingstijd moet na openingstijd liggen." };
      }
    }
  }

  const admin = createAdminClient();

  for (const r of rows) {
    const { error } = await admin
      .from("opening_hours")
      .update({
        is_closed: r.isClosed,
        opens_at: r.isClosed ? null : `${r.opensAt}:00`,
        closes_at: r.isClosed ? null : `${r.closesAt}:00`,
      })
      .eq("weekday", r.weekday);

    if (error) {
      console.error("[saveOpeningHours] update failed", r.weekday, error);
      // COPY: confirm met Marlon
      return { ok: false, message: "Opslaan lukte niet." };
    }
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "opening_hours_updated",
    target_type: "opening_hours",
    target_id: crypto.randomUUID(),
    details: { rows },
  });

  revalidateAll();

  // COPY: confirm met Marlon
  return { ok: true, message: "Openingstijden opgeslagen." };
}

// ----------------------------------------------------------------------------
// Uitzonderingen (feestdagen, vakantieweken)
// ----------------------------------------------------------------------------

export interface OpeningHoursExceptionInput {
  date: string; // ISO date
  isClosed: boolean;
  opensAt?: string | null; // "HH:mm"
  closesAt?: string | null;
  note?: string;
}

export async function addOpeningHoursException(
  input: OpeningHoursExceptionInput,
): Promise<OpeningHoursActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!input.date) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Datum is verplicht." };
  }

  if (!input.isClosed) {
    if (!input.opensAt || !input.closesAt) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Vul open- en sluitingstijd in, of markeer als gesloten." };
    }
    if (!isValidTime(input.opensAt) || !isValidTime(input.closesAt)) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Tijden moeten HH:mm zijn." };
    }
    if (input.opensAt >= input.closesAt) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Sluitingstijd moet na openingstijd liggen." };
    }
  }

  const note = input.note?.trim() || null;
  if (note && note.length > 200) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Notitie mag max 200 tekens zijn." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("opening_hours_exceptions")
    .insert({
      date: input.date,
      is_closed: input.isClosed,
      opens_at: input.isClosed ? null : `${input.opensAt}:00`,
      closes_at: input.isClosed ? null : `${input.closesAt}:00`,
      note,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      // COPY: confirm met Marlon
      return { ok: false, message: "Er bestaat al een uitzondering op deze datum." };
    }
    console.error("[addOpeningHoursException] insert failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Toevoegen lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "opening_hours_exception_added",
    target_type: "opening_hours_exception",
    target_id: data.id,
    details: input,
  });

  revalidateAll();

  // COPY: confirm met Marlon
  return { ok: true, message: "Uitzondering toegevoegd.", id: data.id };
}

export async function deleteOpeningHoursException(
  id: string,
): Promise<OpeningHoursActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { error } = await admin
    .from("opening_hours_exceptions")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[deleteOpeningHoursException] delete failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Verwijderen lukte niet." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "opening_hours_exception_deleted",
    target_type: "opening_hours_exception",
    target_id: id,
    details: {},
  });

  revalidateAll();

  // COPY: confirm met Marlon
  return { ok: true, message: "Uitzondering verwijderd." };
}
