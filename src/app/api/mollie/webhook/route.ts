import { NextResponse, after } from "next/server";
import { SequenceType } from "@mollie/api-client";
import { getMollieClient, type MollieMode } from "@/lib/mollie";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { notifyMemberPaymentFailed } from "@/lib/payments/payment-failed-notify";
import {
  moneyFactEventFor,
  recurringMembershipActionFor,
  writePaymentWithTransition,
} from "@/lib/payments/payment-write-core";
import {
  CHARGEBACK_ROW_SELECT,
  syncPaymentChargebacksFromMollie,
  type ChargebackRowDb,
} from "@/lib/chargebacks/process";
import { runActivationChain, type ActivationCaller } from "@/lib/orders/activation-chain";
import {
  classifyFailure,
  describeError,
  registerFailure,
  type ActivationSource,
} from "@/lib/orders/activation-failure";

/**
 * Foutclassificatie en -registratie staan sinds PR 3a in
 * src/lib/orders/activation-failure.ts, de activatieketen in
 * src/lib/orders/activation-chain.ts; beide gedeeld met de reconciliatie
 * (PR 3b). Deze route levert alleen de webhook-specifieke context.
 */
const SOURCE: ActivationSource = "mollie_webhook";
const WEBHOOK_CALLER: ActivationCaller = { source: SOURCE, actorType: "system" };

/**
 * Naloop na de respons (3a-bis). after() verlengt op Vercel de invocatie
 * via waitUntil tot de naloop klaar is, tot deze maxDuration; wordt die
 * bereikt, dan wordt de naloop afgebroken. 60 s is ruim voor het happy
 * path (enkele seconden) en dekt een dode ntfy (5 s), een dode MailerSend
 * (10 s) en een dode Akiles (4 s per call, twaalf calls) op één na
 * volledig; Akiles is de laatste stap, dus alles ervoor is dan gebeurd.
 * De respons hangt uitsluitend af van wat vóór after() gebeurt:
 * activate_order en het subscription-pad.
 */
