# AUDIT-SECURITY.md — Security- en geld-audit TMC

Gebaseerd op statische code-read (MAP.md §1-5,14-17,19,20 + supabase-clients) én live-verificatie
tegen het gekoppelde Supabase-project via de MCP (`list_tables`, `list_migrations`, `get_advisors`,
`pg_policies`). Datum: 2026-07-01.

> **Update 2026-07-03:** findingen #2 (memberships self-service) en #4 (RLS bookings/pt_bookings
> kolom-granulariteit) zijn beide **live geverifieerd als opgelost** — PR #12, #13 en #15,
> al gemerged vóór deze update. Zie de statusregels in die secties en in de P0/P1/P2-tabel
> hieronder voor de details en het bewijs. De overige findingen zijn in deze ronde niet
> herverifieerd en staan zoals ze op 2026-07-01 zijn vastgesteld.

## Samenvatting

**Bijgewerkt 2026-07-03 — zie de update-notitie hierboven.** Oorspronkelijke samenvatting
(2026-07-01), voor de niet-herverifieerde findingen nog steeds van toepassing: naast de nu
opgeloste memberships- en bookings-RLS-gaten zijn er twee crowdfunding-RPC's
(`increment_cf_stats`/`increment_cf_tier_slot`) zonder auth-check publiek aanroepbaar — iedereen
kan de fondsenwervings-teller vervalsen. Schema-drift is bevestigd: de live `tmc`-schema-tabellen
staan niet in de migratiehistorie van het project — het schema is niet reproduceerbaar uit
`supabase/migrations/`. Service-role-gebruik zelf is schoon (geen client-side import, geen
`NEXT_PUBLIC_`-lek).

---

## Bevindingen per thema

### 1. Schema-drift & DR (vraag 1)

- **Risico:** DB niet reproduceerbaar from-scratch uit de repo.
- **Bestand/locatie:** `supabase/migrations/*.sql` (16 van 17 bestanden schrijven `public.*`),
  runtime praat met schema `tmc` (`DB_SCHEMA` env, default `"tmc"`).
- **Bevestigd live** (MCP `list_migrations` op het gekoppelde project): de
  `supabase_migrations`-historie bevat maar 2 entries — `20260503 gallery` en
  `20260625162400 event_foundation`. Geen van de overige 15 migratiebestanden staat geregistreerd,
  terwijl `list_tables` laat zien dat alle 21 `tmc.*`-tabellen wél live bestaan (`tmc.profiles`,
  `tmc.bookings`, `tmc.memberships`, enz., met data — bv. 289 rijen in `tmc.class_sessions`).
  Het schema is dus buiten de migratie-tooling om opgebouwd (dashboard/handmatige SQL), niet via
  `supabase db push`.
