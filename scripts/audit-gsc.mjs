#!/usr/bin/env node
/**
 * Pulls Google Search Console performance + sitemap data and writes raw JSON
 * to docs/audit/data/gsc/. Authenticates via an OAuth 2.0 Desktop client —
 * works around Workspace org restrictions on ADC scopes.
 *
 * Required env (.env.local):
 *   GSC_SITE_URL              e.g. "sc-domain:themovementclub.nl"
 *   GSC_OAUTH_CLIENT_PATH     path to client_secret_*.json from Cloud Console
 *   GSC_TOKEN_PATH            path where the refresh token is cached
 *
 * First run opens a browser for consent. Subsequent runs use the cached
 * refresh token — no browser needed.
 */

import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { google } from "googleapis";

const CLIENT_PATH = process.env.GSC_OAUTH_CLIENT_PATH;
const TOKEN_PATH = process.env.GSC_TOKEN_PATH;
const SITE_URL = process.env.GSC_SITE_URL;
const OUT_DIR = "docs/audit/data/gsc";
const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}`;
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

const required = { GSC_SITE_URL: SITE_URL, GSC_OAUTH_CLIENT_PATH: CLIENT_PATH, GSC_TOKEN_PATH: TOKEN_PATH };
for (const [k, v] of Object.entries(required)) {
  if (!v) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
}

function loadOAuthClient() {
  const raw = JSON.parse(readFileSync(CLIENT_PATH, "utf8"));
  const cfg = raw.installed || raw.web;
  if (!cfg) throw new Error("OAuth client JSON missing 'installed' or 'web' section");
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, REDIRECT_URI);
}

async function interactiveAuth(oauth2) {
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n→ Open deze URL in je browser om Search Console-toegang te verlenen:\n");
  console.log(authUrl);
  console.log("");
  exec(`open '${authUrl}'`, () => {});

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const c = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      if (err) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(`Auth error: ${err}`);
        server.close();
        reject(new Error(`OAuth error: ${err}`));
        return;
      }
      if (c) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>OK</h1><p>Je kunt deze tab sluiten en terugkeren naar de terminal.</p>");
        server.close();
        resolve(c);
      }
    });
    server.on("error", reject);
    server.listen(REDIRECT_PORT, "127.0.0.1");
    setTimeout(() => {
      server.close();
      reject(new Error("Timeout: geen browser-callback binnen 5 minuten"));
    }, 5 * 60 * 1000);
  });

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  await mkdir(dirname(TOKEN_PATH), { recursive: true });
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  console.log(`✓ Refresh token opgeslagen in ${TOKEN_PATH}`);
  return oauth2;
}

async function authenticate() {
  const oauth2 = loadOAuthClient();

  if (existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(readFileSync(TOKEN_PATH, "utf8"));
    oauth2.setCredentials(tokens);
    oauth2.on("tokens", async (newTokens) => {
      const merged = { ...tokens, ...newTokens };
      await writeFile(TOKEN_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });
    });
    return oauth2;
  }

  return interactiveAuth(oauth2);
}

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const auth = await authenticate();
  const sc = google.searchconsole({ version: "v1", auth });

  async function searchAnalytics(dimensions, days, rowLimit = 500) {
    const res = await sc.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate: daysAgo(days),
        endDate: today,
        dimensions,
        rowLimit,
      },
    });
    return res.data.rows ?? [];
  }

  await mkdir(OUT_DIR, { recursive: true });

  const datasets = {
    "queries-28d.json": await searchAnalytics(["query"], 28),
    "queries-90d.json": await searchAnalytics(["query"], 90),
    "pages-28d.json": await searchAnalytics(["page"], 28),
    "pages-90d.json": await searchAnalytics(["page"], 90),
    "queries-by-page-90d.json": await searchAnalytics(["page", "query"], 90, 1000),
    "device-90d.json": await searchAnalytics(["device"], 90),
    "country-90d.json": await searchAnalytics(["country"], 90),
    "sitemaps.json": (await sc.sitemaps.list({ siteUrl: SITE_URL })).data.sitemap ?? [],
  };

  const meta = {
    fetched_at: new Date().toISOString(),
    site_url: SITE_URL,
    today,
    counts: Object.fromEntries(
      Object.entries(datasets).map(([k, v]) => [k, Array.isArray(v) ? v.length : null]),
    ),
  };

  for (const [filename, data] of Object.entries(datasets)) {
    await writeFile(`${OUT_DIR}/${filename}`, JSON.stringify(data, null, 2));
    const count = Array.isArray(data) ? `${data.length} rows` : "ok";
    console.log(`✓ ${filename} (${count})`);
  }

  await writeFile(`${OUT_DIR}/_meta.json`, JSON.stringify(meta, null, 2));
  console.log(`✓ _meta.json`);
  console.log(`\nDone. Output in ${OUT_DIR}/`);
}

try {
  await main();
} catch (err) {
  console.error("\nGSC audit failed:");
  if (err?.response?.data?.error) {
    console.error(JSON.stringify(err.response.data.error, null, 2));
  } else {
    console.error(err?.message || err);
  }
  console.error(
    "\nCommon causes:\n" +
      "  - Refresh token verlopen of revoked → verwijder GSC_TOKEN_PATH file en run opnieuw\n" +
      "  - OAuth Client niet juist Desktop type, of Search Console scope niet in consent screen\n" +
      "  - Account waarmee je consent gaf is geen GSC property-eigenaar\n" +
      "  - GSC_SITE_URL mismatch (domain vs URL-prefix property)",
  );
  process.exit(1);
}
