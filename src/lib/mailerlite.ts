import "server-only";

const API_URL = "https://connect.mailerlite.com/api";

async function mailerliteRequest(
  path: string,
  body: Record<string, unknown> | null,
  method: "GET" | "POST" | "PUT" | "DELETE" = "POST",
  options: { quiet404?: boolean } = {},
) {
  // Strip alle whitespace: Vercel UI kan een gewrapte JWT met linebreaks
  // opslaan, en die breken de Bearer header (HTTP 401 zonder zichtbare fout
  // in de UI omdat lead-routes altijd succes returnen).
  const apiKey = process.env.MAILERLITE_API_KEY?.replace(/\s/g, "");
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
    // Een lookup die niets vindt is geen fout (accountverwijdering: adres
    // stond nooit in MailerLite).
    if (res.status === 404 && options.quiet404) return null;
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
    // name alleen meesturen als de caller 'm heeft: MailerLite's upsert laat
    // weggelaten velden ongemoeid, maar een expliciete lege string overschrijft
    // een eerder ingevulde naam voor hetzelfde e-mailadres (bijv. via een
    // eerder formulier zonder naamveld, zoals de Early Member-opt-in).
    fields: {
      ...(data.name ? { name: data.name } : {}),
      ...data.fields,
    },
    groups: data.groups || [],
    status: "active",
  });
}

/**
 * Numeriek subscriber-id op e-mailadres, of null als het adres onbekend is
 * (of MailerLite niet geconfigureerd). GET /api/subscribers/{email} is de
 * enige call die een adres accepteert; forget en delete willen het id.
 */
export async function findSubscriberIdByEmail(email: string): Promise<string | null> {
  const res = (await mailerliteRequest(
    `/subscribers/${encodeURIComponent(email.trim().toLowerCase())}`,
    null,
    "GET",
    { quiet404: true },
  )) as { data?: { id?: string | number } } | null;
  const id = res?.data?.id;
  return id === undefined || id === null ? null : String(id);
}

/**
 * AVG-wissing bij MailerLite: POST /api/subscribers/{id}/forget. MailerLite
 * verwijdert de subscriber en zijn activiteit binnen 30 dagen, ook de
 * lead-historie van hetzelfde adres van voor het lidmaatschap (proefles,
 * contact). Alternatief is setSubscriberUnsubscribed, dat de gegevens laat
 * staan. Keuze: ACCOUNT_DELETION_MAILERLITE_MODE in
 * src/lib/account-deletion/config.ts. Best effort: geeft false bij fout.
 */
export async function forgetSubscriber(subscriberId: string): Promise<boolean> {
  const res = await mailerliteRequest(
    `/subscribers/${encodeURIComponent(subscriberId)}/forget`,
    {},
    "POST",
  );
  return res !== null;
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
  PROEFLES: "184521743018230980",
  CONTACT: "184521748487603774",
  YOGA_WAITLIST: "189279848522319599",
  // "Intake" groep voor de aanvraag-form op /12-weken-programma/intake.
  PROGRAMMA_INTAKE: "192439209143830447",
  // Members group voor marketing opt-in toggle vanuit /app/profiel.
  // Zet in .env.local als MAILERLITE_MEMBERS_GROUP_ID. Leeg = DB-only
  // toggle zonder MailerLite sync.
  MEMBERS: process.env.MAILERLITE_MEMBERS_GROUP_ID ?? "",
  // Generieke "blijf op de hoogte" opt-in vanuit de slide-in banner op de
  // marketingpagina's (InfoOptInBanner / /api/leads/info). Ook hergebruikt
  // door /api/leads/early-member (de opt-in onderaan /early-member): beide
  // formulieren delen dezelfde MailerLite-groep "Early Member Interested",
  // dus één env-gebonden constante i.p.v. twee. Zet in .env.local en Vercel
  // als MAILERLITE_INFO_GROUP_ID. Leeg = de subscriber wordt wel aangemaakt,
  // alleen zonder groep; de ntfy-melding bevat geen gegevens, dus de lead
  // is dan alleen via de subscriberlijst terug te vinden.
  INFO_INTERESTED: process.env.MAILERLITE_INFO_GROUP_ID ?? "",
  // Overstap-aanvraag vanuit de /early-member overstapkaart. Admin-mediated
  // (de inschrijfkosten-waiver leeft alleen in admin_create_order), dus dit
  // is een lead, geen self-service /abonnement-checkout. Zet in .env.local
  // en Vercel als MAILERLITE_OVERSTAP_GROUP_ID. Leeg = de subscriber wordt
  // wel aangemaakt, alleen zonder groep; de ntfy-melding bevat geen
  // gegevens, dus de lead is dan alleen via de subscriberlijst terug te
  // vinden. Op 2026-09-21 stond deze variabele niet in Vercel Production.
  OVERSTAP: process.env.MAILERLITE_OVERSTAP_GROUP_ID ?? "",
} as const;

