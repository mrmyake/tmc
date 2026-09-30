import "server-only";

/**
 * Uitrolvlag voor de gastcheckout ("betalen voor account", PR 2). Server-only
 * en per aanroep gelezen (patroon van getDeletionConfig), dus omzetten
 * zonder rebuild en nooit in de clientbundel.
 *
 *   CHECKOUT_GUEST_ENABLED=1  aan
 *   CHECKOUT_GUEST_ENABLED=0  uit
 *   niet gezet               aan op preview, uit op production en lokaal
 *
 * Alleen het STARTEN van een gastcheckout zit achter de vlag: de
 * gastcheckout-action, de retry-action (nieuwe betaling op een intent) en
 * het testformulier /dev/gastcheckout. De webhooktak, /welkom/[token] en de
 * publieke bedankpagina's werken ongeacht de vlag en doen alleen iets met
 * een geldig token: een intent die met de vlag aan is betaald moet ook na
 * het omzetten converteren, het lid moet kunnen inloggen en zijn status
 * zien. Met de vlag uit ontstaan er geen nieuwe intents, dus blijft
 * productie op het bestaande OTP-first pad.
 */
export function isGuestCheckoutEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CHECKOUT_GUEST_ENABLED;
  if (raw === "1") return true;
  if (raw === "0") return false;
  return env.VERCEL_ENV === "preview";
}
