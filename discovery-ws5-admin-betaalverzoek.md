# Discovery WS-5: admin-betaalverzoek-systeem

Datum: 2026-07-11. Discovery-only, geen code, geen migraties, geen writes.
Live DB-definities opgehaald via `pg_get_functiondef` op project `xoivleieyfcxcfawgveh`, schema `tmc`.

Scope zoals door Ilja vastgesteld: alle betalingen via een betaallink (geen betaalapparaat in de studio, klant betaalt altijd zelf, past bij de SEPA-mandaat-eis). Marlon moet (a) een nieuw lid op een abonnement kunnen inschrijven, (b) een bestaand of nieuw lid een product kunnen verkopen (rittenkaart, PT, Duo), en (c) een custom bedrag kunnen factureren buiten de catalogus. Overstap is niet in scope.

## Samenvatting in twee zinnen

De DB-kant van WS-5 is voor de catalogus-gevallen al af: `admin_create_order` bestaat live, is admin-gated, kent de overstap-waiver en een betaallink-TTL, en de expire-orders cron notificeert Marlon al bij verlopen admin-links. Wat volledig ontbreekt is alles wat de klant en Marlon aanraken: er is geen betaallink-verzilverpagina (het order-token wordt nergens in de app geconsumeerd), geen e-mail die een betaallink verstuurt, geen wizard-UI, geen admin-pad om een klantprofiel aan te maken, en een custom bedrag is op drie onafhankelijke lagen onmogelijk.

## Kernantwoorden

| Vraag | Antwoord |
|---|---|
| Kan de pijplijn nu custom bedragen aan? | **NEE**, geblokkeerd op drie lagen (zie punt 2) |
| Bestaat er al een betaallink-flow (e-mail met link, token-pagina)? | **NEE**, alleen het token en de expiry-machinerie bestaan; niets consumeert het token en niets mailt een link |
| Genereert `admin_create_order` al een betaallink? | **NEE**, het retourneert `order_id` plus `token`, verder niets: geen Mollie-betaling, geen e-mail |
| Bestaat er een admin order- of betaalverzoek-UI? | **NEE**, `admin_create_order` heeft nul call-sites in TS/TSX |
| Bestaat er een admin klant-aanmaak-pad voor leden? | **NEE** voor dit doel; wel walk-in-profielcreatie (check-in-tablet, `requireStaff`) en trainer-invite (`requireAdmin`) |
| Bestaat er echte facturatie of BTW-registratie? | **NEE**, alleen betaaloverzicht op `tmc.payments`; een custom-bedrag-verzoek levert dus een betaalverzoek op, geen juridisch kloppende factuur |

---

## 1. admin_create_order: live definitie

Live geverifieerd via `pg_get_functiondef`. Signatuur:

```
tmc.admin_create_order(
  p_profile_id uuid,
  p_slug text,
  p_extended_access boolean default false,
  p_commit_24m boolean default false,
  p_early_member boolean default false,
  p_waive_signup_fee boolean default false,
  p_expires_in_days integer default 7
) returns jsonb, SECURITY DEFINER, search_path tmc/extensions
```

Wat hij doet, stap voor stap:

- **Admin-only op DB-niveau**: eerste regel is `if not tmc.is_admin() then raise 42501`. Het commentaar in de functie zelf documenteert de bedoelde dubbele laag: de aanroepende server action draait daarnaast `requireAdmin()` in TS (die server action bestaat nog niet, zie punt 4).
- **Target-profiel verplicht**: `p_profile_id` moet bestaan in `tmc.profiles`, anders `profile_not_found`.
- **Prijs uitsluitend uit de catalogus**: dezelfde helper als self-service, `tmc._compute_order_price(p_slug, ...)`. Het functie-commentaar zegt het expliciet: "admin cannot reach a different price than self-service for the same selection". Er is geen bedrag-parameter, alleen een slug.
- **Subscription-guards**: bestaande membership (`pending/active/paused/cancellation_requested`) of open subscription-order blokkeert met `existing_membership` respectievelijk `existing_open_order`.
- **Overstap-waiver**: `p_waive_signup_fee` zet `signup_fee_cents := 0` en `signup_fee_waiver := 'overstap'`, maar alleen als Early Member de fee niet al op nul had gezet (EM-waiver wint, een order draagt nooit twee waiver-redenen).
- **Betaallink-TTL**: `expires_at = now() + clamp(p_expires_in_days, 1, 14)` dagen, default 7. Het commentaar noemt dit expliciet de payment-link-levensduur ("Payment links live longer than an inline checkout").
- **Provenance**: `created_by = 'admin'`, `created_by_profile_id = auth.uid()`, afgedwongen door check-constraint `orders_admin_provenance_check` (`created_by = 'admin'` dan en slechts dan als `created_by_profile_id is not null`).
- **Output**: `order_id`, `token`, alle bedragen (`first_charge_cents`, `recurring_cents`, `signup_fee_cents`, `extended_access_price_cents`), `commit_months`, `early_member`, `expires_at`. **Geen betaallink, geen Mollie-betaling, geen e-mail.** De order blijft in status `draft`.

