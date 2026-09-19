import { NextResponse } from "next/server";
import { SequenceType, SubscriptionStatus, type MollieClient } from "@mollie/api-client";
import { getMollieClient, type MollieMode } from "@/lib/mollie";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { syncMembershipAccess } from "@/lib/access/sync";
import { sendPurchaseToGa4 } from "@/lib/orders/ga-purchase";
import { sendOrderConfirmation } from "@/lib/orders/order-confirmation";
import { sendNotification } from "@/lib/ntfy";
import { sendEmail } from "@/lib/email";
import { sendPushToProfile } from "@/lib/push";
import PaymentFailed from "@/emails/payment_failed";
import { formatEuro } from "@/lib/format";
import { siteUrl, mollieWebhookUrl } from "@/lib/site-url";

/** Fire-and-forget payment-failed email. Never throws. */
/** Profiel achter een membership, voor de toegangssync als de Mollie-metadata geen profileId draagt. */
async function profileIdForMembership(
  supabase: ReturnType<typeof createAdminClient>,
  membershipId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("memberships")
    .select("profile_id")
    .eq("id", membershipId)
    .maybeSingle();
  return (data as { profile_id: string } | null)?.profile_id ?? null;
}

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
 * Foutafhandeling van de webhook (PR 1 en PR 2 van de webhook-
 * betrouwbaarheid, discovery op fix/mollie-webhook-reliability).
 *
 * Mollie's retry-gedrag, geverifieerd op https://docs.mollie.com/reference/webhooks:
 * alleen een 200 telt als succes; een antwoord dat langer dan 15 seconden
 * duurt telt als mislukt; na een niet-200 herhaalt Mollie op 1, 2, 4, 8, 16
 * en 29 minuten en daarna op 1, 2 en 22 uur, tien pogingen in totaal,
 * cumulatief 26 uur, daarna stopt Mollie definitief.
 *
 * Classificatie: een TRANSIENTE fout (netwerk, Mollie 5xx of timeout,
 * Supabase- of PostgREST-fout) krijgt een 500, zodat Mollie herhaalt. Een
 * PERMANENTE fout (Mollie 404 door modus-mismatch of onbekende payment,
 * onparseerbare body, integriteits- of programmeerfout in SQL) blijft een
 * 200 met een luide log en een webhook.failed-event: herhalen geeft per
 * definitie dezelfde uitkomst. Onbekende fouten gaan naar 500. De kosten
 * zijn asymmetrisch: 26 uur herhalen met wat ruis is goedkoper dan een
 * betaling definitief kwijtraken, en de reconciliatie (PR 3) vangt op wat
 * na 26 uur nog openstaat.
 *
 * Registratie: elke mislukte verwerking wordt persistent vastgelegd als
 * tmc.events-type webhook.failed (Vercel-logs zijn vluchtig, tmc.events
 * niet). Het event mag herhalen, elke poging is een feit. De ntfy niet:
 * per (pad, mollie_payment_id) gaat er hooguit een melding uit binnen het
 * retry-venster van 26 uur, met de al geschreven webhook.failed-rijen als
 * bron van waarheid. Bewust geen dedupe_key in de payload: dit is geen
 * money-fact. Registratie throwt nooit (emitEvent vangt alles); valt
 * Supabase zelf weg, dan blijft alleen de console-log over.
 */
type WebhookFailurePath =
  | "malformed_body"
  | "payments_get"
  | "activate_order"
  | "subscription_create"
  | "subscription_link_write"
  | "unhandled";

type FailureClass = "transient" | "permanent";

/** Mollie's retry-venster: tien pogingen, cumulatief 26 uur (zie docblock). */
const MOLLIE_RETRY_WINDOW_MS = 26 * 60 * 60 * 1000;

/**
 * SQLSTATE-klassen waarvan een herhaling een andere uitkomst kan geven:
 * 08 connection, 40 transaction rollback (serialization, deadlock),
 * 53 insufficient resources, 55 object not in prerequisite state (locks),
 * 57 operator intervention (statement timeout 57014, shutdown),
 * 58 system error, XX internal error.
 */
const TRANSIENT_SQLSTATE_CLASSES = new Set(["08", "40", "53", "55", "57", "58", "XX"]);

