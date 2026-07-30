#!/usr/bin/env node
/**
 * Route smoke test — read-only. Navigeert (GET) naar elke bekende route,
 * maakt een full-page screenshot en checkt op HTTP-status, een zichtbare
 * errorgrens en een lege body.
 *
 * DIT SCRIPT MAG NOOIT EEN SCHRIJFACTIE UITVOEREN. Geen formulier submits,
 * geen knoppen die state wijzigen, geen POST/PUT/PATCH/DELETE. Alleen
 * page.goto() (GET) en page.screenshot(). Draait standaard tegen productie.
 *
 * Scope: alleen publieke routes. Discovery (2026-07-30) wees uit dat
 * /login uitsluitend e-mail-OTP gebruikt (supabase.auth.signInWithOtp,
 * zie src/app/login/LoginForm.tsx) — geen wachtwoord-login, geen
 * klikbare magic link. Een 6-cijferige code kan niet headless uit een
 * echte inbox gehaald worden, dus member/trainer/admin routes (die achter
 * /login zitten, zie matcher in src/proxy.ts) zijn hier bewust buiten
 * scope gelaten.
 *
 * Run:
 *   npm run route-smoke
 *   ROUTE_SMOKE_BASE_URL=http://localhost:3000 npm run route-smoke
 */

import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.ROUTE_SMOKE_BASE_URL ?? "https://www.themovementclub.nl";
const NAV_TIMEOUT_MS = Number(process.env.ROUTE_SMOKE_TIMEOUT_MS ?? 20_000);
const SCREENSHOT_DIR = "screenshots";
const MIN_BODY_CHARS = 30;

// Statische publieke routes. Uitgesloten (geen veilig te verzinnen param,
// zie discovery): /auth/callback/implicit (verwacht hash-tokens),
// /betaal/[token], /proefles/annuleren/[token], /yoga/[style],
// /yoga/docenten/[slug] (Sanity-gedreven, geen vaste testdata-slug).
const PUBLIC_ROUTES: string[] = [
  "/",
  "/12-weken-programma",
  "/12-weken-programma/intake",
  "/aanbod",
  "/abonnement",
  "/beweeg-beter",
  "/beweeg-beter/bedankt",
  "/checkin",
  "/contact",
  "/early-member",
  "/login",
  "/mobility-check",
  "/mobility-check/bedankt",
  "/mobility-reset",
  "/mobility-reset/bedankt",
  "/over",
  "/prijzen",
  "/privacybeleid",
  "/proefles",
  "/proefles/boeken",
  "/proefles/boeken/bedankt",
  "/proefles/code",
  "/rooster",
  "/yoga",
  "/yoga/docenten",
  "/yoga/rooster",
];

const VIEWPORTS = [
  { label: "desktop", size: { width: 1440, height: 900 } },
  { label: "mobile", size: { width: 390, height: 844 } },
] as const;

// Bekende error-boundary teksten uit deze codebase (src/app/not-found.tsx,
// src/app/app/error.tsx) plus de generieke Next.js/React fallback-teksten.
const ERROR_PATTERNS: RegExp[] = [
  /pagina niet gevonden/i,
  /er ging iets mis/i,
  /we konden dit niet laden/i,
  /application error/i,
  /internal server error/i,
  /er is een onverwachte fout/i,
];

function routeToSlug(route: string): string {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/\//g, "-");
}

type CheckResult =
  | { route: string; ok: true }
  | { route: string; ok: false; reason: string };

async function checkRoute(
  page: Page,
  role: string,
  viewportLabel: string,
  route: string,
): Promise<CheckResult> {
  const url = new URL(route, BASE_URL).toString();

  let response;
  try {
    response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
  } catch (e) {
    return { route, ok: false, reason: `navigatie mislukt: ${(e as Error).message.slice(0, 150)}` };
  }

  const status = response?.status() ?? 0;
  if (status === 0 || status > 399) {
    return { route, ok: false, reason: `HTTP ${status}` };
  }

  // Korte adempauze voor client-side hydration voordat we de body lezen.
  await page.waitForTimeout(300);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const trimmed = bodyText.trim();

  if (trimmed.length < MIN_BODY_CHARS) {
    return { route, ok: false, reason: `lege body (${trimmed.length} tekens)` };
  }

  const matchedError = ERROR_PATTERNS.find((re) => re.test(trimmed));
  if (matchedError) {
    return { route, ok: false, reason: `zichtbare errorgrens gedetecteerd (${matchedError})` };
  }

  const dir =
    viewportLabel === "desktop"
      ? path.join(SCREENSHOT_DIR, role)
      : path.join(SCREENSHOT_DIR, role, viewportLabel);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${routeToSlug(route)}.png`), fullPage: true });

  return { route, ok: true };
}

type Failure = { role: string; viewport: string; route: string; reason: string };

async function main(): Promise<void> {
  console.log(`[route-smoke] leesalleen — GET-navigatie + screenshots, geen writes`);
  console.log(`[route-smoke] doel: ${BASE_URL}`);
  console.log(`[route-smoke] ${PUBLIC_ROUTES.length} publieke routes, ${VIEWPORTS.length} viewports\n`);

  const browser = await chromium.launch();
  const failures: Failure[] = [];
  const role = "public";

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: viewport.size });
    const page = await context.newPage();

    for (const route of PUBLIC_ROUTES) {
      const result = await checkRoute(page, role, viewport.label, route);
      if (result.ok) {
        console.log(`  [${viewport.label}] ✓ ${route}`);
      } else {
        console.log(`  [${viewport.label}] ✗ ${route} — ${result.reason}`);
        failures.push({ role, viewport: viewport.label, route, reason: result.reason });
      }
    }

    await context.close();
  }

  await browser.close();

  console.log(`\n=== Overzicht ===`);
  console.log(`${role}: ${PUBLIC_ROUTES.length} routes gecontroleerd (${VIEWPORTS.map((v) => v.label).join(" + ")})`);

  if (failures.length === 0) {
    console.log(`Geen fouten gevonden.`);
  } else {
    console.log(`\n${failures.length} fout(en):`);
    for (const f of failures) {
      console.log(`  [${f.role}/${f.viewport}] ${f.route} — ${f.reason}`);
    }
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
