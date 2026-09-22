"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./require-admin";
import {
  cancelAccountDeletionRequest,
  hardstopAccountDeletion,
} from "@/lib/account-deletion/service";

/**
 * Admin-acties op /app/admin/verwijderverzoeken. Beide wrappen bestaande
 * functies uit de wiring-laag (src/lib/account-deletion/service.ts); de
 * kern (core.ts) en de RPC uit #206 blijven onaangeraakt.
 */

export type AccountDeletionActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function revalidate() {
  revalidatePath("/app/admin/verwijderverzoeken");
}

/**
 * Trekt een lopend verzoek in, ongeacht of de sluiting nog wacht of al is
 * uitgevoerd. cancelDeletionRequestCore weigert zelf zodra de profielstap
 * al gedaan is (dan is er niets meer om terug te draaien); dat komt hier
 * terug als een foutmelding, geen crash.
 */
export async function cancelAccountDeletionByAdmin(
  deletionId: string,
): Promise<AccountDeletionActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const result = await cancelAccountDeletionRequest(deletionId, {
    actorType: "admin",
    actorId: auth.userId,
  });
  if (!result.ok) {
    // COPY: confirm met Marlon
    const message =
      result.reason === "not_found"
        ? "Verzoek niet gevonden."
        : "Dit verzoek staat al niet meer open, of het account is al gesloten.";
    return { ok: false, message };
  }

  revalidate();
  // COPY: confirm met Marlon
  return { ok: true, message: "Verzoek ingetrokken." };
}

/**
 * Forceert de sluiting nu (in plaats van te wachten op de einddatum van
 * het abonnement) en zet de purge zo ver mogelijk door.
 */
export async function hardstopAccountDeletionByAdmin(
  deletionId: string,
): Promise<AccountDeletionActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const result = await hardstopAccountDeletion(deletionId);
  if (!result.ok) {
    return { ok: false, message: result.error };
  }

  revalidate();
  if (result.purge.completed) {
    // COPY: confirm met Marlon
    return { ok: true, message: "Gesloten en volledig verwerkt." };
  }
  if (result.purge.blocked) {
    // COPY: confirm met Marlon
    return {
      ok: false,
      message: "Gesloten, maar de purge loopt nog vast. Bekijk de laatste fout hieronder.",
    };
  }
  // COPY: confirm met Marlon
  return {
    ok: true,
    message: "Gesloten. De resterende stappen (mail, MailerLite) rondt de nachtelijke cron af.",
  };
}
