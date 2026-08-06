# Spec: Facturatie en omzetrapportage (greenfield, zonder boekhoudkoppeling)

## Status

Ontwerp, nog niet gebouwd. Geschreven op basis van een read-only discovery tegen de live
database (`xoivleieyfcxcfawgveh`, schema `tmc`) en de codebase op `main` @ `9a4a9b5`.
Alle live-definities in dit document komen uit `pg_get_functiondef` en
`information_schema`, niet uit de migratiebestanden.

Dit document is leidend voor alles wat met facturen, BTW en gerealiseerde omzet te maken
heeft. Voor de prijsketen zelf blijft `spec-membership-flow.md` leidend; deze spec haakt
daarop aan en vervangt hem niet.

## Build status en openstaande gates (living)

| Gate | Status | Blokkeert |
|---|---|---|
| BTW-tarief per productgroep | besloten: overal 9 procent (1.1, Ilja 2026-08-06) | nee |
| Fiscale bevestiging van die 9 procent door de accountant | open | oplevering, niet de bouw |
| KvK- en BTW-nummer van TMC in het systeem | open | oplevering, niet de bouw |
| Creditnota in dezelfde reeks of een eigen reeks | besloten: dezelfde reeks | nee |
| `/app/facturen` uitbreiden of nieuwe route | besloten: uitbreiden | nee |
| Twee Mollie-keys aangemaakt en in Vercel gezet | open | PR 4 |
| Bucket `tmc-invoices` aangemaakt | open | PR 6 |

## Waar dit op rust: een idee

**Omzet leeft in `tmc.payments`. Facturen zijn documenten die daaruit ontstaan. De factuur
is nooit de bron van de omzet.**

Dat is de hele spec in een zin, en het is de reden dat consumentenproducten zonder factuur
gewoon in de rapportage meetellen. Wie het omdraait en de omzet uit de facturen optelt,
mist per definitie alles wat nooit gefactureerd werd, en dat is bij TMC de meerderheid van
de transacties.

Uit die keuze volgt de rest vanzelf:

- Een factuur is een bevroren document. Zodra hij gefinaliseerd is verandert er niets meer
  aan, ook niet als het profiel, de catalogus of de prijs daarna wijzigt. Daarom staat de
  NAW in de factuurrij en niet achter een join.
- Een correctie is nooit een mutatie. Terugbetalen levert een creditnota op met negatieve
  regels plus een bedrag op de oorspronkelijke betaalregel, niet een overschreven status.
- Testdata leeft naast productiedata in dezelfde tabellen, maar op eigen profielen en in
  een eigen nummerreeks, en is uit elke rapportage en elke ledenweergave gefilterd.

## Scope en niet-scope

**Wel in scope**

- BTW-snapshot in de prijsketen en op elke betaalregel
- Ad-hoc facturen, handmatig aangemaakt door een admin
- Creditnota's, inclusief deels crediteren
- Testmodus met een eigen Mollie-key, eigen profielen en eigen nummerreeks
- Omzetrapportage per periode en per productgroep, netto, BTW en bruto
- Transactieoverzicht voor leden met download waar een factuur bestaat

**Niet in scope**

- Koppeling met een extern boekhoudpakket
- Automatisch factureren bij elke incasso
- ICP-opgave, OSS, buitenlandse BTW, verlegging
- Meerdere valuta
- Aanmaningen en incassotrajecten

## 1. Fiscale uitgangspunten

Deze sectie legt vast wat we aannemen. Elke aanname met de markering hieronder moet door de
accountant bevestigd worden voordat er een echte factuur de deur uit gaat.

### 1.1 BTW-tarieven per productgroep

**Alle productgroepen krijgen negen procent. Er zijn geen 21-procent-producten in de
catalogus.**

| `revenue_category` | Slugs | `vat_rate_bp` | |
|---|---|---|---|
| `abonnement` | `vrij_trainen_*`, `groepslessen_*`, `all_inclusive_*`, `kids_*`, `senior_*` | `900` | `// FISCAAL: besloten door Ilja 2026-08-06, niet fiscaal getoetst` |
| `addon` | `extended_access` | `900` | `// FISCAAL: besloten door Ilja 2026-08-06, niet fiscaal getoetst` |
| `inschrijfgeld` | `signup_fee` | `900` | `// FISCAAL: besloten door Ilja 2026-08-06, niet fiscaal getoetst` |
| `les_tegoed` | `drop_in`, `drop_in_kids`, `drop_in_senior`, `ten_ride_card*` | `900` | `// FISCAAL: besloten door Ilja 2026-08-06, niet fiscaal getoetst` |
| `personal_training` | `pt_single`, `pt_10`, `duo_single`, `duo_10` | `900` | `// FISCAAL: besloten door Ilja 2026-08-06, niet fiscaal getoetst` |
| `programma` | `program_studio_12w`, `program_online_12w` | `900` | `// FISCAAL: besloten door Ilja 2026-08-06, niet fiscaal getoetst` |

De redenering: **alle diensten van TMC worden aangemerkt als het geven van gelegenheid tot
sportbeoefening**, en vallen daarmee onder het lage tarief. Dat geldt voor de abonnementen
en de losse lessen, en het geldt evengoed voor personal training en de
twaalfweken-programma's: ook daar is de prestatie begeleide beweging in de eigen studio.
Het inschrijfgeld en de add-on volgen de hoofddienst en komen op dezelfde negen procent uit.

De eerdere indeling uit de discovery, die personal training en de programma's op
eenentwintig procent zette, is daarmee **verworpen**. Die berustte op de gedachte dat
individuele begeleiding door een zelfstandige een andere prestatie is dan het gebruik van
een sportaccommodatie. Zie besluitenlog 27.

De markering `// FISCAAL` blijft staan en betekent nu iets anders dan eerst. Hij zegt niet
meer "dit moet nog gekozen worden" maar "dit is gekozen zonder fiscale toetsing". De keuze
is genomen, de bevestiging staat nog open als vraag 1 in sectie 13, en dat is een
opleverpunt en geen bouwpunt.

Het datamodel blijft bewust onverschillig voor de uitkomst: `vat_rate_bp` staat per
catalogusrij, de BTW staat per factuurregel, en de admin kan het tarief per regel
overschrijven (9.3). Negen en eenentwintig procent kunnen dus op dezelfde factuur staan
zonder dat er iets aan het model verandert. Dat de zes groepen vandaag hetzelfde getal
dragen is een waarde in de data, geen eigenschap van het ontwerp.

### 1.2 Factuurplicht: consument versus zakelijke klant

Aan een particulier hoeft geen factuur verstrekt te worden. Aan een ondernemer wel. De
administratie van de omzet is in beide gevallen verplicht.

Consequentie voor het ontwerp: facturen worden ad hoc aangemaakt, niet automatisch bij
elke betaling. Een lid dat een factuur nodig heeft vraagt erom, of een admin ziet dat het
een zakelijke klant is. Alles wat niet gefactureerd wordt telt gewoon mee in de
omzetrapportage, want die draait op `tmc.payments`.

### 1.3 Wat een verkoopfactuur moet bevatten

Vastgelegd zodat het PDF-sjabloon compleet is:

- Factuurnummer, opeenvolgend
- Factuurdatum
- Naam, adres en BTW-nummer van TMC
- Naam en adres van de afnemer, plus diens BTW-nummer als het een zakelijke klant is
- Per regel: omschrijving, aantal, bedrag exclusief BTW, BTW-tarief
- Totaal exclusief BTW, BTW-bedrag per tarief, totaal inclusief BTW
- Bij een creditnota: verwijzing naar het gecrediteerde factuurnummer

### 1.4 Aaneengesloten nummering en bewaarplicht

De nummering moet aaneengesloten zijn. Gaten zijn verdacht, want een gat suggereert een
verdwenen factuur. Dit is de enige reden dat de teller een gewone tabelrij is en geen
Postgres `SEQUENCE`; zie 4.3.

Bewaartermijn zeven jaar. Praktisch betekent dat: een gefinaliseerde factuur wordt nooit
verwijderd en nooit gewijzigd, en de PDF blijft in de storage-bucket staan.

### 1.5 Opleverblocker: KvK- en BTW-nummer ontbreken

`src/lib/constants.ts` bevat:

```
kvk: "00000000",              // TODO
btw: "NL000000000B01",        // TODO
```

Deze waarden worden gerenderd in `src/components/layout/Footer.tsx` en zijn ook de fallback
voor het Sanity-veld `siteSettings.btwNumber` (`sanity/lib/fetch.ts`), dat op zijn beurt
dezelfde placeholder krijgt uit `sanity/seed.ts`.

**Dit is een opleverblocker, geen bouwblocker.** De hele keten kan gebouwd, getest en
gereviewd worden met de placeholder erin. Wat niet mag: een factuur met
`NL000000000B01` naar een klant sturen. Het PDF-sjabloon leest de waarde uit Sanity met de
constante als fallback, precies zoals de footer dat nu doet, dus zodra het echte nummer in
Sanity staat is de factuur correct zonder codewijziging.

## 2. Datamodel

### 2.1 tmc.catalogue

Twee nieuwe kolommen, allebei `NOT NULL` **zonder default**:

| Kolom | Type | Toelichting |
|---|---|---|
| `vat_rate_bp` | `integer NOT NULL` | Basispunten. `900` is 9,00 procent, `2100` is 21,00 procent. `CHECK (vat_rate_bp between 0 and 2100)` |
| `revenue_category` | `text NOT NULL` | `CHECK (revenue_category in ('abonnement','les_tegoed','personal_training','programma','inschrijfgeld','addon'))` |

**Waarom geen default.** Een default classificeert een nieuwe catalogusrij stil en
plausibel verkeerd. Wie over een half jaar een product toevoegt en het BTW-tarief vergeet,
krijgt dan negen procent zonder dat iemand ernaar gekeken heeft, en dat is precies het
soort fout dat pas bij een controle boven water komt. Zonder default weigert de insert en
moet de auteur een keuze maken.

**Dit telt juist nu, en het is verleidelijk om het nu te laten vallen.** Sinds het besluit
in 1.1 draagt elke rij in de catalogus hetzelfde tarief. Een `DEFAULT 900` zou daarmee
opeens redelijk lijken: hij is immers voor alle 29 bestaande rijen correct, hij scheelt een
kolom in elke toekomstige `insert`, en hij maakt de migratie een stuk korter.

Precies dat maakt hem gevaarlijk. Het enige geval waarin de default ooit iets doet, is het
geval waarin hij fout is: een nieuw product dat níét onder het lage tarief valt. Zolang
alles negen procent is voegt de default niets toe, en zodra er één uitzondering komt is hij
een stille fout in de enige rij die aandacht verdiende. Een uniform tarief is dus geen reden
om de default alsnog te zetten, maar de reden om hem zeker niet te zetten.

De `CHECK (vat_rate_bp between 0 and 2100)` blijft daarom ook ongewijzigd: eenentwintig
procent is toegestaan door het schema, alleen niet in gebruik. Een toekomstig
21-procent-product vraagt een bewuste waarde in de `insert`, geen migratie.

Praktisch gevolg voor de migratie: `ADD COLUMN ... NOT NULL` zonder default faalt op een
gevulde tabel. De migratie doet dus drie stappen in dezelfde transactie: kolom nullable
toevoegen, per slug backfillen met een expliciete `update ... where slug = ...` per rij
(geen `case`-expressie over een patroon, want dan is niet zichtbaar wat er met een rij
gebeurt die niemand heeft bekeken), en daarna `SET NOT NULL`. **Ook nu alle rijen dezelfde
waarde krijgen blijft de backfill per rij expliciet**, en niet één `update tmc.catalogue set
vat_rate_bp = 900`. De migratie is de plek waar de tabel uit 1.1 letterlijk terugkomt en
waar de accountant meeleest; een enkele veegupdate laat zien dat alles negen is, maar niet
dat iemand per productgroep heeft nagedacht.

Basispunten als integer, niet `numeric`: exact, vergelijkbaar zonder cast, en geen
drijvende komma in een bedragberekening.

Een derde kolom die overwogen is en niet doorgaat: `price_includes_vat`. Zie besluitenlog.

### 2.2 tmc.payments

`amount_cents` blijft ongewijzigd het brutobedrag, zodat elke bestaande query blijft werken.

| Kolom | Type | Toelichting |
|---|---|---|
| `is_test` | `boolean NOT NULL DEFAULT false` | Afgeleid snapshot, gezet bij het schrijven van de rij |
| `vat_rate_bp` | `integer` | Nullable: historische rijen hebben geen bekend tarief |
| `net_amount_cents` | `integer` | |
| `vat_amount_cents` | `integer` | `CHECK`: als beide gevuld, `net_amount_cents + vat_amount_cents = amount_cents` |
| `refunded_amount_cents` | `integer NOT NULL DEFAULT 0` | |
| `refunded_at` | `timestamptz` | Tijdstip van de laatste refund-melding |
| `kind` | `text` | `order`, `recurring`, `trial_booking`, `manual` |
| `trial_booking_id` | `uuid REFERENCES tmc.trial_bookings(id)` | Dicht het omzetlek uit 2.9 |

Voor een betaling die meerdere BTW-tarieven mengt (een eerste incasso met abonnement plus
inschrijfgeld, beide 9 procent, is dat niet, maar een toekomstige gemengde order wel) is
`vat_rate_bp` op de betaalregel per definitie te grof. De opsplitsing per tarief staat in
`orders.pricing_snapshot` en op de factuurregels; `payments.vat_rate_bp` is een
rapportagegemak voor het eenvoudige geval en mag `NULL` zijn zodra de order meerdere
tarieven bevat. De rapportage in 7.2 rekent daarom primair via
`catalogue.revenue_category`, niet via `payments.vat_rate_bp`.

### 2.3 tmc.profiles

Eén nieuwe kolom, plus de NAW-aanvulling die de factuur nodig heeft:

| Kolom | Type | Toelichting |
|---|---|---|
| `is_test` | `boolean NOT NULL DEFAULT false` | **De enige plek waar de testmodus wordt vastgelegd.** Zie sectie 6 |
| `company_name` | `text` | Voor zakelijke klanten |
| `vat_number` | `text` | BTW-nummer van de afnemer |

Bestaand en herbruikbaar: `street_address`, `postal_code`, `city`, `country` (`NOT NULL
DEFAULT 'NL'`), `member_code` (`NOT NULL`, bruikbaar als klantnummer op de factuur).

Bekende beperking: `street_address` is één tekstveld, er is geen apart huisnummer. Voor een
Nederlandse factuur is dat acceptabel. Niet oplossen in deze spec.

`tmc.orders`, `tmc.memberships`: **geen** `is_test`-kolom. Zie 6.3.

### 2.4 tmc.invoice_series

De teller. Eén rij per combinatie van reeks en boekjaar.

```
id            uuid primary key default gen_random_uuid()
code          text not null                    -- 'LIVE' | 'TEST'
fiscal_year   integer not null
is_test       boolean not null
prefix        text not null                    -- '' | 'TEST-'
next_number   integer not null default 1
created_at    timestamptz not null default now()

unique (code, fiscal_year)
check (is_test = (code = 'TEST'))
check (prefix = case when is_test then 'TEST-' else '' end)
```

De jaarreset is hiermee structureel in plaats van een berekening: een nieuw boekjaar is een
nieuwe rij en die begint bij 1. Er is geen code die "als het januari is, zet de teller
terug" hoeft te doen, en er is dus ook geen moment waarop die code te vroeg of te laat kan
lopen.

`TEST` en `LIVE` zijn aparte rijen, dus de reeksen kunnen elkaar nooit raken.

### 2.5 tmc.invoices

```
id                     uuid primary key default gen_random_uuid()
series_id              uuid not null references tmc.invoice_series(id)
fiscal_year            integer not null
number                 integer                       -- null zolang draft
invoice_number         text                          -- '2026.001' / 'TEST-2026.001'
is_test                boolean not null
status                 text not null default 'draft' -- 'draft' | 'finalised'
issued_at              date
profile_id             uuid not null references tmc.profiles(id)

-- bevroren afnemergegevens
bill_to_name           text
bill_to_company        text
bill_to_vat_number     text
bill_to_street         text
bill_to_postal_code    text
bill_to_city           text
bill_to_country        text
bill_to_email          text

-- bevroren bedragen
subtotal_net_cents     integer
vat_total_cents        integer
total_gross_cents      integer
currency               text not null default 'EUR'

-- herkomst
payment_id             uuid references tmc.payments(id)
order_id               uuid references tmc.orders(id)
credit_of_invoice_id   uuid references tmc.invoices(id)

-- pdf, write-once
pdf_path               text
pdf_generated_at       timestamptz

notes                  text
created_by_profile_id  uuid references tmc.profiles(id)
created_at             timestamptz not null default now()
updated_at             timestamptz not null default now()

unique (series_id, number)
unique (invoice_number)
check (status in ('draft','finalised'))
check (status = 'draft' or (number is not null
                            and invoice_number is not null
                            and issued_at is not null
                            and bill_to_name is not null
                            and bill_to_email is not null
                            and total_gross_cents is not null))
check (credit_of_invoice_id is null or credit_of_invoice_id <> id)

constraint invoices_credit_note_negative_check check (
  credit_of_invoice_id is null
  or status = 'draft'
  or (total_gross_cents < 0 and subtotal_net_cents <= 0 and vat_total_cents <= 0)
)
```

