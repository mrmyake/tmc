const NTFY_TOPIC = "tmc-leads";

export async function sendNotification(title: string, message: string, tags?: string) {
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: {
        Title: title,
        Tags: tags || "incoming_envelope",
      },
      body: message,
    });
  } catch (e) {
    console.warn("[ntfy] Failed to send notification:", e);
  }
}
