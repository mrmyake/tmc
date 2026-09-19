import { NextResponse } from "next/server";
import { SequenceType } from "@mollie/api-client";
import { getMollieClient, type MollieMode } from "@/lib/mollie";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { sendEmail } from "@/lib/email";
import { sendPushToProfile } from "@/lib/push";
import PaymentFailed from "@/emails/payment_failed";
import { formatEuro } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";
import { runActivationChain, type ActivationCaller } from "@/lib/orders/activation-chain";
import {
  classifyFailure,
  describeError,
  registerFailure,
  type ActivationSource,
} from "@/lib/orders/activation-failure";

/** Fire-and-forget payment-failed email. Never throws. */
async function notifyMemberPaymentFailed(args: {
  profileId: string;
  amountCents: number;
  planLabel: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", args.profileId)
      .maybeSingle();
    if (!profile?.email) return;
    await sendEmail({
      to: profile.email,
      toName: profile.first_name ?? undefined,
      subject: "Incasso niet gelukt",
      react: PaymentFailed({
        firstName: profile.first_name ?? "",
        amountEuro: formatEuro(Math.round(args.amountCents / 100)),
        planLabel: args.planLabel,
        siteUrl: siteUrl(),
      }),
    });

    // Los kanaal naast de e-mail — geldzaken verdienen een directe melding
    // i.p.v. te wachten tot iemand zijn mail checkt.
    void sendPushToProfile(args.profileId, {
      title: "Incasso niet gelukt",
      body: `${formatEuro(Math.round(args.amountCents / 100))} voor ${args.planLabel} kon niet worden afgeschreven.`,
      data: { type: "payment_failed" },
    });
  } catch (err) {
    console.error("[notifyMemberPaymentFailed] skipped", err);
  }
}

/**
 * Foutclassificatie en -registratie staan sinds PR 3a in
 * src/lib/orders/activation-failure.ts, de activatieketen in
 * src/lib/orders/activation-chain.ts; beide gedeeld met de reconciliatie
 * (PR 3b). Deze route levert alleen de webhook-specifieke context.
 */
const SOURCE: ActivationSource = "mollie_webhook";
const WEBHOOK_CALLER: ActivationCaller = { source: SOURCE, actorType: "system" };

/** 500 richting Mollie: geen 2xx, dus Mollie biedt de webhook opnieuw aan. */
function retryLater(reason: string) {
  return NextResponse.json({ ok: false, error: reason, retry: true }, { status: 500 });
}

/** Zelfde whitelist als in POST; los herhaald zodat de buitenste catch hem kan gebruiken. */
function modeFromRequest(request: Request): MollieMode {
  return new URL(request.url).searchParams.get("mode") === "test" ? "test" : "live";
}

/**
 * Mollie webhook voor het member-system. Ontvangt payment-id's via form
 * encoded body. Apart van /api/trial-bookings/webhook omdat die al een
 * eigen flow heeft.
 *
 * Handled:
 *  - payment.paid + sequenceType=first|oneoff + metadata.type='order' → de
 *    order pipeline (WS-2): tmc.activate_order() (service-role only,
 *    idempotent onder een rijlock) activeert de order, daarna bij een
 *    subscription-order de Mollie-subscription voor recurring; een
 *    product-order (oneoff, geen mandaat) crediteert de rittenkaart/het
 *    PT-pakket.
 *  - payment.paid + sequenceType=recurring → log payment, reactiveer bij
 *    een eerder mislukte incasso
 *  - payment.failed/expired/canceled op recurring → status='payment_failed',
 *    ntfy + e-mail naar het lid
 *  - metadata.type='pt_booking' → ongewijzigd (nog niet op de order-pipeline)
 *
 * Responscodes (PR 2 webhook-betrouwbaarheid, zie het docblock bij
 * classifyFailure): 200 op alles wat verwerkt is of waarvan herhaling
 * dezelfde uitkomst geeft (onbekende payloads, 404 bij Mollie, geblokkeerde
 * orders); 500 op transiënte fouten zodat Mollie herhaalt. Elke mislukte
 * verwerking wordt vastgelegd als tmc.events-type webhook.failed.
 */
