import "server-only";
import type {
  AkilesApi,
  AkilesGroupAssociation,
  AkilesIdOnly,
} from "@/lib/access/types";

/**
 * Akiles REST-client (api.akiles.app/v2, bearer-auth; bron:
 * github.com/akiles/openapi-specs, openapi.yaml). Zelfde discipline als
 * src/lib/mollie.ts en src/lib/push.ts: zonder AKILES_API_KEY geeft
 * getAkilesClient() null en doet de hele toegangssync niets.
 *
 * De key is een organisatie-credential en blijft server-side; er is geen
 * NEXT_PUBLIC-variant en de client wordt nooit aan de browser gegeven.
 *
 * Alleen de calls die de sync (src/lib/access/sync-core.ts) en de reveal
 * (src/lib/access/reveal.ts) nodig hebben. Reveal-responses worden nooit
 * gelogd; foutmeldingen bevatten alleen status en pad.
 */

const BASE_URL = "https://api.akiles.app/v2";

export function isAkilesConfigured(): boolean {
  return Boolean(process.env.AKILES_API_KEY);
}

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

async function request<T>(
  apiKey: string,
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchOnce(apiKey, method, path, body);
    if ((res.status === 429 || res.status === 503) && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res)));
      continue;
    }
    return parseResponse<T>(res, method, path);
  }
}

async function fetchOnce(
  apiKey: string,
  method: Method,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

async function listAll<T>(apiKey: string, path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  // Bovengrens tegen een defecte cursor; een member heeft hooguit een
  // handvol associaties.
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const res = await request<ListResponse<T>>(apiKey, "GET", `${path}?${query}`);
    items.push(...(res.data ?? []));
    if (!res.has_next || !res.cursor_next) break;
    cursor = res.cursor_next;
  }
  return items;
}

function idOnly(obj: { id: string }): AkilesIdOnly {
  return { id: obj.id };
}

export function getAkilesClient(): AkilesApi | null {
  const apiKey = process.env.AKILES_API_KEY;
  if (!apiKey) return null;
  const enc = encodeURIComponent;

  return {
    createSchedule: async (body) =>
      idOnly(await request<{ id: string }>(apiKey, "POST", "/schedules", body)),
    editSchedule: async (scheduleId, body) =>
      idOnly(
        await request<{ id: string }>(
          apiKey,
          "PATCH",
          `/schedules/${enc(scheduleId)}`,
          body,
        ),
      ),

    createMemberGroup: async (body) =>
      idOnly(await request<{ id: string }>(apiKey, "POST", "/member_groups", body)),
    editMemberGroup: async (groupId, body) =>
      idOnly(
        await request<{ id: string }>(
          apiKey,
          "PATCH",
          `/member_groups/${enc(groupId)}`,
          body,
        ),
      ),

    createMember: async (body) =>
      idOnly(await request<{ id: string }>(apiKey, "POST", "/members", body)),
    editMember: async (memberId, body) =>
      idOnly(
        await request<{ id: string }>(
          apiKey,
          "PATCH",
          `/members/${enc(memberId)}`,
          body,
        ),
      ),

    // POST /members/{id}/pins antwoordt met member_pin_revealed (inclusief de
    // gegenereerde PIN). We geven bewust alleen het id door: de waarde mag
    // het syncpad nooit bereiken en wordt niet gelogd of opgeslagen.
    createPin: async (memberId, body) =>
      idOnly(
        await request<{ id: string }>(
          apiKey,
          "POST",
          `/members/${enc(memberId)}/pins`,
          body,
        ),
      ),
    deletePin: async (memberId, pinId) => {
      await request<unknown>(
        apiKey,
        "DELETE",
        `/members/${enc(memberId)}/pins/${enc(pinId)}`,
      );
    },
    revealPin: async (memberId, pinId) => {
      const res = await request<{ pin: string }>(
        apiKey,
        "POST",
        `/members/${enc(memberId)}/pins/${enc(pinId)}/reveal`,
        {},
      );
      return { pin: res.pin };
    },

    // Idem: member_magic_link_revealed bevat de link; alleen het id gaat door.
    createMagicLink: async (memberId) =>
      idOnly(
        await request<{ id: string }>(
          apiKey,
          "POST",
          `/members/${enc(memberId)}/magic_links`,
          {},
        ),
      ),
    revealMagicLink: async (memberId, magicLinkId) => {
      const res = await request<{ link: string }>(
        apiKey,
        "POST",
        `/members/${enc(memberId)}/magic_links/${enc(magicLinkId)}/reveal`,
        {},
      );
      return { link: res.link };
    },

    listGroupAssociations: async (memberId) =>
      (
        await listAll<AkilesGroupAssociation>(
          apiKey,
          `/members/${enc(memberId)}/group_associations`,
        )
      ).map((a) => ({
        id: a.id,
        member_group_id: a.member_group_id,
        is_deleted: a.is_deleted,
      })),
    createGroupAssociation: async (memberId, body) =>
      idOnly(
        await request<{ id: string }>(
          apiKey,
          "POST",
          `/members/${enc(memberId)}/group_associations`,
          body,
        ),
      ),
    deleteGroupAssociation: async (memberId, associationId) => {
      await request<unknown>(
        apiKey,
        "DELETE",
        `/members/${enc(memberId)}/group_associations/${enc(associationId)}`,
      );
    },
  };
}
