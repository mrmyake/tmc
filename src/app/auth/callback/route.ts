import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Post-login landing per rol (spec §2). Honoreer een expliciete `next`
 * param als die intern is (magic-link naar een specifieke pagina) —
 * zodat de testing-workflow (seed-dummies) niet stukgaat. Anders kies
 * op basis van rol.
 *
 * PT-agenda PR D: trainer landt op de agenda (page-level
 * requireTrainerOrAdmin vangt een inactieve trainer op, net als bij
 * /app/trainer/boeken uit C3 — geen losse is_active-check hier nodig).
 * Admin landt op de agenda MET trainer-kiezer als er een actieve eigen
 * trainers-rij bestaat (bv. Marlon), anders ongewijzigd op /app/admin.
 */
function roleRedirect(
  role: string | null | undefined,
  adminHasActiveTrainerRow: boolean,
): string {
  if (role === "admin") {
    return adminHasActiveTrainerRow ? "/app/trainer/agenda" : "/app/admin";
  }
  if (role === "trainer") return "/app/trainer/agenda";
  return "/app";
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

  // Specifieke next → die volgen. De bare `/app` vangen we op en sturen
  // naar de rol-default (die voor members ook gewoon /app is, sinds de
  // landing-flip 2026-07-12 — dit voorkomt alleen dat een niet-member
  // met next=/app op de member-landing terechtkomt).
  if (safeNext && safeNext !== "/app") {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let target = "/app";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    let adminHasActiveTrainerRow = false;
    if (profile?.role === "admin") {
      const { data: trainerRow } = await supabase
        .from("trainers")
        .select("id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      adminHasActiveTrainerRow = trainerRow !== null;
    }

    target = roleRedirect(profile?.role, adminHasActiveTrainerRow);
  }

  return NextResponse.redirect(`${origin}${target}`);
}
