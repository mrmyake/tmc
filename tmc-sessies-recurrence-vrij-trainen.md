# TMC — Feature: Sessie-planning (recurrence) + Vrij Trainen als default-beschikbaarheid + Check-in integratie

## Waarom dit document

Drie gerelateerde features in één PR-traject, omdat ze hetzelfde schema en dezelfde UI raken:

1. **Sessies** kunnen eenmalig óf herhalend (dagelijks / per weekdag-selectie / wekelijks / maandelijks) worden ingepland en verwijderd, met optionele einddatum (default oneindig). Gedrag parity met Google Calendar, inclusief "alleen deze / deze en volgende / hele reeks" bij edit en delete.
2. **Vrij trainen** is default beschikbaar tijdens openingstijden. Geen losse "vrij trainen"-blokken in de kalender. Per sessie kan trainer aanvinken of die sessie de studio exclusief claimt ("blokkeert vrij trainen").
3. **Check-in** voor vrij trainen is vereist om (a) frequency-caps op 2×/3×/onbeperkt-abonnementen te kunnen handhaven, (b) Marlon overzicht te geven wie wanneer traint, (c) te valideren dat openingstijden kloppen met werkelijk gebruik.

Het check-in systeem bestaat al als specificatie in `docs/member-system/` (zie `fase-1-vrij-trainen-loskoppelen.md` of wat daarvan gemerged is). **Dit document bouwt erop voort, herhaalt het niet.** Check eerst wat al gemerged is.

---

## Universele regels (leidend, bij conflict winnen deze)

- **Server components default**, client components alleen voor interactiviteit.
- **Auth** via bestaande middleware + `(app)` route group. Niet zelf auth-checks toevoegen als de middleware het dekt.
- **RLS** moet alle queries dekken. Geen service-role in de client. Server actions voor mutations.
- **Geen hardcoded hex, spacing of font-stacks.** Alles via skill tokens / Tailwind config.
- **Bestaande componenten hergebruiken.** Eerst `components/` en `ui_kits/member/` checken voor je iets nieuws maakt.
- **Copy:** NL user-facing, geen em-dashes, geen emoji's. Markeer onzekere copy met `// COPY: confirm with Marlon`.
- **A11y:** keyboard nav, focus rings (skill tokens), aria-labels op icon-buttons, semantic HTML.
- **Loading + error + empty states** altijd expliciet. Skill heeft hiervoor tokens.
- **Motion:** skill standaard (500-800ms, `cubic-bezier(0.2, 0.7, 0.1, 1)`). Niet versnellen "voor snelheid".
- **TypeScript strict**, props interfaces geëxporteerd.
- **Marlon is een vrouw** (trainer van TMC) — gebruik zij/haar in alle copy.

Bronhiërarchie bij conflict:
1. Skill `the-movement-club-design` (tokens + primitives)
2. `docs/member-system/tmc-member-system.md` + `supabase/migrations/` + `types/supabase.ts`
3. Stitch "TMC Member System Design" — alleen voor layout/compositie

---

## Fase 0 — Verificatie eerst (geen code, geen schema, wacht op go)

Voordat je ook maar iets aanpast, rapporteer:

### A. Bestaande staat sessies

- Pad naar Supabase migrations voor `sessions` (of wat daarvan de huidige naam is).
- Volledig schema: kolommen, types, constraints, indexes, RLS policies.
- Bestaande server actions voor create/update/delete van sessies (paden + signatures).
- Bestaande UI: welke schermen maken/tonen sessies (admin én member). Geef paden.
- Date/time-library in project (date-fns? dayjs? native?). Niet een tweede toevoegen.
- Grep op `rrule`, `recurrence`, `recur`, `repeat`, `frequency`, `weekly`, `daily`. Is er al een half-af aanzet? Citeer.
- Check `package.json`: is `rrule` al dependency?

### B. Bestaande staat check-in

Dit is cruciaal want een groot deel van deze feature bestaat mogelijk al.

