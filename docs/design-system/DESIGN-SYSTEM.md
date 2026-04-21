# The Movement Club — Design System

> Boutique training studio in Loosdrecht. Not a gym — a private club for people
> serious about their bodies. The visual language is dark, quiet, grown-up.

This design system is the single source of truth for The Movement Club's
visual identity, copy voice, and UI components. It is opinionated on purpose:
every decision leans toward restraint, craft, and a low-lit, cinematic feel.

---

## Brand in one paragraph

The Movement Club feels like a members' club, not a gym. Think the lobby of a
well-run boutique hotel, the lighting in an Aesop store, the quiet confidence
of Equinox, the warmth of Heimat LA. It is small, personal, and has a point of
view. Strength, mobility, patterns that last a lifetime — coached in small
groups, not sold at scale.

The anti-references matter just as much: **not** Basic-Fit, **not** Anytime
Fitness, **not** Planet Fitness. Never neon, never shouty, never "smash your
PRs" energy.

## Sources given

- **Company brief** (pasted in chat, April 2026) — describes voice, palette,
  typography direction, layout intent, imagery, and motion references.
- **No codebase, Figma, or existing deliverables were provided.** All visual
  decisions in this system are a first-pass interpretation of that brief and
  should be validated against any in-market assets (website, studio signage,
  Instagram) the user has.

## Quick index

| File / folder | What it is |
| --- | --- |
| `README.md` | This document — brand overview, content & visual foundations, iconography. |
| `SKILL.md` | Agent-skill entry point for Claude Code / Claude.ai skills. |
| `colors_and_type.css` | Design tokens (CSS variables) for color, type, spacing, radius, shadow. |
| `fonts/` | Webfont files (see substitutions note below). |
| `assets/` | Logos (full, mark, wordmark), imagery placeholders, textures. |
| `preview/` | Small HTML cards that populate the Design System tab. |
| `ui_kits/website/` | Marketing site UI kit (React/JSX components + click-thru `index.html`). |
| `ui_kits/member/` | Member portal UI kit (schedule, bookings, profile). |

---

## ⚠ Substitutions & open questions

The brief names font candidates but ships no files. I've picked the closest
Google Fonts matches so everything renders cleanly today:

- **Display serif:** brief suggests *Canela / Fraunces / a modern Didone*. I'm
  using **Fraunces** (Google Fonts, SIL OFL) at optical size 144, weight 300,
  with a slight tightening. If the studio owns a Canela licence, drop the
  `.woff2` into `fonts/` and swap the `@font-face src` — the CSS variable
  (`--font-serif-display`) already points at a generic stack.
- **Body sans:** brief suggests *Inter / Söhne / similar*. I'm using **Inter**
  (Google Fonts). Söhne is licensed and can't be auto-substituted; same swap
  pattern applies if you own it.

Other gaps to flag:
- No real photography yet — image slots use dark matte placeholders with a
  short label. Replace with moody, low-light, grain-forward photography (see
  "Imagery" in VISUAL FOUNDATIONS).
- No real logo file was supplied — I've created a wordmark-plus-mark set in
  `assets/` as a working stand-in. Swap when a final logo lands.
- Dutch vs English copy: the brief is Dutch; I've kept UI copy bilingual-
  ready but leaned Dutch-primary. Confirm primary language and whether EN is
  a first-class variant.

---

# CONTENT FUNDAMENTALS

How The Movement Club writes.

## Voice

- **Minimal but warm.** Like a coach who knows you — not clinical, not
  cheerleader-y. There is a human behind every line.
- **Point of view.** Short declarative sentences. It is okay to be certain.
  "We train three things: strength, mobility, movement." Not: "Our programs
  may help you explore multiple fitness dimensions."
- **Grown-up.** No hype words. No "crush," "smash," "unlock," "game-changer."
  No exclamation marks. No emoji. No all-caps shouting except in eyebrow /
  label type where letterspacing carries the tone.
- **Understated confidence.** The brand doesn't oversell. Implication does
  more work than claim. "Kleine groepen." is a sentence.

## Person and tone

- **Je / jou** (Dutch informal second person) — never *u*. The club is
  personal, not formal-corporate.
- **Wij / we** for the studio when it matters. Often the studio is invisible
  and the copy just speaks to the member.
- English copy mirrors this: **you**, not "users"; **we** only when necessary.

## Casing & punctuation

- **Sentence case** for headlines, nav, buttons. **Never Title Case.**
- **All-caps, letterspaced** (tracking ≈ 0.14em–0.18em) for small eyebrow
  labels, section kickers, and tags. E.g. `SINDS 2021`, `KRACHT · MOBILITEIT`.
- **Periods are allowed at the end of short headlines** when it adds weight.
  "Train serieus. Rustig." reads better than "Train serieus, rustig".
- **Middot (·)** for inline separators, not pipes or bullets. `LOOSDRECHT · NL`.
- **No em-dashes.** Ever. Use a period, a comma, or a new sentence. Parentheses are fine for a quiet aside.
- **Numbers:** figures, not words, from 1. "3 coaches", "45 minuten".
- **Time:** 24-hour. `06:30`, not `6:30 AM`.

