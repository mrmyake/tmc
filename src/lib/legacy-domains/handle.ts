import { NextResponse, type NextRequest } from "next/server";
import { LEGACY_DOMAINS } from "./registry";
import { normalizeHost } from "./normalize";
import { resolveMode, type ModeSource, globalConfigSource } from "./mode";
import { isAcmeChallenge, resolveTargetUrl } from "./resolve";

/** Testhook: simuleert een oude host. Alleen op preview en in development. */
export const TEST_HOST_HEADER = "x-legacy-host-test";

function testHookAllowed(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development"
  );
}

/** De effectieve host van het verzoek, na toepassing van de testhook. */
function effectiveHost(request: NextRequest): string {
  if (testHookAllowed()) {
    const simulated = request.headers.get(TEST_HOST_HEADER);
    if (simulated) return simulated;
  }
  return request.headers.get("host") ?? request.nextUrl.host;
}

/**
 * Eerste stap van de proxy. Geeft een response voor een oud domein, of null
 * als de host niet in het register staat (dan loopt de bestaande flow door).
 */
export async function handleLegacyDomain(
  request: NextRequest,
  source: ModeSource = globalConfigSource,
): Promise<NextResponse | null> {
  const domain = LEGACY_DOMAINS[normalizeHost(effectiveHost(request))];
  if (!domain) return null;

  const pathname = request.nextUrl.pathname;
  if (isAcmeChallenge(pathname)) return null;

  const mode = await resolveMode(domain, source);

  if (mode === "off") {
    return new NextResponse("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-robots-tag": "noindex",
        "cache-control": "no-store",
      },
    });
  }

  const location = resolveTargetUrl(domain, pathname);
  if (mode === "redirect_permanent") {
    const response = NextResponse.redirect(location, 308);
    response.headers.set("cache-control", "public, max-age=3600");
    return response;
  }
  const response = NextResponse.redirect(location, 307);
  response.headers.set("cache-control", "no-store");
  return response;
}