Producten kan hij al aan: `_compute_order_price` accepteert product-slugs (whitelist, zie punt 2), en `activate_order` kent het `created_by = 'admin'` pad al (`source = 'admin_manual'` op de membership-rij, voor zowel subscription als product).

Repo-bron van de definitie: `supabase/migrations/20260717000000_order_pipeline.sql:428` (grants regel 552-554). De live definitie is leidend en is hierboven beschreven.

## 2. Custom bedragen: NEE, geblokkeerd op drie lagen

Expliciet antwoord: **de pijplijn kan nu geen custom bedrag aan.** De drie lagen, alle live geverifieerd:

1. **`tmc._compute_order_price`** (de enige prijsbron voor beide create-RPC's): eist een actieve `tmc.catalogue`-rij (`catalogue_row_not_found`), `purchasable = true`, `kind in ('plan','product')`. Voor producten zit er bovendien een harde whitelist in: `ten_ride_card%`, `pt_single`, `pt_10`, `duo_single`, `duo_10`; al het andere geeft `product_not_supported`. Let op: `drop_in` is in de catalogus `purchasable` maar staat niet in de whitelist, dus zelfs sommige catalogusproducten kunnen nu geen order worden.
2. **`tmc.orders` schema**: `catalogue_slug text NOT NULL`, `kind` check op alleen `'subscription' | 'product'`, en `orders_subscription_shape_check` (subscription vereist `recurring_cents`, `billing_cycle_weeks`, `commit_months`). Een order zonder catalogus-koppeling past niet in de tabel. (Er is overigens geen FK van `catalogue_slug` naar `catalogue`; de validatie zit in de RPC's, niet in een constraint.)
3. **`tmc.activate_order`** (service-role only, de enige activatie): de subscription-tak leest de catalogusrij opnieuw (`insert ... select from tmc.catalogue where slug = v_order.catalogue_slug`) en de product-tak heeft dezelfde whitelist als laag 1; een onbekende slug wordt geld-binnen-maar-geblokkeerd (`status = 'paid'`, `blocked_reason = 'product_not_supported'`).

Client-side idem: `createOrderAndCheckout` (`src/lib/orders/create-order.ts:58`) stuurt alleen `{slug, extendedAccess, commit24m, earlyMember}` naar `create_order` en gebruikt het server-berekende `first_charge_cents` voor de Mollie-betaling (`create-order.ts:151,161`). Geen enkel Mollie-pad in de repo accepteert een client-bedrag (trial: prijs uit catalogus, PT: prijs uit `book_pt_pending_payment`, crowdfunding: prijs server-side uit Sanity).

**De kloof voor een custom bedrag (inventarisatie, geen ontwerp):** alle drie de lagen moeten open. Minimaal: een order-vorm zonder catalogus-koppeling (nieuw `kind` of nullable `catalogue_slug` plus een omschrijving- en bedrag-veld), een admin-only create-pad dat een vrij bedrag accepteert, en een activatie-tak in `activate_order` die alleen de betaling vastlegt en geen membership of credits aanmaakt. Bijbehorende guards die dan nodig zijn: admin-only creatie (het bedrag-accepterende pad mag nooit via `create_order` bereikbaar zijn), ondergrens en bovengrens op het bedrag, verplichte omschrijving, oneoff-only (nooit een mandaat op een vrij bedrag), en een audit-spoor (`tmc.admin_audit_log` bestaat al als tabel). Dit is bewust het zwaarste deel van WS-5: het doorbreekt het display-equals-charge-principe dat na Migration B structureel was, en hoort daarom in een eigen, klein, goed bewaakt Fable-PR.

## 3. Betaallink-bezorging: bestaat niet, drie bouwstenen wel

Expliciet antwoord: **NEE, er bestaat geen flow die een betaallink naar een klant stuurt.**

Wat er wel en niet is:

- **MailerSend-machinerie bestaat**: `src/lib/email.ts:24` (`sendEmail`, React Email naar HTML, env `MAILERSEND_API_KEY`, `MAILERSEND_FROM_EMAIL`, `MAILERSEND_FROM_NAME`). Alle huidige mails zijn boekingsbevestigingen, reminders, wachtlijst, gastpas en payment-failed; geen enkele bevat een checkout-URL. Zelfs `src/emails/payment_failed.tsx:48-59` linkt niet, die verwijst naar Mollie's eigen retry.
- **Het order-token bestaat maar wordt nergens verzilverd**: `tmc.orders.token` (uuid, uniek, door beide create-RPC's geretourneerd) heeft nul consumers in `src/`. Er is geen `/betaal/[token]`-achtige route. Grep op token-gebruik in de app-code is leeg.
- **Alle checkout-URL's zijn browser-redirects**: `BuyButton.tsx:37`, `PayStage.tsx:63`, `TrialBookingList.tsx:61`. De Mollie-betaling wordt aangemaakt op het moment dat de ingelogde klant zelf afrekent, nooit vooraf voor een link.
- **Mandaat via link kan technisch**: het SEPA-mandaat ontstaat door `sequenceType: first` op de eerste betaling (`src/lib/orders/create-order.ts:166`, producten en PT zijn oneoff zonder sequenceType). Dat werkt identiek als de klant de checkout via een gemailde link bereikt. Het ontwerp-gevolg voor WS-5: de Mollie-betaling moet pas aangemaakt worden wanneer de klant de token-pagina opent (een Mollie-checkout leeft veel korter dan de 7 tot 14 dagen order-TTL), precies waarvoor het token en `expires_at` al bestaan.
- **Expiry-notificatie bestaat al**: `src/app/api/cron/expire-orders/route.ts` zet verlopen `draft/pending` orders op `expired` en stuurt voor `created_by = 'admin'` orders een ntfy-notificatie "Betaallink verlopen ... Opnieuw versturen?" (regel 39-46). De cron is dus al op het betaallink-model gebouwd.

**Correctie op het spec-ledger**: `spec-membership-flow.md` regel 57 zegt dat de Nieuw-lid wizard "sits on admin_create_order and the MailerSend link, both already built in the pipeline". Dat klopt half: de RPC bestaat, maar de MailerSend-betaallink bestaat niet. Alleen de generieke `sendEmail`-helper en de expiry-cron zijn er.

## 4. Admin-schermen: geen order- of betaalverzoek-UI

Bestaande admin-UI onder `src/app/app/admin/`: Dashboard (KPI's), Rooster (week-grid editor), Sessie-detail, Leden (lijst met zoek, filter, sortering, paginering), Leden-detail (tabs: Overview, Bookings, Payments, Training, HealthIntake, Notes, History), Schema-builder, Trainers, Pauzes, Aankondigingen, Oefeningen, Lestypes, Instellingen, Dropoff.

- Sidebar (`admin/_components/AdminSidebar.tsx:42-61`): geen order-, producten- of betaalverzoek-item.
- Leden-detail `ActionMenu` (`admin/leden/[id]/_components/ActionMenu.tsx`): Pauze toekennen, Credits aanpassen, Account verwijderen; "Abonnement wijzigen" staat disabled met "komt in latere release" (regel 62-63). Geen order-actie.
- **`admin_create_order` heeft nul call-sites in TS/TSX.** Het komt alleen voor in de migratie (definitie plus grants), een comment in `src/app/early-member/OverstapLeadForm.tsx:11` en een comment in `src/lib/mailerlite.ts:96`. De RPC is dus puur server-side aanwezig, zonder enige UI of server action erboven.

## 5. Klant zoeken en aanmaken

**Zoeken bestaat**: `src/lib/admin/members-query.ts:167-170`, `listMembers` met `ilike` op voornaam, achternaam en e-mail, gefilterd op `role = 'member'` (regel 165), gebruikt door `admin/leden/page.tsx`. Bruikbaar als wizard-bouwsteen voor "bestaand lid kiezen".

**Aanmaken namens iemand anders bestaat niet voor dit doel.** Wat er wel is:

- `createWalkInProfile` (`src/lib/check-in/actions.ts:445`): `admin.auth.admin.createUser()` op regel 486, gegate door `requireStaff()` (regel 821: admin, trainer, of tablet-pin via `isAdminUnlocked()`). Dit is de check-in-tabletflow voor walk-ins, niet gekoppeld aan orders, en niet bereikbaar vanuit de admin-navigatie.
- Trainer-invite (`src/lib/admin/trainer-actions.ts:353`, `inviteUserByEmail`, `requireAdmin()`): alleen voor rol trainer.
- `ensureProfile` (`src/lib/supabase/ensure-profile.ts:21`): draait alleen voor de ingelogde gebruiker zelf.
- In het `tmc`-schema bestaat geen RPC die een profiel aanmaakt; profielcreatie loopt via de `handle_new_auth_user`-trigger op de auth-user-insert (WS-0 amendement: "Admin-create resolves by creating the auth user up front in a pending state").

**Autorisatielaag**: `requireAdmin()` (`src/lib/admin/require-admin.ts:13`) leest `profiles.role` en eist `admin`; de hele `/app/admin`-boom zit achter de layout-guard (`src/app/app/admin/layout.tsx:29`). De nieuw te bouwen on-behalf-klant-aanmaak (service-role `createUser` plus profiel) is een security-kritisch nieuw oppervlak: het moet achter `requireAdmin()` (niet `requireStaff`, de tablet-pin mag geen leden kunnen aanmaken met een order), en het is de eerste plek waar een admin een auth-identiteit voor een derde mint. Aanrader uit de walk-in-les in WS-0: echte e-mail verplicht, nooit placeholder-identiteiten.

## 6. Waiver en korting: wat de wizard aan knoppen heeft

Wat er bestaat, allemaal catalogus- of RPC-gebonden:

- **Inschrijfkosten-waiver**: `p_waive_signup_fee` op `admin_create_order`, resultaat `signup_fee_waiver = 'overstap'`, check-constraint staat alleen `'early_member' | 'overstap'` toe. EM-waiver wint altijd; nooit twee redenen op een order. Dit is de enige handmatige admin-korting die bestaat.
- **Early Member**: `p_early_member` is intent, nooit een prijshendel; alleen effectief als de catalogusrij EM-eligible is en de campagnefase open (live in `_compute_order_price`).
- **24-maanden-korting**: `catalogue.commit_24m_discount_factor`, volledig uit de catalogus, wederzijds exclusief met EM (`em_and_24m_exclusive`).
- **PT-intake-korting**: aparte machinerie in het boekingspad (`system_settings.member_pt_discount_percent`, `profiles.has_used_pt_intake_discount`), raakt de order-pijplijn niet.

Wat er **niet** bestaat: een vrij kortingsveld of kortingspercentage op een order. `base_price_cents` komt altijd uit de catalogus. Een "10 euro korting op het abonnement"-knop zou hetzelfde drie-lagen-probleem raken als het custom bedrag in punt 2.

Wizard-knoppen die op de bestaande RPC passen: keuze slug (plan of product), extended access, 24m-commit, EM-intent, waive-inschrijfkosten (checkbox), TTL in dagen (1 tot 14, default 7). Meer smaken heeft de RPC niet.

## 7. Facturatie en BTW: alleen een betaaloverzicht

Expliciet antwoord: **NEE, er is geen facturatie- of BTW-registratie voor klanten.**

- `/app/facturen` (`src/app/app/facturen/page.tsx`) leest `tmc.payments` (regel 65-72) en toont datum, bedrag, status en omschrijving. Geen factuurnummer, geen BTW-uitsplitsing. Regel 214-218 zegt letterlijk dat PDF-facturen "binnenkort" komen en dat je Marlon moet mailen.
- `tmc.payments` heeft geen BTW-velden (kolommen live geverifieerd: id, profile_id, membership_id, pt_booking_id, booking_id, mollie_payment_id, mollie_subscription_id, amount_cents, status, method, description, paid_at, created_at, order_id). Er bestaat geen invoices-tabel in het `tmc`-schema (tabellijst live geverifieerd).
- De enige echte PDF-factuur is de trainer-uitbetaling (`src/pdfs/TrainerInvoicePdf.tsx`, route `src/app/api/admin/trainers/[id]/invoice/route.ts`, factuurref `TMC-YYYYMM-...` op regel 126), zonder BTW-regels.
- BTW komt verder alleen voor als footer-weergave en als placeholder-constante (`src/lib/constants.ts:42`).

Gevolg voor WS-5: een custom-bedrag-verzoek levert in het huidige systeem een betaalverzoek plus een `payments`-rij op, geen juridisch kloppende factuur (geen factuurnummer, geen BTW-uitsplitsing). Dat geldt overigens net zo hard voor de bestaande abonnements- en productbetalingen. Het is een bestaand, breder gat, geen nieuw gat dat WS-5 slaat; alleen geïnventariseerd, zoals gevraagd.

## 8. Diff tegen de spec, kloof en PR-opdeling

Spec-scope (spec-membership-flow.md regel 272-274, 284, 299): Nieuw-lid wizard die de klant-configurator spiegelt, klant zoeken of aanmaken, waiver- en kortingsknoppen, betaallink-bezorging via MailerSend, Marlon voltooit nooit een betaling, expiry plus notificatie plus sweep-cron. Ilja's scope voegt toe: producten voor bestaande leden en het custom bedrag.

**Bestaat al (niet opnieuw bouwen):**

| Bouwsteen | Bewijs |
|---|---|
| `admin_create_order` compleet voor catalogus-gevallen (subscriptions en producten, waiver, TTL, provenance) | live `pg_get_functiondef`; `20260717000000_order_pipeline.sql:428` |
| Order-token plus unieke constraint plus `expires_at` (het fundament van de link) | `tmc.orders` kolommen en constraints, live geverifieerd |
| Activatie kent admin-orders al (`source = 'admin_manual'`, late betaling gehonoreerd) | live def `activate_order` |
| Expiry-sweep plus Marlon-notificatie bij verlopen betaallink | `src/app/api/cron/expire-orders/route.ts:39-46` |
| MailerSend-helper plus React Email-templates | `src/lib/email.ts:24`, `src/emails/` |
| Mollie-aanmaak met mandaat (subscription, `sequenceType: first`) en oneoff (product) | `src/lib/orders/create-order.ts:151-166` |
| Ledenlijst met zoek (wizard-bouwsteen "bestaand lid") | `src/lib/admin/members-query.ts:167-170` |
| `requireAdmin` plus admin-layout-guard plus `tmc.is_admin()` (defense in depth) | `src/lib/admin/require-admin.ts:13`, `admin/layout.tsx:29` |
| Audit-tabel voor admin-acties | `tmc.admin_audit_log` (tabellijst live) |

**Ontbreekt volledig:**

1. De betaallink-verzilverpagina: een publieke route op `orders.token` die de order toont, status en expiry checkt, de Mollie-betaling aanmaakt (subscription met `sequenceType: first`, product oneoff, met de bestaande idempotentie) en doorstuurt naar de checkout. Niets in de app consumeert het token vandaag.
2. De betaalverzoek-e-mail: template plus verzending via de bestaande `sendEmail`, gekoppeld aan de order via de token-URL. Herverzenden na expiry hoort hierbij (de ntfy zegt al "Opnieuw versturen?", maar er is geen knop).
3. De server action boven `admin_create_order` (`requireAdmin()` in TS, de laag die de RPC-comment al aankondigt) plus de wizard-UI zelf (sidebar-item, klant zoeken, configurator, waiver, TTL, en een order-actie in het leden-detail-ActionMenu).
4. Admin klant-aanmaak: auth-user plus profiel aanmaken namens een nieuw lid (spec: up front, pending state), met echte e-mail verplicht.
5. Het custom-bedrag-pad: schemawijziging, admin-only create-pad met vrij bedrag, activatie-tak zonder membership of credits, guards en audit (punt 2).
6. Klein: `drop_in` zit niet in de product-whitelist; besluiten of Marlon drop-ins via een betaalverzoek moet kunnen verkopen, en zo ja de whitelist in beide functies gelijk uitbreiden.

**Fable versus Sonnet:**

- Fable: alles wat geld of identiteit aanraakt. De token-verzilverpagina plus Mollie-aanmaak (nieuw geldpad, idempotentie, mandaat), de on-behalf klant-aanmaak (nieuw auth-oppervlak), en het volledige custom-bedrag-pad (doorbreekt de catalogus-validatie, SECURITY DEFINER-wijzigingen aan de order-pijplijn).
- Sonnet: de wizard-UI boven bestaande en door Fable gebouwde bouwstenen, de e-mailtemplate, het sidebar-item, de herverzend-knop, de ActionMenu-uitbreiding.

**Aanbevolen PR-opdeling, in volgorde:**

1. **PR A (Fable): betaallink-fundament.** Token-route (verzilverpagina), Mollie-aanmaak vanaf een admin-order, betaalverzoek-e-mail via MailerSend, herverzend-server-action. Maakt `admin_create_order` end-to-end bruikbaar en testbaar nog voor er een wizard is. Geen schemawijziging.
2. **PR B (Fable): on-behalf klant-aanmaak.** Server action achter `requireAdmin()`: auth-user pending plus profiel, echte e-mail verplicht, audit-regel. Klein en scherp begrensd.
3. **PR C (Sonnet): de wizard-UI.** Nieuw-lid en betaalverzoek-scherm in de admin (zoeken via `listMembers`, aanmaken via PR B, order via `admin_create_order`, versturen via PR A), sidebar-item, ActionMenu-actie, herverzend-knop op een orders-overzicht.
4. **PR D (Fable): custom bedrag.** Eigen migratie plus RPC-wijzigingen plus activatie-tak plus guards, als laatste en los van de rest, zodat het riskantste oppervlak het kleinste reviewbare diff blijft. Sonnet kan daarna het custom-veld in de wizard aanzetten.

## Live geverifieerde objecten (bron: Supabase project xoivleieyfcxcfawgveh, 2026-07-11)

- `tmc.admin_create_order(p_profile_id, p_slug, p_extended_access, p_commit_24m, p_early_member, p_waive_signup_fee, p_expires_in_days)`: `pg_get_functiondef`, SECURITY DEFINER, `tmc.is_admin()` gate.
- `tmc.create_order(...)`, `tmc.activate_order(p_order_id, p_mollie_payment_id)`, `tmc._compute_order_price(...)`: `pg_get_functiondef`. `activate_order` is service-role only (`auth.uid() is null` check).
- `tmc.orders`: kolommen en constraints via `information_schema` plus `pg_constraint`. Relevant: `catalogue_slug NOT NULL` (geen FK), `kind in ('subscription','product')`, `token` uniek, `orders_admin_provenance_check`, `orders_signup_fee_waiver_check` (`early_member | overstap`), `orders_subscription_shape_check`, `blocked_reason in ('duplicate_membership','product_not_supported')`.
- `tmc.payments`: kolommen via `information_schema`, geen BTW-velden, geen factuurnummer.
- RLS op `orders` en `payments`: admin-all via `tmc.is_admin()`, self-read op `profile_id = auth.uid()`. Geen anonieme leesroute op token; de verzilverpagina zal dus server-side met service-role of via een gerichte RPC moeten lezen (ontwerpkeuze voor PR A).
- `tmc.catalogue`: 29 rijen, kinds `plan/product/addon/fee`. Whitelist-relevante producten: `ten_ride_card` (actief), `ten_ride_card_kids/senior` (inactief), `pt_single`, `pt_10`, `duo_single`, `duo_10`. `drop_in*` purchasable maar buiten de order-whitelist. `program_*_12w` bewust `purchasable = false` (lead-items).
- Functielijst schema `tmc`: geen profiel-aanmaak-RPC aanwezig.

Repo-bewijs per bevinding staat inline in de secties hierboven (bestand:regel).