export const maxDuration = 60;

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
 *  - chargeback (status blijft paid, amountChargedBack gevuld) → spiegel in
 *    payments.charged_back_amount_cents via src/lib/chargebacks/; recurring
 *    en eerste abonnementsbetaling worden als mislukte incasso behandeld
 *    (membership payment_failed, mail, push, ntfy), de rest alleen gemeld.
 *    Een reversal door de bank loopt terug naar 0 en kan de membership
 *    weer op active zetten.
 *
 * Payments-write en money-fact events: de rij wordt in drie stappen
 * geschreven (statusovergang, nieuwe rij, herhaling) zodat payment.received
 * en payment.failed alleen vuren op een echte overgang en niet op elke
 * herlevering (Mollie-retry na onze 500, refund- of chargeback-webhook).
 * Hetzelfde geldt voor de membership-statuswissels in de recurring-tak.
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
      // Met ntfy (hooguit een per payment-id per 26 uur, zie
      // registerFailure): een 404 is doorgaans een betaling uit een andere
      // Mollie-organisatie of modus (bijvoorbeeld een subscription van voor
      // de organisatiewissel) en mag niet stil verdwijnen.
      const cls = await registerFailure({
        source: SOURCE,
        path: "payments_get",
        molliePaymentId: paymentId,
        mode,
        error: e,
        notify: {
          // COPY: confirm met Marlon
          title: "Mollie-webhook: betaling niet op te halen",
          message: `Payment ${paymentId} (mode=${mode}) is niet op te halen: ${describeError(e).message.slice(0, 160)}. ${
            classifyFailure(e) === "transient"
              ? "Transiënt, Mollie biedt de webhook opnieuw aan."
              : "Blijvend, geen retry. Mogelijke oorzaak: een betaling uit een andere Mollie-organisatie (oude subscription) of uit de andere modus; controleer in het Mollie-dashboard van die organisatie."
          }`,
          tags: "warning",
        },
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

    // Payments-rij. Drie stappen in plaats van een blinde upsert, zodat
    // de money-fact events hieronder alleen op een echte statusovergang
    // vuren (webhook-betrouwbaarheid, 6.5). is_test is het snapshot uit de
    // modus van deze webhook-aanroep (propagatieketen, 6.3).
    //  1. overgang: update waar de status verschilt van wat Mollie nu zegt;
    //  2. nieuwe rij: insert die een bestaande rij met rust laat
    //     (recurring betalingen maakt Mollie zelf aan, die bestaan hier nog niet);
    //  3. herhaling: alleen lezen, niets schrijven.
    // Een herhaling overschrijft daardoor ook niet meer de profile_id die de
    // recurring-tak eerder uit de membership vulde.
    const amountCents = Math.round(parseFloat(payment.amount.value) * 100);
    const isRecurring =
      payment.sequenceType === SequenceType.recurring && Boolean(payment.subscriptionId);
    const paymentFields = {
      is_test: mode === "test",
      membership_id: membershipId ?? null,
      pt_booking_id: ptBookingId ?? null,
      order_id: orderId ?? null,
      profile_id: profileId ?? null,
      amount_cents: amountCents,
      status: payment.status,
      method: payment.method ?? null,
      description: payment.description ?? null,
      paid_at: payment.paidAt ?? null,
      mollie_subscription_id: payment.subscriptionId ?? null,
      ...(isRecurring ? { kind: "recurring" } : {}),
    };
    // De volgorde en de betekenis van `transitioned` staan in
    // src/lib/payments/payment-write-core.ts (getest in
    // scripts/chargebacks/payment-write.test.mts).
    const { row: paymentRow, transitioned } = await writePaymentWithTransition<ChargebackRowDb>({
      transition: async () => {
        const { data, error } = await supabase
          .from("payments")
          .update(paymentFields)
          .eq("mollie_payment_id", payment.id)
          .neq("status", payment.status)
          .select(CHARGEBACK_ROW_SELECT)
          .maybeSingle<ChargebackRowDb>();
        if (error) {
          console.error(
            `[mollie/webhook] payments transition update failed (id=${paymentId}, mode=${mode})`,
            error,
          );
          return null;
        }
        return data ?? null;
      },
      insertIfAbsent: async () => {
        const { data, error } = await supabase
          .from("payments")
          .upsert(
            { mollie_payment_id: payment.id, ...paymentFields },
            { onConflict: "mollie_payment_id", ignoreDuplicates: true },
          )
          .select(CHARGEBACK_ROW_SELECT)
          .maybeSingle<ChargebackRowDb>();
        if (error) {
          // Kan sinds PR 3 op payments_refunded_lte_amount_check klappen als
          // Mollie ooit een amountRefunded boven het bedrag stuurt (7.4);
          // leesbare log in plaats van een stilte in de buitenste catch.
          console.error(
            `[mollie/webhook] payments insert failed (id=${paymentId}, mode=${mode})`,
            error,
          );
          return null;
        }
        return data ?? null;
      },
      read: async () => {
        const { data } = await supabase
          .from("payments")
          .select(CHARGEBACK_ROW_SELECT)
          .eq("mollie_payment_id", payment.id)
          .maybeSingle<ChargebackRowDb>();
        return data ?? null;
      },
    });

    // Money-fact events, alleen op een echte overgang naar een terminale
    // status. dedupe_key = Mollie payment-id op een vaste plek in de payload
    // blijft staan voor lezers die ooit dedupliceren; een herlevering
    // (retry, refund- of chargeback-webhook) komt hier niet meer.
    const moneyFact = moneyFactEventFor(transitioned, payment.status);
    if (moneyFact === "payment.received") {
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
    } else if (moneyFact === "payment.failed") {
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

    // Chargeback-spiegel (4.7, storno-tegenhanger): vergelijkt de rij met
    // payment.amountChargedBack en doet alleen iets als het bedrag
    // verschilt. Vóór de type-takken, want een storno raakt elk type; de
    // recurring-tak hieronder reactiveert niet meer op een herlevering,
    // dus een zojuist op payment_failed gezette membership blijft staan.
    if (paymentRow) {
      await syncPaymentChargebacksFromMollie({
        mollie,
        row: paymentRow,
        view: {
          amountChargedBackCents: payment.amountChargedBack
            ? Math.round(parseFloat(payment.amountChargedBack.value) * 100)
            : 0,
          sequenceType:
            payment.sequenceType === SequenceType.recurring
              ? "recurring"
              : payment.sequenceType === SequenceType.first
                ? "first"
                : payment.sequenceType === SequenceType.oneoff
                  ? "oneoff"
                  : null,
          subscriptionId: payment.subscriptionId ?? null,
          metadataType: type ?? null,
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
      // zodat Mollie herhaalt; alles anders is 200. De naloop (ntfy,
      // order.activated, bevestigingsmail, GA4, Akiles) draait via after()
      // na de respons; activate_order en het subscription-pad ervoor.
      const result = await runActivationChain(
        WEBHOOK_CALLER,
        {
          supabase,
          mollie,
          mode,
          orderId,
          payment: { id: payment.id, amountCents },
          profileId: profileId ?? null,
        },
        { defer: (work) => after(work) },
      );
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

      // Payment row al geschreven boven; hier alleen status-shifts op de
      // membership zelf afhandelen, en alleen op een echte overgang van de
      // betaling: een chargeback-webhook (status nog steeds paid) mag een
      // zojuist op payment_failed gezette membership niet terugzetten, en
      // een herleverde failed-webhook mag een intussen hersteld lid niet
      // opnieuw op payment_failed zetten.
      const action = recurringMembershipActionFor({
        transitioned,
        paymentStatus: payment.status,
        membershipStatus: membership.status,
      });
      if (payment.status === "paid") {
        // Payment goed: als status was payment_failed, terug naar active
        if (action === "reactivate") {
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
      } else if (action === "degrade") {
        await supabase
          .from("memberships")
          .update({ status: "payment_failed" })
          .eq("id", membership.id);
        await sendNotification(
          "Incasso gefaald",
          `Membership ${membership.id} (${membership.plan_variant}): recurring ${payment.status}.`,
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
