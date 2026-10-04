"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import {
  TRIAL_REQUEST_NOTES_MAX,
  isTrialRequestStatus,
} from "@/lib/trial-requests/status";

/**
 * Mutaties op tmc.trial_requests vanuit /app/admin/proeflessen. Zelfde
 * patroon als trainer-actions.ts: requireAdmin() als gate, daarna een
 * service-role update (de tabel heeft geen grants voor authenticated) en
 * een admin_audit_log-regel zoals member-actions.ts.
 */

export type TrialRequestActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateProeflessen() {
  revalidatePath("/app/admin/proeflessen");
}

export async function updateTrialRequestStatus(
  id: string,
  status: string,
): Promise<TrialRequestActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  // COPY: confirm met Marlon
  if (!UUID_RE.test(id)) return { ok: false, message: "Aanvraag niet gevonden." };
  // COPY: confirm met Marlon
  if (!isTrialRequestStatus(status)) return { ok: false, message: "Onbekende status." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("trial_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!row) return { ok: false, message: "Aanvraag niet gevonden." };

  // COPY: confirm met Marlon
  if (row.status === status) return { ok: true, message: "Status ongewijzigd." };

  const { error } = await admin.from("trial_requests").update({ status }).eq("id", id);
  if (error) {
    console.error("[updateTrialRequestStatus] update failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Opslaan mislukt. Probeer het opnieuw." };
  }

  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "trial_request_status_changed",
    target_type: "trial_request",
    target_id: id,
    details: { from: row.status, to: status },
  });

  revalidateProeflessen();
  // COPY: confirm met Marlon
  return { ok: true, message: "Status bijgewerkt." };
}

export async function updateTrialRequestNotes(
  id: string,
  notes: string,
): Promise<TrialRequestActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  // COPY: confirm met Marlon
  if (!UUID_RE.test(id)) return { ok: false, message: "Aanvraag niet gevonden." };

  const trimmed = (notes ?? "").trim();
  if (trimmed.length > TRIAL_REQUEST_NOTES_MAX) {
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: `Een notitie is maximaal ${TRIAL_REQUEST_NOTES_MAX} tekens.`,
    };
  }
  const next = trimmed ? trimmed : null;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("trial_requests")
    .select("id, notes")
    .eq("id", id)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!row) return { ok: false, message: "Aanvraag niet gevonden." };

  // COPY: confirm met Marlon
  if ((row.notes ?? null) === next) return { ok: true, message: "Notitie ongewijzigd." };

  const { error } = await admin.from("trial_requests").update({ notes: next }).eq("id", id);
  if (error) {
    console.error("[updateTrialRequestNotes] update failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Opslaan mislukt. Probeer het opnieuw." };
  }

  // De notitie zelf hoort niet in het audit-log (vrije tekst over een
  // bezoeker); alleen dat hij gewijzigd is en hoe lang hij nu is.
  await admin.from("admin_audit_log").insert({
    admin_id: auth.userId,
    action: "trial_request_notes_updated",
    target_type: "trial_request",
    target_id: id,
    details: { length: next?.length ?? 0 },
  });

  revalidateProeflessen();
  // COPY: confirm met Marlon
  return { ok: true, message: "Notitie opgeslagen." };
}
