/**
 * De publieke basis-URL van déze deployment. Op preview gebruiken we
 * Vercel's automatisch geïnjecteerde VERCEL_URL (de unieke hostname van
 * dít deployment), zodat een Mollie-redirect/webhook-URL die vanaf een
 * preview wordt aangemaakt ook naar die preview terugwijst — niet naar
 * NEXT_PUBLIC_SITE_URL, die op alle omgevingen (inclusief preview) op de
 * productie-URL staat. Op production/development blijft NEXT_PUBLIC_SITE_URL
 * leidend, met de bestaande hardcoded fallback als noodgreep.
 */
export function siteUrl(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.themovementclub.nl";
}
