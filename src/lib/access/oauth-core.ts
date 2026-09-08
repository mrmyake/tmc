import {
  ACCESS_TOKEN_MIN_REMAINING_MS,
  REFRESH_CLAIM_LEASE_MS,
} from "./constants";

/**
 * Kern van de Akiles OAuth-tokenlaag, zonder server-only imports en zonder
 * directe DB- of netwerkcalls: alles loopt via OAuthDeps, zodat de
 * claim-logica in scripts/access/oauth-core.test.mts met fakes bewezen is.
 * De wiring op de echte service-role-client staat in src/lib/akiles.ts.
 *
 * Waarom een claim: Akiles roteert het refresh token bij elke verversing
 * en het oude is daarna niet gegarandeerd bruikbaar. Twee gelijktijdige
 * verversingen (cron plus webhook, twee webhooks, een lid dat zijn PIN
 * toont) zouden elkaar dus kapotmaken. De claim is een atomische
 * conditional UPDATE op de single-row tabel: wie hem wint ververst, wie
 * hem verliest wacht en herleest. Een verlopen lease (gecrashte winnaar)
 * mag door de volgende worden overgenomen.
 *
 * Invarianten:
 *  - Buiten productie wordt de tokenrij nooit gelezen of geschreven.
 *  - Ontbrekende configuratie is stil (geen client); een mislukte
 *    verversing is dat NIET: fout naar de rij, een ntfy-alarm, en een throw.
 *  - Tokenwaarden verschijnen nooit in logs, fouten of events.
 */

export interface OAuthTokenRow {
  access_token: string | null;
  access_token_expires_at: string | null;
  refresh_token: string | null;
  refresh_claim_until: string | null;
  last_refresh_error: string | null;
}

export interface TokenResponse {
  access_token: string;
  /** Seconden. */
  expires_in: number;
  refresh_token?: string;
}

export interface OAuthTokenDb {
  readRow(): Promise<OAuthTokenRow | null>;
  /** True als er een refresh token staat; leest de waarde zelf niet. */
  hasRefreshToken(): Promise<boolean>;
  /**
   * Atomische claim: zet refresh_claim_until op untilIso, uitsluitend als
   * de huidige claim NULL is of voor nowIso ligt. True = gewonnen.
   */
  tryClaim(nowIso: string, untilIso: string): Promise<boolean>;
  saveRefreshed(row: {
    access_token: string;
    access_token_expires_at: string;
    refresh_token: string;
    last_refreshed_at: string;
  }): Promise<void>;
  saveFailure(error: string): Promise<void>;
}

export interface OAuthDeps {
  db: OAuthTokenDb;
  env: {
    isProduction: boolean;
    clientId: string | null;
    clientSecret: string | null;
  };
  /** POST grant_type=refresh_token; gooit bij een niet-2xx antwoord. */
  refresh(refreshToken: string): Promise<TokenResponse>;
  notify(title: string, message: string): Promise<void>;
  now(): Date;
  sleep(ms: number): Promise<void>;
  log: {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
}

export class AkilesNotProductionError extends Error {
  constructor() {
    super(
      "Akiles-tokens zijn alleen op productie beschikbaar (VERCEL_ENV !== production); de tokenrij is niet aangeraakt",
    );
    this.name = "AkilesNotProductionError";
  }
}

export class AkilesTokenError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AkilesTokenError";
    this.status = status;
  }
}

/** Wachttijd van een claim-verliezer tussen twee herlezingen. */
const LOSER_WAIT_MS = 1_000;
/** Aantal herlezingen van een verliezer; blijft ruim binnen de lease van 30 s. */
const LOSER_MAX_ATTEMPTS = 8;

export function hasEnvConfig(env: OAuthDeps["env"]): boolean {
  return Boolean(env.clientId && env.clientSecret);
}

/**
 * Geconfigureerd = client id, client secret en een opgeslagen refresh token.
 * Buiten productie altijd false (en geen DB-read): previews delen het
 * Supabase-project en mogen het productie-refreshtoken niet zien of roteren.
 */
export async function isConfiguredCore(deps: OAuthDeps): Promise<boolean> {
  if (!hasEnvConfig(deps.env)) return false;
  if (!deps.env.isProduction) return false;
  return deps.db.hasRefreshToken();
}

