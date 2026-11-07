/**
 * Beslislogica van GET /proefles/code/start (spec-yoga-test.md). Geeft het
 * pad (met querystring) waar de route naartoe stuurt. Pure module met
 * geinjecteerde afhankelijkheden, zodat node:test hem zonder Next.js draait.
 *
 * Regels:
 * - De querystring bevat nooit de code. De code komt uitsluitend uit de
 *   server-side allowlist QUIZ_TRIAL_CODES; een meegegeven ?code= wordt
 *   genegeerd.
 * - Onbekend quiz-id: /proefles/code?les=... met het gewone gedrag.
 * - Bekende quiz, code bruikbaar: het bestaande ondertekende cookie wordt
 *   gezet (dezelfde helper als de codestap) en de bezoeker gaat naar
 *   /proefles/code?les=..., waar de sessielijst meteen verschijnt.
 * - Bekende quiz, code niet bruikbaar: /proefles/boeken?les=... (betaald).
 * - Cookie kon niet gezet worden: /proefles/code met de code ingevuld, de
 *   bezoeker bevestigt zelf.
 * - Er is hier bewust geen teller: alleen een vaste, publiek getoonde code
 *   wordt gecontroleerd, dus er is geen orakel. Het gebruiksmaximum blijft
 *   afgedwongen bij redeem_trial_code.
 * - Alle attributieparameters (gclid, gbraid, wbraid, fbclid, utm_*, lp)
 *   gaan ongewijzigd mee.
 */

import { attributionQuery, parseAttribution } from "@/lib/attribution/params";
import { QUIZ_TRIAL_CODES, isTimeBucket, outcomeByClassTypeId, yogaQuiz } from "./config";
import { isUuid } from "./preselect";

export interface QuizStartDeps {
  /** Read-only opzoeking: de scope als de code nu bruikbaar is, anders null. */
  lookupScope: (code: string) => Promise<string | null>;
  /** Zet het ondertekende cookie; false als dat niet lukt. */
  setCookie: (code: string) => Promise<boolean>;
}

const CODE_PATH = "/proefles/code";
const PAID_PATH = "/proefles/boeken";

function withQuery(path: string, own: Record<string, string | null>, attr: string): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(own)) {
    if (value) search.set(key, value);
  }
  const joined = [search.toString(), attr].filter(Boolean).join("&");
  return joined ? `${path}?${joined}` : path;
}

export async function resolveQuizStart(
  searchParams: URLSearchParams,
  deps: QuizStartDeps,
): Promise<string> {
  const quizId = searchParams.get("quiz") ?? "";
  const lesRaw = searchParams.get("les") ?? "";
  const les = isUuid(lesRaw) && outcomeByClassTypeId(lesRaw) ? lesRaw : null;
  const tijdRaw = searchParams.get("tijd");
  const tijd = isTimeBucket(tijdRaw) ? tijdRaw : null;
  const attr = attributionQuery(parseAttribution(searchParams));
  const own = { les, tijd };

  // Object.hasOwn: "constructor" of "__proto__" als quiz-id is geen quiz.
  const code = Object.hasOwn(QUIZ_TRIAL_CODES, quizId) ? QUIZ_TRIAL_CODES[quizId] : null;
  if (!code) return withQuery(CODE_PATH, own, attr);

  const scope = await deps.lookupScope(code);
  const usable = scope !== null && (yogaQuiz.usableScopes as readonly string[]).includes(scope);
  if (!usable) return withQuery(PAID_PATH, own, attr);

  if (!(await deps.setCookie(code))) {
    return withQuery(CODE_PATH, { ...own, code }, attr);
  }
  return withQuery(CODE_PATH, { ...own, soort: scope === "all" ? "les" : null }, attr);
}
