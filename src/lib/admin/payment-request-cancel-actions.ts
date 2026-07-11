"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";

export type CancelPaymentRequestResult =
  | { ok: true; alreadyCancelled: boolean }
  | { ok: false; error: string };

// Vertaalt admin_cancel_order()'s {ok:false, reason} naar admin-taal.
// COPY: confirm met Marlon
const REASON_COPY: Record<string, string> = {
  order_not_found: "Dit betaalverzoek bestaat niet (meer).",
  not_admin_order: "Dit is geen admin-betaalverzoek.",
  activated:
    "Dit verzoek is al betaald en geactiveerd; annuleren kan niet meer.",
  already_paid:
    "Er is al een betaling binnen op dit verzoek; annuleren kan niet meer.",
  not_cancellable: "Dit verzoek staat niet meer open; annuleren kan niet.",
};

/**
 * WS-5 betaalverzoek-overzicht PR 2: annuleert een openstaand
 * betaalverzoek via tmc.admin_cancel_order (migratie 20260724). De RPC doet
 * het echte werk onder een rijlock: alleen draft/pending zonder paid
 * payment wordt gecanceld, en een kruisende betaling wint altijd omdat
 * activate_order 'cancelled' honoreert zoals 'expired'. Deze action is dus
 * bewust dun: gate, doorgeven, reden vertalen, audit-event.
 *
 * Dubbele gate-laagdeling zoals createPaymentRequest: requireAdmin() hier
 * in TS, tmc.is_admin() in de RPC.
 */
export async function cancelPaymentRequest(
  orderId: string,
): Promise<CancelPaymentRequestResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.message };

  try {
    // De RPC draait als de ingelogde admin: tmc.is_admin() leest auth.uid().
    const supabase = await createClient();
    const { data: result, error: rpcError } = await supabase.rpc(
      "admin_cancel_order",
      { p_order_id: orderId },
    );
    if (rpcError) {
      console.error("[cancelPaymentRequest] admin_cancel_order rpc", rpcError);
      // COPY: confirm met Marlon
      return { ok: false, error: "Kon het verzoek niet annuleren." };
    }
    if (!result?.ok) {
      return {
        ok: false,
        // COPY: confirm met Marlon
        error: REASON_COPY[result?.reason] ?? "Kon het verzoek niet annuleren.",
      };
    }

    const alreadyCancelled = Boolean(result.already_cancelled);
    if (!alreadyCancelled) {
      await emitEvent({
        type: "order.cancelled",
        actorType: "admin",
        actorId: gate.userId,
        subjectType: "order",
        subjectId: orderId,
        payload: { order_id: orderId },
      });
    }

    return { ok: true, alreadyCancelled };
  } catch (e) {
    console.error("[cancelPaymentRequest]", e);
    // COPY: confirm met Marlon
    return { ok: false, error: "Er ging iets mis. Probeer opnieuw." };
  }
}
