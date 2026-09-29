"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./require-admin";
import { finalizeTrialBookingCancellation, type CancelCoreResult } from "@/lib/trial-booking-cancel";
import { processPaymentRefund } from "@/lib/refunds/process";

/**
 * Admin annuleert een individuele proefles (betaald of gratis) met een
 * verplichte reden. De RPC tmc.admin_cancel_trial_booking(uuid, text) doet
 * annulering, reden en refund-intentie in een transactie (is_admin binnenin,
 * dus via de sessie-gebonden client). Daarna: refund bij Mollie en de
 * annuleringsmail, via het gedeelde vervolg in trial-booking-cancel.ts.
 */

export type TrialBookingActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const CANCEL_REASON_COPY: Record<string, string> = {
  // COPY: confirm met Marlon
  reason_required: "Geef een reden op; die gaat in de mail aan de bezoeker.",
  // COPY: confirm met Marlon
  booking_not_found: "Deze boeking bestaat niet (meer).",
  // COPY: confirm met Marlon
  booking_not_open: "Deze boeking staat niet (meer) open.",
};

function revalidateFor(input: { sessionId?: string; codeId?: string }) {
  revalidatePath("/app/admin/rooster");
  revalidatePath("/app/admin/proefcodes");
  if (input.sessionId) revalidatePath(`/app/admin/sessies/${input.sessionId}`);
  if (input.codeId) revalidatePath(`/app/admin/proefcodes/${input.codeId}`);
}

export async function adminCancelTrialBooking(input: {
  trialBookingId: string;
  reason: string;
  sessionId?: string;
  codeId?: string;
}): Promise<TrialBookingActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const reason = input.reason?.trim() ?? "";
  if (!reason) return { ok: false, message: CANCEL_REASON_COPY.reason_required };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_cancel_trial_booking", {
    p_id: input.trialBookingId,
    p_reason: reason,
  });

  if (error) {
    console.error("[adminCancelTrialBooking] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Annuleren lukte niet. Probeer opnieuw." };
  }

  const result = data as CancelCoreResult;
  if (!result.ok) {
    return {
      ok: false,
      message:
        CANCEL_REASON_COPY[result.reason ?? ""] ??
        // COPY: confirm met Marlon
        "Annuleren lukte niet.",
    };
  }

  const outcome = await finalizeTrialBookingCancellation(result, reason);
  revalidateFor({ sessionId: input.sessionId ?? result.session_id, codeId: input.codeId });

  if (result.refund_id && outcome.refundOk === false) {
    return {
      ok: true,
      // COPY: confirm met Marlon
      message:
        "Boeking geannuleerd. De terugbetaling is niet bij Mollie aangekomen; probeer die opnieuw via de knop bij de boeking.",
    };
  }
  return {
    ok: true,
    message: result.refund_id
      ? // COPY: confirm met Marlon
        "Boeking geannuleerd en terugbetaling ingediend."
      : // COPY: confirm met Marlon
        "Boeking geannuleerd.",
  };
}

/** Retry-knop: dient een intentie met status requested of failed opnieuw in. */
export async function retryPaymentRefund(input: {
  refundId: string;
  sessionId?: string;
  codeId?: string;
}): Promise<TrialBookingActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const r = await processPaymentRefund(input.refundId);
  revalidateFor(input);
  if (!r.ok) {
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: `Terugbetaling opnieuw indienen lukte niet: ${r.message}`,
    };
  }
  return {
    ok: true,
    // COPY: confirm met Marlon
    message: r.status === "refunded" ? "Terugbetaling afgerond." : "Terugbetaling ingediend bij Mollie.",
  };
}
