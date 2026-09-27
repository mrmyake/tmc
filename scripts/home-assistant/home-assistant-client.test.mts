/**
 * Contract van src/lib/home-assistant.ts (spec-kiosk-room-control.md):
 * configuratie- en omgevingsguard, juiste endpoint/body per functie, retry-
 * beleid (nooit op runScript/playPause, ten hoogste een keer op
 * setVolume/getStates), foutafhandeling en timeout, en dat het token nooit
 * in een foutmelding of ergens anders zichtbaar terechtkomt.
 * Run: npm run test:home-assistant
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  HomeAssistantError,
  getHomeAssistantClient,
  isHomeAssistantConfigured,
  resolveHomeAssistantConfig,
} from "../../src/lib/home-assistant";
import { HA_TIMEOUT_MS } from "../../src/lib/outbound-timeouts";

const TOKEN = "secret-ha-token-should-never-leak-9f8e7d";

type ReceivedRequest = {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
};
type Handler = (res: ServerResponse) => void;

let server: Server;
let baseUrl: string;
const received: ReceivedRequest[] = [];
/** Eén handler per binnenkomend request; leeg = defaultHandler (200, {}). */
const queue: Handler[] = [];
const defaultHandler: Handler = (res) => {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end("{}");
};

function listen(s: Server): Promise<string> {
  return new Promise((resolve) => {
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

before(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({
        method: req.method ?? "",
        url: req.url ?? "",
        authorization: req.headers.authorization,
        body,
      });
      const handler = queue.shift() ?? defaultHandler;
      handler(res);
      // Een handler die niets doet (de hang-case) laat res bewust onaangeraakt.
    });
  });
  baseUrl = await listen(server);
});

after(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  received.length = 0;
  queue.length = 0;
});

function productionEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    HA_BASE_URL: baseUrl,
    HA_TOKEN: TOKEN,
    VERCEL_ENV: "production",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Configuratie en omgevingsguard
// ---------------------------------------------------------------------------

test("zonder HA_BASE_URL of HA_TOKEN: missing, client null", () => {
  for (const env of [
    { VERCEL_ENV: "production" },
    { VERCEL_ENV: "production", HA_BASE_URL: baseUrl },
    { VERCEL_ENV: "production", HA_TOKEN: TOKEN },
  ]) {
    const r = resolveHomeAssistantConfig(env);
    assert.deepEqual(r, { ok: false, reason: "missing" });
    assert.equal(getHomeAssistantClient(env), null);
    assert.equal(isHomeAssistantConfigured(env), false);
  }
});

test("buiten productie zonder opt-in: wrong_environment, client null", () => {
  for (const vercelEnv of ["preview", "development", undefined]) {
    const env = productionEnv({ VERCEL_ENV: vercelEnv });
    const r = resolveHomeAssistantConfig(env);
    assert.equal(r.ok, false, String(vercelEnv));
    assert.equal(r.ok === false && r.reason, "wrong_environment", String(vercelEnv));
    assert.equal(getHomeAssistantClient(env), null, String(vercelEnv));
  }
});

test("buiten productie MET HA_ALLOW_NON_PRODUCTION=1: geldt als geconfigureerd", () => {
  const env = productionEnv({ VERCEL_ENV: "preview", HA_ALLOW_NON_PRODUCTION: "1" });
  const r = resolveHomeAssistantConfig(env);
  assert.equal(r.ok, true);
  assert.notEqual(getHomeAssistantClient(env), null);
});

test("op productie met complete config: client aanwezig", () => {
  const env = productionEnv();
  assert.equal(isHomeAssistantConfigured(env), true);
  assert.notEqual(getHomeAssistantClient(env), null);
});

// ---------------------------------------------------------------------------
// runScript
// ---------------------------------------------------------------------------

