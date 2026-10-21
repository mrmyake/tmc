# Spec: last-minute trainersmelding

De trainer van een groepsles krijgt een e-mail zodra iemand zich minder dan drie uur voor de start van die les definitief inschrijft, zodat een trainer nooit onverwacht deelnemers heeft. Discovery en besluiten: Ilja, 2026-10-21.

## Besluiten

- **Last minute** = de inschrijving wordt definitief minder dan drie uur voor `class_sessions.start_at`. Vergelijking op tijdstippen (precies drie uur is niet last minute; een les die al begonnen is krijgt geen melding). Europe/Amsterdam is alleen weergave.
- **Ontvanger:** de trainer van de sessie (`class_sessions.trainer_id` naar `tmc.trainers.profile_id` naar `profiles.email`), mits de trainersrij `is_active` is en het adres bruikbaar (een echt e-mailadres, geen `*.internal`-placeholder).
- **Fallback:** eerst de actieve trainer met `employment_tier = 'head_trainer'` (Marlon); alleen als die niet bestaat of geen bruikbaar adres heeft, alle profielen met `role = 'admin'` met een bruikbaar adres. Nergens een hardcoded adres.
- **Kanaal:** alleen e-mail via `sendEmail` (MailerSend). Geen push, geen ntfy (het topic is openbaar en de mail bevat een naam).
- **Bij elke last-minute inschrijving een mail,** niet alleen de eerste. Per inschrijving hooguit een mail (zie Idempotentie).
- **Niet voor vrij trainen** (pillar `vrij_trainen`, ook geen proefuur via code of openingsperiode) **en niet voor PT.**
- **Een mislukte mail blokkeert de inschrijving nooit en draait die nooit terug.** De helper throwt nooit; in server actions fire-and-forget, in de webhook en de cron awaited zoals de bestaande bevestigingsmail daar.
- **Testboekingen** (`trial_bookings.is_test`, `profiles.is_test` van lid of gastheer): in productie nooit een mail en nooit meegeteld in het totaal. Buiten productie geldt de omleiding hieronder.
- **"Van de wachtlijst"** is een eigen soort in de mail, op basis van `waitlist_confirmed` uit `tmc.book_class_session`.
- **Buiten productie** (`VERCEL_ENV` niet `production`: preview, development, lokaal) deelt de app de database met productie. Elke melding, alle paden en ook `is_test`, gaat dan niet naar de trainer of de fallback maar naar `LAST_MINUTE_ALERT_REDIRECT_EMAIL`, met `[TEST]` voor het onderwerp en de oorspronkelijke ontvanger als regel in de body. Ontbreekt die variabele buiten productie, dan wordt de mail overgeslagen met een waarschuwing in de log en een event met `delivered 0`. De codebase had geen bestaand omleidingsmechanisme voor niet-productiemail (alleen de Mollie-modus en de ntfy-override), dus dit is een nieuwe variabele.

## Paden en het moment van definitief worden

| Bron in de mail | Pad | Definitief op het moment dat | Hook |
|---|---|---|---|
| lid, van de wachtlijst | `createBooking` (`src/lib/member/booking-actions.ts`) via `tmc.book_class_session` | de RPC `ok: true` geeft; `waitlist_confirmed` maakt het "van de wachtlijst" | na `booking.created`, `void` |
| proefles (betaald) | webhook `src/app/api/trial-bookings/webhook/route.ts` en reconciliatie `src/app/api/cron/expire-trial-bookings/route.ts` | de overgang `pending` naar `paid` (atomaire statusguard, daarna `cancelIfSessionCancelled`) | na de bevestigingsmail, awaited |
| proefles (code) | `redeemTrialCodeBooking` (`src/lib/actions/trial-booking.ts`) via `tmc.redeem_trial_code` | de RPC `ok: true` geeft (rij direct `paid`) | na de bevestigingsmail, `void` |
| proefles (openingsperiode) | `startOpeningTrialBooking` (`src/lib/actions/opening-trial.ts`) via `tmc.book_opening_trial` | de RPC `ok: true` geeft (rij direct `paid`) | na de bevestigingsmail, `void` |
| gast van [lid] | `bookGuest` (`src/lib/member/guest-pass-actions.ts`) via `tmc.book_guest_session` | de RPC `ok: true` geeft | na de RPC, `void` |

Een wachtlijstpromotie (cron `waitlist-promote`) is een reservering, geen inschrijving; de melding komt pas bij de bevestiging door het lid. Staf kan niemand aan een groepsles toevoegen (geen action of RPC), en een kiosk-walk-in krijgt alleen een profiel en een check-in zonder sessie; dat pad bestaat dus niet en hoeft niet uitgesloten te worden.

## Ontwerp

