/**
 * Draait de ECHTE OAuth-tokenkern (src/lib/access/oauth-core.ts) met fakes
 * voor de tokenrij, het token-endpoint, ntfy en de klok. Bewijst de claim
 * tegen gelijktijdige verversing, de productieguard en het luide falen.
 * Run: npm run test:access
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AkilesNotProductionError,
  AkilesTokenError,
  getAccessTokenCore,
  isConfiguredCore,
  type OAuthDeps,
  type OAuthTokenDb,
  type OAuthTokenRow,
  type TokenResponse,
} from "../../src/lib/access/oauth-core";

const NOW = new Date("2026-09-09T02:15:00.000Z");
const HOUR = 3_600_000;

class FakeTokenDb implements OAuthTokenDb {
  row: OAuthTokenRow & { last_refreshed_at: string | null };
  reads = 0;
  writes = 0;
  claimAttempts = 0;
  /** Alle refresh tokens die ooit zijn opgeslagen, in volgorde. */
  refreshHistory: string[] = [];

  constructor(initial: Partial<OAuthTokenRow> = {}) {
    this.row = {
      access_token: null,
      access_token_expires_at: null,
      refresh_token: "rt_0",
      refresh_claim_until: null,
      last_refresh_error: null,
      last_refreshed_at: null,
      ...initial,
    };
    if (this.row.refresh_token) this.refreshHistory.push(this.row.refresh_token);
  }

  async readRow() {
    this.reads++;
    return { ...this.row };
  }
  async hasRefreshToken() {
    this.reads++;
    return this.row.refresh_token !== null;
  }
  async tryClaim(nowIso: string, untilIso: string) {
    this.claimAttempts++;
    const current = this.row.refresh_claim_until;
    // Zelfde conditie als de PostgREST-update: null of voor nowIso.
    if (current === null || current < nowIso) {
      this.row.refresh_claim_until = untilIso;
      this.writes++;
      return true;
    }
    return false;
  }
  async saveRefreshed(r: {
    access_token: string;
    access_token_expires_at: string;
    refresh_token: string;
    last_refreshed_at: string;
  }) {
    this.writes++;
    this.row = {
      ...this.row,
      ...r,
      refresh_claim_until: null,
      last_refresh_error: null,
    };
    this.refreshHistory.push(r.refresh_token);
  }
  async saveFailure(error: string) {
    this.writes++;
    this.row.refresh_claim_until = null;
    this.row.last_refresh_error = error;
  }
}

interface Harness {
  deps: OAuthDeps;
  db: FakeTokenDb;
  refreshCalls: string[];
  notifications: string[];
  logs: string[];
  /** Laat de fake-refresh pas antwoorden als dit wordt aangeroepen. */
  releaseRefresh: () => void;
}

function makeHarness(options: {
  db?: FakeTokenDb;
  isProduction?: boolean;
  configured?: boolean;
  refreshFails?: boolean;
  holdRefresh?: boolean;
  now?: () => Date;
} = {}): Harness {
  const db = options.db ?? new FakeTokenDb();
  const refreshCalls: string[] = [];
  const notifications: string[] = [];
  const logs: string[] = [];
  let seq = 0;
  let release: () => void = () => {};
  const gate = options.holdRefresh
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();

  const deps: OAuthDeps = {
    db,
    env: {
      isProduction: options.isProduction ?? true,
      clientId: options.configured === false ? null : "client_x",
      clientSecret: options.configured === false ? null : "secret_x",
    },
    refresh: async (refreshToken: string): Promise<TokenResponse> => {
      refreshCalls.push(refreshToken);
      await gate;
      if (options.refreshFails) throw new AkilesTokenError(400, "invalid_grant: token revoked");
      seq++;
      return { access_token: `at_${seq}`, expires_in: 3599, refresh_token: `rt_${seq}` };
    },
    notify: async (title) => {
      notifications.push(title);
    },
    now: options.now ?? (() => NOW),
    sleep: async () => {
      // Verkorte wachttijd (echt 1 s in productie): de verliezer moet nog
      // in zijn lus zitten wanneer de test de winnaar loslaat.
      await new Promise((resolve) => setTimeout(resolve, 2));
    },
    log: {
      info: (m) => logs.push(`info:${m}`),
      error: (m) => logs.push(`error:${m}`),
    },
  };
  return { deps, db, refreshCalls, notifications, logs, releaseRefresh: () => release() };
}

