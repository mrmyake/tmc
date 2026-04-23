import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Post-login landing per rol (spec §2). Honoreer een expliciete `next`
 * param als die intern is (magic-link naar een specifieke pagina) —
 * zodat de testing-workflow (seed-dummies) niet stukgaat. Anders kies
 * op basis van rol.
 */
function roleRedirect(role: string | null | undefined): string {
  if (role === "admin") return "/app/admin";
  if (role === "trainer") return "/app/trainer/sessies";
  return "/app/rooster";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchange failed:", error);
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  // Alleen interne paths accepteren voor `next` (voorkom open-redirect).
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;

  // Specifieke next → die volgen. De bare `/app` vangen we op en
  // sturen naar de rol-default; anders zou iedereen op /app/rooster
  // landen en dan pas worden doorgestuurd.
  if (safeNext && safeNext !== "/app") {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let target = "/app/rooster";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    target = roleRedirect(profile?.role);
  }

  return NextResponse.redirect(`${origin}${target}`);
}
