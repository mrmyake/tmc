const API_URL = "https://connect.mailerlite.com/api";

async function mailerliteRequest(
  path: string,
  body: Record<string, unknown> | null,
  method: "POST" | "PUT" | "DELETE" = "POST",
) {
  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    console.warn("[Mailerlite] No API key configured");
    return null;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("[Mailerlite] API error:", res.status, error);
    return null;
  }

  if (res.status === 204) return {};
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

/**
 * Flip a subscriber to `unsubscribed` status. No-op if the email isn't in
 * MailerLite yet. Used when a member disables the marketing opt-in toggle.
 */
export async function setSubscriberUnsubscribed(email: string) {
  return mailerliteRequest("/subscribers", {
    email,
    status: "unsubscribed",
  });
}

export const GROUPS = {
  PDF_LEAD: "184521718447998634",
  MOBILITY_RESET: "184521727523423599",
  MOBILITY_CHECK: "184521735663519061",
  PROEFLES: "184521743018230980",
  CONTACT: "184521748487603774",
  // Env-driven: maak de group in MailerLite Studio en zet het ID in .env.local
  // als MAILERLITE_CROWDFUNDING_BACKER_GROUP_ID. Leeg = geen MailerLite sync.
  CROWDFUNDING_BACKER: process.env.MAILERLITE_CROWDFUNDING_BACKER_GROUP_ID ?? "",
  // Members group voor marketing opt-in toggle vanuit /app/profiel.
  // Zet in .env.local als MAILERLITE_MEMBERS_GROUP_ID. Leeg = DB-only
  // toggle zonder MailerLite sync.
  MEMBERS: process.env.MAILERLITE_MEMBERS_GROUP_ID ?? "",
} as const;
