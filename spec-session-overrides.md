# Spec: eenmalige aanpassingen op groepslessen (session-overrides)

Marlon (admin) past een al ingeroosterde groepsles eenmalig aan, zonder het rooster-template te wijzigen: trainer vervangen, les annuleren (een les of alle lessen op een datum) en starttijd verschuiven. Alleen admins; trainers kunnen geen lessen annuleren of wijzigen (besluit 2026-09-28).

Branch `feat/session-overrides`, migratie `20260929130000_session_overrides.sql`. Discovery en besluiten: gesprek met Ilja op 2026-09-29.

## Uitgangssituatie (discovery)

- Lessen staan als echte rijen in `tmc.class_sessions`, 28 dagen vooruit gematerialiseerd uit `tmc.schedule_templates` door `materializeSessionsForTemplates` (dagelijkse cron `generate-sessions` om 03:00 UTC, plus direct bij het aanmaken of wijzigen van een serie).
- De materialisatie deed een upsert op `(template_id, start_at)` met `ignoreDuplicates`. Een verschoven `start_at` gaf daardoor bij de volgende run een duplicaat op de oude tijd. Annuleren en trainer vervangen waren al veilig voor de cron.
- `adminUpdateSeries` zette trainer, capaciteit en duur van boekingloze toekomstige lessen terug naar de template, en annuleerde en hermaterialiseerde ze bij een tijdwijziging. Een eenmalige wijziging op een lege les ging zo verloren.
- `adminCancelSession` bestond al, maar was niet atomair, ruimde de wachtlijst niet op, nam gastboekingen niet mee, stuurde geen push en weigerde lessen in het verleden niet.
- Trainerzichtbaarheid (RLS, trainer-home, sessies, kiosk) hangt aan `class_sessions.trainer_id`, dus een vervanging per les werkt daar vanzelf.
- `blocks_free_training` (vrij-trainen-beschikbaarheid) rekent live op `start_at`/`end_at` met status `scheduled`; een verschuiving of annulering werkt daar zonder extra code door.

## Besluiten

1. **Datamodel: kolommen op `class_sessions`, geen aparte override-tabel.** Sessies bestaan al als rijen en worden op ruim tien plekken direct gelezen; een overlay-tabel zou overal een join vragen.
   - `occurrence_start_at` (not null): de vaste plek van de les in de serie. Wordt bij insert gelijk aan `start_at` (trigger `class_sessions_occurrence_guard` als vangrail) en is daarna onveranderlijk. De materialisatie upsert op de nieuwe unieke sleutel `(template_id, occurrence_start_at)`.
   - De oude sleutel `(template_id, start_at)` blijft bestaan. Hij kan niet botsen met een verschuiving (een template heeft hooguit een les per dag, verschuiven kan alleen binnen de dag) en houdt de uitrol veilig: productiecode van voor deze PR blijft werken tot de nieuwe deploy live is.
   - `rescheduled_at`/`rescheduled_by`, `trainer_overridden_at`/`trainer_overridden_by`, `cancelled_at`/`cancelled_by`.
   - Kolomgrants: `authenticated` leest alleen `occurrence_start_at` en `rescheduled_at` erbij (nodig voor de ledenapp); de `*_by`-kolommen, `cancelled_at` en `trainer_overridden_at` blijven dicht.
2. **Admin-RPC's**, allemaal SECURITY DEFINER met `is_admin()`-check, EXECUTE voor `authenticated` en `service_role`, niet voor PUBLIC of anon, events in dezelfde transactie:
   - `admin_cancel_class_session(p_session_id, p_reason)`
   - `admin_cancel_class_sessions_on_date(p_date, p_reason)`: alle geplande lessen op die Amsterdamse datum die nog moeten beginnen.
   - `admin_preview_day_cancellation(p_date)`: alleen lezen, aantallen voor het bevestigscherm.
   - `admin_reschedule_class_session(p_session_id, p_new_start_at, p_duration_min default null)`
   - `admin_replace_session_trainer(p_session_id, p_trainer_id, p_pillar_warning_overridden default false)`
   - De kern `cancel_class_session_core` heeft geen grants; alleen de poorten roepen hem aan.
