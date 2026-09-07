# Evaluatie: ledenomgeving, trainer-oppervlak en admin-cockpit

Read-only beoordeling langs de zeven assen uit de evaluatieopdracht. Fase 1 (de routekaart) staat
in `docs/inventaris-admin-leden.md` en wordt hier niet herhaald.

Datum: 2026-07-25. Branch: `docs/evaluatie-admin-leden`, afgetakt van `main` (`bab4894`).
Geen code, geen migraties, geen `db push`: alle bevindingen komen uit code-lezing en read-only
queries op de live database.

---

## 1. Samenvatting

Het systeem is functioneel verder dan de specs suggereren en de zware machinerie zit goed in
elkaar: de order-pijplijn, de lifecycle-RPC's en de boek-gate zijn zorgvuldig gebouwd, met
rijlocks, idempotentie en een audit-spoor. De problemen zitten vrijwel allemaal in de laatste
schakel: de voorkant die de gebouwde laag ontsluit. Meerdere afgeronde backends hebben geen
scherm, en drie routes zijn alleen via een handmatig ingetypte URL te bereiken.

De drie zwaarste bevindingen:

1. **Een geplande abonnementswijziging is onzichtbaar en niet te annuleren** (P1, GEDEELD-2). Bij
   het indienen gaat het Mollie-incassobedrag direct omhoog, maar geen enkel scherm leest
   `membership_change_requests`, en de bestaande annuleer-RPC heeft nul aanroepers. Een verkeerd
   ingediende upgrade is alleen via de database terug te draaien.
2. **Een gedeactiveerde trainer behoudt aanwezigheidsrechten** (P1, TRAINER-1). `is_active` wordt
   door de aanwezigheidsgate niet gelezen, terwijl de PT-gate hem wel afdwingt. Twee definities
   van "werkende trainer" in hetzelfde systeem.
3. **De opvolging van mislukte betalingen loopt dood op een 404** (P1, ADMIN-1). De tegel telt
   `failed`, `expired` en `open` payments en linkt naar `/app/admin/facturen`, een route die niet
   bestaat; de activiteitenfeed is niet klikbaar en de ledenfilter dekt maar een deel van die set.