// ---------------------------------------------------------------------------
// Leesfuncties voor de admin (spec-admin-email-signups.md). Anders dan de
// upsert hierboven gooien deze een getypeerde fout: de pagina toont dan een
// melding plus de Supabase-rijen, in plaats van stil een lege lijst.
// ---------------------------------------------------------------------------

export class MailerLiteError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "MailerLiteError";
    this.status = status;
  }
}

export const MAILERLITE_SUBSCRIBER_STATUSES = [
  "active",
  "unsubscribed",
  "unconfirmed",
  "bounced",
  "junk",
] as const;
export type MailerLiteSubscriberStatus = (typeof MAILERLITE_SUBSCRIBER_STATUSES)[number];

export function isMailerLiteSubscriberStatus(value: unknown): value is MailerLiteSubscriberStatus {
  return (
    typeof value === "string" &&
    (MAILERLITE_SUBSCRIBER_STATUSES as readonly string[]).includes(value)
  );
}

export interface MailerLiteGroup {
  id: string;
  name: string;
  /** Aantal subscribers per status, zoals de groepen-endpoint ze meldt. */
  counts: Record<MailerLiteSubscriberStatus, number>;
}

export interface MailerLiteSubscriber {
  id: string;
  email: string;
  status: MailerLiteSubscriberStatus;
  /** Custom fields van de account (name, last_name, phone, ...); waarden kunnen null zijn. */
  fields: Record<string, string | null>;
  /** "api", "manual", "import", ... */
  source: string | null;
  subscribedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string | null;
}

type RawPage<T> = {
  data?: T[];
  meta?: {
    next_cursor?: string | null;
    current_page?: number;
    last_page?: number;
  };
};

const PAGE_SIZE = 100;
// Harde grens tegen een eindeloze cursor-lus; 100 pagina's is 10.000 rijen.
const MAX_PAGES = 100;