3. **Annuleren:** sessie op `cancelled` (nooit hard delete; alle FK's cascaden). In een transactie: ledenboekingen op `cancelled` met reden `session_cancelled` en tegoed terug via `apply_credit_adjustment` (source `session_cancelled`, zet `credits_used` op 0, dus nooit dubbel), abonnementsquotum komt vanzelf terug (de weekcap telt alleen `booked`), open wachtlijstplekken op `expired_at`, gastboekingen op `cancelled` met `passes_used - 1`. Een mislukte teruggave breekt de hele annulering af. Daarna, buiten de transactie: betaalde proeflessen via de bestaande `admin_cancel_trial_booking` plus Mollie-refund, mail en push naar geboekte leden en wachtlijst, mail naar de gast en naar het lid dat de gast boekte. Geannuleerde lessen blijven zichtbaar als "Vervalt" in de ledenapp, de admin en de kiosk, en zijn niet boekbaar.
4. **Hele dag annuleren:** vanuit de dagkop in het admin-weekrooster, reden verplicht, bevestigscherm met aantallen lessen, boekingen, wachtlijst, gasten en proeflessen uit de voorbeeld-RPC. Lessen die al begonnen zijn blijven staan en worden apart genoemd.
5. **Tijd verschuiven:** alleen binnen dezelfde Amsterdamse dag, niet voor een begonnen of geannuleerde les, niet als er al check-ins zijn, en de nieuwe start moet in de toekomst liggen. De duur blijft gelijk tenzij opgegeven (5 tot 600 minuten). Boekingen blijven staan; hun `session_date`, `iso_week` en `iso_year` worden herberekend (zelfde UTC-formule als `book_class_session`). Een al verstuurde herinnering wordt gewist als de nieuwe start nog meer dan 25 uur weg is, zodat de cron er een met de juiste tijd stuurt. Geboekte leden krijgen mail en push met oude en nieuwe tijd.
6. **Kosteloos annuleren na verschuiving:** `cancel_class_booking` (drop en recreate op basis van de live definitie, grants exact hersteld: alleen `authenticated`) behandelt een annulering als binnen de termijn als de boeking van voor `rescheduled_at` is en de (nieuwe) start nog niet bereikt is. Reden `rescheduled`, resultaatveld `free_after_reschedule`. Wie na de verschuiving boekte, valt onder het normale venster. Teruggave loopt nu via `apply_credit_adjustment` (ook voor gewone annuleringen binnen de termijn), met `credits.adjusted`-event en `credits_used` op 0.
7. **Trainer vervangen:** geen harde pijlercheck. De RPC accepteert elke actieve trainer; de UI waarschuwt als de pijler niet in `pillar_specialties` staat en Marlon bevestigt. Het event `session.trainer_replaced` legt `pillar_match` en `pillar_warning_overridden` vast. Geen melding aan leden. De nieuwe trainer ziet de les en deelnemers meteen, de oude niet meer.
8. **Alles alleen voor lessen die nog niet begonnen zijn**, afgedwongen in de RPC's (`session_started`).
9. **Serie-wijzigingen draaien overrides nooit terug.** `adminUpdateSeries` laat lessen met `rescheduled_at` of `trainer_overridden_at` ongemoeid en meldt ze apart. `adminCancelSeries` neemt boekingloze lessen met een override wel mee (die horen bij de gestopte serie).
10. **Openbare `/rooster`:** geannuleerde lessen blijven verborgen, zoals voorheen.
11. **Testtrainer "Marlon test van der Test"** is in de migratie op inactief gezet (voorwaardelijk op id en naam).
12. **Wachtlijstbug `/app/rooster`:** een geannuleerde les toonde "Wachtlijst" als het lid nog een open wachtlijstplek had. De status "geannuleerd" gaat nu voor geboekt en wachtlijst.

## Bekende gevolgen en bewuste grenzen

- **Tijdwijziging van een serie met een override op die dag:** de override blijft op zijn eigen tijd staan en de serie krijgt die dag ook een les op de nieuwe tijd. Dat is hetzelfde gedrag als voor lessen met boekingen, die ook blijven staan. Marlon ziet het aantal in de melding na het opslaan.
- **Lock-volgorde gastboeking:** `book_guest_session` lockt pas en dan sessie, de annuleer-kern sessie en dan pas. Boekt een lid op precies hetzelfde moment een gast voor een les die geannuleerd wordt, dan breekt Postgres een van beide af (foutmelding, geen halve staat).
- **Proefles-bezoekers en gasten bij een verschuiving:** krijgen nu geen bericht; alleen geboekte leden (besluit 5 noemt alleen leden). Zie volgende stappen.
- **Proefles-zelfannulering** (`visitor_cancel_trial_booking`) kent de kosteloze regel na verschuiving niet.

## Meldingen (copy gemarkeerd met `// COPY: confirm met Marlon`)

- Annulering, lid met boeking: bestaande template `session_cancelled_by_admin` (reden, tegoed terug) plus push.
- Annulering, lid op de wachtlijst: zelfde template met `audience: "waitlist"` plus push.
- Annulering, gast en gastheer: nieuwe template `guest_session_cancelled` (varianten `guest` en `host`).
- Verschuiving: nieuwe template `session_rescheduled` (oude en nieuwe tijd, kosteloos annuleren tot de nieuwe starttijd) plus push.
- Trainer vervangen: niets.

## Tests

`npm run test:session-overrides` tegen een lokale Supabase-stack (weigert iets anders dan localhost). Draait de echte cron-route, `adminUpdateSeries` en de admin-RPC's als ingelogde admin:

- verschoven template-les, daarna twee keer `generate-sessions`: geen duplicaat op de oude tijd;
- na verschuiven en na trainer vervangen: `adminUpdateSeries` (zelfde tijd en andere tijd) laat beide overrides staan, ook na een volgende cron-run;
- annulering met een rittenkaartboeking, een abonnementsboeking, een wachtlijstplek en een gastboeking: rit terug, quotum terug (tweede boeking in dezelfde week lukt weer), wachtlijst verlopen, gastpas terug; een tweede aanroep geeft `already_cancelled` en een directe teruggave op dezelfde boeking `already_refunded`;
- hele dag annuleren: voorbeeld en uitvoering tellen dezelfde lessen;
- weigeringen: andere dag, begonnen les (alle drie de acties), geannuleerde les, les met check-ins, lid zonder adminrol (42501 op alle vijf de RPC's), kern niet aanroepbaar;
- kosteloos annuleren na verschuiving: boeking van ervoor krijgt de rit terug (reden `rescheduled`), boeking van erna niet;
- ledenapp: een lid leest precies de kolommen die `/app/rooster` en `/app/boekingen` opvragen, maar niet de audit-kolommen.

## Conventies

- **Nieuwe functies in schema `tmc` krijgen expliciete grants** (regel 7 in `supabase/migrations/README.md`). De event trigger `tmc_new_function_default_privileges` trekt bij elke `CREATE FUNCTION` of `CREATE PROCEDURE` in `tmc` het standaardrecht van PUBLIC en anon in, zolang de functie nog de standaardrechten heeft; extensie-DDL en andere schema's blijven ongemoeid en een fout in de trigger wordt een waarschuwing, nooit een geblokkeerde DDL. Elke nieuwe functie heeft dus een expliciete `GRANT EXECUTE` nodig (`authenticated`, `service_role`, of `anon` als hij echt publiek moet zijn; RLS-helpers die ook voor anon worden geevalueerd: `anon, authenticated`). Blijf daarnaast `REVOKE EXECUTE ... FROM PUBLIC, anon` schrijven en de rechten in de zelfcontrole van de migratie controleren. Een `CREATE OR REPLACE` van een functie met expliciete rechten laat die staan.
- **Kanttekening `audit_actor_label`:** `tmc.audit_actor_label(uuid)` heeft nog de standaardrechten (PUBLIC) en draait onder de rechten van de aanvrager vanuit de trigger `audit_actor_label_guard`. Wie hem opnieuw aanmaakt, geeft daarna expliciet `GRANT EXECUTE ... TO authenticated, service_role`, anders faalt die trigger voor ingelogde gebruikers.
- **Waarom geen `ALTER DEFAULT PRIVILEGES ... IN SCHEMA tmc`:** een per-schema-regel kan alleen rechten toevoegen en haalt de ingebouwde PUBLIC-EXECUTE niet weg (live getest 2026-09-29). De globale variant `FOR ROLE postgres` werkt wel, maar raakt alle schema's van het gedeelde project (public, tvmuur, tmm, montagebaas) en functies die extensies als postgres aanmaken.

## Volgende stappen

Prioriteit volgens Ilja (2026-09-29). Niets hiervan is gebouwd.

- **Gedaan in fix/tmc-hardening: oude unieke sleutel gedropt.** Zie de ledger.
- **Should, voor opening: melding bij tijdwijziging aan proefles-bezoekers en gasten.** Mail met oude en nieuwe tijd, copy gemarkeerd `// COPY: confirm met Marlon`. Nu krijgen alleen geboekte leden bericht.
- **Gedaan in fix/tmc-hardening: nieuwe tmc-functies standaard zonder PUBLIC- en anon-EXECUTE**, via een event trigger in plaats van `ALTER DEFAULT PRIVILEGES` (zie Conventies).
- **Na de opruiming van het gedeelde project** (tvmuur en montagebaas verhuisd, plus 14 dagen): overstappen op de globale regel `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` en de event trigger `tmc_new_function_default_privileges` met zijn functie droppen. Eerst nagaan welke schema's dan nog in het project staan.
- **Could: serie-tijdwijziging op een dag met een eenmalige override.** `adminUpdateSeries` laat de override staan en maakt die dag ook een les op de nieuwe tijd, dus twee lessen. Waarschuwen of die dag overslaan.
- **Could:** kosteloze annulering na verschuiving ook voor proeflessen (`visitor_cancel_trial_booking`).
- **Could:** `types/supabase.ts` opnieuw genereren (wordt nu niet in `src/` gebruikt).

## Ledger

- **PR #239 (2026-09-29, merge `8a2cf61`, migratie `20260929130000`):** eenmalige aanpassingen op groepslessen door een admin: `occurrence_start_at` als vaste seriesleutel met unieke sleutel `(template_id, occurrence_start_at)`, override-kolommen, vijf admin-RPC's plus een kern zonder grants, `cancel_class_booking` met kosteloos annuleren na verschuiving en teruggave via `apply_credit_adjustment`, `adminUpdateSeries` slaat overrides over, admin-UI (drie acties in het sessiepaneel en "Dag annuleren"), "Vervalt" en "nieuwe tijd" in ledenapp, admin en kiosk, twee nieuwe mailtemplates, testtrainer inactief. Bewust niet aangeraakt: de oude unieke sleutel `(template_id, start_at)`, de openbare `/rooster`, meldingen aan proefles-bezoekers en gasten bij een verschuiving, `visitor_cancel_trial_booking`, trainerrechten (blijven zonder annuleren of wijzigen), `ALTER DEFAULT PRIVILEGES` en `types/supabase.ts`. Uitrol 2026-09-29 direct na de merge: `supabase db push` met dry-run vooraf (alleen `20260929130000`); live geverifieerd dat `occurrence_start_at` voor alle 66 sessies gevuld is, de nieuwe unieke sleutel naast de oude bestaat, geen van de acht nieuwe of herschreven functies EXECUTE heeft voor PUBLIC of anon, `authenticated` alleen `occurrence_start_at` en `rescheduled_at` leest (niet de `*_by`-kolommen) en de testtrainer inactief is; generate-sessions via het cron-pad met de service role gaf 200, 15 templates, 0 fouten, geen nieuwe rijen en geen dubbele lessen per dag.
- **PR #241 (2026-09-29, fix/tmc-hardening, migratie `20260929150000`):** oude unieke sleutel `class_sessions_template_id_start_at_key` gedropt (na controle dat de nieuwe sleutel bestaat; live leunde niets meer op de oude, seedscript omgezet naar `occurrence_start_at`) en event trigger `tmc_new_function_default_privileges` die nieuwe functies en procedures in schema `tmc` met nog standaardrechten meteen PUBLIC- en anon-EXECUTE ontneemt (extensie-DDL en andere schema's ongemoeid, fouten als waarschuwing), met regel 7 in het migratie-README en de conventie hierboven. Bewust niet aangeraakt: bestaande functies en hun rechten (ook de RLS-helpers en `audit_actor_label`), andere schema's, de globale `ALTER DEFAULT PRIVILEGES` (pas na de opruiming van het gedeelde project) en het historische ontwerpdocument `docs/member-system/tmc-member-system.md`. Merge-hash volgt na de merge.
