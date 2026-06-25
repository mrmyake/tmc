import { NextResponse, type NextRequest } from "next/server";

// Lightweight gate. Real session validation happens in the /app layouts via
// validateRequest() — Lucia/pg can't run on the edge, so here we only check for
// the presence of the session cookie.
const SESSION_COOKIE = "tmc_session";

export async function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;
  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");
  const isLoginRoute = pathname === "/login";

  if (isAppRoute && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (isLoginRoute && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/app/:path*", "/login"],
};