test("runScript: POST naar script/turn_on met het juiste entity_id, geen retry op 429", async () => {
  queue.push((res) => {
    res.statusCode = 429;
    res.end("te veel verzoeken");
  });
  const client = getHomeAssistantClient(productionEnv())!;
  await assert.rejects(client.runScript("script.yoga_savasana"), (err: unknown) => {
    assert.ok(err instanceof HomeAssistantError);
    assert.equal(err.status, 429);
    assert.equal(err.path, "POST /api/services/script/turn_on");
    return true;
  });
  assert.equal(received.length, 1, "geen retry op runScript");
  assert.equal(received[0].method, "POST");
  assert.equal(received[0].url, "/api/services/script/turn_on");
  assert.deepEqual(JSON.parse(received[0].body), { entity_id: "script.yoga_savasana" });
});

// ---------------------------------------------------------------------------
// setVolume
// ---------------------------------------------------------------------------

test("setVolume: buiten 0..1 wordt geweigerd zonder netwerkcall", async () => {
  const client = getHomeAssistantClient(productionEnv())!;
  for (const level of [-0.01, 1.01, Number.NaN]) {
    await assert.rejects(client.setVolume("media_player.yoga_studio_yoga_studio", level), (err: unknown) => {
      assert.ok(err instanceof HomeAssistantError);
      assert.equal(err.status, 400);
      return true;
    });
  }
  assert.equal(received.length, 0, "geen enkele HTTP-call bij een ongeldig niveau");
});

test("setVolume: POST naar media_player/volume_set met entity_id en volume_level", async () => {
  const client = getHomeAssistantClient(productionEnv())!;
  await client.setVolume("media_player.kracht_front_kracht_front", 0.35);
  assert.equal(received.length, 1);
  assert.equal(received[0].url, "/api/services/media_player/volume_set");
  assert.deepEqual(JSON.parse(received[0].body), {
    entity_id: "media_player.kracht_front_kracht_front",
    volume_level: 0.35,
  });
});

test("setVolume: retryt eenmaal op 503 (met Retry-After) en slaagt daarna", async () => {
  queue.push((res) => {
    res.statusCode = 503;
    res.setHeader("retry-after", "0.01");
    res.end("nog niet klaar");
  });
  queue.push((res) => {
    res.statusCode = 200;
    res.end("{}");
  });
  const client = getHomeAssistantClient(productionEnv())!;
  await client.setVolume("media_player.yoga_studio_yoga_studio", 0.5);
  assert.equal(received.length, 2, "precies een retry, niet meer");
});

test("setVolume: een tweede 503 na de ene toegestane retry wordt alsnog een fout", async () => {
  queue.push((res) => {
    res.statusCode = 503;
    res.setHeader("retry-after", "0.01");
    res.end("nog niet klaar");
  });
  queue.push((res) => {
    res.statusCode = 503;
    res.setHeader("retry-after", "0.01");
    res.end("nog steeds niet klaar");
  });
  const client = getHomeAssistantClient(productionEnv())!;
  await assert.rejects(client.setVolume("media_player.yoga_studio_yoga_studio", 0.5), (err: unknown) => {
    assert.ok(err instanceof HomeAssistantError);
    assert.equal(err.status, 503);
    return true;
  });
  assert.equal(received.length, 2, "maximaal een retry, dus twee calls in totaal");
});

// ---------------------------------------------------------------------------
// playPause
// ---------------------------------------------------------------------------

test("playPause: POST naar media_play_pause met het juiste entity_id, geen retry op 503", async () => {
  queue.push((res) => {
    res.statusCode = 503;
    res.end("even dood");
  });
  const client = getHomeAssistantClient(productionEnv())!;
  await assert.rejects(client.playPause("media_player.kracht_front_kracht_front"), (err: unknown) => {
    assert.ok(err instanceof HomeAssistantError);
    assert.equal(err.status, 503);
    return true;
  });
  assert.equal(received.length, 1, "geen retry op een toggle-actie");
  assert.deepEqual(JSON.parse(received[0].body), {
    entity_id: "media_player.kracht_front_kracht_front",
  });
});

// ---------------------------------------------------------------------------
// getStates
// ---------------------------------------------------------------------------

