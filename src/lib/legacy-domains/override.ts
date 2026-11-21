import type { NextRequest } from "next/server";
import { LEGACY_DOMAINS } from "./registry";
import { normalizeHost } from "./normalize";

/**
 * Preview-override voor het testen van een oud domein zonder DNS
 * (spec-hormoonprofiel.md). Alles hier is uitgeschakeld op production en in
 * een productiebuild zonder VERCEL_ENV: dezelfde voorwaarde als de bestaande
 * testheader.
 *
 *  - header `x-legacy-host-test: <host>` (bestaand, #359)
 *  - `?__host=<host>`: onthoudt de host in een cookie tot `?__host=reset`
 *  - `?__mode=<modus>`: onthoudt de modus van hormoonprofiel.com in een cookie
 */

export const TEST_HOST_HEADER = "x-legacy-host-test";
export const HOST_PARAM = "__host";
export const MODE_PARAM = "__mode";
export const HOST_COOKIE = "__host";
export const MODE_COOKIE = "__hp_mode";

export const OVERRIDE_MODES = [
  "standalone",
  "redirect_temporary",
  "redirect_permanent",
] as const;
export type OverrideMode = (typeof OVERRIDE_MODES)[number];

export function overrideAllowed(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development"
  );
}

export interface Override {
  /** De gesimuleerde host (ruw, met eventuele www), of null. */
  host: string | null;
  /** De gesimuleerde modus van hormoonprofiel.com, of null. */
  mode: OverrideMode | null;
  /** `?__host=reset`: cookies wissen en de parameters weghalen. */
  reset: boolean;
  /** Cookies die op de response gezet moeten worden. */
  setHost: string | null;
  setMode: OverrideMode | null;
}

const NONE: Override = { host: null, mode: null, reset: false, setHost: null, setMode: null };

function validHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const host = value.trim().toLowerCase();
  return LEGACY_DOMAINS[normalizeHost(host)] ? host : null;
}

function validMode(value: string | null | undefined): OverrideMode | null {
  return (OVERRIDE_MODES as readonly string[]).includes(value ?? "")
    ? (value as OverrideMode)
    : null;
}

export function readOverride(request: NextRequest): Override {
  if (!overrideAllowed()) return NONE;

  const params = request.nextUrl.searchParams;
  if (params.get(HOST_PARAM) === "reset") return { ...NONE, reset: true };

  const queryHost = validHost(params.get(HOST_PARAM));
  const queryMode = validMode(params.get(MODE_PARAM));
  const headerHost = validHost(request.headers.get(TEST_HOST_HEADER));
  const cookieHost = validHost(request.cookies.get(HOST_COOKIE)?.value);
  const cookieMode = validMode(request.cookies.get(MODE_COOKIE)?.value);

  return {
    host: headerHost ?? queryHost ?? cookieHost,
    mode: queryMode ?? cookieMode,
    reset: false,
    setHost: queryHost,
    setMode: queryMode,
  };
}
