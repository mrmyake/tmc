import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postLoginTarget } from "@/lib/auth/role-landing";

/**
 * PKCE-callback (`?code=`): wisselt de code voor een sessie en stuurt door
 * naar de landing per rol, of naar een veilige expliciete `next`
 * (magic-link naar een specifieke pagina, zodat de seed-workflow niet
 * stukgaat). De mapping zelf staat in src/lib/auth/role-landing.ts.
 *
 * Let op: een trainer-invite komt hier NIET binnen. inviteUserByEmail
 * ondersteunt geen PKCE (de uitnodigende browser is een andere dan de
 * accepterende), dus die link levert nooit een `?code=` op. Invites lopen
 * via /auth/confirm (token_hash).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("[auth/callback] exchange failed:", error);
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const target = await postLoginTarget(supabase, data.user.id, nextParam);
  return NextResponse.redirect(`${origin}${target}`);
}
