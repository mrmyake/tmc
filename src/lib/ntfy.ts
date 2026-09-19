const NTFY_TOPIC = "tmc-leads";

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
    const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: title,
        Tags: tags || "incoming_envelope",
      },
      body: message,
      signal: AbortSignal.timeout(5000),
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