## Vocabulary — words we use

> *sessie, coach, leden, lidmaatschap, programma, intake, beweging, kracht,
> mobiliteit, ritme, rust, basis, patroon, werk, serieus, bewust*

## Vocabulary — words we avoid

> *workout* (say sessie), *fitness* (say training), *fit worden*, *afvallen*
> (we don't lead with weight loss), *boot camp*, *community* (say leden or
> club), *journey*, *PR / personal record* (as hype), *shredded*, *gains*,
> *killer*, *insane*, *crushing it*, *#*hashtags.

## Copy examples

Hero, website:

> **Kracht. Mobiliteit. Een lichaam dat meegaat.**
> Een boutique studio in Loosdrecht. Kleine groepen, echte coaching.
> Patronen die blijven.

Membership block:

> **Lidmaatschap**
> Twee sessies per week. Intake met een coach. Toegang tot open hours.
> Geen opzegtermijn van een jaar.

Nudge / empty state in the app:

> Nog geen sessie geboekt deze week. De agenda staat open.

Error, soft tone:

> Dat werkte niet. Probeer het zo nog eens.

What we'd never write:

> ~~Ready to unlock your strongest self? Join the TMC family and let's crush
> it together! 💪🔥~~

---

# VISUAL FOUNDATIONS

How The Movement Club looks and moves.

## Color

Deep warm blacks, not pure black. A single restrained accent in brushed
champagne gold. Everything else is off-white and warm neutrals.

- **Ink 900 `#0E0C0B`** — primary background. Near-black, warm-biased. Never
  use `#000` — it reads harsh and digital.
- **Ink 800 `#17140F`** — surface for stacked cards on ink background.
- **Ink 700 `#1F1A14`** — elevated surface (modals, hovered rows).
- **Ink 500 `#3A342B`** — hairline borders on dark, low-contrast dividers.
- **Stone 100 `#F4EFE6`** — primary off-white. Body text on dark, background
  on light surfaces.
- **Stone 300 `#D8D0C1`** — muted warm neutral. Secondary text on light.
- **Stone 500 `#8B8478`** — tertiary / meta text on light; secondary on dark.
- **Champagne `#B9986A`** — the one accent. Brushed gold, never glossy. Used
  for: a single underline on hover, a dot before a kicker, a thin rule under
  a featured number. Max one champagne element per viewport-height.
- **Champagne deep `#8A6E47`** — pressed / focused champagne state.

**Semantic use:**
- Errors: `#C47A6E` (dusty terracotta — not red).
- Success: `#8A9577` (sage — not green).
- Info: a slightly warmer Stone 300. We avoid blue entirely.

**Vibe rule:** if a comp has more than one champagne element visible, remove
one. Scarcity is the point.

## Typography

Strong editorial contrast: a serif that has something to say, paired with a
quiet, almost-invisible sans for everything operational.

- **Display serif — Fraunces (sub for Canela/Didone).** Optical size 144,
  weight 300, tracking -0.02em. Used for hero, section titles, pull quotes.
  Sizes run *big* — 96–160px on desktop is normal.
- **Body sans — Inter (sub for Söhne).** Weights 400 and 500. Body sizes
  16–18px. Line height generous: 1.55–1.7.
- **Eyebrow / kicker** — Inter, 500, 12px, uppercase, tracking 0.16em. This
  carries as much brand weight as the serif.

Scale is binary on purpose: **very large** headlines next to **small, quiet**
body copy. No middle sizes. If something feels like a subhead, it's probably
an eyebrow label instead.

## Layout & rhythm

- **One idea per viewport.** The hero has one sentence. A section has one
  claim. Scroll is a pacing device.
- **Generous padding.** Desktop section padding ≥ 160px top/bottom. Mobile
  ≥ 96px. Never ≤ 64.
- **Asymmetric 12-col grid.** Content rarely spans all 12; typical pairs are
  5+6, 4+7, 3+8. Leave columns empty on purpose.
- **Max content measure:** ~58ch for body prose. Serif headlines can go
  wider (75ch+) because they read slower.

## Backgrounds

- **Dominantly flat Ink 900.** Most pages have one background, start to
  finish.
- **Full-bleed imagery** for hero and section transitions. Always darkened
  with an Ink 900 overlay at 40–60%.
- **No gradients as decoration.** One exception: protection gradients under
  text on imagery (linear, top to bottom, Ink 900 0 → 70%).
- **No textures or patterns.** No noise, no dot grids, no hand illustrations.

## Imagery

- **Moody, cinematic, low-lit.** Physical details over people-in-outfits: a
  hand on a barbell, chalk on wood, a strap, breath, a shoulder in half-light.
- **Black & white or deeply desaturated** — saturation ≤ 25%.
- **Grain is welcome.** Subtle film grain layer at ~5–8% opacity. Never a
  loud overlay.
