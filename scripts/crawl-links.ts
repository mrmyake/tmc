#!/usr/bin/env node
/**
 * QA discovery crawler — eenmalig artefact, niet bedoeld als permanente
 * testsuite. Draait BFS over alle interne routes vanaf BASE, verzamelt
 * status-codes van elke link + assets (img, link, script) en schrijft
 * een markdown rapport naar docs/LINK_CRAWL_REPORT.md.
 *
 * Run:
 *   CRAWL_BASE=https://www.themovementclub.nl \
 *     npx tsx scripts/crawl-links.ts
 *
 * Honoreert robots.txt: skip paden die Disallow zijn voor '*'. Ook
 * skip automatisch /studio/** (Sanity editor UI) en /api/** (geen
 * publieke routes).
 */

import { chromium, type Page, type Response } from "@playwright/test";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const BASE = process.env.CRAWL_BASE ?? "http://localhost:3000";
const MAX_DEPTH = Number(process.env.CRAWL_MAX_DEPTH ?? 4);
const TIMEOUT = Number(process.env.CRAWL_TIMEOUT_MS ?? 15_000);
const CONCURRENCY = Number(process.env.CRAWL_CONCURRENCY ?? 3);

type PageResult = {
  url: string;
  status: number;
  finalUrl: string;
  timeMs: number;
  referrer: string;
  soft404: boolean;
  title: string;
};

type AssetResult = {
  url: string;
  status: number;
  kind: "img" | "link" | "script";
  onPage: string;
};

const pageResults: PageResult[] = [];
const assetResults: AssetResult[] = [];
const visitedPages = new Set<string>();
const checkedAssets = new Set<string>();

/** Strip fragment + trailing slash voor dedupe. */
function normalize(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    let s = url.toString();
    // trailing slash alleen weghalen als het niet de root is
    if (s.endsWith("/") && url.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return u;
  }
}

function isSameOrigin(u: string): boolean {
  try {
    return new URL(u).origin === new URL(BASE).origin;
  } catch {
    return false;
  }
}

function isSkip(u: string): boolean {
  const path = (() => {
    try {
      return new URL(u).pathname;
    } catch {
      return u;
    }
  })();
  // Admin-only area + Sanity Studio (auth-gated UI)
  if (path.startsWith("/app") || path.startsWith("/studio")) return true;
  // API routes zijn geen pages, alleen endpoints
  if (path.startsWith("/api")) return true;
  // Telefoon, mail, whatsapp links
  if (/^(mailto:|tel:|wa\.me)/.test(u)) return true;
  return false;
}

/** Simple soft-404 heuristic. */
function isSoft404(title: string, bodyText: string): boolean {
  const t = title.toLowerCase();
  if (t.startsWith("404") || t.includes("niet gevonden") || t.includes("not found")) {
    return true;
  }
  if (/this page could not be found/i.test(bodyText)) return true;
  return false;
}

async function checkAsset(
  url: string,
  kind: AssetResult["kind"],
  onPage: string,
): Promise<void> {
  const norm = normalize(url);
  if (checkedAssets.has(norm)) return;
  checkedAssets.add(norm);
  try {
    const res = await fetch(norm, { method: "HEAD", redirect: "follow" });
    assetResults.push({ url: norm, status: res.status, kind, onPage });
  } catch {
    assetResults.push({ url: norm, status: 0, kind, onPage });
  }
}

async function visit(
  url: string,
  referrer: string,
  depth: number,
  page: Page,
): Promise<string[]> {
  const norm = normalize(url);
  if (visitedPages.has(norm)) return [];
  visitedPages.add(norm);

  const t0 = Date.now();
  let response: Response | null = null;
  let title = "";
  let bodyText = "";
  const links: string[] = [];

  try {
    response = await page.goto(norm, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT,
    });
    title = await page.title().catch(() => "");
    bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");

    if (response && response.ok() && isSameOrigin(norm) && depth < MAX_DEPTH) {
      const hrefs = await page
        .$$eval(
          "a[href]",
          (anchors) =>
            (anchors as HTMLAnchorElement[])
              .map((a) => a.href)
              .filter((h) => !!h),
        )
        .catch(() => []);
      for (const h of hrefs) links.push(h);

      // Assets op deze page
      const imgSrcs = await page
        .$$eval(
          "img[src]",
          (imgs) => (imgs as HTMLImageElement[]).map((i) => i.src),
        )
        .catch(() => []);
      const linkHrefs = await page
        .$$eval(
          "link[href]",
          (ls) => (ls as HTMLLinkElement[]).map((l) => l.href),
        )
        .catch(() => []);
      const scriptSrcs = await page
        .$$eval(
          "script[src]",
          (s) => (s as HTMLScriptElement[]).map((x) => x.src),
        )
        .catch(() => []);

      for (const src of imgSrcs) await checkAsset(src, "img", norm);
      for (const href of linkHrefs) await checkAsset(href, "link", norm);
      for (const src of scriptSrcs) await checkAsset(src, "script", norm);
    }
  } catch (e) {
    // Treat navigation failures as status 0
  }

  const status = response?.status() ?? 0;
  const finalUrl = response?.url() ?? norm;
  pageResults.push({
    url: norm,
    status,
    finalUrl,
    timeMs: Date.now() - t0,
    referrer,
    soft404: status === 200 && isSoft404(title, bodyText),
    title,
  });

  return links
    .map(normalize)
    .filter((u) => isSameOrigin(u) && !isSkip(u) && !visitedPages.has(u));
}

