# Fase 1 — Vrij Trainen loskoppelen van `/app/rooster`

**Status:** ready for implementation
**Scope:** visueel en navigatief uit elkaar trekken. Géén datamodel-migratie.
**Out of scope:** check-in flow, frequency cap via attendance. Zie fase 2.

---

## Waarom

`/app/rooster` toont nu twee kalenders onder elkaar: een bovenste weekstrip als dagfilter voor groepslessen, en een onderste weekstrip om per dag Vrij Trainen te boeken. Dat zijn conceptueel twee verschillende interacties (sessie kiezen vs. dag claimen), maar visueel lijken ze op elkaar. Leden moeten twee keer klikken om te begrijpen wat waar hoort.

Oplossing: Vrij Trainen krijgt een eigen pagina en eigen nav-entry. `/app/rooster` wordt puur voor sessies met tijdslots.

---

## Universele regels

- **Server components default**, client components alleen voor interactiviteit.
- **Auth** via bestaande middleware + `(app)` route group. Niet zelf auth-checks toevoegen als de middleware het dekt.
- **RLS** moet alle queries dekken. Geen service-role in de client. Server actions voor mutations.
- **Geen hardcoded hex, spacing of font-stacks.** Alles via skill tokens / Tailwind config.
- **Bestaande componenten hergebruiken.** Eerst `components/` en `ui_kits/member/` checken voor je iets nieuws maakt.
- **Copy:** NL user-facing, geen em-dashes, geen emoji's. Copy uit Stitch is conceptueel, niet finaal — markeer twijfelgevallen met `// COPY: confirm with Marlon`.
- **A11y:** keyboard nav, focus rings (skill tokens), aria-labels op icon-buttons, semantic HTML.
- **Loading + error + empty states** altijd expliciet. Skill heeft hiervoor tokens.
- **Motion:** skill standaard (500-800ms, `cubic-bezier(0.2, 0.7, 0.1, 1)`). Niet versnellen "voor snelheid".
- **TypeScript strict**, props interfaces geëxporteerd.

## Werkvolgorde per scherm

1. Lees skill, lees relevante sectie uit `tmc-member-system.md`, haal Stitch-scherm op via MCP.
2. Rapporteer reconciliatie-tabel (Stitch-element → skill-component → Supabase-data). Wacht op go.
3. Implementeer. Alle bestanden in één PR.
4. `npm run typecheck` + `npm run lint` + `npm run build` moeten groen.

---

## Huidige situatie (uit grep + context)

**Data:**
- `vrij_trainen` is een **pillar** in `class_sessions` met day-level sessies (1 per dag, geen tijdslot).
- Admin stats filteren al correct met `.neq("pillar", "vrij_trainen")` — geen wijziging nodig.
- Setting `vrij_trainen_cancel_window_minutes` (default 5) blijft waar hij is.

**Eligibility (uit `tmc-member-system.md`):**

Plans die Vrij Trainen dekken:
- `vrij_trainen_2x` / `3x` / `unlimited` (eigen abbo)
- `all_inclusive_3x` / `all_access_unlimited` (covered_pillars omvat vrij_trainen)

Plans die het **niet** dekken:
- `yoga_mobility_*`, `kettlebell_*`, `kids_*`, `senior_*`, `ten_ride_card`

Check is per-pillar in de bestaande eligibility-logica. Hergebruik de helper.

**Nav-structuur (post-refactor):**
- Default landing: `/app/rooster`
- Member nav: 4 items (Rooster, Mijn lessen, Lidmaatschap, Profiel) in `src/components/nav/MemberNav.tsx`
- Top nav desktop, bottom tab bar mobiel (breakpoint `md`)
- Admin + Trainer hebben eigen layouts (irrelevant voor deze PR)

**Rooster-pagina code:**
- `src/app/(app)/app/rooster/page.tsx` regels 281-298: splits vrij-trainen van reguliere sessies.
- Regel 287-288: pillar-check `s.pillar === "vrij_trainen"`.
- Regel 426: `pillars={PILLARS.filter((p) => p !== "vrij_trainen")}` — filter van discipline-chips.
- Onderste JSX-sectie "Open studio · kom wanneer je wil." — deze verhuist.

