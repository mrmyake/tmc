import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleLegacyDomain } from "./load.mts";
import { LEGACY_CASES, GONE_PATHS } from "./cases.mts";

const permanent = async () => ({ "ptloosdrecht.nl": "redirect_permanent" });
const temporary = async () => ({ "ptloosdrecht.nl": "redirect_temporary" });

function req(host: string, pathAndQuery: string): NextRequest {
  return new NextRequest(`https://${host}${pathAndQuery}`);
}

test("alle doelen: geen query-parameters en geen utm", () => {
  for (const { location } of LEGACY_CASES) {
    assert.equal(new URL(location).search, "", location);
    assert.ok(!location.includes("utm_"), location);
  }
});

test("410 Gone: elk pad, met en zonder slash, hoofdletters, query, www en zonder", async () => {
  for (const path of GONE_PATHS) {
    const variants = [path, path.toUpperCase(), `${path}?utm_source=x`, `${path}/`];
    for (const host of ["ptloosdrecht.nl", "www.ptloosdrecht.nl"]) {
      for (const variant of variants) {
        for (const mode of [permanent, temporary]) {
          const res = await handleLegacyDomain(req(host, variant), mode);
          assert.ok(res, `${host}${variant}`);
          assert.equal(res.status, 410, `${host}${variant}`);
          assert.equal(res.headers.get("location"), null, `${host}${variant}`);
          assert.equal(res.headers.get("x-robots-tag"), "noindex");
          assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
          assert.equal(await res.text(), "Gone");
        }
      }
    }
  }
});

test("410 Gone: in modus off blijft het een 404", async () => {
  const res = await handleLegacyDomain(
    req("ptloosdrecht.nl", "/product/x"),
    async () => ({ "ptloosdrecht.nl": "off" }),
  );
  assert.equal(res?.status, 404);
});

test("410 Gone: robots, sitemap en favicon blijven een redirect", async () => {
  for (const p of ["/robots.txt", "/sitemap.xml", "/favicon.ico", "/wp-sitemap.xml"]) {
    const res = await handleLegacyDomain(req("ptloosdrecht.nl", p), permanent);
    assert.equal(res?.status, 308, p);
  }
});

test("fallback: onbekend pad gaat naar / zonder query", async () => {
  const res = await handleLegacyDomain(req("www.ptloosdrecht.nl", "/Iets/Onbekends/?a=1"), permanent);
  assert.equal(res?.status, 308);
  assert.equal(res?.headers.get("location"), "https://www.themovementclub.nl/");
});

test("hormoonprofiel.com werkt ongewijzigd (standalone, eigen afhandeling)", async () => {
  const res = await handleLegacyDomain(
    req("hormoonprofiel.com", "/"),
    async () => ({ "hormoonprofiel.com": "redirect_permanent" }),
  );
  assert.equal(res?.status, 308);
  const loc = res?.headers.get("location") ?? "";
  assert.ok(loc.startsWith("https://www.themovementclub.nl"), loc);
});
