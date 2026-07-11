# Discovery: staat van de membership-flow, spec tegen repo

Datum: 2026-07-10. Discovery-only, geen writes. Bronnen: `git log`/`git show` op main, `gh pr list`/`gh pr view`, `supabase migration list --linked` (schema tmc), live catalogus- en RPC-verificaties via directe selects en `pg_get_functiondef` (eerder vandaag in deze sessie, expliciet vermeld waar van toepassing), en de repo-bestanden zelf.

## De tegenspraak opgelost: Claim A klopt NU, Claim B klopte TOEN

Beide claims waren waar op hun eigen moment; ze beschrijven dezelfde dag met een merge ertussen.

- **PR #73 = WS-4.** Titel "WS-4: publieke abonnement-configurator op /abonnement", branch `feat/ws4-abonnement-booking-flow`, base `main`. Status: **MERGED op 2026-07-10 om 08:46:38Z**, merge-commit `b2112ae`, staat op main (geverifieerd met `git branch --contains b2112ae`).
- **Claim B** komt uit `discovery-producten-tegoed.md`, geschreven eerder diezelfde ochtend, toen #73 nog open stond. De aanbeveling daaruit ("eerst #73 mergen") is opgevolgd; de merge gebeurde direct erna.
- **Commit `710870e`** bestaat op main: de merge van PR #69 (order-pipeline cutover, `startSignup` vervangen door `create_order`), gemerged 2026-07-09 om 16:31:24 +0200.
- Na #73 is vandaag ook **PR #74 gemerged** (`d892f66`, 09:11:51Z): de product-RPC-reparaties (whitelist niet-ondersteunde product-slugs, plan_type-mapping in `activate_order`, duo/1-op-1-scheiding in `book_pt_credits`, webhook accepteert oneoff), met migratie `20260721000000` toegepast op de remote. Die PR was de tweede stap uit de producten-discovery-sequencing en is de directe voorbereiding op de credits/producten-laag.

**Expliciet: is WS-4 gemerged? JA.** En PR #73 is precies WS-4, gemerged, niet open.

## 1. Workstream-ledger, per WS met bewijs

| WS | Status | Bewijs |
|---|---|---|
| WS-0 reconciliatie/teardown | Done, approved | spec §Build status; `ws0-reconciliation-report.md` (untracked in root) |
| WS-1 catalogus | Merged en live | PR #68 (`5e91c6f`), migraties `20260715`/`20260716`; correctie 10 ritten PR #70 (`c9862b0`, `20260719`) |
| WS-2 order-pijplijn | Merged en live | PR #69 (`710870e`), migraties `20260717`/`20260718`; money-test CONFIRMED in spec-checklist stap 2 |
| WS-3 prijzenpagina | Merged | PR's #65/#66/#67/#68 op main (spec-checklist stap 1, bevestigd 2026-07-09) |
| Migratie B (contractie) | Merged en live in productie | PR #72 (`61f51c8`), migratie `20260720`; fallback-cleanup PR #71 (`ab6c0bf`) |
| **WS-4 publieke boekflow** | **MERGED vandaag** | **PR #73 (`b2112ae`, 2026-07-10 08:46Z)** |
| Product-RPC-reparaties (voorloper WS-6) | Merged vandaag | PR #74 (`d892f66`, 2026-07-10 09:11Z), migratie `20260721` local = remote |
| WS-5 admin Nieuw-lid wizard | Niet gebouwd | Geen route/PR; `admin_create_order` RPC bestaat wel al live (pg_get_functiondef, deze sessie) |
| WS-6 producten Kopen-tab + tegoed | Niet gebouwd | Geen route/PR; DB-kant is na #74 klaar |
| WS-7 member self-management | Niet gebouwd | Geen route/PR |
| Mobile `@capacitor/browser`-move | Open | ws4-spec-section.md besluit 5: eigen PR, gate't web niet |

