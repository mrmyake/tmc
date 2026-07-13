# Spec: PT-agenda

Status: concept, wacht op akkoord. Discovery afgerond op 2026-07-13 tegen de live database (project `xoivleieyfcxcfawgveh`, schema `tmc`) en de repo. Deze spec stuurt de bouw van de PT-laag: virtuele beschikbaarheid, create-on-book, annuleren/verzetten, intake, het 12-weken programma, notificaties en de agenda voor Marlon.

Gerelateerd: `CLAUDE.md` (navigatie-architectuur), `supabase/migrations/20260706000000_tmc_baseline.sql` (huidige pt-tabellen).

---

## 1. Geverifieerde live staat (discovery)

Alles hieronder is geverifieerd tegen de live DB via `pg_get_functiondef` / `information_schema` / `pg_policies`, niet tegen repo-bestanden.

### 1.1 Boek-RPC's

- `tmc.book_pt_credits(p_pt_session_id)` en `tmc.book_pt_pending_payment(p_pt_session_id)`, beide SECURITY DEFINER, `search_path tmc, extensions`. Beide nemen een BESTAANDE `pt_sessions`-rij aan; nergens in de app wordt een pt_session aangemaakt.
- `book_pt_credits`: valideert sessie (`scheduled`, toekomst, format `one_on_one|duo`), pakt onder `FOR UPDATE` het passende actieve `pt_package`-membership (duo-format vereist `plan_variant like 'duo%'`, 1-op-1 vereist geen duo-variant; legacy `plan_variant is null` telt als 1-op-1), insert `pt_bookings` met `price_paid_cents=0`, `credits_used_from`, decrement `credits_remaining` met guard. `unique_violation` op `(profile_id, pt_session_id)` wordt netjes `already_booked`.
- `book_pt_pending_payment`: idempotent per (profile, sessie) via bestaande-rij-hergebruik onder `FOR UPDATE`; prijs komt live al flat uit `tmc.catalogue` slug `pt_single` (9500 cent). Zet altijd `is_intake_discount=false`.

### 1.2 Intake-korting: al grotendeels dood

Het 4500-korting-pad bestaat in GEEN enkele live functie meer (sweep op `prosrc ilike '%intake%'` en `'%4500%'`: nul treffers). Wat rest zijn dode kolommen en een dode check:

- `pt_bookings.is_intake_discount boolean not null default false` (wordt nog geschreven, altijd `false`)
- `profiles.has_used_pt_intake_discount boolean default false` (alleen nog gebruikt als bestaans-check op het profiel in `book_pt_pending_payment`)

Opruimen in PR A: beide kolommen droppen, de profiel-bestaans-check herschrijven op `id`.

### 1.3 RLS en grants

`pt_sessions`:
- `pt_sessions_admin_all` (ALL, `tmc.is_admin()`)
- `pt_sessions_authed_read` (SELECT, elke ingelogde: `auth.role() = 'authenticated'`)
- `pt_sessions_trainer_own` (ALL, `tmc.is_trainer()` en eigen `trainer_id`; geen `with_check`)

`pt_bookings`:
- `pt_bookings_admin_all` (ALL, `tmc.is_admin()`)
- `pt_bookings_self_read` (SELECT, `profile_id = auth.uid()`)
- `pt_bookings_trainer_read` (SELECT, trainer leest boekingen op eigen sessies)

Grants staan wagenwijd open (anon en authenticated hebben SELECT/INSERT/UPDATE/DELETE op beide tabellen); RLS is de enige barriere. Let op: `pt_sessions_authed_read` botst met zichtbaarheidsregel 8 en met de nieuwe prospect-PII-velden; zie paragraaf 7.

### 1.4 Data

`pt_sessions` en `pt_bookings` zijn allebei leeg (0 rijen, nooit geseed). De migratie in PR A hoeft dus geen datamigratie te doen; check-constraints en kolommen kunnen vrij aangepast worden.

