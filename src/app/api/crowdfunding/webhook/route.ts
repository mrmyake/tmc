import { NextResponse } from "next/server";
import { getMollieClient } from "@/lib/mollie";
import { getAdminClient } from "@/lib/supabase";
import { sendNotification } from "@/lib/ntfy";
import { addSubscriber, GROUPS } from "@/lib/mailerlite";

export async function POST(request: Request) {
  try {
    // Mollie verstuurt application/x-www-form-urlencoded met veld "id"
    const formData = await request.formData();
    const paymentId = String(formData.get("id") ?? "");
    if (!paymentId) {
      // Mollie verwacht altijd 200, ook bij onzin
      return NextResponse.json({ ok: true });
    }

    const mollie = getMollieClient();
    const supabase = getAdminClient();
    if (!mollie || !supabase) {
      console.error("[webhook] mollie or supabase not configured");
      return NextResponse.json({ ok: true });
    }

    const payment = await mollie.payments.get(paymentId);
    const newStatus = payment.status; // "open" | "paid" | "failed" | ...

    // Huidige row ophalen
    const { data: backer, error: readErr } = await supabase
      .from("crowdfunding_backers")
      .select("id,payment_status,tier_id,tier_name,amount,name,email")
      .eq("mollie_payment_id", paymentId)
      .maybeSingle();

    if (readErr || !backer) {
      console.warn("[webhook] backer row not found", paymentId, readErr);
      return NextResponse.json({ ok: true });
    }

    // Idempotent: als huidige status al final is en gelijk aan nieuwe status → niks doen
    if (backer.payment_status === newStatus) {
      return NextResponse.json({ ok: true });
    }

    const wasAlreadyPaid = backer.payment_status === "paid";
    const isNowPaid = newStatus === "paid";

    // Status bijwerken
    await supabase
      .from("crowdfunding_backers")
      .update({ payment_status: newStatus })
      .eq("id", backer.id);

    // Overgang naar "paid" → stats + slot verhogen, notificatie sturen
    if (isNowPaid && !wasAlreadyPaid) {
      const [slotRes, statsRes] = await Promise.all([
        supabase.rpc("increment_cf_tier_slot", { p_tier_id: backer.tier_id }),
        supabase.rpc("increment_cf_stats", { p_amount: backer.amount }),
      ]);
      if (slotRes.error)
        console.error("[webhook] slot increment failed", slotRes.error);
      if (statsRes.error)
        console.error("[webhook] stats increment failed", statsRes.error);

      await Promise.all([
        sendNotification(
          "Nieuwe backer!",
          `${backer.name} (${backer.email}) — ${backer.tier_name} — €${backer.amount}`,
          "moneybag,fire"
        ),
        addSubscriber({
          email: backer.email,
          name: backer.name,
          fields: {
            tier: backer.tier_name,
            amount: String(backer.amount),
          },
          groups: GROUPS.CROWDFUNDING_BACKER
            ? [GROUPS.CROWDFUNDING_BACKER]
            : [],
        }),
      ]);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API /crowdfunding/webhook]", e);
    // Mollie herhaalt als we niet 2xx teruggeven — maar bij throw-loop willen we niet spammen
    return NextResponse.json({ ok: true });
  }
}