`invoices_credit_note_negative_check` is geen stijlregel maar een rekenvoorwaarde.
`tmc.v_invoice_credit_state` (4.6) telt gecrediteerde bedragen op met `-sum(...)` en gaat er
dus vanuit dat een creditnota negatieve totalen draagt. Een creditnota die per ongeluk
positief wordt weggeschreven zou daar een negatief `credited_gross_cents` opleveren en de
crediteringsstand stilzwijgend op `none` houden, terwijl er wel degelijk gecrediteerd is.
Dezelfde aanname zit in de omzetregels van 7.4. De constraint maakt er een harde
databasegrens van in plaats van een afspraak.

De `status = 'draft'`-uitzondering is nodig omdat de totalen `null` zijn zolang de factuur
een concept is; `finalize_invoice` berekent ze pas in stap 6b. `vat_total_cents <= 0` en
niet `< 0`, want een creditnota van een volledig vrijgestelde regel heeft nul BTW.

Alles wat op een gefinaliseerde factuur staat is bevroren in de rij zelf. Er wordt bij
weergave niet gejoind naar `profiles` of `catalogue`. Dat is niet uit prestatie-overweging
maar omdat het precies is wat een factuur tot een document maakt in plaats van een view:
het adres op factuur `2026.001` is het adres van toen, ook als het lid volgende maand
verhuist.

`status` kent bewust maar twee waarden. Zie 4.6.

### 2.6 tmc.invoice_lines

```
id                uuid primary key default gen_random_uuid()
invoice_id        uuid not null references tmc.invoices(id) on delete cascade
line_no           integer not null
catalogue_slug    text                          -- geen foreign key
description       text not null                 -- bevroren
quantity          numeric(10,2) not null default 1
unit_net_cents    integer not null
vat_rate_bp       integer not null
net_cents         integer not null
vat_cents         integer not null
gross_cents       integer not null
revenue_category  text

unique (invoice_id, line_no)
check (gross_cents = net_cents + vat_cents)
```

`catalogue_slug` heeft opzettelijk **geen** foreign key naar `tmc.catalogue`. De catalogus
mag wijzigen, rijen mogen op `is_active = false`, en een slug mag in theorie verdwijnen.
Een factuur uit 2026 moet in 2031 nog leesbaar zijn. De slug staat er als herkomstspoor,
niet als verwijzing.

BTW staat per regel omdat één factuur negen en eenentwintig procent kan mengen. Dat de
catalogus vandaag uitsluitend negen procent kent (1.1) verandert daar niets aan: de admin
kan het tarief per regel overschrijven (9.3), en een toekomstig product met een afwijkend
tarief mag geen modelwijziging vragen. Het totaalbedrag per tarief op de PDF komt uit een
`group by vat_rate_bp` over de regels.

### 2.7 RLS-beleid

| Tabel | Policy | Regel |
|---|---|---|
| `invoices` | `invoices_self_read` | `SELECT`: `profile_id = auth.uid() and status = 'finalised' and is_test = false` |
| `invoices` | `invoices_admin_all` | `ALL`: `tmc.is_admin()` |
| `invoice_lines` | `invoice_lines_self_read` | `SELECT`: `exists (select 1 from tmc.invoices i where i.id = invoice_id and i.profile_id = auth.uid() and i.status = 'finalised' and i.is_test = false)` |
| `invoice_lines` | `invoice_lines_admin_all` | `ALL`: `tmc.is_admin()` |
| `invoice_series` | `invoice_series_admin_all` | `ALL`: `tmc.is_admin()` |

Een lid ziet dus nooit een concept en nooit een testfactuur. De `is_test = false` in de
policy is een tweede laag naast het filter in de query, want een vergeten filter in een
nieuwe pagina mag geen testdata lekken.

Grants volgens hetzelfde patroon als `tmc.orders`: `SELECT` voor `authenticated`, niets
voor `anon`, alles voor `service_role`.

### 2.8 Grant-opruiming op tmc.payments

Bestaande situatie, geverifieerd via `information_schema.role_table_grants`:

```
anon:          SELECT, INSERT, UPDATE, DELETE
authenticated: SELECT, INSERT, UPDATE, DELETE
```

RLS houdt het tegen, want er is geen `INSERT`- of `UPDATE`-policy, dus schrijven wordt
geweigerd. Maar `tmc.orders` geeft `authenticated` alleen `SELECT` en `anon` niets, en die
inconsistentie is puur historisch. Meenemen in de eerste migratie:

```
revoke insert, update, delete on tmc.payments from anon, authenticated;
revoke select on tmc.payments from anon;
```

Dit verandert geen enkel gedrag, want geen enkele policy stond die operaties toe. Het haalt
alleen de tweede verdedigingslinie terug die er bij `orders` wel is.

### 2.9 Het trial_bookings-lek

`/api/trial-bookings/webhook` schrijft nooit naar `tmc.payments`. Geverifieerd tegen de
data: twee betaalde `trial_bookings` met een `mollie_payment_id`, allebei afwezig in
`tmc.payments`. Betaalde proeflessen zijn daarmee onzichtbaar in elke rapportage die op
`payments` leunt.