### 1.5 Catalogus

| slug | display_name | price_cents | credits | actief |
|---|---|---|---|---|
| `pt_single` | Personal training 1-op-1 | 9500 | 1 | ja |
| `pt_10` | Personal training 1-op-1, 10-rittenkaart | 90000 | 10 | ja |
| `duo_single` | Personal training duo, losse sessie | 12000 | 1 | ja |
| `duo_10` | Personal training duo, 10-rittenkaart | 110000 | 10 | ja |

`duo_single` en `duo_10` bestaan dus al. `validity_months` is overal null. Er is geen catalogus-rij voor het 12-weken programma; die komt erbij (zie regel 3 en 11).

### 1.6 opening_hours

- `tmc.opening_hours`: `weekday smallint` (0 = zondag t/m 6 = zaterdag), `is_closed`, `opens_at`/`closes_at` (`time`). Live: zondag gesloten, ma t/m vr 07:00-21:00, za 08:00-14:00.
- `tmc.opening_hours_exceptions`: `date`, `is_closed`, `opens_at`/`closes_at`, `note`.

Dit patroon (weekday 0=zondag, `time`-kolommen, aparte exceptions-tabel) nemen we 1-op-1 over voor de PT-vensters. PT-vensters worden bovendien geclamped op de openingstijden: een venster buiten openingstijd levert geen slots.

### 1.7 adjust_membership_credits

`tmc.adjust_membership_credits(p_membership_id, p_delta, p_reason, p_source, p_actor_type, p_actor_id default null, p_booking_id default null)`:

- Service-role only (`auth.uid() is not null` geeft 42501); de TS-laag (requireAdmin/requireStaff) is de autorisatiepoort.
- `p_source in ('check_in','refund','manual','session_cancelled')`, `p_actor_type` in dezelfde set als de events-constraint.
- Lock op de membership-rij; debit alleen op `status='active'` en niet-verlopen kaart, refund mag ook op opgezegde/verlopen rij.
- Audit-event `credits.adjusted` in dezelfde transactie, met previous/new balance in de payload.
- BELANGRIJK: het `p_booking_id`-pad is gekoppeld aan `tmc.bookings` (groepslessen, kolom `credits_used`), niet aan `pt_bookings`. Voor PT-refunds is dat pad onbruikbaar; `cancel_pt` doet zijn eigen refund inline (patroon `cancel_class_booking`), en handmatige correcties door Marlon lopen via `adjust_membership_credits` met `p_booking_id = null` en een duidelijke `p_reason`.

### 1.8 Rollen en trainers

- `tmc.current_user_role()`: `select role from tmc.profiles where id = auth.uid()`, coalesce `'anon'`. `is_admin()` en `is_trainer()` zijn exacte matches op die string; een admin is dus NIET `is_trainer()`, maar heeft via de `*_admin_all`-policies overal bij.
- Admin word je door `profiles.role = 'admin'` te zetten; er is geen ander mechanisme. `me@ilja.com` is al admin (net als `marlon@ptloosdrecht.nl`).
- `tmc.trainers` heeft o.a. `profile_id (not null)`, `display_name`, `is_active`, `is_pt_available`, `pt_tier` (default `standard`), `pt_session_rate_cents`, `employment_tier`.
- PRODUCTIE-SEAM: de boekbare "Marlon"-trainers-rij (`is_pt_available=true`, `pt_tier=premium`) hangt aan testaccount `marlon@trainers.test` (role `trainer`). Het echte admin-account `marlon@ptloosdrecht.nl` heeft GEEN trainers-rij. Voor livegang moet de Marlon-trainers-rij naar het echte profiel wijzen (of een nieuwe rij), anders gaan trainer-notificaties naar het testadres en werkt de eigen-agenda-view niet voor de echte Marlon. Actiepunt in PR A (data-fix, geen schema).
- Ilja: optioneel een trainers-rij met `is_pt_available=false` zodat leden hem niet als boekbare PT zien maar test-notificaties naar `me@ilja.com` gaan.

