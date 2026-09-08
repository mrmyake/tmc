import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/access/oauth-core";
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
  const authorizeUrl = buildAuthorizeUrl({
    clientId: process.env.AKILES_CLIENT_ID,
    state,
  });

  const res = NextResponse.redirect(authorizeUrl, { status: 302 });
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