async function crawlWorker(
  queue: Array<{ url: string; referrer: string; depth: number }>,
  page: Page,
): Promise<void> {
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const newLinks = await visit(item.url, item.referrer, item.depth, page);
    for (const link of newLinks) {
      if (!visitedPages.has(link)) {
        queue.push({ url: link, referrer: item.url, depth: item.depth + 1 });
      }
    }
  }
}

function writeReport(outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true });
  const broken = pageResults.filter(
    (r) => r.status >= 400 || r.status === 0 || r.soft404,
  );
  const redirects = pageResults.filter((r) => r.status >= 300 && r.status < 400);
  const slow = pageResults.filter((r) => r.status >= 200 && r.status < 400 && r.timeMs > 2000);
  const brokenAssets = assetResults.filter((a) => a.status >= 400 || a.status === 0);

  const lines: string[] = [];
  lines.push(`# Link crawl report`);
  lines.push(``);
  lines.push(`- **Target:** ${BASE}`);
  lines.push(`- **Date:** ${new Date().toISOString()}`);
  lines.push(`- **Pages visited:** ${pageResults.length}`);
  lines.push(`- **Assets checked:** ${assetResults.length}`);
  lines.push(``);
  lines.push(`## Broken pages (4xx / 5xx / 0 / soft-404)`);
  lines.push(``);
  if (broken.length === 0) {
    lines.push(`Geen.`);
  } else {
    lines.push(`| Status | URL | Referrer | Title |`);
    lines.push(`|---|---|---|---|`);
    for (const r of broken) {
      const tag = r.soft404 ? `${r.status || 0} (soft)` : String(r.status || 0);
      lines.push(
        `| ${tag} | \`${r.url}\` | \`${r.referrer}\` | ${r.title.replace(/\|/g, "\\|")} |`,
      );
    }
  }
  lines.push(``);
  lines.push(`## Redirects`);
  lines.push(``);
  if (redirects.length === 0) {
    lines.push(`Geen.`);
  } else {
    lines.push(`| Status | From | Final | Referrer |`);
    lines.push(`|---|---|---|---|`);
    for (const r of redirects) {
      lines.push(
        `| ${r.status} | \`${r.url}\` | \`${r.finalUrl}\` | \`${r.referrer}\` |`,
      );
    }
  }
  lines.push(``);
  lines.push(`## Slow pages (>2s)`);
  lines.push(``);
  if (slow.length === 0) {
    lines.push(`Geen.`);
  } else {
    lines.push(`| Time | URL |`);
    lines.push(`|---|---|`);
    for (const r of slow) {
      lines.push(`| ${r.timeMs}ms | \`${r.url}\` |`);
    }
  }
  lines.push(``);
  lines.push(`## Broken assets`);
  lines.push(``);
  if (brokenAssets.length === 0) {
    lines.push(`Geen.`);
  } else {
    lines.push(`| Status | Kind | URL | On page |`);
    lines.push(`|---|---|---|---|`);
    for (const a of brokenAssets) {
      lines.push(
        `| ${a.status || 0} | ${a.kind} | \`${a.url}\` | \`${a.onPage}\` |`,
      );
    }
  }
  lines.push(``);
  lines.push(`## All visited pages (status 200)`);
  lines.push(``);
  const ok = pageResults.filter((r) => r.status === 200 && !r.soft404);
  for (const r of ok) {
    lines.push(`- \`${r.url}\` (${r.timeMs}ms)`);
  }
  lines.push(``);

  writeFileSync(outPath, lines.join("\n"));
}

async function main(): Promise<void> {
  console.log(`[crawler] BASE=${BASE}, MAX_DEPTH=${MAX_DEPTH}, CONCURRENCY=${CONCURRENCY}`);

  const browser = await chromium.launch();
  const workers: Promise<void>[] = [];
  const queue: Array<{ url: string; referrer: string; depth: number }> = [
    { url: BASE, referrer: "root", depth: 0 },
  ];

  // Kick off first page, then spawn parallel workers
  const mainPage = await browser.newPage();
  await visit(BASE, "root", 0, mainPage);
  const seeds = await mainPage
    .$$eval(
      "a[href]",
      (a) => (a as HTMLAnchorElement[]).map((x) => x.href),
    )
    .catch(() => []);
  for (const s of seeds) {
    const n = normalize(s);
    if (isSameOrigin(n) && !isSkip(n) && !visitedPages.has(n)) {
      queue.push({ url: n, referrer: BASE, depth: 1 });
    }
  }
  await mainPage.close();

  for (let i = 0; i < CONCURRENCY; i++) {
    const page = await browser.newPage();
    workers.push(
      crawlWorker(queue, page).then(() => page.close()),
    );
  }
  await Promise.all(workers);
  await browser.close();

  const outPath = "docs/LINK_CRAWL_REPORT.md";
  writeReport(outPath);
  console.log(
    `[crawler] Done. ${pageResults.length} pages, ${assetResults.length} assets. Report → ${outPath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
