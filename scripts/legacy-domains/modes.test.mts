import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleLegacyDomain, resolveMode, LEGACY_DOMAINS } from "./load.mts";

const KOSTEN_PERMANENT =
  "https://www.themovementclub.nl/prijzen?utm_source=ptloosdrecht&utm_medium=redirect";

const warnings: string[] = [];
const realWarn = console.warn;
const realEnv = { ...process.env };

beforeEach(() => {
  warnings.length = 0;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "));
  };
  delete process.env.GLOBAL_CONFIG;
  delete process.env.EDGE_CONFIG;
});

afterEach(() => {
  console.warn = realWarn;
  process.env = { ...realEnv };
});

const kosten = () => new NextRequest("https://ptloosdrecht.nl/kosten");

test("redirect_permanent: 308 met public cache van een uur", async () => {
  const res = await handleLegacyDomain(kosten(), async () => ({ "ptloosdrecht.nl": "redirect_permanent" }));
  assert.equal(res?.status, 308);
  assert.equal(res?.headers.get("location"), KOSTEN_PERMANENT);
  assert.equal(res?.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(warnings.length, 0);
});

test("redirect_temporary: 307 met no-store", async () => {
  const res = await handleLegacyDomain(kosten(), async () => ({ "ptloosdrecht.nl": "redirect_temporary" }));
  assert.equal(res?.status, 307);
  assert.equal(res?.headers.get("location"), KOSTEN_PERMANENT);
  assert.equal(res?.headers.get("cache-control"), "no-store");
  assert.equal(warnings.length, 0);
});

test("off: 404 met noindex en no-store, nooit TMC-inhoud", async () => {
  const res = await handleLegacyDomain(kosten(), async () => ({ "ptloosdrecht.nl": "off" }));
  assert.equal(res?.status, 404);
  assert.equal(res?.headers.get("x-robots-tag"), "noindex");
  assert.equal(res?.headers.get("cache-control"), "no-store");
  assert.equal(res?.headers.get("location"), null);
});

test("ongeldige waarde: standaardmodus en een enkele warn", async () => {
  const res = await handleLegacyDomain(kosten(), async () => ({ "ptloosdrecht.nl": "redirect_forever" }));
  assert.equal(res?.status, 308);
  assert.equal(warnings.length, 1);
});

test("ontbrekend item: standaardmodus en een enkele warn", async () => {
  for (const missing of [undefined, null]) {
    warnings.length = 0;
    const res = await handleLegacyDomain(kosten(), async () => missing);
    assert.equal(res?.status, 308);
    assert.equal(warnings.length, 1);
  }
});

test("item zonder dit domein of geen object: standaardmodus en een warn", async () => {
  for (const raw of [{ "hormoonprofiel.com": "off" }, "redirect_temporary", ["off"]]) {
    warnings.length = 0;
    const res = await handleLegacyDomain(kosten(), async () => raw);
    assert.equal(res?.status, 308, JSON.stringify(raw));
    assert.equal(warnings.length, 1);
  }
});

test("leesfout: standaardmodus en een enkele warn", async () => {
  const res = await handleLegacyDomain(kosten(), async () => {
    throw new Error("netwerk weg");
  });
  assert.equal(res?.status, 308);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /leesfout/);
});

test("trage store: timeout valt terug op de standaardmodus", async () => {
  const mode = await resolveMode(
    LEGACY_DOMAINS["ptloosdrecht.nl"],
    () => new Promise(() => {}),
    20,
  );
  assert.equal(mode, "redirect_permanent");
  assert.equal(warnings.length, 1);
});

test("ontbrekende connection string: standaardmodus en een enkele warn", async () => {
  // Geen bron meegegeven: de echte bron, zonder GLOBAL_CONFIG/EDGE_CONFIG.
  const res = await handleLegacyDomain(kosten());
  assert.equal(res?.status, 308);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /geen Global Config gekoppeld/);
});

test("hormoonprofiel.com: off geldt als standalone, met een warn", async () => {
  const res = await handleLegacyDomain(
    new NextRequest("https://hormoonprofiel.com/"),
    async () => ({ "hormoonprofiel.com": "off" }),
  );
  assert.equal(res?.status, 200);
  assert.match(res?.headers.get("x-middleware-rewrite") ?? "", /\/hp-site$/);
  assert.ok(warnings.some((w) => /off geldt als standalone/.test(w)));
});

test("hormoonprofiel.com: standaardmodus is standalone", async () => {
  const res = await handleLegacyDomain(
    new NextRequest("https://hormoonprofiel.com/veel-gestelde-vragen"),
    async () => undefined,
  );
  assert.match(res?.headers.get("x-middleware-rewrite") ?? "", /\/hp-site\/veel-gestelde-vragen$/);
  assert.equal(warnings.length, 1);
});

test("standalone is ongeldig voor ptloosdrecht.nl: standaardmodus en een warn", async () => {
  const res = await handleLegacyDomain(kosten(), async () => ({ "ptloosdrecht.nl": "standalone" }));
  assert.equal(res?.status, 308);
  assert.match(warnings[0], /standalone is niet geldig/);
});

test("hormoonprofiel.com: bij redirect valt onbekend terug op de sectie-home", async () => {
  const res = await handleLegacyDomain(
    new NextRequest("https://hormoonprofiel.com/wat-dan-ook"),
    async () => ({ "hormoonprofiel.com": "redirect_permanent" }),
  );
  assert.equal(res?.status, 308);
  assert.equal(
    res?.headers.get("location"),
    "https://www.themovementclub.nl/hormoonprofiel?utm_source=hormoonprofiel&utm_medium=redirect",
  );
});

test("een modus voor het ene domein raakt het andere niet", async () => {
  const source = async () => ({ "ptloosdrecht.nl": "off", "hormoonprofiel.com": "redirect_temporary" });
  assert.equal((await handleLegacyDomain(kosten(), source))?.status, 404);
  assert.equal(
    (await handleLegacyDomain(new NextRequest("https://hormoonprofiel.com/"), source))?.status,
    307,
  );
});
