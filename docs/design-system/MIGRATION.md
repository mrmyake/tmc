# Migratie: themovementclub.nl → nieuwe design system

Concrete, PR-voor-PR werkbeschrijving om de huidige site (Next 15 + Tailwind 4 + Sanity + Supabase) om te zetten naar het nieuwe design system. Geen rewrite — alleen tokens, type, chrome en copy.

> **Werkwijze:** open dit document in Claude Code samen met de `the-movement-club-design` skill (in `.claude/skills/` of `~/.claude/skills/`). Werk fase voor fase. Commit na elke fase zodat je visueel kan toetsen.

---

## Fase 0 — Skill installeren (eenmalig, 5 min)

1. Download dit design-system project (Download-menu → hele project → zip).
2. Unzip naar **één** van:
   - `~/.claude/skills/the-movement-club-design/` (persoonlijk, alle projecten)
   - `.claude/skills/the-movement-club-design/` in `~/projects/tmc` (team-breed, in git)
3. Controleer dat `SKILL.md` en `README.md` in die map staan.
4. In Claude Code: `/skills` moet de skill nu tonen.

---

## Fase 1 — Tokens swappen (1 PR, ~30 min)

**Doel:** site staat live in het nieuwe kleur- en typpalet zonder dat één component herschreven is. Laagrisico: puur CSS variables + Tailwind theme.

### 1.1 Kopieer het token-bestand

Kopieer `colors_and_type.css` uit de skill naar:

```
src/app/tokens.css
```

### 1.2 Importeer in globals.css

Vervang de **hele inhoud** van `src/app/globals.css` door:

```css
@import "tailwindcss";
@import "./tokens.css";

/* ---- Tailwind 4 theme bindings (map nieuwe tokens naar oude namen) ---- */
@theme inline {
  /* Surfaces */
  --color-bg:            var(--ink-900);
  --color-bg-elevated:   var(--ink-800);
  --color-bg-subtle:     var(--ink-700);

  /* Text */
  --color-text:          var(--stone-100);
  --color-text-muted:    var(--stone-400);

  /* Accent */
  --color-accent:         var(--champagne);
  --color-accent-hover:   var(--champagne-deep);

  --color-white: #FFFFFF;

  /* Fonts — we map de oude CSS-vars (playfair/dm-sans) in stap 1.3 */
  --font-display: var(--font-serif-display);
  --font-body:    var(--font-sans);
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-feature-settings: "ss01", "cv11";
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html { scroll-behavior: smooth; }

::selection {
  background-color: var(--accent);
  color: var(--ink-900);
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 1.3 Fonts swappen

In `src/app/layout.tsx` vervang:

```ts
import { Playfair_Display, DM_Sans } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
```

door:

```ts
import { Fraunces, Inter } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-playfair",     // ← naam BEHOUDEN → geen component edits nodig
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-dm-sans",       // ← naam BEHOUDEN
  display: "swap",
});
```

En update de `<html className=…>`:

```tsx
<html lang="nl" className={`${fraunces.variable} ${inter.variable} antialiased`}>
```

> **Trick:** door de CSS-var namen `--font-playfair` en `--font-dm-sans` te hergebruiken, blijft alle bestaande `font-[family-name:var(--font-playfair)]` code werken. Nul component-edits.

> **Als je later echte Canela/Söhne licenseert:** zet de `.woff2` files in `public/fonts/`, voeg een `@font-face` toe bovenin `tokens.css`, en skip de `next/font/google`-imports.

### 1.4 Verwijder de oude `:root` block

De oude hex-codes in `globals.css` (`#0C0C0C`, `#C9A96E`, etc.) staan in stap 1.2 al vervangen. Niets meer te doen in `:root`.

### 1.5 Check + deploy

```bash
npm run build
npm run dev
# visueel controleren: homepage, /over, /aanbod, /mobility-check
```

Je ziet meteen: warmere zwart, zachtere champagne, nieuwe serif. Componenten zien er structureel nog hetzelfde uit — dat is het doel van deze fase.

**Commit:** `chore(design): swap color + font tokens to new system`

---

## Fase 2 — Chrome rebrand (1 PR, ~1 uur)

Vier bestanden. Hoge impact (zit op élke pagina), laag risico.

### 2.1 `src/components/ui/Button.tsx`

