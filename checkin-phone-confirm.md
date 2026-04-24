# Check-in — telefoonnummer-matching + bevestigingsscherm

## Wat ik wil bereiken

Twee aanpassingen aan de bestaande check-in tablet-flow (`/checkin`):

1. **Telefoonnummer-matching losmaken van DB-format.** Input is altijd 10 cijfers (bv. `0612345678`). De DB kan hetzelfde nummer in verschillende vormen opslaan (`+31612345678`, `0612345678`, `06-12345678`, `+31 6 1234 5678`, etc). De lookup moet matchen ongeacht format.

2. **Bevestigingsscherm na lookup.** Nu word je direct ingecheckt na nummer-invoer. Ik wil eerst een scherm zien met context: welke les is er voor me geboekt, of wordt het Vrij Trainen? Pas na "Check in" klikken gaat de check-in daadwerkelijk door.

Membernummer-lookup blijft exact-match, geen normalisatie.

---

## Stap 1 — Discovery (verplicht, voordat je iets bouwt)

Doorzoek de codebase en beantwoord:

**Huidige check-in flow:**
1. Waar leeft de `/checkin` route? Bestandspaden van de pagina + server actions.
2. Welke lookup-logica doet het nu met telefoonnummer? Laat de relevante code zien.
3. Welke lookup-logica doet het nu met membernummer? Laat de relevante code zien.
4. Hoe wordt `profiles.phone` nu opgeslagen in de DB? Format-aannames, constraints, of hij unique is. Laat een paar voorbeelden van echte waarden zien (uit seed-data of migratie).

**Booking-context:**
5. Is er al een helper/query die "booking van deze user voor vandaag" ophaalt? Zo ja, waar. Zo nee, welke query zou dat doen (ruwe SQL of Supabase-query schets).
6. Welke velden zitten er op een booking en op een class_session die ik nodig heb voor het bevestigingsscherm (sessienaam, starttijd, pillar)?

**Vrij-trainen eligibility:**
7. Is er al een helper die checkt of een user eligible is voor vrij trainen (bv. `hasVrijTrainenAccess`, `getCoveredPillars`)? Zo ja, waar. Zo nee, hoe wordt het nu elders in de app gecheckt (bv. op `/app/vrij-trainen` of in nav).

**Check-in state:**
8. Hoe wordt "al ingecheckt vandaag" nu gecheckt, als dat al bestaat? Query of helper.

**UI-structuur:**
9. Hoe is het huidige `/checkin` scherm opgebouwd (één pagina, multi-step, state-based)? Welk component rendert het keypad? Welke shared components zijn er al (buttons, cards, layout-primitives)?

---

## Stap 2 — Implementation plan (rapportage, niet bouwen)

Op basis van stap 1, lever een plan op met:

**Voor telefoonnummer-matching:**
- Welke helper je gaat toevoegen (naam, locatie, wat hij doet)
- Hoe je de lookup-query aanpast
- Of `profiles.phone` een generated column of index nodig heeft
- Hoe je de keypad-input UI aanpast (max 10 cijfers, auto-lookup bij 10, display-formatting)

**Voor bevestigingsscherm:**
- Welke server action de context ophaalt (naam, signature, wat hij returned)
- Welke states de UI moet renderen (zie "UX-specificatie" hieronder)
- Of je het als aparte route/page behandelt of als state binnen de bestaande check-in pagina
- Hoe de "al ingecheckt vandaag" check werkt

**Wat je NIET gaat aanpassen:**
- Lijst expliciet wat out-of-scope is (bv. admin-modus, bestaande check-in server action zelf, etc)

**Risico's / onzekerheden:**
- Plekken waar je iets anders ziet dan ik beschrijf en waar je graag feedback op wil
- Edge cases die je denkt dat ik over het hoofd zie

**STOP DAN. Wacht op mijn go.**

---

## Stap 3 — UX-specificatie (voor als je go krijgt)

### Telefoonnummer-input