Daarnaast is `/app/vrij-trainen` volledig onbereikbaar geworden, lekken ruwe databasecodes door
in Nederlandse admin-copy, en is de PIN-keten op `/checkin` inmiddels gedicht (PR #130).

---

## 2. Uitgangspunt

Routekaart, auth-model, RPC-inventaris en de datalaag: zie `docs/inventaris-admin-leden.md`.
De nummering hieronder verwijst waar nuttig naar de waarnemingen in §6 van dat document.

---

## 3. Bevindingen

### 3.1 Gedeeld

#### GEDEELD-1. De check-in-PIN was de enige poort naar aanwezigheids- en creditmutaties

- **Severity:** P1
- **Zeker weten:** hoog
- **Bewijs:** `src/app/checkin/page.tsx:6-10`, `src/lib/check-in/admin-lock.ts:17-47`,
  `src/lib/check-in/actions.ts:821-843`, `src/lib/check-in/admin-queries.ts:25-39`,
  `pg_get_functiondef(tmc.verify_admin_checkin_pin)`

`/checkin` is een publieke route zonder auth. De server action `unlockAdminMode` had geen enkele
rolcheck en geen pogingenlimiet, en `tmc.verify_admin_checkin_pin` was SECURITY DEFINER met een
`EXECUTE`-grant voor `anon` en PUBLIC, zonder interne gate, waardoor de PIN ook stil via
PostgREST met de publieke anon-key te raden was. De cookie die daaruit volgde was via de
`isAdminUnlocked()`-tak van `requireStaff()` de enige poort naar vijf functies:
`checkInByProfileId` (aanwezigheid op een willekeurig profiel), `undoCheckIn` (verwijdert een
`check_ins`-rij en boekt bij `access_type = 'credit'` een rit terug via
`adjust_membership_credits`, dus een creditmutatie), `createWalkInProfile` (maakt een auth-user
plus profiel), `getTodayCheckIns`, en `searchProfiles`. Die laatste is de zwaarste kant: hij
geeft voornaam, achternaam, e-mail, telefoon en member_code van maximaal 20 leden terug, en
levert precies de profile-id's die `checkInByProfileId` nodig heeft, zodat de keten zichzelf
draagt. Een gedeelde cijfercode van vier tot zes tekens stond daarmee tussen het open internet en
zowel de aanwezigheidsregistratie als een AVG-relevante ledenlijst.

**Aanbeveling:** afgehandeld en gemerged in PR #130 (REVOKE plus lockout live). Niet opnieuw
aanpakken. Eén open punt, niet onderzocht: de throttle telt per client-IP uit `x-forwarded-for`;
als die header op Vercel door de aanroeper beïnvloedbaar is, is de lockout te omzeilen door de
header te rotaten, en zit dezelfde IP-bepaling ook in `src/lib/actions/trial-code-booking.ts`.

#### GEDEELD-2. Een ingediende abonnementswijziging is nergens zichtbaar en niet te annuleren

- **Severity:** P1
- **Zeker weten:** hoog
- **Bewijs:** `src/lib/admin/membership-lifecycle.ts:589` (Mollie-bedrag direct omhoog),
  `src/lib/admin/membership-lifecycle.ts:640-660` (`cancelMembershipChangeCore`), repo-brede
  zoekactie op `membership_change_requests` levert alleen
  `src/app/api/cron/process-change-requests/route.ts:12,30` op

De tabel `tmc.membership_change_requests` wordt door geen enkele pagina of query-module gelezen.
Bij het indienen van een upgrade verhoogt de TS-laag onmiddellijk het Mollie-abonnementsbedrag
(`membership-lifecycle.ts:589`), terwijl de entitlements pas op de factuurdatum wisselen via de
cron. Tussen die twee momenten bestaat het verzoek dus wel financieel, maar is het voor niemand
zichtbaar: niet voor het lid op `/app/abonnement`, niet voor Marlon op de ledendetailpagina. De
annuleerweg is volledig gebouwd tot aan de voorkant, want de RPC
`cancel_membership_change_request` bestaat en `cancelMembershipChangeCore` roept hem correct aan
met een Mollie-terugzet, maar die functie heeft nul aanroepers buiten zijn eigen bestand. Klikt
Marlon per ongeluk de verkeerde upgrade aan, dan is de incasso van het lid verhoogd en is de
enige remedie een handmatige RPC-aanroep op de database.

**Aanbeveling:** kleinste ingreep is een dunne server action om
`cancelMembershipChangeCore` heen plus een regel op `/app/admin/leden/[id]` die de openstaande
`membership_change_requests`-rij toont met een annuleerknop, in hetzelfde patroon als de bestaande
`ActionMenu`-dialogen. Geen nieuwe RPC of migratie nodig.

#### GEDEELD-3. Ruwe databasecodes lekken door in Nederlandse admin-copy

- **Severity:** P2
- **Zeker weten:** hoog
- **Bewijs:** `src/lib/admin/membership-lifecycle.ts:194,340,443,574,663`

Vijf lifecycle-functies bouwen hun weigeringsboodschap op als
`` `De pauze is geweigerd (${result?.reason ?? "onbekende reden"}).` ``. Wat Marlon dan leest is
"De stopzetting is geweigerd (not_cancellable_plan)" of "De wijziging is geweigerd
(lock_in_active)". Dat is niet alleen lelijk, het is ook onbruikbaar: de codes vertellen niet wat
zij moet doen, en de foutsituaties waar dit optreedt (lock-in nog actief, plan niet stopzetbaar,
pauze loopt) zijn precies de gevallen waarin zij een lid aan de telefoon heeft. De WS-ledger
noemt alleen `lock_in_active` als open punt; het patroon is breder en raakt alle vijf de acties.

**Aanbeveling:** één `Record<string, string>`-map van reason-code naar Nederlandse zin, gedeeld
door de vijf plekken, met de bestaande interpolatie als fallback voor onbekende codes.

#### GEDEELD-4. Crowdfunding-resten in de database

- **Severity:** P3
- **Zeker weten:** hoog
- **Bewijs:** `pg_class` in schema `tmc`: `crowdfunding_backers`, `crowdfunding_stats`,
  `crowdfunding_tiers`; `pg_proc`: `increment_cf_stats` (twee overloads), `increment_cf_tier_slot`

De endpoints en helpers zijn verwijderd in `bab4894`, maar de drie tabellen en drie functies
staan nog in de database. Ze hebben geen aanroepers meer in de applicatie. Het risico is laag en
vooral cognitief: iemand die het schema leest, ziet een module die niet meer bestaat.

**Aanbeveling:** opruimen in een aparte forward-migratie. Dat valt expliciet buiten deze
read-only opdracht en ik heb dus geen migratie opgesteld. Controleer vóór het droppen of er nog
historische backer-data in zit die bewaard moet blijven.

### 3.2 Leden

#### LEDEN-1. `/app/vrij-trainen` is via de interface onbereikbaar

- **Severity:** P1
- **Zeker weten:** hoog
- **Bewijs:** repo-brede zoekactie op `vrij-trainen` binnen `src/` levert nul `href`-treffers naar
  deze route; `src/app/app/rooster/page.tsx:244` en `:595` zijn uitsluitend toelichtende
  comments; `src/components/nav/MemberNav.tsx:35-56` bevat geen item

De nav-cleanup heeft het "Vrij trainen"-tabblad verwijderd in de veronderstelling dat de ingang
via een link op `/app/rooster` liep. Die link bestaat niet en heeft blijkens de code ook nooit
bestaan; op de aangewezen plek staan alleen twee comments die uitleggen dat vrij trainen een
eigen pagina heeft. `CLAUDE.md` bevestigt dezelfde onjuiste aanname. Het gevolg is dat een lid
met een Vrij Trainen-abonnement of All Access, dus een entitlement waarvoor het betaalt, de
bijbehorende pagina alleen bereikt door de URL in te typen. Dit is niet hetzelfde als het bekende
`/app/producten`-issue: die tab staat er inmiddels wel (`MemberNav.tsx:53`).

**Aanbeveling:** één link op `/app/rooster` toevoegen, precies zoals de comment op regel 244
beschrijft, of het item terugzetten in het Meer-menu achter dezelfde
`covered_pillars`-conditie die er eerder op zat.

#### LEDEN-2. Betalingshistorie heeft geen navigatie-ingang

- **Severity:** P2
- **Zeker weten:** hoog
- **Bewijs:** `src/app/app/abonnement/page.tsx:280` is de enige in-app link;
  `src/components/nav/MemberNav.tsx:65` noemt `/app/facturen` alleen in `MORE_PATHS` voor
  actief-markering, niet als menu-item

Facturen en mandaatstatus zijn alleen te vinden via een `QuietLink` onderaan de
abonnementspagina, of via de link in de `payment_failed`-mail. Een lid dat zijn betalingsgeschie-
denis wil nazoeken zonder dat er iets misging, moet dus eerst naar Account en instellingen en
daar naar beneden scrollen. Het Meer-menu heeft ruimte en de route staat al in de
actief-markeringslijst, wat suggereert dat het item ooit bedoeld was.

**Aanbeveling:** `/app/facturen` als item toevoegen aan `MemberMoreMenu.tsx`, onder Account en
instellingen.

#### LEDEN-3. Lidmaatschapsacties verdwijnen zonder uitleg

- **Severity:** P2
- **Zeker weten:** midden
- **Bewijs:** `src/app/app/abonnement/_components/MembershipActions.tsx:30`
  (`if (!canPause && !canCancel) return null;`), afleiding in
  `src/app/app/abonnement/page.tsx:209-214`

`canCancel` dekt `active`, `paused` en `payment_failed`; `canPause` dekt `active` en `paused`.
Voor elke andere status, met name `cancellation_requested`, rendert het hele actieblok niets. Het
lid ziet dan wel de statusregel en de einddatum in de herokaart, maar geen enkele aanwijzing over
wat het nog kan doen of bij wie het moet zijn om de opzegging terug te draaien. Dat terugdraaien
bestaat wel, maar is per besluit uit lifecycle-fase 2C admin-only, dus het lid moet contact
opnemen; nergens staat dat. Ik zet dit op midden omdat ik de conditie en de component heb
gelezen, maar niet elke statusvariant gerenderd heb gezien.

**Aanbeveling:** in plaats van `return null` een korte regel tonen met de reden en een link naar
`/app/support`.

#### LEDEN-4. Zes ledenroutes zonder laadstaat

- **Severity:** P3
- **Zeker weten:** hoog
- **Bewijs:** geen `loading.tsx` in `src/app/app/producten`, `src/app/app/schema`,
  `src/app/app/schema/[dayId]/workout`, `src/app/app/schema/geschiedenis`,
  `src/app/app/profiel/intake`, `src/app/app/abonnement/bedankt`

Alle zes zijn `force-dynamic` met server-side reads, dus ze tonen een lege viewport tot de server
klaar is. Op mobiel over 4G is dat precies het moment waarop iemand nog een keer tikt.
`/app/producten` en `/app/abonnement/bedankt` zijn de gevoeligste: dat zijn koop- en
bevestigingsschermen. De rest van de ledenomgeving heeft consequent wel een `loading.tsx` met
`PageSkeleton`, dus het patroon bestaat al.

**Aanbeveling:** het bestaande `PageSkeleton`-patroon kopiëren naar deze zes directories.

#### LEDEN-5. De ISO-weekberekening staat in drie kopieën en leunt op de servertijdzone

- **Severity:** P3
- **Zeker weten:** midden
- **Bewijs:** `src/app/app/rooster/page.tsx:78-95` (met eigen comment "bewust een derde kopie"),
  plus de kopieën in `src/app/app/vrij-trainen/page.tsx` en `softWeeklyCapCheck` in
  `src/lib/member/booking-actions.ts`; DB-kant in
  `pg_get_functiondef(tmc.book_class_session)`: `(v_session.start_at at time zone 'utc')::date`

`getIsoWeekYear()` bouwt zijn datum uit `date.getFullYear()`, `getMonth()` en `getDate()`, dus uit
de lokale tijd van de runtime, en interpreteert die vervolgens als UTC. Op Vercel draait de server
in UTC, waardoor dit toevallig samenvalt met de vaste UTC-basis van `book_class_session`. In elke
runtime die niet op UTC staat, zoals een lokale ontwikkelmachine in Amsterdam, kunnen de
TS-prefilter en de DB-gate in een andere week uitkomen en toont het rooster een weeklimiet die de
RPC niet deelt. De drievoudige kopie is in de code als bewust gemarkeerd, maar vergroot wel de
kans dat een toekomstige correctie er maar twee raakt. Midden, omdat ik het verschil niet in een
draaiende non-UTC-omgeving heb waargenomen.

**Aanbeveling:** de drie kopieën vervangen door één helper in `src/lib/scheduling/`, en die
helper de datum expliciet uit UTC laten afleiden in plaats van uit de lokale tijd.

### 3.3 Trainer

#### TRAINER-1. Een gedeactiveerde trainer behoudt toegang tot aanwezigheid en gastregistratie

- **Severity:** P1
- **Zeker weten:** hoog
- **Bewijs:** `src/lib/admin/trainer-actions.ts:204-217` (zet uitsluitend `trainers.is_active`),
  `src/app/app/trainer/layout.tsx:29` (alleen `profiles.role`),
  `src/lib/admin/attendance-actions.ts:117-149` (`authorizeForSession`, selecteert
  `trainers!inner(profile_id, has_health_access)` zonder `is_active`-filter),
  `src/app/app/trainer/sessies/page.tsx:50` (trainers-lookup zonder `is_active`), tegenover
  `src/lib/admin/require-trainer-or-admin.ts:41-48` (eist wel `is_active = true`)

Deactiveren van een trainer flipt één boolean en laat `profiles.role` op `trainer` staan; de
sessies die aan die trainer zijn toegewezen blijven toegewezen. De trainer-layout laat de persoon
daarom gewoon binnen, `/app/trainer/sessies` toont zijn sessielijst, en `authorizeForSession`
verleent toegang zodra de trainer-rij van de sessie zijn eigen `profile_id` draagt. Daarmee
behoudt een gedeactiveerde trainer `markAttendance`, `markGuestAttendance` en `autoMarkNoShows`
op elke nog aan hem toegewezen sessie, inclusief het schrijven van no-show-strikes die het boeken
van een lid blokkeren. Het pijnlijke is dat het systeem de juiste regel al kent: de PT-kant
gebruikt `requireTrainerOrAdmin()`, dat `is_active` wel afdwingt, dus dezelfde persoon wordt op
`/app/trainer/agenda` correct geweigerd en op `/app/trainer/sessies` toegelaten. Twee definities
van "werkende trainer" naast elkaar.

Dit is geen stop-conditie: de aanroeper is ingelogd en draagt legitiem de rol `trainer`. Het is
verouderde autorisatie, geen rolomzeiling. `refundCredit` valt er buiten, want die heeft een eigen
admin-only check (`attendance-actions.ts:792-805`).

**Aanbeveling:** de `is_active`-conditie toevoegen aan de trainer-tak van `authorizeForSession`,
de plek waar de daadwerkelijke schrijfrechten hangen. Dat is één join-conditie en sluit meteen de
onderliggende sessielijst af.

#### TRAINER-2. Het trainer-dashboard staat niet in de nav, en de urenregistratie hangt eronder

- **Severity:** P2
- **Zeker weten:** hoog
- **Bewijs:** `src/components/nav/TrainerNav.tsx:20-38` (Agenda, Boeken, Mijn sessies, Profiel);
  `/app/trainer` alleen bereikbaar via `src/app/app/trainer/uren/page.tsx:131` en
  `src/app/app/trainer/sessies/page.tsx:117`; `/app/trainer/uren` alleen via
  `src/app/app/trainer/page.tsx:352`

Sinds PT-agenda PR D landen trainers op `/app/trainer/agenda` en heeft TrainerNav geen item meer
voor `/app/trainer` zelf. Het dashboard bestaat nog, met de sessies van vandaag, het urenoverzicht
en de aankondigingen, maar is alleen te bereiken via een terug-link op twee onderliggende
pagina's. Erger is het gevolg voor `/app/trainer/uren`: de enige link daarheen staat op dat
onbereikbare dashboard. Een trainer die zijn gewerkte uren wil indienen, moet dus eerst naar Mijn
sessies, dan op de terug-link klikken, en daar het urenblok vinden. Urenregistratie is de basis
voor uitbetaling, dus dit is geen randgeval.

**Aanbeveling:** een "Uren"-item aan `TrainerNav` toevoegen. Dat maakt de vierde tab-plek van
Profiel niet vrij, dus de eenvoudigste vorm is Uren als vijfde item of in de plaats van de
terug-link-constructie.

#### TRAINER-3. De drie zwaarste trainer-routes hebben geen laadstaat

- **Severity:** P3
- **Zeker weten:** hoog
- **Bewijs:** geen `loading.tsx` in `src/app/app/trainer/agenda`, `src/app/app/trainer/boeken`,
  `src/app/app/trainer/klant/[id]`

De agenda haalt trainersrijen, `pt_trainer_settings`, `get_pt_busy` en de sessies op voordat er
iets rendert; het boek-scherm doet daar de catalogus en klantzoekgegevens bij. Dat zijn de twee
duurste reads in het hele trainer-oppervlak en juist die tonen niets tijdens het laden, terwijl
`/app/trainer`, `/app/trainer/sessies` en `/app/trainer/uren` wel een `loading.tsx` hebben.

**Aanbeveling:** hetzelfde `PageSkeleton`-patroon kopiëren.

### 3.4 Admin

#### ADMIN-1. De opvolging van mislukte betalingen linkt naar een niet-bestaande route

- **Severity:** P1
- **Zeker weten:** hoog
- **Bewijs:** `src/app/app/admin/page.tsx:313-318` (`href="/app/admin/facturen"`);
  `src/app/app/admin/` bevat geen directory `facturen`; de telling komt uit
  `src/app/app/admin/page.tsx:111-114` (`payments` met status `failed`, `expired`, `open`)

De cockpit toont een tegel "Openstaande facturen" met een telling van mislukte en openstaande
betalingen, en die tegel linkt naar `/app/admin/facturen`. Die route bestaat niet, dus Marlon ziet
een aantal, klikt, en belandt op een 404. De alternatieve wegen dekken de set maar deels: de
activiteitenfeed toont hooguit de laatste vier gefaalde betalingen en de items zijn niet klikbaar
(`src/app/app/admin/_components/ActivityFeed.tsx` bevat geen `Link`), en de ledenlijst filtert op
`memberships.status = 'payment_failed'`, wat een andere verzameling is dan `payments` met status
`open` of `expired`. Een mislukte eenmalige productbetaling verschijnt dus in de telling maar op
geen enkel scherm. Voor de betreffende betalingen is er geen weg naar binnen.

**Aanbeveling:** kleinste ingreep is de tegel laten wijzen naar
`/app/admin/leden?status=payment_failed` en de titel daarop aanpassen, zodat telling en
bestemming dezelfde verzameling beschrijven. Een echt betalingenoverzicht is groter werk en hoort
in §4.

#### ADMIN-2. De activiteitenfeed toont ruwe databasewaarden

- **Severity:** P2
- **Zeker weten:** hoog
- **Bewijs:** `src/app/app/admin/page.tsx:219` (`detail: ... · ${p.status}`) en
  `src/app/app/admin/page.tsx:210` (`detail: \`Plan ${c.plan_variant}\``)

In de feed staat "Betaling gefaald: Anna de Vries" met daaronder "€ 89 · failed", en bij
opzegverzoeken "Plan all_inclusive_3x". De statuswaarden en de plan-slug komen ongefilterd uit de
database. Elders in de cockpit bestaan de vertalingen al: `MembershipStatusBadge.tsx:11` mapt
`payment_failed` naar "Betaling gefaald" en de catalogus levert `display_name` per slug. De feed
staat op het eerste scherm dat Marlon elke dag ziet.

**Aanbeveling:** de bestaande statuslabel-map hergebruiken voor `p.status` en `display_name` uit
de catalogus tonen in plaats van `plan_variant`.

#### ADMIN-3. `/app/admin/dropoff` is alleen via de bell bereikbaar

- **Severity:** P2
- **Zeker weten:** hoog
- **Bewijs:** `src/components/nav/DropoffBell.tsx:18` is de enige link;
  `src/app/app/admin/_components/AdminSidebar.tsx:45-70` bevat geen item

Het churn-signaal, waarvan `spec-community-growth.md` §2 zegt dat het het hele punt is dat Marlon
persoonlijk contact kan opnemen, hangt aan één bell in de header. Staat de badge op nul of kijkt
zij er even langs, dan is er geen andere ingang. Het vergelijkbare Pauzes-signaal heeft wel beide:
een bell en een sidebar-item. Dezelfde asymmetrie stond al in `discovery-navigatie-structuur.md`
als optionele reparatie 10 en is bewust uitgesteld, maar met de dropoff-pagina inmiddels gebouwd
weegt hij zwaarder dan toen.

**Aanbeveling:** één regel in `SECONDARY` van `AdminSidebar.tsx`, naast Pauzes.

#### ADMIN-4. Het cockpit-dashboard is tot vijf minuten oud

- **Severity:** P2
- **Zeker weten:** midden
- **Bewijs:** `src/app/app/admin/page.tsx:20` (`export const revalidate = 300`); elke andere
  cockpit-pagina heeft `export const dynamic = "force-dynamic"`

Het dashboard is de enige pagina in de cockpit met ISR. Voor de KPI's uit `vw_admin_kpis` is dat
prima, want die matview wordt sowieso maar dagelijks ververst. Voor de tellers eronder is het dat
niet: het aantal openstaande pauzeverzoeken, het aantal openstaande facturen, de sessies van
vandaag en de activiteitenfeed komen alle vier uit live tabellen, en die kunnen dus tot vijf
minuten achterlopen. Handelt Marlon een pauzeverzoek af op `/app/admin/pauzes` en gaat ze terug
naar het dashboard, dan staat de teller er waarschijnlijk nog. Ik zet dit op midden omdat ik de
cache-uitkomst niet in een draaiende omgeving heb waargenomen, alleen de directieven gelezen.

**Aanbeveling:** de vier live tellers en de feed in een apart, niet-gecachet segment zetten, of
eenvoudiger, `revalidate` vervangen door `force-dynamic` en de matview zijn eigen cachegedrag
laten houden.

#### ADMIN-5. De deelnemerslijst is niet bereikbaar vanuit het rooster

- **Severity:** P3
- **Zeker weten:** hoog
- **Bewijs:** `src/app/app/admin/leden/[id]/_components/AdminBookingRow.tsx:57` is de enige link
  naar `/app/admin/sessies/[id]`

Om de deelnemerslijst van een groepsles te openen moet Marlon eerst een lid opzoeken, naar diens
boekingen, en daar op "Deelnemerslijst" klikken. Vanuit `/app/admin/rooster`, waar zij de sessie
voor zich heeft, is er geen link. In de praktijk werkt zij waarschijnlijk via de trainer-kant
(`/app/trainer/sessies`), die wel een sessielijst heeft, maar dan verlaat zij de cockpit.

**Aanbeveling:** een link naar `/app/admin/sessies/[id]` in `AdminSessionBlock` of het
`SessionEditPanel`.

#### ADMIN-6. De sidebarbeschrijving in CLAUDE.md is achterhaald

- **Severity:** P3
- **Zeker weten:** hoog
- **Bewijs:** `CLAUDE.md` sectie "Admin sidebar items" tegenover
  `src/app/app/admin/_components/AdminSidebar.tsx:45-74`

CLAUDE.md beschrijft Dashboard, Rooster, Leden, Trainers, Pauzes, Aankondigingen, Instellingen en
Content. De werkelijke sidebar heeft daarnaast Betaalverzoeken, PT boeken, Proefcodes, Oefeningen
en Lestypes. Aangezien CLAUDE.md het instapdocument voor elke sessie is, plant deze drift
verkeerde aannames bij het volgende stuk werk. Dezelfde soort drift zit in de bewering over de
`/app/rooster`-link naar vrij trainen (zie LEDEN-1).

**Aanbeveling:** beide passages in CLAUDE.md bijwerken.

---

## 4. Ontbrekende essentiële functionaliteit

Gerangschikt naar hoe hard de flow nu vastloopt. Alleen zaken waar het ontbreken werk buiten het
systeem afdwingt, conform de opdracht: dit is geen feature-lijst.

1. **Overzicht van mislukte en openstaande betalingen.** De cockpit telt ze wel maar toont ze
   niet (ADMIN-1). Een `expired` of `open` eenmalige productbetaling heeft geen enkel scherm.
   Marlon moet nu in Mollie kijken om te zien wie niet betaald heeft.
2. **Scherm voor openstaande abonnementswijzigingen.** De backend is af tot en met de annuleer-RPC,
   de voorkant ontbreekt volledig (GEDEELD-2). Terugdraaien vraagt nu een handmatige
   database-actie.
3. **Aanwezigheid voor proefles-boekingen.** `trial_bookings.status` kent `attended` en `no_show`,
   maar geen enkel codepad zet ze; de aanwezigheidsschermen werken uitsluitend op `bookings` en
   `check_ins`. Een proefles-bezoeker bezet wel een plek maar krijgt geen aanwezigheidsregistratie,
   dus Marlon houdt dat buiten het systeem bij. Al vastgelegd in `spec-community-growth.md` §1;
   hier alleen herhaald omdat het een echte handmatige stap oplevert.
4. **Bevestigingsmail bij een betaalde proefles.** `spec-community-growth.md` §1 markeert dit als
   blokkerend vóór opening: zonder mail heeft de bezoeker geen `cancel_token` en dus geen weg naar
   `/proefles/annuleren/[token]`. Annuleren loopt nu via Marlon.
5. **Sessies loskoppelen bij het deactiveren van een trainer.** `toggleTrainerActive` laat de
   toewijzingen staan (TRAINER-1), dus na deactivering staan er sessies in het rooster met een
   trainer die niet meer werkt, en moet iemand die handmatig omzetten.
6. **Navigatie-ingang voor vrij trainen** (LEDEN-1) en **voor de urenregistratie** (TRAINER-2).
   Beide functies zijn gebouwd en werkend, alleen niet vindbaar; leden en trainers moeten nu een
   URL krijgen aangereikt.

---

## 5. Wat goed staat

Niet aanraken zonder reden:

- **De boek-gate.** `tmc.book_class_session` doet alles onder één rijlock: capaciteit via
  `session_occupancy()` inclusief trial- en gastboekingen, strikes, fair-use, dekking, weeklimiet,
  credit-decrement met een `>= v_credits_used`-guard, en het oplossen van de eigen
  wachtlijst-entry in dezelfde transactie. De volgorde van de checks komt letterlijk overeen met
  `canBook()`, zodat de prefilter en de gate hetzelfde zeggen.
- **De aanwezigheidsmodellering.** Zowel `member-detail-query.ts:355-357` als
  `boekingen/page.tsx:106-113` leiden "attended" af uit `check_ins` en `no_show_at`, en
  `overrideNoShow` (`member-actions.ts:535,544,571`) schrijft `attended_at` en `no_show_at`, nooit
  `bookings.status`. De check-constraint staat alleen `booked`, `cancelled` en `waitlisted` toe en
  wordt nergens geschonden.
- **Dubbelklik-bescherming.** Elke actie die geld of een boeking raakt zit in een
  `useTransition()` met `disabled={pending}` en een "Bezig"-label, inclusief
  `BookingSheet.tsx:502-543` en `BuyButton.tsx:48-56`. Annuleren door een lid vraagt bovendien een
  bevestiging binnen het annuleervenster (`UpcomingRow.tsx:44-46`).
- **De lifecycle-laag.** Alle beleid zit in SECURITY DEFINER RPC's met rijlock, gepind
  `search_path` en `is_admin()`-gate; de TS-laag is een dunne aanroeper die Mollie-eerst werkt en
  compenseert bij een mislukte tweede stap. De knoppen in `ActionMenu.tsx` zijn contextueel
  uitgeschakeld en spiegelen de RPC-guards, zodat er geen knop bestaat die de RPC toch zou
  weigeren.
- **De admin-cockpit is expliciet desktop-only** (`AdminShell.tsx:19-20` vervangt de hele inhoud
  door `AdminMobileBlock` onder `lg`). Dat is een bewuste keuze en geen mobiel-probleem: het
  studiowerk op de telefoon, aanwezigheid vastleggen, loopt via
  `/app/trainer/sessies/[id]` met de daarvoor gebouwde `MobileAttendanceList`. De ledenomgeving
  zelf is consequent mobiel-eerst met een bottom-tab-bar en geen horizontaal scrollende tabellen.
- **De health-intake blokkeert het boeken niet.** `book_class_session` kent geen intake-gate; de
  `IntakeBanner` is puur een nudge naar `/app/profiel/intake`. Dat beantwoordt discovery-punt 6
  uit `spec-ledenomgeving.md` §5 en is de juiste keuze: een half ingevuld formulier houdt niemand
  buiten de les.

---

*Geen bevindingen weggelaten wegens de limiet van twaalf per severity-niveau: dit rapport telt 5
P1, 6 P2 en 6 P3.*
