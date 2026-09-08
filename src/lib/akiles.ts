import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/ntfy";
import type {
  AkilesApi,
  AkilesGroupAssociation,
  AkilesIdOnly,
} from "@/lib/access/types";
import {
  AKILES_OAUTH_REDIRECT_URI,
  AKILES_OAUTH_TOKEN_URL,
  AKILES_TOKEN_ID,
} from "@/lib/access/constants";
import {
  getAccessTokenCore,
  isConfiguredCore,
  resolveOAuthEnv,
  type OAuthDeps,
  type OAuthTokenDb,
  type OAuthTokenRow,
  type TokenResponse,
} from "@/lib/access/oauth-core";

/**
 * Akiles REST-client (api.akiles.app/v2; bron github.com/akiles/openapi-specs,
 * openapi.yaml). Authenticatie is OAuth 2.0 authorization_code met een
 * roterend refresh token (auth.akiles.app); de legacy API key bestaat niet
 * meer voor nieuwe organisaties. De tokenlaag zelf staat in
 * src/lib/access/oauth-core.ts (claim tegen gelijktijdige verversing); dit
 * bestand is de wiring op env, service-role-client en ntfy.
 *
 * Zelfde discipline als src/lib/mollie.ts en src/lib/push.ts: zonder
 * configuratie (AKILES_CLIENT_ID, AKILES_CLIENT_SECRET en een opgeslagen
 * refresh token, en uitsluitend op productie) geeft getAkilesClient() null
 * en doet de hele toegangssync niets. Een MISLUKTE verversing is daarentegen
 * luid: fout in de tokenrij, een ntfy-alarm en een throw.
 *
 * Client id en secret zijn organisatie-credentials en blijven server-side;
 * er is geen NEXT_PUBLIC-variant. Tokenwaarden worden nergens gelogd, ook
 * niet afgekort; foutmeldingen bevatten alleen status en pad.
 */

const BASE_URL = "https://api.akiles.app/v2";

export class AkilesApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, detail: string) {
    super(`Akiles ${status} op ${path}${detail ? `: ${detail}` : ""}`);
    this.name = "AkilesApiError";
    this.status = status;
    this.path = path;
  }
}

// ---------------------------------------------------------------------------
// OAuth-tokenlaag: wiring
// ---------------------------------------------------------------------------

function oauthEnv(): OAuthDeps["env"] {
  return resolveOAuthEnv(process.env);
}