function describeError(err: unknown): { code: string | null; message: string } {
  if (err && typeof err === "object") {
    const e = err as {
      code?: unknown; // PostgrestError (SQLSTATE of PGRSTxxx), Node-systeemcode
      statusCode?: unknown; // Mollie ApiError
      title?: unknown; // Mollie ApiError
      name?: unknown;
      message?: unknown;
    };
    const code =
      typeof e.code === "string" && e.code !== ""
        ? e.code
        : typeof e.statusCode === "number"
          ? String(e.statusCode)
          : typeof e.title === "string"
            ? e.title
            : typeof e.name === "string"
              ? e.name
              : null;
    const message = typeof e.message === "string" ? e.message : String(err);
    return { code, message: message.slice(0, 500) };
  }
  return { code: null, message: String(err).slice(0, 500) };
}

/**
 * Transiënt of permanent, zie het docblock hierboven. Volgorde van de
 * checks volgt de bron van de fout:
 *  - Mollie ApiError met statusCode: 5xx en 429 transiënt; 401 en 403 ook,
 *    want dat is sleutel of configuratie en het precedent is de 500 op
 *    mollie_not_configured (spec-facturatie.md 6.5: herhalen tot de
 *    configuratie klopt); 400, 404, 422 en overige 4xx permanent. Een
 *    ApiError zonder statusCode is een netwerkfout of een onparseerbaar
 *    antwoord (mollie.cjs.js throwApiError, processFetchResponse): transiënt.
 *  - Supabase/PostgREST-fout met code: lege code is een fetch-fout uit
 *    supabase-js (PostgrestBuilder, "code/hint niet gevuld voor client-side
 *    netwerkfouten"): transiënt. PGRST1xx is een API-request-fout (client):
 *    permanent; overige PGRST (connection 0xx, schema cache 2xx, JWT 3xx,
 *    internal X00): transiënt. SQLSTATE: alleen de klassen hierboven
 *    transiënt; 22 data, 23 integriteit, 42 syntax/rechten en P0 (plpgsql
 *    raise) permanent, dezelfde invoer geeft dezelfde uitkomst.
 *  - Alles zonder herkenbare code (TypeError, AbortError, onbekend): transiënt,
 *    dus 500. Asymmetrische kosten, zie docblock.
 */
function classifyFailure(err: unknown): FailureClass {
  if (!err || typeof err !== "object") return "transient";
  const e = err as { code?: unknown; statusCode?: unknown; name?: unknown };
  if (typeof e.statusCode === "number") {
    const status = e.statusCode;
    if (status >= 500 || status === 429 || status === 401 || status === 403) return "transient";
    if (status >= 400) return "permanent";
    return "transient";
  }
  if (typeof e.code === "string") {
    const code = e.code;
    if (code === "") return "transient";
    if (code.startsWith("PGRST")) return code.startsWith("PGRST1") ? "permanent" : "transient";
    if (code.length === 5) {
      return TRANSIENT_SQLSTATE_CLASSES.has(code.slice(0, 2)) ? "transient" : "permanent";
    }
    return "transient";
  }
  return "transient";
}

/** 500 richting Mollie: geen 2xx, dus Mollie biedt de webhook opnieuw aan. */
function retryLater(reason: string) {
  return NextResponse.json({ ok: false, error: reason, retry: true }, { status: 500 });
}

/**
 * Is er binnen het retry-venster al een webhook.failed voor dit pad en deze
 * payment geschreven? De payload-containment (@>) loopt over
 * events_payload_gin (jsonb_path_ops). Bij een leesfout: false, liever een
 * dubbele melding dan een gemiste.
 */
async function hasRecentFailure(
  path: WebhookFailurePath,
  molliePaymentId: string,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - MOLLIE_RETRY_WINDOW_MS).toISOString();
    const { data, error } = await admin
      .from("events")
      .select("id")
      .eq("type", "webhook.failed")
      .contains("payload", { path, mollie_payment_id: molliePaymentId })
      .gte("created_at", since)
      .limit(1);
    if (error) {
      console.error("[mollie/webhook] webhook.failed lookup failed", error);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.error("[mollie/webhook] webhook.failed lookup threw", err);
    return false;
  }
}

/**
 * Registreert een mislukte verwerking: altijd een webhook.failed-event, en
 * hooguit een ntfy per (pad, payment) binnen het retry-venster. Geeft de
 * classificatie terug zodat de caller de responscode kiest. Throwt nooit.
 */
