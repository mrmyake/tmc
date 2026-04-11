const API_URL = "https://connect.mailerlite.com/api";

async function mailerliteRequest(path: string, body: Record<string, unknown>) {
  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    console.warn("[Mailerlite] No API key configured");
    return null;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("[Mailerlite] API error:", res.status, error);
    return null;
  }

  return res.json();
}

interface SubscriberData {
  email: string;
  name?: string;
  fields?: Record<string, string>;
  groups?: string[]; // Mailerlite group IDs
}

export async function addSubscriber(data: SubscriberData) {
  return mailerliteRequest("/subscribers", {
    email: data.email,
    fields: {
      name: data.name || "",
      ...data.fields,
    },
    groups: data.groups || [],
    status: "active",
  });
}

// TODO: Create these groups in Mailerlite and fill in the IDs
export const GROUPS = {
  PDF_LEAD: "", // Beweeg Beter guide downloaders
  MOBILITY_RESET: "", // 7-Dagen Mobility Reset opt-ins
  MOBILITY_CHECK: "", // Mobility Check bookings
  PROEFLES: "", // Proefles bookings
  CONTACT: "", // Contact form submissions
} as const;