function buildTokenDb(): OAuthTokenDb {
  const admin = createAdminClient();
  return {
    async readRow() {
      const { data, error } = await admin
        .from("akiles_oauth_token")
        .select(
          "access_token, access_token_expires_at, refresh_token, refresh_claim_until, last_refresh_error",
        )
        .eq("id", AKILES_TOKEN_ID)
        .maybeSingle();
      if (error) throw new AkilesApiError(500, "db akiles_oauth_token", error.message);
      return (data as OAuthTokenRow | null) ?? null;
    },
    async hasRefreshToken() {
      // Alleen het id: de tokenwaarde zelf wordt hier niet opgehaald.
      const { data, error } = await admin
        .from("akiles_oauth_token")
        .select("id")
        .eq("id", AKILES_TOKEN_ID)
        .not("refresh_token", "is", null)
        .maybeSingle();
      if (error) throw new AkilesApiError(500, "db akiles_oauth_token", error.message);
      return Boolean(data);
    },
    async tryClaim(nowIso, untilIso) {
      // Een enkele conditional UPDATE: atomisch in Postgres. PostgREST kent
      // geen now() als filterwaarde, vandaar de meegegeven ISO-timestamp.
      const { data, error } = await admin
        .from("akiles_oauth_token")
        .update({ refresh_claim_until: untilIso, updated_at: nowIso })
        .eq("id", AKILES_TOKEN_ID)
        .or(`refresh_claim_until.is.null,refresh_claim_until.lt.${nowIso}`)
        .select("id");
      if (error) throw new AkilesApiError(500, "db akiles_oauth_token claim", error.message);
      return (data ?? []).length === 1;
    },
    async saveRefreshed(row) {
      const { error } = await admin
        .from("akiles_oauth_token")
        .update({
          ...row,
          refresh_claim_until: null,
          last_refresh_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", AKILES_TOKEN_ID);
      if (error) throw new AkilesApiError(500, "db akiles_oauth_token save", error.message);
    },
    async saveFailure(message) {
      const { error } = await admin
        .from("akiles_oauth_token")
        .update({
          refresh_claim_until: null,
          last_refresh_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", AKILES_TOKEN_ID);
      if (error) {
        console.error("[akiles-oauth] last_refresh_error wegschrijven mislukt", error.message);
      }
    },
  };
}

/**
 * POST naar het token-endpoint. Het antwoord wordt geparset en alleen de
 * velden die we nodig hebben komen terug; bij een fout gaat hooguit
 * error/error_description mee, nooit een tokenwaarde.
 */
async function postTokenEndpoint(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(AKILES_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string; error_description?: string };
      detail = [body.error, body.error_description].filter(Boolean).join(": ").slice(0, 200);
    } catch {
      detail = "";
    }
    throw new AkilesApiError(res.status, "POST /oauth2/token", detail);
  }
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!body.access_token || typeof body.expires_in !== "number") {
    throw new AkilesApiError(502, "POST /oauth2/token", "antwoord zonder access_token of expires_in");
  }
  return {
    access_token: body.access_token,
    expires_in: body.expires_in,
    refresh_token: body.refresh_token,
  };
}

function buildOAuthDeps(): OAuthDeps {
  const env = oauthEnv();
  return {
    db: buildTokenDb(),
    env,
    refresh: (refreshToken) =>
      postTokenEndpoint({
        grant_type: "refresh_token",
        client_id: env.clientId ?? "",
        client_secret: env.clientSecret ?? "",
        refresh_token: refreshToken,
      }),
    notify: (title, message) => sendNotification(title, message, "rotating_light"),
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: {
      info: (message, meta) => console.info(message, meta ?? ""),
      error: (message, meta) => console.error(message, meta ?? ""),
    },
  };
}

/** Client id, client secret en een opgeslagen refresh token, en alleen op productie. */
export async function isAkilesConfigured(): Promise<boolean> {
  try {
    return await isConfiguredCore(buildOAuthDeps());
  } catch (err) {
    console.error("[akiles-oauth] configuratiecheck mislukt", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Geldig access token; ververst zo nodig onder de claim. Gooit bij falen. */
export async function getAccessToken(): Promise<string> {
  return getAccessTokenCore(buildOAuthDeps());
}

/**
 * Eenmalige autorisatie (callback-route): wisselt de authorization code in
 * en slaat access en refresh token op. De code is eenmalig en verloopt na
 * vijftien minuten. Alleen op productie: de redirect_uri is de productie-URL.
 */
export async function exchangeAuthorizationCode(code: string): Promise<void> {
  const env = oauthEnv();
  if (!env.isProduction) {
    throw new AkilesApiError(403, "oauth exchange", "alleen op productie");
  }
  if (!env.clientId || !env.clientSecret) {
    throw new AkilesApiError(503, "oauth exchange", "AKILES_CLIENT_ID of AKILES_CLIENT_SECRET ontbreekt");
  }
  const now = new Date();
  const res = await postTokenEndpoint({
    grant_type: "authorization_code",
    client_id: env.clientId,
    client_secret: env.clientSecret,
    code,
    redirect_uri: AKILES_OAUTH_REDIRECT_URI,
  });
  if (!res.refresh_token) {
    // Niets opslaan: een access token zonder refresh token is na een uur
    // dood en zou de koppeling "gekoppeld" laten lijken terwijl hij dat
    // niet is. De offline scope levert het refresh token; ontbreekt die
    // in de app-registratie of in de toestemming, dan komt hij niet mee.
    throw new AkilesApiError(
      502,
      "POST /oauth2/token",
      "antwoord zonder refresh_token: de offline scope ontbrak in de registratie of de toestemming; er is niets opgeslagen",
    );
  }
  await buildTokenDb().saveRefreshed({
    access_token: res.access_token,
    access_token_expires_at: new Date(now.getTime() + res.expires_in * 1000).toISOString(),
    refresh_token: res.refresh_token,
    last_refreshed_at: now.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// REST-client
// ---------------------------------------------------------------------------

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * De OpenAPI-spec noemt geen rate limit en geen maximale paginagrootte.
 * Defensief: bij 429 of 503 wachten we op Retry-After (of 2 seconden) en
 * proberen we hooguit drie keer. De sync loopt sequentieel per profiel
 * (circa vijf calls per lid), dus een volledige ledenbase blijft rustig.
 */
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MS = 2000;

function retryDelayMs(res: Response): number {
  const header = res.headers.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, 30_000)
    : DEFAULT_RETRY_MS;
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    // Per poging opnieuw opgehaald: een lange run kan een verversing
    // meemaken, en de cache in de tokenrij maakt dit goedkoop.
    const accessToken = await getAccessToken();
    const res = await fetchOnce(accessToken, method, path, body);
    if ((res.status === 429 || res.status === 503) && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res)));
      continue;
    }
    return parseResponse<T>(res, method, path);
  }
}

async function fetchOnce(
  accessToken: string,
  method: Method,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

async function parseResponse<T>(res: Response, method: Method, path: string): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      // Foutbody's bevatten geen credentials; kort houden voor de logs.
      detail = (await res.text()).slice(0, 200);
    } catch {
      detail = "";
    }
    throw new AkilesApiError(res.status, `${method} ${path}`, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface ListResponse<T> {
  data: T[];
  has_next?: boolean;
  cursor_next?: string;
}

async function listAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  // Bovengrens tegen een defecte cursor; een member heeft hooguit een
  // handvol associaties.
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const res = await request<ListResponse<T>>("GET", `${path}?${query}`);
    items.push(...(res.data ?? []));
    if (!res.has_next || !res.cursor_next) break;
    cursor = res.cursor_next;
  }
  return items;
}

function idOnly(obj: { id: string }): AkilesIdOnly {
  return { id: obj.id };
}

const enc = encodeURIComponent;

const client: AkilesApi = {
  createSchedule: async (body) =>
    idOnly(await request<{ id: string }>("POST", "/schedules", body)),
  editSchedule: async (scheduleId, body) =>
    idOnly(await request<{ id: string }>("PATCH", `/schedules/${enc(scheduleId)}`, body)),

  createMemberGroup: async (body) =>
    idOnly(await request<{ id: string }>("POST", "/member_groups", body)),
  editMemberGroup: async (groupId, body) =>
    idOnly(
      await request<{ id: string }>("PATCH", `/member_groups/${enc(groupId)}`, body),
    ),

  createMember: async (body) =>
    idOnly(await request<{ id: string }>("POST", "/members", body)),
  editMember: async (memberId, body) =>
    idOnly(await request<{ id: string }>("PATCH", `/members/${enc(memberId)}`, body)),

  // POST /members/{id}/pins antwoordt met member_pin_revealed (inclusief de
  // gegenereerde PIN). We geven bewust alleen het id door: de waarde mag
  // het syncpad nooit bereiken en wordt niet gelogd of opgeslagen.
  createPin: async (memberId, body) =>
    idOnly(await request<{ id: string }>("POST", `/members/${enc(memberId)}/pins`, body)),
  deletePin: async (memberId, pinId) => {
    await request<unknown>("DELETE", `/members/${enc(memberId)}/pins/${enc(pinId)}`);
  },
  revealPin: async (memberId, pinId) => {
    const res = await request<{ pin: string }>(
      "POST",
      `/members/${enc(memberId)}/pins/${enc(pinId)}/reveal`,
      {},
    );
    return { pin: res.pin };
  },

  // Idem: member_magic_link_revealed bevat de link; alleen het id gaat door.
  createMagicLink: async (memberId) =>
    idOnly(
      await request<{ id: string }>("POST", `/members/${enc(memberId)}/magic_links`, {}),
    ),
  revealMagicLink: async (memberId, magicLinkId) => {
    const res = await request<{ link: string }>(
      "POST",
      `/members/${enc(memberId)}/magic_links/${enc(magicLinkId)}/reveal`,
      {},
    );
    return { link: res.link };
  },

  listGroupAssociations: async (memberId) =>
    (
      await listAll<AkilesGroupAssociation>(`/members/${enc(memberId)}/group_associations`)
    ).map((a) => ({
      id: a.id,
      member_group_id: a.member_group_id,
      is_deleted: a.is_deleted,
    })),
  createGroupAssociation: async (memberId, body) =>
    idOnly(
      await request<{ id: string }>(
        "POST",
        `/members/${enc(memberId)}/group_associations`,
        body,
      ),
    ),
  deleteGroupAssociation: async (memberId, associationId) => {
    await request<unknown>(
      "DELETE",
      `/members/${enc(memberId)}/group_associations/${enc(associationId)}`,
    );
  },
};

/**
 * null zolang de koppeling niet geconfigureerd is (zie isAkilesConfigured);
 * de sync en de reveal no-oppen dan stil. Elke call van de client haalt het
 * access token via getAccessToken(), dat zo nodig ververst onder de claim.
 */
export async function getAkilesClient(): Promise<AkilesApi | null> {
  return (await isAkilesConfigured()) ? client : null;
}