Ter vergelijking, dezelfde controle op de andere tabellen met een eigen
`mollie_payment_id`: `pt_bookings` nul rijen (die lopen allemaal via de order-pipeline),
`crowdfunding_backers` nul rijen (endpoints verwijderd in #120).

Oplossing: de trial-webhook schrijft dezelfde upsert als de hoofdwebhook, met
`kind = 'trial_booking'` en `trial_booking_id` gevuld. Zie PR 5.

#### tmc.trial_bookings krijgt een eigen is_test

`tmc.trial_bookings` heeft **geen `profile_id`**. Een proefles wordt geboekt door een
bezoeker met alleen naam, e-mail en telefoonnummer; er is geen account en dus ook geen
profiel om `is_test` uit af te leiden. De keten uit 6.3 werkt hier niet.

Daarom een eigen kolom:

| Kolom | Type | Toelichting |
|---|---|---|
| `is_test` | `boolean NOT NULL DEFAULT false` | Gevuld uit de modus waarin de publieke proefles-route draait |

De modus komt van de deployment, niet van de bezoeker:

```ts
export function trialBookingMode(): MollieMode {
  return process.env.VERCEL_ENV === "production" ? "live" : "test";
}
```

Preview en lokale ontwikkeling draaien dus altijd in test, productie altijd in live. Er is
bewust **geen publieke override**: een query-parameter waarmee een bezoeker in productie een
testbetaling zou kunnen starten, geeft hem een proeflesplek voor nul euro.

Zonder deze kolom is de `mode`-parameter op `/api/trial-bookings/webhook` (6.5) dood, want
er is niets dat ooit `mode=test` meegeeft, en het proefles-betaalpad is dan alleen in
productie met echt geld te testen. Dat is precies het pad dat in #120-tijd een lid zijn geld
kostte zonder annuleerlink (zie de comment-historie in `src/lib/trial-booking-email.ts`), dus
onbetestbaarheid is daar geen kleine prijs.

#### Randvoorwaarde: een testproefles mag geen echte plek bezetten

Een preview-deployment praat tegen dezelfde database als productie. Zonder maatregel zou een
testproefles een echte stoel bezetten in een echte sessie van maximaal zes personen, en een
betalend lid op de wachtlijst zetten. Dat is hetzelfde gevaar als in 6.2, alleen via een
andere deur.

**Waar de telling werkelijk zit.** Er zijn drie tellende plekken, en de trigger is er niet
een van; die delegeert:

| Plek | Rol |
|---|---|
| `tmc.session_occupancy(p_session_id)` | De telfunctie: `bookings` met status `booked`, plus `trial_bookings` met `pending`, `paid` of `attended`, plus `guest_bookings` met `booked` of `attended` |
| `tmc.v_session_availability` | Telt hetzelfde nog een keer, in eigen `LATERAL`-subqueries. Duplicaat, geen aanroep van `session_occupancy` |
| `tmc.redeem_trial_code` | Hertelt nog een derde keer, dezelfde optelling |

`tmc.enforce_session_capacity()` is één triggerfunctie die aan alle drie de tabellen hangt
(`bookings_enforce_capacity`, `guest_bookings_enforce_capacity`,
`trial_bookings_enforce_capacity`), met via `tg_argv[0]` per tabel de tellende statussen. De
functie neemt een `for update` op de sessie en toetst
`tmc.session_occupancy(new.session_id) >= v_capacity`. De verandering landt dus in
`session_occupancy`, niet in de trigger zelf, en dekt daarmee in één keer alle drie de
triggers.

`and not is_test` op de `trial_bookings`-subquery gaat daarom naar precies deze drie:
`session_occupancy`, `v_session_availability` en `redeem_trial_code`.

Voor de wachtlijst is geen aparte ingreep nodig: `src/app/api/cron/waitlist-promote/route.ts`
leest `spots_available` uit `v_session_availability`, dus die volgt automatisch.

#### Wat eruit volgt: testproeflessen zijn onderling niet begrensd

Dit is de consequentie die vastgelegd moet worden, want hij is niet vanzelfsprekend.

`tmc.enforce_session_capacity` blijft vuren bij het invoegen van een testproefles, maar hij
toetst tegen een telling waarin testrijen niet meer meedoen. Daaruit volgt een asymmetrie:

- **Een volle sessie weigert nog steeds een testproefles.** Zes echte deelnemers op een
  capaciteit van zes betekent `session_occupancy = 6`, en de trigger weigert de testrij net
  zo hard als een echte. De testmodus kan de fysieke grens dus niet omzeilen.
- **Testproeflessen begrenzen elkaar niet.** In een lege sessie van zes plekken kunnen tien,
  honderd of duizend testrijen ingevoegd worden: geen van die rijen verhoogt de getelde
  bezetting, dus geen van die rijen kan een volgende weigeren. **Testproeflessen zijn
  onderling ongelimiteerd.**

**Is dat acceptabel? Ja, en er komt geen aparte bovengrens in het capaciteitspad.**

De invariant die ertoe doet is "echte deelnemers worden nooit verdrongen door testdata", en
die houdt in beide richtingen: testdata bezet geen echte plek, en een echt volle sessie
blijft vol. De invariant "testdata past in de zaal" is betekenisloos, want er komt bij een
testboeking niemand opdagen. Een tweede grens zou een grens bewaken die niets beschermt.

Daar komt de prijs bij. `session_occupancy` en `enforce_session_capacity` zijn de harde
bovengrens over leden, proeflessers en gasten samen; dat is de zin die letterlijk in de
`hint` van de exception staat. Een tweede telpad met een tweede betekenis erin schuiven maakt
de functie die geld en stoelen bewaakt ingewikkelder, en dat is precies de functie waar een
subtiele fout het duurst is. De regel blijft dus: één telling, één betekenis, en testrijen
tellen niet mee.

Het realistische faalscenario is een testscript met een retry-lus dat duizenden rijen
wegschrijft. Dat is tabelvervuiling, geen bedrijfsincident: er verschuift geen bezetting,
geen wachtlijst en geen omzetregel. Het wordt opgeruimd door de routine uit 6.9.

Wil ops later toch een plafond, dan hoort dat in een **eigen** trigger op `trial_bookings`
die alleen vuurt voor `is_test = true` en een ruime vaste bovengrens hanteert, met een eigen
naam zoals `enforce_test_booking_ceiling`. Los van `session_occupancy`, zodat het echte
capaciteitspad één functie met één betekenis blijft. Dat is expliciet **niet** onderdeel van
deze spec en niet van PR 5.

Dit alles raakt het capaciteitspad, dat buiten de facturatieketen valt. Het staat daarom als
expliciete voorwaarde bij PR 5 en niet als terloopse wijziging: wie PR 5 bouwt zonder deze
drie aanpassingen, zet een testlek open in de bezetting.

## 3. BTW-snapshot in de prijsketen

### 3.1 Bruto is leidend

Alle prijzen in `tmc.catalogue` zijn brutobedragen: wat de klant betaalt. Dat was tot nu
toe impliciete conventie en wordt hiermee expliciet vastgelegd.

De berekening, in deze volgorde en nooit andersom:

```
vat_cents = round(gross_cents * vat_rate_bp / (10000 + vat_rate_bp))
net_cents = gross_cents - vat_cents
```

**Waarom nooit netto eerst.** Als je netto opslaat of eerst berekent en daarna bruto
terugrekent, introduceer je een afrondingsstap tussen de getoonde prijs en het
geïncasseerde bedrag. Een abonnement van 109,00 euro wordt dan netto 100,00 en bruto weer
109,00, maar bij 12,90 wordt netto 11,83 en bruto 12,89. Dat is een cent verschil tussen
wat op `/prijzen` staat en wat er van de rekening gaat, en die cent is niet te verdedigen.
Bruto is wat de klant is beloofd, dus bruto is de waarheid en de BTW is de afgeleide.

`net_cents = gross_cents - vat_cents` in plaats van een tweede `round`-expressie, zodat de
twee getallen per definitie optellen tot het bruto.

### 3.2 Inhaakpunt in _compute_order_price

Live signatuur:

```
tmc._compute_order_price(p_slug text, p_extended_access boolean, p_commit_24m boolean,
                         p_early_member boolean, p_admin_context boolean default false)
  returns jsonb  language plpgsql  stable security definer
  set search_path to 'tmc','extensions'
```

Dit is de enige plek in het systeem waar de drie catalogusrijen tegelijk beschikbaar zijn:

- `v_row` levert `v_base_price`
- `v_ext` (slug `extended_access`) levert `v_ext_price`
- `v_fee` (slug `signup_fee`) levert `v_fee_cents`

De valkuil om te vermijden: de functie retourneert al `'catalogue', to_jsonb(v_row)`, dus
een `vat_rate_bp`-kolom op `tmc.catalogue` komt gratis mee in het snapshot. Maar alleen die
van `v_row`. Het tarief van de add-on en van het inschrijfgeld zit er dan niet in, en
precies die twee zitten wel in het te incasseren bedrag. Daarom expliciete top-level keys.

**Subscription-tak**, in te voegen vlak na
`v_first_charge := v_recurring + v_fee_cents;`, vóór de `return jsonb_build_object(...)`:

```
vat_rate_bp                        -- v_row.vat_rate_bp
vat_amount_cents                   -- over v_base_price
extended_access_vat_rate_bp        -- v_ext.vat_rate_bp, null als v_ext_price = 0
extended_access_vat_amount_cents
signup_fee_vat_rate_bp             -- v_fee.vat_rate_bp
signup_fee_vat_amount_cents
first_charge_vat_amount_cents      -- som van de drie
recurring_vat_amount_cents         -- base + extended_access
revenue_category                   -- v_row.revenue_category
```

**Product-tak**, in de bestaande `return`:

```
vat_rate_bp
vat_amount_cents
first_charge_vat_amount_cents      -- gelijk aan vat_amount_cents
revenue_category
```

Let op: de add-on met `extended_access_mode = 'included'` heeft `v_ext_price = 0`. De
BTW daarover is nul en het tarief is dan `null`, niet `0`, om onderscheid te houden tussen
"geen add-on" en "add-on van nul euro".

**De drie tariefkeys blijven gescheiden, ook nu ze dezelfde waarde dragen.** Sinds het
besluit in 1.1 leveren `v_row`, `v_ext` en `v_fee` alle drie `900`, en dan is
`vat_rate_bp * (base + ext + fee)` in één keer rekenen verleidelijk en korter. Niet doen. De
drie bedragen komen uit drie afzonderlijke catalogusrijen die los van elkaar gewijzigd kunnen
worden, en het snapshot is precies bedoeld om vast te leggen wat er op dát moment gold per
component. Één samengevoegde key maakt een toekomstige tariefsplitsing tot een
migratieprobleem in plaats van tot een `update` op één catalogusrij. De gelijkheid van
vandaag is een waarde in de data, niet een eigenschap om op te bouwen.

De functie blijft `STABLE`: er wordt niets geschreven, alleen gelezen en gerekend.

### 3.3 Doorgifte naar orders en payments

`tmc.create_order` en `tmc.admin_create_order` schrijven het resultaat al integraal weg in
`orders.pricing_snapshot jsonb NOT NULL`. Het snapshot-precedent staat er dus al en er is
geen nieuwe kolom nodig om de BTW-uitsplitsing te bewaren.

Wel toe te voegen aan `tmc.orders`: `vat_amount_cents integer`, als goedkope
rapportagekolom naast het snapshot, gevuld met `first_charge_vat_amount_cents`.

Van order naar payment: de webhook leest `orders.vat_amount_cents` en
`orders.pricing_snapshot` en vult `payments.vat_amount_cents`, `payments.net_amount_cents`
en `payments.vat_rate_bp`. Bij een recurring-incasso is er geen order; daar komt het tarief
uit de catalogusrij die hoort bij `memberships.plan_variant`, herberekend over
`payment.amount`.

### 3.4 Afronding bij meerdere regels

De regel: **reken per regel af, tel daarna op. Bereken een totaal nooit opnieuw uit het
bruto totaal.**

Dus `vat_total_cents = sum(invoice_lines.vat_cents)` en niet
`round(total_gross_cents * rate / (10000 + rate))`. Bij drie regels van 12,90 met negen
procent geeft de eerste methode 3 x 1,07 = 3,21 en de tweede
`round(3870 * 900 / 10900) = 320`. Een cent verschil, elke keer als er meer dan één regel
op de factuur staat, en de PDF telt zichtbaar niet op.

`finalize_invoice` dwingt dit af door de header-totalen te herberekenen uit de regels en
door de `CHECK` op regelniveau (`gross_cents = net_cents + vat_cents`).

### 3.5 Backfill

Vijf rijen in `tmc.payments`, zeven in `tmc.orders`, negen in `tmc.memberships`. De
backfill is nu vrijwel gratis en over een jaar niet meer.

Voor bestaande `payments`-rijen: `vat_rate_bp`, `net_amount_cents` en `vat_amount_cents`
vullen via de order en de catalogusrij waar die te herleiden is, en op `NULL` laten waar
dat niet kan. `NULL` is hier het eerlijke antwoord en de rapportage in 7.2 telt zulke rijen
apart op als "tarief onbekend" in plaats van ze stil op nul te zetten.

## 4. Facturen

### 4.1 Levenscyclus

```
draft  ──finalize_invoice()──>  finalised
  │                                 │
  │                                 ├── pdf gerenderd en geüpload (write-once)
  │                                 │
  └── vrij te wijzigen              └── onveranderlijk
      en te verwijderen                 crediteringsstand is afgeleid
```

Een concept is gewoon een rij zonder nummer. Er is geen reservering, geen "nummer alvast
toekennen", geen tijdelijk nummer. Zolang de factuur `draft` is heeft hij geen plek in de
reeks, en dat is precies waarom een verwijderd concept geen gat achterlaat.

### 4.2 tmc.finalize_invoice

```
tmc.finalize_invoice(
  p_invoice_id uuid,
  p_issued_at  date default current_date
) returns jsonb
language plpgsql security definer
set search_path to 'tmc','extensions'
```

#### De regel die de volgorde bepaalt

**Alle validatie gebeurt vóór het trekken van het nummer. Vanaf het moment dat het nummer
getrokken is, retourneert de functie nooit meer `ok: false`: elke resterende fout is een
`raise exception`.**

De reden is een eigenschap van plpgsql die makkelijk over het hoofd te zien is: **een
functie die normaal returnt, draait niets terug.** Een `return jsonb_build_object('ok',
false, ...)` is een geslaagde aanroep. Het omliggende statement commit, inclusief alles wat
de functie tot dat moment geschreven heeft. Zou de ophoging van `next_number` al gebeurd
zijn, dan commit die mee terwijl er geen factuur ontstaat, en dat is precies een gat in de
reeks: nummer 7 is verbruikt en er bestaat geen factuur 7.

Alleen een exception rolt de transactie terug en geeft het nummer terug. Vandaar de
tweedeling: tot en met de validatiepoort is `ok: false` het nette antwoord, daarna is
alleen nog `raise` toegestaan.

#### Stappen

1. **Autorisatie.** `if not tmc.is_admin() then raise exception 'Alleen voor admins.'
   using errcode = '42501'; end if;` Zelfde laagdeling als `tmc.admin_cancel_order`: de
   aanroepende server action doet daarnaast `requireAdmin()` in TypeScript.

2. **Rijlock op de factuur.**
   `select * into v_inv from tmc.invoices where id = p_invoice_id for update;`
   Niet gevonden: `return jsonb_build_object('ok', false, 'reason', 'invoice_not_found')`.

3. **Idempotentie.** `if v_inv.status = 'finalised' then return jsonb_build_object('ok',
   true, 'already_finalised', true, 'invoice_number', v_inv.invoice_number); end if;`
   Een dubbelklik of een dubbel ingediend formulier levert geen tweede nummer op. Zelfde
   patroon als `already_activated` in `tmc.activate_order`.

4. **Boekjaar en reeks bepalen uit `p_issued_at`**, niet uit `now()`. Een factuur die je op
   2 januari uitschrijft over december hoort in het boekjaar van december, en `now()` zou
   hem in het verkeerde jaar en dus in de verkeerde tellerrij zetten. `v_code` en
   `v_prefix` volgen uit `v_inv.is_test`.

5. **Reeksrij aanmaken indien nodig en vergrendelen, zonder het nummer te consumeren.**
   Zie 4.3, fase 1. Vanaf hier houdt deze transactie het slot op de tellerrij tot commit of
   rollback, dus alles wat hierna gelezen wordt over deze reeks is geserialiseerd.

6. **Validatiepoort.** Alles hier retourneert `ok: false` en er is nog geen nummer
   verbruikt. Vier controles, in deze volgorde:

   - **6a. Regels aanwezig.** Nul regels: `reason: 'no_lines'`.
   - **6b. Totalen.** Herberekenen uit `tmc.invoice_lines`: `sum(net_cents)`,
     `sum(vat_cents)`, `sum(gross_cents)`. Klopt `gross <> net + vat`:
     `reason: 'totals_mismatch'`.
   - **6c. Afnemergegevens samenstellen en controleren.** De `bill_to_*`-waarden worden
     berekend in lokale variabelen: uit `tmc.profiles` overnemen, maar **alleen waar het
     veld op de factuur nog `null` is**, want een admin mag ze op het concept gecorrigeerd
     hebben en die correctie mag niet overschreven worden. Is `bill_to_name` of
     `bill_to_email` daarna nog leeg: `reason: 'incomplete_bill_to'`. Er wordt in deze
     stap **niets geschreven**; het wegschrijven gebeurt pas in stap 9.
   - **6d. Chronologie.** Zie 4.4. Ligt `p_issued_at` vóór de `issued_at` van de laatst
     gefinaliseerde factuur in deze reeks: `reason: 'issued_at_before_last'`. Deze lezing
     staat bewust ná stap 5, onder het slot.

7. **Nummer trekken.** Zie 4.3, fase 2. Eén statement, onder het al gehouden slot.

8. **Nummer samenstellen.**
   `v_invoice_number := v_prefix || v_year::text || '.' || lpad(v_number::text, 3, '0')`
   Levert `2026.001` en degradeert netjes naar `2026.1000` voorbij 999.

9. **Wegschrijven.** `status = 'finalised'`, plus `number`, `invoice_number`,
   `fiscal_year`, `issued_at`, `series_id`, de drie totaalbedragen en de in 6c berekende
   `bill_to_*`-waarden. Faalt dit onverhoopt op een constraint, dan is dat een exception en
   rolt alles inclusief het nummer terug. Dat is het gewenste gedrag en er komt hier dus
   geen `exception`-handler omheen die het naar `ok: false` zou vertalen.

10. **Return.** `jsonb_build_object('ok', true, 'already_finalised', false, 'invoice_id',
    ..., 'invoice_number', ...)`.

**Wat bewust niet in de RPC zit: de PDF.** Die is Node-werk (`@react-pdf/renderer`). De RPC
kent het nummer toe en bevriest de gegevens; een aparte server action rendert, uploadt en
stempelt `pdf_path`. Faalt de PDF-stap, dan is de factuur nog steeds correct genummerd en
opnieuw te renderen. De omgekeerde volgorde zou PDF's zonder nummer kunnen opleveren, en
een PDF zonder nummer is geen factuur.

### 4.3 Het nummer trekken: vergrendelen, valideren, dan pas consumeren

Twee statements, met de validatiepoort van 4.2 ertussen. Ze horen bij elkaar en de volgorde
is niet vrij.

**Fase 1, stap 5 van 4.2: rij verzekeren en vergrendelen zonder te consumeren.**

```sql
insert into tmc.invoice_series (code, fiscal_year, is_test, prefix, next_number)
values (v_code, v_year, v_is_test, v_prefix, 1)
on conflict (code, fiscal_year)
do update set next_number = tmc.invoice_series.next_number
returning id, next_number
into v_series_id, v_next_number;
```

De `do update set next_number = tmc.invoice_series.next_number` is een zelftoekenning: de
waarde verandert niet, maar Postgres schrijft wel een nieuwe rijversie en **neemt daarmee
het rijslot**, dat tot commit of rollback gehouden wordt. Bestond de rij nog niet, dan
wordt hij aangemaakt met `next_number = 1` en is hij door de insert zelf vergrendeld.

Twee eigenschappen die dit statement precies geschikt maken:

- Het retourneert **altijd exact één rij**, of het nu invoegde of bijwerkte. Er is geen tak
  waarin `v_series_id` `NULL` kan worden.
- Het houdt het slot vast gedurende de rest van de transactie. Een tweede transactie die
  hetzelfde statement uitvoert blokkeert hier, en niet ergens verderop.

**Fase 2, stap 7 van 4.2: consumeren.**

```sql
update tmc.invoice_series
set next_number = next_number + 1
where id = v_series_id
returning next_number - 1
into v_number;
```

Deze update draait onder het slot dat fase 1 al genomen heeft, dus er is geen venster
tussen lezen en ophogen. Voor een verse reeksrij gaat `next_number` van 1 naar 2 en levert
`returning next_number - 1` het getal 1 op: de eerste factuur van het boekjaar krijgt
nummer 1. Voor elke volgende factuur geeft hij de oude waarde terug, precies het nummer dat
deze factuur moet krijgen.

Bij een rollback van de omliggende transactie wordt de ophoging teruggedraaid en is het
nummer weer beschikbaar. De reeks blijft aaneengesloten.

**Waarom niet alles in één statement.** De eerdere opzet trok het nummer in één
`insert ... on conflict do update set next_number = next_number + 1`. Dat is atomair, maar
het consumeert het nummer op het moment dat het de rij vergrendelt, en dus vóór de
validatie. Elke validatie die daarna nog `ok: false` retourneert verbruikt dan een nummer
zonder factuur (zie de regel bovenaan 4.2), en de chronologiecontrole zou nog steeds buiten
het slot moeten lezen (zie 4.4). Vergrendelen en consumeren zijn twee verschillende
behoeftes en die vallen niet op hetzelfde moment.

**Waarom `insert ... on conflict do nothing` gevolgd door `select ... for update` fout is.**

Die variant heeft een NULL-race bij rollback. Twee transacties, T1 en T2, willen allebei de
eerste factuur van een nieuw boekjaar finaliseren:

1. T1 doet de insert en slaagt. De rij bestaat, maar is nog niet gecommit.
2. T2 doet dezelfde insert. Die botst op de unique index en blokkeert tot T1 klaar is.
3. T1 rolt terug, bijvoorbeeld omdat stap 9 van 4.2 op een constraint stukloopt of omdat de
   omliggende transactie expliciet wordt teruggedraaid.
4. T2 deblokkeert. De conflicterende rij is verdwenen, en `ON CONFLICT DO NOTHING` heeft de
   insert al als conflict afgehandeld: er wordt niets ingevoegd en er wordt niets
   geretourneerd.
5. T2 doet vervolgens `select ... for update` en vindt **geen rij**.
6. `v_series` is `NULL`. `v_series.next_number` is `NULL`, `v_series.prefix` is `NULL`, en
   het samengestelde `invoice_number` wordt `NULL` of een string als `.001`.

Het faalt dus niet luidruchtig op een lock-conflict maar stil op een NULL, en wat eruit
komt is een factuur zonder bruikbaar nummer. `DO NOTHING` neemt bovendien geen slot op de
conflicterende rij, dus zelfs het gelukkige pad leunt op de aanname dat de rij er na de
insert gegarandeerd staat, en die aanname is bij een gelijktijdige rollback simpelweg niet
waar. De zelftoekenning uit fase 1 heeft dit probleem niet: `DO UPDATE` retourneert altijd
exact één rij en neemt altijd het slot, of hij nu invoegde of bijwerkte.

**Waarom geen `SEQUENCE`.** Een Postgres-sequence is niet-transactioneel. Een teruggedraaide
transactie verbrandt een nummer en laat een gat achter. Voor een technische sleutel is dat
prima, voor een factuurreeks niet: een gat suggereert een verdwenen factuur. Een tellerrij
in een gewone tabel volgt de transactie wel, en dat is hier de hele reden van bestaan.

### 4.4 Nummerformaat en chronologie

Formaat: `{prefix}{jaar}.{volgnummer met drie posities}`, dus `2026.001` en `TEST-2026.001`.

De chronologie-eis uit stap 6d van 4.2:

```sql
select max(issued_at) into v_last_issued
from tmc.invoices
where series_id = v_series_id and status = 'finalised';

if v_last_issued is not null and p_issued_at < v_last_issued then
  return jsonb_build_object('ok', false, 'reason', 'issued_at_before_last',
                            'last_issued_at', v_last_issued);
end if;
```

Waarom: een oplopende nummering waarbij de datums door elkaar lopen is intern
inconsistent. Als `2026.007` op 3 maart staat en `2026.008` op 28 februari, dan is niet
meer te zeggen welke factuur eerder was. Gelijke datums zijn wel toegestaan, want meerdere
facturen op één dag is normaal.

**Deze lezing moet ná het slot uit 4.3 fase 1 staan, en dat is niet vrijblijvend.** Zonder
dat slot leest de query buiten elke serialisatie en dan houdt de controle niets tegen. Twee
gelijktijdige finalisaties, T1 met `issued_at = 2026-03-10` en T2 met `2026-03-05`, in een
reeks waarvan de laatste factuur op `2026-03-01` staat:

1. T1 leest `max(issued_at) = 2026-03-01`. 10 maart ligt daarna, dus akkoord.
2. T2 leest óók `2026-03-01`, want T1 heeft nog niets gecommit. 5 maart ligt daarna, dus
   ook akkoord.
3. Beide trekken een nummer en committen. T1 krijgt bijvoorbeeld 7, T2 krijgt 8.
4. Resultaat: `2026.007` op 10 maart en `2026.008` op 5 maart. Precies de omgekeerde
   volgorde die de controle moest voorkomen, en beide aanroepen meldden succes.

Met het slot uit fase 1 kan dit niet: T2 blokkeert op de tellerrij tot T1 gecommit heeft,
leest daarna `max(issued_at) = 2026-03-10` en wordt netjes geweigerd met
`issued_at_before_last`. Dat de reeksrij tegelijk de nummerteller en de chronologie-poort
bewaakt is geen toeval: het zijn twee eigenschappen van dezelfde reeks en ze horen onder
hetzelfde slot.

Praktisch gevolg: een factuur met terugwerkende kracht kan alleen zolang er nog niets
later in dezelfde reeks gefinaliseerd is. Dat is een echte beperking en het is de bedoeling.

### 4.5 Onveranderlijkheid na finaliseren

Trigger `invoices_finalised_immutable`, `BEFORE UPDATE ON tmc.invoices FOR EACH ROW`:

- `OLD.status = 'draft'`: alles toegestaan.
- `OLD.status = 'finalised'`: alleen `pdf_path`, `pdf_generated_at` en `updated_at` mogen
  wijzigen. Elke andere kolomwijziging geeft
  `raise exception 'Gefinaliseerde factuur is onveranderlijk.' using errcode = 'P0001'`.

**`pdf_path` en `pdf_generated_at` zijn write-once.** De trigger weigert een tweede
schrijfactie:

```
if OLD.pdf_path is not null and NEW.pdf_path is distinct from OLD.pdf_path then
  raise exception 'pdf_path is write-once.' using errcode = 'P0001';
end if;
```

De reden: een tweede render kan een andere PDF opleveren dan de klant ontving, bijvoorbeeld
omdat het sjabloon, het logo of het adres van TMC intussen is aangepast. Zodra de PDF er is
is dat het document, en het pad ernaartoe verandert niet meer. Moet er echt opnieuw
gerenderd worden, dan is dat een nieuwe factuur of een creditnota plus een nieuwe factuur,
en dat is een boekhoudkundige handeling, geen technische.

Een trigger `BEFORE DELETE`: `finalised` mag niet verwijderd worden. `draft` wel.

### 4.6 Crediteren

**`invoices.status` kent alleen `draft` en `finalised`.** Er is geen status `credited`.

De crediteringsstand is afgeleid uit de gekoppelde creditnota's:

```sql
create or replace view tmc.v_invoice_credit_state as
select
  i.id                                             as invoice_id,
  i.total_gross_cents,
  coalesce(-sum(c.total_gross_cents), 0)           as credited_gross_cents,
  case
    when coalesce(-sum(c.total_gross_cents), 0) = 0                     then 'none'
    when coalesce(-sum(c.total_gross_cents), 0) >= i.total_gross_cents  then 'full'
    else 'partial'
  end                                              as credit_state
from tmc.invoices i
left join tmc.invoices c
  on c.credit_of_invoice_id = i.id and c.status = 'finalised'
where i.status = 'finalised' and i.credit_of_invoice_id is null
group by i.id, i.total_gross_cents;
```

**Waarom afgeleid en niet als status.** Deels crediteren bestaat: een lid betaalt 149,00
voor een abonnement en krijgt 40,00 terug omdat de studio twee weken dicht was. Met een
statuskolom moet je dan kiezen tussen `credited` (onwaar, er staat nog 109,00 open) en
`finalised` (onvolledig, er is wel degelijk gecrediteerd). Elke keuze is fout en de derde
optie is een extra status plus een bedrag, en dan heb je twee bronnen van waarheid die
kunnen gaan afwijken. Afleiden uit de creditnota's kan per definitie niet afwijken, want de
creditnota's zijn het bewijs.

Een creditnota is verder een volstrekt gewone factuurrij:

- `credit_of_invoice_id` verwijst naar de oorspronkelijke factuur
- alle bedragen op de regels zijn negatief
- het nummer komt uit dezelfde reeks
- hij wordt gefinaliseerd met dezelfde `finalize_invoice`

Geen aparte tabel, geen aparte RPC, geen aparte PDF-route. Alleen het sjabloon zet een
andere kop en toont de verwijzing naar het gecrediteerde nummer.

### 4.7 Van Mollie-refund naar creditnota naar omzetregel

Zie sectie 6 van het discovery-rapport en de bevinding in 4.8. Het pad:

1. Admin betaalt terug in het Mollie-dashboard, of via een latere admin-actie in het cockpit.
2. Mollie roept de webhook van de betaling aan zodra de refund-status verandert.
3. De webhook haalt de payment op, leest `payment.amountRefunded` en schrijft
   `payments.refunded_amount_cents` en `payments.refunded_at`. **`payments.status` blijft
   `paid`.**
4. Als er een gefinaliseerde factuur aan die payment hangt, komt er een signaal in het
   cockpit: "betaling gedeeltelijk of volledig terugbetaald, factuur `2026.014` is nog
   niet gecrediteerd."
5. De admin maakt de creditnota aan en finaliseert die. **Nooit automatisch.** Crediteren is
   een boekhoudkundige handeling met een datum en een bedrag die iemand moet willen.
6. De omzetrapportage trekt het terugbetaalde bedrag af in de periode van de refund, niet
   in de periode van de oorspronkelijke betaling. Zie 7.4.

### 4.8 Bevinding: wat een refund in Mollie API v2 werkelijk doet

Geverifieerd tegen `@mollie/api-client` versie 4.5.0 zoals geïnstalleerd
(`package.json`: `^4.5.0`, `node_modules/@mollie/api-client/package.json`: `4.5.0`).

`PaymentStatus` in `dist/types/data/payments/data.d.ts` regel 1023 kent zeven waarden:

```
open, canceled, pending, authorized, expired, failed, paid
```

Er is **geen** `refunded`. Die waarde bestond in API v1 en is in v2 verdwenen.

`PaymentData` heeft wel `amountRefunded?: Amount` (regel 103) en `amountRemaining?: Amount`
(regel 109), met de documentatie erbij: "The total amount that is already refunded. Only
available when refunds are available for this payment."

De refund zelf is een aparte resource met een eigen `RefundStatus`
(`dist/types/data/refunds/data.d.ts` regel 92): `queued`, `pending`, `canceled`,
`processing`, `failed`, `refunded`. De client heeft er binders voor
(`paymentRefunds`, `refunds`).

**Conclusie: een refund laat de payment-status ongemoeid en vult alleen `amountRefunded`.**
De payment blijft `paid`.

Consequenties voor het ontwerp:

- De zorg uit het discovery-rapport dat een refund-webhook de `paid`-regel zou overschrijven
  met `refunded` en zo de historie zou wissen, is **onjuist voor API v2**. Dat kan niet
  gebeuren.
- Het werkelijke probleem is subtieler en stiller: de webhook vuurt wel, de code haalt de
  payment opnieuw op, `payment.status` is nog steeds `paid`, de upsert schrijft dezelfde rij
  ongewijzigd terug en `amountRefunded` valt op de grond. **Restituties zijn nu onzichtbaar,
  niet destructief.**
- De waarde `refunded` in `payments_status_check` is daarmee dode ruimte: Mollie kan hem
  nooit produceren. De constraint blijft ongewijzigd (verwijderen levert niets op en kost
  een migratie), maar de webhook schrijft hem nooit. De restitutiestand woont in
  `refunded_amount_cents`, niet in `status`.
- `PaymentStatusBadge` in `src/app/app/facturen/_components/` heeft een label "Teruggestort"
  voor status `refunded`. Dat label wordt nooit getoond. De badge moet in plaats daarvan op
  `refunded_amount_cents > 0` reageren.

## 5. PDF-generatie en uitlevering

### 5.1 Waarom de PDF buiten de RPC blijft

Zie de toelichting bij 4.2. Kort: nummer eerst, document daarna. Een mislukte render laat
een correct genummerde factuur achter die opnieuw gerenderd kan worden; een mislukte
nummertoekenning na een geslaagde render laat een PDF zonder nummer achter.

### 5.2 Sjabloon

Basis: `src/pdfs/TrainerInvoicePdf.tsx` (`@react-pdf/renderer` 4.5.1), dat aantoonbaar werkt
op de Vercel Node-runtime via `src/app/api/admin/trainers/[id]/invoice/route.ts`
(`renderToBuffer`, `runtime = "nodejs"`).

Nieuw bestand `src/pdfs/CustomerInvoicePdf.tsx`, met wat de trainer-declaratie niet heeft:

- BTW-uitsplitsing per tarief, uit een `group by vat_rate_bp` over de regels
- KvK en BTW-nummer van TMC, uit Sanity met `src/lib/constants.ts` als fallback (zie 1.5)
- Afnemergegevens uit de bevroren `bill_to_*`-kolommen
- Creditnota-variant: andere kop en een regel "Creditnota bij factuur 2026.014"

Belangrijk onderscheid dat in de code een comment verdient: de bestaande
`TrainerInvoicePdf` is een declaratie van een zelfstandige aan TMC en geen verkoopfactuur.
Het nummerformaat daar (`TMC-202603-A1B2C3D4`) is deterministisch per trainer per maand,
geen reeks, en is uitdrukkelijk **geen** precedent voor de nummering in deze spec.

### 5.3 Bucket tmc-invoices

Nieuwe bucket, `public = false`.

- Pad: `{profile_id}/{invoice_number}.pdf`
- Geen RLS-policies op `storage.objects` voor deze bucket, dus uitsluitend bereikbaar via
  `service_role`. Dat is hetzelfde patroon als de bestaande `tmc-medical-attestations`.
- `allowed_mime_types: ['application/pdf']`, `file_size_limit` op een paar MB.

Let op bij het aanmaken: het Supabase-project is gedeeld met andere projecten (`tvmuur-*`,
`cinewall-previews`, `offerte-tekeningen`). De `tmc-`-prefix is daar de scheiding en die
houden we aan.

### 5.4 Signed-URL-patroon

Dit wordt het eerste signed-URL-patroon in de codebase: er is op dit moment nul voorkomens
van `createSignedUrl`, het enige storage-gebruik is `getPublicUrl("tmc-avatars")` in
`src/lib/actions/profile.ts`.

Server action `getInvoiceDownloadUrl(invoiceId)`:

1. Cookie-client, `auth.getUser()`.
2. Factuur ophalen via de cookie-client, zodat RLS de autorisatie doet: een lid krijgt
   alleen zijn eigen gefinaliseerde niet-test-factuur, een admin krijgt alles.
3. Geen `pdf_path`: nette foutmelding terug, geen 500.
4. `createAdminClient().storage.from('tmc-invoices').createSignedUrl(pdf_path, 300)`.
5. URL teruggeven.

Vijf minuten TTL. De URL wordt direct gevolgd, hij hoeft niet gedeeld te kunnen worden, en
een korte TTL beperkt de schade als hij in een logbestand of een chatgeschiedenis belandt.

Nadrukkelijk niet: de bucket publiek maken en het pad raden onmogelijk maken met een UUID.
Facturen bevatten NAW-gegevens en een raadbaar-maar-lang pad is geen autorisatie.

### 5.5 E-mail: link in plaats van bijlage

`src/lib/email.ts` (`sendEmail({ to, toName, subject, react })`) ondersteunt HTML en
plaintext. De MailerSend-SDK kent `.setAttachments()`, maar dat is niet aangesloten en geen
van de vijftien templates in `src/emails/` heeft een bijlage.

Voorstel: **niet aansluiten.** De factuurmail bevat een knop naar `/app/facturen`, waar de
download achter de signed URL zit. Redenen:

- De PDF staat toch al in de portal, dus een bijlage is een tweede kopie die kan verouderen.
- Bijlagen drukken de deliverability, en dit is transactionele post die aan moet komen.
- Geen PDF in de mailbox van MailerSend en niet in de doorstuurketen van de ontvanger.

Wie later toch een bijlage wil: `sendEmail` uitbreiden met een optionele `attachments`-array
is een kleine wijziging, maar hij hoort niet in deze spec thuis.

## 6. Testmodus

### 6.1 Het uitgangspunt: tmc.profiles.is_test

**De testmodus draait op `tmc.profiles.is_test`. Een testorder is uitsluitend toegestaan op
een testprofiel.**

Dat is de enige invariant die deze sectie nodig heeft. Alles wat volgt is een gevolg.

Afgedwongen in `tmc.create_order` en `tmc.admin_create_order`: bij het aanmaken van een
order wordt `profiles.is_test` gelezen en dat bepaalt de modus. Er is geen parameter
waarmee een aanroeper de modus kan kiezen, dus er is geen manier om per ongeluk een
testorder op een echt profiel te zetten.

`payments.is_test` en `invoices.is_test` blijven bestaan als **afgeleide snapshotkolom**.
Ze worden gevuld uit het profiel op het moment van schrijven. Dat is redundant, en dat is
de bedoeling: een rapportagequery over miljoenen betaalregels wil niet elke keer naar
`profiles` joinen, en een factuur moet zijn eigen `is_test` dragen omdat hij een bevroren
document is.

### 6.2 Waarom een testmembership op een echt profiel gevaarlijk is

Dit is de kern van de correctie en het verdient uitschrijven, want "het is netjes
gescheiden" is een te zwak argument voor een structurele keuze.

Een membership is geen administratieve rij. Het is een **entitlement** dat rechten uitdeelt
in drie systemen die niets van een testvlag weten:

**Entitlements en boekingsrechten.** `tmc.memberships` draagt `frequency_cap`,
`covered_pillars`, `credits_remaining` en `credits_expires_at`. De boekingslogica in
`src/lib/member/booking-actions.ts` en `tmc.book_class_session` leest die velden en beslist
of iemand mag boeken. Een testmembership op een echt profiel geeft dat lid dus echte
boekingsrechten die het niet gekocht heeft, of, bij een testmembership met een lagere
`frequency_cap` dan het echte, ontneemt het rechten die wel betaald zijn. Beide kanten zijn
fout en geen van beide valt op tot een lid klaagt.

**Boekingscapaciteit.** Een boeking gemaakt vanuit een testmembership bezet een echte plek
in `class_sessions.capacity`. Bij maximaal zes deelnemers per groep is dat direct merkbaar:
een echt lid komt op de wachtlijst voor een sessie die vol lijkt maar het niet is. De
capaciteitsbewaking (`20260811000000_enforce_session_capacity.sql`) telt rijen, niet
bedoelingen. En de wachtlijst-promotiecron zou vervolgens een echt lid promoveren op basis
van een geannuleerde testboeking, met een e-mail erachteraan.

**Fysieke toegang via Akiles.** Zie `spec-akiles-access.md`. Toegang tot de studio hangt aan
een actief membership. Een testmembership op een echt profiel is daarmee geen
administratief detail maar een sleutel tot het pand. En omgekeerd: als iemand een
testmembership opruimt terwijl het echte membership van datzelfde profiel per ongeluk
meegaat, staat een betalend lid voor een dichte deur.

Met `profiles.is_test` bestaat geen van deze scenario's, want een testprofiel is een ander
profiel. Het heeft geen echte boekingen, komt niet in de rooster-capaciteit van echte leden
terecht behalve waar je dat expliciet test, en krijgt hooguit toegang tot de studio via een
testpasje dat je bewust uitgeeft of niet.

### 6.3 De propagatieketen

Er zijn twee ketens, want er zijn twee soorten betalers: leden met een profiel, en bezoekers
zonder.

**Keten 1, alles met een profiel.**

```
tmc.profiles.is_test                    de bron, handmatig gezet op testaccounts
        │
        ├── create_order / admin_create_order lezen het profiel
        │        │
        │        └── de modus bepaalt welke Mollie-key en welke webhook-URL
        │
        ├── webhook schrijft payments.is_test           (snapshot)
        │
        └── finalize_invoice schrijft invoices.is_test  (snapshot)
```

**Keten 2, de publieke proefles.**

```
trialBookingMode()                      afgeleid van VERCEL_ENV, geen bezoekersinvoer
        │
        ├── bepaalt de Mollie-key en de webhook-URL van de proeflesbetaling
        │
        ├── schrijft trial_bookings.is_test             (de bron voor deze keten)
        │
        └── trial-webhook schrijft payments.is_test     (snapshot, uit trial_bookings)
```

Zie 2.9 voor de reden dat deze keten een eigen bron nodig heeft en voor de
capaciteitsvoorwaarde die eraan vastzit.

`tmc.orders` en `tmc.memberships` krijgen **geen** `is_test`-kolom. Ze hebben er geen nodig:
`orders.profile_id` en `memberships.profile_id` zijn verplicht, dus de modus is één join
ver. En omdat de rapportage niet over orders of memberships gaat maar over payments, is die
join nergens op een heet pad.

`tmc.trial_bookings` is de enige uitzondering, en precies omdat daar geen `profile_id` staat
om overheen te joinen.

### 6.4 Wat hierdoor niet meer nodig is

Het eerdere voorstel wilde `is_test` op `orders` en `memberships` en moest daarom twee
bestaande structuren aanpassen. Met `profiles.is_test` vervallen allebei:

**`tmc.orders_one_open_subscription_idx` blijft ongewijzigd.**

```
CREATE UNIQUE INDEX orders_one_open_subscription_idx ON tmc.orders
  USING btree (profile_id)
  WHERE ((kind = 'subscription') AND (status = ANY (ARRAY['draft','pending'])))
```

De index is uniek op `profile_id`. Een testprofiel en een echt profiel zijn verschillende
`profile_id`'s, dus een openstaande testorder en een openstaande echte order kunnen per
definitie niet op dezelfde indexrij botsen. De invariant die de index bewaakt, namelijk
"één open abonnementsorder per persoon", blijft in beide modi exact even scherp. Met
`is_test` op `orders` had de index-key uitgebreid moeten worden en was die invariant
opgerekt tot "één per persoon per modus", wat zwakker is dan wat er nu staat.

**De duplicate-membership-guard in `tmc.activate_order` blijft ongewijzigd.**

```
select id into v_existing_id
from tmc.memberships
where profile_id = v_order.profile_id
  and status in ('pending','active','paused','cancellation_requested')
limit 1;
```

Dezelfde redenering: de guard is gescopet op `profile_id`. Een testprofiel heeft alleen
testmemberships, een echt profiel alleen echte. De guard vindt nooit een membership uit de
andere modus, dus hij blokkeert nooit ten onrechte en laat nooit ten onrechte door. Met
`is_test` op `memberships` had de guard een extra conditie gekregen en daarmee een tweede
manier om fout te gaan, precies in de functie die geld verwerkt.

Dit is de winst van de correctie: twee bestaande, werkende, geld-kritieke structuren blijven
onaangeraakt.

### 6.5 Webhook-modusrouting

**Het probleem.** Een Mollie payment-id verraadt de modus niet. Zowel een testbetaling als
een echte betaling heeft een id van de vorm `tr_xxxxxxxx`. De webhook krijgt alleen dat id
binnen (form-encoded veld `id`) en moet dan al weten met welke key hij
`mollie.payments.get(id)` moet aanroepen.

Beide keys proberen is geen oplossing: een live payment ophalen met een testkey geeft een
404 en andersom ook, dus je zou op een 404 moeten terugvallen op de andere key. Dat is twee
API-calls op het hete pad, het maakt een echte 404 (verwijderde payment, verkeerde id)
ononderscheidbaar van een modus-mismatch, en het laat een aanvaller de andere key
aanroepen door een willekeurig id te posten.

**De oplossing: wij bepalen de webhook-URL zelf.** Mollie roept exact de URL aan die wij bij
het aanmaken van de payment of de subscription hebben meegegeven, en slaat die per resource
op. Dus zetten we de modus in die URL.

`src/lib/site-url.ts` krijgt een parameter:

```ts
export type MollieMode = "live" | "test";

export function mollieWebhookUrl(mode: MollieMode): string
```

Opbouw met `URLSearchParams` in plaats van string-concatenatie, want er staat al een
query-parameter op preview en `?`-versus-`&` met de hand is precies waar dit soort dingen
misgaat:

```
base = `${siteUrl()}/api/mollie/webhook`
params = new URLSearchParams()
if (mode === "test") params.set("mode", "test")
if (VERCEL_ENV === "preview" && VERCEL_AUTOMATION_BYPASS_SECRET)
    params.set("x-vercel-protection-bypass", VERCEL_AUTOMATION_BYPASS_SECRET)
return params.size ? `${base}?${params}` : base
```

Twee eigenschappen die bewust zo zijn:

- **`mode` wordt alleen gezet voor `test`.** De afwezigheid van de parameter betekent live.
  Dat is nodig voor achterwaartse compatibiliteit: elke bestaande subscription in Mollie
  heeft een opgeslagen webhook-URL zonder `mode`, en die subscriptions blijven jaren lopen.
  Zou de route een verplichte parameter eisen, dan brak elke lopende incasso op het moment
  van deployen.
- **De bypass-parameter blijft ongewijzigd werken** en kan naast `mode` staan. De
  `URLSearchParams`-opbouw dekt alle vier de combinaties zonder speciale gevallen.

**In de route.** `src/app/api/mollie/webhook/route.ts` leest de modus uit de eigen URL:

```
const mode = new URL(request.url).searchParams.get("mode") === "test" ? "test" : "live";
const mollie = getMollieClient(mode);
```

Whitelist, geen vrije doorgifte: alles wat niet exact `test` is, is `live`.

**Is dit veilig?** De parameter staat in een publieke URL en is dus door iedereen te zetten.
Dat is geen probleem, want de parameter selecteert alleen met welke key we de payment bij
Mollie **ophalen**. Wie `?mode=test` erop plakt met een live payment-id, krijgt van Mollie
een 404 en de handler stopt. Er wordt niets geschreven op basis van de parameter zelf; alles
wat de handler daarna doet komt uit het antwoord van Mollie. Er is geen pad waarlangs een
gemanipuleerde `mode` een rij aanmaakt of wijzigt.

Wat wel moet: de handler mag bij een mislukte `payments.get` niet stil doorlopen. Nu vangt
de buitenste `try/catch` dat af en retourneert `{ ok: true }`. Dat blijft zo (Mollie mag
niet gaan retryen), maar er komt een `console.error` met het id en de gekozen modus bij,
zodat een modus-mismatch in de logs zichtbaar is in plaats van als stilte.

### 6.6 Twee env-vars en een Map in plaats van een cache

`src/lib/mollie.ts` heeft nu:

```ts
let cached: MollieClient | null = null;

export function getMollieClient(): MollieClient | null {
  if (cached) return cached;
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return null;
  cached = createMollieClient({ apiKey });
  return cached;
}
```

Die module-level `cached` maakt twee modi in één proces onmogelijk: de eerste aanroep wint
en elke volgende krijgt diezelfde client, ongeacht wat er gevraagd wordt. Vervangen door een
`Map` op modus:

```ts
const clients = new Map<MollieMode, MollieClient>();

export function getMollieClient(mode: MollieMode): MollieClient | null {
  const existing = clients.get(mode);
  if (existing) return existing;
  const apiKey = mode === "test"
    ? process.env.MOLLIE_API_KEY_TEST
    : process.env.MOLLIE_API_KEY_LIVE;
  if (!apiKey) return null;
  const client = createMollieClient({ apiKey });
  clients.set(mode, client);
  return client;
}
```

**Twee env-vars:** `MOLLIE_API_KEY_LIVE` en `MOLLIE_API_KEY_TEST`. De oude `MOLLIE_API_KEY`
verdwijnt. Geen fallback van `MOLLIE_API_KEY_LIVE` naar `MOLLIE_API_KEY`, want een stille
fallback op een key waarvan niemand meer weet of hij test of live is, is precies het
probleem dat we oplossen.

`isMollieConfigured()` krijgt dezelfde parameter.

**Alle aanroepplaatsen krijgen een modus.** Dit is de grootste mechanische wijziging van
deze spec, dus hier de volledige lijst zoals aanwezig op `main`:

| Bestand | Regel | Waar de modus vandaan komt |
|---|---|---|
| `src/app/api/mollie/webhook/route.ts` | 81 | query-parameter `mode` |
| `src/app/api/trial-bookings/webhook/route.ts` | 17 | query-parameter `mode`, zelfde patroon |
| `src/lib/orders/create-order.ts` | 189 | `profiles.is_test` van de koper |
| `src/lib/orders/payment-link.ts` | 24 | `profiles.is_test` via `orders.profile_id` |
| `src/lib/actions/trial-booking.ts` | 109 | `trialBookingMode()`, en dezelfde waarde gaat als `is_test` mee in de `trial_bookings`-insert (zie 2.9) |
| `src/app/betaal/[token]/page.tsx` | 81 | `profiles.is_test` via de order achter het token |
| `src/app/api/cron/expire-orders/route.ts` | 123 | per order, uit `profiles.is_test` |
| `src/lib/admin/membership-lifecycle.ts` | 730 | `isMollieConfigured(mode)`, modus uit het membership |

Plus de vijf helpers binnen `src/lib/mollie.ts` zelf (`cancelMollieSubscription`,
`getMollieSubscriptionInfo`, `hasValidMollieMandate`, `updateMollieSubscriptionAmount`,
`createMollieRecurringSubscription`), die allemaal een `mode`-parameter krijgen en
doorgeven.

Let op bij `expire-orders`: die cron loopt over meerdere orders in één run en die kunnen in
verschillende modi zitten. De modus moet daar per order bepaald worden, niet één keer per
run.

En bij `createMollieRecurringSubscription`: de `webhookUrl` die daar wordt meegegeven moet
de modus dragen, anders komen recurring-incasso's van een testabonnement binnen op de
live-route.

### 6.7 De TEST-reeks

Rij in `tmc.invoice_series` met `code = 'TEST'`, `prefix = 'TEST-'`, `is_test = true`, per
boekjaar. `finalize_invoice` kiest de reeks op `v_inv.is_test`, dus er is geen aparte code
en geen aparte RPC.

Resultaat: `TEST-2026.001` naast `2026.001`, met onafhankelijke tellers.

### 6.8 Zichtbaarheid: waar testdata mag verschijnen

| Plek | Testdata |
|---|---|
| `/app/facturen` (lid) | nooit, dubbel gefilterd: RLS-policy en query |
| Ledenlijst en ledendetail admin | wel, met een zichtbare markering op de rij |
| Omzetrapportage en CSV-export | nooit, tenzij de admin de toggle expliciet omzet |
| `tmc.vw_admin_kpis` | nooit |
| ntfy-meldingen | wel, met `[TEST]` in de titel |
| Transactionele e-mail naar het lid | wel, want dat is precies wat je wil testen |

De ntfy-markering is geen detail: zonder die prefix is een testbetaling in het meldingskanaal
niet te onderscheiden van een echte verkoop, en dan leert het team het kanaal te wantrouwen.

### 6.9 Testdata opruimen

Geen cron, geen automatiek. Een gedocumenteerd script dat op `profiles.is_test = true`
selecteert en de afhankelijke rijen in de juiste volgorde verwijdert.

Wat er niet gebeurt: gefinaliseerde testfacturen verwijderen. Die blijven staan, met hun
nummer, in hun eigen reeks. De TEST-reeks is dan aaneengesloten en dat is nuttig, want als
je de reeks van de testmodus mag doorbreken test je niet meer wat de echte reeks doet.

## 7. Omzetrapportage

### 7.1 Waarom vw_admin_kpis niet de plek is

`tmc.vw_admin_kpis` is een materialized view (in `pg_matviews`, schema `tmc`) met negen
CTE's die één rij oplevert. `mrr_cents` daarin is:

```
sum(price_per_cycle_cents * 30.4375 / (billing_cycle_weeks * 7)) over memberships met status 'active'
```

Dat is contractwaarde: wat de lopende abonnementen per maand zouden opleveren als er niets
verandert. Het is een vooruitblik en het is nuttig. Het is alleen geen omzet: het raakt
`tmc.payments` nergens aan, telt een mislukte incasso gewoon mee, en weet niets van
losse producten, PT-pakketten of proeflessen.

Er is op dit moment dus geen enkele gerealiseerde-omzetrapportage in het systeem. Die komt
naast de KPI-view te staan, niet erin.

### 7.2 De omzetview

Nieuwe view `tmc.v_revenue_lines`, één rij per betaalde betaalregel, verrijkt met de
productgroep:

```
period_month         date          -- date_trunc('month', paid_at)
paid_at              timestamptz
refunded_at          timestamptz
payment_id           uuid
profile_id           uuid
revenue_category     text          -- uit catalogue via order.catalogue_slug of membership.plan_variant
vat_rate_bp          integer       -- payments.vat_rate_bp, het bevroren snapshot; null waar onbekend
gross_cents          integer       -- payments.amount_cents
vat_cents            integer       -- payments.vat_amount_cents
net_cents            integer       -- payments.net_amount_cents
refunded_cents       integer       -- payments.refunded_amount_cents
refunded_vat_cents   integer       -- zie hieronder; null als vat_rate_bp null is
refunded_net_cents   integer       -- zie hieronder; null als vat_rate_bp null is
kind                 text
```

Met `where status = 'paid' and is_test = false` als basisfilter.

De rapportagequery in het cockpit groepeert daarover op maand en `revenue_category`, en
toont netto, BTW en bruto per groep plus een totaal.

Rijen met `vat_rate_bp is null` (historische betalingen uit 3.5) komen als aparte groep
"tarief onbekend" in beeld. Ze verstoppen zich niet in een van de bestaande groepen en ze
worden niet stil op negen procent gezet.

#### BTW op een restitutie

Een teruggeboekt bedrag is bruto, net als het oorspronkelijke bedrag, en moet dus dezelfde
splitsing krijgen. Zonder die splitsing klopt de BTW-kolom in de rapportage niet zodra er
één restitutie in de periode zit: het brutobedrag daalt en de BTW blijft staan.

**Het tarief komt uit `payments.vat_rate_bp`, het bevroren snapshot van de betaling zelf.
Nooit uit `catalogue.vat_rate_bp`.** De catalogus is een levend record; het tarief daarin
kan gewijzigd zijn tussen de betaling en de restitutie, bijvoorbeeld omdat de accountant
een productgroep heeft geherkwalificeerd. Terugbetalen doe je tegen het tarief waartegen je
geïncasseerd hebt, anders ontstaat er een verschil dat nergens naartoe kan.

Dat de bron de betaalregel is en niet de factuurregels, lost meteen het geval op van een
**restitutie op een betaling zonder factuur**. Dat is bij TMC de meerderheid: particulieren
krijgen standaard geen factuur (1.2), maar hun geld kan wel terug. `payments.vat_rate_bp`
wordt gevuld door de webhook uit de order (3.3) en bestaat dus onafhankelijk van de vraag of
er ooit een `tmc.invoices`-rij is aangemaakt. Er is geen pad waarin de rapportage naar
factuurregels moet grijpen om een tarief te vinden.

**Gedeeltelijke restitutie: naar rato, met de afrondingsrichting van 3.1.**

```sql
refunded_vat_cents = case
  when p.vat_rate_bp is null then null
  when p.refunded_amount_cents = 0 then 0
  when p.refunded_amount_cents = p.amount_cents then p.vat_amount_cents
  else round(p.refunded_amount_cents::numeric * p.vat_rate_bp / (10000 + p.vat_rate_bp))
end

refunded_net_cents = case
  when p.vat_rate_bp is null then null
  else p.refunded_amount_cents - refunded_vat_cents
end
```

Drie dingen die deze expressie bewust doet:

- **Dezelfde formule als 3.1**, toegepast op het gerestitueerde bruto. Bruto blijft leidend
  en netto is het verschil, dus `refunded_net + refunded_vat = refunded_cents` per definitie
  exact, net als bij de oorspronkelijke betaling.
- **Volledige restitutie spiegelt exact.** Bij `refunded_amount_cents = amount_cents` wordt
  niet herrekend maar `vat_amount_cents` overgenomen. Zonder die tak zou een volledig
  terugbetaalde betaling een cent kunnen overhouden doordat heen en terug apart afgerond
  worden, en dan telt een volledig gecorrigeerde transactie niet op tot nul. Bij een
  restitutie in meerdere delen die samen het hele bedrag beslaan kan dat centverschil wel
  optreden; dat is de prijs van een deelrestitutie en het is een cent per betaling, geen
  structurele afwijking.
- **`vat_rate_bp is null` geeft `null`, geen nul.** Een historische betaling zonder bekend
  tarief levert een gerestitueerd brutobedrag op waarvan de BTW onbekend is. Die rijen
  vallen in dezelfde groep "tarief onbekend" als hierboven. Ze op nul zetten zou de
  BTW-kolom stilzwijgend te hoog laten uitkomen, en ze op negen procent zetten zou een
  bedrag verzinnen.

### 7.3 Consumentenproducten zonder factuur

Die tellen gewoon mee. De view leest `payments`, niet `invoices`. Dat is de hele reden voor
de keuze in "Waar dit op rust".

In de rapportage-UI staat per groep wel hoeveel van de omzet gefactureerd is
(`count(*) filter (where exists (select 1 from tmc.invoices ...))`), zodat zichtbaar is wat
er aan documenten tegenover staat. Dat is informatie, geen controle.

### 7.4 Creditnota's en restituties als negatieve regels

Twee bewegingen, allebei negatief, allebei in de periode waarin ze plaatsvonden:

- **Restitutie**: `refunded_cents` op de betaalregel, meegeteld in de maand van
  `refunded_at`, niet in de maand van `paid_at`. Een terugbetaling in april van een betaling
  uit februari drukt april, want anders verandert een al gerapporteerde maand met
  terugwerkende kracht.
- **Creditnota**: de gefinaliseerde creditnota, met `issued_at` als datum.

De twee kunnen naast elkaar bestaan voor dezelfde betaling en dan zou naïef optellen
dubbeltellen.

**De regel: `refunded_amount_cents` is altijd de bron van de negatieve omzetregel. De
creditnota draagt alleen het meerdere bij.**

```sql
-- negatieve bijdrage uit de restitutie, in de maand van refunded_at
refund_negative_cents = p.refunded_amount_cents

-- negatieve bijdrage uit de creditnota's, in de maand van hun issued_at
credit_excess_cents = greatest(0, credited_gross_cents - p.refunded_amount_cents)

-- waarbij, per payment:
credited_gross_cents = coalesce((
  select -sum(c.total_gross_cents)
  from tmc.invoices c
  join tmc.invoices i on i.id = c.credit_of_invoice_id
  where i.payment_id = p.id
    and c.status = 'finalised'
), 0)
```

**Waarom niet de eerdere booleaanse regel.** Die luidde: neem de restitutie, en tel een
creditnota alleen mee als er géén restitutie op die betaling staat. Dat is een alles-of-niets
schakelaar en die faalt zodra de bedragen verschillen. Concreet: een betaling van 14900 met
een restitutie van 4000 en een creditnota van 14900. De schakelaar ziet
`refunded_amount_cents > 0`, negeert de creditnota volledig, en telt 4000 af. De resterende
10900 die wel gecrediteerd is verdwijnt geruisloos uit de omzet, of beter gezegd: hij blijft
er ten onrechte in staan. Met `greatest(0, 14900 - 4000)` komt er 10900 bij, en het totaal
klopt weer.

De twee delen worden bewust **niet** samengetrokken tot `greatest(refunded, credited)`, ook
al is dat rekenkundig hetzelfde bedrag. Ze horen namelijk in verschillende periodes: de
restitutie in de maand van `refunded_at`, het meerdere in de maand waarin de creditnota is
uitgeschreven. Optellen tot één getal zou beide in dezelfde maand duwen en dat is precies de
retroactieve verschuiving die 7.4 wil vermijden.

Drie gevallen ter controle, allemaal op een betaling van 14900:

| Gerestitueerd | Gecrediteerd | Uit restitutie | Uit creditnota | Totaal negatief |
|---|---|---|---|---|
| 0 | 14900 | 0 | 14900 | 14900 |
| 4000 | 0 | 4000 | 0 | 4000 |
| 4000 | 14900 | 4000 | 10900 | 14900 |
| 14900 | 4000 | 14900 | 0 | 14900 |

De laatste regel is het geval waarin meer is terugbetaald dan gecrediteerd. Dat is
boekhoudkundig scheef (er hoort een creditnota bij het volledige teruggeboekte bedrag), maar
de rapportage mag er niet op omvallen: `greatest(0, ...)` levert nul en het teruggeboekte
geld telt volledig. Het cockpit signaleert dit apart als "terugbetaald zonder volledige
creditnota", zodat het opgelost wordt in plaats van weggerekend.

De BTW op de negatieve regels volgt dezelfde splitsing: uit de restitutie via
`refunded_vat_cents` en `refunded_net_cents` (7.2), uit de creditnota via de bevroren
`vat_cents` op de `invoice_lines` van die creditnota.

Dit is de plek waar de rapportage het meest kan verrassen en hij verdient expliciete tests
in 11.

### 7.5 Het trial_bookings-lek dichten

Zie 2.9. Zonder dit blijven proeflessen buiten elke omzetregel.

### 7.6 CSV-export

Bestaand patroon om te hergebruiken:
`src/app/app/admin/leden/_components/BulkActions.tsx` (client-side `Blob`, quoting via
`"…".replace(/"/g,'""')`). Twee bestaande exports, geen van beide financieel.

Nieuwe export op de rapportagepagina: één regel per maand per `revenue_category`, met
netto, BTW, bruto en gerestitueerd. Bestandsnaam
`omzet-{jaar}-{maand}-tot-{jaar}-{maand}.csv`.

Belangrijk: de export volgt exact de filters van het scherm, inclusief het is_test-filter.
Een export die stiekem meer of minder bevat dan wat er op het scherm stond is erger dan
geen export.

### 7.7 Ververs-strategie

De omzetview wordt een gewone view, geen materialized view. Reden: het datavolume is klein
(vijf betaalregels nu, realistisch een paar duizend per jaar), de pagina wordt zelden
geopend, en een gewone view is altijd actueel. Een materialized view zou een tweede
refresh-cron vereisen en een tweede manier om verouderde cijfers te tonen.

`tmc.vw_admin_kpis` blijft wel materialized en blijft op zijn eigen dagelijkse cron
(`50 3 * * *` in `vercel.json`, via `src/app/api/cron/refresh-kpis/route.ts` en
`tmc.refresh_admin_kpis()`).

### 7.8 Harde regel: wijzigen van vw_admin_kpis

**Elke wijziging aan `tmc.vw_admin_kpis` vereist drop en recreate van zowel de matview als
`tmc.get_admin_kpis()`, in dezelfde transactie, met herstelde execute grants.**

De reden staat in de live definitie:

```
tmc.get_admin_kpis()  RETURNS tmc.vw_admin_kpis  SECURITY DEFINER
```

De functie retourneert het **composiettype van de matview**. Dat maakt haar een harde
afhankelijkheid: een `DROP MATERIALIZED VIEW` zonder meer faalt, en een `DROP ... CASCADE`
sloopt `get_admin_kpis()` stil mee. Wat er dan gebeurt is dat de matview netjes opnieuw
wordt aangemaakt, de migratie slaagt, en de admin-cockpit pas bij de volgende paginaload
stukloopt op een functie die niet meer bestaat.

De verplichte volgorde in één transactie:

```sql
begin;
  drop function if exists tmc.get_admin_kpis();
  drop materialized view if exists tmc.vw_admin_kpis;

  create materialized view tmc.vw_admin_kpis as ...;
  create unique index vw_admin_kpis_singleton_idx on tmc.vw_admin_kpis ((1));

  create function tmc.get_admin_kpis() returns tmc.vw_admin_kpis
    language sql security definer set search_path to 'tmc','extensions'
  as $$ select * from tmc.vw_admin_kpis limit 1 $$;

  grant execute on function tmc.get_admin_kpis() to anon, authenticated, service_role;
  grant execute on function tmc.refresh_admin_kpis() to anon, authenticated, service_role;
commit;
```

Drie dingen die vergeten worden en het daarom expliciet verdienen:

1. **De unique index.** `refresh materialized view concurrently` (wat
   `tmc.refresh_admin_kpis()` doet) vereist een unique index op de matview. Vergeet je die
   bij het opnieuw aanmaken, dan faalt de cron pas de volgende ochtend om 03:50.
2. **De execute grants.** Live staan die op `anon`, `authenticated`, `service_role`,
   `postgres` en `PUBLIC`. Een nieuw aangemaakte functie heeft ze niet.
3. **Eén transactie.** Anders bestaat er een venster waarin de cockpit een functie aanroept
   die er niet is.

Voor deze spec betekent dit concreet: het `is_test`-filter toevoegen aan de KPI-view is geen
`ALTER`, het is de bovenstaande blok in zijn geheel. Dat staat in PR 8.

## 8. Ledenkant: uitbreiding van /app/facturen

### 8.1 Geen nieuwe route

**Er komt geen `/app/transacties`.** `/app/facturen` bestaat, staat al in `MemberMoreMenu`,
doet al vrijwel alles wat een transactieoverzicht moet doen, en wordt uitgebreid.

Twee routes op dezelfde tabel zouden betekenen: twee plekken die uit elkaar lopen, twee
navigatie-ingangen die hetzelfde beloven, en een lid dat moet raden waar zijn factuur staat.

Wat `src/app/app/facturen/page.tsx` nu al heeft:

- `payments` op `profile_id`, paginering met `PAGE_SIZE = 50` en `.range()`
- `PaymentRow` en `PaymentStatusBadge` met alle acht statussen
- `MandateStatusCard` met plannaam en berekende volgende incassodatum
- Nette lege staat

### 8.2 Wat erbij komt

**Downloadkolom.** Per rij: als er een gefinaliseerde, niet-test factuur aan de payment
hangt, een downloadknop die `getInvoiceDownloadUrl` aanroept (5.4). Anders niets. Geen
grijze knop, geen tooltip met "nog niet beschikbaar": een lid dat geen factuur heeft, hoeft
niet te weten dat andere leden die wel hebben.

De query erbij, in dezelfde `Promise.all` als de bestaande drie:

```
supabase.from("invoices")
  .select("id, invoice_number, payment_id")
  .eq("profile_id", user.id)
  .eq("status", "finalised")
  .eq("is_test", false)
  .in("payment_id", <payment-ids van deze pagina>)
```

Alleen voor de payments op de huidige pagina, dus maximaal vijftig ids.

**Beschrijving verrijken.** `payments.description` is nu de ruwe string die bij het aanmaken
is gezet, bijvoorbeeld `Order 8f3c... - ten_ride_card`. Dat is geen tekst voor een lid.

Overnemen uit `src/app/app/producten/page.tsx` (regel 96 tot 128): orders ophalen voor de
betreffende payment-ids, `slugByOrderId` bouwen, en de omschrijving via
`getCatalogue().get(slug)?.display_name` tonen. Voor een recurring-incasso zonder order komt
de naam uit `memberships.plan_variant` via dezelfde catalogus-lookup. Valt alles weg, dan
blijft `payments.description` de fallback.

Let op: `/app/producten` beperkt zich tot `kind = 'product'`. Die beperking gaat hier **niet**
mee over; `/app/facturen` toont alles.

**Testrijen filteren.** `.eq("is_test", false)` op beide payments-queries (rijen en telling).

### 8.3 Migratie van de bestaande copy

Onderaan `src/app/app/facturen/page.tsx` staat nu:

> "PDF-facturen komen binnenkort. Heb je nu al een factuur nodig voor je administratie? Mail
> Marlon met het betalingsnummer, we sturen 'm je toe."

Die belofte wordt met deze spec ingelost, dus de tekst verdwijnt. Maar niet zomaar, want de
situatie erna is genuanceerder dan "het kan nu": de meeste transacties krijgen nog steeds
geen factuur, want dat hoeft niet voor particulieren (1.2).

Vervangende tekst, onderaan dezelfde plek:

> "Niet elke betaling krijgt een factuur: voor particulieren is dat niet nodig. Heb je er
> toch een nodig voor je administratie, bijvoorbeeld omdat je zakelijk traint? Vraag het aan
> en we maken hem voor je."

Met de vraag-het-aan als `mailto` naar hetzelfde adres als nu. Een aanvraagformulier in de
app is een nette vervolgstap en staat bewust niet in deze spec.

Volgorde: de nieuwe tekst gaat pas live in dezelfde PR als de downloadkolom (PR 9). Tot die
tijd blijft de oude tekst staan, want "komen binnenkort" is dan nog waar.

Ook aan te passen in dezelfde PR: `PaymentStatusBadge` reageert op
`refunded_amount_cents > 0` in plaats van op de statuswaarde `refunded`, die Mollie nooit
stuurt (4.8).

## 9. Adminkant: facturen aanmaken

### 9.1 Vanaf een betaling

Vanuit de ledendetail (`src/app/app/admin/leden/[id]/_components/PaymentsTab.tsx`) en vanuit
de nieuwe rapportagepagina: knop "Factuur maken" op een `paid`-betaalregel.

Vult automatisch: `profile_id`, `payment_id`, `order_id`, en één regel per component uit
`orders.pricing_snapshot` (basis, add-on, inschrijfgeld), elk met eigen tarief en
omschrijving. Bedragen uit het snapshot, niet uit de huidige catalogus.

Status `draft`. Er is nog geen nummer.

### 9.2 Handmatig, zonder betaling

Voor het geval dat er buiten Mollie om is betaald, of voor een correctie. Admin kiest een
profiel, voegt regels toe, finaliseert. `payment_id` blijft leeg.

Deze factuur telt niet mee in de omzetrapportage uit 7.2, want die leest `payments`. Dat is
bewust en het staat als waarschuwing in de UI: "deze factuur hangt niet aan een betaling en
verschijnt niet in de omzetrapportage."

### 9.3 Regels toevoegen

Twee manieren:

- **Uit de catalogus**: slug kiezen, aantal invullen. `description`, `vat_rate_bp` en
  `revenue_category` worden overgenomen uit de catalogusrij en zijn daarna vrij te
  bewerken op het concept, want de catalogus is een startpunt en geen keurslijf.
- **Vrij**: omschrijving, aantal, bedrag en tarief met de hand. `catalogue_slug` blijft leeg.

Het bedrag wordt bruto ingevoerd, want dat is wat iemand voor zich heeft. Netto en BTW
worden berekend volgens 3.1 en getoond terwijl je typt.

#### Het BTW-tarief is een keuze per regel

**De admin kiest het tarief per factuurregel.** Elke regel heeft een eigen tariefveld, ook
een regel zonder `catalogue_slug`.

Hoe het werkt in de UI:

- Het veld is een keuzelijst met de toegestane tarieven (9 procent, 21 procent, 0 procent),
  niet een vrij getal. Dat sluit een typefout als 900 procent uit en houdt de waarde binnen
  de `CHECK` uit 2.1.
- **Bij een regel uit de catalogus staat de keuze default op `catalogue.vat_rate_bp` van die
  slug.** Vandaag is dat altijd 9 procent (1.1), maar de default komt uit de rij en niet uit
  een constante, zodat een toekomstige catalogusrij met een ander tarief automatisch goed
  voorgeselecteerd staat.
- **Bij een vrije regel staat de keuze default op 9 procent**, het tarief van vrijwel alles
  wat TMC verkoopt, en is hij net zo goed te wijzigen. Er is geen pad waarin de admin geen
  tarief kan kiezen.
- Wijkt het gekozen tarief af van de catalogusrij, dan toont de regel een zichtbare
  markering ("afwijkend van catalogus: 9 procent"). Geen blokkade, wel een signaal, want een
  afwijkend tarief is bijna altijd bedoeld en soms een vergissing.
- Netto en BTW op de regel herberekenen live volgens 3.1 zodra het tarief verandert, en de
  factuurtotalen volgen. De BTW-samenvatting onderaan groepeert per tarief, dus zodra er een
  tweede tarief op de factuur staat verschijnt daar vanzelf een tweede regel.

**Het gekozen tarief wordt bevroren op de factuurregel en slaat nooit terug op de
catalogus.** `invoice_lines.vat_rate_bp` is de waarheid voor die factuur; `catalogue.
vat_rate_bp` is alleen de bron van de default op het moment van toevoegen. Een admin die op
één factuur eenentwintig procent kiest, verandert daarmee niets aan het product, aan andere
concepten, of aan wat de checkout in rekening brengt. Wie het tarief van een product
structureel wil wijzigen doet dat in de catalogus, en dat is een migratie (2.1), geen
schermhandeling.

Dat onderscheid is dezelfde scheiding als overal in deze spec: de catalogus leeft, de
factuur is bevroren. Zie 2.6, waar `catalogue_slug` om precies deze reden geen foreign key
heeft.

### 9.4 Finaliseren, PDF, versturen

Drie losse acties, in deze volgorde en zichtbaar als drie stappen:

1. **Finaliseren.** Roept `tmc.finalize_invoice` aan. Onomkeerbaar, dus met een
   bevestigingsdialoog waarin het toe te kennen nummer nog niet staat (dat weet je pas na
   afloop) maar wel de reeks en het boekjaar.
2. **PDF genereren.** Rendert en uploadt. Write-once (4.5), dus de knop verdwijnt erna.
3. **Versturen.** Mail met een link naar `/app/facturen` (5.5).

Stap 2 en 3 zijn opnieuw uit te voeren als ze falen; stap 1 niet, en de UI moet dat verschil
duidelijk maken.

### 9.5 Crediteren

Knop op een gefinaliseerde factuur: "Creditnota maken". Opent een concept-creditnota met
`credit_of_invoice_id` gezet en alle regels van het origineel gekopieerd met omgekeerd
teken. De admin mag regels verwijderen of bedragen aanpassen voor een gedeeltelijke
creditering.

Daarna hetzelfde pad: finaliseren, PDF, versturen.

De crediteringsstand op de oorspronkelijke factuur (`none`, `partial`, `full`) komt uit
`tmc.v_invoice_credit_state` (4.6) en staat als badge op de factuurrij.

### 9.6 Audit-logging

Elke handeling in `tmc.admin_audit_log`, hetzelfde patroon als het bestaande
`trainer_invoice_generated`:

| `action` | `details` |
|---|---|
| `invoice_finalised` | `invoice_number`, `total_gross_cents`, `is_test` |
| `invoice_pdf_generated` | `invoice_number`, `pdf_path` |
| `invoice_sent` | `invoice_number`, `to` |
| `invoice_credited` | `invoice_number`, `credit_of`, `total_gross_cents` |

`target_type = 'invoice'`, `target_id` = de factuur-id.

## 10. Migratieplan

### 10.1 Volgorde en omkeerbaarheid

| Stap | Inhoud | Omkeerbaar |
|---|---|---|
| 1 | `catalogue.vat_rate_bp`, `catalogue.revenue_category` (nullable, backfill, `SET NOT NULL`) | ja, drop kolommen |
| 2 | `profiles.is_test`, `profiles.company_name`, `profiles.vat_number` | ja |
| 2b | `trial_bookings.is_test`, plus `and not is_test` in `session_occupancy`, `v_session_availability` en `redeem_trial_code` (2.9) | ja, maar raakt het capaciteitspad |
| 3 | `payments`-kolommen uit 2.2, grant-opruiming uit 2.8 | ja |
| 4 | `orders.vat_amount_cents` | ja |
| 5 | `_compute_order_price` uitbreiden, `create_order` en `admin_create_order` aanpassen | ja, `CREATE OR REPLACE` terug |
| 6 | `invoice_series`, `invoices`, `invoice_lines`, RLS, triggers | ja zolang er geen gefinaliseerde factuur is |
| 7 | `finalize_invoice`, `v_invoice_credit_state`, `v_revenue_lines` | ja |
| 8 | `vw_admin_kpis` drop en recreate volgens 7.8 | ja, met dezelfde procedure |

Stap 6 is het kantelpunt: zodra er één gefinaliseerde factuur bestaat is terugdraaien geen
technische maar een boekhoudkundige vraag.

### 10.2 Backfill

Volumes bij het schrijven van deze spec: `payments` 5, `orders` 7, `memberships` 9,
`trial_bookings` 3, `catalogue` 29. Alles past in één transactie en de backfill duurt
milliseconden. Over een jaar is dat anders.

De catalogus-backfill uit 2.1 staat letterlijk in de migratie, één `update` per slug, zodat
in de code-review zichtbaar is welk tarief aan welk product is toegekend. Dat is de plek
waar de accountant meeleest.

### 10.3 Defaults die niemand stil verkeerd zet

- `catalogue.vat_rate_bp` en `catalogue.revenue_category`: `NOT NULL`, geen default (2.1).
- `payments.is_test` en `profiles.is_test`: `NOT NULL DEFAULT false`. Hier is een default
  wel juist, want "niet test" is de veilige aanname en het alternatief is dat elke insert
  de vlag moet noemen.
- `payments.vat_rate_bp`: nullable, geen default. Onbekend is een geldige toestand en moet
  als zodanig zichtbaar blijven in de rapportage.

## 11. Acceptatiecriteria

Toetsbaar geformuleerd. Elk criterium is een test die slaagt of faalt, niet een intentie.

### 11.1 Nummering

**A1. Concurrency op `finalize_invoice`.** Dit is de belangrijkste test van de hele spec.

Opzet: maak 50 concept-facturen in dezelfde reeks en hetzelfde boekjaar. Roep
`tmc.finalize_invoice` voor alle 50 gelijktijdig aan vanuit minstens 10 parallelle
verbindingen (`pgbench -c 10 -j 4 -f finalize.sql -t 5`, of een Node-script met
`Promise.all` over 50 losse Supabase-clients; niet vanuit één client, want die serialiseert
zelf).

Verwacht:

- 50 unieke nummers
- exact de verzameling 1 tot en met 50, dus geen gaten en geen sprongen
- `invoice_series.next_number` staat na afloop op 51
- geen enkele aanroep geeft een fout terug
- `select count(*) from tmc.invoices where invoice_number is null and status = 'finalised'`
  geeft 0

**A2. Rollback laat geen gat. Alleen uitvoerbaar vanuit `psql`, niet vanuit een
Supabase-client.**

Een RPC-aanroep via PostgREST is zijn eigen transactie en commit direct; er is geen manier om
hem van buitenaf terug te draaien. Deze test vereist dus een directe verbinding waarin je zelf
`BEGIN` en `ROLLBACK` stuurt.

Opzet (`psql "$SUPABASE_DB_URL"`, één sessie):

```sql
select tmc.finalize_invoice('<factuur-1>');   -- krijgt nummer 1
select tmc.finalize_invoice('<factuur-2>');   -- krijgt nummer 2

begin;
  select tmc.finalize_invoice('<factuur-3>'); -- krijgt nummer 3 binnen de transactie
rollback;

select tmc.finalize_invoice('<factuur-4>');
```

Verwacht: factuur 4 krijgt **nummer 3**, en `invoice_series.next_number` staat op 4. Factuur 3
staat nog op `draft` zonder nummer.

**A3. Gelijktijdige eerste factuur van een nieuw boekjaar.** Twee gelijktijdige aanroepen voor
een boekjaar waarvoor nog geen `invoice_series`-rij bestaat, waarbij de eerste wordt
teruggedraaid.

Ook dit is een `psql`-test met twee sessies, en om dezelfde reden als A2: de terugrol moet van
buitenaf komen. Sessie 1 doet `begin; select tmc.finalize_invoice(...);` en blijft open. Sessie
2 roept dezelfde functie aan voor een andere concept-factuur in hetzelfde nieuwe boekjaar en
blokkeert op het slot uit 4.3 fase 1. Sessie 1 doet `rollback`. Sessie 2 deblokkeert.

Verwacht: sessie 2 krijgt **nummer 1**, geen NULL-fout, geen exception, en het samengestelde
`invoice_number` is `2027.001` en niet `.001`. Dit is de test die de verworpen
`do nothing`-variant uit 4.3 zou hebben laten vallen.

**A3b. Een mislukte validatie verbruikt geen nummer.** Dit is de regressietest op de
herordening uit 4.2 en hij is wél vanuit een gewone client te draaien, want er komt geen
rollback aan te pas.

Voor elke weigeringsgrond apart: een concept zonder regels (`no_lines`), een concept met
regels waarvan de totalen niet optellen (`totals_mismatch`), een concept van een profiel
zonder `email` en zonder ingevulde `bill_to_email` (`incomplete_bill_to`), en een concept met
een `issued_at` vóór de laatste in de reeks (`issued_at_before_last`).

Meet `invoice_series.next_number` direct vóór en direct ná elke aanroep.

Verwacht per geval: `ok: false` met de bijbehorende `reason`, en **`next_number` ongewijzigd**.
Daarna: repareer het concept en finaliseer opnieuw, en controleer dat het toegekende nummer
aansluit op het vorige zonder sprong. Faalt deze test op `incomplete_bill_to`, dan staat de
validatie nog achter het trekken van het nummer.

**A4. Test- en live-reeks raken elkaar niet.** Finaliseer afwisselend live- en
testfacturen. Verwacht: twee onafhankelijk oplopende reeksen, `2026.001`, `2026.002` naast
`TEST-2026.001`, `TEST-2026.002`.

**A5. Idempotentie.** Roep `finalize_invoice` tweemaal aan op dezelfde factuur. Verwacht:
tweede aanroep geeft `already_finalised: true` met hetzelfde nummer, en
`invoice_series.next_number` is niet opgehoogd.

**A6. Chronologie, sequentieel.** Finaliseer een factuur met `issued_at = '2026-03-10'`.
Probeer daarna te finaliseren met `issued_at = '2026-03-09'`. Verwacht: `ok: false`,
`reason: 'issued_at_before_last'`, en `next_number` ongewijzigd. Met `'2026-03-10'` moet het
wel slagen, want gelijke datums zijn toegestaan.

**A6b. Chronologie onder concurrency.** De test op de correctie uit 4.4.

Uitgangspunt: een reeks waarvan de laatst gefinaliseerde factuur `issued_at = '2026-03-01'`
heeft. Twee concept-facturen. Roep `finalize_invoice` voor allebei **gelijktijdig** aan vanuit
twee losse verbindingen, de een met `p_issued_at = '2026-03-10'`, de ander met
`p_issued_at = '2026-03-05'`.

Verwacht: **precies één van de twee slaagt.**

- Wint de 10-maart-aanroep, dan faalt de andere met `issued_at_before_last`.
- Wint de 5-maart-aanroep, dan slaagt de 10-maart-aanroep daarna gewoon, want 10 ligt na 5.

In beide uitkomsten geldt: `select invoice_number, issued_at from tmc.invoices where status =
'finalised' order by number` levert een monotoon niet-dalende reeks `issued_at`. Slagen beide
aanroepen met omgekeerde datums, dan staat de chronologiecontrole nog vóór het slot.

Draai deze test minstens twintig keer; een raceconditie die maar in een deel van de runs
optreedt is nog steeds een raceconditie.

**A7. Boekjaarreset.** Finaliseer een factuur met `issued_at = '2026-12-31'` en daarna een
met `'2027-01-02'`. Verwacht: `2026.00N` gevolgd door `2027.001`.

### 11.2 Onveranderlijkheid

**B1.** `update tmc.invoices set bill_to_city = 'X' where status = 'finalised'` geeft een
exception.

**B2.** `update tmc.invoices set pdf_path = 'a' where status = 'finalised' and pdf_path is
null` slaagt. Dezelfde update met een andere waarde daarna geeft een exception.

**B3.** `delete from tmc.invoices where status = 'finalised'` geeft een exception.
`delete ... where status = 'draft'` slaagt.

**B4.** Wijzig na finaliseren het adres in `tmc.profiles`. Verwacht: de factuur toont nog
steeds het oude adres, zowel in de database als in een opnieuw opgehaalde weergave.

### 11.3 BTW en afronding

**C1.** Voor elke actieve catalogusrij geldt
`vat_cents = round(price_cents * vat_rate_bp / (10000 + vat_rate_bp))` en
`net_cents = price_cents - vat_cents`, en `net + vat = price_cents` exact.

**C1b. De backfill heeft elke rij geraakt.**
`select count(*) from tmc.catalogue where vat_rate_bp is null` geeft 0, en
`select distinct vat_rate_bp from tmc.catalogue` geeft precies `{900}` (1.1). Controleer
daarnaast in het schema dat er **geen** default op de kolom staat:
`select column_default from information_schema.columns where table_schema = 'tmc' and
table_name = 'catalogue' and column_name = 'vat_rate_bp'` geeft `NULL`. Staat daar `900`,
dan is de motivatie uit 2.1 onderweg gesneuveld.

**C1c. Een insert zonder tarief wordt geweigerd.** `insert into tmc.catalogue (...)` zonder
`vat_rate_bp` en zonder `revenue_category` faalt met een not-null-schending. Dit is de test
die de afwezigheid van de default bewaakt, en hij is juist nu waardevol, omdat een uniform
tarief de verleiding geeft om die default alsnog toe te voegen.

**C2.** Factuur met drie regels van 1290 cent bij `vat_rate_bp = 900`. Verwacht:
`vat_total_cents = 321` (3 x 107), niet 320. En
`subtotal_net_cents + vat_total_cents = total_gross_cents`.

**C3. Gemengde tarieven op één factuur.** Blijft geldig als test op het model, maar is niet
meer met twee catalogusproducten te bouwen: sinds 1.1 dragen alle catalogusrijen negen
procent.

Bouw de factuur daarom met **één regel uit de catalogus** (negen procent, tarief
overgenomen uit de catalogusrij) en **één vrije regel zonder `catalogue_slug`** waarop de
admin het tarief handmatig op 21 procent zet (9.3).

Verwacht:

- `invoice_lines` bevat twee rijen met verschillende `vat_rate_bp`, `900` en `2100`
- per regel geldt `gross_cents = net_cents + vat_cents`
- `vat_total_cents` is de som van beide regels, niet herrekend over het bruto totaal (3.4)
- de PDF toont **twee** BTW-regels in de samenvatting, uit een `group by vat_rate_bp`
- `tmc.catalogue` is onveranderd: het handmatige tarief slaat niet terug op het product
  (9.3). Controleer expliciet dat de catalogusrij die op de eerste regel gebruikt is nog
  steeds `900` draagt

Deze test is de reden dat de per-regel-BTW in het model blijft ondanks één uniform
catalogustarief. Faalt hij, dan is het model stilzwijgend versmald tot één tarief per
factuur en is een toekomstig 21-procent-product een herbouw in plaats van een `insert`.

**C4.** Een order met `extended_access` en `signup_fee` levert een `pricing_snapshot` met
alle drie de BTW-bedragen, en `first_charge_vat_amount_cents` is hun som. De drie
tariefkeys zijn afzonderlijk aanwezig, ook al dragen ze alle drie `900`; zijn ze
samengevoegd tot één key, dan is de scheiding uit 3.2 verloren.

### 11.4 Crediteren

**D1.** Volledige creditnota op factuur van 14900. Verwacht: `credit_state = 'full'`,
`credited_gross_cents = 14900`.

**D2.** Creditnota van 4000 op dezelfde factuur. Verwacht: `credit_state = 'partial'`.

**D3.** Twee creditnota's van 4000 en 10900. Verwacht: `credit_state = 'full'`.

**D4.** Een creditnota maakt de omzet aantoonbaar nul: som van
`v_revenue_lines.net_cents` over de betaling plus de creditnota is 0 voor het geval van D1.

**D5. Een creditnota met positieve totalen wordt geweigerd.** Maak een concept met
`credit_of_invoice_id` gezet en regels met positieve bedragen, en finaliseer. Verwacht: een
exception op `invoices_credit_note_negative_check` (2.5), niet een `ok: false`. Controleer
daarna dat `v_invoice_credit_state` voor de oorspronkelijke factuur nog steeds `none`
teruggeeft en dat er geen nummer verbruikt is.

### 11.5 Testmodus

**E1.** Een order aanmaken op een profiel met `is_test = false` gebruikt
`MOLLIE_API_KEY_LIVE` en een webhook-URL zonder `mode`-parameter.

**E2.** Idem op een testprofiel gebruikt `MOLLIE_API_KEY_TEST` en een URL met `?mode=test`.

**E3.** Op preview met `VERCEL_AUTOMATION_BYPASS_SECRET` gezet bevat de test-URL beide
parameters, correct gescheiden met `&`, en is hij een geldige URL volgens `new URL()`.

**E4.** Een webhook-aanroep zonder `mode`-parameter kiest de live-key. Dit borgt de
achterwaartse compatibiliteit met bestaande subscriptions.

**E5.** Een webhook-aanroep met `?mode=test` en een live payment-id schrijft geen enkele
rij en logt een fout.

**E6.** `select count(*) from tmc.orders o join tmc.profiles p on p.id = o.profile_id`
gegroepeerd op `p.is_test`: er bestaat geen order op een profiel waarvan de modus niet
overeenkomt met de gebruikte key. Te controleren via de `payments.is_test`-snapshot.

**E7.** Een lid met `is_test = false` ziet op `/app/facturen` nul testrijen, ook als het
`is_test`-filter uit de query wordt gehaald (de RLS-policy vangt het).

**E8. De publieke proefles draait in de modus van de deployment.** Boek op een
preview-deployment een proefles. Verwacht: `trial_bookings.is_test = true`, een Mollie-payment
op de testkey, en een webhook-URL met `?mode=test`. Dezelfde boeking op productie levert
`is_test = false`, de livekey en een URL zonder `mode`. Er is geen query-parameter of
formulierveld waarmee een bezoeker dit in productie kan omzetten.

**E9. Test- en echte proeflessen tellen verschillend. Beide richtingen toetsen.**

Eén test is hier niet genoeg. Een implementatie die `and not is_test` op de verkeerde plek
zet, of die per ongeluk álle `trial_bookings` uit de telling haalt, slaagt voor de
testkant en faalt geruisloos op de echte kant. Dat is de ergste van de twee fouten, want
dan verdringen proeflessers stilletjes betalende leden.

Uitgangspunt voor beide takken: een sessie met `capacity = 6` en **vijf** echte boekingen
(`bookings.status = 'booked'`), plus één wachtlijstinschrijving op diezelfde sessie.

**Tak A, de testproefles telt niet mee.** Voeg een `trial_bookings`-rij toe met
`is_test = true` en status `paid`.

| Meting | Verwacht |
|---|---|
| `tmc.session_occupancy(sessie)` | 5 |
| `v_session_availability.taken_count` | 5 |
| `v_session_availability.spots_available` | 1 |
| Een zesde echte boeking invoegen | slaagt, geen `session_capacity_exceeded` |
| `waitlist-promote` draaien vóór die zesde boeking | promoveert de wachtlijstinschrijving, want er is een plek |

**Tak B, de echte proefles telt wel mee.** Zelfde uitgangspunt, maar nu een
`trial_bookings`-rij met `is_test = false` en status `paid`.

| Meting | Verwacht |
|---|---|
| `tmc.session_occupancy(sessie)` | 6 |
| `v_session_availability.taken_count` | 6 |
| `v_session_availability.spots_available` | 0 |
| Een zesde echte boeking invoegen | **faalt** met `session_capacity_exceeded` (errcode `P0001`) |
| `waitlist-promote` draaien | promoveert **niets**, want `spots_available` is 0 |

Beide takken draaien in dezelfde testrun. Slaagt tak A maar faalt tak B, dan is de
capaciteitsbewaking op proeflessen kapot gemaakt in plaats van getest-gescheiden.

Herhaal tak B ook met status `pending` in plaats van `paid`, want alle drie de tellende
statussen (`pending`, `paid`, `attended`) moeten voor een echte rij blijven meetellen.

**E10. De vastgelegde asymmetrie klopt.** De twee eigenschappen uit 2.9 die bewust zijn
geaccepteerd, dus expliciet toetsen in plaats van aannemen:

- **Een volle sessie weigert nog steeds een testproefles.** Sessie met `capacity = 6` en zes
  echte boekingen. Een `trial_bookings`-rij met `is_test = true` invoegen: verwacht
  `session_capacity_exceeded`. De testmodus mag de fysieke grens niet omzeilen.
- **Testrijen begrenzen elkaar niet.** Lege sessie met `capacity = 6`. Voeg twintig
  `trial_bookings`-rijen toe met `is_test = true`: alle twintig slagen, en
  `spots_available` blijft 6. Dit is geen bug maar het vastgelegde besluit (regel 25 in het
  besluitenlog); de test staat er zodat een latere wijziging die dit stilzwijgend omdraait
  opvalt.

### 11.6 Rapportage

**F1.** `v_revenue_lines` bevat nul rijen met `is_test = true`.

**F2.** Een betaalde proefles verschijnt in `v_revenue_lines` met
`kind = 'trial_booking'`. Dit is de regressietest op het lek uit 2.9.

**F3.** Een restitutie in april op een betaling uit februari drukt de omzet van april, niet
die van februari.

**F4. Restitutie en creditnota met ongelijke bedragen tellen niet dubbel en laten niets
verdwijnen.** Vier gevallen op een betaling van 14900, telkens de negatieve bijdrage meten
(7.4):

| # | Gerestitueerd | Gecrediteerd | Verwacht totaal negatief |
|---|---|---|---|
| a | 0 | 14900 | 14900, volledig uit de creditnota |
| b | 4000 | 0 | 4000, volledig uit de restitutie |
| c | 4000 | 14900 | 14900, waarvan 4000 uit de restitutie en 10900 uit de creditnota |
| d | 14900 | 4000 | 14900, volledig uit de restitutie, creditnota draagt 0 bij |

Geval c is de regressietest op de verworpen booleaanse regel: die leverde daar 4000 op en
liet 10900 verdwijnen. Geval d toetst dat `greatest(0, ...)` niet negatief wordt.

Controleer bij c bovendien dat de twee delen in de juiste maand landen: de 4000 in de maand
van `refunded_at`, de 10900 in de maand van `issued_at` van de creditnota. Vallen ze in
dezelfde maand terwijl de datums verschillen, dan zijn de delen ten onrechte samengetrokken.

**F5. BTW op een restitutie.** Betaling van 14900 bruto met `vat_rate_bp = 900`, dus
`vat_amount_cents = 1230` en `net_amount_cents = 13670`.

- **Volledige restitutie** (`refunded_amount_cents = 14900`): verwacht
  `refunded_vat_cents = 1230` exact, gespiegeld uit het snapshot en niet herrekend, en
  `refunded_net_cents = 13670`. De periode telt netto en BTW aantoonbaar op tot nul.
- **Deelrestitutie** van 4000: verwacht
  `refunded_vat_cents = round(4000 * 900 / 10900) = 330` en `refunded_net_cents = 3670`, en
  `330 + 3670 = 4000` exact.
- **Tarief gewijzigd na de betaling.** Zet `catalogue.vat_rate_bp` voor het betreffende
  product op 2100 en herhaal de deelrestitutie. Verwacht: onveranderd 330, want het tarief
  komt uit `payments.vat_rate_bp`. Verandert de uitkomst, dan leest de view de actuele
  catalogus.
- **Restitutie op een betaling zonder factuur**: dezelfde uitkomsten. De view mag geen
  `tmc.invoices`-rij nodig hebben om een tarief te vinden.
- **`vat_rate_bp is null`** (historische rij): `refunded_vat_cents` en `refunded_net_cents`
  zijn `null`, niet `0`, en de rij valt in de groep "tarief onbekend".

**F6.** De CSV-export bevat exact de rijen die op het scherm staan, met dezelfde filters.

### 11.7 KPI-view

**G1.** Na de migratie uit 7.8 bestaat `tmc.get_admin_kpis()` nog, is hij aanroepbaar door
`authenticated`, en geeft de admin-cockpit dezelfde cijfers als ervoor voor niet-testdata.

**G2.** `refresh materialized view concurrently tmc.vw_admin_kpis` slaagt, dus de unique
index staat er.

**G3.** Een testmembership beïnvloedt `active_members` en `mrr_cents` niet.

## 12. Besluitenlog

| # | Besluit | Verworpen variant en reden |
|---|---|---|
| 1 | Testmodus op `tmc.profiles.is_test`; testorders alleen op testprofielen | `is_test` op `orders` en `memberships`, met aanpassing van `orders_one_open_subscription_idx` en van de duplicate-guard in `activate_order`. Verworpen: het rekt twee bestaande, werkende, geld-kritieke invarianten op ("één open order per persoon" wordt "één per persoon per modus") en het laat een testmembership toe op een echt profiel, met echte entitlements, echte boekingscapaciteit en echte deurtoegang. Zie 6.2 en 6.4 |
| 2 | Reeksrij vergrendelen met `insert ... on conflict do update set next_number = next_number` (zelftoekenning), en pas ná de validatie consumeren met een aparte `update` | `insert ... on conflict do nothing` gevolgd door `select ... for update`. Verworpen: NULL-race bij rollback van een gelijktijdige eerste factuur van een boekjaar, en `do nothing` neemt geen slot op de conflicterende rij. Zie 4.3. Ook verworpen: het enkele statement dat vergrendelen en consumeren combineert, zie regel 18 |
| 3 | Tellerrij in een gewone tabel | Postgres `SEQUENCE`. Verworpen: niet-transactioneel, een rollback verbrandt een nummer en laat een gat in de factuurreeks |
| 4 | `catalogue.vat_rate_bp` en `catalogue.revenue_category` `NOT NULL` zonder default | `NOT NULL DEFAULT 900` respectievelijk `DEFAULT 'overig'`. Verworpen: een default classificeert een nieuwe catalogusrij stil en plausibel verkeerd, en dat komt pas bij een controle boven water. Zie 2.1 |
| 5 | Bruto leidend, BTW is de afgeleide | Netto opslaan of netto eerst berekenen. Verworpen: introduceert een centverschil tussen de getoonde en de geïncasseerde prijs. Zie 3.1 |
| 6 | Restitutie in `refunded_amount_cents`, `payments.status` blijft `paid` | De status overschrijven met `refunded`. Verworpen op grond van de verificatie in 4.8: `PaymentStatus` in `@mollie/api-client` 4.5.0 kent die waarde niet en API v2 stuurt hem nooit. De aanname uit het discovery-rapport was onjuist |
| 7 | `invoices.status` alleen `draft` en `finalised`, crediteringsstand afgeleid | Een derde status `credited`. Verworpen: deels crediteren past er niet in, en een statuskolom naast de creditnota's is een tweede bron van waarheid die kan gaan afwijken. Zie 4.6 |
| 8 | `pdf_path` en `pdf_generated_at` write-once | Vrij te overschrijven zodat een PDF opnieuw gerenderd kan worden. Verworpen: een tweede render kan een ander document opleveren dan de klant ontving, bijvoorbeeld na een sjabloon- of adreswijziging |
| 9 | `finalize_invoice` weigert `issued_at` vóór de laatst gefinaliseerde factuur in de reeks | Geen chronologiecontrole. Verworpen: een oplopende nummering met door elkaar lopende datums is intern inconsistent en niet uit te leggen bij een controle |
| 10 | `/app/facturen` uitbreiden | Nieuwe route `/app/transacties`. Verworpen: twee routes op dezelfde tabel lopen uit elkaar, en `/app/facturen` staat al in de navigatie en doet al bijna alles. Zie 8.1 |
| 11 | Modus in de webhook-URL, `Map` op modus in `mollie.ts`, twee env-vars | Beide keys proberen en op een 404 terugvallen. Verworpen: twee API-calls op het hete pad, een echte 404 wordt ononderscheidbaar van een modus-mismatch, en een willekeurig gepost id laat de andere key aanroepen. Zie 6.5 |
| 12 | Creditnota in dezelfde reeks als de factuur | Eigen creditreeks. Verworpen voor nu: beide zijn toegestaan, dezelfde reeks is eenvoudiger, en een aparte reeks is later toe te voegen met alleen een extra `code`-waarde zonder schemawijziging |
| 13 | Geen kolom `catalogue.price_includes_vat` | Wel toevoegen om de brutoconventie expliciet te maken. Verworpen: de conventie geldt voor de hele tabel en een kolom die overal dezelfde waarde heeft, suggereert dat hij ooit anders kan zijn. Vastgelegd in 3.1 in plaats van in het schema |
| 14 | Omzetview als gewone view | Materialized view met eigen refresh-cron. Verworpen: klein datavolume, zelden geopend, en een tweede refresh-cron is een tweede manier om verouderde cijfers te tonen. Zie 7.7 |
| 15 | Factuurmail met link, geen bijlage | `sendEmail` uitbreiden met attachments. Verworpen: de PDF staat al in de portal, bijlagen drukken de deliverability, en het is een tweede kopie die kan verouderen. Zie 5.5 |
| 16 | Creditnota wordt nooit automatisch aangemaakt bij een restitutie | Automatisch crediteren op de refund-webhook. Verworpen: crediteren is een boekhoudkundige handeling met een datum en een bedrag die iemand moet willen. Zie 4.7 |
| 17 | Alle validatie vóór het trekken van het nummer; daarna is elke fout een `raise exception`, nooit `ok: false` | De eerdere stappenvolgorde, waarin `incomplete_bill_to` ná het trekken van het nummer nog `ok: false` kon retourneren. Verworpen: een plpgsql-functie die normaal returnt draait niets terug, dus de ophoging van `next_number` commit en er ontstaat een gat in de reeks. Zie 4.2 |
| 18 | Vergrendelen en consumeren zijn twee statements met de validatiepoort ertussen | Het enkele `insert ... on conflict do update set next_number = next_number + 1 returning next_number - 1`. Verworpen: dat consumeert het nummer op het moment dat het de rij vergrendelt, dus vóór elke validatie, en het laat de chronologiecontrole buiten het slot lezen. Vergrendelen en consumeren zijn twee behoeftes die niet op hetzelfde moment vallen. Zie 4.3 |
| 19 | De chronologiecontrole leest `max(issued_at)` ná het slot op de reeksrij | Lezen vóór het slot. Verworpen: twee gelijktijdige finalisaties lezen dan allebei dezelfde oude waarde en slagen allebei met omgekeerde datums, precies wat de controle moest voorkomen. Zie 4.4 en test A6b |
| 20 | `refunded_amount_cents` is altijd de bron van de negatieve omzetregel; de creditnota draagt alleen `greatest(0, gecrediteerd - gerestitueerd)` bij, in zijn eigen periode | De booleaanse regel "tel de creditnota alleen mee als er geen restitutie op die betaling staat". Verworpen: die faalt bij ongelijke bedragen. Restitutie 4000 met creditnota 14900 telde 4000 af en liet 10900 verdwijnen. Zie 7.4 en test F4 |
| 21 | `refunded_net_cents` en `refunded_vat_cents` in `v_revenue_lines`, tarief uit `payments.vat_rate_bp` | Geen BTW-splitsing op restituties, of het tarief uit `catalogue.vat_rate_bp` halen. Verworpen: zonder splitsing daalt het bruto terwijl de BTW blijft staan, en de actuele catalogus kan een ander tarief dragen dan waartegen geïncasseerd is. Zie 7.2 en test F5 |
| 22 | `tmc.trial_bookings` krijgt een eigen `is_test`, gevuld uit `trialBookingMode()` | De proefles-route altijd op `live` laten draaien. Verworpen: dat maakt de `mode`-parameter op `/api/trial-bookings/webhook` dood en het proefles-betaalpad alleen in productie met echt geld testbaar. Er is geen `profile_id` om de modus uit af te leiden, dus een eigen kolom is de enige route. Zie 2.9 |
| 23 | `invoices_credit_note_negative_check` als databaseconstraint | Vertrouwen op de UI en de conventie dat een creditnota negatieve regels krijgt. Verworpen: `v_invoice_credit_state` en 7.4 rekenen met `-sum(...)`, dus een positief weggeschreven creditnota levert een negatieve crediteringsstand en houdt de factuur stilzwijgend op `none`. Zie 2.5 |
| 24 | Tests A2 en A3 zijn `psql`-tests met expliciete `begin`/`rollback` | Ze als gewone RPC-test vanuit een Supabase-client draaien. Verworpen: elke PostgREST-aanroep is zijn eigen transactie en commit direct, dus er is van buitenaf niets terug te draaien en de test zou nooit meten wat hij beweert te meten. Zie 11.1 |
| 25 | Testproeflessen worden niet tegen de capaciteit gehandhaafd en begrenzen elkaar dus niet; er komt geen aparte bovengrens | Een tweede bovengrens voor testboekingen inbouwen in `session_occupancy` of `enforce_session_capacity`. Verworpen: de invariant die telt is "echte deelnemers worden nooit verdrongen door testdata", en die houdt in beide richtingen, want een volle sessie weigert ook een testrij. De invariant "testdata past in de zaal" beschermt niets, want er komt bij een testboeking niemand opdagen. De prijs zou een tweede telpad met een tweede betekenis zijn in precies de functie die de harde grens over leden, proeflessers en gasten bewaakt. Het realistische faalgeval is een retry-lus die rijen wegschrijft, en dat is tabelvervuiling die 6.9 opruimt, geen bedrijfsincident. Wil ops later toch een plafond, dan hoort dat in een losse trigger `enforce_test_booking_ceiling` buiten het echte capaciteitspad. Zie 2.9 en tests E9, E10 |
| 26 | PR 5 gaat van Sonnet naar Fable | PR 5 op Sonnet laten staan. Verworpen: de PR is niet meer wat hij was. Toen hij alleen de webhook-upsert naar `tmc.payments` deed was hij mechanisch en volledig voorgeschreven. Met `trial_bookings.is_test` erbij raakt hij het **capaciteitspad** en niet alleen de betaalketen: `session_occupancy` (dat alle drie de capaciteitstriggers voedt), `v_session_availability` (een eigen duplicaat van dezelfde telling) en `redeem_trial_code` (een derde). Drie plekken die hetzelfde tellen en die uit elkaar kunnen lopen, met een trigger als handhaver die stil de verkeerde kant op valt: één gemiste `and not is_test` laat testdata een stoel bezetten in een groep van zes, en één te veel haalt echte proeflessen uit de bewaking en laat proeflessers betalende leden verdringen. Zie 2.9 en test E9 |
| 27 | Alle zes de productgroepen op `vat_rate_bp = 900`; alle diensten worden aangemerkt als het geven van gelegenheid tot sportbeoefening. Besloten door Ilja op 2026-08-06, niet fiscaal getoetst | De indeling uit de discovery, met `personal_training` en `programma` op `2100`. Verworpen: die berustte op de gedachte dat individuele begeleiding door een zelfstandige een andere prestatie is dan het gebruik van een sportaccommodatie, en die scheiding wordt niet gemaakt. Gevolgen die bewust ongewijzigd blijven: `vat_rate_bp` blijft `NOT NULL` zonder default (juist nu, zie 2.1), de `CHECK` blijft eenentwintig procent toestaan, de BTW blijft per factuurregel staan, en de admin kan het tarief per regel overschrijven (9.3). Dat de zes groepen vandaag hetzelfde getal dragen is een waarde in de data, geen eigenschap van het ontwerp. Bevestiging staat open als vraag 1 in sectie 13 en is een opleverpunt, geen bouwpunt |

## 13. Open vragen

**Voor de accountant**

1. **Bevestig dat negen procent op alle diensten verdedigbaar is, inclusief personal training
   en de twaalfweken-programma's.** De keuze is gemaakt (1.1, besluitenlog 27): alles wordt
   aangemerkt als het geven van gelegenheid tot sportbeoefening en valt daarmee onder het
   lage tarief. De vraag is niet meer welk tarief per groep hoort, maar of deze ene lijn
   houdbaar is bij een controle. Twee punten die daarbij het meest aandacht verdienen: de
   1-op-1- en duo-personal-training, en het online twaalfweken-programma, waar de deelnemer
   niet in de studio staat.
2. Mag een creditnota in dezelfde nummerreeks als de facturen, of is een aparte reeks
   gewenst? Besluit 12 is nu de eenvoudigste variant, niet noodzakelijk de gewenste.
3. Is de bewaartermijn van zeven jaar voldoende gedekt door de PDF in de storage-bucket plus
   de rijen in de database, of is een export naar een onafhankelijk archief gewenst?

De eerdere vraag over het inschrijfgeld (volgt het het tarief van de hoofddienst, ook bij een
add-on in dezelfde eerste incasso) is vervallen: nu alle groepen op negen procent staan,
levert elke beantwoording hetzelfde bedrag op. De vraag komt terug zodra er een product met
een afwijkend tarief in de catalogus verschijnt.

**Voor Marlon**

4. Het KvK- en BTW-nummer van TMC (1.5). Zonder deze twee kan er geen factuur de deur uit.
5. Wil je een aanvraagknop voor een factuur in de ledenomgeving, of blijft het bij mailen
   (8.3)?
6. Moet een lid automatisch bericht krijgen als er een factuur voor hem klaarstaat, of pak
   je dat per geval?

## 14. PR-opdeling

Negen PR's. Elke PR is los te reviewen, te mergen en terug te draaien, en elke PR laat de
applicatie werkend achter.

| PR | Inhoud | Model | Waarom dit model |
|---|---|---|---|
| 1 | Migratie: `catalogue.vat_rate_bp` + `revenue_category` met expliciete backfill per slug; `profiles.is_test`, `company_name`, `vat_number`; grant-opruiming op `payments` | **Sonnet** | Mechanisch, de inhoud staat al in 1.1 en 2.1 |
| 2 | Migratie: `payments`-kolommen uit 2.2, `orders.vat_amount_cents`; backfill van de bestaande rijen | **Sonnet** | Idem, klein volume, geen ontwerpruimte |
| 3 | `_compute_order_price` uitbreiden met de BTW-keys; `create_order` en `admin_create_order` de modus uit `profiles.is_test` laten lezen en `vat_amount_cents` schrijven | **Fable** | Raakt de prijsketen die geld bepaalt. De twee takken, de add-on met tarief `null` bij `included`, en de afrondingsrichting moeten in één keer goed |
| 4 | Mollie-modusrouting: `MollieMode`, `Map` in `mollie.ts`, `mollieWebhookUrl(mode)` met `URLSearchParams`, alle dertien aanroepplaatsen, beide webhook-routes | **Fable** | Achterwaartse compatibiliteit met lopende subscriptions, de combinatie met de bypass-parameter, en per-order modus in `expire-orders`. Een fout hier breekt stil de incasso van bestaande leden |
| 5 | `trial_bookings.is_test` + `trialBookingMode()`; `and not is_test` in `session_occupancy`, `v_session_availability` en `redeem_trial_code`; `trial-bookings`-webhook schrijft naar `tmc.payments` met `kind` en `trial_booking_id`; backfill van de twee bestaande rijen | **Fable** | Was Sonnet toen dit alleen de webhook-upsert was. Raakt nu het capaciteitspad en niet alleen de betaalketen: drie plekken tellen hetzelfde en kunnen uit elkaar lopen, met een trigger als handhaver. Eén gemiste `and not is_test` laat testdata een stoel bezetten in een groep van zes; één te veel haalt echte proeflessen uit de bewaking. Zie besluitenlog 26 en tests E8, E9, E10 |
| 6 | Migratie: `invoice_series`, `invoices`, `invoice_lines`, RLS-policies, grants, immutability-triggers, `invoices_credit_note_negative_check`; bucket `tmc-invoices` | **Sonnet** | Schema-werk, volledig uitgeschreven in 2.4 tot 2.7 en 4.5 |
| 7 | `tmc.finalize_invoice`, `tmc.v_invoice_credit_state`, `tmc.v_revenue_lines` | **Fable** | Het hart van de spec. De volgorde validatie-vóór-nummer, vergrendelen los van consumeren, de chronologiecontrole onder het slot, idempotentie, het bevriezen van de NAW alleen waar leeg, en de restitutie-plus-creditnota-rekenregel uit 7.4. Plus de concurrency-tests A1 tot A7 en F4 tot F5 |
| 8 | `vw_admin_kpis` + `get_admin_kpis()` drop en recreate met `is_test`-filter, unique index en herstelde grants, in één transactie | **Fable** | De harde regel uit 7.8. Een gemiste grant of een vergeten unique index breekt pas de volgende ochtend en dan stil |
| 9 | Frontend: `/app/facturen` uitbreiden (downloadkolom, slug-verrijking, `is_test`-filter, copy-migratie, `PaymentStatusBadge` op `refunded_amount_cents`); admin-factuurscherm; `CustomerInvoicePdf`; signed-URL server action; rapportagepagina met CSV-export | **Sonnet** | UI en rapportage-frontend. Patronen bestaan al: `/app/producten` voor de verrijking, `BulkActions` voor de CSV, `TrainerInvoicePdf` voor de PDF |

Volgorde is bindend voor 1 tot en met 7. PR 8 kan parallel aan 7. PR 9 is te splitsen als
hij te groot wordt, met de ledenkant (8.2 en 8.3) als eerste helft.

---

*Geschreven op basis van read-only discovery. Bij elke wijziging aan de facturatieketen dit
document bijwerken, met name het besluitenlog.*