test("geen configuratie: stille no-op, geen DB-reads", async () => {
  const h = makeHarness({ configured: false });
  assert.equal(await isConfiguredCore(h.deps), false);
  assert.equal(h.db.reads, 0);
  await assert.rejects(() => getAccessTokenCore(h.deps), AkilesTokenError);
  assert.equal(h.db.reads, 0, "ook getAccessToken leest niets zonder configuratie");
  assert.equal(h.db.writes, 0);
  assert.equal(h.notifications.length, 0, "ontbrekende configuratie alarmeert niet");
});

test("niet-productie: getAccessToken gooit en raakt de tokenrij niet aan", async () => {
  const h = makeHarness({ isProduction: false });
  await assert.rejects(() => getAccessTokenCore(h.deps), AkilesNotProductionError);
  assert.equal(h.db.reads, 0);
  assert.equal(h.db.writes, 0);
  assert.equal(h.refreshCalls.length, 0);
  assert.equal(h.logs.filter((l) => l.includes("geen productieomgeving")).length, 1, "een logregel");
  assert.equal(await isConfiguredCore(h.deps), false, "buiten productie telt de koppeling als niet geconfigureerd");
  assert.equal(h.db.reads, 0, "isConfigured leest buiten productie ook niets");
});

test("geconfigureerd op productie: client id, secret en refresh token", async () => {
  const h = makeHarness();
  assert.equal(await isConfiguredCore(h.deps), true);
  const empty = makeHarness({ db: new FakeTokenDb({ refresh_token: null }) });
  assert.equal(await isConfiguredCore(empty.deps), false);
});

test("geldig access token: nul refreshes", async () => {
  const h = makeHarness({
    db: new FakeTokenDb({
      access_token: "at_valid",
      access_token_expires_at: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
    }),
  });
  assert.equal(await getAccessTokenCore(h.deps), "at_valid");
  assert.equal(h.refreshCalls.length, 0);
  assert.equal(h.db.claimAttempts, 0);
  assert.equal(h.db.writes, 0);
});

test("token met minder dan tien minuten resterend telt als verlopen", async () => {
  const h = makeHarness({
    db: new FakeTokenDb({
      access_token: "at_old",
      access_token_expires_at: new Date(NOW.getTime() + 9 * 60_000).toISOString(),
    }),
  });
  assert.equal(await getAccessTokenCore(h.deps), "at_1");
  assert.equal(h.refreshCalls.length, 1);
});

test("verlopen token: precies een refresh, claim gewist, expiry opgeslagen", async () => {
  const h = makeHarness({
    db: new FakeTokenDb({
      access_token: "at_old",
      access_token_expires_at: new Date(NOW.getTime() - HOUR).toISOString(),
    }),
  });
  const token = await getAccessTokenCore(h.deps);
  assert.equal(token, "at_1");
  assert.deepEqual(h.refreshCalls, ["rt_0"]);
  assert.equal(h.db.row.access_token, "at_1");
  assert.equal(h.db.row.access_token_expires_at, new Date(NOW.getTime() + 3599_000).toISOString());
  assert.equal(h.db.row.refresh_claim_until, null);
  assert.equal(h.db.row.last_refresh_error, null);
  assert.equal(h.db.row.last_refreshed_at, NOW.toISOString());
  assert.equal(h.notifications.length, 0);
});