---

## Doelarchitectuur

### Nieuwe route
```
src/app/(app)/app/vrij-trainen/page.tsx   → nieuwe pagina, dagselector + boek/cancel
```

### Gewijzigde route
```
src/app/(app)/app/rooster/page.tsx        → alleen sessies met tijdslot
```

### Nav-entry (5e item, conditional visible)
```
src/components/nav/MemberNav.tsx          → voeg "Vrij Trainen" toe
```

Visible alleen als user een active/paused membership heeft waarvan `covered_pillars` `'vrij_trainen'` bevat. Gebruik bestaande helper — naar alle waarschijnlijkheid iets als `getEligiblePillars(user)` of `getMembership(user)`. Zoek vóór je iets nieuws bouwt.

**Visueel op mobiel:** 5 items in de bottom tab bar is de bovengrens. Als het te krap wordt, label iconen compact ("Vrij" ipv "Vrij Trainen"). Liever iconografie aanpassen dan terug naar 4 met sub-navigatie — loskoppeling is de hele reden voor deze PR.

---

## Implementatie-checklist

### 1. Nieuwe pagina `src/app/(app)/app/vrij-trainen/page.tsx`

Server component. Haalt op:
- Alle `class_sessions` met `pillar = 'vrij_trainen'` voor komende 14 dagen
- Bestaande boekingen van de ingelogde user op die sessies
- Actief/paused membership van user (voor eligibility + cap)
- Setting `vrij_trainen_cancel_window_minutes`

Eligibility-gedrag:
- Plan dekt vrij_trainen + status `active` → full access
- Plan dekt vrij_trainen + status `paused` → pagina tonen, boeken disabled met "abonnement gepauzeerd"
- Plan dekt vrij_trainen niet OF rittenkaart → no-eligibility state met CTA naar `/app/abonnement`

Layout:
- Korte intro ("Open studio, kom tussen 06:00 en 22:00. Cancel kan tot vijf minuten voor sluiting.") — cancel-tijd uit settings, niet hardcoded.
- Weekstrip met 14 dagen, per dag één van:
  - `afgelopen` — verleden, disabled
  - `boek` — klik = boek-action
  - `geboekt` — klik = cancel-panel binnen window, na window read-only
  - `cap bereikt` — andere dagen niet boekbaar als weekcap op is
- Counter: "Deze week: 1 van 2" voor leden met beperkte cap. Leden met onbeperkt abbo zien geen counter.

**Frequency cap in deze fase** blijft booking-based (zelfde als nu, in bestaande eligibility-logica: tel bookings in ISO-week per pillar, reject bij `>= cap`). Hergebruik de bestaande server action voor booken — die doet de cap-check al.

Copy (concept, te bevestigen):
```tsx
// COPY: confirm with Marlon
"Open studio, kom wanneer je wil."
"Boek een dag, kom binnen tussen 06:00 en 22:00. Cancel kan tot vijf minuten voor sluiting."
```

States:
- Loading: skeleton weekstrip via skill tokens
- No-eligibility: info-card met tekst + link naar `/app/abonnement`
- Paused: pagina tonen, boek-knoppen disabled met "gepauzeerd"
- Error: skill default error state
- Empty: onwaarschijnlijk (zou betekenen geen sessies in 14 dagen)

### 2. Weekstrip component

Check eerst `src/app/(app)/app/rooster/_components/` — als daar een `Weekstrip` of `DayStrip` staat die prop-based is, extract naar `src/app/(app)/app/_shared/` en gebruik vanuit beide pagina's. Niet kopiëren.

Als het te rooster-specifiek is: bouw een eigen simpele variant onder `src/app/(app)/app/vrij-trainen/_components/VrijTrainenWeek.tsx`.

### 3. `src/components/nav/MemberNav.tsx`

Voeg 5e nav-item toe, conditional op eligibility.

