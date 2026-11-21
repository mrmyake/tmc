/**
 * Controlescript voor de legacy-domeinredirects.
 *
 *   npm run check:legacy-redirects -- --base <url> [--host-header ptloosdrecht.nl]
 *                                     [--expect-status 308] [--skip-target-check]
 *
 * Loopt alle URL's uit scripts/legacy-domains/cases.mts af zonder redirects te
 * volgen en rapporteert per URL de status, de Location en of het een enkele
 * hop is (de Location wijst op de canonieke TMC-host en geeft daar zelf geen
 * redirect). Exitcode 1 bij elke afwijking.
 *
 * --host-header gebruikt de testhook (x-legacy-host-test), alleen werkend op
 * preview en development. Zonder die vlag stuurt het script gewone verzoeken
 * naar --base, bijvoorbeeld https://ptloosdrecht.nl na de DNS-omzetting.
 * Daarnaast draait altijd de sectie tmc-trailing-slash tegen --base, zonder
 * testhook: die bewijst dat TMC-bezoekers hetzelfde trailing-slash-gedrag
 * houden als op main (zie skipTrailingSlashRedirect in next.config.ts).
 *
 * Met --host-header worden de varianten met trailing slash overgeslagen (zie
 * de opmerking in main). VERCEL_AUTOMATION_BYPASS_SECRET wordt als bypass-header meegestuurd als
 * Deployment Protection aanstaat.
 */
import { LEGACY_CASES } from "./legacy-domains/cases.mts";

const CANONICAL_HOST = "www.themovementclub.nl";

