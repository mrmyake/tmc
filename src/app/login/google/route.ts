import { cookies } from "next/headers";
import { google, generateState, generateCodeVerifier } from "@/lib/google";

export async function GET(): Promise<Response> {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

  const store = await cookies();
  const opts = {
    path: "/", httpOnly: true, maxAge: 600,
    sameSite: "lax" as const, secure: process.env.NODE_ENV === "production",
  };
  store.set("google_oauth_state", state, opts);
  store.set("google_code_verifier", codeVerifier, opts);
  return Response.redirect(url);
}