Vervang de variants door:

```tsx
const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-bg hover:bg-accent-hover border border-accent",
  secondary:
    "border border-stone-400/30 text-text hover:border-accent hover:text-accent",
  ghost:
    "text-text-muted hover:text-accent",
};
```

En de base class:

```tsx
const base =
  "inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] transition-all duration-500 cursor-pointer";
```

Verschil: iets langere tracking, zachtere duration, subtiele border op primary (geeft premium-hint), secondary is nu neutraal met accent-hover ipv gold-on-gold.

### 2.2 `src/components/layout/Navbar.tsx`

Vervang de logo-Link door een monogram + wordmark combinatie:

```tsx
<Link href="/" className="flex items-center gap-3 text-text">
  <span
    aria-hidden
    className="font-[family-name:var(--font-playfair)] text-xs tracking-[0.12em] border border-accent/40 text-accent px-2 py-0.5"
  >
    TMC
  </span>
  <span className="font-medium text-[13px] uppercase tracking-[0.22em] hidden sm:inline">
    The Movement Club
  </span>
</Link>
```

Waarom: een nav-regel is 20px hoog. Serif-wordmarks worden daar fuzzy. Monogram-badge + sans wordmark blijft crisp; serif bewaar je voor display-headings.

### 2.3 `src/components/layout/Footer.tsx`

Brand-block aanpassen naar serif-wordmark (hier mág het, groot genoeg):

```tsx
<Link
  href="/"
  className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none tracking-[-0.01em]"
>
  The Movement <em className="not-italic text-accent">Club</em>
</Link>
```

En vervang de bovenste footer-border door een volle-breedte accent-hairline:

```tsx
<footer className="bg-bg-elevated">
  <div className="h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
  <Container className="py-20"> {/* was py-16 */}
```

### 2.4 `src/components/ui/Card.tsx`

(Niet gelezen, pas aan op basis van deze regel.) Cards moeten:

```
background: var(--ink-800);
border: 1px solid var(--ink-600);
padding: 32px  (space-6);
```

Geen `rounded-xl` — het systeem is scherp. Max `rounded-sm` (2-4px) of helemaal geen radius op cards. Check `Card.tsx` en verwijder grote border-radii.

**Commit:** `refactor(chrome): rebrand navbar, footer, button, card`

---

## Fase 3 — Homepage blokken (1 PR per blok, ~15 min elk)

Volgorde op impact. Elk blok is bewust klein.

### 3.1 `Hero.tsx`

- **Eyebrow:** voeg een champagne hairline toe vóór en na:
  ```tsx
  <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
    <span className="w-12 h-px bg-accent" />
    Boutique Training Studio · {settings.address.city}
    <span className="w-12 h-px bg-accent" />
  </span>
  ```
- **H1:** wrap één woord in een `<em>` (niet italic, alleen accent color):
  ```tsx
  <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl lg:text-8xl xl:text-[9rem] text-text mb-8 leading-[1.02] tracking-[-0.02em]">
    {settings.tagline}
  </h1>
  ```
  Vraag aan Marlon: welke één of twee woorden mogen champagne worden? (bv. *"Beweeg met intentie"* → *"intentie"*)
- **Overlay:** vervang `bg-bg/60` door een subtielere vignet:
  ```tsx
  <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/50 to-bg" />
  ```
- **CTAs:** behoud, maar wissel `Of download onze gratis guide` naar sentence case: `Download de guide`.
- **Grain overlay:** voeg `tmc-grain` toe aan de outer `<section>` voor subtiele texture (komt uit `tokens.css`).

### 3.2 `PhilosophyGrid.tsx`

- Icon-container: vervang `border border-accent/30` door een vierkante rand met hairline-top:
  ```tsx
  <div className="inline-flex items-center justify-center w-14 h-14 mb-8 text-accent border-t border-accent">
    <Icon size={22} strokeWidth={1.25} />
  </div>
  ```
  (`strokeWidth={1.25}` — Lucide default 2 is te zwaar voor dit systeem.)
- H3 niet serif maken — op deze grootte (24px) gaat Fraunces fuzzy. Keep sans.

### 3.3 `StudioSection.tsx`

- Zet image in een split waarbij de foto **uit de grid breekt**:
  ```tsx
  <div className="relative -mx-6 lg:mx-0 lg:ml-[-8vw]">
    <img … />
  </div>
  ```