test("getStates: GET /api/states, lokaal gefilterd op de gevraagde entity_ids", async () => {
  queue.push((res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify([
        { entity_id: "light.yoga_studio_plafond", state: "off", attributes: {} },
        { entity_id: "media_player.kracht_front_kracht_front", state: "paused", attributes: { volume_level: 0.08 } },
        { entity_id: "light.kitchen_something", state: "on", attributes: {} },
      ]),
    );
  });
  const client = getHomeAssistantClient(productionEnv())!;
  const states = await client.getStates([
    "media_player.kracht_front_kracht_front",
    "light.yoga_studio_plafond",
  ]);
  assert.equal(received[0].method, "GET");
  assert.equal(received[0].url, "/api/states");
  assert.equal(states.length, 2);
  assert.ok(states.some((s) => s.entity_id === "light.yoga_studio_plafond" && s.state === "off"));
  assert.ok(
    states.some(
      (s) => s.entity_id === "media_player.kracht_front_kracht_front" && s.attributes.volume_level === 0.08,
    ),
  );
});

test("getStates: retryt eenmaal op 429 en slaagt daarna", async () => {
  queue.push((res) => {
    res.statusCode = 429;
    res.setHeader("retry-after", "0.01");
    res.end("rustig aan");
  });
  queue.push((res) => {
    res.statusCode = 200;
    res.end(JSON.stringify([{ entity_id: "light.x", state: "off", attributes: {} }]));
  });
  const client = getHomeAssistantClient(productionEnv())!;
  const states = await client.getStates(["light.x"]);
  assert.equal(received.length, 2);
  assert.equal(states.length, 1);
});

// ---------------------------------------------------------------------------
// Foutafhandeling en timeout
// ---------------------------------------------------------------------------

test("een niet-ok respons wordt HomeAssistantError met status, pad en afgekapte body", async () => {
  const longBody = "x".repeat(500);
  queue.push((res) => {
    res.statusCode = 500;
    res.end(longBody);
  });
  const client = getHomeAssistantClient(productionEnv())!;
  await assert.rejects(client.runScript("script.yoga_uit"), (err: unknown) => {
    assert.ok(err instanceof HomeAssistantError);
    assert.equal(err.status, 500);
    assert.equal(err.path, "POST /api/services/script/turn_on");
    assert.ok(err.message.length < longBody.length, "de body moet afgekapt zijn, niet integraal in de melding");
    return true;
  });
});

test("timeout: een hangend endpoint wordt HomeAssistantError met status 504, binnen de HA-timeout", async () => {
  queue.push(() => {
    /* nooit antwoorden: laat res onaangeraakt, de client-timeout moet ingrijpen */
  });
  const client = getHomeAssistantClient(productionEnv())!;
  const started = Date.now();
  await assert.rejects(client.playPause("media_player.yoga_studio_yoga_studio"), (err: unknown) => {
    assert.ok(err instanceof HomeAssistantError);
    assert.equal(err.status, 504);
    return true;
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= HA_TIMEOUT_MS - 500, `te vroeg terug: ${elapsed} ms`);
  assert.ok(elapsed < HA_TIMEOUT_MS + 3_000, `te laat terug: ${elapsed} ms`);
});

test("het token gaat als Bearer-header mee, maar staat nooit in de foutmelding of het pad", async () => {
  queue.push((res) => {
    res.statusCode = 403;
    res.end("geweigerd");
  });
  const client = getHomeAssistantClient(productionEnv())!;
  let caught: unknown = null;
  try {
    await client.runScript("script.yoga_les");
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof HomeAssistantError);
  // De echte server zag het juiste token, dus de client stuurt hem wel degelijk mee.
  assert.equal(received[0].authorization, `Bearer ${TOKEN}`);
  // Maar de eigen foutconstructie (message en path) refereert er nergens naar,
  // en ook de base-URL/host staat er niet in (alleen het pad, zonder host).
  const err = caught as HomeAssistantError;
  assert.ok(!err.message.includes(TOKEN), "het token mag niet in de foutmelding staan");
  assert.ok(!err.path.includes(TOKEN), "het token mag niet in het pad staan");
  assert.ok(!err.message.includes(baseUrl), "de base-URL/host mag niet in de foutmelding staan");
});
