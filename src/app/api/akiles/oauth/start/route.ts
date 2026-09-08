import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  AKILES_OAUTH_AUTHORIZE_URL,
  AKILES_OAUTH_REDIRECT_URI,
  AKILES_OAUTH_SCOPE,
} from "@/lib/access/constants";
import {
  OAUTH_COOKIE_PATH,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  requireAdminGate,
  requireProductionResponse,
} from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stap 1 van de eenmalige Akiles-autorisatie (spec-akiles-access.md,
 * runbook). Admin-only, alleen op productie. Zet een cryptografisch
 * veilige state in een httpOnly-cookie en stuurt door naar Akiles.
 * Daarna landt de admin op /api/akiles/oauth/callback.
 */
export async function GET(): Promise<Response> {
  const gate = await requireAdminGate();
  if (!gate.ok) return gate.response;
  const notProduction = requireProductionResponse();
  if (notProduction) return notProduction;

  if (!process.env.AKILES_CLIENT_ID) {
    return new Response("AKILES_CLIENT_ID ontbreekt in de omgeving.", { status: 503 });
  }

  const state = randomBytes(32).toString("base64url");
  const url = new URL(AKILES_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.AKILES_CLIENT_ID);
  url.searchParams.set("redirect_uri", AKILES_OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", AKILES_OAUTH_SCOPE);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString(), { status: 302 });
  res.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return res;
}
