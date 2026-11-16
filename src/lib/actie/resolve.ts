import "server-only";
import { readTrialCodeCookie } from "@/lib/trial-codes/server";
import { lookupUsableTrialCodeScope } from "@/lib/trial-codes/lookup";
import type { TrialCodeScope } from "@/lib/trial-codes/scope";
import { displayScopeFor } from "./core";
import { readActieLanding, type CampaignLanding } from "./lookup";

/**
 * Welke code geldt voor deze bezoeker in de codeflow, en via welke weg
 * (spec-proefles-funnel.md, B1). Twee bronnen:
 *
 * 1. Het proefcode-cookie: de bezoeker heeft zelf een code ingevoerd (of komt
 *    van de yoga-quiz). Dat is de bestaande flow en die gaat voor.
 * 2. Het actie-cookie tmc_actie: de bezoeker kwam via een actiepagina. De
 *    code hangt server-side aan de slug en wordt hier opgezocht.
 *
 * Is het proefcode-cookie er wel maar de code niet meer bruikbaar, dan geldt
 * de actie (als die er is). De pagina (/proefles/code) en de boekingsactie
 * gebruiken dezelfde volgorde, zodat wat de bezoeker ziet ook is wat er
 * geboekt wordt.
 */

/** Voor de pagina: wat tonen we? Bevat bewust geen code voor de actieweg. */
export type CodeFlowView =
  | { via: "cookie"; code: string; scope: TrialCodeScope }
  | { via: "actie"; slug: string; scope: TrialCodeScope };

export async function resolveCodeFlowView(): Promise<CodeFlowView | null> {
  const cookieCode = await readTrialCodeCookie();
  if (cookieCode) {
    const scope = await lookupUsableTrialCodeScope(cookieCode);
    if (scope) return { via: "cookie", code: cookieCode, scope };
  }
  const landing = await readActieLanding();
  if (!landing) return null;
  // Het pijlerfilter van de slug versmalt alleen de weergave; de RPC beslist
  // op de scope van de code.
  return {
    via: "actie",
    slug: landing.slug,
    scope: displayScopeFor(landing.codeScope, landing.pillarFilter),
  };
}

/**
 * Voor de boekingsactie: de code voor tmc.redeem_trial_code plus de slug voor
 * p_campaign_slug. De slug gaat mee zodra er een geldig actie-cookie is, ook
 * als de bezoeker daarna zelf een code invoerde: de RPC schrijft hem alleen
 * weg als hij bij de ingewisselde code hoort. Null = geen gratis pad.
 *
 * LET OP: de code in dit resultaat mag alleen naar de RPC.
 */
export async function resolveBookingCode(): Promise<{
  code: string;
  slug: string | null;
} | null> {
  const [cookieCode, landing] = await Promise.all([readTrialCodeCookie(), readActieLanding()]);
  if (cookieCode && landing) {
    // Beide aanwezig: zelfde voorrang als de pagina. Alleen in dit geval een
    // extra opzoeking; zonder actie-cookie blijft het pad zoals het was (de
    // RPC beslist en een ongeldige code telt als misser).
    const usable = await lookupUsableTrialCodeScope(cookieCode);
    return { code: usable ? cookieCode : landing.code, slug: landing.slug };
  }
  if (cookieCode) return { code: cookieCode, slug: null };
  if (landing) return { code: landing.code, slug: landing.slug };
  return null;
}

export type { CampaignLanding };
