# Discovery: losse producten en tegoed-systeem (impact op WS-4)

Datum: 2026-07-10. Discovery-only, geen enkele write uitgevoerd. Alle DB-objecten live geverifieerd via `pg_get_functiondef` en directe selects op project `xoivleieyfcxcfawgveh`, schema `tmc`. Repo-staat geverifieerd via `git log`, `gh pr list`, `supabase migration list --linked`.

## Kernconclusies (de twee JA/NEE-vragen)

1. **Bestaat het credit-systeem al? JA.** Rittenkaart- en PT-tegoed is gemodelleerd als rijen in `tmc.memberships` met `plan_type` `ten_ride_card` of `pt_package` en de kolommen `credits_total`, `credits_remaining`, `credits_expires_at`. Consumptie, refund en RLS-leesbaarheid bestaan allemaal al (details in A en D). Er is geen aparte balance-tabel en die is ook niet nodig; dit is exact het "product orders reuse existing membership rows"-besluit uit de WS-2 design (spec, regel "Product orders reuse existing membership rows").
2. **Ondersteunt de order-pijplijn eenmalige verkoop? JA, met twee gaten.** `create_order` accepteert `kind = 'product'`, `createOrderAndCheckout` stuurt voor producten een gewone oneoff Mollie-betaling (geen mandaat), en `activate_order` heeft een werkende product-branch die de credit-membership aanmaakt. Wat ontbreekt: (a) een UI die producten verkoopt (de `/abonnement`-configurator is plans-only), en (b) de product-branch van `activate_order` classificeert een `drop_in`-order verkeerd (zie B3, het belangrijkste inhoudelijke gat).

---

## A. Credit/tegoed-systeem: bestaat al

**Bewijs: information_schema select over alle `tmc`-tabellen, pg_constraint select, pg_policies select. Alles live.**

- **Saldo-drager: `tmc.memberships`.** Kolommen `credits_total integer`, `credits_remaining integer`, `credits_expires_at date`. `plan_type` check-constraint bevat o.a. `ten_ride_card` en `pt_package` (naast de gewone plan-families). Een rittenkaart of PT-pakket is dus een membership-rij met status `active`, `billing_cycle_weeks 0`, `commit_months 0`, geen Mollie-subscription.
- **Verbruiksregistratie: `tmc.bookings.credits_used integer`** (per boeking) en **`tmc.pt_bookings.credits_used_from uuid`** (FK naar `memberships.id`, welk pakket de PT-rit betaalde).
- **Vervaldatum:** `credits_expires_at` wordt bij activatie gezet op `start_date + validity_months` uit de catalogus (rittenkaart: 4 maanden). PT/Duo-pakketten hebben `validity_months null`, dus geen vervaldatum.
- **RLS: lid kan eigen saldo lezen.** `memberships_self_read` (SELECT, `profile_id = auth.uid()`). De "Mijn tegoed"-tab kan dus een directe select zijn, geen nieuwe RPC of policy nodig. Idem `bookings_self_read` en `pt_bookings_self_read` voor de verbruikshistorie.
- **`guest_passes`/`guest_bookings` is NIET het credit-model.** Het is puur companion-attach: `passes_allocated`/`passes_used` per periode (`period_start`/`period_end`) gekoppeld aan een membership, met eigen check-constraint `passes_used <= passes_allocated` en een `get_remaining_guest_passes` RPC. Staat volledig los van `credits_*`. (Kanttekening: de opdracht-context noemde migratie `20260427100000` als bron; die timestamp staat niet in `supabase migration list --linked`. De guest-tabellen zitten in de baseline `20260706000000`. Geen inhoudelijk verschil, wel een correctie op de context.)

**Conclusie A: JA, het credit-systeem bestaat, is DB-afgedwongen (row locks, guards) en is door een lid zelf leesbaar.**

## B. Order-pijplijn en eenmalige verkoop

**Bewijs: `pg_get_functiondef` op `tmc.create_order`, `tmc.admin_create_order`, `tmc.activate_order`, `tmc._compute_order_price` (alle vier live opgehaald); `tmc.orders`-constraints via pg_constraint; repo-bestanden `src/lib/orders/create-order.ts` en `src/app/api/mollie/webhook/route.ts`.**