- Nummer erbij (editorial touch):
  ```tsx
  <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">01 · De studio</span>
  ```

### 3.4 `TrainerSpotlight.tsx`

- Serif-quote mag blijven, maar vervang `border-l-2 border-accent` door een hangende champagne-hoek:
  ```tsx
  <blockquote className="mt-10 relative pl-8">
    <span aria-hidden className="absolute left-0 top-0 font-[family-name:var(--font-playfair)] text-5xl text-accent leading-none">"</span>
    <p className="font-[family-name:var(--font-playfair)] text-2xl text-text leading-snug">
      {trainer.quote}
    </p>
    <cite className="block mt-4 text-xs text-text-muted not-italic uppercase tracking-[0.2em]">
      — {trainer.name}
    </cite>
  </blockquote>
  ```

### 3.5 `OfferingCards.tsx`

- Card H3: blijf sans, maar geef elke card een subtle eyebrow met nummer:
  ```tsx
  <span className="tmc-eyebrow mb-3 block">0{i+1} — Aanbod</span>
  <h3 className="text-xl md:text-2xl text-text mb-3 font-medium tracking-[-0.01em]">
    {offering.title}
  </h3>
  ```
- Hover: laat de card-border van `border-bg-subtle` naar `border-accent/40` gaan.

### 3.6 `PricingTable.tsx`

- "Populair" badge: vervang gold-filled pill door champagne tekst op ink met hairlines:
  ```tsx
  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-bg text-accent text-[10px] font-medium uppercase tracking-[0.3em] px-4 py-1.5 border border-accent/40">
    Meest gekozen
  </span>
  ```
  (Tekst-wijziging: "Populair" → "Meest gekozen" voelt minder marketing-y.)
- Price: zet in serif voor editorial gewicht:
  ```tsx
  <p className="font-[family-name:var(--font-playfair)] text-accent text-4xl mt-3 tracking-[-0.02em]">
    {tier.price}
  </p>
  ```

### 3.7 `TestimonialCarousel.tsx`

- Featurable widget theme staat op `"dark"` — prima. Wrap in een surface:
  ```tsx
  <div className="bg-bg-elevated border-y border-bg-subtle py-12 px-4">
    <ReactGoogleReviews … />
  </div>
  ```

### 3.8 `ContactSection.tsx`

- Iframe: vervang `grayscale opacity-80` door `saturate-0 brightness-75` voor warmere de-sat.
- WhatsApp button: gebruik secondary variant (champagne is te agressief voor een tweede CTA).

**Commits per blok:** `refactor(home/hero): apply new design system`, etc.

---

## Fase 4 — Overige pagina's

Per pagina 15-30 min. Zelfde logica als Fase 3.

### Checklist per pagina

- [ ] `/over` — `OverContent.tsx` — check trainer-spotlight hergebruikt Fase 3.4
- [ ] `/aanbod` — `AanbodContent.tsx` — FAQ gets same editorial treatment (numbered, hairline dividers)
- [ ] `/contact` — `ContactContent.tsx` — form styling (zie Fase 5)
- [ ] `/proefles` — `ProeflesContent.tsx` — idem form
- [ ] `/mobility-check` — hoogste conversie-pagina; extra aandacht voor hero + form
- [ ] `/beweeg-beter` — landing page voor ads, focus op PDF-CTA
- [ ] `/mobility-reset` — 7-dagen opt-in
- [ ] `/crowdfunding` — separaat in Fase 6

---

## Fase 5 — Forms (1 PR, ~30 min)

Alle forms via één stijl-pass. Maak een `src/components/ui/Field.tsx` wrapper:

```tsx
export function Field({ label, children, error }: FieldProps) {
  return (
    <label className="block">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">{label}</span>
      {children}
      {error && <span className="text-[color:var(--danger)] text-xs mt-1 block">{error}</span>}
    </label>
  );
}
```

Inputs:

```tsx
className="w-full bg-transparent border-b border-stone-400/30 focus:border-accent px-0 py-3 text-text text-base placeholder:text-text-muted transition-colors outline-none"
```

Geen boxes; hairlines only. Past bij de editorial look.

---

## Fase 6 — Crowdfunding (1 PR)