### 1.9 E-mail, cron, events

- `src/lib/email.ts`: `sendEmail({ to, toName, subject, react })`, MailerSend SDK, from uit `MAILERSEND_FROM_EMAIL`/`MAILERSEND_FROM_NAME`, rendert React Email components. Non-blocking: ontbrekende env of fout wordt gelogd, nooit gethrowd.
- `src/app/api/cron/send-reminders/route.ts` + `vercel.json`: dagelijks `0 18 * * *` (18:00 UTC), window sessies 23-25 uur vooruit, dedupe door `reminder_sent_at` te stempelen (guarded update `.is('reminder_sent_at', null)`) VOOR het versturen. Leest nu alleen `bookings` (groepslessen). `pt_bookings` heeft nog geen `reminder_sent_at`-kolom; die komt erbij.
- `src/lib/events/emit.ts`: `emitEvent({ type, actorType, actorId?, subjectType?, subjectId?, payload? })`, append-only insert in `tmc.events` via service-role, throwt nooit. De `EventType`-union kent al `pt_booking.created/confirmed/cancelled`. Call-sites: `src/lib/member/pt-booking-actions.ts`.
- Push: `sendPushToProfile` bestaat als fire-and-forget; het Firebase-project bestaat nog niet, dus push is nu een stille no-op. Dat blijft zo tot Firebase er is.

### 1.10 Member-side vandaag

- `/app/pt` (`src/app/app/pt/page.tsx`): leest `pt_sessions` direct (`scheduled`, `one_on_one`, 14 dagen vooruit), filtert alleen eigen boekingen weg (dus vol-geboekte slots van anderen blijven zichtbaar), 4-staps `PtBookingFlow` (trainer, slot, betaling, bevestiging). Credits-pad en Mollie-pad via de twee RPC's; Mollie oneoff met metadata `type: 'pt_booking'`, webhook `/api/mollie/webhook` handelt PT apart van de order-pipeline af.
- `/app/boekingen` (`src/app/app/boekingen/page.tsx`): alleen `bookings` (groepslessen), tabs komend/historie, annuleren via server action `cancelBooking` die RPC `cancel_class_booking` aanroept. `cancel_class_booking` is het referentiepatroon voor `cancel_pt`: lock op eigen boeking, venster uit settings, status-flip plus refund in dezelfde transactie, `within_window`/`late` als `cancellation_reason`.
- Order-pipeline (voor het prepaid programma): `createOrderAndCheckout` (`src/lib/orders/create-order.ts`) via RPC `create_order`, Mollie oneoff, webhook `payment.paid` met `metadata.type='order'` triggert `tmc.activate_order()` (idempotent onder rijlock). Betaallinks: `src/lib/orders/payment-link.ts` en `src/lib/admin/payment-request-actions.ts` (RPC `admin_create_order`).

---

## 2. Architectuur

Virtuele beschikbaarheid plus aanmaken-bij-boeken.

- `pt_sessions` bevat ALLEEN echte afspraken: boekingen, programma-sessies, intakes en blokkades. Vrije slots worden nooit gematerialiseerd.
- Vrije slots worden berekend uit de beschikbaarheidsvensters van de trainer, geclamped op `opening_hours`/`opening_hours_exceptions`, minus de bezette `pt_sessions` (alle kinds, status `scheduled`), met dynamische omkleedtijd (paragraaf 5).
- De boek-RPC's worden herbouwd naar maak-en-boek atomair: valideer venster plus vrij onder een lock, insert `pt_session` plus `pt_booking` in een transactie. De bestaande RPC-namen mogen hergebruikt worden met nieuwe signatures (er is geen data en geen externe afnemer); de oude neem-een-bestaande-sessie-varianten vervallen.
- Locking: `pg_advisory_xact_lock` op `hashtext(trainer_id::text || ':' || datum)` voor de venster-plus-overlap-validatie, plus als vangnet een exclusion-constraint (btree_gist): `EXCLUDE USING gist (trainer_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE (status = 'scheduled')`. De omkleedtijd zit niet in de constraint (die is dynamisch), alleen in de RPC-validatie.
- Leden lezen `pt_sessions` niet meer direct; vrije slots komen uit een SECURITY DEFINER RPC (bv. `get_pt_free_slots(p_trainer_id, p_from, p_to)`) die alleen tijden teruggeeft, nooit PII. Zie paragraaf 7.

