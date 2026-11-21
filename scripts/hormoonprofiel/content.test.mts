/**
 * Bewaking van de inhoud van hormoonprofiel (spec-hormoonprofiel.md):
 *  - geen prijzen, bedragen, pakketten of links naar een shop;
 *  - geen em dashes of en dashes;
 *  - alleen Marlon; geen verboden claims of merknamen;
 *  - elke pagina: In het kort, byline-gegevens, titel en metabeschrijving.
 * Met HP_BASE_URL (bijvoorbeeld http://localhost:3101 of een preview) wordt
 * ook de gerenderde HTML van de 10 pagina's gecontroleerd, standalone via de
 * testheader en de sectie via ?__mode=redirect_permanent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const contentDir = path.join(root, "content", "hormoonprofiel");

function contentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "_bron") return [];
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? contentFiles(full) : [full];
  });
}

const PRICE_RE = /€|\beuro|,-|pakket/i;
const SHOP_LINK_RE = /\/product|\/winkelwagen/i;

test("content/hormoonprofiel (zonder _bron): geen prijzen, pakketten of shoplinks", () => {
  for (const file of contentFiles(contentDir)) {
    const text = readFileSync(file, "utf8");
    assert.ok(!PRICE_RE.test(text), `${path.relative(root, file)} bevat een prijsterm`);
    assert.ok(!SHOP_LINK_RE.test(text), `${path.relative(root, file)} bevat een shoplink`);
  }
});

test("geen em dashes of en dashes in content, componenten en lib", () => {
  const dirs = [
    contentDir,
    path.join(root, "src", "components", "hormoonprofiel"),
    path.join(root, "src", "lib", "hormoonprofiel"),
    path.join(root, "scripts", "hormoonprofiel"),
  ];
  for (const dir of dirs) {
    for (const file of contentFiles(dir)) {
      const text = readFileSync(file, "utf8");
      assert.ok(!new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`).test(text), `${path.relative(root, file)} bevat een streepje`);
    }
  }
});

test("alleen Marlon, geen verboden claims en geen merknamen", () => {
  const banned = [
    /quinty/i, /triin/i, /dikic/i, /roomet/i, /poliquin/i, /topsporter/i, /atleten van topniveau/i,
    /gepatenteerd/i, /duizenden/i, /gegarandeerd/i, /depressi/i, /auto-?immuun/i, /erectie/i,
    /onvruchtbaar/i, /dementie/i, /alzheimer/i, /bijnieruitputting/i, /adrenal/i, /schimmel/i,
    /fundamentals/i, /fundazymes/i, /lemon/i, /digezyme/i, /\bthyroid\b(?!-profiel)/i,
    /wetenschappelijk onderbouwd(?!\?)/i, /25\s?%/,
  ];
  for (const file of contentFiles(contentDir)) {
    // De ankers (id: "fundazymes", id: "matcha") blijven 1:1 gelijk aan de oude site.
    const text = readFileSync(file, "utf8").replace(/\/\/ COPY.*$/gm, "").replace(/id: "[a-z-]+"/g, "");
    for (const re of banned) {
      assert.ok(!re.test(text), `${path.relative(root, file)} bevat ${re}`);
    }
  }
});

test("alle Nederlandse contentbestanden dragen het COPY-commentaar", () => {
  for (const file of contentFiles(contentDir)) {
    if (/types\.ts$|index\.ts$/.test(file)) continue;
    assert.match(readFileSync(file, "utf8"), /COPY: confirm met Marlon/, path.relative(root, file));
  }
});

test("de profielteksten komen letterlijk uit de mockup", () => {
  const mock = readFileSync(path.join(root, "mockups", "hormoonprofiel-mockup.html"), "utf8");
  const data = readFileSync(path.join(contentDir, "profielen-data.ts"), "utf8");
  const unesc = (s: string) => s.replace(/\\'/g, "'");
  // Elke tekstwaarde (does, signs, self, site) uit de mockup staat in de data.
  const re = /(?:does|signs|self|site|short|name): '((?:[^'\\]|\\.)*)'/g;
  let n = 0;
  for (const m of mock.matchAll(re)) {
    n++;
    assert.ok(data.includes(unesc(m[1])), `ontbreekt in profielen-data.ts: ${m[1]}`);
  }
  assert.equal(n, 36);
});

// ---- Gerenderde HTML (alleen met HP_BASE_URL) --------------------------------

const BASE = process.env.HP_BASE_URL;
const PATHS = [
  "/", "/wat-is-personal-hormonal-profiling", "/waarom-is-een-persoonlijk-hormoonprofiel-belangrijk",
  "/hoe-werkt-personal-hormonal-profiling", "/het-belang-van-hormoontraining", "/voedingssupplementen",
  "/voedingsrichtlijnen", "/verschillende-hormoonprofielen", "/veel-gestelde-vragen", "/contact-gegevens",
];

async function html(variant: "standalone" | "section", p: string): Promise<string> {
  const headers: Record<string, string> = variant === "standalone" ? { "x-legacy-host-test": "hormoonprofiel.com" } : {};
  const url =
    variant === "standalone"
      ? `${BASE}${p}`
      : `${BASE}/hormoonprofiel${p === "/" ? "" : p}?__mode=redirect_permanent`;
  const res = await fetch(url, { headers, redirect: "manual" });
  assert.equal(res.status, 200, url);
  return res.text();
}

for (const variant of ["standalone", "section"] as const) {
  for (const p of PATHS) {
    test(`gerenderd (${variant}) ${p}: een H1, In het kort, disclaimer, geen prijzen`, { skip: !BASE }, async () => {
      const page = await html(variant, p);
      // Alleen het hormoonprofiel-deel: de TMC-chrome heeft eigen JSON-LD (priceRange).
      const start = page.indexOf("hp-module");
      assert.ok(start > 0);
      const body = page
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<link[^>]*>/g, "");
      const h1s = body.match(/<h1[\s>]/g) ?? [];
      assert.equal(h1s.length, 1, "precies een H1");
      assert.match(body, /In het kort/);
      assert.match(body, /Geen medisch advies\./);
      assert.match(body, /Marlon van der Leij/);
      assert.match(body, /Plan een kennismaking/);
      const main = variant === "standalone" ? body : body.slice(body.indexOf("hp-module"));
      const mainStart = main.indexOf("class=\"hp-module");
      const region = variant === "standalone" ? main : main.slice(Math.max(0, mainStart));
      assert.ok(!/€|\beuro\b|,-|pakket/i.test(region.replace(/<footer[\s\S]*<\/footer>/, "")), "geen prijsterm");
      assert.ok(!/href="[^"]*\/(product|winkelwagen)/i.test(region), "geen shoplink");
    });
  }
}