- **Exploiteerbaarheid:** geen aanval, maar DR-risico: `supabase db push`/`db reset` vanuit deze
  repo zou tabellen in `public` aanmaken (verkeerd schema, mogelijk clash met het gedeelde
  multi-tenant project dat ook `tvmuur`/`tmm`/`montagebaas`-schema's host), niet `tmc` herstellen.
  Bij projectverlies is er geen reproduceerbaar pad terug naar de huidige staat.
- **Fix:** herschrijf de historische migraties naar expliciet `tmc.`-gekwalificeerd (zoals
  `event_foundation` al doet) en laat ze via `mcp__supabase__apply_migration` als no-op replays
  registreren zodat `list_migrations` matcht met de bestandenlijst. Neem daarnaast een
  schema-dump van de live `tmc`-schema als baseline-snapshot in de repo op tot dat klaar is.

### 2. Memberships self-service — stille RLS-blokkade (financieel/AVG, P0) — ✅ OPGELOST (2026-07-03)

**Status:** volledig opgelost, live geverifieerd. Cancellation-pad gefixt door PR #13
(`tmc.request_membership_cancellation`, SECURITY DEFINER RPC, valideert `profile_id = auth.uid()`
+ toegestane status-overgang zelf). Credit-mutatie-pad gefixt door PR #15 (booking-writes via
SECURITY DEFINER RPC's `book_class_session`/`cancel_class_booking`/`book_pt_credits`/
`book_pt_pending_payment` — credit-aftrek/refund zit nu atomair in de RPC, geen kale
client-`.update()` meer). Live bevestigd: `pg_policies` op `tmc.memberships` toont nog steeds
geen self-UPDATE-policy (bewust — de RPC-route is de correcte, kleinere aanvalsoppervlakte),
en de RPC-broncode doet de status-transitie + validatie zelf. `process-cancellations`-cron
(PR #12) vindt nu wél rijen: 0 momenteel vastzittende `cancellation_requested`-rijen, 0
memberships totaal in productie (nog geen echte leden geraakt).

- **Risico (oorspronkelijk, vóór de fix):** self-service opzeggen en credit-mutaties werken niet, ondanks "gelukt"-melding aan de user.
- **Bestand/locatie:** `tmc.memberships` heeft in de live DB (bevestigd via `pg_policies`)
  alleen `memberships_self_read` (SELECT) en `memberships_admin_all` (admin) — **geen
  self-UPDATE, geen self-INSERT**.
  - `src/lib/member/membership-actions.ts:157-165` (`requestMembershipCancellation`) doet
    `supabase.from("memberships").update({status:"cancellation_requested", ...})` met de
    user-scoped client. RLS matcht geen policy → 0 rijen geraakt, **geen `error`** vanuit
    Supabase-js → de functie logt succes en toont "Je opzegverzoek staat".
  - `src/lib/member/booking-actions.ts:412-420` (credit-aftrek bij boeken) en `:580-594`
    (credit-refund bij annuleren) hebben hetzelfde patroon — met dezelfde stille no-op.
  - `src/app/api/cron/process-cancellations/route.ts` selecteert memberships met
    `status='cancellation_requested'` om de Mollie-subscription te stoppen — die rij komt er
    dus nooit, incasso blijft oneindig doorlopen na een "geslaagde" opzegging.
- **Exploiteerbaarheid:** geen actieve aanval nodig — dit raakt elke lid die zelf opzegt of een
  tien-rittenkaart gebruikt. Live staat: `tmc.memberships` heeft nu 0 rijen (nog geen
  productie-leden), dus nog geen klant geraakt — wél een tikkende bom vóór live-gang met
  echte betalingen.
- **Fix:** voeg een scoped self-UPDATE-policy toe, of — veiliger gezien de prijs-/lock-in-
  kolommen op deze tabel — een `SECURITY DEFINER` RPC per mutatie
  (`request_membership_cancellation(membership_id)`, `adjust_membership_credits(...)`) die
  zelf `profile_id = auth.uid()` en toegestane status-transities valideert, i.p.v. een brede
  UPDATE-policy op de hele tabel.

### 3. Publiek aanroepbare crowdfunding-RPC's zonder auth-check (P0)

- **Risico:** iedereen, ook niet-ingelogd, kan de publieke fondsenwervings-cijfers vervalsen.
- **Bestand/locatie:** `supabase/migrations/20260428000000_crowdfunding_tables.sql` —
  `tmc.increment_cf_stats(p_amount)` en `tmc.increment_cf_tier_slot(p_tier_id)`, beide
  `SECURITY DEFINER`, **zonder interne auth-check**. Bevestigd via `get_advisors(security)`:
  EXECUTE staat open voor zowel `anon` als `authenticated` op `/rest/v1/rpc/increment_cf_stats`
  en `/rest/v1/rpc/increment_cf_tier_slot`.
- **Exploiteerbaarheid:** direct — een anonieme POST naar die RPC-endpoints (geen auth nodig)
  verhoogt `crowdfunding_stats.total_raised`/`total_backers` of `crowdfunding_tiers.slots_claimed`
  met een zelfgekozen bedrag, zichtbaar op de live `/crowdfunding`-pagina (progress bar, "nog X
  plekken"). Reputatie-/fraude-risico op een actieve geldcampagne.
- **Fix:** `revoke execute on function tmc.increment_cf_stats(numeric) from anon, authenticated;`
  (idem voor de `integer`-overload en `increment_cf_tier_slot`). De webhook gebruikt de
  service-role client, die grants omzeilt — niets breekt aan de legitieme flow.

### 4. RLS op bookings/pt_bookings toetst alleen `profile_id`, niet de rest van de rij (P0/P1) — ✅ OPGELOST (2026-07-03)

**Status:** opgelost, live geverifieerd — sterker dan het oorspronkelijke fix-voorstel. PR #15
heeft `bookings_self_insert`, `bookings_self_cancel` en `pt_bookings_self_all` **volledig
verwijderd** in plaats van verkleind. Live `pg_policies` op beide tabellen tonen nu alleen nog
`*_admin_all`, `*_self_read` (SELECT) en trainer-read/attendance-policies — leden hebben géén
enkele directe schrijf-policy meer. Alle schrijfacties lopen verplicht via SECURITY DEFINER
RPC's (`book_class_session`, `cancel_class_booking`, `book_pt_credits`,
`book_pt_pending_payment`) die eigenaarschap, capaciteit, caps en credit-herkomst zelf valideren
(bv. `book_class_session` doet een `for update`-lock op de sessie én de dekkende membership-rij).
Een directe REST-call met de anon-key kan hierdoor niets meer omzeilen — er is geen
schrijf-policy meer om te misbruiken.

- **Risico (oorspronkelijk, vóór de fix):** business-logica (capaciteit, fair-use cap, prijs, credit-herkomst) zit alleen in
  app-code, niet in de policies — een directe REST-call omzeilt die volledig.
- **Bestand/locatie:** bevestigd via `pg_policies` op live DB:
  - `bookings_self_insert`: `with_check = profile_id = auth.uid()` — geen check op
    `membership_id`-eigenaarschap, `credits_used`, `drop_in_price_cents` of sessie-capaciteit
    (die zitten alleen in `src/lib/member/booking-actions.ts` → `canBook()`).
  - `bookings_self_cancel`: `using` staat elke kolom-wijziging toe zolang status
    `booked`→`cancelled|booked` blijft — een lid kan bv. `session_id` op zijn eigen boeking
    veranderen.
  - `pt_bookings_self_all`: `cmd = ALL` met alleen `profile_id = auth.uid()` — een lid kan zijn
    eigen pt-boeking zelf op `status='attended'` zetten, `price_paid_cents` op 0, of
    `credits_used_from` op andermans membership-id.
- **Exploiteerbaarheid:** vereist geen service-role — alleen de publishable/anon key + een
  ingelogde sessie, exact wat de browser al heeft. Een lid met devtools/curl kan de
  Supabase REST-API rechtstreeks aanroepen en de app-laag (canBook, prijsberekening) omzeilen.
- **Fix:** verplaats schrijf-acties naar `SECURITY DEFINER` RPC's die eigenaarschap + invarianten
  zelf valideren (net als `set_admin_checkin_pin`/`get_admin_kpis` al doen), of voeg een
  BEFORE INSERT/UPDATE-trigger toe die `membership_id`-eigenaarschap en toegestane
  kolom-wijzigingen afdwingt. Minimaal: verklein `pt_bookings_self_all` van `ALL` naar
  losse SELECT/INSERT/gerichte UPDATE-policies.

### 5. Trainer health-data/PII — kolom-restrictie bestaat alleen in app-code (P1)

- **Risico:** `has_health_access`-vlag wordt niet afgedwongen op database-niveau.
- **Bestand/locatie:** `profiles_trainer_read_relevant`
  (`20260421000000_tmc_member_system.sql:1052-1062`) geeft een trainer **volledige rij-SELECT**
  (dus ook `health_notes`, `emergency_contact_*`, `date_of_birth`, `phone`, `email`) op elk
  profiel van een lid dat ooit een sessie van die trainer boekte — ongeacht
  `trainers.has_health_access` (toegevoegd in `20260426100000_trainer_health_access.sql`, kolom
  zonder eigen RLS-consequentie). De vlag wordt alleen gelezen in
  `src/lib/admin/attendance-actions.ts:130` (`canSeeHealthDetail`), via de **admin-client**,
  server-side — die weg zelf is veilig.
- **Exploiteerbaarheid:** een trainer kan met de gewone browser-Supabase-client
  (`src/lib/supabase/client.ts`, dezelfde anon-key als de app al laadt) rechtstreeks
  `profiles.health_notes` opvragen voor elk lid dat bij hem boekte, ook met
  `has_health_access = false`. RLS filtert rijen, geen kolommen.
- **Fix:** verplaats gevoelige kolommen naar een aparte tabel/view met eigen RLS gated op
  `has_health_access`, of wrap trainer-profielreads in een RPC die `health_notes`/emergency-
  velden naar `null` zet tenzij `has_health_access = true`.

### 6. Mollie-webhooks — verificatie & idempotentie (vraag 2)

- **Signature-verificatie:** geen HMAC-check in beide webhooks — dit is **verwacht** voor
  Mollie (geen signing-secret in hun model); verificatie gebeurt correct door het payment-object
  opnieuw op te halen via `mollie.payments.get(paymentId)` met de eigen API-key
  (`api/mollie/webhook/route.ts:75`, `api/crowdfunding/webhook/route.ts:24`). Geen bug.
- **Duplicatie/divergentie:** de twee webhooks bedienen aparte features (memberships/PT vs.
  eenmalige crowdfunding-pledges) — geen overlap, geen duplicate-write-pad. Wel een asymmetrie:
  `api/mollie/webhook` logt naar `payments` + emit't domain-events (`tmc.events`);
  `api/crowdfunding/webhook` doet geen van beide — observability-gat, geen security-bug.
- **Dubbele/late webhook — memberships-pad:** idempotent via status-guards
  (`membership.status !== "active"` / `!== "payment_failed"`), maar **geen** transactie/lock om
  de read-then-write: twee vrijwel gelijktijdige retries kunnen beide de oude status lezen en
  dubbel de Mollie-subscription aanmaken (`mollie/webhook/route.ts:236-276`).
- **Dubbele/late webhook — crowdfunding-pad:** zelfde patroon;
  `wasAlreadyPaid`/`isNowPaid`-check vóór de status-update leest niet-gelockt, dus de
  `increment_cf_stats`/`increment_cf_tier_slot`-RPC's kunnen bij een race dubbel vuren
  (bovenop het P0-gat in §3).
- **Fix:** `select ... for update` in een transactie rond de statuswissel, of een advisory lock
  op `payment.id` voor de activatie-tak.

### 7. Service-role scoping (vraag 3) — schoon

- `createAdminClient()` (`src/lib/supabase/admin.ts`) en `getAdminClient()`
  (`src/lib/supabase.ts`) — grep bevestigt: geen import in `"use client"`-bestanden, geen
  `NEXT_PUBLIC_`-variabele bevat de service-role key. Gebruik beperkt tot server actions,
  route handlers en de 7 cron-routes — zoals bedoeld.
- Tabellen zonder write-policy (`crowdfunding_stats`/`tiers`, `tmc.events`) zijn inderdaad
  alleen via service-role schrijfbaar **op tabel-niveau** — maar zie §3: de
  `increment_cf_*`-RPC's zijn een aparte, ongeautoriseerde schrijfweg eromheen.
- **Extra (advisor):** `tmc.cleanup_expired_strikes()`, `tmc.refresh_admin_kpis()` zijn
  eveneens `SECURITY DEFINER` zonder auth-check en aanroepbaar door `anon`/`authenticated`.
  Laag risico (geen data-lek — cleanup verwijdert alleen al-verlopen rijen, refresh is een
  read-only materialized view refresh) maar wel een goedkope DoS-hendel (ongelimiteerd
  `REFRESH MATERIALIZED VIEW CONCURRENTLY` triggeren). Revoke public execute.
- `tmc.get_remaining_guest_passes(p_profile_id uuid)` — géén caller-check, accepteert elk
  profile-id en is aanroepbaar door `anon`. Laag risico (alleen een guest-pass-telling lekt),
  maar hoort `auth.uid() = p_profile_id or is_admin()` te toetsen.

### 8. RLS-scoping — overig (vraag 4)

- `profiles`, `bookings`, `pt_bookings`, `check_ins`: self_* policies zelf zijn qua
  rij-scoping correct (member ziet alleen eigen rijen, trainer alleen relevante sessies) — het
  probleem zit in kolom-granulariteit (§4, §5), niet in cross-member row leakage.
- Geen policy gevonden die een member toegang geeft tot andermans bookings/payments/memberships
  buiten wat hierboven staat.

### 9. Auth-callback / rol-redirect (vraag 5) — geen gat gevonden

- `src/app/auth/callback/route.ts`: open-redirect-guard (`startsWith("/")` +
  `!startsWith("//")`) is sluitend voor de bekende bypass-vectoren (protocol-relative URLs).
  `next`-param bypassed nooit de rol-bepaling voor de kale `/app`-route.
- Rol komt altijd uit een verse `profiles.role`-read na `exchangeCodeForSession` — niet
  client-supplied, dus niet spoofbaar via de callback zelf.
- Een lid dat `?next=/app/admin` meestuurt komt wél voorbij de callback-redirect, maar wordt
  alsnog geblokkeerd door `src/app/app/admin/layout.tsx` (eigen verse rol-check, redirect naar
  `/app/rooster` bij mismatch) — dus geen bruikbaar gat, wel het vermelden waard omdat de
  callback zelf die combinatie niet expliciet afvangt.
- Kleine hardening: `src/lib/cron-auth.ts:17` vergelijkt `CRON_SECRET` met `!==` (niet
  constant-time). Theoretisch timing-lek, praktisch verwaarloosbaar; `crypto.timingSafeEqual`
  is een eenregelige fix.

---

## P0 / P1 / P2 — impact vs. effort

| # | Bevinding | Prioriteit | Impact | Effort |
|---|---|---|---|---|
| 1 | ~~`memberships` self-UPDATE ontbreekt → opzeggen/credits werken niet~~ | ~~P0~~ | **✅ Opgelost** (PR #12, #13, #15 — zie §2) | — |
| 2 | `increment_cf_stats`/`increment_cf_tier_slot` publiek aanroepbaar | **P0** | Fraude/reputatie op live geldcampagne | S — 2 `revoke execute`-statements |
| 3 | ~~`bookings`/`pt_bookings` RLS toetst geen kolommen (capaciteit/prijs/credits)~~ | ~~P0/P1~~ | **✅ Opgelost** (PR #15 — zie §4) | — |
| 4 | Schema-drift: `tmc` niet reproduceerbaar uit `supabase/migrations/` | **P1** | DR-risico bij projectverlies | L — alle historische migraties herschrijven + baseline-dump |
| 5 | Trainer kan `health_notes`/PII lezen ondanks `has_health_access=false` | **P1** | AVG/PII-lek richting trainers | M — kolommen verplaatsen of RPC-wrapper |
| 6 | Mollie/crowdfunding webhook race op read-then-write | **P1** | Dubbele subscription/stat-increment bij gelijktijdige retries | S/M — transactie of advisory lock |
| 7 | `cleanup_expired_strikes`/`refresh_admin_kpis` publiek aanroepbaar | **P2** | Lichte DoS-hendel, geen data-lek | S — revoke execute |
| 8 | `get_remaining_guest_passes` zonder caller-check | **P2** | Guest-pass-telling van andere leden opvraagbaar | S — auth-check toevoegen aan RPC |
| 9 | `verifyCronAuth` niet constant-time | **P2** | Theoretisch timing-lek op `CRON_SECRET` | Getrackt als issue #1 (niet langer alleen in dit document) |
| 10 | Leaked-password-protection uit in Supabase Auth | **P2** | Zwakkere wachtwoord-hygiëne | S — toggle in dashboard |

**Openstaande P2's, apart getrackt (niet meer alleen in dit document begraven):**
- Issue #1 — `verifyCronAuth` niet constant-time (rij 9 hierboven).

Geen aparte issue voor "credit-mutatie silent-no-op" (rij 1, oorspronkelijk als los P2-vervolg
overwogen): bij verificatie bleek dit al volledig gedekt door PR #15, samen met rij 3. Zie §2.