---

## 3. Datamodel (voorstel, niet uitgevoerd)

### 3.1 pt_sessions (wijzigingen)

- Nieuw: `kind text not null default 'bookable' check (kind in ('bookable','intake','block'))`.
- Nieuw (alleen voor `kind='intake'`): `prospect_name text`, `prospect_email text`, `prospect_phone text`, nullable, met check dat ze alleen gevuld zijn bij `kind='intake'`.
- `format`: nullable maken; verplicht (check) bij `kind='bookable'`, null bij `intake`/`block`. Check-waarden blijven `one_on_one|duo|small_group_4` (small_group_4 blijft in het schema, geparkeerd).
- Nieuw: `program_id uuid null references tmc.pt_programs(id)` voor programma-sessies.
- Exclusion-constraint zoals in paragraaf 2 (vereist `btree_gist`-extensie).

### 3.2 pt_bookings (wijzigingen)

- Weg: `is_intake_discount` (en op `profiles`: `has_used_pt_intake_discount`).
- Nieuw: `introducee_name text null` (duo-pad, regel 5), `reminder_sent_at timestamptz null` (reminder-cron), `cancellation_reason text null` (`within_window|late|admin`, pariteit met `bookings`), `rescheduled_from_session_id uuid null` (audit-spoor verzetten).

### 3.3 Nieuwe tabellen

- `tmc.pt_availability_windows`: `id`, `trainer_id references trainers`, `weekday smallint 0-6` (0=zondag, zelfde conventie als `opening_hours`), `start_time time`, `end_time time`, `created_at/updated_at`. Meerdere vensters per dag toegestaan (ochtend plus avond).
- `tmc.pt_availability_exceptions`: `id`, `trainer_id`, `date`, `type text check (type in ('free','extra'))`, `start_time`/`end_time` (null bij hele-dag-free), `note`. `free` haalt tijd weg, `extra` voegt een venster toe buiten het weekpatroon.
- `tmc.pt_settings`: `trainer_id` PK/FK, `session_duration_min int not null default 60`, `turnaround_min int not null default 15`, `booking_horizon_days int not null default 56`, `cancel_window_hours int not null default 24`. (Het cancel-venster van 24 uur is een voorstel, zie open punten.)
- `tmc.pt_programs`: `id`, `profile_id references profiles`, `trainer_id`, `order_id uuid null references orders`, `total_sessions int not null default 24`, `status text check (status in ('draft','active','completed','cancelled'))`, `paid_override boolean not null default false` (reeds-betaald kas/pin), `created_at/updated_at`. Voortgang "sessie X van 24" is afgeleid (count van niet-geannuleerde programma-sessies op datum-volgorde); de klant ziet nooit een creditsaldo.

### 3.4 RPC's (herbouw en nieuw)

Alle SECURITY DEFINER, `search_path tmc, extensions`, jsonb-result met `ok/reason`-patroon zoals bestaand.