- Is `fase-1-vrij-trainen-loskoppelen.md` (of soortgelijk document) aanwezig in `docs/member-system/`? Citeer de inhoudsopgave.
- Bestaat er een `check_ins` tabel of migratie? Zo ja, volledig schema.
- Bestaan routes `/checkin`, `/app/admin/studio`? Zo ja, wat doen ze?
- Bestaan er settings-velden `check_in_enabled`, `check_in_required_for_cap`, `check_in_pillar_*`? Zo ja, waar opgeslagen?
- Hoe werkt frequency-cap enforcement nu (via bookings of via check-ins)? Lees de relevante server action en citeer.
- Bestaat er al een concept van `pillar` of `discipline` (yoga_mobility / kettlebell / vrij_trainen / kids / senior / pt)? Waar?

### C. Bestaande staat openingstijden

- Zijn openingstijden ergens vastgelegd (config file, env var, Supabase tabel)? Paden.
- Is er al een concept voor feestdagen / uitzonderingen?

### D. Bestaande staat abonnementen en frequency

- Schema van `membership_types` en `memberships`. Welke frequency-opties bestaan (2×, 3×, onbeperkt)?
- Hoe wordt de 4-weken-periode berekend? Start-datum per member, globale cycle, of per kalenderblok?
- Is er een veld per membership-type dat zegt "heeft toegang tot vrij trainen" (bv. een array van pillars, of losse booleans)?

### E. Relevante skill-secties en Stitch-schermen

- Welke secties uit `tmc-member-system.md` raken sessie-planning en vrij trainen?
- Welke design tokens relevant voor: form-controls, toggles, datepickers, dialogs, destructive actions, badge-varianten (ingecheckt / geboekt / no-show), legenda-items in kalender?
- Welke bestaande componenten dekken: date-picker, time-picker, checkbox-groep, dialog, toggle, segmented-control, badge? Lijst met paden.
- Stitch-schermen via MCP (als beschikbaar) voor: sessie-aanmaken, sessie-bewerken, scope-dialoog, admin-kalender, admin-studio (real-time aanwezigen).

### F. Reconciliatie-tabel per te bouwen scherm

Voor elk scherm dat je gaat aanpassen of toevoegen, één tabel:

| Stitch-element (of bestaand scherm) | Skill-component | Supabase data | Server action |
|---|---|---|---|

**STOP na Fase 0. Wacht op go voor Fase 1.**

---

## Fase 1 — Datamodel (alleen uitvoeren na go op Fase 0)

Kernkeuze: **RRULE (RFC 5545)** voor recurrence + **exceptions-tabel** voor per-instance overrides. Reden: één veld dekt alle patronen die we willen, `rrule` (npm) parseert/genereert/serialiseert, DST-safe, en dit is wat Google Calendar onder de motorkap doet. Geen eigen recurrence-string-parser.

### 1.1 Uitbreiding `sessions` (of hernoem naar `session_series` als dat in de codebase cleaner leest — stel eerst voor, wacht op go)

```
-- nieuwe kolommen
rrule               text null            -- RFC 5545; null = eenmalig
recurrence_end      timestamptz null     -- null = oneindig (tot de rrule zelf stopt)
timezone            text not null default 'Europe/Amsterdam'
duration_minutes    int not null         -- vervang end_at als dat bestaat; recurring + end_at = DST-bug-tuin
blocks_free_training boolean not null default true
pillar              text not null        -- enum/check: yoga_mobility | kettlebell | vrij_trainen | kids | senior | pt
                                         -- LET OP: vrij_trainen als pillar betekent "eigen vrij-trainen-context",
                                         -- maar in praktijk gebruiken we deze pillar zelden voor ingeplande sessies.
                                         -- Vrij trainen is default-beschikbaarheid, niet een geplande sessie.
```

Als `end_at` bestaat: migreer naar `duration_minutes` in dezelfde migratie. Rapporteer eerst het migratieplan.

