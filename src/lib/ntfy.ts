const NTFY_TOPIC = "tmc-leads";
const NTFY_TIMEOUT_MS = 5000;

/**
 * Doel-URL. NTFY_URL is uitsluitend een testhaak (scripts/ntfy/*.test.mts
 * wijst hem naar een lokale server die niet, traag of fout antwoordt);
 * in productie is de variabele afwezig en gaat alles naar het vaste topic.
 * Per aanroep gelezen, niet bij module-load, zodat een test hem kan zetten.
 */
function ntfyUrl(): string {
  return process.env.NTFY_URL || `https://ntfy.sh/${NTFY_TOPIC}`;
}

/**
 * Stuurt een ntfy-melding. Throwt nooit. Geeft true terug als ntfy de
 * melding heeft geaccepteerd (2xx), anders false; callers die alleen
 * "fire and forget" willen kunnen de waarde negeren. De timeout houdt een
 * hangende ntfy weg van paden met een eigen deadline (Mollie breekt een
 * webhook na 15 seconden af).
 */
export async function sendNotification(
  title: string,
  message: string,
  tags?: string,
): Promise<boolean> {
  try {
    const res = await fetch(ntfyUrl(), {
      method: "POST",
      headers: {
        Title: title,
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