- `book_pt_credits(p_trainer_id, p_start_at, p_format, p_introducee_name default null)`: create-and-book, credits-pad. Duo vereist duo-variant-pakket (logica uit huidige functie hergebruiken).
- `book_pt_pending_payment(p_trainer_id, p_start_at)`: create-and-book, Mollie-pad, prijs uit catalogus. Idempotentie verschuift van sessie-hergebruik naar betaal-flow (pending booking op de nieuw aangemaakte sessie; bij afgebroken betaling ruimt de bestaande expire-flow of een guard de sessie op, uitwerken in PR A).
- `cancel_pt(p_pt_booking_id)`: patroon `cancel_class_booking`; venster uit `pt_settings`; binnen venster credit-refund inline op `credits_used_from` (zelfde transactie), buiten venster forfeit; zet ook de `pt_session` op `cancelled` (er is maar 1 boeking per sessie in de gebouwde paden); admin-variant mag altijd met refund-keuze.
- `reschedule_pt(p_pt_booking_id, p_new_start_at)`: eersteklas verzetten. Atomair: valideer nieuw slot (zelfde checks als boeken), maak nieuwe sessie, verhang de boeking, annuleer de oude sessie, credit blijft onaangeroerd, stempel `rescheduled_from_session_id` en reset `reminder_sent_at`. Lid: alleen binnen het cancel-venster en binnen de horizon; admin: altijd.
- `create_pt_intake(p_trainer_id, p_start_at, p_prospect_name, p_prospect_email, p_prospect_phone, p_duration_min default 90)`: admin/trainer-only; alleen sessie (`kind='intake'`), geen booking, geen kosten, geen credit, geen MailerLite.
- `create_pt_block(p_trainer_id, p_start_at, p_end_at, p_note)`: admin/trainer-only, `kind='block'`.
- `admin_book_pt_for_member(...)` en `admin_create_pt_program(...)`: PR C; programma-planning mag voorbij de horizon.
- `set_pt_attendance(p_pt_booking_id, p_status)`: admin/trainer van de sessie; `attended|no_show`; geen automatische credit-mutatie (no-show is default forfeit, credit is al verbruikt bij boeken).
- `get_pt_free_slots(p_trainer_id, p_from, p_to)`: leesbaar voor leden, geeft alleen starttijden terug (paragraaf 5), gecapped op de horizon.

---

## 4. Vergrendelde businessregels

Deze twaalf regels staan vast en zijn niet onderhandelbaar in de bouw-PR's.

1. Leden self-booken met credits in vrije vensters; Marlon boekt ook voor klanten.
2. Sessie 60 min (PT en duo). Omkleedtijd 15 min, dynamisch: alleen tegen een buurboeking. Lege dag: schone opties vanaf vensterstart. Volle dag: effectief een 75-min-cadans.
3. Betaling: lid self-service = credits; 12-weken programma = prepaid volledig vooruit (24 sessies), uitzondering per 4 weken (3 termijnen van 8); overige door-Marlon-geboekte losse klanten = per 4 weken achteraf, FASE 2 (hangt aan facturatie).
4. Boekhorizon leden 8 weken (`pt_settings.booking_horizon_days` = 56); Marlon plant het 12-weken programma in een keer, ook voorbij de horizon.
5. Duo = een (1) `pt_booking` met introducee-naam, geen tweede boeking of account; schema voor de introducee pas bij lidmaatschap; duo verbruikt een duo-rittenkaart (`duo_single`/`duo_10`, `plan_variant duo%`), nooit een gewone PT-credit.
6. Annuleren: binnen venster credit terug (`cancel_pt`); no-show of buiten venster forfeit; Marlon corrigeert via `adjust_membership_credits` (service-role, met audit-event) of de admin-cancel met refund.
7. Verzetten = eersteklas actie (`reschedule_pt`), niet annuleren-plus-opnieuw: lid binnen venster met behoud van credit; Marlon altijd.
8. Zichtbaarheid: Marlon ziet naam plus profiel plus schema; de klant ziet de eigen naam; alle anderen zien alleen "bezet" (tijden, geen identiteit).
9. Intake: default 90 min, term "intake", account-loos (naam, e-mail, telefoon op de sessie), geen kosten en geen credit, blokkeert de agenda, is geen boekbaar slot, converteer-seam na afloop (prospect_email matchen aan een later profiel), puur agenda: geen MailerLite-koppeling.
10. Aanwezigheid: Marlon markeert `attended` of `no_show` vanuit de sessie (`pt_bookings.status`); no-show is default forfeit; correctie achteraf mogelijk (regel 6).
11. Prepaid-programma-betaling: Mollie one-off betaallink naar de klant via de bestaande order-pipeline (`create_order` plus `payment-link`), plus een "reeds betaald"-override voor Marlon (kas of pin in de studio, `pt_programs.paid_override`).
12. Lifecycle: reeds geboekte PT-sessies blijven staan bij verlopen rittenkaart, pauze of opzegging (de credit is al verbruikt); alleen NIEUWE boekingen worden geblokkeerd.

