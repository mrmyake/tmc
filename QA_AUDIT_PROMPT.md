# QA Audit & Automated Testing — The Movement Club

> **Mode:** Discovery-first. Find what's broken, report it, fix with approval, then install automated tests to prevent regression.

## Context

The Movement Club site has confirmed broken functionality:

- `/rooster` returns 404
- Profile image upload fails
- Unknown other routes/flows may be broken

Full stack context in `CLAUDE.md`. Never assume a route works — verify every single one.

---

## Phase 1 — Discovery crawl (automated, read-only)

Goal: find every broken route and asset on the deployed site without any manual clicking.

### 1.1 Link crawler

Create a temporary script at `scripts/crawl-links.ts`. Do NOT commit this yet — it's a discovery tool. It should:

1. Start at the homepage of the deployed site (ask the user: local `http://localhost:3000`, preview, or production `https://www.themovementclub.nl`?)
2. Use Playwright to load each page, extract every `<a href>`, `<img src>`, `<link>`, `<script src>`, and form `action`
3. For internal URLs: visit them recursively (dedupe, max depth 4)
4. For external URLs: HEAD request only, no recursion
5. Record for each URL: status code, final URL (after redirects), response time, referring page
6. Detect soft 404s: pages that return 200 but contain the Next.js default "404" message or have `<title>404</title>`
7. Output `docs/LINK_CRAWL_REPORT.md` with three sections:
   - **Broken (4xx/5xx)** — sorted by status then URL, with referrer list
   - **Redirects (3xx)** — so the user can decide whether they should be permanent or fixed at source
   - **Slow (>2s TTFB)** — for awareness, not blocking

Reference implementation (adapt as needed):

```ts
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = process.env.CRAWL_BASE ?? 'http://localhost:3000';
const MAX_DEPTH = 4;

type Result = { url: string; status: number; referrer: string; time: number };
const results: Result[] = [];
const visited = new Set<string>();

async function crawl(url: string, referrer: string, depth: number, page: any) {
  if (depth > MAX_DEPTH || visited.has(url)) return;
  visited.add(url);

  const t0 = Date.now();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const status = res?.status() ?? 0;
    results.push({ url, status, referrer, time: Date.now() - t0 });

    if (status >= 400 || !url.startsWith(BASE)) return;

    const links = await page.$$eval('a[href]', (as: HTMLAnchorElement[]) => as.map(a => a.href));
    for (const link of new Set(links)) {
      if (link.startsWith(BASE)) await crawl(link, url, depth + 1, page);
    }
  } catch (e: any) {
    results.push({ url, status: 0, referrer, time: Date.now() - t0 });
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await crawl(BASE, 'root', 0, page);
  await browser.close();

  const broken = results.filter(r => r.status >= 400 || r.status === 0);
  const redirects = results.filter(r => r.status >= 300 && r.status < 400);
  const slow = results.filter(r => r.time > 2000 && r.status < 400);

  // Write markdown report
  // ...
})();
```

### 1.2 Sanity-driven route check

The site has dynamic routes driven by Sanity (programs, blog posts, team members, etc.). Verify that every published Sanity document with a slug has a corresponding working route:

1. Query the Sanity dataset for every document type with a `slug` field
2. For each: construct the expected URL (e.g. `/programmas/[slug]`, `/team/[slug]`)
3. Verify it returns 200
4. Flag any mismatch as a routing bug

### 1.3 Asset check

During the crawl, also verify:
- Every `<Image>` src returns 200 (catch broken Sanity asset references, removed files in `/public`)
- Every OG image / favicon / manifest icon referenced in metadata resolves
- Every font file referenced in `<link rel="preload">` resolves

---

## Phase 2 — Functional flow audit

Routes returning 200 aren't enough — flows can be visually correct but functionally broken. Verify each critical flow manually via Playwright script, without committing the tests yet. Record in the report whether each flow succeeds, what the failure mode is, and the exact error.

### 2.1 Navigation flows
- Every nav link from every page (desktop + mobile hamburger)
- Every footer link
- Every CTA on the homepage
- Language switcher if present

### 2.2 Lead magnet funnel
Walk through all three tiers end-to-end:
- Form validation (empty submit, invalid email, valid submit)
- MailerLite tag is applied correctly (check network request payload)
- Thank-you page loads with correct state
- Analytics events fire (check `dataLayer` or network request to GA4)

### 2.3 Contact form
- Validation behaves
- Submit reaches its endpoint
- Success state renders