- **Motion > stills** where possible. A 6–10s looped video in hero,
  `prefers-reduced-motion` fallback to a single still.
- **Never stock-fitness.** No smiling, no matching outfits, no bright gym
  floors.

## Motion

- **Slow and sure.** Easing curves are long. Standard duration 500–800ms.
- **`cubic-bezier(0.2, 0.7, 0.1, 1)`** as the house curve. No bounces, no
  spring overshoots.
- **Fades + tiny translate-up (8–12px)** for content entry. No slide-in from
  the side, no scale-from-zero.
- **Video in hero is slow-motion-feeling.** If it feels energetic it's wrong.
- **Reduced motion:** honour it. Swap to opacity-only transitions.

## Hover / press states

- **Links:** a thin 1px champagne underline appears under the word, 300ms
  fade. Never color change.
- **Buttons (primary, Stone on Ink):** background goes from Stone 100 to
  Stone 300 on hover (300ms). Pressed: scale 0.99 + Stone 500 background.
- **Buttons (ghost):** border Ink 500 → Stone 500 on hover. Label stays.
- **Cards:** on hover, a 1px champagne border appears (from transparent).
  No lift, no shadow bloom, no background change.
- **Images:** on hover, zoom 1.02 over 700ms with `ease-out`. Nothing faster.

## Borders & dividers

- **1px, Ink 500 on dark / Stone 300 on light.** Always 1px. 2px is loud.
- **Hairline rules between sections** — full-bleed, Ink 500 at 60% alpha.
- **No dashed or dotted borders anywhere.**

## Shadows & elevation

- **Sparing.** Dark-on-dark surfaces mostly use a lighter fill (Ink 800 on
  Ink 900) for elevation, not shadow.
- **Elevation 1 (light bg):** `0 1px 0 rgba(14,12,11,0.04), 0 8px 24px rgba(14,12,11,0.06)`.
- **Elevation 2 (modal, light bg):** `0 24px 64px rgba(14,12,11,0.12)`.
- **On dark, no drop shadows at all.**

## Corner radii

- **`--radius-xs: 2px`** — badges, tag pills.
- **`--radius-sm: 4px`** — inputs, small buttons.
- **`--radius-md: 8px`** — cards, media tiles.
- **`--radius-lg: 16px`** — feature blocks, modals.
- **No fully-rounded pills** except for small tag chips. Round buttons read
  consumer / retail, not club.

## Cards

- **Ink 800 fill** on dark background, **no border by default**, **no
  shadow**, `--radius-md`. Padding 24–32px.
- On hover: a 1px champagne border fades in. That's the entire affordance.
- Featured cards may carry a thin top rule in champagne (1px, 40% width).

## Transparency & blur

- **Backdrop-blur used only in two places:** the sticky top nav when
  scrolled, and the video-hero caption bar. Both at `blur(16px)` with
  `background: rgba(14,12,11,0.55)`.
- Never frosted-glass cards. Never translucent buttons.

## Spacing scale

A 4-based scale. Use these and only these:
`4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 224`.

## Grid

12 columns, 24px gutters desktop, 16px gutters mobile. Max container
1440px; reading measure much narrower.

---

# ICONOGRAPHY

The Movement Club uses **very few icons**, by design. Most UI affordances
are communicated through type, space, and a single champagne accent. When
an icon *is* needed, it is quiet.

## Rules

- **No emoji. Anywhere.** Not in marketing, not in the app, not in
  notifications.
- **No unicode symbols as decoration** (no ✓, ★, →‑alone). The sole exception
  is **` · `** (middot) used as a typographic separator in labels.
- **Outline icons, 1.5px stroke, round caps.** No filled glyphs, no duo-tone.
- **Monochrome** — currentColor, inherits from text. Icons are never gold
  unless they are the single champagne accent on the screen.
- **16px and 20px only** in product UI. Larger sizes only in editorial hero
  treatments.

## Icon source

We use **Lucide** (`lucide.dev`, ISC licence) via CDN. It matches our
stroke weight and rounded-cap style exactly. The specific icons we pull and
approve:

> `menu`, `x`, `arrow-right`, `arrow-up-right`, `calendar`, `clock`,
> `map-pin`, `user`, `users`, `check`, `plus`, `minus`, `chevron-down`,
> `chevron-right`, `play`, `pause`.

Anything outside that list needs design review — we'd rather add text than a
new icon.

**Substitution note:** Lucide is a stand-in for whatever the studio's real
icon set is (if any exists in production). Same stroke weight and feel, so
the swap is cheap later.

## Logo & marks

- **Wordmark** (`assets/logo-wordmark.svg`) — the default lockup. Use on all
  first impressions.
- **Monogram** (`assets/logo-mark.svg`) — "tmc" monogram for app icons,
  favicons, avatars, tight corners.
- **Clear space:** minimum half-x-height of the wordmark on every side.
- **Minimum size:** wordmark 120px wide on screen; monogram 24px.
- **Colour:** Stone 100 on Ink, Ink 900 on Stone. Champagne version exists
  for stationery only — never on screen.
