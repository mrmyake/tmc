# TMC Member System — Claude Code Prompts per Scherm

**Doel:** één PR per scherm, waarin zowel de visuele implementatie als de gedragslogica in één keer af is.
**Bron-hiërarchie (strikt):**

1. **LEIDEND — Design system skill `the-movement-club-design`.** Net doorgelopen op consistentie over de hele website. Als Stitch iets anders toont qua kleur/typografie/spacing/radius, wint de skill. Altijd.
2. **Gedrag & data — `docs/member-system/tmc-member-system.md` + `supabase/migrations/`.** Auth, RLS, tabellen, flows, rechten. Niet afwijken zonder migratie.
3. **Layout-referentie — Stitch project "TMC Member System Design".** Alleen voor compositie en hiërarchie. Stitch mag je helpen beslissen waar iets staat, nooit hoe het eruitziet.

---

## Universele preamble (plak dit boven elke scherm-prompt)

```markdown
Je werkt in de TMC Next.js codebase. Gebruik de skill `the-movement-club-design` voor álle visuele keuzes — die skill is net gevalideerd op consistentie en is leidend.

Bronnen in volgorde van autoriteit:
1. Skill `the-movement-club-design` — tokens, primitives, componenten uit `ui_kits/member` en `ui_kits/website`. Niets hardcoden wat in de skill staat.
2. `docs/member-system/tmc-member-system.md` — data model, flows, rechten.
3. `supabase/migrations/` + `types/supabase.ts` — de echte schema's en types. Regenereer na een migratie met `npm run types:supabase` (roept `supabase gen types typescript --project-id iljyitdazzhalblqetkx` aan).
4. Stitch-mockups in `stitch/` (lokaal, elke mock heeft een `screen.png` + `code.html`) — alleen voor layout/compositie. Stitch overrulet nooit de skill. Als Stitch MCP in de sessie tools exposet, prefer die; anders de lokale files.

Universele regels:
- **Server components default**, client components alleen voor interactiviteit.
- **Auth.** De member-app zit op `src/app/app/*` (geen `(app)` route group — wordt later pas ingevoerd als we meerdere grouped layouts krijgen). Elke server component onder `/app/*` zelf auth-checken via de Supabase server client tot we een middleware/route-group opzet hebben. Uitlog-redirect naar `/login`. Rol-gates (member/trainer/admin) via `profiles.role`.
- **RLS** moet alle queries dekken. Geen service-role in de client. Server actions voor mutations.
- **Geen hardcoded hex, spacing of font-stacks.** Alles via skill tokens / Tailwind config.
- **Bestaande componenten hergebruiken.** Eerst `src/components/ui/` + `src/components/blocks/` + skill `ui_kits/member/` checken voor je iets nieuws maakt.
- **Copy:** NL user-facing, geen em-dashes, geen emoji's. Copy uit Stitch is conceptueel, niet finaal — markeer twijfelgevallen met `// COPY: confirm with Marlon`.
- **A11y:** keyboard nav, focus rings (skill tokens), aria-labels op icon-buttons, semantic HTML.
- **Loading + error + empty states** altijd expliciet. Skill heeft hiervoor tokens.
- **Motion:** skill standaard (500-800ms, `cubic-bezier(0.2, 0.7, 0.1, 1)`). Niet versnellen "voor snelheid".
- **TypeScript strict**, props interfaces geëxporteerd.

Werkvolgorde per scherm:
1. Lees skill, lees relevante sectie uit `docs/member-system/tmc-member-system.md`, haal Stitch-scherm op (`stitch/<naam>/screen.png` + `code.html`).
2. Als de migratie sinds laatste sessie is aangepast: `npm run types:supabase` draaien.
3. Rapporteer reconciliatie-tabel (Stitch-element → skill-component → Supabase-data). Wacht op go.
4. Implementeer. Alle bestanden in één PR.
5. `npm run typecheck` + `npm run lint` + `npm run build` moeten groen. Alle drie zijn nu ingericht en passen op main.
6. Changelog onderaan de PR-beschrijving: nieuwe files, aangepaste files, openstaande vragen, eventuele schema-discrepanties (flaggen, niet oplossen).
```

---

## Aanbevolen bouwvolgorde

Bouw van fundering naar diepte. Elk scherm hieronder kan als losse PR.

**Week 1 — Basis member app**
1. B1 Dashboard (alles hangt hieraan)
2. B2 Rooster + boeken (kernfunctie)
3. B3 Eigen boekingen (afgeleid van B2)
4. B4 Abonnement (rechten-context voor boeken)

**Week 2 — Completering member**
5. B6 Profiel + health intake (auth vereist dit voor eerste sessie)
6. B5 Facturen
7. B7 PT-boeking (leunt op trainer-data)
8. A1 Publiek rooster (lichte variant van B2)
9. A2 Pillar-widget

**Week 3 — Admin cockpit**
10. C1 Admin dashboard
11. C2 Rooster editor
12. C3 Deelnemerslijst (sidepanel uit C2)
13. C4 Ledenbeheer
14. C5 Lid detail (afgeleid van C4)
15. C6 Trainers

**Week 4 — Trainer view**
16. D1 Trainer dashboard
17. D2 Trainer sessies + aanwezigheid

---

# A — Publieke schermen

## A1. Publiek rooster — `/rooster`

**Doel:** prospects tonen wanneer welke les is, zonder boek-functionaliteit. CTA naar `/aanbod` of `/login`.

**Stitch-scherm:** "Publiek rooster" (of naam die Stitch geeft — list eerst).
**Tabellen:** `class_sessions`, `schedule_templates`, `trainers` (read-only, via public RLS policy of server-side fetch zonder auth).

```markdown
[plak universele preamble]

Scherm A1: Publiek rooster op `/rooster`.

Features:
- Toon week-overzicht van sessies (vandaag + 13 dagen vooruit).
- Per sessie zichtbaar: lestype, tijd, trainer, beschikbare plekken ("3 van 10").
- Geen boek-knop voor niet-ingelogden; toon "Log in om te boeken" CTA bij hover/tap per sessie.
- Ingelogde leden zien de volledige boek-flow (redirect naar B2 gedrag).
- Filter: lestype (chips).
- Desktop: week-kolomweergave. Mobiel: lijst per dag, sticky day-header.

Design:
- Haal layout uit Stitch "TMC Member System Design" (publiek rooster scherm).
- Gebruik `<ScheduleGrid>` en `<SessionCard>` uit de skill als aanwezig; anders opbouwen uit `<Card>` + skill tokens.
- Empty state wanneer een dag geen sessies heeft: centered, champagne-accent microcopy.

Data:
- Server component fetch via Supabase anon client (RLS: publieke sessies zichtbaar).
- Check of `class_sessions` tabel een `is_public_visible` flag heeft; anders alleen `status = 'scheduled'` tonen.

Acceptatie:
- /rooster werkt uitgelogd én ingelogd.
- Bezetting is live (geen caching langer dan 60s).
- Filter persistent via URL query param (`?type=kettlebell`).
- Lighthouse desktop performance > 90.
```

---

## A2. Pillar-widget (embeddable)

**Doel:** compact rooster-component dat op homepage en evt. externe pillar-pagina kan staan.

```markdown
[plak universele preamble]

Scherm A2: Pillar-widget — compacte rooster-teaser voor homepage en embed.

Features:
- Toont volgende 3 sessies vandaag + eerste sessie van morgen.
- Bij lege dag: "Vandaag geen sessies — morgen om HH:MM weer van start."
- CTA onder de lijst: "Bekijk volledig rooster" → `/rooster`.
- Losse React component `<ScheduleTeaser />` in `components/member/ScheduleTeaser.tsx`, herbruikbaar.
- Variant `variant="embed"` zonder chrome (voor iframe-less embed via script tag — later).

Design:
- Stitch "Pillar widget" scherm als layout-referentie.
- Skill primitives: `<Card variant="subtle">`, `<SessionListItem>`, `<Button variant="ghost">`.
- Maximaal 1 champagne-accent element (de CTA).

Data:
- Server component, dezelfde query als A1 maar gelimiteerd tot 4 rows (3 vandaag + 1 morgen).
- Revalidate elke 5 minuten (`export const revalidate = 300`).

Acceptatie:
- Widget werkt standalone op `/` homepage.
- Geen layout-shift tijdens load (skeleton in skill-stijl).
- Toegankelijk: screenreader leest datum + tijd + lestype in logische volgorde.
```

---

# B — Member app

## B1. Dashboard — `/app`

**Doel:** "Wat moet ik vandaag weten?" — eerstvolgende boeking, snelle boek-toegang, abbo-status.

```markdown
[plak universele preamble]

Scherm B1: Member dashboard op `/app` (auth required — zelf checken via Supabase server client, geen route-group gebruik tot we 'm invoeren).

Features:
- Hero: "Hallo {voornaam}" + eerstvolgende geboekte sessie (datum, tijd, lestype, trainer).
- Als geen komende sessie: CTA "Boek je eerste les" → B2.
- Tiles: "Credits deze maand: X/Y" (abbo-afhankelijk), "Komende sessies: N".
- Health intake reminder als `profiles.health_intake_completed_at IS NULL` — prominente banner met link naar B6.
- Recente aankondigingen (als er een `announcements` tabel of Sanity-doc is — anders weglaten).
- Responsive: desktop tweekolommaal, mobiel gestapeld.

Design:
- Stitch "Member dashboard" voor layout.
- Skill: `<Greeting>`, `<NextSessionCard>`, `<StatTile>`, `<AlertBanner variant="info">` — check welke bestaan.
- Één champagne-accent: de eerstvolgende sessie-card rand of CTA.

Data:
- Server component. Fetch:
  - `profiles` van huidige user (incl. `health_intake_completed_at`, `first_name`).
  - Volgende `bookings` join `class_sessions` waar `class_sessions.start_at > now()` en `bookings.profile_id = user`, order by `start_at` asc limit 1.
  - Count komende bookings.
  - `memberships` actief voor credits-afgeleiden.

Acceptatie:
- Uitgelogd: redirect naar `/login`.
- Zonder boeking: empty state werkt.
- Zonder health intake: banner zichtbaar; na voltooiing verdwijnt hij.
- Laadt in < 1s op Vercel productie (server component, geen waterfalls).
```

---

## B2. Rooster + boeken — `/app/rooster`

**Doel:** kernfunctie. Leden zien week-rooster en boeken of cancellen sessies.

```markdown
[plak universele preamble]

Scherm B2: Rooster met boek-functionaliteit op `/app/rooster`.

Features:
- Week-kalender, vandaag default. Pijlen voor vorige/volgende week.
- Per sessie: lestype, tijd, duur, trainer, X/Y deelnemers, mijn status ("Geboekt" / "Wachtlijst" / "Boek").
- Klik op sessie → dialog/sheet met: beschrijving, trainer bio (kort), deelnemersaantal, boek/cancel knop.
- **Boek-logica (server action `createBooking`):**
  - Check abbo-rechten (credits, lestype-toegang).
  - Check capaciteit — zo niet, bied wachtlijst aan.
  - Retourneer nieuwe booking of error.
- **Cancel-logica (server action `cancelBooking`):**
  - Binnen cancel-window: credit terug, waitlist-promote trigger.
  - Buiten window: no credit back, member zien waarschuwing vooraf.
- Optimistic UI voor boek/cancel, revalidate path bij succes.
- Filter: lestype chips, zoals A1.

Design:
- Stitch "Rooster + boeken" (member variant) voor layout en sheet-patroon.
- Skill: `<WeekNavigator>`, `<SessionTile>`, `<BookingSheet>`, `<Button>` variants. Check ui_kits/member.
- Status-badges via skill color tokens (niet rood/groen — gebruik skill's semantic variants).

Data:
- Zie tmc-member-system.md §6 (booking-logica) en §3 (rechten-engine).
- Types uit `types/supabase.ts` voor `class_sessions`, `bookings`, `memberships`.
- Server action roept eventueel RPC `rpc_create_booking(session_id)` die alle checks atomair doet — als gespecificeerd, gebruiken.

Acceptatie:
- Boek + cancel werkt met juiste RLS (member kan alleen eigen bookings maken/cancellen).
- Capaciteit + waitlist-flow werkt.
- Cancel-window wordt gerespecteerd (test: sessie > 24u weg = credit terug, < 24u = geen credit).
- Toegankelijk vanaf B1 "Boek een les" CTA.
- Geen dubbele bookings mogelijk (DB unique constraint óf RPC-check).
```

---

## B3. Eigen boekingen — `/app/boekingen`

**Doel:** overzicht komend + historie, cancel vanuit historie-context.

```markdown
[plak universele preamble]

Scherm B3: Eigen boekingen op `/app/boekingen`.

Features:
- Twee tabs: "Komend" (default) en "Geschiedenis".
- Komend: lijst van boekingen waar `start_at > now()`, sort asc. Cancel-knop per item.
- Geschiedenis: `start_at <= now()`, sort desc, met status (Bijgewoond / No-show / Geannuleerd).
- Lege states per tab.
- Filter geschiedenis op jaar/maand (optioneel — alleen als makkelijk).

Design:
- Stitch "Mijn boekingen" voor layout en lege state.
- Skill: `<Tabs>`, `<BookingRow>`, `<Badge>` met skill-tokens voor status-kleuren.
- Geen nieuwe tab-component bouwen als `<Tabs>` in skill staat.

Data:
- Server component + client action voor cancel (hergebruik `cancelBooking` uit B2).
- Paginate geschiedenis bij > 50 items.

Acceptatie:
- Cancel werkt en update direct de lijst (revalidate + optimistic).
- No-show status wordt correct getoond (bepaald door admin in C3).
- Deeplink naar sessie-detail werkt (optioneel: klik op rij → opent sheet met sessie-info).
```

---

## B4. Abonnement — `/app/abonnement`

**Doel:** abbo-status, credits, rittenkaart-saldo, pauze-verzoek, opzeggen.

```markdown
[plak universele preamble]

Scherm B4: Abonnement op `/app/abonnement`.

Features:
- Huidige abbo: naam, prijs, start, eerstvolgende factuurdatum.
- Credits / rittenkaart-saldo (afhankelijk van abbo-type).
- Pauze-verzoek: dialog met datum-range en reden. Creëert rij in `pause_requests` met status `pending`.
- Opzegverzoek: dialog met opzegdatum (minimaal einde lopende periode). Creëert `cancellation_requests`. Niet direct cancellen in DB — admin bevestigt.
- Upgrade/downgrade naar ander abbo (dialog met tier-keuze, redirect naar Mollie voor mandate-update).
- Historie: vorige abbo's in accordeon onderaan.

Design:
- Stitch "Abonnement" voor layout.
- Skill: `<Card>`, `<Dialog>`, `<DatePicker>`, `<Select>`. Geen nieuwe modal-patterns bouwen.
- Pauze- en opzegknoppen secundair/tertiair gestyled — niet per ongeluk highlighten.

Data:
- `memberships` actief + historisch, `pause_requests`, `cancellation_requests`.
- Server actions: `requestPause`, `requestCancellation`, `changeMembership`.

Acceptatie:
- Pauze-verzoek landt in admin cockpit (C4/C5).
- Opzegging triggert geen directe DB-wijziging — alleen een verzoek.
- Mollie mandate-update flow eindigt terug op dit scherm met success/error state.
- Copy over opzegtermijn klopt met algemene voorwaarden (flaggen als je ze niet kunt verifiëren).
```

---

## B5. Facturen — `/app/facturen`

**Doel:** downloadbare facturen, betaalstatus, Mollie mandate.

```markdown
[plak universele preamble]

Scherm B5: Facturen op `/app/facturen`.

Features:
- Lijst van facturen: datum, bedrag, status (betaald/openstaand/gefaald), download-knop.
- Klik "Download" → server route die de factuur-PDF serveert (bestaande endpoint hergebruiken als aanwezig, anders Stripe/Mollie invoice URL).
- Openstaand met gefaalde betaling: prominente CTA "Betaal nu" → Mollie payment page.
- Mollie mandate status onderaan: "Automatische incasso actief" / "Mandaat vernieuwen" met link.

Design:
- Stitch "Facturen" voor tabel-layout.
- Skill: `<Table>` of `<DataList>` — check wat de skill biedt voor dichtere data-weergave.
- Status-badges: skill semantic tokens (success/warning/danger).

Data:
- `invoices` tabel + join `payments`. Mollie-API niet client-side raken.
- Server action `createPaymentRetry(invoice_id)` voor gefaalde betalingen.

Acceptatie:
- Download werkt en PDF is correct toegeschreven aan member.
- Gefaalde betaling is visueel duidelijk maar niet alarmerend (skill warning, geen rood).
- Mandate-info matched Mollie realiteit (live check of cached < 1 uur).
```

---

## B6. Profiel + health intake — `/app/profiel`

**Doel:** persoonsgegevens, health intake (verplicht voor eerste sessie), emergency contact.

```markdown
[plak universele preamble]

Scherm B6: Profiel op `/app/profiel`.

Features:
- Avatar upload (Supabase storage bucket `avatars`, RLS op eigenaar).
- Inline-editable velden: voornaam, achternaam, telefoon, geboortedatum, adres.
- Emergency contact: naam, telefoon, relatie.
- Health intake sectie:
  - Prominent banner als `health_intake_completed_at IS NULL`.
  - Multi-step form: blessures, medicatie, zwangerschap, doelen, ervaring.
  - Bij voltooien: update `health_intake_completed_at` en `health_intake_data` (jsonb).
  - Na voltooiing: compacte weergave met laatste update-datum en "Bijwerken" knop.
- Marketing opt-in toggle (syncht met MailerLite — server action).
- Account verwijderen onderaan, klein grijs, met bevestigingsdialog + 30-dagen grace-periode melding (AVG).

Design:
- Stitch "Profiel" en "Health intake" schermen voor layout (mogelijk twee Stitch-schermen samen).
- Skill: `<Form>`, `<Input>`, `<Textarea>`, `<Switch>`, `<Stepper>` indien multi-step intake.
- Health intake moet aanvoelen als gesprek, niet een medisch formulier — skill heeft vermoedelijk een "Interview" of "Conversational form" pattern.

Data:
- `profiles` tabel. `health_intake_data` is jsonb voor flexibiliteit; schema valideren server-side met zod.
- Account-verwijder: soft delete via `profiles.deleted_at`, cron job na 30 dagen hard delete.

Acceptatie:
- Avatar upload werkt en is RLS-beschermd.
- Health intake kan opgeslagen, tussenopgeslagen (draft), en later hervat.
- Bij voltooiing verdwijnt banner op B1 en is boeken niet meer geblokkeerd (als dat een gate is — check §3 van spec).
- MailerLite-sync werkt bidirectioneel (opt-in/out).
- Account-verwijderen triggert bevestigings-email.
```

---

## B7. PT-boeking — `/app/pt`

**Doel:** 1-op-1 of duo-sessie bij specifieke trainer boeken, met rittenkaart-optie.

```markdown
[plak universele preamble]

Scherm B7: PT-boeking op `/app/pt`.

Features:
- Stap 1: trainer kiezen. Marlon krijgt "Head Trainer" badge + premium prijs. Andere trainers standaard.
- Stap 2: format (1-op-1 / Duo / Small Group max 4).
- Stap 3: losse sessie of rittenkaart (10% lidkorting bij rittenkaart). Prijzen via `trainer_rates` of Sanity `ptPricing`.
- Stap 4: beschikbare slots uit trainer-agenda (`trainer_availability` tabel).
- Stap 5: bevestiging → Mollie redirect voor losse / rittenkaart, of direct boeken als credits aanwezig.
- Edge: eerste sessie bij een niet-Marlon trainer → intake-korting tonen (eenmalig).

Design:
- Stitch "PT boeking flow" voor stappen-layout.
- Skill: `<Stepper>`, `<TrainerCard>`, `<PriceLabel>`. Geen nieuwe stepper bouwen.
- Marlon-highlight: champagne rand of badge — maar maximaal 1 champagne-element per viewport.

Data:
- Server actions voor slot-reserve (tijdelijke hold van 10 min tot betaling), `createPtBooking`, `redirectToMollie`.
- `pt_bookings` tabel met status (pending/confirmed/completed/cancelled).

Acceptatie:
- Slot wordt gereserveerd tijdens checkout, vrijgegeven na timeout of annulering.
- Eerste-keer-korting wordt eenmalig toegepast per trainer per member.
- Rittenkaart-saldo updatet correct na aankoop.
- Terug na Mollie redirect toont bevestigingsscherm.
```

---

# C — Admin cockpit (rol: admin)

**Algemeen voor C1-C6:** desktop-first, minimaal 1280px. Tablet 768px werkbaar. Sidebar nav, compactere typografie dan member app — skill heeft waarschijnlijk `<AdminShell>` of admin-variant van componenten.

## C1. Admin dashboard — `/app/admin`

```markdown
[plak universele preamble]

Scherm C1: Admin dashboard op `/app/admin` (RLS: alleen `profile.role = 'admin'`).

Features:
- 4 KPI-cards: Actieve leden, MRR, Bezetting deze week, No-show rate.
- Bar chart: bezetting per dag deze week.
- Activity feed (rechts): recente inschrijvingen, opzeggingen, gefaalde betalingen.
- Quick-access tiles: "Pauze-verzoeken (N)", "Openstaande facturen (N)", "Vandaag's sessies (N)".
- Alle tegels klikbaar → respectievelijke detail-schermen.

Design:
- Stitch "Admin dashboard" layout.
- Skill admin-variant: `<AdminShell>`, `<KpiCard>`, `<BarChart>` (recharts wrapper), `<ActivityFeed>`.
- Champagne-accent alleen op positieve trends (↑ MRR), geen rode alarm-kleuren — skill warning variant.

Data:
- Views of RPC's voor KPI's (vermijd zware queries in UI). Check of `vw_admin_kpis` of RPC's bestaan; anders flaggen en tijdelijk in server component aggregeren.
- Revalidate elke 5 minuten, of `force-dynamic` met korte cache.

Acceptatie:
- Uitgelogd of niet-admin → 404 (niet 403, privacy).
- KPI-kliks navigeren naar juiste detail.
- Tablet-breedte werkt, sidebar collapse naar icon-only.
```

---

## C2. Rooster editor — `/app/admin/rooster`

```markdown
[plak universele preamble]

Scherm C2: Rooster editor op `/app/admin/rooster`.

Features:
- Week-view kalender (horizontale tijdsslots, à la Google Calendar).
- Elke sessie: lestype, trainer-initialen, X/Y deelnemers.
- Klik sessie → sidepanel rechts met: trainer-swap, capacity +/-, cancel (met reden + optioneel mail), admin notes, "Deelnemerslijst" → opent C3.
- Bovenbalk: "Nieuwe sessie" (ad-hoc buiten template), "Bulk acties" (cancel hele dag), "Template beheren" → link naar Sanity Studio.
- Undo/redo voor destructieve acties (optioneel — skill heeft mogelijk `<Toast action>`).

Design:
- Stitch "Rooster editor" voor het sidepanel-patroon.
- Skill: `<CalendarGrid>`, `<SessionBlock>`, `<Sheet side="right">`, `<Combobox>`.
- Sessies met 0 deelnemers visueel subtieler (skill muted token), volle sessies champagne-rand.

Data:
- `class_sessions`, `bookings`, `trainers` — mutations via server actions met optimistic revalidate.
- Cancel triggert waitlist-promote cron of directe reshuffle — check §6 spec.

Acceptatie:
- Swap trainer werkt, bestaande boekingen blijven.
- Cancel stuurt mail (Resend) naar geboekte members met keuze (credit terug ja/nee).
- Capacity verkleinen onder huidige boekingen → bevestiging vereist (bumpt wie eruit gaat).
- Sidepanel sluit bij Escape en bij buiten klikken.
```

---

## C3. Deelnemerslijst per sessie

```markdown
[plak universele preamble]

Scherm C3: Deelnemerslijst per sessie — bereikt via C2 sidepanel OF via D2 (trainer).

Features:
- Sessie-header: datum, tijd, lestype, trainer.
- Lijst deelnemers: avatar, naam, abbo-type badge, checkbox aanwezigheid.
- Admin extra: "Credit terugzetten" per deelnemer (voor uitzonderingen buiten cancel-window).
- Footer: "Opslaan" + "Auto-mark no-shows" (na les-einde markeert unchecked als no-show).
- Export CSV voor admin (optioneel).

Design:
- Stitch "Deelnemerslijst" voor rij-layout.
- Skill: `<DataList>`, `<Checkbox>`, `<Avatar>`, `<Badge>` voor abbo-types.
- Bruikbaar als embedded panel (binnen C2 sheet) én als volledige pagina (`/app/admin/sessies/[id]` en `/app/trainer/sessies/[id]`).

Data:
- Server action `markAttendance(session_id, attendances[])` atomair.
- `refundCredit(booking_id)` aparte server action met audit log.

Acceptatie:
- Aanwezigheid opslaan werkt zonder full page reload.
- Audit log voor credit-refunds (wie, wanneer, waarom).
- Als prop `embedded={true}` → geen page chrome, alleen content (voor C2 sheet).
- Trainer ziet dezelfde UI maar zonder credit-refund knop (RLS + UI gate).
```

---

## C4. Ledenbeheer — `/app/admin/leden`

```markdown
[plak universele preamble]

Scherm C4: Ledenbeheer op `/app/admin/leden`.

Features:
- Tabel: naam, abbo, status (actief/pauze/opgezegd), credits, laatste sessie, MRR-bijdrage.
- Zoekbalk (naam/email).
- Filters: abbo-type, status, inactief (> 30 dagen geen sessie).
- Klik rij → C5 lid-detail.
- Bulk acties: export CSV, mass-email (via MailerLite segment trigger).

Design:
- Stitch "Ledenbeheer" tabel-layout.
- Skill: `<DataTable>` (TanStack-based als aanwezig), `<FilterBar>`, `<SearchInput>`.
- Geen zebra-rijen — skill gebruikt rustige scheiding via borders.

Data:
- View `vw_member_overview` ideaal; anders server-side aggregeren met pagination (50 per pagina).
- Server-side filtering/sorting (niet clientside — kan groot zijn).

Acceptatie:
- 500 leden laadt binnen 1s (pagination).
- Filters bundelen in URL query params (shareable).
- Sortering persistent per sessie.
```

---

## C5. Lid detail — `/app/admin/leden/[id]`

```markdown
[plak universele preamble]

Scherm C5: Lid-detail op `/app/admin/leden/[id]`.

Features:
- Header: avatar, naam, contact, abbo-badge, status.
- Tabs: Overzicht / Boekingen / Facturen / Health intake / Notities (admin-only).
- Overzicht: sleutel-stats (totaal sessies, favoriete lestype, laatste sessie, MRR).
- Boekingen: zelfde data als B3 maar admin-view (met no-show override).
- Facturen: zelfde als B5, admin kan handmatig herverwerken.
- Health intake: read-only weergave van `health_intake_data`, kritisch info (blessures) prominent.
- Notities: admin-only veld, geschiedenis van notities (append-only).
- Acties-menu rechtsboven: "Pauze toekennen", "Credits toevoegen", "Abonnement wijzigen", "Account verwijderen" (met dubbele bevestiging).

Design:
- Stitch "Lid detail" voor tab-layout.
- Skill: `<Tabs>`, `<Timeline>` voor notities, `<DescriptionList>` voor overzicht.
- Blessure-badge (rood? nee — skill warning token, subtiel).

Data:
- Alle mutations via audit-logged server actions.
- Notities in `member_notes` tabel met `created_by` en `created_at`.

Acceptatie:
- Alle acties zijn ongedaan-baar of vereisen dubbele bevestiging.
- Audit log zichtbaar (wie deed wat wanneer) in Notities tab of aparte sub-tab.
- Health intake blessures hoogst zichtbaar voor trainer die dit scherm opent.
```

---

## C6. Trainers — `/app/admin/trainers`

```markdown
[plak universele preamble]

Scherm C6: Trainerbeheer op `/app/admin/trainers`.

Features:
- Lijst trainers: naam, rol (Head Trainer / Trainer / Stagiair), actief ja/nee, uren deze maand.
- Klik → detail: profiel, specialisaties, beschikbare uren template, urenregistratie-historie.
- Urenregistratie: trainer voert in, admin keurt goed. Weergave per week met goedkeur-knoppen.
- Nieuwe trainer toevoegen: naam, email (magic link invite), rol, specialisaties.

Design:
- Stitch "Trainers" voor lijst en detail-weergave.
- Skill: `<DataList>`, `<Drawer>` voor detail (ipv volledige route).
- Urenregistratie als week-grid (à la timesheet) — check of skill hier een pattern voor heeft.

Data:
- `trainers` tabel koppelt aan `profiles` met role `trainer`.
- `trainer_hours` (date, hours, status pending/approved).

Acceptatie:
- Trainer-uitnodiging stuurt magic link email.
- Urenregistratie-goedkeuring triggert geen payroll actie (dat is buiten scope) — alleen status update.
- Trainer met 0 uren deze week zichtbaar gemarkeerd.
```

---

# D — Trainer view (rol: trainer)

## D1. Trainer dashboard — `/app/trainer`

```markdown
[plak universele preamble]

Scherm D1: Trainer dashboard op `/app/trainer`.

Features:
- "Vandaag": eigen sessies vandaag (tijd, lestype, X/Y deelnemers, snelle link naar deelnemerslijst).
- "Deze week": overzicht totaal uren + sessies.
- Urenregistratie CTA: "Uren invoeren voor afgelopen week".
- Aankondigingen (als aanwezig).

Design:
- Stitch "Trainer dashboard" (simpeler dan admin).
- Skill: `<SessionList>`, `<StatTile>`, zelfde primitives als B1 maar met trainer-context.

Data:
- `class_sessions` waar `trainer_id = current user`.
- RLS zorgt dat trainer alleen eigen data ziet.

Acceptatie:
- Geen admin-features zichtbaar.
- Klik op sessie → D2.
```

---

## D2. Trainer sessies + aanwezigheid — `/app/trainer/sessies/[id]`

```markdown
[plak universele preamble]

Scherm D2: Trainer-variant van deelnemerslijst op `/app/trainer/sessies/[id]`.

Features:
- Volledige schermversie van C3 zonder admin-only acties.
- Mobiel-first (trainer gebruikt telefoon in de studio).
- Grote aanraakbare checkboxes voor aanwezigheid.
- Read-only health-flags per deelnemer (blessure-badge zichtbaar maar geen detail — alleen dat er iets is en klikbaar naar uitgebreid overzicht als daarvoor rechten bestaan).

Design:
- Stitch "Trainer attendance" voor mobiele layout.
- Skill: dezelfde `<DataList>` maar met `density="comfortable"` en grotere tap-targets.
- Geen sidebar — fullscreen mobiel.

Data:
- Hergebruik `markAttendance` server action uit C3.
- Blessure-info alleen zichtbaar als trainer `has_health_access = true` op profiel.

Acceptatie:
- Werkt single-handed op telefoon.
- Auto-save per checkbox (niet wachten op "Opslaan" knop).
- Offline graceful: toont cached data, queued writes bij reconnect (optioneel — flaggen als scope te groot).
```

---

# Post-implementatie

## Design consistentie-check (één keer, na alle 17 schermen)

```markdown
[plak universele preamble]

Doe een consistentie-sweep over alle 17 geïmplementeerde schermen:

1. Scan alle bestanden onder `src/app/app/**`, `src/app/login/**`, `src/components/member/**` en `src/components/admin/**`.
2. Zoek naar: hardcoded hex-waardes, inline styles (behalve dynamisch), font-size/spacing-waardes buiten skill tokens.
3. Check of elke pagina server component is waar mogelijk.
4. Check dat alle form-fields dezelfde validation-stijl gebruiken (skill form-pattern).
5. Check empty/loading/error states op elke pagina.
6. Rapporteer in een tabel: scherm, issue, voorstel. Geen code wijzigen zonder mijn go per item.
```

## Toegankelijkheid-sweep

```markdown
[plak universele preamble]

Loop de 17 schermen door op a11y:

1. Keyboard-only navigatie over elke primaire flow.
2. Focus-rings zichtbaar en skill-consistent.
3. Aria-labels op icon-only buttons.
4. Contrastratio tenminste AA op alle tekst.
5. Form-errors aangekondigd voor screenreaders (aria-live).

Rapporteer per scherm met severity (blocker/major/minor). Fix alleen blockers zonder overleg.
```

---

## Werkwijze per PR

1. Commit 1: skill + spec gelezen, reconciliatie-tabel in PR-beschrijving.
2. Commit 2: structurele wiring (routes, data fetching, types).
3. Commit 3: UI met skill-componenten.
4. Commit 4: states (loading/empty/error) + a11y.
5. Commit 5: copy finetune + TODO's voor Marlon gemarkeerd.
6. PR-beschrijving bevat changelog en openstaande vragen.

Eén scherm = één PR = één review-sessie. Niet batchen tenzij twee schermen onlosmakelijk zijn (C2 ↔ C3 sidepanel-embed kan samen).
