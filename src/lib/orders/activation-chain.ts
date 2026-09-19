import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SubscriptionStatus, type MollieClient } from "@mollie/api-client";
import type { MollieMode } from "@/lib/mollie";
import { mollieWebhookUrl } from "@/lib/site-url";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { sendOrderConfirmation } from "@/lib/orders/order-confirmation";
import { sendPurchaseToGa4 } from "@/lib/orders/ga-purchase";
import { syncMembershipAccess } from "@/lib/access/sync";
import {
  classifyFailure,
  registerFailure,
  type ActivationSource,
} from "./activation-failure";

/**
 * De activatieketen van een orderbetaling: tmc.activate_order() plus alles
 * wat daarna hoort te gebeuren. In PR 3a uit src/app/api/mollie/webhook/
 * route.ts getild zonder gedragswijziging, zodat PR 3b hem vanuit de
 * reconciliatie in expire-orders kan aanroepen zonder binnenkomend
 * webhookverzoek. Volgorde, poorten, registraties en de
 * at-most-once-keuzes voor ntfy en order.activated zijn exact die van de
 * webhook; zie de comments per stap.
 *
 * Context van de aanroeper (ActivationCaller): `source` zegt wie aanroept
 * en landt op webhook.failed als payload.source; `actorType` is voor beide
 * aanroepers "system", want geen van beide is een mens. Een cron-aanroep is
 * dus herkenbaar aan source, niet aan actor_type, zelfde patroon als
 * `via: "cron_reconcile"` op de trial-reconciliatie. De keten leest niets
 * uit een Request: modus, clients en payment-gegevens komen als invoer.
 *
 * Uitkomst: `retry` betekent "transiënte fout, later opnieuw"; de webhook
 * vertaalt dat naar een 500 zodat Mollie herhaalt, een cron naar "volgende
 * run". Alles wat verwerkt is of waarvan herhaling dezelfde uitkomst geeft
 * is `ok`, met `step` als toelichting.
 *
 * Meting (PR 3a): de keten logt per stap de duur in milliseconden als één
 * console.info-regel, zodat de eerste test-mode-betaling op een preview de
 * echte cijfers oplevert tegenover Mollie's timeout van 15 seconden.
 */

export interface ActivationCaller {
  source: ActivationSource;
  actorType: "system";
}

export interface ActivationInput {
  supabase: SupabaseClient;
  mollie: MollieClient;
  mode: MollieMode;
  orderId: string;
  payment: { id: string; amountCents: number };
  /** Uit de Mollie-metadata (webhook) of uit de order-rij (cron); null als onbekend. */
  profileId: string | null;
}

export type ActivationResult =
  | {
      outcome: "ok";
      step:
        | "activated"
        | "already_activated"
        | "retry_of_blocked"
        | "blocked"
        | "rpc_error_permanent";
    }
  | { outcome: "retry"; reason: string };