Heeft eigen visuele taal nodig (urgency, progress, tiers). Aparte sessie — kijk eerst naar `src/components/blocks/crowdfunding/*` en mail mij de huidige screenshots als je wil dat ik een crowdfunding-specifieke preview maak.

---

## Fase 7 — Copy pass (niet technisch, wel essentieel)

Het nieuwe systeem is **informeler en rustiger**. Loop deze pagina's door met de voice-guide uit `README.md → CONTENT FUNDAMENTALS`:

- Homepage tagline
- `settings.tagline` in Sanity (studio) — hier zit het hero-H1!
- `/over` intro
- CTA-teksten: "Boek je proefles" → "Plan je proefles" ; "Aanmelden" → "Kom langs"
- E-mail sequences in MailerLite (Mobility Reset 7 mails)

Native-speaker pass aanbevolen, juist op Dutch informeel.

---

## Find-and-replace cheat sheet

Alleen nodig als iets NIET via tokens gaat. 95% van de site wordt via Fase 1 al geswapt — onderstaande is voor resterende hard-coded waarden.

| Oude waarde | Nieuwe waarde | Waar |
|---|---|---|
| `#0C0C0C`, `#0B0B0B` | `var(--ink-900)` | hard-coded in edge-cases |
| `#161616` | `var(--ink-800)` | surfaces |
| `#1E1E1E` | `var(--ink-700)` | subtle surfaces |
| `#F5F0EB`, `#F5F2EC` | `var(--stone-100)` | text on dark |
| `#8A8578` | `var(--stone-400)` | muted text |
| `#C9A96E`, `#C9A86B` | `var(--champagne)` | accent |
| `#B8944F` | `var(--champagne-deep)` | accent hover |
| `Playfair Display` | `Fraunces` | font-family strings |
| `DM Sans` | `Inter` | font-family strings |
| `rounded-xl`, `rounded-2xl` op cards | verwijderen of `rounded-sm` | hele codebase |
| `u` (u/uw formeel) | `je/jou` | copy-pass |

**Regex search (VS Code / Claude Code):**
```
(#0C0C0C|#0B0B0B|#161616|#1E1E1E|#F5F0EB|#F5F2EC|#8A8578|#C9A96E|#C9A86B|#B8944F)
```

---

## Sanity content TODO

Een paar dingen zijn content, niet code. In `/studio`:

- [ ] `siteSettings.tagline` — herschrijf tagline voor de nieuwe toon
- [ ] `trainer.bio` — check of de bio de nieuwe voice volgt
- [ ] `trainer.quote` — één scherpe zin, geen alinea
- [ ] `offering.subtitle` — elke offering 1 zin, geen corporate-speak
- [ ] `pricingTier.name` — "Populair" badge-tekst naar "Meest gekozen"
- [ ] Vervang placeholder-foto's door echte cinematic studio-shots (moody, low-light, desaturated)

---

## Klaar-criteria per fase

| Fase | Klaar als… |
|---|---|
| 1 | `npm run build` slaagt, homepage laadt met nieuwe kleuren + fonts |
| 2 | Navbar, footer, buttons voelen "editorial" in plaats van "gym" |
| 3 | Homepage scrollt end-to-end zonder ruwe kantjes |
| 4 | Elke sub-pagina door dezelfde lens |
| 5 | Forms voelen rustig, hairlines-only |
| 6 | Crowdfunding-pagina toont progress + tiers in nieuwe stijl |
| 7 | Native-NL-spreker bevestigt: "Dit klinkt als een club, niet als een sportschool" |

---

## Prompts om aan Claude Code te geven

**Start van Fase 1:**
> Gebruik de skill `the-movement-club-design`. Voer Fase 1 uit uit `MIGRATION.md` — stap 1.1 tot 1.5. Commit na elke stap.

**Start van Fase 3:**
> Voer Fase 3 uit uit `MIGRATION.md`, blok voor blok. Na elk blok: `npm run build` + git commit. Stop na `Hero.tsx` en vraag om review vóór je verder gaat.

**Copy-pass in Sanity:**
> Lees `MIGRATION.md` Fase 7 en `README.md` sectie CONTENT FUNDAMENTALS uit de skill. Maak een lijst met alle copy-edits die nodig zijn, per Sanity-document en veld. Implementeer niets — lever alleen de lijst.