async function registerFailure(args: {
  path: WebhookFailurePath;
  molliePaymentId: string | null;
  orderId?: string | null;
  mode: MollieMode | null;
  error: unknown;
  classification?: FailureClass;
  extra?: Record<string, unknown>;
  notify?: { title: string; message: string; tags?: string };
}): Promise<FailureClass> {
  const classification = args.classification ?? classifyFailure(args.error);
  const { code, message } = describeError(args.error);
  const suppressed =
    args.notify && args.molliePaymentId
      ? await hasRecentFailure(args.path, args.molliePaymentId)
      : false;
  const notified = Boolean(args.notify) && !suppressed;
  await emitEvent({
    type: "webhook.failed",
    actorType: "system",
    subjectType: "payment",
    subjectId: null,
    payload: {
      source: "mollie_webhook",
      path: args.path,
      mollie_payment_id: args.molliePaymentId,
      order_id: args.orderId ?? null,
      mode: args.mode,
      error_code: code,
      error_message: message,
      classification,
      response_status: classification === "transient" ? 500 : 200,
      notified,
      ...(args.extra ?? {}),
    },
  });
  if (args.notify && notified) {
    await sendNotification(args.notify.title, args.notify.message, args.notify.tags ?? "warning");
  } else if (args.notify && suppressed) {
    console.warn("[mollie/webhook] ntfy onderdrukt, al gemeld binnen het retry-venster", {
      path: args.path,
      molliePaymentId: args.molliePaymentId,
    });
  }
  return classification;
}

/** Zelfde whitelist als in POST; los herhaald zodat de buitenste catch hem kan gebruiken. */
function modeFromRequest(request: Request): MollieMode {
  return new URL(request.url).searchParams.get("mode") === "test" ? "test" : "live";
}

/**
 * Bestaande Mollie-subscription voor dit membership, of null. De
 * idempotencyKey `order-<id>-sub` beschermt maar een uur (Mollie-docs,
 * api-idempotency), terwijl Mollie's webhook-retries tot 26 uur doorlopen.
 * Een retry buiten dat uur, na een geslaagde create waarvan de write van het
 * id verloren ging, zou anders een tweede subscription op hetzelfde mandaat
 * opleveren: twee incasso's per 28 dagen. metadata.membershipId is de
 * sleutel (gezet bij create, hieronder). Geannuleerde of voltooide
 * subscriptions tellen niet mee: die incasseren niet meer, en zo'n id
 * koppelen zou het membership ten onrechte als gedekt tonen.
 * Throwt bij een API-fout; de caller behandelt dat als "aanmaken mislukt".
 */
