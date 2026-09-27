import "server-only";
import { HA_TIMEOUT_MS } from "@/lib/outbound-timeouts";

/**
 * Home Assistant REST-client (spec-kiosk-room-control.md), bereikt via Nabu
 * Casa Remote UI. Zelfde discipline als src/lib/akiles.ts en src/lib/mollie.ts:
 * zonder configuratie (HA_BASE_URL, HA_TOKEN) of buiten productie geeft
 * getHomeAssistantClient() stil null; een echte fout tijdens een call is
 * daarentegen luid (eigen error-klasse, nooit een stille slikker).
 *
 * BELANGRIJK: deze module valideert zelf niets tegen de zaal-whitelist. Ze
 * roept exact de entity_id aan die wordt meegegeven. Een caller mag dus
 * NOOIT een entity_id rechtstreeks uit gebruikersinvoer (request body,
 * queryparam) doorgeven aan runScript/setVolume/playPause; dat is de taak
 * van de whitelist-laag in PR 2 (src/lib/room-control/), die een vaste
 * enum-waarde naar het bijbehorende entity_id vertaalt voordat deze client
 * wordt aangeroepen. Zonder die laag ertussen kan `tmc-kiosk` (die technisch
 * elke entity in de installatie mag bedienen, zie discovery-kiosk-room-
 * control.md §F) door om het even welke Home Assistant-entity aangestuurd
 * worden.
 *
 * Tokenwaarde en base-URL komen nooit in een foutmelding, ook niet afgekort:
 * HomeAssistantError bevat alleen status, het pad (zonder host) en een
 * afgekapte responsbody.
 */

export class HomeAssistantError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, detail: string) {
    super(`Home Assistant ${status} op ${path}${detail ? `: ${detail}` : ""}`);
    this.name = "HomeAssistantError";
    this.status = status;
    this.path = path;
  }
}

export interface HomeAssistantState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HomeAssistantApi {
  /** Roept script.turn_on aan. Niet idempotent (mode: restart herstart de
   *  scène), dus geen retry. */
  runScript(entityId: string): Promise<void>;
  /** media_player.volume_set, level tussen 0 en 1. Idempotent: mag één
   *  retry doen op 429/503. */
  setVolume(entityId: string, level: number): Promise<void>;
  /** media_player.media_play_pause: een toggle, dus nooit retryen (een
   *  retry zou de vorige poging ongedaan kunnen maken). */
  playPause(entityId: string): Promise<void>;
  /** media_player.media_pause: geen toggle maar een doelstand, dus
   *  idempotent en met één retry op 429/503. Voor "alles uit"
   *  (spec-kiosk-room-control.md PR 2), waar een toggle muziek zou kunnen
   *  starten die net uit stond. */
  pause(entityId: string): Promise<void>;
  /** Eén GET /api/states, lokaal gefilterd op de meegegeven ids. Idempotent:
   *  mag één retry doen op 429/503. */
  getStates(entityIds: string[]): Promise<HomeAssistantState[]>;
}

// ---------------------------------------------------------------------------
// Configuratie
// ---------------------------------------------------------------------------

export type HomeAssistantConfigResolution =
  | { ok: true; baseUrl: string; token: string }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "wrong_environment"; vercelEnv: string };

/**
 * Pure functie over een env-object, apart getest zonder proces-globals aan
 * te raken (zelfde opzet als resolveMollieApiKey in src/lib/mollie.ts).
 *
 * Buiten productie geeft dit altijd wrong_environment, TENZIJ
 * HA_ALLOW_NON_PRODUCTION=1 expliciet gezet is. Zonder die guard zou een
 * preview-deployment (die op hetzelfde Supabase-project draait als
 * productie) de echte lampen en Sonos-spelers in de studio kunnen bedienen.
 * De opt-in is bedoeld voor gerichte lokale tests tegen de echte installatie,
 * nooit als permanente instelling op Vercel.
 */
