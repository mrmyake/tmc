import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { attributionQuery, parseAttribution } from "@/lib/attribution/params";
import { lookupCampaignLanding } from "@/lib/actie/lookup";
import { setActieCookie } from "@/lib/actie/cookie";
import { TRIAL_CODE_COOKIE, clientIp } from "@/lib/trial-codes/server";

// Dynamisch: zet een cookie en leest de database. Nooit prefetchen of cachen.
export const dynamic = "force-dynamic";

function go(origin: string, path: string, attr: string, status: 303 | 307): NextResponse {
  const target = attr ? `${path}${path.includes("?") ? "&" : "?"}${attr}` : path;
  const response = NextResponse.redirect(new URL(target, origin), status);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * GET /actie/[slug]/start (spec-proefles-funnel.md)
 *
 * De knop "Kies je gratis les". Zoekt de slug opnieuw op, controleert
 * server-side dat de gekoppelde code nu bruikbaar is en zet dan het
 * ondertekende cookie tmc_actie met alleen de slug. De code zelf komt nooit
 * in de URL, een cookie, een header of de HTML (B1): /proefles/code en de
 * boekingsactie zoeken hem bij elk gebruik opnieuw op via de slug.
 *
 * - Niet (meer) bruikbaar, of het cookie kan niet gezet worden: 307 naar
 *   /proefles.
 * - IP op slot door te veel foute codes: ook naar /proefles. Deze route telt
 *   zelf niet mee op de teller (B15): de bezoeker voert hier geen code in, dus
 *   er valt niets te raden.
 * - Een eerder ingevoerd proefcode-cookie wordt gewist, zodat de actie geldt
 *   en niet een oude code.
 * - Attributieparameters (gclid, gbraid, wbraid, fbclid, utm_*, lp) gaan
 *   ongewijzigd mee naar de boekingsstap (B11).
 * - Het pijlerfilter van de slug staat niet in de URL: /proefles/code leest
 *   het server-side uit het cookie.
 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const url = new URL(request.url);
  const { slug } = await ctx.params;
  const attr = attributionQuery(parseAttribution(url.searchParams));

  const landing = await lookupCampaignLanding(slug);
  if (!landing) return go(url.origin, "/proefles", attr, 307);

  // Slotcheck per IP (alleen lezen): staat dit IP op slot na te veel foute
  // codes, dan geen gratis pad via een omweg. Een fout in de check zelf
  // blokkeert de bezoeker niet; de boekingsactie controleert opnieuw.
  const admin = createAdminClient();
  const { data: attempt, error: attemptErr } = await admin.rpc("register_trial_code_attempt", {
    p_ip: await clientIp(),
  });
  if (attemptErr) {
    console.error("[actie/start] register_trial_code_attempt failed", attemptErr);
  } else if (!(attempt as { allowed?: boolean } | null)?.allowed) {
    return go(url.origin, "/proefles", attr, 307);
  }

  if (!(await setActieCookie(landing.slug))) {
    console.error("[actie/start] cookie niet gezet (geen signeersleutel)");
    return go(url.origin, "/proefles", attr, 307);
  }
  (await cookies()).delete(TRIAL_CODE_COOKIE);

  return go(url.origin, "/proefles/code", attr, 303);
}
