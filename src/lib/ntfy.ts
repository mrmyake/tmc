const NTFY_TOPIC = "tmc-leads";
const NTFY_TIMEOUT_MS = 5000;

const DEFAULT_NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;
let warnedIgnoredOverride = false;

/**
 * Doel-URL. NTFY_URL is uitsluitend een testhaak (scripts/ntfy/*.test.mts
 * wijst hem naar een lokale server die niet, traag of fout antwoordt). Per
 * aanroep gelezen, niet bij module-load, zodat een test hem kan zetten.
 *
 * Guard: op Vercel-productie (VERCEL_ENV === "production") wordt de
 * variabele genegeerd, met een eenmalige waarschuwing. Anders zou een per
 * ongeluk gezette env var stilletjes alle meldingen omleiden, en ntfy is op
 * de faalpaden van de Mollie-webhook het enige kanaal dat nog werkt als de
 * database wegvalt. Preview en lokaal mogen hem wel gebruiken.
 */
function ntfyUrl(): string {
  const override = process.env.NTFY_URL;
  if (!override) return DEFAULT_NTFY_URL;
  if (process.env.VERCEL_ENV === "production") {
    if (!warnedIgnoredOverride) {
      warnedIgnoredOverride = true;
      console.warn("[ntfy] NTFY_URL genegeerd op productie; meldingen gaan naar het vaste topic");
    }
    return DEFAULT_NTFY_URL;
  }
  return override;
}

export const NTFY_TEST_PREFIX = "TEST: ";

export interface NotificationOptions {
  /**
   * True als de aanroeper weet dat het om een test gaat (is_test op de rij
   * of het profiel, Mollie-testmodus, of een testadres volgens
   * isTestEmail). Zie spec-membership-flow.md, ntfy-testprefix.
   */
  test?: boolean;
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
 */
export async function sendNotification(
  title: string,
  message: string,
  tags?: string,
  opts?: NotificationOptions,
): Promise<boolean> {
  try {
    const res = await fetch(ntfyUrl(), {
      method: "POST",
      headers: {
        Title: withTestPrefix(title, opts?.test === true, process.env.VERCEL_ENV),
        Tags: tags || "incoming_envelope",
      },
      body: message,
      signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[ntfy] Notification rejected:", res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[ntfy] Failed to send notification:", e);
    return false;
  }
}
