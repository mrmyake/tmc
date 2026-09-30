/**
 * Staf-herkansing van een gastcheckout-intent (besluit 7, PR 2): draait de
 * conversie plus de activatieketen opnieuw voor één intent, inline, met
 * dezelfde kern als de webhook en de uurlijkse reconciliatie. Bedoeld voor
 * scherm 7 ("betaald maar niet afgerond") nadat de oorzaak is weggenomen,
 * bijvoorbeeld een order_conflict die is opgelost of een GoTrue-storing.
 *
 * Gebruik (vanuit de repo-root, met de productie- of preview-env geladen):
 *   npx tsx scripts/checkout/retry-intent.ts <intent-id>
 *
 * Leest de intent, haalt de betaling op bij Mollie in de modus van de
 * intent, en roept processCheckoutIntentPayment aan. Print alleen id's,
 * statussen en codes; nooit e-mail of naam.
 */
import { createClient } from "@supabase/supabase-js";
import { getMollieClient } from "../../src/lib/mollie";
import { processCheckoutIntentPayment } from "../../src/lib/checkout/intent-webhook";

async function main() {
  const intentId = process.argv[2];
  if (!intentId || !/^[0-9a-f-]{36}$/i.test(intentId)) {
    console.error("Gebruik: npx tsx scripts/checkout/retry-intent.ts <intent-id>");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn vereist.");
    process.exit(1);
  }
  const admin = createClient(url, key, {
    db: { schema: process.env.DB_SCHEMA ?? "tmc" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: intent, error } = await admin
    .from("checkout_intents")
    .select("id, status, mode, mollie_payment_id, conversion_error, paid_at")
    .eq("id", intentId)
    .maybeSingle();
  if (error || !intent) {
    console.error("Intent niet gevonden", error?.code ?? "");
    process.exit(1);
  }
  console.log("Intent", { id: intent.id, status: intent.status, mode: intent.mode, conversion_error: intent.conversion_error, paid_at: intent.paid_at });
  if (!intent.mollie_payment_id) {
    console.error("Intent heeft geen betaling; niets te herkansen.");
    process.exit(1);
  }
  const mollie = getMollieClient(intent.mode);
  if (!mollie) {
    console.error(`Mollie-client voor modus ${intent.mode} niet beschikbaar in deze omgeving.`);
    process.exit(1);
  }
  const payment = await mollie.payments.get(intent.mollie_payment_id);
  console.log("Betaling", { id: payment.id, status: payment.status, paidAt: payment.paidAt ?? null });

  const result = await processCheckoutIntentPayment({
    admin,
    mollie,
    mode: intent.mode,
    intentId: intent.id,
    payment: {
      id: payment.id,
      status: payment.status,
      paidAt: payment.paidAt ?? null,
      amountCents: Math.round(parseFloat(payment.amount.value) * 100),
    },
    caller: { source: "retry_intent_script", actorType: "system" },
  });
  // Nooit het inlogtoken naar de console: dat hoort alleen in de welkomstmail.
  const outcome: Record<string, unknown> = { ...result.outcome };
  delete outcome.loginToken;
  console.log("Uitkomst", outcome);
  if (result.activation) console.log("Activatie", result.activation);
}

main().catch((e) => {
  console.error("retry-intent faalde", (e as { code?: string })?.code ?? e);
  process.exit(1);
});