test("twee gelijktijdige aanroepen: precies een refresh, de verliezer krijgt het nieuwe token", async () => {
  const h = makeHarness({ holdRefresh: true });
  const first = getAccessTokenCore(h.deps);
  const second = getAccessTokenCore(h.deps);
  // Beide hebben nu gelezen en om de claim gestreden; een van beide houdt
  // de refresh vast. Laat hem los en kijk wat er uitkomt.
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.refreshCalls.length, 1, "slechts een invocatie belt het token-endpoint");
  h.releaseRefresh();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, "at_1");
  assert.equal(b, "at_1", "de verliezer herleest en krijgt het nieuwe token");
  assert.equal(h.refreshCalls.length, 1);
  assert.deepEqual(h.db.refreshHistory, ["rt_0", "rt_1"]);
});

test("geroteerd refresh token wordt opgeslagen en het oude niet hergebruikt", async () => {
  let clock = NOW;
  const h = makeHarness({ now: () => clock });
  await getAccessTokenCore(h.deps);
  assert.equal(h.db.row.refresh_token, "rt_1");
  // Een uur later opnieuw verlopen: de tweede refresh gebruikt rt_1, niet rt_0.
  clock = new Date(NOW.getTime() + HOUR);
  await getAccessTokenCore(h.deps);
  assert.deepEqual(h.refreshCalls, ["rt_0", "rt_1"]);
  assert.equal(h.db.row.refresh_token, "rt_2");
  assert.deepEqual(h.db.refreshHistory, ["rt_0", "rt_1", "rt_2"]);
});

test("mislukte refresh: gooit, schrijft last_refresh_error, wist de claim, alarmeert een keer", async () => {
  const h = makeHarness({ refreshFails: true });
  await assert.rejects(() => getAccessTokenCore(h.deps), (err: unknown) => {
    assert.ok(err instanceof AkilesTokenError);
    assert.match(err.message, /invalid_grant/);
    return true;
  });
  assert.equal(h.refreshCalls.length, 1);
  assert.match(h.db.row.last_refresh_error ?? "", /invalid_grant/);
  assert.equal(h.db.row.refresh_claim_until, null, "claim gewist zodat een volgende poging kan");
  assert.equal(h.db.row.refresh_token, "rt_0", "oude refresh token blijft staan");
  assert.equal(h.notifications.length, 1, "precies een ntfy-alarm");
  assert.ok(!h.logs.some((l) => l.includes("rt_0") || l.includes("at_")), "geen tokenwaarde in de logs");
});

test("verlopen claim van een gecrashte invocatie wordt door de volgende overgenomen", async () => {
  const h = makeHarness({
    db: new FakeTokenDb({
      access_token: "at_old",
      access_token_expires_at: new Date(NOW.getTime() - HOUR).toISOString(),
      // Lease die 5 seconden geleden verliep: de winnaar is nooit klaar gekomen.
      refresh_claim_until: new Date(NOW.getTime() - 5_000).toISOString(),
    }),
  });
  assert.equal(await getAccessTokenCore(h.deps), "at_1");
  assert.equal(h.refreshCalls.length, 1);
  assert.equal(h.db.claimAttempts, 1, "de eerste poging wint meteen");
});

test("lopende claim zonder afloop: verliezer ververst nooit zelf en geeft op na de lease", async () => {
  // Lease die pas over 25 seconden verloopt en nooit een nieuw token oplevert.
  const h = makeHarness({
    db: new FakeTokenDb({
      access_token: "at_old",
      access_token_expires_at: new Date(NOW.getTime() - HOUR).toISOString(),
      refresh_claim_until: new Date(NOW.getTime() + 25_000).toISOString(),
    }),
  });
  await assert.rejects(() => getAccessTokenCore(h.deps), (err: unknown) => {
    assert.ok(err instanceof AkilesTokenError);
    assert.match(err.message, /refresh-claim/);
    return true;
  });
  assert.equal(h.refreshCalls.length, 0, "nooit zelf verversen terwijl een ander de claim heeft");
  assert.equal(h.db.row.refresh_token, "rt_0");
});