export async function POST(request: Request) {
  // Buiten de try, zodat de buitenste catch ze in webhook.failed kan zetten.
  let paymentId: string | null = null;
  let orderIdForFailure: string | null = null;
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (e) {
      // Onparseerbare body: herhalen geeft dezelfde body, dus permanent.
      console.error("[mollie/webhook] body niet te parsen", e);
      await registerFailure({
        source: SOURCE,
        path: "malformed_body",
        molliePaymentId: null,
        mode: modeFromRequest(request),
        error: e,
        classification: "permanent",
      });
      return NextResponse.json({ ok: true });
    }
    paymentId = String(formData.get("id") ?? "");
    if (!paymentId) {
      return NextResponse.json({ ok: true });
    }

    // Modus uit de eigen URL (spec-facturatie.md 6.5). Whitelist: alles
    // wat niet exact "test" is, is live. Afwezigheid betekent live, want
    // bestaande subscriptions dragen een opgeslagen URL zonder parameter.
    // De parameter is onschadelijk manipuleerbaar: hij kiest alleen met
    // welke key we de payment bij Mollie OPHALEN; een mismatch geeft een
    // 404 en de handler stopt zonder iets te schrijven.
    const mode: MollieMode =
      new URL(request.url).searchParams.get("mode") === "test"
        ? "test"
        : "live";
    const mollie = getMollieClient(mode);
    const supabase = createAdminClient();
    if (!mollie) {
      // Geen 2xx: Mollie herhaalt een webhook alleen na een niet-2xx-
      // respons. Een key die wegvalt (of een vangrail in mollie.ts die
      // weigert) mag geen betalingsbevestigingen stil laten verdwijnen;
      // met een 500 blijft Mollie proberen tot de configuratie klopt.
      console.error(`[mollie/webhook] mollie not configured (mode=${mode})`);
      return NextResponse.json({ ok: false, error: "mollie_not_configured" }, { status: 500 });
    }

    // Eigen try/catch: een mislukte get mag niet stil in de buitenste catch
    // verdwijnen; log id en modus zodat een modus-mismatch in de logs
    // zichtbaar is. Een 404 (mismatch, onbekende payment) blijft 200:
    // herhalen geeft dezelfde 404. Netwerk, Mollie 5xx of timeout wordt
    // 500 zodat Mollie herhaalt (herziening van 6.5, PR 2).
    let payment;
    try {
      payment = await mollie.payments.get(paymentId);
    } catch (e) {
      console.error(
        `[mollie/webhook] payments.get failed (id=${paymentId}, mode=${mode})`,
        e,
      );
      const cls = await registerFailure({
        source: SOURCE,
        path: "payments_get",
        molliePaymentId: paymentId,
        mode,
        error: e,
      });
      if (cls === "transient") return retryLater("payments_get_transient");
      return NextResponse.json({ ok: true });
    }
    const meta = (payment.metadata ?? {}) as Record<string, unknown>;
    const membershipId =
      typeof meta.membershipId === "string" ? meta.membershipId : undefined;
    const ptBookingId =
      typeof meta.ptBookingId === "string" ? meta.ptBookingId : undefined;
    const orderId =
      typeof meta.orderId === "string" ? meta.orderId : undefined;
    orderIdForFailure = orderId ?? null;
    const profileId =
      typeof meta.profileId === "string" ? meta.profileId : undefined;
    const type = typeof meta.type === "string" ? meta.type : undefined;

    // Upsert payment-regel — idempotent, log van wat Mollie heeft.
    // is_test is het snapshot uit de modus van deze webhook-aanroep
    // (propagatieketen, spec-facturatie.md 6.3). De upsert kan sinds PR 3
    // op payments_refunded_lte_amount_check klappen als Mollie ooit een
    // amountRefunded boven het bedrag stuurt (methode die wij niet
    // gebruiken, 7.4); vang dat hier expliciet zodat het een leesbare
    // log wordt in plaats van een stilte in de buitenste catch.
    const { error: upsertErr } = await supabase.from("payments").upsert(
      {
        mollie_payment_id: payment.id,
        is_test: mode === "test",
        membership_id: membershipId ?? null,
        pt_booking_id: ptBookingId ?? null,
        order_id: orderId ?? null,
        profile_id: profileId ?? null,
        amount_cents: Math.round(parseFloat(payment.amount.value) * 100),
        status: payment.status,
        method: payment.method ?? null,
        description: payment.description ?? null,
        paid_at: payment.paidAt ?? null,
        mollie_subscription_id: payment.subscriptionId ?? null,
      },
      { onConflict: "mollie_payment_id" }
    );
    if (upsertErr) {
      console.error(
        `[mollie/webhook] payments upsert failed (id=${paymentId}, mode=${mode})`,
        upsertErr,
      );
    }

    // Money-fact events. dedupe_key = Mollie payment-id op een vaste plek in de
    // payload; webhook-retries kunnen dit event dubbel vuren, dedupe-bij-lezen
    // op payload.dedupe_key. Alleen terminale statussen vuren.
    const amountCents = Math.round(parseFloat(payment.amount.value) * 100);
    if (payment.status === "paid") {
      await emitEvent({
        type: "payment.received",
        actorType: "system",
        subjectType: "payment",
        subjectId: null,
        payload: {
          dedupe_key: payment.id,
          payment_id: payment.id,
          profile_id: profileId ?? null,
          membership_id: membershipId ?? null,
          pt_booking_id: ptBookingId ?? null,
          order_id: orderId ?? null,
          amount_cents: amountCents,
          sequence: payment.sequenceType ?? null,
        },
      });
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      await emitEvent({
        type: "payment.failed",
        actorType: "system",
        subjectType: "payment",
        subjectId: null,
        payload: {
          dedupe_key: payment.id,
          payment_id: payment.id,
          profile_id: profileId ?? null,
          membership_id: membershipId ?? null,
          pt_booking_id: ptBookingId ?? null,
          order_id: orderId ?? null,
          amount_cents: amountCents,
          status: payment.status,
          sequence: payment.sequenceType ?? null,
        },
      });
    }

    // PT booking payment (create-on-book met hold, PT-agenda PR A):
    // paid flipt de pending booking naar 'booked' en wist de hold op de
    // sessie; failed/expired/canceled annuleert booking plus sessie zodat
    // het slot vrijkomt. Idempotent: de status-flip is een no-op op een
    // al geflipte rij en de hold-wipe is idempotent van zichzelf.
    if (type === "pt_booking" && ptBookingId) {
      const { data: booking } = await supabase
        .from("pt_bookings")
        .select("id, profile_id, pt_session_id, status")
        .eq("id", ptBookingId)
        .maybeSingle();

      if (!booking) {
        // Kan gebeuren als de cleanup-cron een verlopen hold al heeft
        // opgeruimd terwijl de betaling toch nog binnenkwam: geld is
        // binnen zonder boeking, dus een mens moet ernaar kijken.
        if (payment.status === "paid") {
          await sendNotification(
            "PT-betaling zonder boeking",
            `Betaling ${payment.id} (€${(amountCents / 100).toFixed(2)}) verwijst naar pt_booking ${ptBookingId}, maar die bestaat niet meer (hold verlopen en opgeruimd). Refund of handmatig inplannen.`,
            "warning",
          );
        }
        return NextResponse.json({ ok: true });
      }

      if (payment.status === "paid") {
        // Alleen de daadwerkelijke flip pending -> booked vuurt ntfy en
        // event; een webhook-retry op een al geboekte rij herhaalt ze niet.
        // Zelfde poort als !already_activated in de orderpijplijn hieronder.
        const { data: flipped, error: flipErr } = await supabase
          .from("pt_bookings")
          .update({ status: "booked" })
          .eq("id", ptBookingId)
          .eq("status", "pending")
          .select("id");
        if (flipErr) {
          console.error("[mollie/webhook] pt_bookings flip failed", ptBookingId, flipErr);
        }
        const justConfirmed = (flipped?.length ?? 0) > 0;
        // De hold wissen is de toestand die bij 'booked' hoort, geen
        // signaal; idempotent, dus ook op een retry gewoon uitvoeren.
        await supabase
          .from("pt_sessions")
          .update({ hold_expires_at: null })
          .eq("id", booking.pt_session_id);
        if (justConfirmed) {
          await sendNotification(
            "Nieuwe PT-boeking",
            `PT sessie betaald. Booking ${ptBookingId}, €${(amountCents / 100).toFixed(2)}.`,
            "tada",
          );
          await emitEvent({
            type: "pt_booking.confirmed",
            actorType: "system",
            subjectType: "pt_booking",
            subjectId: ptBookingId,
            payload: {
              profile_id: booking.profile_id,
              pt_booking_id: ptBookingId,
              payment_id: payment.id,
              amount_cents: amountCents,
            },
          });
        }
      } else if (
        ["failed", "expired", "canceled"].includes(payment.status) &&
        booking.status === "pending"
      ) {
        // Betaling mislukt: annuleer booking en sessie zodat het slot
        // vrijkomt. Alleen vanaf 'pending' — een al betaalde boeking mag
        // nooit door een verlate failed-event omvallen.
        await supabase
          .from("pt_bookings")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
          })
          .eq("id", ptBookingId)
          .eq("status", "pending");
        await supabase
          .from("pt_sessions")
          .update({ status: "cancelled" })
          .eq("id", booking.pt_session_id)
          .eq("status", "scheduled");
        await emitEvent({
          type: "pt_booking.cancelled",
          actorType: "system",
          subjectType: "pt_booking",
          subjectId: ptBookingId,
          payload: {
            profile_id: profileId ?? null,
            pt_booking_id: ptBookingId,
            payment_id: payment.id,
          },
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Order pipeline: first payment (subscription, sequenceType=first) of
    // product-betaling (oneoff, geen mandaat) → activate_order
    // (service-role only, idempotent onder een rijlock in
    // tmc.activate_order()). Alleen aangeroepen op status 'paid': op
    // failed/expired/canceled blijft de order gewoon 'pending' staan
    // (opnieuw betaalbaar tot expires_at, zie ws2-order-pipeline-design.md
    // §4), geen statuswijziging nodig.
    if (
      (payment.sequenceType === SequenceType.first ||
        payment.sequenceType === SequenceType.oneoff) &&
      type === "order" &&
      orderId
    ) {
      if (payment.status !== "paid") {
        await sendNotification(
          "Eerste betaling niet gelukt",
          `Order ${orderId} — eerste betaling ${payment.status}. Blijft openstaand tot de order verloopt; de klant kan het opnieuw proberen.`,
          "warning"
        );
        return NextResponse.json({ ok: true });
      }

      // Activatie plus de keten erna: src/lib/orders/activation-chain.ts.
      // Een transiënte fout komt terug als `retry` en wordt hier een 500,
      // zodat Mollie herhaalt; alles anders is 200.
      const result = await runActivationChain(WEBHOOK_CALLER, {
        supabase,
        mollie,
        mode,
        orderId,
        payment: { id: payment.id, amountCents },
        profileId: profileId ?? null,
      });
      if (result.outcome === "retry") return retryLater(result.reason);
      return NextResponse.json({ ok: true });
    }

    // Recurring payment (via subscription)
    if (
      payment.sequenceType === SequenceType.recurring &&
      payment.subscriptionId
    ) {
      const { data: membership } = await supabase
        .from("memberships")
        .select("id,status,profile_id,plan_variant")
        .eq("mollie_subscription_id", payment.subscriptionId)
        .maybeSingle();

      if (!membership) {
        // Unknown subscription — ignore but log
        console.warn(
          "[mollie/webhook] unknown subscription",
          payment.subscriptionId
        );
        return NextResponse.json({ ok: true });
      }

      // Payment row al geüpsert boven; hier alleen status-shifts op de
      // membership zelf afhandelen.
      if (payment.status === "paid") {
        // Payment goed: als status was payment_failed, terug naar active
        if (membership.status === "payment_failed") {
          await supabase
            .from("memberships")
            .update({ status: "active" })
            .eq("id", membership.id);
          await emitEvent({
            type: "membership.reactivated",
            actorType: "system",
            subjectType: "membership",
            subjectId: membership.id,
            payload: {
              profile_id: membership.profile_id,
              membership_id: membership.id,
              payment_id: payment.id,
            },
          });
        }
        // profile_id op payment-rij vullen (was mogelijk null)
        await supabase
          .from("payments")
          .update({ profile_id: membership.profile_id })
          .eq("mollie_payment_id", payment.id);
      } else if (["failed", "expired", "canceled"].includes(payment.status)) {
        if (membership.status === "active") {
          await supabase
            .from("memberships")
            .update({ status: "payment_failed" })
            .eq("id", membership.id);
          await sendNotification(
            "Incasso gefaald",
            `Membership ${membership.id} (${membership.plan_variant}) — recurring ${payment.status}.`,
            "warning"
          );
          // Fire-and-forget member email.
          void notifyMemberPaymentFailed({
            profileId: membership.profile_id,
            amountCents: Math.round(Number(payment.amount?.value ?? "0") * 100),
            planLabel: membership.plan_variant ?? "abonnement",
          });
          await emitEvent({
            type: "membership.payment_failed",
            actorType: "system",
            subjectType: "membership",
            subjectId: membership.id,
            payload: {
              profile_id: membership.profile_id,
              membership_id: membership.id,
              payment_id: payment.id,
              sequence: "recurring",
            },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API /api/mollie/webhook]", e);
    const cls = await registerFailure({
      source: SOURCE,
      path: "unhandled",
      molliePaymentId: paymentId,
      orderId: orderIdForFailure,
      mode: modeFromRequest(request),
      error: e,
      notify: {
        title: "Mollie-webhook: onverwachte fout",
        message: `Payment ${paymentId ?? "onbekend"}${
          orderIdForFailure ? `, order ${orderIdForFailure}` : ""
        }: ${describeError(e).message.slice(0, 200)}${
          classifyFailure(e) === "transient"
            ? " (transiënt, Mollie biedt de webhook opnieuw aan)"
            : " (blijvend, geen retry)"
        }`,
        tags: "warning",
      },
    });
    if (cls === "transient") return retryLater("unhandled_transient");
    return NextResponse.json({ ok: true });
  }
}
