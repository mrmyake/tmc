"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import {
  PROGRAMMA_INTAKE_NOTES_MAX,
  isProgrammaIntakeStatus,
} from "@/lib/programma-intake/status";

/**
 * Mutaties op tmc.programma_intakes vanuit /app/admin/intakes. Zelfde patroon
 * als trial-requests-actions.ts: requireAdmin() als gate, daarna een
 * service-role update en een admin_audit_log-regel. contacted_at wordt gezet
 * bij de eerste overgang weg van new en daarna nooit meer aangeraakt.
 */

export type ProgrammaIntakeActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateIntakes() {
  // Layout-niveau: ook de badge in de sidebar moet mee.
  revalidatePath("/app/admin", "layout");
}

export async function updateProgrammaIntakeStatus(
  id: string,
  status: string,
): Promise<ProgrammaIntakeActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  // COPY: confirm met Marlon
  if (!UUID_RE.test(id)) return { ok: false, message: "Aanvraag niet gevonden." };
  // COPY: confirm met Marlon
  if (!isProgrammaIntakeStatus(status)) return { ok: false, message: "Onbekende status." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("programma_intakes")
    .select("id, status, contacted_at")
    .eq("id", id)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!row) return { ok: false, message: "Aanvraag niet gevonden." };

  // COPY: confirm met Marlon
  if (row.status === status) return { ok: true, message: "Status ongewijzigd." };

  const patch: { status: string; contacted_at?: string } = { status };
  if (row.status === "new" && !row.contacted_at) {
    patch.contacted_at = new Date().toISOString();
  }

  const { error } = await admin.from("programma_intakes").update(patch).eq("id", id);
  if (error) {
    console.error("[updateProgrammaIntakeStatus] update failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Opslaan mislukt. Probeer het opnieuw." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "programma_intake_status_changed",
    target_type: "programma_intake",
    target_id: id,
    details: { from: row.status, to: status },
  });

  revalidateIntakes();
  // COPY: confirm met Marlon
  return { ok: true, message: "Status bijgewerkt." };
}

export async function updateProgrammaIntakeNotes(
  id: string,
  notes: string,
): Promise<ProgrammaIntakeActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  // COPY: confirm met Marlon
  if (!UUID_RE.test(id)) return { ok: false, message: "Aanvraag niet gevonden." };

  const trimmed = (notes ?? "").trim();
  if (trimmed.length > PROGRAMMA_INTAKE_NOTES_MAX) {
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: `Een notitie is maximaal ${PROGRAMMA_INTAKE_NOTES_MAX} tekens.`,
    };
  }
  const next = trimmed ? trimmed : null;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("programma_intakes")
    .select("id, notes")
    .eq("id", id)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!row) return { ok: false, message: "Aanvraag niet gevonden." };

  // COPY: confirm met Marlon
  if ((row.notes ?? null) === next) return { ok: true, message: "Notitie ongewijzigd." };

  const { error } = await admin.from("programma_intakes").update({ notes: next }).eq("id", id);
  if (error) {
    console.error("[updateProgrammaIntakeNotes] update failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Opslaan mislukt. Probeer het opnieuw." };
  }

  // De notitie zelf hoort niet in het audit-log (vrije tekst over een
  // bezoeker); alleen dat hij gewijzigd is en hoe lang hij nu is.
  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "programma_intake_notes_updated",
    target_type: "programma_intake",
    target_id: id,
    details: { length: next?.length ?? 0 },
  });

  revalidateIntakes();
  // COPY: confirm met Marlon
  return { ok: true, message: "Notitie opgeslagen." };
}
