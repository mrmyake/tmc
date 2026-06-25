import { cookies } from "next/headers";
import { decodeIdToken } from "arctic";
import { lucia } from "@/lib/lucia";
import { google, upsertGoogleUser } from "@/lib/google";
import { pool } from "@/lib/db";

function roleRedirect(role: string | null | undefined): string {
  if (role === "admin") return "/app/admin";
  if (role === "trainer") return "/app/trainer/sessies";
  return "/app/rooster";
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const storedState = store.get("google_oauth_state")?.value ?? null;
  const codeVerifier = store.get("google_code_verifier")?.value ?? null;
  const origin = url.origin;

  if (!code || !state || state !== storedState || !codeVerifier) {
    return Response.redirect(`${origin}/login?error=unknown`);
  }

  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const claims = decodeIdToken(tokens.idToken()) as {
      sub: string; email: string; given_name?: string; family_name?: string;
    };
    const userId = await upsertGoogleUser(claims.sub, claims.email, claims.given_name, claims.family_name);

    const session = await lucia.createSession(userId, {});
    const c = lucia.createSessionCookie(session.id);
    store.set(c.name, c.value, c.attributes);

    const { rows } = await pool.query("select role from profiles where id = $1", [userId]);
    return Response.redirect(`${origin}${roleRedirect(rows[0]?.role)}`);
  } catch {
    return Response.redirect(`${origin}/login?error=unknown`);
  }
}