---

## 5. Slot-algoritme

Input: trainer, datumrange (max horizon), `pt_settings`, vensters, exceptions, `opening_hours`(-exceptions), bestaande `pt_sessions` (`scheduled`, alle kinds).

1. Bepaal per dag de effectieve vensters: weekpatroon, plus `extra`-exceptions, minus `free`-exceptions, geclamped op de openingstijden van die dag.
2. Genereer kandidaat-starttijden op een 15-min-grid binnen elk venster, sessieduur uit `pt_settings` (60 min; intake 90 wordt door Marlon geboekt, niet door leden).
3. Filter: het slot `[start, start+duur)` mag niet overlappen met een bestaande sessie, en moet minimaal `turnaround_min` afstand houden tot elke buursessie (voor en na). Geen buursessie = geen buffer nodig (dynamisch, regel 2).
4. Presentatie-opschoning: toon niet elk 15-min-raster-punt. Zonder buren op de dag: opties op 60-min-cadans vanaf vensterstart. Met buren: eerstvolgende schone starttijd is `buur.end_at + turnaround`, daarna weer 60-min-cadans tot de volgende buur; zo ontstaat op een volle dag vanzelf de 75-min-cadans.
5. Cap op `booking_horizon_days` voor leden; geen cap voor admin.

Acceptatiecriteria: (a) twee opeenvolgende boekingen door verschillende leden kunnen nooit binnen 15 min van elkaar landen; (b) op een lege maandag met venster 09:00-13:00 zijn de getoonde opties 09:00, 10:00, 11:00, 12:00; (c) na een boeking om 09:00 zijn de opties 10:15, 11:15, 12:15 (13:15 valt buiten het venster).

---

## 6. Notificaties

Kanalen: e-mail nu (bestaand `sendEmail`, React Email templates), push later zodra het Firebase-project bestaat (tot die tijd stille no-op via `sendPushToProfile`). Per gebeurtenis, geen digest.

Trainer van de sessie (adres via `trainers.profile_id` naar `profiles.email`):
- E-mail bij lid-geinitieerd boeken, annuleren en verzetten.
- NIET bij acties die de trainer/admin zelf uitvoert (vergelijk actor met de trainer-profile en met admin-initiated flows).

Klant:
- Bevestiging bij boeken (self-service en Marlon-boekt-voor-klant).
- Herinnering voor de sessie via de bestaande send-reminders-cron: zelfde run (dagelijks 18:00 UTC), zelfde 23-25-uur-window, zelfde dedupe-patroon, nu ook over `pt_bookings` (`status='booked'`, `reminder_sent_at is null`, sessie `scheduled`).

Events (bestaande `emitEvent`-conventie, types deels al aanwezig): `pt_booking.created`, `pt_booking.confirmed`, `pt_booking.cancelled`, nieuw `pt_booking.rescheduled`, `pt_booking.attendance_marked`, `pt_session.blocked`, `pt_intake.created`, `pt_program.created`.

Alle mail-onderwerpen en -teksten: // COPY: confirm met Marlon.

---

## 7. Toegang en RLS