async function findExistingSubscriptionId(
  mollie: MollieClient,
  customerId: string,
  membershipId: string,
): Promise<string | null> {
  for await (const sub of mollie.customerSubscriptions.iterate({ customerId })) {
    const meta = (sub.metadata ?? {}) as Record<string, unknown>;
    if (meta.membershipId !== membershipId) continue;
    if (
      sub.status === SubscriptionStatus.canceled ||
      sub.status === SubscriptionStatus.completed
    ) {
      continue;
    }
    return sub.id;
  }
  return null;
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

      const { data: activation, error: activateErr } = await supabase.rpc(
        "activate_order",
        { p_order_id: orderId, p_mollie_payment_id: payment.id }
      );

      if (activateErr || !activation) {
        console.error("[mollie/webhook] activate_order failed", activateErr);
        const error = activateErr ?? new Error("activate_order returned null");
        const cls = classifyFailure(error);
        await registerFailure({
          path: "activate_order",
          molliePaymentId: payment.id,
          orderId,
          mode,
          error,
          classification: cls,
          notify: {
            title: "Order-activatie gefaald",
            message: `Order ${orderId}: activate_order gaf een fout terug (${
              cls === "transient"
                ? "transiënt, Mollie biedt de webhook opnieuw aan"
                : "blijvend, geen retry"
            }). Betaling is binnen; handmatig naklopen als het niet vanzelf herstelt.`,
            tags: "warning",
          },
        });
        if (cls === "transient") return retryLater("activate_order_transient");
        return NextResponse.json({ ok: true });
      }

      if (!activation.ok) {
        // Retry op een eerder geblokkeerde order: activate_order zette die
        // toen al op 'paid' met blocked_reason en de webhook meldde dat via
        // ntfy. Een herhaalde webhook krijgt nu invalid_status/paid terug.
        // Dat is al verwerkt, geen nieuwe weigering, dus geen tweede melding.
        if (activation.reason === "invalid_status" && activation.status === "paid") {
          console.warn("[mollie/webhook] retry op geblokkeerde order", {
            orderId,
            paymentId: payment.id,
          });
          return NextResponse.json({ ok: true });
        }
        // blocked_duplicate_membership = conditie 2: geld binnen, geen
        // membership aangemaakt omdat het profiel er via een andere order
        // al één heeft. orders.blocked_reason markeert de rij persistent
        // (ops kan hem terugvinden); deze alert is het directe signaal —
        // geen stille 'paid'-rij. order_not_found / payment_order_mismatch
        // / invalid_status zijn onverwacht en vragen ook om een mens.
        const isDuplicate = activation.reason === "blocked_duplicate_membership";
        await sendNotification(
          isDuplicate ? "Order betaald maar geblokkeerd" : "Order-activatie geweigerd",
          `Order ${orderId} → ${activation.reason}.${
            isDuplicate
              ? " Betaling is binnen zonder nieuw membership — refund of tegoed regelen."
              : " Handmatig naklopen."
          }`,
          "warning"
        );
        return NextResponse.json({ ok: true });
      }

      if (activation.late_payment) {
        // late_payment dekt sinds migratie 20260724 ook een gehonoreerde
        // betaling op een geannuleerd betaalverzoek (betaling wint altijd).
        await sendNotification(
          "Order geactiveerd na verlopen deadline of annulering",
          `Order ${orderId}: betaling kwam binnen nadat de link verlopen of geannuleerd was, en is gehonoreerd.`,
          "warning"
        );
      }

      if (!activation.already_activated) {
        // pt_order (PT-agenda C1): losse-sessie- of programma-betaling;
        // er hoort geen membership bij, de sessies staan al geboekt.
        await sendNotification(
          activation.needs_subscription
            ? "Nieuw abonnement!"
            : activation.pt_order
              ? "PT betaald!"
              : "Product verkocht!",
          activation.pt_order
            ? `Order ${orderId} (PT-sessie of programma) betaald. €${(amountCents / 100).toFixed(2)} ontvangen.`
            : `Order ${orderId} geactiveerd (membership ${activation.membership_id}). €${(amountCents / 100).toFixed(2)} ontvangen.`,
          "tada,moneybag"
        );
        await emitEvent({
          type: "order.activated",
          actorType: "system",
          subjectType: "order",
          subjectId: orderId,
          payload: {
            profile_id: profileId ?? null,
            order_id: orderId,
            membership_id: activation.membership_id,
            payment_id: payment.id,
          },
        });

        // Bevestigingsmail naar het lid (spec-facturatie.md, sectie
        // "Bevestigingsmail na betaling"): exact één keer per order, met
        // tmc.events (order.confirmation_sent) als poort. Awaited zodat het
        // event geschreven is voor deze request eindigt, maar de helper
        // throwt nooit en een mislukte mail verandert niets aan de
        // activatie of aan de 2xx; alleen een ntfy zodat iemand het ziet.
        const confirmation = await sendOrderConfirmation(orderId);
        if (confirmation.outcome === "failed") {
          await sendNotification(
            "Bevestigingsmail niet verstuurd",
            `Order ${orderId} is geactiveerd, maar de bevestigingsmail naar het lid is niet verstuurd. Handmatig nasturen of MailerSend checken.`,
            "warning"
          );
        } else if (confirmation.outcome === "skipped") {
          console.warn("[mollie/webhook] confirmation skipped", {
            orderId,
            reason: confirmation.reason,
          });
        }
        // Conversiebrug (spec-analytics.md): server-side GA4 purchase,
        // fire-and-forget en buiten het idempotentiepad. Deze
        // !already_activated-tak is het exactly-once-signaal (rijlock +
        // statusovergang in tmc.activate_order); de helper voegt daar geen
        // eigen dedupe aan toe. Geen await — een GA4-storing mag de
        // betaalverwerking nooit blokkeren. De helper throwt zelf nooit;
        // de .catch is de laatste vangrail.
        void sendPurchaseToGa4({ orderId, amountCents }).catch((e) =>
          console.error("[mollie/webhook] sendPurchaseToGa4", e),
        );

        // Deurtoegang (spec-akiles-access.md): zelfde functie als de
        // nachtelijke cron, tweede aanroeppunt, zodat een nieuw lid niet
        // tot de volgende nacht wacht. Awaited, maar syncMembershipAccess
        // throwt nooit en zonder Akiles-configuratie doet hij niets; de
        // betaalflow kan hier niet op stuklopen.
        if (activation.membership_id) {
          const accessProfileId =
            profileId ?? (await profileIdForMembership(supabase, activation.membership_id));
          if (accessProfileId) await syncMembershipAccess(accessProfileId);
        }
      } else {
        // Retry-pad (webhook opnieuw aangeboden voor een al geactiveerde
        // order): de bevestigingsmail mag alsnog, want de poort is niet
        // deze tak maar het order.confirmation_sent-event in tmc.events.
        // Is de mail eerder wel verstuurd, dan doet de helper niets
        // (already_sent); is hij eerder mislukt (bijvoorbeeld een
        // geweigerde MailerSend-key, gezien op 2026-09-08), dan vertrekt hij
        // nu alsnog exact één keer. Zelfde meldingen als hierboven.
        const retry = await sendOrderConfirmation(orderId);
        if (retry.outcome === "sent") {
          await sendNotification(
            "Bevestigingsmail alsnog verstuurd",
            `Order ${orderId}: bevestigingsmail is bij een herhaalde webhook alsnog verstuurd.`,
            "envelope"
          );
        } else if (retry.outcome === "failed") {
          await sendNotification(
            "Bevestigingsmail niet verstuurd",
            `Order ${orderId} (retry): de bevestigingsmail naar het lid is opnieuw niet verstuurd. MailerSend checken.`,
            "warning"
          );
        }
      }

      // Subscription-order: maak de Mollie-subscription één cyclus na de
      // eerste betaling. needs_subscription is ook true op een
      // already_activated-retry waarvan het eerdere aanmaken of de write van
      // het id mislukte, dus dit is meteen het herstelpad. Drie guards (PR 1
      // webhook-betrouwbaarheid): eerst kijken of Mollie al een subscription
      // voor dit membership heeft (de idempotencyKey dekt een uur, Mollie's
      // retries lopen 26 uur), dan pas aanmaken, en de write van het id wordt
      // gecontroleerd in plaats van blind vertrouwd. De unique constraint op
      // memberships.mollie_subscription_id blijft de laatste vangrail.
      if (activation.needs_subscription && activation.mollie_customer_id) {
        const membershipId = activation.membership_id as string;
        const customerId = activation.mollie_customer_id as string;
        let subscriptionId: string | null = null;
        let reusedExisting = false;
        try {
          subscriptionId = await findExistingSubscriptionId(mollie, customerId, membershipId);
          if (subscriptionId) {
            reusedExisting = true;
            console.warn("[mollie/webhook] bestaande subscription hergebruikt", {
              orderId,
              membershipId,
              subscriptionId,
            });
          } else {
            const subStart = new Date();
            subStart.setDate(
              subStart.getDate() + activation.billing_cycle_weeks * 7
            );
            const startDateISO = subStart.toISOString().split("T")[0];

            const subscription = await mollie.customerSubscriptions.create({
              customerId,
              amount: {
                currency: "EUR",
                value: (activation.recurring_cents / 100).toFixed(2),
              },
              interval: "28 days",
              description: `TMC order ${orderId}`,
              startDate: startDateISO,
              webhookUrl: mollieWebhookUrl(mode),
              metadata: {
                membershipId,
                type: "recurring",
              },
              idempotencyKey: `order-${orderId}-sub`,
            });
            subscriptionId = subscription.id;
          }
        } catch (e) {
          // Transiënt: 500, Mollie herhaalt, en de retry loopt via
          // already_activated met needs_subscription opnieuw hier binnen;
          // findExistingSubscriptionId voorkomt dan een dubbele. Dat maakt
          // het herstelpad betrouwbaar in plaats van afhankelijk van een
          // toevallige tweede webhook. Permanent (Mollie 4xx, bv. geen
          // geldig mandaat): 200, en een mens moet ernaar kijken.
          console.error("[mollie/webhook] subscription create failed", e);
          const cls = await registerFailure({
            path: "subscription_create",
            molliePaymentId: payment.id,
            orderId,
            mode,
            error: e,
            extra: { membership_id: membershipId, mollie_customer_id: customerId },
            notify: {
              title: "Subscription aanmaken mislukt",
              message: `Order ${orderId}, membership ${membershipId}: het lid is actief en heeft betaald, maar de Mollie-subscription voor de recurring incasso is niet aangemaakt of niet te controleren. ${
                classifyFailure(e) === "transient"
                  ? "Transiënt: Mollie biedt de webhook opnieuw aan, tot 26 uur lang."
                  : `Blijvend: handmatig ingrijpen nodig. Eerst in Mollie kijken of customer ${customerId} al een subscription voor dit membership heeft, anders aanmaken, en mollie_subscription_id op de membership zetten.`
              }`,
              tags: "warning",
            },
          });
          if (cls === "transient") return retryLater("subscription_create_transient");
        }

        if (subscriptionId) {
          const { data: linked, error: linkErr } = await supabase
            .from("memberships")
            .update({ mollie_subscription_id: subscriptionId })
            .eq("id", membershipId)
            .is("mollie_subscription_id", null)
            .select("id");

          if (linkErr) {
            // De ernstigste toestand in dit pad: het abonnement bestaat bij
            // Mollie en nergens bij ons, en elke recurring-webhook valt
            // straks in "unknown subscription". Niets automatisch
            // annuleren; het id staat in het event, een mens koppelt het.
            console.error(
              "[mollie/webhook] subscription link write failed",
              { orderId, membershipId, subscriptionId },
              linkErr,
            );
            // Transiënt: 500, en de retry vindt de subscription terug via
            // findExistingSubscriptionId en koppelt hem alsnog. Permanent
            // (bv. 23505: het id hangt al aan een andere membership): 200.
            const cls = await registerFailure({
              path: "subscription_link_write",
              molliePaymentId: payment.id,
              orderId,
              mode,
              error: linkErr,
              extra: {
                subscription_id: subscriptionId,
                membership_id: membershipId,
                mollie_customer_id: customerId,
                reused_existing: reusedExisting,
              },
              notify: {
                title: "Subscription niet gekoppeld",
                message: `Order ${orderId}, membership ${membershipId}: Mollie-subscription ${subscriptionId} bestaat op customer ${customerId}, maar mollie_subscription_id kon niet worden weggeschreven. ${
                  classifyFailure(linkErr) === "transient"
                    ? "Transiënt: Mollie biedt de webhook opnieuw aan en de retry koppelt het bestaande id."
                    : "Blijvend: handmatig op de membership zetten; NIET opnieuw aanmaken."
                }`,
                tags: "warning",
              },
            });
            if (cls === "transient") return retryLater("subscription_link_write_transient");
          } else if ((linked?.length ?? 0) === 0) {
            // Geen rij bijgewerkt: er stond al een id. Hetzelfde id is een
            // onschuldige race met een parallelle levering; een ander id
            // betekent twee subscriptions op één mandaat.
            const { data: current } = await supabase
              .from("memberships")
              .select("mollie_subscription_id")
              .eq("id", membershipId)
              .maybeSingle();
            const existingId =
              (current as { mollie_subscription_id: string | null } | null)
                ?.mollie_subscription_id ?? null;
            if (existingId && existingId !== subscriptionId) {
              // Permanent: herhalen verandert hier niets aan; 200.
              await registerFailure({
                path: "subscription_link_write",
                molliePaymentId: payment.id,
                orderId,
                mode,
                error: new Error("membership already linked to another subscription"),
                classification: "permanent",
                extra: {
                  subscription_id: subscriptionId,
                  existing_subscription_id: existingId,
                  membership_id: membershipId,
                  mollie_customer_id: customerId,
                },
                notify: {
                  title: "Twee subscriptions op één membership",
                  message: `Order ${orderId}, membership ${membershipId} is gekoppeld aan ${existingId}, maar Mollie heeft op customer ${customerId} ook ${subscriptionId}. Een van de twee handmatig annuleren in Mollie.`,
                  tags: "warning",
                },
              });
            }
          } else if (reusedExisting) {
            await sendNotification(
              "Bestaande subscription alsnog gekoppeld",
              `Order ${orderId}, membership ${membershipId}: Mollie had al subscription ${subscriptionId}; die is nu gekoppeld in plaats van een tweede aan te maken.`,
              "envelope"
            );
          }
        }
      }

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