### 2.4 Crowdfunding flow
- `/crowdfunding` loads and renders tiers
- Clicking a tier initiates Mollie checkout (verify redirect URL is a real Mollie URL, don't complete payment)
- `/crowdfunding/bedankt` loads when accessed directly (deduplication via `sessionStorage` prevents double-firing of `purchase` event)

### 2.5 Profile / upload flow (user-reported broken)
- Reproduce the image upload failure
- Capture the exact network request, response status, and any console errors
- Identify whether it's a Sanity client config issue, a missing API route, a CORS issue, or a permission issue
- Do NOT fix yet — document and move to report

### 2.6 Sanity Studio
- `/studio` loads
- Authentication works
- Uploading an image in the Studio works (different from the profile upload — this is the editor's CMS upload)

### 2.7 Analytics & consent
- GA4 doesn't fire before consent is granted (Consent Mode v2)
- After consent accept: pageview fires
- After consent deny: no GA4 requests appear
- Event taxonomy: trigger each event type listed in CLAUDE.md and verify the payload matches spec

---

## Phase 3 — Write the QA report

Create `docs/QA_AUDIT_REPORT.md`:

```md
# QA Audit Report
Date: [ISO date]
Target: [local | preview | production]

## 1. Executive summary
[Bullet list of every broken item, grouped by severity: critical / high / medium]

## 2. Broken routes (Phase 1.1–1.2)
[Table: URL, status, referrer, likely root cause]

## 3. Broken assets (Phase 1.3)
[Table: asset URL, referenced from, status]

## 4. Broken flows (Phase 2)
[One section per flow. For each: steps reproduced, expected, actual, exact error, likely root cause.]

## 5. Root-cause analysis
[For each broken item: the specific file and line where the bug lives, or "needs investigation" if not traceable from static analysis.]

## 6. Prioritized fix plan
[Sorted by user impact. Each item: problem, proposed fix, files affected, estimated effort, risk.]

## 7. Needs decision
[Things requiring user input: whether /rooster should exist at all, what upload endpoint should do, etc.]
```

---

## Phase 4 — Await approval

1. In chat, give a short prose summary of the critical findings
2. Ask which fixes to prioritize
3. Do NOT start fixing until explicit go-ahead

---

## Phase 5 — Fix with verification loop

For each approved fix:

1. Implement the fix
2. Re-run the relevant Playwright check from Phase 1 or 2 against the local dev server
3. Confirm the check now passes
4. Move to the next fix
5. After all fixes: run the full crawler once more, confirm zero broken items

---

## Phase 6 — Install permanent automated testing

Only after the site is clean, set up ongoing prevention.

### 6.1 Playwright setup
- Install `@playwright/test` as dev dependency
- Create `playwright.config.ts` with projects for Chromium (desktop) and Mobile Chrome (Moto G4 viewport, matches Lighthouse default)
- Target `http://localhost:3000` via `webServer` config (auto-starts `next dev` or `next start`)
- Traces on first retry, screenshots on failure, video off

### 6.2 Test suite structure

```
tests/
  e2e/
    smoke.spec.ts          # every major route returns 200
    navigation.spec.ts     # nav + footer links all work
    lead-magnet.spec.ts    # all 3 tiers submit successfully (use dummy email + cleanup)
    contact.spec.ts        # form submits
    crowdfunding.spec.ts   # flow reaches Mollie (stop before payment)
    analytics.spec.ts      # consent mode + event firing
  crawler/
    broken-links.spec.ts   # runs the crawler, fails if any 4xx/5xx found
```

### 6.3 Test data strategy
- Use dedicated MailerLite tags (`test-automation`) so test submissions are cleanly separable
- Clean up test submissions in a `afterAll` hook if the API supports delete, otherwise manually flush monthly
- For crowdfunding: use Mollie test mode API keys, never trigger real payments

### 6.4 CI integration
- Create `.github/workflows/e2e.yml` that runs on every pull request and on push to `main`
- Install Playwright browsers with caching
- Run tests against a Vercel preview deployment (use the Vercel GitHub integration to get the preview URL, then set `PLAYWRIGHT_BASE_URL` to it)
- Upload traces and screenshots as artifacts on failure
- Fail the PR merge if any test fails

Alternative: run tests against `localhost` in CI by building and starting the Next.js server. Faster feedback but doesn't catch Vercel-specific deployment issues.

### 6.5 Pre-deploy smoke check
Add a minimal crawler check as a Vercel build-output check or a GitHub Action that runs against the preview URL before production promotion. Blocks deploy if any route 404s.

---

## Hard constraints

- **Do not** submit real payments during crowdfunding tests — Mollie test mode only
- **Do not** create production MailerLite subscribers — use test tags and test email domains (`@example.com` or a disposable domain)
- **Do not** test against production unless explicitly told to — default is local or preview
- **Do not** commit `.env` files with real API keys; use GitHub Secrets for CI
- **Do** keep the crawler script in `scripts/` separate from the permanent test suite in `tests/` — different purposes, different lifecycles
- **Do** respect `robots.txt` even on your own site (helps when testing against preview URLs that may block crawlers)

---

## Expected deliverables

After full execution of all phases:

1. `docs/LINK_CRAWL_REPORT.md` — snapshot of broken routes (one-time discovery artifact)
2. `docs/QA_AUDIT_REPORT.md` — full QA findings and fix plan
3. Fixes merged for every approved item in the plan
4. `playwright.config.ts` + `tests/e2e/*.spec.ts` — permanent test suite
5. `.github/workflows/e2e.yml` — CI integration
6. Updated `CLAUDE.md` with a new section documenting the testing approach and how to run tests locally (`npm run test:e2e`)
