const NTFY_TOPIC = "tmc-leads";
const NTFY_TIMEOUT_MS = 5000;

const DEFAULT_NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;
let warnedIgnoredOverride = false;

/** Topicnamen zoals ntfy ze accepteert. */
const TOPIC_PATTERN = /^[-_A-Za-z0-9]{1,64}$/;

/**
 * Doel-URL. Zonder topic het vaste standaardtopic; met topic (opts.topic)
 * hetzelfde ntfy-adres met dat topic.
 *
 * NTFY_URL is uitsluitend een testhaak (scripts/ntfy/*.test.mts wijst hem
 * naar een lokale server die niet, traag of fout antwoordt). Per aanroep
 * gelezen, niet bij module-load, zodat een test hem kan zetten. Met een
 * topic vervangt dat het laatste padsegment van de override, zodat een test
 * kan zien welk topic geraakt wordt.
 *
 * Guard: op Vercel-productie (VERCEL_ENV === "production") wordt de
 * variabele genegeerd, met een eenmalige waarschuwing. Anders zou een per
 * ongeluk gezette env var stilletjes alle meldingen omleiden, en ntfy is op
 * de faalpaden van de Mollie-webhook het enige kanaal dat nog werkt als de
 * database wegvalt. Preview en lokaal mogen hem wel gebruiken.
 */
function ntfyUrl(topic?: string): string {
  const target = topic ? `https://ntfy.sh/${topic}` : DEFAULT_NTFY_URL;
  const override = process.env.NTFY_URL;
  if (!override) return target;
  if (process.env.VERCEL_ENV === "production") {
    if (!warnedIgnoredOverride) {
      warnedIgnoredOverride = true;
      console.warn("[ntfy] NTFY_URL genegeerd op productie; meldingen gaan naar het vaste topic");
    }
    return target;
  }
  return topic ? new URL(topic, override).toString() : override;
}

/**
 * Access token van het ntfy-account (begint met tk_), per aanroep gelezen.
 * Zonder variabele gaat er geen Authorization-header mee en is het gedrag
 * exact dat van voor de variabele bestond. De waarde komt nooit in logs,
 * foutmeldingen of events.
 */
function ntfyAccessToken(): string | null {
  const token = process.env.NTFY_ACCESS_TOKEN?.trim();
  return token ? token : null;
}

/**
 * Title-header. Een HTTP-header is geen UTF-8: fetch gooit bij tekens
 * buiten Latin-1 (een naam met "ł") en ntfy leest Latin-1-bytes als
 * UTF-8 (een "ë" komt verminkt aan). Daarom gaat elke titel met een
 * teken buiten druk-ASCII als RFC 2047 encoded-word, wat ntfy decodeert.
 * Een puur ASCII-titel blijft byte voor byte ongewijzigd.
 */
export function encodeTitleHeader(title: string): string {
  if (/^[\x20-\x7E]*$/.test(title)) return title;
  return `=?UTF-8?B?${Buffer.from(title, "utf8").toString("base64")}?=`;
}

/** Regel onder een melding die via de terugval anoniem is verstuurd. */
export const NTFY_TOKEN_FALLBACK_NOTE = "Let op: ntfy-token geweigerd, anoniem verstuurd.";

export const NTFY_TEST_PREFIX = "TEST: ";

export interface NotificationOptions {
  /**
   * True als de aanroeper weet dat het om een test gaat (is_test op de rij
   * of het profiel, Mollie-testmodus, of een testadres volgens
   * isTestEmail). Zie spec-membership-flow.md, ntfy-testprefix.
   */
  test?: boolean;
  /**
   * Ander topic dan het standaardtopic (bv. het afgeschermde deur-topic).
   * Een melding met een eigen topic gaat nooit naar het standaardtopic, ook
   * niet als het topic ongeldig is of het token geweigerd wordt.
   */
  topic?: string;
  /** ntfy Priority-header; zonder waarde stuurt ntfy op de standaardprioriteit. */
  priority?: "high";
}

/**
 * Titel zoals hij naar ntfy gaat. Het prefix "TEST: " komt ervoor als de
 * aanroeper test meegeeft, of als de code niet op Vercel-productie draait
 * (preview en lokaal sturen naar hetzelfde echte topic). Nooit dubbel. Dit
 * is de enige plek waar het prefix gezet wordt; losse titels bevatten het
 * nooit zelf.
 */
export function withTestPrefix(
  title: string,
  test: boolean,
  vercelEnv: string | undefined,
): string {
  if (!test && vercelEnv === "production") return title;
  return title.startsWith(NTFY_TEST_PREFIX) ? title : `${NTFY_TEST_PREFIX}${title}`;
}

/**
 * Stuurt een ntfy-melding. Throwt nooit. Geeft true terug als ntfy de
 * melding heeft geaccepteerd (2xx), anders false; callers die alleen
 * "fire and forget" willen kunnen de waarde negeren. De timeout houdt een
 * hangende ntfy weg van paden met een eigen deadline (Mollie breekt een
 * webhook na 15 seconden af). Testmeldingen krijgen "TEST: " voor de
 * titel, zie withTestPrefix.
 *
 * Met NTFY_ACCESS_TOKEN gaat op elke post Authorization: Bearer mee.
 *
 * Terugval bij een geweigerd token: ntfy weigert een post met een ongeldig
 * of ingetrokken token ook op een topic waar anoniem publiceren mag. Zonder
 * terugval zouden dan alle stafmeldingen stil wegvallen. Daarom gaat de
 * melding bij een 401 of 403 een keer opnieuw zonder header, uitsluitend
 * naar het standaardtopic en nooit naar een topic uit opts.topic, met een
 * regel eronder dat het token geweigerd is. Dit pad vervalt zodra het
 * standaardtopic op deny-all staat: de anonieme post wordt dan ook
 * geweigerd en het resultaat is gewoon false.
 */
export async function sendNotification(
  title: string,
  message: string,
  tags?: string,
  opts?: NotificationOptions,
): Promise<boolean> {
  try {
    const topic = opts?.topic;
    if (topic !== undefined && !TOPIC_PATTERN.test(topic)) {
      // Nooit terugvallen op het standaardtopic: een deurmelding hoort daar niet.
      console.warn("[ntfy] Ongeldig topic, melding niet verstuurd");
      return false;
    }
    const url = ntfyUrl(topic);
    const token = ntfyAccessToken();
    const headers: Record<string, string> = {
      Title: encodeTitleHeader(
        withTestPrefix(title, opts?.test === true, process.env.VERCEL_ENV),
      ),
      Tags: tags || "incoming_envelope",
    };
    if (opts?.priority) headers.Priority = opts.priority;

    const res = await fetch(url, {
      method: "POST",
      headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
      body: message,
      signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
    });
    if (res.ok) return true;

    if (token && topic === undefined && (res.status === 401 || res.status === 403)) {
      // Alleen de status: geen token, geen headers.
      console.error(
        `[ntfy] Token geweigerd (${res.status}); melding anoniem opnieuw verstuurd naar het standaardtopic`,
      );
      const retry = await fetch(url, {
        method: "POST",
        headers,
        body: `${message}\n\n${NTFY_TOKEN_FALLBACK_NOTE}`,
        signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
      });
      if (retry.ok) return true;
      console.warn("[ntfy] Notification rejected:", retry.status);
      return false;
    }

    console.warn("[ntfy] Notification rejected:", res.status);
    return false;
  } catch (e) {
    console.warn("[ntfy] Failed to send notification:", e);
    return false;
  }
}
