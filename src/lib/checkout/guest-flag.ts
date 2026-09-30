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
 * Elke nieuwe publieke ingang controleert dit: de server actions,
 * /welkom/[token] en de publieke bedankpagina's. De webhooktak bewust niet:
 * een intent die met de vlag aan is betaald, moet ook na het omzetten van de
 * vlag nog geconverteerd worden (geld is binnen). Met de vlag uit ontstaan
 * er geen nieuwe intents, dus blijft productie op het bestaande OTP-first pad.
 */
export function isGuestCheckoutEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CHECKOUT_GUEST_ENABLED;
  if (raw === "1") return true;
  if (raw === "0") return false;
  return env.VERCEL_ENV === "preview";
}
