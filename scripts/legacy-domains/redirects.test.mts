import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleLegacyDomain } from "./load.mts";
import { LEGACY_CASES } from "./cases.mts";

const permanent = async () => ({ "ptloosdrecht.nl": "redirect_permanent" });

function req(host: string, pathAndQuery: string): NextRequest {
  return new NextRequest(`https://${host}${pathAndQuery}`);
}

/** Varianten per oud pad: slash, hoofdletters, willekeurige query. */
function variants(path: string): string[] {
  const list = [path, path.toUpperCase(), `${path}?utm_source=x&foo=bar%20baz`];
  if (path !== "/") list.push(`${path}/`, `${path.toUpperCase()}/?q=1`);
  return list;
}

for (const { path, location } of LEGACY_CASES) {
  for (const host of ["ptloosdrecht.nl", "www.ptloosdrecht.nl"]) {
    test(`${host}${path}: 308 naar ${location}`, async () => {
      for (const variant of variants(path)) {
        const res = await handleLegacyDomain(req(host, variant), permanent);
        assert.ok(res, `geen response voor ${variant}`);
        assert.equal(res.status, 308, variant);
        assert.equal(res.headers.get("location"), location, variant);
        assert.equal(
          new URL(res.headers.get("location")!).host,
          "www.themovementclub.nl",
          variant,
        );
        assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
      }
    });
  }
}

test("host met hoofdletters en poort wordt genormaliseerd", async () => {
  const res = await handleLegacyDomain(
    new NextRequest("https://x.test/kosten", {
      headers: { host: "WWW.PTLoosdrecht.NL:443" },
    }),
    permanent,
  );
  assert.equal(res?.status, 308);
  assert.equal(
    res?.headers.get("location"),
    "https://www.themovementclub.nl/prijzen?utm_source=ptloosdrecht&utm_medium=redirect",
  );
});

test("technische bestanden hebben geen UTM", async () => {
  for (const p of ["/robots.txt", "/sitemap.xml", "/wp-sitemap.xml", "/favicon.ico", "/foo-sitemap.xml"]) {
    const res = await handleLegacyDomain(req("ptloosdrecht.nl", p), permanent);
    assert.ok(!res?.headers.get("location")?.includes("utm_"), p);
  }
});

test("acme-challenge wordt nooit afgevangen, in elke modus", async () => {
  for (const mode of ["off", "redirect_temporary", "redirect_permanent"]) {
    const res = await handleLegacyDomain(
      req("ptloosdrecht.nl", "/.well-known/acme-challenge/abc123"),
      async () => ({ "ptloosdrecht.nl": mode }),
    );
    assert.equal(res, null, mode);
  }
  const upper = await handleLegacyDomain(
    req("www.ptloosdrecht.nl", "/.well-known/ACME-challenge/x/"),
    permanent,
  );
  assert.equal(upper, null);
});

test("langste prefix wint en exact gaat voor prefix", async () => {
  // /product-category valt onder prefix /product-category, niet /product.
  const res = await handleLegacyDomain(req("ptloosdrecht.nl", "/product-category/misc"), permanent);
  assert.equal(
    res?.headers.get("location"),
    "https://www.themovementclub.nl/?utm_source=ptloosdrecht&utm_medium=redirect",
  );
  // /pagina bestaat niet als /page-prefix: valt terug op de fallback.
  const near = await handleLegacyDomain(req("ptloosdrecht.nl", "/pagina"), permanent);
  assert.equal(
    near?.headers.get("location"),
    "https://www.themovementclub.nl/?utm_source=ptloosdrecht&utm_medium=redirect",
  );
});