- De PT-agenda is alleen voor admin OF actieve PT-trainer, nooit leden-facing. Geen feature-flag: `profiles.role` plus `trainers.is_active`/`is_pt_available` sturen de toegang.
- Trainer ziet de eigen agenda (route onder `/app/trainer/**`, valt automatisch onder `TrainerNav` en de bestaande trainer-layout-guard). Admin krijgt een trainer-kiezer (default Marlon) en kan elke agenda bekijken (route onder `/app/admin/**`, `AdminShell`). Beide ingangen delen dezelfde agenda-componenten.
- RLS-wijzigingen in PR A:
  - `pt_sessions_authed_read` VERVALT. Leden hebben geen direct leespad op `pt_sessions` meer; vrije slots komen uit `get_pt_free_slots` (alleen tijden), en de eigen afspraak komt via `pt_bookings_self_read` plus een join die door de RPC of een view zonder PII wordt geleverd. Dit dekt regel 8 en voorkomt dat prospect-PII (intakes) of andermans notes ooit bij leden landen.
  - `pt_sessions_trainer_own` krijgt een `with_check` (staat nu op null, waardoor een trainer via UPDATE een sessie naar een andere trainer zou kunnen verhangen).
  - Overweeg de open grants voor `anon` op beide tabellen in te trekken (anon heeft er niets te zoeken; RLS blokkeert nu alles, maar defense-in-depth is goedkoop).
- `me@ilja.com` is al admin. Optioneel (aanbevolen voor test): trainers-rij voor Ilja met `is_pt_available=false`, zodat leden hem nooit als boekbare PT zien en test-notificaties naar `me@ilja.com` gaan.
- Productie-seam (paragraaf 1.8): de Marlon-trainers-rij moet voor livegang aan `marlon@ptloosdrecht.nl` hangen. Bij oplevering blijft Marlon de enige leden-facing PT; een extra PT later is een (1) trainers-rij erbij.

---

## 8. Member-side (/app/pt en /app/boekingen)

`/app/pt`:
- Slots uit `get_pt_free_slots` (vervangt het directe lezen van `pt_sessions`); daarmee verdwijnt ook het huidige gedrag dat vol-geboekte slots van anderen zichtbaar blijven.
- Horizon 8 weken (was 14 dagen).
- Duo-pad: format-keuze wanneer het lid een duo-pakket heeft; introducee-naam verplicht veld; duo verbruikt de duo-kaart.
- Boeken via de herbouwde create-on-book RPC's; Mollie-pad blijft zoals het is (metadata `type: 'pt_booking'`, bestaande webhook-afhandeling).

`/app/boekingen`:
- PT-boekingen verschijnen naast de groepsles-boekingen (komend en historie), gemerged en gesorteerd op `start_at`. Let op de schema-verschillen: pt heeft `format` in plaats van `class_type`, en `attended`/`no_show` direct in `pt_bookings.status` in plaats van via `check_ins`.
- Acties per PT-rij: annuleren (`cancel_pt`, met late-cancel-waarschuwing zoals bij groepslessen) en verzetten (`reschedule_pt`, herbruikt de slot-picker van `/app/pt`).

Alle nieuwe user-facing teksten: // COPY: confirm met Marlon.

---

## 9. Agenda (Marlon, admin)

- Dag-, week- en maandweergave op dezelfde `pt_sessions`-data (alle kinds, alle statussen behalve `cancelled` gedimd of verborgen, uitwerken in PR D).
- Trainer-kiezer voor admins (default Marlon); trainers zien alleen zichzelf.
- Acties vanuit een sessie: attended of no_show markeren (`set_pt_attendance`), credit-correctie (via `adjust_membership_credits`, met verplichte reden), en ad-hoc tijd blokkeren (`create_pt_block`).
- Vanuit een leeg tijdvak: boek-voor-klant, intake inplannen, programma inplannen (PR C).
- Zichtbaarheid conform regel 8: Marlon ziet naam, profiel-link en schema-link op de sessie.

---

## 10. Geparkeerd