function parseArgs(argv: string[]) {
  const args: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const base = typeof args.base === "string" ? args.base.replace(/\/+$/, "") : "";
if (!base) {
  console.error(
    "Gebruik: npm run check:legacy-redirects -- --base <url> [--host-header ptloosdrecht.nl] [--expect-status 308] [--skip-target-check]",
  );
  process.exit(2);
}
const hostHeader = typeof args["host-header"] === "string" ? args["host-header"] : null;
const expectStatus = typeof args["expect-status"] === "string" ? Number(args["expect-status"]) : 308;
const skipTargetCheck = args["skip-target-check"] === true;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

function headers(): Record<string, string> {
  const h: Record<string, string> = { "user-agent": "tmc-check-legacy-redirects" };
  if (hostHeader) h["x-legacy-host-test"] = hostHeader;
  if (bypass) h["x-vercel-protection-bypass"] = bypass;
  return h;
}

type Row = { url: string; status: number; location: string; hop: string; problems: string[] };

const targetStatusCache = new Map<string, number>();
async function targetStatus(location: string): Promise<number> {
  const key = location.split("?")[0];
  const cached = targetStatusCache.get(key);
  if (cached !== undefined) return cached;
  const res = await fetch(key, { redirect: "manual", method: "GET" });
  targetStatusCache.set(key, res.status);
  return res.status;
}

async function check(path: string, expectedLocation: string): Promise<Row> {
  const url = `${base}${path}`;
  const problems: string[] = [];
  const res = await fetch(url, { redirect: "manual", headers: headers() });
  const location = res.headers.get("location") ?? "";

  if (res.status !== expectStatus) problems.push(`status ${res.status}, verwacht ${expectStatus}`);
  if (location !== expectedLocation) problems.push("Location wijkt af");

  let hop = "n.v.t.";
  if (location) {
    let host = "";
    try {
      host = new URL(location).host;
    } catch {
      problems.push("Location is geen absolute URL");
    }
    if (host !== CANONICAL_HOST) problems.push(`Location-host ${host}`);
    if (skipTargetCheck) hop = "niet gecontroleerd";
    else {
      const status = await targetStatus(location);
      hop = status === 200 ? "enkel" : `meerdere (doel geeft ${status})`;
      if (status !== 200) problems.push(`doel geeft ${status}, geen enkele hop`);
    }
  }
  return { url: path, status: res.status, location, hop, problems };
}

async function checkAcme(): Promise<Row> {
  const path = "/.well-known/acme-challenge/legacy-check";
  const res = await fetch(`${base}${path}`, { redirect: "manual", headers: headers() });
  const location = res.headers.get("location") ?? "";
  const problems: string[] = [];
  if (location.includes("themovementclub.nl") && res.status >= 300 && res.status < 400) {
    problems.push("acme-challenge wordt afgevangen");
  }
  return { url: path, status: res.status, location, hop: "n.v.t.", problems };
}

/**
 * Sectie tmc-trailing-slash: gedrag voor gewone TMC-verzoeken, zonder
 * testhook, letterlijk gelijk aan productie (main) op het moment van schrijven.
 * Locations worden vergeleken op pad en query; de host moet die van --base zijn
 * (een enkele hop op dezelfde host).
 */
const TMC_TRAILING_SLASH: ReadonlyArray<{ path: string; status: number; location: string | null }> = [
  { path: "/", status: 200, location: null },
  { path: "/over/", status: 308, location: "/over" },
  { path: "/over/?utm_source=x", status: 308, location: "/over?utm_source=x" },
  { path: "/yoga/docenten/", status: 308, location: "/yoga/docenten" },
  { path: "/yoga/docenten", status: 200, location: null },
  { path: "/api/contact/", status: 308, location: "/api/contact" },
  { path: "/robots.txt/", status: 308, location: "/robots.txt" },
  { path: "/favicon.ico/", status: 308, location: "/favicon.ico" },
  { path: "/manifest.json/", status: 308, location: "/manifest.json" },
];

async function checkTmcSlash(entry: (typeof TMC_TRAILING_SLASH)[number]): Promise<Row> {
  const problems: string[] = [];
  const plain: Record<string, string> = { "user-agent": "tmc-check-legacy-redirects" };
  if (bypass) plain["x-vercel-protection-bypass"] = bypass;
  const res = await fetch(`${base}${entry.path}`, { redirect: "manual", headers: plain });
  const location = res.headers.get("location") ?? "";

  if (res.status !== entry.status) problems.push(`status ${res.status}, verwacht ${entry.status}`);
  if (entry.location === null) {
    if (location) problems.push(`onverwachte redirect naar ${location}`);
  } else {
    try {
      const url = new URL(location, base);
      const got = `${url.pathname}${url.search}`;
      if (got !== entry.location) problems.push(`Location ${got}, verwacht ${entry.location}`);
      if (url.host !== new URL(base).host) problems.push(`Location-host ${url.host}, verwacht ${new URL(base).host}`);
    } catch {
      problems.push("Location ontbreekt of is ongeldig");
    }
  }
  return { url: entry.path, status: res.status, location, hop: location ? "enkel" : "n.v.t.", problems };
}

async function main() {
  const rows: Row[] = [];
  for (const { path, location } of LEGACY_CASES) {
    rows.push(await check(path, location));
    // Met de testhook is de echte host TMC, en Next's expliciete trailing-slash-
    // redirect (alleen voor niet-oude hosts) grijpt dan eerder in. De slash-
    // variant wordt daarom alleen zonder testhook gecontroleerd; de unit-tests
    // dekken hem altijd.
    if (path !== "/" && !hostHeader) rows.push(await check(`${path}/`, location));
  }
  rows.push(await checkAcme());

  // De sectie draait altijd tegen --base, behalve als --base zelf een oud
  // domein is (na de DNS-omzetting): daar is "TMC-gedrag" per definitie een
  // redirect en zou de sectie ten onrechte falen.
  const baseHost = new URL(base).hostname.replace(/^www\./, "");
  const baseIsLegacy = baseHost === "ptloosdrecht.nl" || baseHost === "hormoonprofiel.com";
  const slashRows: Row[] = [];
  if (!baseIsLegacy) for (const entry of TMC_TRAILING_SLASH) slashRows.push(await checkTmcSlash(entry));

  const print = (list: Row[]) => {
    for (const row of list) {
      const flag = row.problems.length ? "AFWIJKING" : "ok";
      console.log(
        `${flag.padEnd(9)} ${String(row.status).padEnd(3)} ${row.url}\n          Location: ${row.location || "(geen)"}\n          hop: ${row.hop}${row.problems.length ? `\n          probleem: ${row.problems.join("; ")}` : ""}`,
      );
    }
  };
  console.log("== legacy-redirects ==");
  print(rows);
  console.log("\n== tmc-trailing-slash ==");
  if (baseIsLegacy) console.log("overgeslagen: --base is een oud domein");
  print(slashRows);

  const all = [...rows, ...slashRows];
  const bad = all.filter((r) => r.problems.length);
  console.log(
    `\n${all.length} URL's gecontroleerd (${rows.length} legacy, ${slashRows.length} tmc-trailing-slash), ${all.length - bad.length} ok, ${bad.length} afwijkingen. Basis ${base}${hostHeader ? `, testhook-host ${hostHeader}` : ""}.`,
  );
  process.exit(bad.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
