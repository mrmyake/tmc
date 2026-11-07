/**
 * Links van de uitslag en de mail naar /proefles/*. Pure module.
 *
 * - Met een bruikbare code: de startroute /proefles/code/start, die de code
 *   zelf opzoekt (de querystring bevat nooit de code).
 * - Zonder bruikbare code: direct de betaalde kaart /proefles/boeken.
 * - Altijd mee: ?les=<class_type_id>, de tijdsvoorkeur (?tijd=) en de
 *   attributieparameters, omdat resolveAttribution alleen de URL van de
 *   huidige pagina leest.
 */

import { attributionQuery, type AttributionParams } from "@/lib/attribution/params";
import { YOGA_QUIZ_ID, type TimeBucket } from "./config";

export const QUIZ_PATH = "/welke-yoga-past-bij-jou";
export const QUIZ_START_PATH = "/proefles/code/start";
export const PAID_BOOKING_PATH = "/proefles/boeken";

/** Standaardbron voor bezoekers die zonder eigen utm-parameters komen. */
export const QUIZ_DEFAULT_UTM = {
  utm_source: "yoga_test",
  utm_medium: "quiz",
  utm_campaign: "welke_yoga",
} as const;

/**
 * Attributie voor de doorlink: wat de bezoeker meebracht blijft ongewijzigd
 * staan. Heeft hij nog geen utm_source, dan krijgt hij de quizbron, zodat de
 * boeking in tmc.lead_attributions als quizlead herkenbaar is (zonder
 * schemawijziging; de les zit in het landingspad via ?les=).
 */
export function withQuizSource(params: AttributionParams | null | undefined): AttributionParams {
  const base: AttributionParams = { ...(params ?? {}) };
  if (base.utm_source) return base;
  return { ...base, ...QUIZ_DEFAULT_UTM };
}

function build(
  path: string,
  query: Record<string, string | null | undefined>,
  attribution: AttributionParams | null | undefined,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) search.set(key, value);
  }
  const attr = attributionQuery(withQuizSource(attribution));
  const own = search.toString();
  const joined = [own, attr].filter(Boolean).join("&");
  return joined ? `${path}?${joined}` : path;
}

export function codeBookingPath(
  classTypeId: string,
  bucket: TimeBucket | null,
  attribution: AttributionParams | null | undefined,
): string {
  return build(
    QUIZ_START_PATH,
    { quiz: YOGA_QUIZ_ID, les: classTypeId, tijd: bucket },
    attribution,
  );
}

export function paidBookingPath(
  classTypeId: string,
  bucket: TimeBucket | null,
  attribution: AttributionParams | null | undefined,
): string {
  return build(PAID_BOOKING_PATH, { les: classTypeId, tijd: bucket }, attribution);
}

/** De kaart "Liever gebeld worden" op /proefles (?kaart=bellen). */
export function callPath(attribution: AttributionParams | null | undefined): string {
  return build("/proefles", { kaart: "bellen" }, attribution);
}