function tokenStillValid(row: OAuthTokenRow, now: Date): row is OAuthTokenRow & {
  access_token: string;
  access_token_expires_at: string;
} {
  if (!row.access_token || !row.access_token_expires_at) return false;
  return (
    new Date(row.access_token_expires_at).getTime() - now.getTime() >
    ACCESS_TOKEN_MIN_REMAINING_MS
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function refreshAsClaimWinner(
  deps: OAuthDeps,
  refreshToken: string,
): Promise<string> {
  const now = deps.now();
  try {
    const res = await deps.refresh(refreshToken);
    if (!res.access_token || !Number.isFinite(res.expires_in)) {
      throw new AkilesTokenError(502, "Akiles token-antwoord zonder access_token of expires_in");
    }
    const expiresAt = new Date(now.getTime() + res.expires_in * 1000).toISOString();
    await deps.db.saveRefreshed({
      access_token: res.access_token,
      access_token_expires_at: expiresAt,
      // Roterend: het nieuwe token wordt de bron. Ontbreekt het (zou niet
      // mogen), dan blijft het oude staan in plaats van null.
      refresh_token: res.refresh_token ?? refreshToken,
      last_refreshed_at: now.toISOString(),
    });
    deps.log.info("[akiles-oauth] access token ververst", { expires_at: expiresAt });
    return res.access_token;
  } catch (err) {
    const message = errorMessage(err).slice(0, 500);
    deps.log.error("[akiles-oauth] verversen mislukt", { error: message });
    // Claim wissen zodat een volgende invocatie het opnieuw kan proberen;
    // de foutmelding bevat geen tokenwaarden (zie akiles.ts, parse van het
    // token-antwoord).
    await deps.db.saveFailure(message);
    await deps.notify(
      "Akiles: token verversen mislukt",
      `De Akiles-koppeling kon geen nieuw access token halen: ${message}. Deurtoegang synct niet meer tot dit is opgelost; mogelijk moet de eenmalige autorisatie opnieuw (zie spec-akiles-access.md, runbook).`,
    );
    if (err instanceof AkilesTokenError) throw err;
    throw new AkilesTokenError(502, `Akiles token verversen mislukt: ${message}`);
  }
}

/**
 * Geeft een geldig access token terug. Volgorde:
 *  1. productieguard;
 *  2. rij lezen; geldig token (> 10 min resterend) meteen terug;
 *  3. claim proberen; gewonnen: verversen en opslaan;
 *  4. verloren: kort wachten en herlezen, binnen de lease; een verlopen
 *     claim mag daarbij alsnog worden overgenomen.
 */
export async function getAccessTokenCore(deps: OAuthDeps): Promise<string> {
  if (!deps.env.isProduction) {
    deps.log.error(
      "[akiles-oauth] geblokkeerd: geen productieomgeving, tokenrij niet aangeraakt",
    );
    throw new AkilesNotProductionError();
  }
  if (!hasEnvConfig(deps.env)) {
    throw new AkilesTokenError(503, "Akiles OAuth niet geconfigureerd (client id of secret ontbreekt)");
  }

  for (let attempt = 0; attempt <= LOSER_MAX_ATTEMPTS; attempt++) {
    const now = deps.now();
    const row = await deps.db.readRow();
    if (!row) {
      throw new AkilesTokenError(503, "tmc.akiles_oauth_token ontbreekt; de migratie seedt die rij");
    }
    if (tokenStillValid(row, now)) return row.access_token;
    if (!row.refresh_token) {
      throw new AkilesTokenError(
        503,
        "Geen Akiles refresh token opgeslagen; voer de eenmalige autorisatie uit via /api/akiles/oauth/start",
      );
    }

    const nowIso = now.toISOString();
    const untilIso = new Date(now.getTime() + REFRESH_CLAIM_LEASE_MS).toISOString();
    const won = await deps.db.tryClaim(nowIso, untilIso);
    if (won) {
      return refreshAsClaimWinner(deps, row.refresh_token);
    }
    // Verloren: een ander ververst nu. Nooit zelf alsnog verversen; wachten
    // en herlezen. Is de lease straks verlopen zonder nieuw token, dan wint
    // de volgende ronde van deze lus de claim alsnog.
    if (attempt < LOSER_MAX_ATTEMPTS) await deps.sleep(LOSER_WAIT_MS);
  }

  throw new AkilesTokenError(
    503,
    "Akiles access token niet beschikbaar: een andere invocatie hield de refresh-claim vast en leverde geen nieuw token",
  );
}
