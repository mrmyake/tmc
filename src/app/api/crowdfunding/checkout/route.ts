import { NextResponse } from "next/server";
import { PaymentMethod } from "@mollie/api-client";
import { getMollieClient } from "@/lib/mollie";
import { getAdminClient } from "@/lib/supabase";
import {
  getCrowdfundingSettings,
  getCrowdfundingTierById,
} from "../../../../../sanity/lib/fetch";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const tierId: string | undefined = data.tierId;
    const name: string | undefined = data.name?.trim();
    const email: string | undefined = data.email?.trim();
    const phone: string | undefined = data.phone?.trim() || undefined;
    const showOnWall: boolean = data.showOnWall !== false;

    if (!tierId || !name || !email) {
      return NextResponse.json(
        { error: "Vul naam, e-mail en tier in." },
        { status: 400 }
      );
    }

    // Prijs + tiernaam server-side uit Sanity — nooit uit client payload
    const tier = await getCrowdfundingTierById(tierId);
    if (!tier || !tier.active) {
      return NextResponse.json(
        { error: "Deze tier bestaat niet meer." },
        { status: 404 }
      );
    }

    const settings = await getCrowdfundingSettings();
    if (!settings?.active) {
      return NextResponse.json(
        { error: "De campagne is nog niet live." },
        { status: 403 }
      );
    }

    // Slot-check uit Supabase
    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Betaling is tijdelijk niet beschikbaar." },
        { status: 503 }
      );
    }

    if (typeof tier.maxSlots === "number" && tier.maxSlots > 0) {
      const { data: slotRow } = await supabase
        .from("crowdfunding_tiers")
        .select("slots_claimed")
        .eq("id", tier.tierId)
        .maybeSingle();
      const claimed = slotRow?.slots_claimed ?? 0;
      if (claimed >= tier.maxSlots) {
        return NextResponse.json(
          { error: "Deze tier is helaas uitverkocht." },
          { status: 409 }
        );
      }
    }

    const mollie = getMollieClient();
    if (!mollie) {
      return NextResponse.json(
        { error: "Betalingsprovider niet geconfigureerd." },
        { status: 503 }
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://themovementclub.nl";
    const amountValue = tier.price.toFixed(2);

    // 1. Insert pending backer row (zonder mollie_payment_id — komt straks)
    const { data: backer, error: insertErr } = await supabase
      .from("crowdfunding_backers")
      .insert({
        tier_id: tier.tierId,
        tier_name: tier.name,
        amount: tier.price,
        name,
        email,
        phone: phone ?? null,
        payment_status: "pending",
        show_on_wall: showOnWall,
      })
      .select("id")
      .single();

    if (insertErr || !backer) {
      console.error("[checkout] insert backer failed", insertErr);
      return NextResponse.json(
        { error: "Kon reservering niet opslaan." },
        { status: 500 }
      );
    }

    // 2. Mollie payment
    const payment = await mollie.payments.create({
      amount: { currency: "EUR", value: amountValue },
      description: `The Movement Club — ${tier.name}`,
      redirectUrl: `${siteUrl}/crowdfunding/bedankt?backer=${backer.id}`,
      webhookUrl: `${siteUrl}/api/crowdfunding/webhook`,
      method: [
        PaymentMethod.ideal,
        PaymentMethod.creditcard,
        PaymentMethod.bancontact,
      ],
      metadata: {
        backerId: backer.id,
        tierId: tier.tierId,
      },
    });

    // 3. Koppel payment_id aan backer
    await supabase
      .from("crowdfunding_backers")
      .update({ mollie_payment_id: payment.id })
      .eq("id", backer.id);

    const checkoutUrl = payment.getCheckoutUrl();
    if (!checkoutUrl) {
      return NextResponse.json(
        { error: "Kon betaallink niet genereren." },
        { status: 500 }
      );
    }

    return NextResponse.json({ checkoutUrl, backerId: backer.id });
  } catch (e) {
    console.error("[API /crowdfunding/checkout]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