- **Kern** `src/lib/alerts/last-minute-core.ts`: pure functies met deps-injectie (`runLastMinuteAlert`, `lastMinuteDecision`, `resolvePrimaryRecipients`, `isUsableEmail`, `kindLabel`, `buildSubject`). Volgorde: sessie laden, pillar en status, drie-uursgrens, deelnemer laden, testboeking in productie overslaan, stempelen, tellen, ontvanger bepalen, omleiden buiten productie, versturen, event.
- **Wrapper** `src/lib/alerts/last-minute-trainer.ts`: `notifyTrainerLastMinuteBooking({ sessionId, source, participantId })` koppelt de kern aan de service-role-client, `sendEmail` en `emitEvent`. `participantId` is `bookings.id` (member, waitlist), `trial_bookings.id` (trial) of `guest_bookings.id` (guest).
- **Template** `src/emails/last_minute_booking.tsx`: onderwerp "Last minute inschrijving: [les] om [tijd]" (met `[TEST] ` ervoor bij omleiding); body met lesnaam, datum en tijd, naam van de deelnemer, soort (lid, proefles, gast van [voornaam lid], van de wachtlijst), het actuele totaal ingeschreven deelnemers inclusief proeflessen en gasten, en een tekstlink "Bekijk de deelnemerslijst" naar `/app/trainer/sessies/[id]` (admin of sessietrainer mag die pagina openen, dus ook de fallback). Alle Nederlandse tekst `// COPY: confirm met Marlon`.
- **Totaal:** leden `booked`, proeflessen `paid` of `attended` zonder `is_test`, gasten `booked` of `attended`. Bewust zonder pending proeflessen en open promoties (die zijn niet definitief; `tmc.session_occupancy` telt ze wel, voor capaciteit).
- **Idempotentie:** kolom `trainer_alerted_at timestamptz` op `tmc.bookings`, `tmc.trial_bookings` en `tmc.guest_bookings` (migratie `20261021120000`). Stamp-first met `where trainer_alerted_at is null`, zelfde patroon als `reminder_sent_at`: nul geraakte rijen betekent al gemeld, dus een dubbele webhook of een herhaalde cronrun mailt niet dubbel. Alleen gestempeld als de inschrijving echt last minute is; een mislukte verzending wordt niet opnieuw geprobeerd (wel gelogd en in het event zichtbaar). Alleen service_role schrijft de kolom.
- **Event** `trainer.last_minute_alert_sent` (TS-only type, `subject_type session`), payload zonder persoonsgegevens: `session_id`, `source`, `participant_id`, `trainer_profile_id`, `total_participants`, `recipient_kind` (`trainer`, `fallback` of `redirect`), `recipients`, `delivered` en bij niet-verzending `reason` (`redirect_missing`, `no_recipient`).

## Tests

`npm run test:last-minute-alerts`: `scripts/last-minute-alerts/core.test.mts` (node:test met de ts-loader, geen netwerk) bewijst de grens (net binnen, precies drie uur, net buiten, les begonnen), vrij trainen en niet-geplande sessies, idempotentie (tweede aanroep stuurt niets, andere inschrijving wel), stempel mislukt, de fallback in drie stappen, geen ontvanger, testboeking in productie, de omleiding buiten productie (nooit naar het trainersadres, ook niet bij `VERCEL_ENV` leeg, en overslaan zonder omleidingsadres), de soorten per bron en een mislukte verzending. `scripts/last-minute-alerts/email.test.mts` (tsx) rendert de template en toetst de linkregel (`assertLinkRule`: geen zichtbare URL, domein of pad, alleen tekstlinks naar themovementclub.nl, geen em dash).

## Uitrol

- Vercel-omgevingsvariabele `LAST_MINUTE_ALERT_REDIRECT_EMAIL` zetten voor Preview (en Development): het adres dat buiten productie alle meldingen ontvangt. Zonder die variabele slaat een preview de mail over met een waarschuwing.
- Migratie `20261021120000_last_minute_trainer_alert.sql` via `supabase db push` na de merge. Geen functies, dus geen grants.
- `types/supabase.ts` wordt nergens geimporteerd en is niet opnieuw gegenereerd.

## Ledger

- **PR (feat/last-minute-trainer-alert, 2026-10-21, migratie `20261021120000`):** last-minute trainersmelding gebouwd: kolom `trainer_alerted_at` op bookings, trial_bookings en guest_bookings met zelfcheck; pure kern en wrapper in `src/lib/alerts/`; template `last_minute_booking.tsx`; hooks in `createBooking` (lid en wachtlijst), de proefles-webhook en de reconciliatiecron, `redeemTrialCodeBooking`, `startOpeningTrialBooking` en `bookGuest`; event `trainer.last_minute_alert_sent`; omleiding buiten productie via `LAST_MINUTE_ALERT_REDIRECT_EMAIL`; tests in `scripts/last-minute-alerts/`. Bewust niet aangeraakt: de RPC's (`book_class_session`, `redeem_trial_code`, `book_opening_trial`, `book_guest_session`), `tmc.session_occupancy` en de capaciteitstelling, push, ntfy, de bestaande bevestigingsmails, de wachtlijstpromotie zelf (geen melding bij promotie), PT en vrij trainen, een retry bij een mislukte mail, `types/supabase.ts`.
