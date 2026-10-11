/**
 * First-party attributie van proefles-leads (spec-marketing-attribution.md):
 * de pure laag, zonder "server-only" en zonder browser-API's, zodat server
 * pages, client-componenten, server actions, de route en de tests dezelfde
 * regels delen.
 *
 * De parameters komen uitsluitend uit de URL. Ze reizen mee als
 * querystring op de interne links en redirects binnen /proefles/* (plus de
 * parameter lp voor het landingspad) en gaan bij de inzending mee in de
 * action-input of JSON-body. Geen cookie, geen localStorage of
 * sessionStorage: wat niet in de URL of in React-props zit, bestaat niet.
 *
 * De server valideert alles opnieuw (sanitizeLeadAttribution) en laat
 * ongeldige waarden weg in plaats van te weigeren: attributie mag een
 * boeking of aanvraag nooit laten falen.
 */

export const ATTRIBUTION_KEYS = [
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

/** Klik-ID's: alleen het tekenbereik dat Google en Meta zelf gebruiken. */
const CLICK_ID_KEYS: readonly AttributionKey[] = ["gclid", "gbraid", "wbraid", "fbclid"];
const CLICK_ID_RE = /^[A-Za-z0-9_.-]+$/;

/** Querystring-parameter voor het landingspad binnen /proefles/*. */
export const LANDING_PARAM = "lp";

export const VALUE_MAX = 512;
export const LANDING_PATH_MAX = 2048;

export const ANALYTICS_CONSENT_VALUES = ["granted", "denied", "unknown"] as const;
export type AnalyticsConsent = (typeof ANALYTICS_CONSENT_VALUES)[number];

/** De parameters zoals ze tussen pagina's reizen (server page naar client). */
export type AttributionParams = Partial<Record<AttributionKey, string>> & {
  /** Pad plus querystring van de eerste /proefles-pagina; begint met /. */
  landing_path?: string;
};

/** Wat de client bij de inzending meestuurt: de parameters plus de bannerkeuze. */
export type LeadAttributionInput = AttributionParams & {
  analytics_consent?: AnalyticsConsent;
};

/** Gevalideerd resultaat voor de server-side insert. */
export interface SanitizedLeadAttribution {
  params: AttributionParams;
  analyticsConsent: AnalyticsConsent;
}

type ParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

function readParam(source: ParamSource, key: string): string | undefined {
  if (!source) return undefined;
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

// Besturingstekens (inclusief regeleinden) horen nooit in een parameter.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/**
 * Een parameterwaarde: getrimd, zonder besturingstekens, binnen de lengte;
 * klik-ID's bovendien alleen uit het toegestane tekenbereik. Anders null.
 */
export function sanitizeValue(key: AttributionKey, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > VALUE_MAX) return null;
  if (CONTROL_RE.test(value)) return null;
  if (CLICK_ID_KEYS.includes(key) && !CLICK_ID_RE.test(value)) return null;
  return value;
}

/**
 * Het landingspad: moet met precies een / beginnen (geen //, dus geen
 * protocol-relatieve host), geen protocol, geen whitespace of
 * besturingstekens, maximaal 2048 tekens. Anders null; de aanroeper laat het
 * pad dan weg en de huidige URL geldt als landing.
 */
export function sanitizeLandingPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > LANDING_PATH_MAX) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/\s/.test(value) || CONTROL_RE.test(value)) return null;
  if (/^\/[^/?#]*:/.test(value)) return null;
  return value;
}

/** Minstens een advertentie- of campagneparameter aanwezig. */
export function hasAttribution(params: AttributionParams | null | undefined): boolean {
  if (!params) return false;
  return ATTRIBUTION_KEYS.some((key) => Boolean(params[key]));
}

/**
 * Leest de parameters (en lp) uit de URL van een /proefles-pagina. Onbekende
 * sleutels worden genegeerd. Zonder enige parameter een leeg object.
 */
export function parseAttribution(source: ParamSource): AttributionParams {
  const params: AttributionParams = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = sanitizeValue(key, readParam(source, key));
    if (value) params[key] = value;
  }
  if (!hasAttribution(params)) return {};
  const landing = sanitizeLandingPath(readParam(source, LANDING_PARAM));
  if (landing) params.landing_path = landing;
  return params;
}

/**
 * De volledige querystring van de huidige pagina, voor het landingspad als
 * lp ontbreekt. Volgorde zoals ontvangen; lp zelf (ongeldig, anders waren we
 * hier niet) blijft weg.
 */
function currentQuery(source: ParamSource): string {
  const out = new URLSearchParams();
  if (!source) return "";
  if (source instanceof URLSearchParams) {
    for (const [key, value] of source.entries()) {
      if (key !== LANDING_PARAM) out.append(key, value);
    }
  } else {
    for (const [key, value] of Object.entries(source)) {
      if (key === LANDING_PARAM || value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) out.append(key, v);
    }
  }
  return out.toString();
}

/**
 * Attributie voor een server page: parameters uit de URL, en als er
 * parameters zijn maar geen geldige lp, dan is de huidige URL (pad plus
 * querystring) de landing. Zonder parameters een leeg object, zodat de
 * links schoon blijven.
 */
export function resolveAttribution(source: ParamSource, currentPath: string): AttributionParams {
  const params = parseAttribution(source);
  if (!hasAttribution(params)) return {};
  if (!params.landing_path) {
    const query = currentQuery(source);
    const landing = sanitizeLandingPath(query ? `${currentPath}?${query}` : currentPath);
    if (landing) params.landing_path = landing;
  }
  return params;
}

/**
 * Querystring (zonder ?) om aan een interne link of redirect te plakken.
 * Leeg zonder parameters.
 */
export function attributionQuery(params: AttributionParams | null | undefined): string {
  if (!params || !hasAttribution(params)) return "";
  const out = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) {
    const value = params[key];
    if (value) out.set(key, value);
  }
  if (params.landing_path) out.set(LANDING_PARAM, params.landing_path);
  return out.toString();
}

/** href met de attributie erachter; ongewijzigd zonder parameters. */
export function withAttribution(href: string, params: AttributionParams | null | undefined): string {
  const query = attributionQuery(params);
  if (!query) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${query}`;
}

/** Bannerkeuze uit de client; alles buiten de drie waarden wordt unknown. */
export function parseAnalyticsConsent(raw: unknown): AnalyticsConsent {
  return raw === "granted" || raw === "denied" ? raw : "unknown";
}

/**
 * Server-side validatie van wat de client meestuurt (action-input of
 * JSON-body). Onbekende sleutels en ongeldige waarden vallen weg; een
 * ongeldig landingspad wordt weggelaten. Null als er geen enkele
 * advertentie- of campagneparameter overblijft: dan komt er geen rij.
 */
export function sanitizeLeadAttribution(raw: unknown): SanitizedLeadAttribution | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const params: AttributionParams = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = sanitizeValue(key, data[key]);
    if (value) params[key] = value;
  }
  if (!hasAttribution(params)) return null;
  const landing = sanitizeLandingPath(data.landing_path);
  if (landing) params.landing_path = landing;
  return { params, analyticsConsent: parseAnalyticsConsent(data.analytics_consent) };
}
