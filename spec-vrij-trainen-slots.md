# Spec: vrij trainen met tijdsloten

Vrij trainen wordt boekbaar als eigen tijdslot binnen een dagsessie, met een harde grens op het aantal mensen dat tegelijk traint. Deze spec legt het besloten ontwerp vast (discovery en akkoord Ilja, 2026-09-29), wat er in de eerste PR gebouwd is en wat bewust naar de volgende PR (de slotkiezer) gaat.

## Besloten ontwerp

- **Een dagsessie per openingsdag**, `capacity null`, gegenereerd via `schedule_templates` zoals andere sessies, met het bestaande class_type `vrij-trainen-dag` en Marlon als trainer. Tijden volgen `opening_hours`: maandag tot en met vrijdag 07:00-21:00, zaterdag 08:00-14:00, zondag geen sessie (Europe/Amsterdam).
- **Een boeking op vrij trainen heeft een eigen slot**: `bookings.slot_start_at` en `bookings.slot_end_at`. Raster per kwartier, duur 30, 45, 60, 75 of 90 minuten, en het slot valt volledig binnen de sessie. Intervallen zijn half-open: 10:00-11:30 en 11:30-13:00 raken elkaar niet.
- **Concurrency-regel:** voor elk kwartier binnen het gevraagde slot mag het aantal actieve vrij-trainen-boekingen (status `booked`) dat dat kwartier raakt niet op of boven `booking_settings.vrij_trainen_max_concurrent` (default 5) liggen, anders weigering met reason `slot_full`. De grens is een instelling, niet hardcoded.
- **Blokkerende lessen:** een kwartier dat overlapt met een geplande sessie met `blocks_free_training = true` telt als vol (0 beschikbaar). Weigering met een eigen reason, `slot_blocked`, zodat de slotkiezer het verschil met "vol" kan tonen.
- **Een vrij-trainen-boeking per lid per dag.** Dat volgt uit een sessie per dag plus de partiele unique index op (lid, sessie).
- **Annuleren:** de termijn `vrij_trainen_cancel_window_minutes` rekent vanaf `slot_start_at`, niet vanaf de sessiestart. Ook boeken kan tot de start van het slot, ook als de dagsessie al begonnen is.
- **Daglimiet:** vrij-trainen-boekingen tellen niet mee voor `fair_use_daily_max`, en een vrij-trainen-boeking wordt niet geweigerd op basis van andere boekingen die dag. DB (`book_class_session`) en TS (`canBook`) doen hetzelfde.
- **Geen gasten, geen proeflessen of proefcodes, geen wachtlijst** op vrij trainen.
- **Geen no-shows en geen strikes** op vrij trainen, ook niet handmatig. Vrij trainen verschijnt niet op de kiosk, niet in de trainer-home, niet in `/app/trainer/sessies` en niet in het admin-weekrooster.
- **Deurtoegang (Akiles) verandert niet.** De kiosk-check-in via `/kiosk/paneel` (zonder `session_id`) blijft bestaan en wordt niet aan boekingen gekoppeld.
- **Modus:** vrij trainen wordt boekmodus; leden moeten een slot boeken. `booking_settings.check_in_pillars` blijft ongewijzigd (die lijst stuurt ook de hardheid van de weekcap in `book_class_session`), en er komt geen koppeling tussen `check_in_pillars` en de boekmodus. De modusschakeling van `/app/vrij-trainen` krijgt in de slotkiezer-PR een eigen expliciete instelling.

## Datamodel en afdwinging

