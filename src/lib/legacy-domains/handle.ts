import { NextResponse, type NextRequest } from "next/server";
import { LEGACY_DOMAINS } from "./registry";
import { normalizeHost } from "./normalize";
import { resolveMode, type ModeSource, globalConfigSource } from "./mode";
import { isAcmeChallenge, resolveTargetUrl } from "./resolve";
import {
  HOST_COOKIE,
  HOST_PARAM,
  MODE_COOKIE,
  MODE_PARAM,
  TEST_HOST_HEADER,
  readOverride,
  type Override,
} from "./override";
import {
  decideHormoonprofielRequest,
  decideTmcSection,
  type HpDecision,
  type HpMode,
} from "@/lib/hormoonprofiel/redirects";
import { HP_INTERNAL_PREFIX, HP_SECTION_PATH } from "@/lib/hormoonprofiel/slugs";

export { TEST_HOST_HEADER };

const HP_DOMAIN = "hormoonprofiel.com";

function plain(status: number, body: string, cache: string): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": cache,
    },
  });
}

/** Zet de preview-cookies. Alleen aanwezig als er een override is gelezen. */
function withOverrideCookies(response: NextResponse, override: Override): NextResponse {
  const opts = { path: "/", sameSite: "lax", secure: true, httpOnly: true } as const;
  if (override.setHost) response.cookies.set(HOST_COOKIE, override.setHost, opts);
  if (override.setMode) response.cookies.set(MODE_COOKIE, override.setMode, opts);
  return response;
}

/** `?__host=reset`: cookies weg, parameters weg, terug naar hetzelfde pad. */
function resetResponse(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.searchParams.delete(HOST_PARAM);
  url.searchParams.delete(MODE_PARAM);
  const response = NextResponse.redirect(url, 307);
  response.cookies.delete(HOST_COOKIE);
  response.cookies.delete(MODE_COOKIE);
  response.headers.set("cache-control", "no-store");
  return response;
}

function redirectResponse(
  request: NextRequest,
  status: 307 | 308,
  location: string,
): NextResponse {
  const response = NextResponse.redirect(new URL(location, request.url), status);
  response.headers.set(
    "cache-control",
    status === 308 ? "public, max-age=3600" : "no-store",
  );
  return response;
}

/** Voert een beslissing over hormoonprofiel.com uit. */
function executeHpDecision(request: NextRequest, decision: HpDecision): NextResponse {
  switch (decision.kind) {
    case "passthrough":
      return NextResponse.next();
    case "gone":
      return plain(410, "Gone", "public, max-age=3600");
    case "redirect":
      return redirectResponse(request, decision.status, decision.location);
    case "rewrite":
    case "notfound": {
      const url = request.nextUrl.clone();
      url.pathname =
        decision.internalPath === "/"
          ? HP_INTERNAL_PREFIX
          : `${HP_INTERNAL_PREFIX}${decision.internalPath}`;
      return NextResponse.rewrite(url);
    }
  }
}

async function hpMode(
  override: Override,
  source: ModeSource,
): Promise<HpMode> {
  if (override.mode) return override.mode;
  const mode = await resolveMode(LEGACY_DOMAINS[HP_DOMAIN], source);
  // resolveMode maakt van off al standalone; dit is alleen voor het type.
  return mode === "off" ? "standalone" : (mode as HpMode);
}

/**
 * Eerste stap van de proxy. Geeft een response voor een oud domein, voor de
 * hormoonprofiel-paden op andere hosts, of null als er niets te doen is (dan
 * loopt de bestaande flow door).
 */
export async function handleLegacyDomain(
  request: NextRequest,
  source: ModeSource = globalConfigSource,
): Promise<NextResponse | null> {
  const override = readOverride(request);
  if (override.reset) return resetResponse(request);

  const rawHost = (
    override.host ??
    request.headers.get("host") ??
    request.nextUrl.host
  ).toLowerCase();
  const domain = LEGACY_DOMAINS[normalizeHost(rawHost)];
  const pathname = request.nextUrl.pathname;

  if (!domain) {
    const other = await handleOtherHost(request, override, source, pathname);
    return other ? withOverrideCookies(other, override) : null;
  }

  if (isAcmeChallenge(pathname)) return null;

  const mode = await (domain.domain === HP_DOMAIN
    ? hpMode(override, source)
    : resolveMode(domain, source));

  if (mode === "off") {
    return withOverrideCookies(plain(404, "Not found", "no-store"), override);
  }

  if (domain.domain === HP_DOMAIN) {
    const decision = decideHormoonprofielRequest({
      mode: mode as HpMode,
      pathname,
      search: request.nextUrl.search,
      www: rawHost.replace(/:\d+$/, "").startsWith("www."),
    });
    return withOverrideCookies(executeHpDecision(request, decision), override);
  }

  const location = resolveTargetUrl(domain, pathname);
  if (mode === "redirect_permanent") {
    return withOverrideCookies(redirectResponse(request, 308, location), override);
  }
  return withOverrideCookies(redirectResponse(request, 307, location), override);
}

/**
 * Verkeer op een host die niet in het register staat (themovementclub.nl,
 * previews): de interne route is dicht, en /hormoonprofiel volgt de modus.
 */
async function handleOtherHost(
  request: NextRequest,
  override: Override,
  source: ModeSource,
  pathname: string,
): Promise<NextResponse | null> {
  const lower = pathname.toLowerCase();

  if (lower === HP_INTERNAL_PREFIX || lower.startsWith(`${HP_INTERNAL_PREFIX}/`)) {
    return plain(404, "Not found", "no-store");
  }

  if (lower === HP_SECTION_PATH || lower.startsWith(`${HP_SECTION_PATH}/`)) {
    const mode = await hpMode(override, source);
    const decision = decideTmcSection(mode, pathname);
    if (decision.kind === "redirect") {
      return redirectResponse(request, decision.status, decision.location);
    }
    return NextResponse.next();
  }

  return null;
}
