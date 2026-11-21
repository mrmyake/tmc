import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleLegacyDomain } from "./load.mts";

const realWarn = console.warn;
const realEnv = { ...process.env };
beforeEach(() => {
  console.warn = () => {};
  delete process.env.GLOBAL_CONFIG;
  delete process.env.EDGE_CONFIG;
});
afterEach(() => {
  console.warn = realWarn;
  process.env = { ...realEnv };
});

const mode = (m: string) => async () => ({ "hormoonprofiel.com": m });
function preview() {
  process.env.VERCEL_ENV = "preview";
  (process.env as Record<string, string>).NODE_ENV = "production";
}

test("/hp-site/* op themovementclub.nl is 404, in elke modus", async () => {
  for (const host of ["www.themovementclub.nl", "themovementclub.nl", "x.vercel.app"]) {
    for (const m of ["standalone", "redirect_temporary", "redirect_permanent"]) {
      const res = await handleLegacyDomain(new NextRequest(`https://${host}/hp-site/voedingsrichtlijnen`), mode(m));
      assert.equal(res?.status, 404, `${host} ${m}`);
      const root = await handleLegacyDomain(new NextRequest(`https://${host}/hp-site`), mode(m));
      assert.equal(root?.status, 404);
    }
  }
});

test("/hp-site/* op preview zonder override is 404", async () => {
  preview();
  const res = await handleLegacyDomain(new NextRequest("https://x.vercel.app/hp-site"), mode("standalone"));
  assert.equal(res?.status, 404);
});

test("themovementclub.nl/hormoonprofiel: standalone geeft 307 naar hormoonprofiel.com", async () => {
  const res = await handleLegacyDomain(
    new NextRequest("https://www.themovementclub.nl/hormoonprofiel/voedingsrichtlijnen"),
    mode("standalone"),
  );
  assert.equal(res?.status, 307);
  assert.equal(res?.headers.get("location"), "https://hormoonprofiel.com/voedingsrichtlijnen");
});

test("themovementclub.nl/hormoonprofiel: off geldt als standalone", async () => {
  const res = await handleLegacyDomain(new NextRequest("https://www.themovementclub.nl/hormoonprofiel"), mode("off"));
  assert.equal(res?.status, 307);
  assert.equal(res?.headers.get("location"), "https://hormoonprofiel.com/");
});

test("themovementclub.nl/hormoonprofiel: een redirect-modus toont de sectie", async () => {
  const res = await handleLegacyDomain(
    new NextRequest("https://www.themovementclub.nl/hormoonprofiel/voedingsrichtlijnen"),
    mode("redirect_permanent"),
  );
  assert.equal(res?.status, 200);
  assert.equal(res?.headers.get("location"), null);
});

test("Global Config onbereikbaar: standalone", async () => {
  const res = await handleLegacyDomain(new NextRequest("https://hormoonprofiel.com/veel-gestelde-vragen"), async () => {
    throw new Error("weg");
  });
  assert.match(res?.headers.get("x-middleware-rewrite") ?? "", /\/hp-site\/veel-gestelde-vragen$/);
});

test("hormoonprofiel.com: 410, 404-rewrite en www", async () => {
  const gone = await handleLegacyDomain(new NextRequest("https://hormoonprofiel.com/wp-login.php"), mode("standalone"));
  assert.equal(gone?.status, 410);
  assert.equal(gone?.headers.get("x-robots-tag"), "noindex");
  const www = await handleLegacyDomain(new NextRequest("https://www.hormoonprofiel.com/"), mode("standalone"));
  assert.equal(www?.status, 308);
  assert.equal(www?.headers.get("location"), "https://hormoonprofiel.com/");
  const gone2 = await handleLegacyDomain(new NextRequest("https://hormoonprofiel.com/pricing-classic/"), mode("redirect_permanent"));
  assert.equal(gone2?.status, 410);
});

test("standalone: assets gaan door zonder auth-stap", async () => {
  const res = await handleLegacyDomain(new NextRequest("https://hormoonprofiel.com/_next/static/a.js"), mode("standalone"));
  assert.equal(res?.status, 200);
  assert.equal(res?.headers.get("x-middleware-next"), "1");
});

test("preview-override: ?__host zet een cookie, werkt op preview en niet op production", async () => {
  preview();
  const res = await handleLegacyDomain(
    new NextRequest("https://x.vercel.app/veel-gestelde-vragen?__host=hormoonprofiel.com"),
    mode("standalone"),
  );
  assert.match(res?.headers.get("x-middleware-rewrite") ?? "", /\/hp-site\/veel-gestelde-vragen/);
  assert.match(res?.headers.get("set-cookie") ?? "", /__host=hormoonprofiel\.com/);

  const viaCookie = await handleLegacyDomain(
    new NextRequest("https://x.vercel.app/voedingsrichtlijnen", { headers: { cookie: "__host=hormoonprofiel.com" } }),
    mode("standalone"),
  );
  assert.match(viaCookie?.headers.get("x-middleware-rewrite") ?? "", /\/hp-site\/voedingsrichtlijnen$/);

  process.env.VERCEL_ENV = "production";
  const prod = await handleLegacyDomain(
    new NextRequest("https://www.themovementclub.nl/over?__host=hormoonprofiel.com", {
      headers: { cookie: "__host=hormoonprofiel.com" },
    }),
    mode("standalone"),
  );
  assert.equal(prod, null);
});

test("preview-override: ?__mode kiest de modus, ?__host=reset wist alles", async () => {
  preview();
  const res = await handleLegacyDomain(
    new NextRequest("https://x.vercel.app/voedingsrichtlijnen?__host=hormoonprofiel.com&__mode=redirect_temporary"),
    mode("standalone"),
  );
  assert.equal(res?.status, 307);
  assert.equal(
    res?.headers.get("location"),
    "https://www.themovementclub.nl/hormoonprofiel/voedingsrichtlijnen?utm_source=hormoonprofiel&utm_medium=redirect",
  );
  const reset = await handleLegacyDomain(new NextRequest("https://x.vercel.app/over?__host=reset"), mode("standalone"));
  assert.equal(reset?.status, 307);
  assert.equal(reset?.headers.get("location"), "https://x.vercel.app/over");
});

test("de bestaande testheader werkt voor hormoonprofiel.com", async () => {
  preview();
  const res = await handleLegacyDomain(
    new NextRequest("https://x.vercel.app/winkelwagen", { headers: { "x-legacy-host-test": "hormoonprofiel.com" } }),
    mode("standalone"),
  );
  assert.equal(res?.status, 308);
  assert.equal(res?.headers.get("location"), "https://x.vercel.app/");
});
