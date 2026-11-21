import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { handleLegacyDomain } from "@/lib/legacy-domains/handle";

/**
 * Next 16 proxy (voorheen middleware). Ververst de Supabase sessie-cookies
 * op elke request en gate'd protected routes.
 */
const PROTECTED_PREFIXES = ["/app", "/checkin", "/kiosk"] as const;
/** Kiosk-routes: wel cookies verversen, geen redirect naar /login zonder user. */
const KIOSK_PREFIXES = ["/checkin", "/kiosk"] as const;

export async function proxy(request: NextRequest) {
  // Eerste stap, vóór auth: verkeer van oude domeinen (ptloosdrecht.nl,
  // hormoonprofiel.com) wordt hier afgehandeld. Zie spec-legacy-domains.md.
  const legacyResponse = await handleLegacyDomain(request);
  if (legacyResponse) return legacyResponse;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Refresh de sessie (triggert getUser() call tegen Auth server).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // /checkin en /kiosk (staff-tablet) staan in de matcher zodat de
  // ververste Supabase-cookies van een ingelogde staff hier worden
  // teruggeschreven (server components kunnen dat niet). Ze sturen zonder
  // login NIET naar /login: de tablet draait sinds check-in PR 2 op een
  // gekoppeld apparaat met een kiosk-sessie in plaats van een login, en de
  // /kiosk-layout beslist zelf (slotscherm, of "niet gekoppeld").
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isKioskRoute = KIOSK_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  // /login met sessie wordt hier bewust NIET meer omgeleid: de pagina zelf
  // bepaalt de landing per rol via src/lib/auth/role-landing.ts en houdt
  // daarbij een expliciete `next` in stand (de proxy gooide die weg en
  // stuurde iedereen, ook trainers, naar /app). /login blijft wel in de
  // matcher zodat de sessie-cookies ververst worden.

  if (isProtectedRoute && !isKioskRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Match app-routes, de staff-tablet-routes en login. Overige paths zien
  // we met rust: geen onnodige auth-checks op marketing pages of assets.
  matcher: [
    "/app",
    "/app/:path*",
    "/checkin",
    "/checkin/:path*",
    "/kiosk",
    "/kiosk/:path*",
    "/login",
    // Oude domeinen: elk pad op die hosts, ook /wp-content/, .xml, .txt en
    // .ico. Een host-conditie houdt TMC-assets buiten de proxy.
    {
      source: "/:path*",
      has: [
        {
          type: "host",
          value: "(www\\.)?(ptloosdrecht\\.nl|hormoonprofiel\\.com)",
        },
      ],
    },
    // Hormoonprofiel (spec-hormoonprofiel.md): de sectie op TMC volgt de modus
    // van hormoonprofiel.com, en de interne route /hp-site is op elke andere
    // host dan hormoonprofiel.com een 404.
    "/hormoonprofiel",
    "/hormoonprofiel/:path*",
    "/hp-site",
    "/hp-site/:path*",
    // Testhook en preview-override; de code negeert ze buiten preview en dev.
    {
      source: "/:path*",
      has: [{ type: "header", key: "x-legacy-host-test" }],
    },
    {
      source: "/:path*",
      has: [{ type: "query", key: "__host" }],
    },
    {
      source: "/:path*",
      has: [{ type: "cookie", key: "__host" }],
    },
  ],
};
