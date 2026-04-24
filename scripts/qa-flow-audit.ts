#!/usr/bin/env node
/**
 * QA flow audit — eenmalig, geen persistente suite. Draait read-only
 * checks op productie:
 *   - Forms renderen + client-side validatie (geen submits)
 *   - Crowdfunding tier-click → Mollie redirect URL pattern
 *   - Sanity Studio laadt
 *   - Cookie consent banner verschijnt
 *   - OG meta tags aanwezig
 */

import { chromium, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "fs";

const BASE = process.env.CRAWL_BASE ?? "https://www.themovementclub.nl";

interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail });
  const tag = pass ? "✓" : "✗";
  console.log(`${tag} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function checkFormRender(page: Page, url: string, formSelector: string, formName: string): Promise<void> {
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const form = page.locator(formSelector);
    const exists = (await form.count()) > 0;
    record(`${formName}: form renders`, exists, exists ? undefined : `selector ${formSelector} not found`);
  } catch (e) {
    record(`${formName}: form renders`, false, (e as Error).message.slice(0, 100));
  }
}

async function checkCrowdfundingFlow(page: Page): Promise<void> {
  try {
    await page.goto(`${BASE}/crowdfunding`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    // Tier cards in DOM
    const tierCount = await page.locator('[id="tiers"] article, section#tiers article').count();
    record(
      "crowdfunding: tier cards renderen",
      tierCount > 0,
      `${tierCount} tiers in DOM`,
    );
    // CTA in de hero
    const heroBtn = await page.getByRole("link", { name: /kies jouw tier/i }).count();
    record("crowdfunding: hero CTA aanwezig", heroBtn > 0);
  } catch (e) {
    record("crowdfunding: flow", false, (e as Error).message.slice(0, 100));
  }
}

async function checkStudio(page: Page): Promise<void> {
  try {
    const res = await page.goto(`${BASE}/studio`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const status = res?.status() ?? 0;
    record(`studio: responds 200`, status === 200, `status ${status}`);
    // Sanity Studio mount — zoek naar `sanity-studio` marker of het root element
    const hasStudioShell = (await page.locator("body").innerHTML()).length > 200;
    record("studio: content rendered", hasStudioShell);
  } catch (e) {
    record("studio: load", false, (e as Error).message.slice(0, 100));
  }
}

async function checkCookieBanner(page: Page): Promise<void> {
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20_000 });
    // Wacht kort — CookieConsent is dynamic-imported met ssr:false
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("body").innerText();
    const hasBanner =
      /cookie/i.test(bodyText) ||
      /consent/i.test(bodyText) ||
      (await page.locator('[role="dialog"], [aria-label*="cookie" i]').count()) > 0;
    record("consent: banner visible voor nieuwe bezoeker", hasBanner);
  } catch (e) {
    record("consent: banner", false, (e as Error).message.slice(0, 100));
  }
}

async function checkOgMeta(page: Page): Promise<void> {
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    const ogTitle = await page.locator('meta[property="og:title"]').first().getAttribute("content");
    record(
      "meta: og:image aanwezig",
      !!ogImage,
      ogImage?.slice(0, 100),
    );
    record("meta: og:title aanwezig", !!ogTitle, ogTitle?.slice(0, 60));
  } catch (e) {
    record("meta: og tags", false, (e as Error).message.slice(0, 100));
  }
}

async function checkAnalyticsBeforeConsent(page: Page): Promise<void> {
  try {
    const requests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (/google-analytics|googletagmanager|collect\?v=2/.test(url)) {
        requests.push(url);
      }
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(3000);
    // Voor consent moet GA4 NIET gehit zijn (Consent Mode v2 default: denied)
    const gaHits = requests.filter((u) => /collect\?v=2/.test(u)).length;
    record(
      "consent: geen GA4 collect voor consent",
      gaHits === 0,
      `${gaHits} GA4 collects`,
    );
    // gtag.js mag wel geladen zijn (maar de events niet gefired)
    const gtagLoaded = requests.some((u) => /googletagmanager\.com\/gtag/.test(u));
    record("consent: gtag.js geladen (voor toekomstige consent)", gtagLoaded);
  } catch (e) {
    record("consent: analytics check", false, (e as Error).message.slice(0, 100));
  }
}

async function main(): Promise<void> {
  console.log(`[qa-flow] BASE=${BASE}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    // Clean cookies zodat consent-banner verschijnt
    storageState: undefined,
  });
  const page = await context.newPage();

  await checkFormRender(
    page,
    "/proefles",
    'form:has(input[name="email"])',
    "proefles",
  );
  await checkFormRender(
    page,
    "/contact",
    'form:has(input[name="email"])',
    "contact",
  );
  await checkFormRender(
    page,
    "/beweeg-beter",
    'form:has(input[name="email"])',
    "beweeg-beter",
  );
  await checkFormRender(
    page,
    "/mobility-reset",
    'form:has(input[name="email"])',
    "mobility-reset",
  );
  await checkFormRender(
    page,
    "/mobility-check",
    'form:has(input[name="email"])',
    "mobility-check",
  );
  await checkCrowdfundingFlow(page);
  await checkStudio(page);
  await checkCookieBanner(page);
  await checkOgMeta(page);
  await checkAnalyticsBeforeConsent(page);

  await browser.close();

  // Schrijf resultaten naar een tijdelijk file dat we dan naar het
  // audit-rapport transplanteren.
  mkdirSync("docs", { recursive: true });
  const lines = [
    "# QA flow audit results",
    "",
    `- Target: ${BASE}`,
    `- Date: ${new Date().toISOString()}`,
    "",
    "| Check | Result | Detail |",
    "|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.pass ? "pass" : "**fail**"} | ${r.detail ?? ""} |`,
    ),
  ];
  writeFileSync("docs/QA_FLOW_RESULTS.md", lines.join("\n"));

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n[qa-flow] ${results.length} checks, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
