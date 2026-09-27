import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next 16 proxy (voorheen middleware). Ververst de Supabase sessie-cookies
 * op elke request, gate'd protected routes en redirect ingelogde users weg
 * van /login.
 */
const PROTECTED_PREFIXES = ["/app", "/checkin", "/kiosk"] as const;
/** Kiosk-routes: wel cookies verversen, geen redirect naar /login zonder user. */
const KIOSK_PREFIXES = ["/checkin", "/kiosk"] as const;

export async function proxy(request: NextRequest) {
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
  const isLoginRoute = pathname === "/login";

  if (isProtectedRoute && !isKioskRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isLoginRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
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
  ],
};
