# Performance Audit & Remediation — The Movement Club

> **Mode:** Audit-first. Do NOT modify any code until the audit report is written, reviewed, and explicitly approved.

## Context

The Movement Club website (Next.js 14+, Tailwind 4, Framer Motion, Sanity, Vercel) currently scores **72 on mobile Lighthouse** with the following critical issues identified:

- **LCP: 6.0s** (target: <2.5s) — render delay of 2,350ms on the "THE MOVEMENT CLUB" header text
- **Google Fonts leaking** from `fonts.gstatic.com` (377ms) — `next/font` self-hosting is not fully effective
- **Oversized images** — e.g. `750×563` served for `412×309` display (`sizes` attribute misconfigured)
- **Featurable reviews widget** adds ~243 KiB (13 KiB script + 230 KiB avatars) and ~1,500 DOM nodes with a 12,300px-wide slick-carousel track
- **Legacy JS polyfills** (~14 KiB) for features baseline in all 2026 browsers
- **Forced reflow** (42ms) in main chunk, likely Framer Motion geometry reads
- **1,832 DOM elements** — well above healthy threshold

Refer to `CLAUDE.md` for the full design system, brand principles (Equinox / Barry's / Aesop minimalism), and tech stack constraints.

---

## Phase 1 — Audit (read-only)

Work through every section below. Do not edit code. Collect raw data.

### 1.1 Image inventory

For every `<Image>` component and every `<img>` tag in the codebase:

1. Locate the component file and line number
2. Record the `src` (Sanity asset, local `/public`, external)
3. Record the current `sizes` attribute (or note if missing)
4. Record `fill` vs explicit `width`/`height`
5. Record `priority`, `loading`, `quality` values
6. Inspect the parent container's CSS to determine the **actual rendered dimensions** at three breakpoints:
   - Mobile: 412px viewport
   - Tablet: 768px viewport
   - Desktop: 1440px viewport
7. For Sanity images: note whether `urlFor()` is used and what transformations are applied

Output as a table in the report:

| File:Line | Purpose | Current `sizes` | Rendered (mobile/tablet/desktop) | Source dimensions | `priority`? | Issue |
|-----------|---------|----------------|----------------------------------|-------------------|------------|-------|

### 1.2 Font loading audit

1. Open `app/layout.tsx` (or `pages/_document.tsx` equivalent) and list every font imported
2. For each font import from `next/font/google`:
   - List `subsets`, `display`, `preload`, `weight`, `style`, `variable`
3. Search the **entire codebase** for any of these patterns that would cause a Google Fonts leak:
   - `fonts.googleapis.com`
   - `fonts.gstatic.com`
   - `@import url(` referencing Google
   - Manual `<link>` tags to font CDNs
   - Tailwind config `fontFamily` pointing to external URLs
4. Check `globals.css` and any Sanity-embedded styles for font imports
5. List all `<link rel="preconnect">` and `<link rel="preload">` tags currently in the document head
6. Check whether the LCP element's font is actually preloaded

### 1.3 Bundle & third-party audit

1. List every `<script>` tag and every dynamically loaded third-party script (Featurable, analytics, Sanity studio, etc.)
2. For each: note where it loads, whether it's deferred, whether it's lazy-loaded
3. Run `npm list framer-motion` and check which imports are used. Specifically search for:
   - `motion.*` imports (vs `m.*` with `LazyMotion`)
   - `useScroll`, `useInView`, `useTransform` usage in components that render above the fold
   - `layoutId`, `AnimatePresence` in the hero
4. Check `next.config.js` / `next.config.mjs` for:
   - `experimental.optimizePackageImports`
   - Image `remotePatterns` and `formats`
   - `compiler.removeConsole` in production
5. Check `package.json` for a `browserslist` field (or `.browserslistrc`)
6. Identify any barrel-file imports (`import { X, Y } from 'lucide-react'` etc.) that could bloat the bundle

### 1.4 DOM & component audit

1. Find the Featurable widget integration — note the component, how it's imported, whether it's server or client rendered
2. Locate any component with a slick-carousel, swiper, or similar heavy slider library
3. Check for components that render long lists without virtualization
4. Note any components that unconditionally render above-the-fold but are only visible after scroll/interaction (cookie banners, modals, drawers)

### 1.5 Critical rendering path

1. Identify the actual LCP element on mobile (inspect the HTML served, not just the Lighthouse guess)
2. Trace what blocks its render: fonts, CSS, JS, images
3. List every CSS file in the critical path with its size and load strategy
4. Check for render-blocking `<script>` tags without `async` or `defer`

---

## Phase 2 — Write the audit report

Create a file at `docs/PERFORMANCE_AUDIT_REPORT.md` (create the `docs/` folder if missing). Structure:

```md
# Performance Audit Report
Date: [ISO date]
Baseline Lighthouse (mobile): Performance 72 / LCP 6.0s / FCP 2.3s / TBT 60ms

## 1. Executive summary
[3-5 bullets: the most impactful findings]

## 2. Image issues
[Table from 1.1 + per-image recommendation. Include a "Recommended sizes attribute" column.]

## 3. Font issues
[List the Google Fonts leak(s) with exact file:line, plus preload/display/subset misconfigurations.]

## 4. Bundle & third-party issues
[Featurable, Framer Motion, polyfills, barrel imports — with estimated savings.]

## 5. DOM & rendering issues
[Non-virtualized lists, above-the-fold waste, forced reflow sources.]

## 6. Prioritized action plan
[Sorted by impact/effort. Each item has: problem, proposed fix, estimated LCP/bundle impact, design-system implications.]

## 7. Design-system alignment check
[For every proposed change: confirm it respects CLAUDE.md's brand principles. E.g. replacing Featurable with a custom reviews component must match the Equinox/Aesop aesthetic — list concrete design-token references (colors, typography, spacing) the replacement will use.]

## 8. Out-of-scope / needs decision
[Things Claude cannot decide alone: replacing Featurable entirely vs lazy-loading, changing image CDN strategy, adjusting brand fonts, etc.]
```

**Reporting rules:**

- Every finding must reference a concrete file path and line number
- Every recommendation must include an estimated impact (KiB saved, ms shaved, or "enables X")
- When recommending replacement of a third-party component, propose a concrete design-system-aligned alternative with reference to CLAUDE.md tokens
- Flag anything where you need user input before implementing

---

## Phase 3 — Await approval

After the report is written:

1. Summarize the top 5 findings in chat (plain prose, not a list)
2. Ask the user which sections of the action plan to implement and in what order
3. Do NOT start implementation until explicit go-ahead

---

## Phase 4 — Implementation (only after approval)

When implementing approved changes:

### For images
- Every `<Image>` must have a `sizes` attribute that reflects its **actual** layout at each breakpoint
- Use `fill` only when the parent has defined dimensions; otherwise prefer explicit `width`/`height`
- Hero/LCP images get `priority` + explicit preload if from external CDN
- Sanity images: use `urlFor().width(X).height(Y).auto('format').quality(80)` with widths that match the `sizes` breakpoints
- Below-the-fold images: `loading="lazy"` (default for non-priority)
- Never serve 2x the rendered pixel count (account for DPR max of 2)

### For fonts
- All fonts self-hosted via `next/font` with `display: 'swap'`
- Remove every external Google Fonts reference, including in Tailwind config and CSS
- Explicitly `preload: true` on fonts used above the fold (default, but confirm)
- Limit `weight` array to values actually used — each weight is a separate file
- Use `variable` pattern with Tailwind's `fontFamily` config (`font-serif`, `font-sans`)
- Remove `preconnect` to `fonts.gstatic.com` once self-hosting is confirmed clean
- Add explicit `<link rel="preload">` for the LCP-critical font file if `next/font` doesn't preload it automatically

### For the design system
- Every replacement component must use the tokens defined in CLAUDE.md (colors, typography scale, spacing)
- No new third-party UI libraries without explicit approval
- Match the existing component patterns (file structure, prop conventions, motion patterns)
- For motion: prefer `LazyMotion` with `domAnimation` + `m.*` components over full `motion.*`

### Verification after each change
- Run `npm run build` and confirm no errors
- Check the relevant Lighthouse metric moved in the right direction (user will run Lighthouse)
- Confirm visual regression: the component still matches the design intent

---

## Hard constraints

- **Do not** introduce new dependencies without asking
- **Do not** touch the crowdfunding module (separate spec, excluded from CLAUDE.md)
- **Do not** change brand fonts, colors, or typography scale
- **Do not** remove analytics events or modify the event taxonomy
- **Do not** change copy (Dutch for client-facing, untouched)
- **Do** ask before replacing any third-party integration with a custom build