### 1.2 Nieuwe tabel `session_exceptions`

```
id                               uuid pk
series_id                        uuid fk -> sessions.id (cascade delete)
original_start_at                timestamptz not null  -- welke occurrence wordt overschreven
status                           text not null check (status in ('cancelled','modified'))
override_start_at                timestamptz null
override_duration_minutes        int null
override_title                   text null
override_description             text null
override_capacity                int null
override_blocks_free_training    boolean null
override_pillar                  text null
created_at                       timestamptz not null default now()
unique(series_id, original_start_at)
```

Semantiek:
- "Alleen deze verwijderen" → insert met `status='cancelled'`.
- "Alleen deze bewerken" → insert met `status='modified'` + overrides.
- "Deze en volgende" → zet `recurrence_end` op de originele occurrence min 1 seconde, en maak eventueel een nieuwe serie aan vanaf het moderatiepunt.
- "Alle sessies" → update de series-rij direct. (Exceptions die vóór de wijziging lagen blijven staan — dat is het gewenste gedrag en matcht Google Calendar.)

### 1.3 Nieuwe tabellen voor openingstijden

**Voorstel (wacht op go op Fase 0-vraag "hardcoded of Supabase?"). Default advies: Supabase, want Marlon moet vakantieweken zelf kunnen doordrukken zonder deploy.**

```
opening_hours
  id          uuid pk
  weekday     smallint not null  -- ISO: 1=ma t/m 7=zo (documenteer bovenaan de migratie)
  opens_at    time not null
  closes_at   time not null
  active      boolean not null default true
  unique(weekday)

opening_hours_exceptions
  id          uuid pk
  date        date not null unique
  opens_at    time null
  closes_at   time null
  closed      boolean not null default false
  note        text null          -- "Tweede Kerstdag", "Zomerstop week 30-31"
```

Seed `opening_hours` met de huidige openingstijden. Vraag aan Ilja welke; als niet beschikbaar, seed met ma-vr 06:00-22:00, za-zo 08:00-18:00 en markeer als TODO.

### 1.4 RLS

- `sessions`, `session_exceptions`: select voor ingelogde members; insert/update/delete alleen trainer/admin (check bestaand rollenmodel, bouw geen nieuw).
- `opening_hours`, `opening_hours_exceptions`: select voor alle ingelogde users; write alleen trainer/admin.
- Nooit service-role in client-code.

### 1.5 Indexes

- `sessions(start_at)`, `sessions(trainer_id, start_at)`, `sessions(pillar, start_at)`.
- `session_exceptions(series_id, original_start_at)` — al via unique constraint.
- `opening_hours_exceptions(date)` — al via unique.

### 1.6 Check op bestaand check-in schema

Als `check_ins` tabel bestaat (zie Fase 0 rapport): check of `pillar` kolom bestaat. Zo niet, voeg toe (voor consistentie met `sessions.pillar`). Als `session_id` kolom bestaat maar `pillar` mist: pillar afleiden uit sessie; als `session_id` null mag zijn (walk-in vrij trainen zonder sessie), dan is `pillar` nodig als losse kolom.

**Wacht op go voor Fase 2.**

---

## Fase 2 — Query-laag (server-only)

### 2.1 Canonieke occurrence-expander

```ts
// server-only
export async function getSessionOccurrences(opts: {
  from: Date
  to: Date
  trainerId?: string
  pillar?: Pillar
  includeCancelled?: boolean   // default false; admin-view zet 'm aan voor audit
}): Promise<SessionOccurrence[]>
```

