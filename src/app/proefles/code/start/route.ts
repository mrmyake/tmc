import { NextResponse } from "next/server";
import { lookupUsableTrialCodeScope } from "@/lib/trial-codes/lookup";
import { setTrialCodeCookie } from "@/lib/trial-codes/server";
import { resolveQuizStart } from "@/lib/yoga-test/start";

// Dynamisch: zet een cookie en leest de database. Nooit prefetchen of cachen.
export const dynamic = "force-dynamic";

/**
 * GET /proefles/code/start?quiz=yoga&les=<class_type_id>[&tijd=...]
 *
 * Startroute van de yoga-quiz (spec-yoga-test.md). De code zelf staat nooit
 * in de URL: de beslislogica (src/lib/yoga-test/start.ts) zoekt hem in een
 * server-side allowlist. Bruikbare code: bestaand ondertekend cookie via
 * dezelfde helper als de codestap, daarna naar /proefles/code met de les
 * voorgeselecteerd. Anders naar de betaalde kaart. Geen teller: er wordt
 * alleen een vaste, publiek getoonde code gecontroleerd.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = await resolveQuizStart(url.searchParams, {
    lookupScope: lookupUsableTrialCodeScope,
    setCookie: setTrialCodeCookie,
  });
  const response = NextResponse.redirect(new URL(target, url.origin), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
