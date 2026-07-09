/**
 * De publieke basis-URL van déze deployment. Op preview gebruiken we
 * Vercel's stabiele branch-alias (VERCEL_BRANCH_URL): dezelfde hostname als
 * de preview-URL die in de browser gebruikt wordt, dus een Mollie-
 * redirect/webhook-URL die vanaf een preview wordt aangemaakt wijst naar
 * dezelfde host als waar de sessie-cookie geldig is (VERCEL_URL is uniek per
 * deployment en veroorzaakte precies dat mismatch, zie git-historie).
 * VERCEL_URL blijft de noodgreep als de branch-alias er onverhoopt niet is.
 * Op production/development blijft NEXT_PUBLIC_SITE_URL leidend, met de
 * bestaande hardcoded fallback als noodgreep.
 */
export function siteUrl(): string {
  if (process.env.VERCEL_ENV === "preview") {
    const previewHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (previewHost) return `https://${previewHost}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.themovementclub.nl";
}

/**
 * De Mollie-webhook-URL voor déze deployment. Op preview blokkeert Vercel's
 * Deployment Protection standaard alle server-naar-server-verkeer (dus ook
 * Mollie's webhook-callback) met een SSO-redirect; Mollie kan die
 * interactieve login niet doorlopen, dus de callback komt nooit aan. De
 * Protection Bypass for Automation query-param (x-vercel-protection-bypass,
 * VERCEL_AUTOMATION_BYPASS_SECRET) slaat die muur over voor precies deze
 * aanroep. Op production staat Deployment Protection niet aan, dus daar
 * blijft de URL ongewijzigd (en ontbreekt de env var doorgaans toch).
 */
export function mollieWebhookUrl(): string {
  const base = `${siteUrl()}/api/mollie/webhook`;
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    return `${base}?x-vercel-protection-bypass=${process.env.VERCEL_AUTOMATION_BYPASS_SECRET}`;
  }
  return base;
}
