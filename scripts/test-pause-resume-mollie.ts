/**
 * Mollie-laag-bewijs voor de pauze/hervat-primitieven (lifecycle fase 1,
 * migratie 20260725000000_lifecycle_pause_primitives.sql).
 *
 * Bewijst tegen de Mollie-TEST-API, met de echte helpers uit src/lib/mollie.ts
 * (dezelfde code die src/lib/admin/membership-lifecycle.ts aanroept):
 *  1. hasValidMollieMandate is false zonder mandaat (herautorisatie-pad);
 *  2. na het aanmaken van een SEPA-testmandaat is hij true;
 *  3. createMollieRecurringSubscription met dezelfde idempotencyKey levert
 *     twee keer DEZELFDE subscription op (dubbelklik mint nooit een tweede
 *     incasso), op het BESTAANDE mandaat en de BESTAANDE customer;
 *  4. cancelMollieSubscription is idempotent (tweede aanroep ook true);
 *  5. na mandates.revoke is hasValidMollieMandate weer false: hervatten zou
 *     dan de expliciete herautorisatie-staat zetten en NOOIT stil een nieuwe
 *     subscription maken.
 * Cleanup: de test-customer wordt aan het einde verwijderd.
 *
 * Draaien: MOLLIE_API_KEY=test_... npx tsx scripts/test-pause-resume-mollie.ts
 *
 * WAARGENOMEN op 2026-07-12 (test mode, customer daarna verwijderd):
 *   customer aangemaakt: cst_eCbQQkB8mZ
 *   mandate before: false
 *   mandate aangemaakt: mdt_tLycM4ydhc status: valid
 *   mandate after create: true
 *   sub1: sub_zVLSRdTJP5 sub2: sub_zVLSRdTJP5 same: true
 *   sub info: { status: 'active', nextPaymentDate: '2026-08-09' }
 *   cancel1: true
 *   cancel2: true
 *   info na cancel: { status: 'canceled', nextPaymentDate: null }
 *   mandate after revoke: false
 *   cleanup done (customer verwijderd)
 */
import {
  cancelMollieSubscription,
  createMollieRecurringSubscription,
  getMollieClient,
  getMollieSubscriptionInfo,
  hasValidMollieMandate,
} from "../src/lib/mollie";
import { MandateMethod } from "@mollie/api-client";

function isoDatePlusDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function main() {
  const mollie = getMollieClient();
  if (!mollie) throw new Error("MOLLIE_API_KEY ontbreekt (test-key vereist)");
  if (!process.env.MOLLIE_API_KEY?.startsWith("test_")) {
    throw new Error("Weiger te draaien zonder test-key (live-key gedetecteerd)");
  }

  // 1. Wegwerp-customer.
  const customer = await mollie.customers.create({
    name: "Racetest Pauze",
    email: "racetest-pauze@example.com",
  });
  console.log("customer aangemaakt:", customer.id);

  try {
    // 2. Zonder mandaat: hervatten zou geblokkeerd worden.
    console.log("mandate before:", await hasValidMollieMandate(customer.id));

    // 3. SEPA-testmandaat via de Mandates API (test mode).
    const mandate = await mollie.customerMandates.create({
      customerId: customer.id,
      method: MandateMethod.directdebit,
      consumerName: "Racetest Pauze",
      consumerAccount: "NL55INGB0000000000",
    });
    console.log("mandate aangemaakt:", mandate.id, "status:", mandate.status);
    console.log("mandate after create:", await hasValidMollieMandate(customer.id));

    // 4. Subscription op het bestaande mandaat; idempotencyKey twee keer.
    const params = {
      customerId: customer.id,
      amountCents: 10000,
      intervalDays: 28,
      startDate: isoDatePlusDays(28),
      description: "TMC racetest hervatting",
      membershipId: "racetest-membership",
      idempotencyKey: `resume-racetest-${Date.now()}`,
      webhookUrl: "https://www.themovementclub.nl/api/mollie/webhook",
    };
    const sub1 = await createMollieRecurringSubscription(params);
    const sub2 = await createMollieRecurringSubscription(params);
    console.log(
      "sub1:", sub1?.id, "sub2:", sub2?.id,
      "same:", Boolean(sub1 && sub2 && sub1.id === sub2.id),
    );
    if (!sub1 || !sub2 || sub1.id !== sub2.id) {
      throw new Error("Idempotentie-invariant geschonden: twee verschillende subscriptions");
    }
    console.log("sub info:", await getMollieSubscriptionInfo(customer.id, sub1.id));

    // 5. Annuleren, idempotent.
    console.log("cancel1:", await cancelMollieSubscription(customer.id, sub1.id));
    console.log("cancel2:", await cancelMollieSubscription(customer.id, sub1.id));
    console.log("info na cancel:", await getMollieSubscriptionInfo(customer.id, sub1.id));

    // 6. Mandaat intrekken: het herautorisatie-pad.
    await mollie.customerMandates.revoke(mandate.id, { customerId: customer.id });
    console.log("mandate after revoke:", await hasValidMollieMandate(customer.id));
  } finally {
    // 7. Cleanup: wegwerp-customer verwijderen.
    await mollie.customers.delete(customer.id);
    console.log("cleanup done (customer verwijderd)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