/** GET die gooit in plaats van null teruggeeft. */
async function mailerliteGet<T>(path: string): Promise<T> {
  const apiKey = process.env.MAILERLITE_API_KEY?.replace(/\s/g, "");
  if (!apiKey) throw new MailerLiteError("MailerLite is niet geconfigureerd (geen API-key).");

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
  } catch (e) {
    throw new MailerLiteError(
      `MailerLite niet bereikbaar: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[Mailerlite] GET error:", res.status, path, text.slice(0, 200));
    throw new MailerLiteError(`MailerLite gaf HTTP ${res.status} op ${path}.`, res.status);
  }
  return (await res.json()) as T;
}

/**
 * Loopt een lijst-endpoint door tot de laatste pagina. De subscriber-
 * endpoints pagineren met een cursor (meta.next_cursor), de groepen-
 * endpoint met paginanummers (meta.current_page/last_page); beide worden
 * herkend.
 */
async function mailerliteList<T>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  let page = 1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const qs = new URLSearchParams({ ...params, limit: String(PAGE_SIZE) });
    if (cursor) qs.set("cursor", cursor);
    else if (page > 1) qs.set("page", String(page));
    const body = await mailerliteGet<RawPage<T>>(`${path}?${qs.toString()}`);
    rows.push(...(body.data ?? []));
    const meta = body.meta ?? {};
    if (meta.next_cursor) {
      cursor = meta.next_cursor;
      continue;
    }
    if (meta.current_page && meta.last_page && meta.current_page < meta.last_page) {
      page = meta.current_page + 1;
      continue;
    }
    break;
  }
  return rows;
}

type RawGroup = {
  id: string | number;
  name: string;
  active_count?: number;
  unsubscribed_count?: number;
  unconfirmed_count?: number;
  bounced_count?: number;
  junk_count?: number;
};

type RawSubscriber = {
  id: string | number;
  email: string;
  status: string;
  fields?: Record<string, string | null> | null;
  source?: string | null;
  subscribed_at?: string | null;
  unsubscribed_at?: string | null;
  created_at?: string | null;
};

function mapSubscriber(r: RawSubscriber): MailerLiteSubscriber {
  return {
    id: String(r.id),
    email: r.email,
    // Een onbekende status uit de API behandelen we als onbevestigd: nooit
    // als actief tonen wat MailerLite zelf niet als actief kent.
    status: isMailerLiteSubscriberStatus(r.status) ? r.status : "unconfirmed",
    fields: r.fields ?? {},
    source: r.source ?? null,
    subscribedAt: r.subscribed_at ?? null,
    unsubscribedAt: r.unsubscribed_at ?? null,
    createdAt: r.created_at ?? null,
  };
}

/** Alle groepen van de account met id, naam en tellingen per status. */
export async function listGroups(): Promise<MailerLiteGroup[]> {
  const raw = await mailerliteList<RawGroup>("/groups", {});
  return raw.map((g) => ({
    id: String(g.id),
    name: g.name,
    counts: {
      active: g.active_count ?? 0,
      unsubscribed: g.unsubscribed_count ?? 0,
      unconfirmed: g.unconfirmed_count ?? 0,
      bounced: g.bounced_count ?? 0,
      junk: g.junk_count ?? 0,
    },
  }));
}

/**
 * Alle subscribers van een groep, alle statussen. De groepen-endpoint geeft
 * zonder filter alleen actieve leden terug (geverifieerd 2026-10-06), dus we
 * vragen per status; statussen die de groep niet heeft (telling 0) slaan
 * we over als de teller is meegegeven.
 */
export async function listGroupSubscribers(
  groupId: string,
  counts?: MailerLiteGroup["counts"],
): Promise<MailerLiteSubscriber[]> {
  const rows: MailerLiteSubscriber[] = [];
  for (const status of MAILERLITE_SUBSCRIBER_STATUSES) {
    if (counts && counts[status] === 0) continue;
    const raw = await mailerliteList<RawSubscriber>(
      `/groups/${encodeURIComponent(groupId)}/subscribers`,
      { "filter[status]": status },
    );
    rows.push(...raw.map(mapSubscriber));
  }
  return rows;
}

/**
 * Alle subscribers van de account, alle statussen. Zonder statusfilter
 * geeft /subscribers alle statussen terug (geverifieerd 2026-10-06: actief
 * en afgemeld in een lijst); we vragen toch per status, zodat een stille
 * wijziging van die default geen afgemelde adressen laat verdwijnen.
 */
export async function listAllSubscribers(): Promise<MailerLiteSubscriber[]> {
  const rows: MailerLiteSubscriber[] = [];
  for (const status of MAILERLITE_SUBSCRIBER_STATUSES) {
    const raw = await mailerliteList<RawSubscriber>("/subscribers", {
      "filter[status]": status,
    });
    rows.push(...raw.map(mapSubscriber));
  }
  return rows;
}