Werking:
1. Select series met `start_at <= to` en `(recurrence_end is null OR recurrence_end >= from)`.
2. Voor series met `rrule`: expand met `rrule` library binnen `[from, to]`, zet timezone correct (DST-safe via `rrule`'s tzid-ondersteuning, niet handmatig).
3. Join met `session_exceptions` op `series_id` + `original_start_at`: drop cancelled, apply modified overrides.
4. Return platte lijst `SessionOccurrence` met `{ seriesId, originalStartAt, startAt, durationMinutes, title, pillar, blocksFreeTraining, isException, exceptionId?, capacity }`.

Types in `types/sessions.ts`, geëxporteerd, strict.

### 2.2 Vrij-trainen-beschikbaarheid

```ts
// server-only
export async function getFreeTrainingAvailability(opts: {
  from: Date
  to: Date
}): Promise<FreeTrainingSlot[]>
```

Werking:
1. Haal openingstijden per dag binnen range op, inclusief exceptions. Dagen die `closed=true` zijn leveren geen slots.
2. Haal occurrences binnen range op waarvan de **effectieve** `blocks_free_training` true is (default, tenzij exception overschrijft).
3. Subtract blokkerende occurrences van openingstijd-intervallen. Merge aansluitende restanten.
4. Return lijst `{ date, slots: Array<{start, end}> }` per dag, in local time (Europe/Amsterdam).

Expliciete DST-tests verplicht (zie Fase 4).

### 2.3 Server actions

Eén create-functie die zowel eenmalig als recurring afhandelt:

```ts
export async function createSession(input: CreateSessionInput): Promise<{ id: string }>
```

Waar `CreateSessionInput` zod-geschema heeft met discriminated union voor recurrence:

```ts
recurrence:
  | { type: 'none' }
  | { type: 'daily',   until?: Date }
  | { type: 'weekly',  byDay: WeekDay[], until?: Date }   // ['MO','WE','FR']
  | { type: 'weekly_same_day', until?: Date }             // wekelijks op start-datum-weekdag
  | { type: 'monthly', until?: Date }
```

Intern mappen naar RRULE-string. UI stuurt nooit RRULE direct.

Update en delete met scope:

```ts
export async function updateSession(
  seriesId: string,
  occurrenceStart: Date,
  scope: 'this' | 'this_and_following' | 'all',
  patch: UpdateSessionPatch
): Promise<void>

export async function deleteSession(
  seriesId: string,
  occurrenceStart: Date,
  scope: 'this' | 'this_and_following' | 'all'
): Promise<void>
```

Scope-logica:
- `this`: insert exception (`modified` of `cancelled`).
- `this_and_following`: update series `recurrence_end` naar `occurrenceStart - 1s`; voor update ook een nieuwe serie vanaf `occurrenceStart` met patch toegepast.
- `all`: update series-rij direct.

### 2.4 Integratie met check-in en frequency-cap

**Check eerst wat er al bestaat.** Afhankelijk van bevindingen Fase 0:

- Als `check_in_enabled` flag + pillar-toggles bestaan: voeg `pillar = 'vrij_trainen'` toe aan check-in flow zonder `session_id` (walk-in naar studio, kiest pillar of systeem leidt af uit tijdstip + `blocks_free_training` state).
- Als frequency-cap al via check-ins wordt gehandhaafd voor `vrij_trainen`-pillar: niets te doen, alleen valideren in tests.
- Als frequency-cap nog via bookings loopt: uitbreiden volgens bestaande fase-1-spec.

**Geen duplicaat werk.** Als Fase 0 rapporteert dat fase-1-check-in al gemerged is, verwijs ernaar en implementeer alleen de delta.

---

## Fase 3 — UI

### 3.1 Sessie-aanmaken / bewerken formulier

Locatie: waar het nu ook staat (Fase 0 rapporteert pad). Hergebruik bestaand form-component.

Nieuwe velden:

**Recurrence-picker** (`SessionRecurrencePicker`, nieuwe component in `ui_kits/member/` of `components/admin/`, afhankelijk van bestaande conventie):
- Radio: "Eenmalig" / "Herhalend"
- Als herhalend: segmented control "Dagelijks" / "Wekelijks op specifieke dagen" / "Wekelijks" / "Maandelijks"
- Als "Wekelijks op specifieke dagen": 7 toggle-chips ma t/m zo, ten minste 1 vereist
- Einddatum: toggle "Geen einddatum" (default aan) / datumveld als toggle uit, min = startdatum + 1 dag

**Blokkeert-vrij-trainen toggle:**
- Label: "Blokkeert vrij trainen"
- Helper-tekst: "Tijdens deze sessie is de studio niet beschikbaar voor vrij trainen."
- Default: `true`
- Plaats onder recurrence-picker

**Pillar-select:** als nog niet bestaat in form, voeg toe. Anders ongewijzigd.

A11y: `role="group"` + `aria-labelledby` op weekdagen-chips. Focus rings via skill tokens.

### 3.2 Scope-dialoog (bij edit én delete op een occurrence uit een serie)

Eén gedeelde component `SessionScopeDialog`:
- Titel context-afhankelijk: "Wijzig sessie" / "Verwijder sessie"
- Radio-group: "Alleen deze sessie" / "Deze en volgende sessies" / "Alle sessies in de reeks"
- Primary-button context-afhankelijk; bij verwijderen destructive-variant via skill-token
- Bevestiging bij "Alle sessies verwijderen": `// COPY: confirm with Marlon` "Weet je zeker dat je alle sessies in deze reeks wilt verwijderen? Dit kan niet ongedaan worden gemaakt."
- Esc sluit, focus trap, `aria-labelledby` op dialog

### 3.3 Admin-kalender (bestaande `/app/admin/rooster`)

- **Geen aparte vrij-trainen-blokken.** Default-beschikbaarheid is impliciet.
- Sessies die vrij trainen blokkeren: gevulde achtergrond via skill primary/accent token.
- Sessies die vrij trainen niet blokkeren: outlined/subtle variant via skill token, visueel leesbaar als "ruimte blijft open voor vrij trainen".
- Legenda bovenaan: twee staten, tekstuele uitleg. `// COPY: confirm with Marlon`.
- Screenreader: `aria-label` op session-card vermeldt expliciet "blokkeert vrij trainen" of "ruimte blijft open voor vrij trainen" — niet alleen via kleur.
- Recurrence-indicator op series-occurrences: klein icoon of label "Herhalend" (text + icon, niet icon-only). `aria-label` "Onderdeel van herhalende reeks".

### 3.4 Admin-kalender: Vrij Trainen overzicht

Onder of naast de sessies-kalender, een paneel/tabel "Vrij trainen vandaag" (of geselecteerde dag):
- Lijst check-ins met `pillar = vrij_trainen` van die dag.
- Kolommen: tijd, naam, membership-type (of `access_type` badge voor niet-leden), status.
- Week-switch voor trendinzicht: "Deze week X check-ins, vorige week Y."
- Link naar real-time studio-view (`/app/admin/studio`) als die bestaat of toegevoegd wordt in deze iteratie.

Data-bron: `check_ins` join `profiles` join `memberships`. Als check-in systeem nog niet live is: placeholder-lege-state met "Beschikbaar zodra check-in live staat" en flag dit als dependency in de PR-beschrijving.

### 3.5 Member-view `/app/vrij-trainen` (raakt fase-1-check-in spec)

**Check Fase 0 rapport:** als deze pagina al bestaat en de fase-1-check-in flow implementeert, is de enige aanpassing hier dat openingstijden uit de nieuwe Supabase-tabel komen in plaats van hardcoded. Niet herschrijven.

Als de pagina niet bestaat: volg fase-1-check-in spec (counter "Deze week X van Y ingecheckt", uitleg dat check-in via tablet in studio loopt, recente-check-ins-lijst). Voeg toe: openingstijden van vandaag/deze week op basis van `opening_hours` + exceptions.

### 3.6 Admin-instellingen

Binnen bestaand `/app/admin/instellingen`:
- Nieuwe sectie "Openingstijden" met editor voor `opening_hours` (per weekdag open/dicht + tijden) en `opening_hours_exceptions` (datumpicker + closed/afwijkende tijden + note).
- Bestaande "Check-in"-sectie (als aanwezig) ongewijzigd laten.

### 3.7 Loading / error / empty states

Verplicht per scherm. Skill heeft tokens. Geen blanco schermen, geen onduidelijke spinners zonder context.

---

## Fase 4 — Tests

Unit tests voor `getSessionOccurrences`:
- Series zonder rrule: levert exact één occurrence.
- `FREQ=DAILY` tussen range: juiste aantal.
- `FREQ=WEEKLY;BYDAY=MO,WE,FR`: alleen die dagen.
- `UNTIL`: laatste occurrence exact op UNTIL, niet erna.
- Exception `cancelled`: wordt weggelaten.
- Exception `modified`: overschrijft alleen de matchende occurrence, andere onaangetast.
- DST maart (laatste weekend): geen dubbele of ontbrekende occurrence.
- DST oktober (laatste weekend): idem.
- `recurrence_end` in het verleden: lege lijst.
- Range volledig vóór `start_at`: lege lijst.

Unit tests voor `getFreeTrainingAvailability`:
- Dag zonder sessies: volledige openingstijd als één slot.
- Dag met blokkerende sessie middenin: twee slots.
- Dag met blokkerende sessie precies van open tot close: lege slot-lijst voor die dag.
- Twee opeenvolgende blokkerende sessies zonder gap: geen kunstmatige splitsing rond de grens.
- Sessie met `blocks_free_training = false`: geen impact.
- Sessie met exception `override_blocks_free_training`: exception wint van serie-default.
- Feestdag-exception met `closed=true`: lege lijst ongeacht sessies.
- Afwijkende openingstijd-exception: slots op basis van exception-tijden, niet de reguliere weekdag.
- DST-dag: slots corresponderen met lokale wandkloktijd.

Integratie-tests:
- Create recurring session → occurrences verschijnen in `getSessionOccurrences` voor komende 4 weken.
- Update scope `this` → exception aangemaakt, andere occurrences onaangetast.
- Update scope `this_and_following` → originele serie ge-UNTIL'd op occurrence-1s, nieuwe serie met patch actief.
- Update scope `all` → series-rij aangepast, bestaande exceptions blijven.
- Delete scope `this` → cancelled exception, occurrence verdwijnt uit lijst.
- Delete scope `all` → alle occurrences verdwijnen, exceptions cascaden weg.

Frequency-cap tests (alleen uitvoeren als check-in systeem live is in deze codebase):
- Lid met 2×/week abonnement: 2 check-ins toegestaan, 3e geblokkeerd binnen dezelfde week.
- All-Access: onbeperkt.
- Vrij-trainen check-in telt voor `blocks_free_training=false` sessies niet als aparte cap-hit (zolang die niet apart gecheckt is).

---

## Fase 5 — Copy-lijst (NL, geen em-dashes, geen emoji's)

Allemaal markeren met `// COPY: confirm with Marlon` tenzij triviaal:

- "Eenmalig" / "Herhalend"
- "Dagelijks" / "Wekelijks" / "Wekelijks op specifieke dagen" / "Maandelijks"
- "Ma Di Wo Do Vr Za Zo"
- "Geen einddatum" / "Einddatum"
- "Blokkeert vrij trainen"
- "Tijdens deze sessie is de studio niet beschikbaar voor vrij trainen."
- "Sessie opslaan" / "Sessie verwijderen"
- Scope-dialoog titels: "Wijzig sessie" / "Verwijder sessie"
- Scope-opties: "Alleen deze sessie" / "Deze en volgende sessies" / "Alle sessies in de reeks"
- Bevestigingstekst hele reeks verwijderen: "Weet je zeker dat je alle sessies in deze reeks wilt verwijderen? Dit kan niet ongedaan worden gemaakt."
- Legenda kalender: "Blokkeert vrij trainen" / "Ruimte blijft open"
- Recurrence-badge op session-card: "Herhalend"
- Vrij-trainen admin-paneel: "Vrij trainen vandaag" / "Deze week" / "Vorige week"
- Openingstijden-editor: "Openingstijden" / "Uitzonderingen" / "Gesloten" / "Afwijkende tijden"

---

## Fase 6 — Definition of Done

- Migraties forward én backward getest op lokale branch-DB.
- RLS policies getest: members kunnen lezen, niet muteren; trainer/admin wel.
- Zod-schema's strict, inferred types gebruikt in UI.
- Alle nieuwe functies hebben unit tests uit Fase 4.
- DST-tests expliciet uitgevoerd.
- Bestaande sessie-functionaliteit regressie-getest (lijst uit Fase 0 is leidend).
- Bestaande check-in functionaliteit (indien gemerged) regressie-getest.
- `npm run typecheck` groen.
- `npm run lint` groen.
- `npm run build` groen.
- Eén PR met duidelijke beschrijving, screenshots van:
  - Sessie-aanmaken formulier (eenmalig, wekelijks-specifieke-dagen, met/zonder einddatum)
  - Scope-dialoog bij edit en delete
  - Admin-kalender met en zonder blokkerende sessies
  - Vrij-trainen admin-paneel met check-in lijst
  - Openingstijden-editor

---

## Wat NIET doen

- Geen eigen recurrence-string-parser. Gebruik `rrule`.
- Geen pre-materialisatie van alle instances tot 2099 in de DB.
- Geen tweede date-library installeren naast wat er al staat.
- Geen nieuwe design tokens of hardcoded kleuren buiten skill.
- Geen client-side auth-checks als middleware dekt.
- Geen service-role client in browser-code.
- Geen nieuw dialog-component als er een in de kit zit.
- Geen "vrij trainen" entity in de kalender. Het is afgeleid van opening minus blokkade.
- Geen apart check-in systeem bouwen als `fase-1-vrij-trainen-loskoppelen.md` al gemerged is. Integreer.
- Geen eigen frequency-cap enforcement bouwen als bestaande bestaat. Hergebruik.
- Geen em-dashes in NL copy. Geen emoji's.
- Geen aannames over pilaar-enum zonder Fase 0 te checken.

---

## Werkvolgorde samengevat

1. **Fase 0 rapport** in PR-beschrijving of als comment. Wacht op go.
2. **Fase 1 migratie-diff** + korte toelichting per keuze. Wacht op go.
3. **Fase 2 query-laag + server actions** met tests. Wacht op go.
4. **Fase 3 UI**, per scherm eerst reconciliatie-tabel, dan implementatie. Wacht op go per scherm of per logische cluster (recurrence-form, scope-dialoog, admin-kalender, vrij-trainen-paneel, openingstijden-editor).
5. **PR openen**, CI groen, screenshots.

Houd de changelog onderaan de PR-beschrijving bij: nieuwe files, aangepaste files, openstaande vragen, schema-discrepanties (flaggen, niet oplossen).

---

## Open vragen voor Ilja / Marlon (beantwoord voor of tijdens Fase 0)

1. Default `blocks_free_training`: `true` (advies) of `false`? Advies is `true` omdat 160m² zelden beide tegelijk aankan.
2. Openingstijden in Supabase-tabel (advies) of config-file? Advies: tabel, zodat Marlon zelf vakantieweken kan doorvoeren.
3. Moet `blocks_free_training` ook per occurrence override-baar zijn, of alleen op serie-niveau? Advies: override-baar (al in schema).
4. Welke huidige openingstijden seeden? Default ma-vr 06:00-22:00, za-zo 08:00-18:00 als niet beschikbaar.
5. Moet vrij-trainen-beschikbaarheid ook in member-app getoond worden (buiten de counter-weergave), of is dat latere scope?
6. Welke pillars willen we definitief als enum? Voorstel: `yoga_mobility | kettlebell | vrij_trainen | kids | senior | pt`. Bevestig of breid uit.
