import { readFileSync } from "node:fs";
import { google } from "googleapis";

const TOKEN_PATH = process.env.GSC_TOKEN_PATH;
const CLIENT_PATH = process.env.GSC_OAUTH_CLIENT_PATH;
const SITE_URL = process.env.GSC_SITE_URL;
const raw = JSON.parse(readFileSync(CLIENT_PATH, "utf8"));
const cfg = raw.installed || raw.web;
const oauth2 = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, "http://127.0.0.1:8765");
oauth2.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, "utf8")));
const sc = google.searchconsole({ version: "v1", auth: oauth2 });

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const ranges = [
  { label: "last 7 days", days: 7 },
  { label: "last 28 days", days: 28 },
  { label: "last 90 days", days: 90 },
  { label: "last 16 months (max)", days: 480 },
];

console.log(`Property: ${SITE_URL}\n`);

for (const r of ranges) {
  const res = await sc.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: daysAgo(r.days),
      endDate: today,
      dimensions: [],
      rowLimit: 1,
    },
  });
  const row = res.data.rows?.[0];
  if (row) {
    console.log(
      `${r.label.padEnd(28)} clicks=${row.clicks}  impressions=${row.impressions}  ctr=${(row.ctr * 100).toFixed(2)}%  pos=${row.position.toFixed(1)}`,
    );
  } else {
    console.log(`${r.label.padEnd(28)} no data`);
  }
}

const idx = await sc.sitemaps.list({ siteUrl: SITE_URL });
console.log("\nSitemaps:");
console.log(JSON.stringify(idx.data.sitemap ?? [], null, 2));