- Keypad accepteert maximaal 10 cijfers
- Visuele formatting tijdens tikken: `06 12 34 56 78` (waarde blijft `0612345678`)
- Bij 10 cijfers: auto-trigger lookup (geen "zoek" knop)
- Membernummer-input blijft zoals het is

### Normalisatie-helper (concept, mag je aanpassen op basis van discovery)

```ts
// src/lib/phone.ts
export function normalizeNLPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('31')) return digits.slice(2);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits; // 9-digit core: "612345678"
}
```

Lookup: normaliseer input en kandidaten naar 9-digit core, vergelijk op die waarde. Implementatie-keuze laat ik aan jou op basis van wat past bij de huidige code (postgres expression, in-memory filter bij klein aantal profiles, of generated column).

### Bevestigingsscherm — vier states

**Server action `resolveCheckInContext(profileId)` returned:**
- `profile` (firstName, lastInitial)
- `alreadyCheckedIn` (boolean + tijd indien true)
- `nextBooking` (session object met name, startAt, id, pillar) of null
- `canUseVrijTrainen` (boolean)

**Logica voor states:**
- Als `alreadyCheckedIn` → **State A**
- Else als `nextBooking` bestaat EN `start_at` ligt tussen `now() - 30 min` en `end_of_day(now())` → **State B**
- Else als `canUseVrijTrainen` → **State C**
- Else → **State D**

**State A — Al ingecheckt:**
> Hoi {firstName}, je bent al ingecheckt vandaag om {HH:mm}.
>
> [Klaar]

**State B — Booking gevonden:**
> Hoi {firstName}.
> Je bent geboekt voor **{sessionName}** om **{HH:mm}**.
>
> [Check in]   [Annuleer]

**State C — Vrij trainen:**
> Hoi {firstName}.
> Geen les geboekt vandaag. Check je in voor **Vrij Trainen**?
>
> [Check in]   [Annuleer]

**State D — Geen eligibility:**
> Hoi {firstName}.
> Je hebt vandaag geen les geboekt en je abonnement dekt geen Vrij Trainen. Spreek Marlon even aan.
>
> [Terug]

### Gedrag

- "Check in" → roept bestaande check-in server action aan met `session_id` (state B) of `null` + pillar `vrij_trainen` (state C). Gebruik de bestaande action, bouw geen nieuwe.
- Na succesvolle check-in: bevestigingsscherm 2 seconden ("Ingecheckt. Tot zo."), dan reset naar keypad.
- "Annuleer" / "Terug" / "Klaar" → reset naar keypad (niet gewoon sluiten, iemand kan per ongeluk een verkeerd nummer hebben getikt).
- Als de sessie bij state B meer dan 30 min geleden is begonnen: behandelen als state C (persoon is te laat, pakt vrij trainen). Dit is een edge case, maar voorkomt verwarring.

### Privacy

- Toon alleen **voornaam + achternaam-initiaal** ("Marie J."), niet volledige achternaam. Publieke tablet.
- Na check-in direct resetten, niet laten hangen op succesmelding waar de volgende tikker de naam nog ziet.

---

## Universele regels

- **Server components default**, client components alleen voor interactiviteit.
- **RLS** moet alle queries dekken. Geen service-role in de client.
- **Geen hardcoded hex, spacing of font-stacks.** Skill tokens / Tailwind config.
- **Bestaande componenten hergebruiken.** Eerst kijken wat er al is in `components/` en `ui_kits/member/`.
- **Copy:** NL, geen em-dashes, geen emoji's. Twijfelgevallen: `// COPY: confirm with Marlon`.
- **A11y:** keyboard nav, focus rings, aria-labels, semantic HTML.
- **Loading + error states** expliciet.
- **TypeScript strict**, props interfaces geëxporteerd.

## Acceptance

- `npm run typecheck` + `npm run lint` + `npm run build` groen.
- Tablet-flow is met één pincode (of zonder auth zoals nu) werkbaar.
- Handmatig getest: tik nummer in verschillende formaten in de DB, lookup werkt consistent.

---

**Begin met Stap 1. Stop na Stap 2 voor mijn review.**