- **Kolommen:** `bookings.slot_start_at`, `bookings.slot_end_at` (timestamptz), `booking_settings.vrij_trainen_max_concurrent` (integer, default 5, groter dan 0).
- **Check-constraints op bookings:** begin en einde samen gevuld of samen leeg (`bookings_slot_pair`); einde na begin, duur in de vijf toegestane waarden, begin op het kwartier via `epoch % 900` (`bookings_slot_shape`, veilig omdat de Amsterdamse offset hele uren is); slot gevuld dan en slechts dan als `pillar = 'vrij_trainen'` (`bookings_slot_pillar`); geen `no_show_at` op vrij trainen (`bookings_vrij_trainen_no_no_show`).
- **Index voor de telling:** `bookings_vrij_slot_idx` op `(session_id, slot_start_at, slot_end_at) where status = 'booked' and slot_start_at is not null`.
- **Unique-fix (alle pillars):** de constraint `bookings_profile_id_session_id_key` op alle statussen is vervangen door de partiele unique index `bookings_profile_session_active_key` op `(profile_id, session_id) where status in ('booked','waitlisted')`. Annuleren en opnieuw boeken van dezelfde sessie werkt weer; de geannuleerde rij blijft als historie staan (FK's vanuit `check_ins`, `no_show_strikes` en `payments` blijven kloppen).
- **Gedeelde telling:** `tmc.vrij_trainen_slot_peak(session, start, end, exclude_booking_id)` geeft `peak` (hoogste aantal geboekte slots in een kwartier van het interval) en `blocked` (minstens een kwartier overlapt een blokkerende les). Dit is de enige telling; RPC, trigger en beschikbaarheid gebruiken hem alle drie. Geen EXECUTE voor authenticated, anon of service_role.
- **Triggers:**
  - `bookings_enforce_vrij_trainen_slot`: harde backstop op pillar/slot, slot binnen de sessie, `slot_blocked` en `slot_full`, ook voor paden buiten de RPC.
  - `trial_bookings_reject_vrij_trainen` en `guest_bookings_reject_vrij_trainen`: weigeren proeflessen (code en betaald) en gasten op vrij trainen met `session_not_eligible`.
  - `no_show_strikes_reject_vrij_trainen`: weigert strikes op vrij-trainen-boekingen met `vrij_trainen_no_strike`.
  - `class_sessions_vrij_trainen_bounds`: een vrij-trainen-sessie mag niet zo verschuiven of krimpen dat geboekte slots erbuiten vallen.
- **RPC's (drop en recreate op basis van de live definitie, grants hersteld zoals ze live stonden):**
  - `book_class_session(p_session_id, p_rental_mat, p_rental_towel, p_slot_start_at, p_slot_minutes)`: slot verplicht op vrij trainen (`slot_required`, `slot_invalid`, `slot_outside_session`), verboden elders (`slot_not_allowed`); venster en verleden vanaf het slot; `slot_blocked` en `slot_full` onder de sessie-lock, zonder wachtlijstoptie; daglimiet zonder vrij trainen. EXECUTE: authenticated.
  - `cancel_class_booking`: termijn vanaf `coalesce(slot_start_at, sessiestart)`. EXECUTE: authenticated.
  - `book_guest_session`: `session_not_eligible` op vrij trainen. EXECUTE: authenticated.
  - `admin_reschedule_class_session`: weigert vrij trainen met `vrij_trainen_not_reschedulable`; een dag annuleren blijft mogelijk. EXECUTE: authenticated, service_role.
  - Nieuw: `vrij_trainen_availability(p_date)` geeft per kwartier `session_id`, `quarter_start`, `booked`, `available`, `blocked`, zonder persoonsgegevens. SECURITY DEFINER (RLS laat leden alleen eigen boekingen lezen). EXECUTE: alleen authenticated.
- **Race-vrijheid:** elke schrijver op een vrij-trainen-dag (RPC, trigger, admin-pad) neemt eerst `FOR UPDATE` op de ene `class_sessions`-rij van die dag. Onder READ COMMITTED krijgt elk statement na die lock een nieuwe snapshot, dus de telling ziet de gecommitte boeking van de vorige lockhouder. Beide BEFORE-triggers op bookings locken dezelfde rij binnen dezelfde transactie, dus er ontstaat geen deadlock. Bewezen met twee echte psql-verbindingen (`scripts/test-vrij-trainen-slots-race.sh`). Uitzondering: een blokkerende les die tegelijk met een boeking wordt aangemaakt, wordt niet via die lock geserialiseerd; dat is een admin-handeling en geen capaciteitsgrens.

## Waar het slot leidend is (in deze PR)

`slot_start_at`/`slot_end_at` gaan voor op de sessietijden via `bookingTimes()` (`src/lib/member/booking-times.ts`) in: de annuleertermijn (RPC en `UpcomingRow`), de herinneringscron (venster en tijdlabel), de bevestigings- en annuleermail, de melding bij annulering van de sessie door de studio, `/app/boekingen` (komend/historie, sortering, weergave), de volgende-boekingkaart op het dashboard en de boekingenlijst in de admin-ledendetail. Het rooster (`/app/rooster`) toont geen vrij trainen, ook niet in de volgende-lescard.

## Bewust naar de slotkiezer-PR

- De slotkiezer voor leden (eerst een HTML-mockup) en het omzetten van `/app/vrij-trainen` naar boekmodus met een eigen instelling. `DayPassStrip` roept `createBooking` nog zonder slot aan en krijgt daarom `slot_required`; de pagina staat live in check-in-modus, dus leden komen daar niet.
- Een invoerveld voor `vrij_trainen_max_concurrent` in de admin-instellingen (nu alleen via SQL te wijzigen).
- Presentatie van vrij trainen in mails en lijsten: "met Marlon" als trainer bij vrij trainen, en de check-in-hint op `/app/boekingen`.
- De zachte weekcap-telling (`softWeeklyCapCheck`, `canBook`) telt boekingen plus check-ins; met boekmodus plus kiosk-check-in kan vrij trainen dubbel tellen.
- `waitlist_entries` houdt een niet-partiele unique op (lid, sessie).

## Ledger

- **PR #PRNUMMER (2026-09-29, feat/vrij-trainen-slots, migratie `20260930090000`):** vrij trainen boekbaar als eigen tijdslot binnen een dagsessie met een harde grens van `vrij_trainen_max_concurrent` (5) tegelijk per kwartier, blokkerende lessen op 0, unique-fix voor annuleren en opnieuw boeken (alle pillars), triggers als backstop, `vrij_trainen_availability`, templates volgens `opening_hours`, en de app-aanpassingen die nodig zijn om niets te breken (kiosk-, trainer- en adminfilters, geen no-shows of strikes op vrij trainen, termijn, herinneringen, mails en weergave vanaf het slot, lookups op (sessie, profiel) die de actieve boeking kiezen). Bewust niet aangeraakt: de slotkiezer en de boekmodus van `/app/vrij-trainen`, `booking_settings.check_in_pillars`, de kiosk-check-in via `/kiosk/paneel`, Akiles, `waitlist_entries`, de admin-instelling voor het maximum en `types/supabase.ts`.
