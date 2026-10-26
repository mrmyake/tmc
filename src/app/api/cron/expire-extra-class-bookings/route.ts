import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { verifyCronAuth } from "@/lib/cron-auth";
import { applyExtraClassOutcome } from "@/lib/extra-class/confirm";
import { decideHoldExpiry } from "@/lib/extra-class/core";

export const dynamic = "force-dynamic";

/**
 * Vangnet voor pending extra lessen (tmc.bookings met status pending_payment,
 * spec-weekcap-extra-les.md), elke vijf minuten. Een pending rij telt mee in
 * de bezetting, dus een gemiste webhook of een gesloten betaalscherm mag de
 * plek niet langer vasthouden dan de houdtijd. De beslisregels staan in
 * src/lib/extra-class/core.ts (decideHoldExpiry, met tests):
 *
 *  - Mollie paid: alsnog bevestigen, zelfde vervolg als de webhook.
 *  - Mollie failed, expired of canceled: vrijgeven met die reden.
 *  - Nog open maar voorbij hold_expires_at: vrijgeven (payment_expired). Een
 *    betaling die daarna toch binnenkomt handelt de webhook af.
 *  - Zonder payment-id ouder dan vijf minuten: vrijgeven (de server action
 *    kon de betaling niet aanmaken en het opruimen is ook mislukt).
 *  - Mollie niet bereikbaar: binnen de houdtijd laten staan, daarna toch
 *    vrijgeven; de webhook of een volgende run corrigeert.
 */
type PendingRow = {
  id: string;
  booked_at: string;
  hold_expires_at: string | null;
  drop_in_payment_id: string | null;
  drop_in_price_cents: number | null;
  profile: { is_test: boolean } | { is_test: boolean }[] | null;
};

export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const now = new Date();

  const { data, error } = await admin
    .from("bookings")
    .select("id, booked_at, hold_expires_at, drop_in_payment_id, drop_in_price_cents, profile:profiles(is_test)")
    .eq("status", "pending_payment")
    .order("booked_at", { ascending: true })
    .limit(200)
    .returns<PendingRow[]>();
  if (error) {
    console.error("[cron/expire-extra-class-bookings] query failed", error);
    return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });
  }

  let confirmed = 0;
  let released = 0;
  let left = 0;
  let errors = 0;
  for (const row of data ?? []) {
    const profile = (Array.isArray(row.profile) ? row.profile[0] : row.profile) as
      | { is_test: boolean }
      | null;
    let mollieStatus: string | null = null;
    if (row.drop_in_payment_id) {
      const mollie = getMollieClient(profile?.is_test ? "test" : "live");
      if (mollie) {
        try {
          const payment = await mollie.payments.get(row.drop_in_payment_id);
          mollieStatus = payment.status;
        } catch (err) {
          console.error("[cron/expire-extra-class-bookings] mollie lookup failed", row.id, err);
        }
      }
    }
    const decision = decideHoldExpiry({
      bookedAt: row.booked_at,
      holdExpiresAt: row.hold_expires_at,
      hasPaymentId: Boolean(row.drop_in_payment_id),
      mollieStatus,
      now,
    });
    if (decision.action === "leave") {
      left += 1;
      continue;
    }
    const result = await applyExtraClassOutcome({
      admin,
      bookingId: row.id,
      molliePaymentId: row.drop_in_payment_id,
      outcome: decision.action === "confirm" ? "paid" : decision.outcome,
      amountCents: row.drop_in_price_cents ?? null,
      via: "cron",
    });
    if (result === "error") errors += 1;
    else if (result === "released") released += 1;
    else if (result === "confirmed" || result === "confirmed_late") confirmed += 1;
    else left += 1;
  }

  return NextResponse.json({ ok: true, checked: (data ?? []).length, confirmed, released, left, errors });
}
