import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { exchangeAuthorizationCode } from "@/lib/akiles";
import { emitEvent } from "@/lib/events/emit";
import {
  OAUTH_COOKIE_PATH,
  OAUTH_STATE_COOKIE,
  escapeHtml,
  htmlPage,
  requireAdminGate,
  requireProductionResponse,
} from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Stap 2 van de eenmalige Akiles-autorisatie. Vergelijkt de state met de
 * cookie, wisselt de code in en slaat access en refresh token op in
 * tmc.akiles_oauth_token. Logt nooit een tokenwaarde; de code en de state
 * verschijnen ook niet in de output.
 */
export async function GET(req: Request): Promise<Response> {
  const gate = await requireAdminGate();
  if (!gate.ok) return gate.response;
  const notProduction = requireProductionResponse();
  if (notProduction) return notProduction;

  const url = new URL(req.url);
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value ?? null;
  // Cookie altijd wissen: eenmalig gebruik, geslaagd of niet.
  cookieStore.set({
    name: OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: 0,
  });

  const providerError = url.searchParams.get("error");
  if (providerError) {
    const description = url.searchParams.get("error_description") ?? "";
    console.error("[akiles-oauth] provider weigerde", { error: providerError });
    return htmlPage(
      // COPY: confirm met Marlon
      "Akiles-koppeling niet gelukt",
      // COPY: confirm met Marlon
      `<p>Akiles gaf een fout terug (${escapeHtml(providerError)}${description ? `: ${escapeHtml(description)}` : ""}).</p><p>Start de koppeling opnieuw via <a href="/api/akiles/oauth/start">/api/akiles/oauth/start</a>.</p>`,
      400,
    );
  }

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !expectedState || !statesMatch(state, expectedState)) {
    console.error("[akiles-oauth] state komt niet overeen of ontbreekt");
    return htmlPage(
      // COPY: confirm met Marlon
      "Akiles-koppeling afgebroken",
      // COPY: confirm met Marlon
      `<p>De beveiligingscode van deze poging klopt niet of is verlopen (na 15 minuten).</p><p>Start de koppeling opnieuw via <a href="/api/akiles/oauth/start">/api/akiles/oauth/start</a>.</p>`,
      400,
    );
  }
  if (!code) {
    return htmlPage(
      // COPY: confirm met Marlon
      "Akiles-koppeling afgebroken",
      // COPY: confirm met Marlon
      `<p>Er kwam geen autorisatiecode terug van Akiles.</p><p>Start de koppeling opnieuw via <a href="/api/akiles/oauth/start">/api/akiles/oauth/start</a>.</p>`,
      400,
    );
  }

  try {
    await exchangeAuthorizationCode(code);
  } catch (err) {
    // De code is eenmalig en verloopt na 15 minuten; opnieuw proberen met
    // dezelfde code heeft geen zin.
    console.error(
      "[akiles-oauth] code inwisselen mislukt",
      err instanceof Error ? err.message : String(err),
    );
    return htmlPage(
      // COPY: confirm met Marlon
      "Akiles-koppeling niet gelukt",
      // COPY: confirm met Marlon
      `<p>De autorisatiecode kon niet worden ingewisseld. Een code is eenmalig en verloopt na 15 minuten.</p><p>Start de koppeling opnieuw via <a href="/api/akiles/oauth/start">/api/akiles/oauth/start</a>. Blijft dit misgaan, controleer dan AKILES_CLIENT_ID, AKILES_CLIENT_SECRET en de geregistreerde redirect-URL in het Akiles Developer Center.</p>`,
      502,
    );
  }

  await emitEvent({
    type: "access.oauth_authorized",
    actorType: "admin",
    actorId: gate.userId,
    subjectType: "profile",
    subjectId: gate.userId,
    payload: {},
  });

  return htmlPage(
    // COPY: confirm met Marlon
    "Akiles gekoppeld",
    // COPY: confirm met Marlon
    `<p>De toegangskoppeling heeft nu een geldig refresh token. De nachtelijke sync en de directe sync na een nieuw abonnement werken vanaf nu.</p><p>Wil je meteen alles doorzetten, draai dan de sync handmatig met <code>?full=1</code> (zie spec-akiles-access.md, runbook).</p><p><a href="/app/admin/instellingen">Terug naar instellingen</a></p>`,
  );
}