```tsx
// voorbeeld — precieze shape hangt af van bestaande implementatie
const items = [
  { href: '/app/rooster', label: 'Rooster', icon: Calendar },
  { href: '/app/vrij-trainen', label: 'Vrij Trainen', icon: /* TODO: pick */, show: eligibleForVrijTrainen },
  { href: '/app/boekingen', label: 'Mijn lessen', icon: BookOpen },
  { href: '/app/abonnement', label: 'Lidmaatschap', icon: CreditCard },
  { href: '/app/profiel', label: 'Profiel', icon: User },
].filter(item => item.show !== false);
```

Iconsuggestie voor Vrij Trainen: `DoorOpen` of `Sun` uit lucide. `// COPY: confirm icon with Marlon`.

Eligibility wordt op server-niveau bepaald (layout of page loader) en meegegeven aan de nav. Niet client-side fetchen — vermijd flicker.

### 4. `src/app/(app)/app/rooster/page.tsx` opschonen

- Regels 281-298: verwijder `vrijTrainenByDate` map + bijbehorende splitsing.
- Regel 287-288: verwijder `s.pillar === "vrij_trainen"` branch.
- Regel 426: laat `pillars={PILLARS.filter(...)}` staan of verwijder filter — whichever consistent is. Vrij_trainen komt niet meer voor in de data van deze page (filter de query zelf ook).
- Query: voeg `.neq("pillar", "vrij_trainen")` toe aan de sessions-fetch, zodat rooster alleen sessies met tijdslots ziet.
- Verwijder de JSX-sectie "Open studio · kom wanneer je wil." en de bijbehorende onderste weekstrip.

### 5. Geen wijzigingen nodig

- Admin pagina's (`/app/admin/*`) — filter blijft zoals het is.
- Settings pagina — `vrij_trainen_cancel_window_minutes` blijft.
- Abonnement-flow (`/app/abonnement/nieuw`) — plan-keuze ongewijzigd.
- `class_sessions` datamodel — vrij_trainen blijft als pillar.

---

## Testing checklist

Met de seeded dummies (zie `tmc-dev-testing.md`):

1. **`vrij-2x@tmc.test`** (plan: Vrij Trainen 2×/wk):
   - Ziet nav-entry "Vrij Trainen"
   - `/app/vrij-trainen`: weekstrip rendert, counter "0 van 2" bovenaan
   - Boekt dag → counter gaat naar "1 van 2"
   - `/app/rooster`: geen vrij-trainen sectie meer, geen onderste weekstrip
2. **`allin-unl@tmc.test`** (All Access Onbeperkt):
   - Nav-entry zichtbaar
   - `/app/vrij-trainen`: werkt, geen counter (onbeperkt)
   - `/app/rooster`: kan ook gewoon groepslessen boeken
3. **`yoga-1x@tmc.test`** (alleen yoga/mobility):
   - Nav-entry **niet** zichtbaar
   - Direct naar `/app/vrij-trainen` → no-eligibility state met upgrade-CTA
4. **`tenride@tmc.test`** (rittenkaart):
   - Nav-entry niet zichtbaar
   - Directe URL → no-eligibility
5. **`paused@tmc.test`** (All Inclusive paused):
   - Nav-entry zichtbaar
   - `/app/vrij-trainen` laadt, boek-knoppen disabled met "abonnement gepauzeerd"
6. **Cancel-flow** binnen window: werkt; buiten window: duidelijke melding met eindtijd.
7. **A11y**: tab door weekstrip, enter boekt/annuleert, screen reader leest dag + status correct.
8. **Mobiel**: 5 nav-items passen in bottom tab bar zonder overflow. Test op iPhone SE breedte.
9. **Build**: `npm run typecheck && npm run lint && npm run build` groen.

---

## Deliverable

Eén PR met:
- `src/app/(app)/app/vrij-trainen/page.tsx` (+ eventueel `_components/`)
- Wijzigingen in `src/app/(app)/app/rooster/page.tsx`
- Wijziging in `src/components/nav/MemberNav.tsx`
- Eventueel shared weekstrip component

Commit message: `feat(vrij-trainen): split day-pass flow from rooster into own route`
