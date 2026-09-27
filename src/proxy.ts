import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next 16 proxy (voorheen middleware). Ververst de Supabase sessie-cookies
 * op elke request, gate'd protected routes en redirect ingelogde users weg
 * van /login.
 */
const PROTECTED_PREFIXES = ["/app", "/checkin", "/kiosk"] as const;

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
  // /checkin en /kiosk (staff-tablet) horen bij de beschermde routes:
  // hun layouts eisen een staff-sessie, en alleen hier worden de ververste
  // Supabase-cookies teruggeschreven (server components kunnen dat niet).
  // Zonder deze regel verliep de tabletsessie zodra het access-token
  // verliep (fix/checkin-cookie-gate).
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isLoginRoute = pathname === "/login";

  if (isProtectedRoute && !user) {
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
