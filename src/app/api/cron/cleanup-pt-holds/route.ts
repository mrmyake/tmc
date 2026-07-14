import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Ruimt verlopen PT-holds op (create-on-book met hold, PT-agenda PR A).
 * book_pt_pending_payment maakt een pt_session met hold_expires_at plus
 * een pending pt_booking; betaalt de klant, dan flipt de webhook naar
 * 'booked' en wist de hold. Betaalt de klant niet, dan blijft een
 * verweesde sessie plus pending booking achter.
 *
 * De slot-berekening telt een verlopen hold al als vrij, dus dit is puur
 * hygiene: hard-delete van sessies waarvan de hold ruim verlopen is en
 * waar uitsluitend pending boekingen aan hangen. Het uur marge dekt de
 * race met een trage Mollie-webhook (de webhook meldt een betaling op een
 * al opgeruimde boeking als "PT-betaling zonder boeking"). De delete
 * cascadet naar pt_bookings; payments.pt_booking_id is ON DELETE SET
 * NULL (live geverifieerd), dus de betaalhistorie blijft staan.
 * Idempotent: een tweede run vindt niets meer.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  type Row = {
    id: string;
    pt_bookings: Array<{ id: string; status: string }> | null;
  };

  const { data: sessions, error } = await admin
    .from("pt_sessions")
    .select("id, pt_bookings(id, status)")
    .eq("status", "scheduled")
    .lt("hold_expires_at", cutoff)
    .returns<Row[]>();

  if (error) {
    console.error("[cron/cleanup-pt-holds] query failed", error);
    return NextResponse.json(
      { ok: false, error: "query failed" },
      { status: 500 },
    );
  }

  // Vangnet: alleen sessies waar uitsluitend pending boekingen aan hangen.
  // Een betaalde boeking hoort hier nooit te staan (de webhook wist de
  // hold), maar als het toch zo is laten we de rij met rust.
  const deletable = (sessions ?? []).filter((s) =>
    (s.pt_bookings ?? []).every((b) => b.status === "pending"),
  );

  let deleted = 0;
  if (deletable.length > 0) {
    const { error: deleteErr } = await admin
      .from("pt_sessions")
      .delete()
      .in(
        "id",
        deletable.map((s) => s.id),
      );
    if (deleteErr) {
      console.error("[cron/cleanup-pt-holds] delete failed", deleteErr);
      return NextResponse.json(
        { ok: false, error: "delete failed" },
        { status: 500 },
      );
    }
    deleted = deletable.length;
  }

  return NextResponse.json({
    ok: true,
    expired: sessions?.length ?? 0,
    deleted,
    skipped: (sessions?.length ?? 0) - deleted,
  });
}