Openstaand uit de spec verder: overstap-CTA is admin-mediated opgelost in WS-4 (leadformulier `OverstapLeadForm.tsx` + `/api/leads/overstap`, in #73); de check-in-decrement-audit en de server-side EM-opening-ondergrens staan gedocumenteerd in `discovery-producten-tegoed.md` als bewuste uitgestelde besluiten.

## 2. Routes: wat er letterlijk staat

- **`src/app/abonnement/` bestaat** met zes bestanden: `page.tsx`, `AbonnementConfigurator.tsx`, `ConfigureStage.tsx`, `IdentifyStage.tsx`, `PayStage.tsx`, `lib.ts`. Het is een echte configurator (stages Configure, Identify, Pay) die via `createOrderAndCheckout` op de ongewijzigde `create_order`-pipeline betaalt.
- **`src/app/app/abonnement/nieuw/` bestaat niet meer** (ls: No such file or directory). In `next.config.ts` staat een redirect `source: "/app/abonnement/nieuw"` naar `/abonnement` met `permanent: true`; Next.js geeft daarvoor een **308** af (Claim A's "308-redirect" klopt technisch; de spec noemde het informeel een 301).
- De flow is vandaag op een preview browser-getest (EM-display-matrix, alle checks pass; het confirm-scherm na OTP is bewust niet doorlopen om geen testprofiel in productie-Supabase te minten).

## 3. Live configurator versus de mockup-richting

De datalaag matcht de mockup volledig; de presentatielaag wijkt op vier punten af. Belangrijk: twee van die afwijkingen zijn geen bouwfouten maar **vastgelegde WS-4-besluiten** (ws4-spec-section.md, besluit 1, resolved 2026-07-09) die haaks staan op de mockup-richting zoals hierboven beschreven. Dat conflict moet expliciet beslist worden.

**Wat matcht:**
- Alle prijzen zijn catalogus-lookups: `planSlug(family, frequency)` resolvet naar een van de negen slugs; geen enkele som in de UI behalve de add-on-optelling die `_compute_order_price` server-side herhaalt.
- De plus-30 is inderdaad een rij-wissel naar `all_inclusive_*` (de upsell-hint toont letterlijk het rijverschil, 30 euro per 4 weken op elke frequentie).
- Verlengde toegang is een plus-10-toggle waar `extended_access_mode = 'addon'` en een "inbegrepen"-regel bij All Access Onbeperkt (`'included'`). Exact de mockup.
- 24 maanden op factor 0.920 uit `price_cents_24m_computed`, met het kortingspercentage afgeleid getoond.

**Wat afwijkt:**

| Mockup-richting | Live (#73) | Aard |
|---|---|---|
| All Access als eigen, uitgelichte kaart | All Access is een van drie gelijkwaardige familie-knoppen in een grid | Presentatie; klein |
| Groepslessen 2x/3x met plus-30-TOGGLE, combinatie heet "Groepslessen 2x/3x + onbeperkt vrij trainen" | Geen toggle: een upsell-HINT ("Upgrade naar All Access voor +30 euro per 4 weken") die de koper zelf naar de All Access-familie laat wisselen; de combinatie heet All Access | **Bewust WS-4-besluit 1**: "not a toggle that swaps product and price under the buyer". Conflicteert met de mockup |
| Groepslessen onbeperkt zonder toggle | Klopt de facto (de hint verschijnt op elke groepslessen-frequentie, ook onbeperkt, maar er is nergens een toggle) | Vrijwel gelijk |
| Globale 12-versus-24-maanden toggle | Per-plan checkbox "24 maanden vastleggen, X% korting", alleen waar `price_cents_24m_computed` bestaat, en verborgen zolang EM open is | Functioneel gelijk, andere vorm; het EM-verbergen is een tweede bewust besluit (mutual exclusivity) |

De live versie is dus **niet** een oude configure-freely variant die de mockup nog moet worden; het is een gisteren-gelockt ontwerp dat op twee punten expliciet anders koos dan de mockup. "Zeven abonnementen" (mockup) versus negen slugs (live): de catalogus heeft er negen actief (drie families maal drie frequenties); de mockup telt de drie All Access-frequenties als één uitgelichte kaart plus combinaties, zelfde onderliggende rijen.

## 4. Fase-1-relevantie en aanbeveling

**Kernobservatie voor fase 1 (alles uniform, EM nergens): de bestaande bouw is al fase-1-compatibel door de fase-gate zelf.** `page.tsx` zet `emActive` alleen op true bij `getCampaignPhase() === 'open-em'`, en vandaag is de fase pre-open (`STUDIO_OPENING_DATE` 2026-08-15). In productie toont `/abonnement` dus NU al: geen EM-banner, geen 139-prijs, 24m-checkbox zichtbaar, inschrijfkosten gewoon getoond. EM is in deze codebase al "een laag erbovenop" die met de fase aan- en uitgaat; er hoeft niets gestript te worden om fase 1 te testen. (De EM-laag is gisteren op een scratch-preview met datum-override apart geverifieerd.)

**Aanbeveling: doorgaan op de bestaande lijn, niet vers beginnen.** Redenen:
1. WS-4 is gemerged, browser-geverifieerd, en rijdt op de geteste pipeline (#69, money-test confirmed). Vers beginnen gooit een werkende, DB-afgedwongen flow weg voor een presentatieverschil.
2. De mockup-afwijkingen zitten uitsluitend in `ConfigureStage.tsx` en `lib.ts` (labels, kaart-layout, toggle-versus-hint, toggle-vorm van 24m). Dat is een begrensde UI-ombouw op ongewijzigde slugs en een ongewijzigde pipeline; geen migratie, geen RPC.
3. Maar besluit eerst het echte conflict: **toggle versus upsell-hint** is geen detail. Besluit 1 van WS-4 (hint, geen product-wisselende toggle) is een dag oud en beargumenteerd; de mockup wil de toggle terug met eigen naamgeving ("Groepslessen + onbeperkt vrij trainen"). Kies er een en leg het vast; bouw niet allebei.

**Wat sowieso af of besloten moet voor de producten/credits-laag (fase 1) er veilig op kan:**
- Niets blokkeert hard meer aan de DB-kant: #74 heeft de vier gaten gedicht (whitelist, plan_type-mapping, duo-scheiding, oneoff-webhook). De Kopen-tab en Mijn-tegoed-tab (WS-6) kunnen direct.
- Wel eerst beslissen: (a) toggle-versus-hint hierboven, omdat de Kopen-tab dezelfde configurator-taal gaat spreken; (b) drop-in blijft buiten de pijplijn (besluit van vandaag, herbevestigen voor de Kopen-tab-scope); (c) de check-in-decrement-audit (tweede schrijver op `credits_remaining` in `src/lib/check-in/actions.ts`) inplannen zodra echte credits verkocht worden.
- WS-5 (admin-wizard) en WS-7 kunnen parallel aan of na WS-6; geen volgorde-dwang vanuit de DB.

## 5. Live geverifieerde objecten en drift

Via `pg_get_functiondef` (live, deze sessie, 2026-07-10): `_compute_order_price`, `create_order`, `admin_create_order`, `activate_order`, `book_class_session`, `cancel_class_booking`, `book_pt_credits`, `book_pt_pending_payment`, `plan_covers`. Na de #74-migratie zijn `_compute_order_price`, `activate_order` en `book_pt_credits` opnieuw live gecontroleerd (whitelist actief: `drop_in` geeft `product_not_supported`; `duo_10` first charge 110000 cent; guards aanwezig in beide functie-definities).

Via directe live selects (deze sessie): volledige `tmc.catalogue` (29 rijen; add-on/all_inclusive-model bevestigd: `all_inclusive_2x/3x/unl` als eigen plan-rijen, `extended_access` als enige addon-rij, PT/Duo op 10 credits), constraints en RLS-policies op orders/memberships/bookings/pt_bookings/catalogue/guest_passes, `pt_sessions.format`-constraint.

Via repo en git: `git log` main (alle commits hierboven), `gh pr view 73` (MERGED, bestandenlijst), `next.config.ts` redirect, `src/app/abonnement/*` inhoud, `ws4-spec-section.md` besluiten.

Migratielijst: `supabase migration list --linked` toont **local = remote door t/m `20260721000000`**, inclusief Migratie B (`20260720`, drop van `pricing_items`/`membership_plan_catalogue`). Placeholder `20260503` onaangeroerd.

**Drift repo versus live: geen gevonden.** De fase-logica in `20260717000000_order_pipeline.sql` (regel 211) is identiek aan de live definitie; de #74-functies zijn geauthord vanaf de live definities en na toepassing herbevestigd. Een eerdere contextcorrectie blijft staan: guest_passes komt uit baseline `20260706000000`, niet uit een migratie `20260427100000`.

## STOP

Discovery afgerond, niets gebouwd of gewijzigd behalve dit rapport. Openstaande besluiten voor Ilja: (1) toggle versus upsell-hint (mockup versus WS-4-besluit 1), (2) All Access-presentatie en 24m-toggle-vorm ombouwen naar de mockup of het gelockte ontwerp houden, (3) go voor WS-6 (Kopen-tab + Mijn tegoed) op de bestaande lijn.