export function resolveHomeAssistantConfig(
  env: NodeJS.ProcessEnv = process.env,
): HomeAssistantConfigResolution {
  const baseUrl = env.HA_BASE_URL;
  const token = env.HA_TOKEN;
  if (!baseUrl || !token) return { ok: false, reason: "missing" };

  const vercelEnv = env.VERCEL_ENV ?? "";
  const allowNonProduction = env.HA_ALLOW_NON_PRODUCTION === "1";
  if (vercelEnv !== "production" && !allowNonProduction) {
    return { ok: false, reason: "wrong_environment", vercelEnv };
  }
  return { ok: true, baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

export function isHomeAssistantConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveHomeAssistantConfig(env).ok;
}

// ---------------------------------------------------------------------------
// REST-laag: timeout, retry, foutafhandeling
// ---------------------------------------------------------------------------

/**
 * Alleen voor de idempotente calls (getStates, setVolume). Zelfde opzet als
 * src/lib/akiles.ts, maar met een lagere bovengrens: één retry is genoeg om
 * een kortstondige 429/503 op te vangen zonder de bedienknop lang te laten
 * hangen; de gebruiker staat er met de vinger bij te wachten.
 */
const MAX_ATTEMPTS_RETRIABLE = 2;
const DEFAULT_RETRY_MS = 1_000;

function retryDelayMs(res: Response): number {
  const header = res.headers.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, 10_000)
    : DEFAULT_RETRY_MS;
}

/**
 * fetch met timeout. Een timeout of netwerkfout wordt een HomeAssistantError
 * met status 504, die op precies dezelfde plek gevangen wordt als elke
 * andere fout van deze dienst (zie de module-comment): nooit een throw naar
 * een caller die dat niet verwacht.
 */
async function fetchHa(url: string, label: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(HA_TIMEOUT_MS) });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const detail =
      name === "TimeoutError" || name === "AbortError"
        ? `geen antwoord binnen ${HA_TIMEOUT_MS} ms`
        : `netwerkfout: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
    throw new HomeAssistantError(504, label, detail);
  }
}

async function parseResponse<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      // Responsbody's van Home Assistant bevatten geen credentials; kort
      // houden voor de logs.
      detail = (await res.text()).slice(0, 200);
    } catch {
      detail = "";
    }
    throw new HomeAssistantError(res.status, label, detail);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

interface RequestOptions {
  retriable?: boolean;
}

async function request<T>(
  baseUrl: string,
  token: string,
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<T> {
  const label = `${method} ${path}`;
  const maxAttempts = options.retriable ? MAX_ATTEMPTS_RETRIABLE : 1;
  for (let attempt = 1; ; attempt++) {
    const res = await fetchHa(`${baseUrl}${path}`, label, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (options.retriable && (res.status === 429 || res.status === 503) && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res)));
      continue;
    }
    return parseResponse<T>(res, label);
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function buildClient(baseUrl: string, token: string): HomeAssistantApi {
  return {
    async runScript(entityId) {
      await request<unknown>(
        baseUrl,
        token,
        "POST",
        "/api/services/script/turn_on",
        { entity_id: entityId },
        { retriable: false },
      );
    },

    async setVolume(entityId, level) {
      // Basiscontract van de parameter (0 tot 1), geen whitelist-logica: dat
      // is een enum-check op entityId/actie in PR 2, niet hier.
      if (!Number.isFinite(level) || level < 0 || level > 1) {
        throw new HomeAssistantError(
          400,
          "media_player/volume_set",
          "level moet een getal tussen 0 en 1 zijn",
        );
      }
      await request<unknown>(
        baseUrl,
        token,
        "POST",
        "/api/services/media_player/volume_set",
        { entity_id: entityId, volume_level: level },
        { retriable: true },
      );
    },

    async playPause(entityId) {
      await request<unknown>(
        baseUrl,
        token,
        "POST",
        "/api/services/media_player/media_play_pause",
        { entity_id: entityId },
        { retriable: false },
      );
    },

    async pause(entityId) {
      await request<unknown>(
        baseUrl,
        token,
        "POST",
        "/api/services/media_player/media_pause",
        { entity_id: entityId },
        { retriable: true },
      );
    },

    async getStates(entityIds) {
      const all = await request<HomeAssistantState[]>(
        baseUrl,
        token,
        "GET",
        "/api/states",
        undefined,
        { retriable: true },
      );
      const wanted = new Set(entityIds);
      return all.filter((s) => wanted.has(s.entity_id));
    },
  };
}

/**
 * null zolang HA niet geconfigureerd is of de omgevingsguard weigert (zie
 * resolveHomeAssistantConfig); de zaalbediening no-opt dan stil, zelfde
 * patroon als getAkilesClient() en getMollieClient().
 */
export function getHomeAssistantClient(
  env: NodeJS.ProcessEnv = process.env,
): HomeAssistantApi | null {
  const config = resolveHomeAssistantConfig(env);
  if (!config.ok) return null;
  return buildClient(config.baseUrl, config.token);
}