1. **`tmc.orders` ondersteunt producten al.** `kind` check: `subscription | product`. `orders_subscription_shape_check` dwingt af dat recurring-velden exact bij subscriptions horen. Kolommen `class_session_id` en `pt_session_id` (FK's) bestaan op de orders-tabel en `create_order` accepteert `p_class_session_id`/`p_pt_session_id` en schrijft ze weg. Statuses: draft, pending, paid, activated, expired, cancelled. Geen client-insert policy op orders (alleen `orders_self_read` en `orders_admin_all`), single-order-path is DB-afgedwongen, klopt met de context.
2. **Mollie oneoff bestaat al.** `src/lib/orders/create-order.ts` regel 156: `...(isSubscription ? { sequenceType: SequenceType.first } : {})`. Een product-order krijgt dus een gewone oneoff-betaling zonder mandaat. De webhook (`/api/mollie/webhook`) draait elke first payment door `activate_order` en die functie heeft een expliciete product-branch die de credit-membership aanmaakt (`credits_total = coalesce(credits, 1)`, `credits_expires_at` uit `validity_months`). De pijplijn is dus end-to-end product-capable op DB- en betalingsniveau.
3. **GAT 1, drop_in-classificatie in `activate_order`.** De product-branch kiest `plan_type` zo: `case when catalogue_slug like 'ten_ride_card%' then 'ten_ride_card' else 'pt_package' end`. Een `drop_in`-order (of `drop_in_kids`/`drop_in_senior`, of `duo_single`) zou dus een `pt_package`-membership met 1 credit worden. Voor drop-in is dat dubbel fout: het hoort geen PT-credit te zijn, en de `class_session_id` op de order wordt in de product-branch volledig genegeerd (geen booking aangemaakt, geen sessie-registratie). Drop-in via de pijplijn is vandaag dus niet correct te verkopen; de kolommen zijn er, de activatielogica niet. Duo-pakketten (`duo_10`, `duo_single`) worden wel `pt_package`, zie GAT 2.
4. **GAT 2, duo versus 1-op-1 in consumptie.** `book_pt_credits` zoekt op `plan_type = 'pt_package'` zonder onderscheid tussen een duo-pakket en een 1-op-1-pakket (`plan_variant` bevat wel de slug maar wordt niet vergeleken met `pt_sessions.format`). Een lid met een duo-rittenkaart zou daarmee 1-op-1-sessies kunnen boeken en omgekeerd. Vandaag theoretisch (er is nog geen product-verkoop-UI), maar zodra de Kopen-tab live gaat is dit een echt prijsverschil (duo-rit kost 110 euro per 2 personen, 1-op-1-rit 90 euro).
5. **GAT 3, geen verkoop-UI.** `createOrderAndCheckout` heeft precies een caller: `src/app/abonnement/PayStage.tsx` (de WS-4 configurator, plans-only via `planSlug()` in `src/app/abonnement/lib.ts`). Er is geen route of component die een product-slug door de pijplijn stuurt. De oude crowdfunding one-off checkout bestaat nog (`/api/crowdfunding/checkout` + webhook) maar staat volledig los (eigen tabellen, geen orders); `/api/trial-bookings/webhook` + `src/lib/actions/trial-booking.ts` is het proefles-oneoff-pad, ook los van orders.
6. **Herbevestigd seam uit de EM-window-test (2026-07-10): de server kent geen opening-ondergrens.** `_compute_order_price` gate't EM alleen op `now() < closes_at`. In de echte pre-open fase zou de server EM toekennen als een client erom vraagt; de client vraagt er pre-open nooit om. Display-vs-enforcement-naad, bewuste beslissing nodig, geen blocker voor producten.

**Conclusie B: JA voor de pijplijn (DB + Mollie + webhook), NEE voor de UI, en de drop_in/duo-activatie- en consumptie-mapping moet gerepareerd voordat die producten echt verkocht worden.**

## C. Catalogus-representatie

**Bewijs: volledige live select van `tmc.catalogue` (29 rijen), hieronder de relevante actieve rijen. Alle abonnementsprijzen per 4 weken.**

| slug | kind | prijs | credits | validity | actief |
|---|---|---|---|---|---|
| groepslessen_2x / 3x / unl | plan | 79 / 99 / 119 euro per 4 weken | | | ja |
| vrij_trainen_2x / 3x / unl | plan | 49 / 59 / 69 euro per 4 weken | | | ja |
| all_inclusive_2x / 3x / unl | plan | 109 / 129 / 149 euro per 4 weken | | | ja |
| extended_access | addon | 10 euro per 4 weken | | | ja |
| signup_fee | fee | 39 euro eenmalig, EM-prijs 0 | | | ja |
| drop_in | product | 17 euro | 1 | geen | ja |
| drop_in_kids / drop_in_senior | product | 13 euro | 1 | geen | ja |
| ten_ride_card | product | 150 euro | 10 | 4 mnd | ja |
| ten_ride_card_kids / _senior | product | 110 euro | 10 | 4 mnd | nee |
| pt_single | product | 95 euro | 1 | geen | ja |
| pt_10 | product | 900 euro | 10 | geen | ja |
| duo_single | product | 120 euro | 1 | geen | ja |
| duo_10 | product | 1100 euro | 10 | geen | ja |
| program_studio_12w / program_online_12w | product | 2400 / 1250 euro | | | ja, maar purchasable false (lead-items) |
| kids_* / senior_* plans | plan | | | | nee (inactief) |

- **PT/Duo-rittenkaarten staan bevestigd op 10 ritten** (`credits = 10`, slugs `pt_10` en `duo_10`, migratie `20260719000000`). Prijzen 900 en 1100 euro, ongewijzigd. De ride-count-kolom is `catalogue.credits`.
- **De 30-euro-toevoeging (onbeperkt vrij trainen) is GEEN catalogusrij.** All Access bestaat als eigen plan-rijen (`all_inclusive_*`); het verschil met de groepslessen-rij is overal precies 3000 cent. De configurator-toggle is dus een rij-wissel (andere slug), geen lookup-plus-som. Alleen verlengde toegang is een echte addon-rij die `_compute_order_price` optelt.
- **24-maandenprijzen zijn geauthord in de catalogus:** `commit_24m_discount_factor 0.920` op elke plan-rij, met `price_cents_24m_computed` als afgeleide kolom (bv. All Access Onbeperkt 137,08 euro per 4 weken). Niet "nergens", ze staan er.
- **EM-shape:** alleen `all_inclusive_unl` heeft een afwijkende EM-prijs (139 euro per 4 weken in plaats van 149); de andere EM-eligible rijen (groepslessen_*, all_inclusive_2x/3x) hebben `early_member_commit_months 0` en fee-waiver via `signup_fee.early_member_price_cents 0`.
- **RLS op catalogue:** `catalogue_public_read` op `is_active = true`, dus een Kopen-tab kan client-side of ISR direct uit de catalogus lezen.

## D. Consumptie / afboeken: bestaat al, drie paden

**Bewijs: `pg_get_functiondef` op `book_class_session`, `cancel_class_booking`, `book_pt_credits`, `book_pt_pending_payment`, `plan_covers`; repo `src/lib/check-in/actions.ts`.**

1. **Groepsles op strippenkaart: `tmc.book_class_session`.** Dekking-lookup pakt eerst een dekkend abonnement zonder credits, anders een `ten_ride_card` met `credits_remaining > 0` (`plan_covers('ten_ride_card', pillar)` dekt yoga_mobility en kettlebell, niet vrij_trainen). De membership-rij wordt met `for update` gelockt, de decrement heeft een `>= credits`-guard. `cancel_class_booking` refundt de credit bij annulering binnen het venster, ook onder een lock.
2. **PT-rit van een pakket: `tmc.book_pt_credits`.** Zelfde patroon: lock op de `pt_package`-membership, decrement met guard, `credits_used_from` op de booking. `book_pt_pending_payment` is het losse-betaling-pad (flat `pt_single`-prijs uit de catalogus, Mollie-betaling per boeking, buiten de orders-spine om).
3. **Check-in: tweede afboekpad in TS.** `src/lib/check-in/actions.ts` (rond regel 603 tot 740) boekt bij een vrij-trainen-check-in zonder booking rechtstreeks een `ten_ride_card`-credit af via een update op `memberships` (service-role client). Dat is een decrement buiten de RPC-laag om, zonder row-lock-patroon. Werkt, maar het is een tweede schrijver op `credits_remaining`; bij het bouwen van de tegoed-feature dit pad meenemen in de audit (race met gelijktijdige booking-decrement is theoretisch mogelijk).
4. **Drop-in-consumptie bestaat niet als pijplijnpad.** `bookings.drop_in_payment_id`/`drop_in_price_cents` bestaan als kolommen maar hebben geen schrijver in app-code (grep: alleen check-in-labels en proefles). De losse les wordt vandaag alleen via `trial_bookings` (proefles) of als check-in-registratie (`access_type 'drop_in'`) afgehandeld, niet als gekocht product.

**Keten voor "rit van een rittenkaart" vandaag: koop (ontbreekt: UI) -> activate_order maakt credit-membership -> book_class_session/book_pt_credits boekt af -> cancel refundt -> check-in-pad kan ook afboeken. De keten bestaat dus volledig behalve de koop-UI.**

## E. WS-4 en openstaande taken

**Bewijs: `spec-membership-flow.md` volledig gelezen; `git log --oneline -n 20`; `gh pr list --state all`; `supabase migration list --linked`.**

- **Migraties: local = remote t/m `20260720000000`** (Migratie B, live). Geen migratie-drift, geen openstaande migraties.
- **In-flight: PR #73 (`feat/ws4-abonnement-booking-flow`), open.** Bouwt de publieke `/abonnement`-configurator (ConfigureStage, IdentifyStage, PayStage, lib.ts), verwijdert `/app/abonnement/nieuw` (de oude checkout), voegt de overstap-leadroute toe, en verbergt de 24m-rij op `/prijzen` tijdens open EM. Diff raakt 23 bestanden. De EM-display-matrix is vandaag (2026-07-10) op een scratch-preview geverifieerd (alles pass, confirm-screen-check niet uitvoerbaar zonder echte OTP-login; teardown bevestigd schoon).
- **Overlap met producten/tegoed is reëel maar goed begrensd:**
  - Zelfde server-action: `createOrderAndCheckout` (WS-4's PayStage is er de enige caller; de Kopen-tab wordt caller twee).
  - Zelfde RPCs: `create_order`/`activate_order`; de drop_in/duo-fix uit B3/B4 raakt `activate_order` en `book_pt_credits`, functies waar WS-4 op leunt maar die het niet wijzigt.
  - Zelfde member-app-navigatie: de mockup-richting (Producten-sectie met Kopen- en Mijn-tegoed-tabs) leeft naast `/app/abonnement`; PR #73 wijzigt `/app/app/abonnement/page.tsx` licht.
  - GEEN overlap op de catalogus zelf: producten/tegoed heeft geen catalogus-migratie nodig (rijen staan er al, op 10 ritten).
- **Spec-status:** prijs-consolidatie compleet (Migratie B live). Openstaand volgens de spec: WS-5 (admin Nieuw-lid wizard, zit al op `admin_create_order` + MailerSend), WS-6 (one-off producten, dit is exact de producten/tegoed-feature; de spec heeft hem al gescoped inclusief "rittenkaarten en PT/Duo packages credit a balance on activation"), WS-7 (member self-management), plus de overstap-CTA-integriteit (open item) en de mobile `@capacitor/browser`-move.

## F. Impact en aanbevolen volgorde

**Impact op het live schema: klein.** Geen nieuwe tabellen, geen nieuw balance-model, geen catalogus-seed. Wel een forward migratie voor de RPC-reparaties (SECURITY DEFINER, dus Fable-review):

1. `activate_order` product-branch: correcte `plan_type`-mapping voor `drop_in*` en `duo*` (en besluit wat drop-in bij activatie doet: booking aanmaken op `class_session_id`, of drop-in bewust buiten de pijplijn houden en alleen rittenkaarten/PT/Duo verkopen in de Kopen-tab).
2. `book_pt_credits`: duo-pakket versus 1-op-1-pakket matchen op `pt_sessions.format` (of op `plan_variant`).
3. Optioneel, zelfde bewuste beslissing: de server-side EM-ondergrens (seam uit B6).

**Impact op WS-4: sequencing, geen conflict.** De feature bouwt op dezelfde bestanden en RPCs maar wijzigt niets dat PR #73 ook wijzigt, mits WS-4 eerst merget.

**Aanbevolen volgorde:**

1. **Eerst: PR #73 mergen** (na de handmatige Mollie-display-equals-charge-check die al gepland staat). Alles daarna bouwt op de definitieve vorm van `createOrderAndCheckout`, PayStage en de verwijderde oude checkout. Producten-werk starten op een branch naast een open #73 geeft gegarandeerd merge-conflicten in `src/app/abonnement/**` en de member-app-nav.
2. **Dan: de RPC-reparaties als eigen kleine PR (Fable-design, Sonnet-build).** activate_order-mapping + book_pt_credits-formaatcheck + het drop-in-besluit. Dit is de enige echte bouwvoorwaarde voor de Kopen-tab; zonder dit verkoopt de tab pakketten die verkeerd activeren of verkeerd consumeren.
3. **Dan: de Kopen-tab + Mijn-tegoed-tab (WS-6, Sonnet).** Kopen: catalogus-select (kind product, purchasable, is_active) -> `createOrderAndCheckout` -> bestaande webhook doet de rest. Mijn tegoed: pure read op eigen memberships (`plan_type in (ten_ride_card, pt_package)`, `credits_remaining`, `credits_expires_at`) plus verbruik uit bookings/pt_bookings. Geen nieuwe policies nodig.
4. **Parallel mogelijk (raakt niets hiervan):** WS-5 admin-wizard, de overstap-CTA-beslissing, de check-in-decrement-audit (D3).
5. **Geblokkeerd door niets, maar bewust besluiten:** drop-in in of uit de Kopen-tab (zie 2); de mockup-richting van twee tabs kan ongewijzigd door, het datamodel ondersteunt hem al volledig.

**De goedgekeurde UX-richting hoeft NIET overschreven te worden.** De mockups passen een-op-een op het bestaande model; het enige dat de mockup-scope raakt is het drop-in-besluit (drop-in verkopen vereist de activate_order-uitbreiding, de rest niet).

## Live geverifieerde objecten (bronnenlijst)

Via `pg_get_functiondef` (live, 2026-07-10):
- `tmc._compute_order_price`, `tmc.create_order` (eerder deze sessie, EM-window-test), `tmc.admin_create_order`, `tmc.activate_order`, `tmc.book_class_session`, `tmc.cancel_class_booking`, `tmc.book_pt_credits`, `tmc.book_pt_pending_payment`, `tmc.plan_covers`.

Via directe live selects:
- Alle `tmc`-tabellen + kolommen (information_schema), check/FK/unique-constraints op memberships, bookings, pt_bookings, orders, catalogue, guest_passes, check_ins, trial_bookings, payments (pg_constraint), RLS-policies op diezelfde tabellen (pg_policies), volledige `tmc.catalogue` (29 rijen), functielijst schema tmc (pg_proc).

Repo-vs-live driftcheck:
- `supabase/migrations/20260717000000_order_pipeline.sql` bevat de canonieke definities van de vier order-RPCs; de fase-logica (`v_phase_open := v_deadline is not null and now() < v_deadline`, regel 211) is identiek aan live. **Geen drift gevonden** tussen repo-migraties en de live functiedefinities op de gecontroleerde punten.
- Een contextcorrectie: guest_passes komt uit de baseline `20260706000000`, niet uit een migratie `20260427100000` (die timestamp staat niet in de linked-lijst).

## STOP

Discovery afgerond, niets gebouwd, niets gewijzigd (alleen dit rapport geschreven). Wachten op besluit van Ilja over: (1) merge-moment #73, (2) het drop-in-besluit, (3) de RPC-reparatie-PR, (4) de server-side EM-ondergrens.