/** Profiel achter een membership, voor de toegangssync als de aanroeper geen profileId heeft. */
async function profileIdForMembership(
  supabase: SupabaseClient,
  membershipId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("memberships")
    .select("profile_id")
    .eq("id", membershipId)
    .maybeSingle();
  return (data as { profile_id: string } | null)?.profile_id ?? null;
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

/** Stopwatch per stap; alleen voor de timing-log, geen invloed op gedrag. */
function stepTimer() {
  const startedAt = Date.now();
  let last = startedAt;
  const steps: Record<string, number> = {};
  return {
    mark(name: string) {
      const now = Date.now();
      steps[name] = (steps[name] ?? 0) + (now - last);
      last = now;
    },
    report(extra: Record<string, unknown>) {
      console.info("[activation-chain] timing", {
        ...extra,
        total_ms: Date.now() - startedAt,
        steps_ms: steps,
      });
    },
  };
}

export async function runActivationChain(
  caller: ActivationCaller,
  input: ActivationInput,
): Promise<ActivationResult> {
  const { supabase, mollie, mode, orderId, payment, profileId } = input;
  const { source } = caller;
  const amountCents = payment.amountCents;
  const timer = stepTimer();

  // Order pipeline: activate_order (service-role only, idempotent onder een
  // rijlock in tmc.activate_order()). De aanroeper heeft al vastgesteld dat
  // de payment 'paid' is en bij deze order hoort.
  const { data: activation, error: activateErr } = await supabase.rpc(
    "activate_order",
    { p_order_id: orderId, p_mollie_payment_id: payment.id }
  );
  timer.mark("activate_order");

  if (activateErr || !activation) {
    console.error("[activation-chain] activate_order failed", activateErr);
    const error = activateErr ?? new Error("activate_order returned null");
    const cls = classifyFailure(error);
    await registerFailure({
      source,
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
            ? "transiënt, wordt opnieuw geprobeerd"
            : "blijvend, geen retry"
        }). Betaling is binnen; handmatig naklopen als het niet vanzelf herstelt.`,
        tags: "warning",
      },
    });
    if (cls === "transient") return { outcome: "retry", reason: "activate_order_transient" };
    return { outcome: "ok", step: "rpc_error_permanent" };
  }

  if (!activation.ok) {
    // Retry op een eerder geblokkeerde order: activate_order zette die
    // toen al op 'paid' met blocked_reason en de eerste aanroep meldde dat
    // via ntfy. Een herhaling krijgt nu invalid_status/paid terug. Dat is
    // al verwerkt, geen nieuwe weigering, dus geen tweede melding.
    if (activation.reason === "invalid_status" && activation.status === "paid") {
      console.warn("[activation-chain] retry op geblokkeerde order", {
        source,
        orderId,
        paymentId: payment.id,
      });
      return { outcome: "ok", step: "retry_of_blocked" };
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
    return { outcome: "ok", step: "blocked" };
  }

  if (activation.late_payment) {
    // late_payment dekt sinds migratie 20260724 ook een gehonoreerde
    // betaling op een geannuleerd betaalverzoek (betaling wint altijd).
    await sendNotification(
      "Order geactiveerd na verlopen deadline of annulering",
      `Order ${orderId}: betaling kwam binnen nadat de link verlopen of geannuleerd was, en is gehonoreerd.`,
      "warning"
    );
    timer.mark("ntfy_late_payment");
  }

  if (!activation.already_activated) {
    // Vijf zijeffecten, allemaal throw-vrij per contract. De poort voor
    // ntfy en order.activated is uitsluitend deze tak (at-most-once bij een
    // crash na de commit van activate_order, bewust geaccepteerd); de
    // bevestigingsmail heeft zijn eigen poort (order.confirmation_sent),
    // GA4 is by design at-most-once, en Akiles heeft de nachtelijke sync
    // als vangnet. Zie de PR-body van #193, stap 0.
    //
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
    timer.mark("ntfy_activated");
    await emitEvent({
      type: "order.activated",
      actorType: caller.actorType,
      subjectType: "order",
      subjectId: orderId,
      payload: {
        profile_id: profileId ?? null,
        order_id: orderId,
        membership_id: activation.membership_id,
        payment_id: payment.id,
      },
    });
    timer.mark("event_order_activated");

    // Bevestigingsmail naar het lid (spec-facturatie.md, sectie
    // "Bevestigingsmail na betaling"): exact één keer per order, met
    // tmc.events (order.confirmation_sent) als poort. Awaited zodat het
    // event geschreven is voor de aanroeper eindigt, maar de helper
    // throwt nooit en een mislukte mail verandert niets aan de
    // activatie of aan de uitkomst; alleen een ntfy zodat iemand het ziet.
    const confirmation = await sendOrderConfirmation(orderId);
    if (confirmation.outcome === "failed") {
      await sendNotification(
        "Bevestigingsmail niet verstuurd",
        `Order ${orderId} is geactiveerd, maar de bevestigingsmail naar het lid is niet verstuurd. Handmatig nasturen of MailerSend checken.`,
        "warning"
      );
    } else if (confirmation.outcome === "skipped") {
      console.warn("[activation-chain] confirmation skipped", {
        orderId,
        reason: confirmation.reason,
      });
    }
    timer.mark("confirmation_mail");
    // Conversiebrug (spec-analytics.md): server-side GA4 purchase,
    // fire-and-forget en buiten het idempotentiepad. Deze
    // !already_activated-tak is het exactly-once-signaal (rijlock +
    // statusovergang in tmc.activate_order); de helper voegt daar geen
    // eigen dedupe aan toe. Geen await — een GA4-storing mag de
    // betaalverwerking nooit blokkeren. De helper throwt zelf nooit;
    // de .catch is de laatste vangrail.
    void sendPurchaseToGa4({ orderId, amountCents }).catch((e) =>
      console.error("[activation-chain] sendPurchaseToGa4", e),
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
    timer.mark("akiles_sync");
  } else {
    // Retry-pad (aanroep voor een al geactiveerde order): de
    // bevestigingsmail mag alsnog, want de poort is niet deze tak maar het
    // order.confirmation_sent-event in tmc.events. Is de mail eerder wel
    // verstuurd, dan doet de helper niets (already_sent); is hij eerder
    // mislukt (bijvoorbeeld een geweigerde MailerSend-key, gezien op
    // 2026-09-08), dan vertrekt hij nu alsnog exact één keer.
    const retry = await sendOrderConfirmation(orderId);
    if (retry.outcome === "sent") {
      await sendNotification(
        "Bevestigingsmail alsnog verstuurd",
        `Order ${orderId}: bevestigingsmail is bij een herhaalde verwerking alsnog verstuurd.`,
        "envelope"
      );
    } else if (retry.outcome === "failed") {
      await sendNotification(
        "Bevestigingsmail niet verstuurd",
        `Order ${orderId} (retry): de bevestigingsmail naar het lid is opnieuw niet verstuurd. MailerSend checken.`,
        "warning"
      );
    }
    timer.mark("confirmation_mail_retry");
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
        console.warn("[activation-chain] bestaande subscription hergebruikt", {
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
      // Transiënt: retry, en de herhaling loopt via already_activated met
      // needs_subscription opnieuw hier binnen; findExistingSubscriptionId
      // voorkomt dan een dubbele. Dat maakt het herstelpad betrouwbaar in
      // plaats van afhankelijk van een toevallige tweede webhook.
      // Permanent (Mollie 4xx, bv. geen geldig mandaat): ok, en een mens
      // moet ernaar kijken.
      console.error("[activation-chain] subscription create failed", e);
      const cls = await registerFailure({
        source,
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
              ? "Transiënt: wordt opnieuw geprobeerd, tot 26 uur lang."
              : `Blijvend: handmatig ingrijpen nodig. Eerst in Mollie kijken of customer ${customerId} al een subscription voor dit membership heeft, anders aanmaken, en mollie_subscription_id op de membership zetten.`
          }`,
          tags: "warning",
        },
      });
      timer.mark("subscription");
      if (cls === "transient") return { outcome: "retry", reason: "subscription_create_transient" };
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
          "[activation-chain] subscription link write failed",
          { orderId, membershipId, subscriptionId },
          linkErr,
        );
        // Transiënt: retry, en de herhaling vindt de subscription terug via
        // findExistingSubscriptionId en koppelt hem alsnog. Permanent
        // (bv. 23505: het id hangt al aan een andere membership): ok.
        const cls = await registerFailure({
          source,
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
                ? "Transiënt: wordt opnieuw geprobeerd en de herhaling koppelt het bestaande id."
                : "Blijvend: handmatig op de membership zetten; NIET opnieuw aanmaken."
            }`,
            tags: "warning",
          },
        });
        timer.mark("subscription");
        if (cls === "transient") return { outcome: "retry", reason: "subscription_link_write_transient" };
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
          // Permanent: herhalen verandert hier niets aan.
          await registerFailure({
            source,
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
    timer.mark("subscription");
  }

  timer.report({
    source,
    orderId,
    already_activated: Boolean(activation.already_activated),
    needs_subscription: Boolean(activation.needs_subscription),
  });
  return {
    outcome: "ok",
    step: activation.already_activated ? "already_activated" : "activated",
  };
}