- `small_group_4` (PT met 3-4 personen) blijft in het schema (format-check en capacity 1-4 blijven staan) maar wordt NIET gebouwd: geen boekingspad, geen UI, tenzij Marlon erom vraagt.
- Per-4-weken-achteraf-facturatie voor losse door-Marlon-geboekte klanten: FASE 2, hangt aan de facturatie-laag.
- Push-notificaties: wachten op het Firebase-project.
- Fijnmazige `hasPtCredits`-conditie op de member-nav (bestaat al als dashboard-logica, zie CLAUDE.md): buiten scope.

---

## 11. Open punten (beslissen voor of tijdens PR A)

1. Cancel/verzet-venster PT: voorstel 24 uur (`pt_settings.cancel_window_hours`), bewust ruimer dan de 6 uur van groepslessen omdat een PT-uur niet herbenut wordt door een wachtlijst. // BESLISSING: confirm met Marlon.
2. Catalogus-rij voor het 12-weken programma (bv. slug `pt_program_24`): prijs en of de 4-weken-termijnvariant een eigen slug krijgt. // BESLISSING: confirm met Marlon.
3. Opruimen pending betaal-boekingen op create-on-book-sessies (afgebroken Mollie-betaling laat nu een sessie plus pending booking achter): guard-duur en opruimpad (expire-cron uitbreiden of TTL in de RPC-validatie).
4. Duo-prijs-pad zonder duo-kaart: mag een lid een losse duo-sessie via Mollie boeken (`duo_single` bestaat in de catalogus)? Voorstel: ja, zelfde pending-payment-pad met `duo_single`-prijs. // BESLISSING: confirm met Marlon.

---

## 12. PR-plan

- PR A (Fable): model plus migratie (3.1 t/m 3.3, RLS-wijzigingen uit paragraaf 7, btree_gist plus exclusion-constraint), RPC-herbouw naar create-on-book, `cancel_pt`, `reschedule_pt`, `kind` plus prospect-velden, intake-korting-kolommen eruit, attendance-markers, lifecycle-guard (regel 12), Marlon-trainers-rij-datafix plus optionele Ilja-trainers-rij.
- PR B (Sonnet): Beschikbaarheid-scherm voor Marlon: weekvensters, `pt_settings`, uitzonderingen.
- PR C (Fable plus Sonnet): Boek-voor-klant (losse sessie, 12-weken programma prepaid met Mollie-betaallink plus reeds-betaald-override, intake, recurring 12 weken in een keer) plus notificatie-wiring (trainer plus klant, paragraaf 6).
- PR D (Sonnet): Marlon PT-agenda dag/week/maand, trainer-kiezer, attendance/no-show/blok-acties, zichtbaarheid.
- PR E (Sonnet): lid-side: `/app/pt`-uitbreidingen (8 weken, duo, slots-RPC), PT in `/app/boekingen`, bevestiging plus herinnering.
- Fase 2: per-4-weken-achteraf zodra de facturatie er staat.

Volgorde: A blokkeert alles; B en het agenda-skelet van D kunnen parallel na A; C na A (en deels na B voor venster-validatie); E na A.

---

## 13. Conventies

- Schema strak op `tmc`; geen objecten in `public`.
- Migratie `20260503_gallery.sql` nooit aanraken; nieuwe migraties in het `YYYYMMDD000000_beschrijving.sql`-formaat.
- Live functies verifieren via `pg_get_functiondef`, nooit vertrouwen op repo-bestanden.
- RPC's: SECURITY DEFINER, `set search_path to 'tmc','extensions'`, jsonb `ok/reason`-resultaten, locks voor elke check-then-write.
- Service-role-only functies guarden op `auth.uid() is not null` (patroon `adjust_membership_credits`).
- Elke saldo- of statusmutatie krijgt een audit-event in dezelfde transactie.
- Geen em dashes in copy of code-comments.
- Alle user-facing NL-copy markeren met // COPY: confirm met Marlon.
