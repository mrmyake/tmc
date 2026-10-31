# Spec: Trainingsprotocol (schema's + logging)

## Status

**DECIDED (2026-07-04), klaar als implementatieprompts, één per PR.** Alle open punten uit de intake zijn opgelost, zie decision log onderaan. Enige resterende punt is copy (routenaam en tempoweergave in begrijpelijke taal), dat volgt het standaardpatroon: tijdens implementatie draften en flaggen met `// COPY: confirm met Marlon`.

Doel: Marlon kan per klant een trainingsprotocol maken en bijhouden (het Overload-model: dagen, supersets A1/A2 t/m G1/G2, sets, rep-range, tempo, rust). De klant ziet zijn actieve schema in de app en logt per workout gewicht en reps per set. Marlon ziet de historie en stuurt bij.

---

## Decided (intake 2026-07-04)

1. **Alleen Marlon** maakt en bewerkt schema's. Geen trainer-rol nodig; bestaande admin-rol volstaat. Mocht dit later verbreden, dan is dat een RLS/rol-wijziging, geen datamodel-wijziging.
2. **V2 vanaf het begin gepland**: klant logt gewicht en reps per set. Wel gefaseerd gebouwd (read-only view eerst, logging als aparte PR).
3. **Oefeningenbibliotheek**, geen vrije tekst. Marlon beheert de bibliotheek in de admin cockpit. Videolinks/instructies per oefening zijn een latere uitbreiding, kolom wordt alvast voorzien.
4. **Tempo als 4 losse velden** (excentrisch, pauze onder, concentrisch, pauze boven), weergave samengevoegd als "4140".
5. **Precies 1 actief schema per klant**, oude versies blijven bestaan (archived, read-only). Geen templates; elk schema is uniek per klant.
6. **Doelgroep: elk lid kan een schema hebben.** Geen entitlement-koppeling aan PT of 12-weken traject in de code; Marlon bepaalt in de praktijk wie een schema krijgt door er simpelweg wel of geen aan te maken. Dit houdt het datamodel vrij van programma-logica die later toch verandert.

---

## Datamodel (schema `tmc`)

### `exercises` (bibliotheek)

| kolom | type | opmerking |
|---|---|---|
| `id` | uuid pk | |
| `name` | text, uniek | "Leg Press", "Front Squat" |
| `description` | text null | instructie, later |
| `video_url` | text null | later, kolom nu al aanmaken |
| `is_active` | boolean default true | soft delete; verwijderen mag nooit hard zolang program_exercises ernaar verwijst |
| `created_at` | timestamptz | |
| `equipment` | text null | `barbell` / `dumbbell` / `kettlebell` / `machine` / `bodyweight`; NULL = nog niet ingedeeld (Marlon via `/app/admin/oefeningen`). Bepaalt de editor in de workout-logger, zie `src/lib/equipment.ts` (vorige waarden, migratie `20261031120000`) |
| `weight_step_kg` | numeric(4,2) null | stapgrootte van de stepper per oefening; NULL = standaard van het type (barbell 2,5, dumbbell 2, machine 5, onbekend 2,5) |

### `training_programs`

| kolom | type | opmerking |
|---|---|---|
| `id` | uuid pk | |
| `profile_id` | uuid fk profiles | de klant |
| `version` | int | oplopend per klant |
| `status` | text | `draft` / `active` / `archived` |
| `title` | text null | optioneel label, bv. "Blok 2: kracht" |
| `notes` | text null | notities van Marlon, zichtbaar voor klant |
| `activated_at` / `archived_at` | timestamptz null | |
| `created_at` | timestamptz | |

Constraint: **unieke partial index op `(profile_id) where status = 'active'`**, dit dwingt "1 actief schema" af op databaseniveau in plaats van in applicatiecode.

Versie-flow: Marlon bewerkt een `draft` vrij. Activeren zet een eventueel bestaand `active` schema van die klant op `archived` en de draft op `active` (in een transactie, via RPC). Een actief schema aanpassen = dupliceren naar nieuwe draft-versie, bewerken, opnieuw activeren. Zo blijft historie intact en verwijzen oude set-logs altijd naar het schema zoals het toen was.

### `program_days`

| kolom | type | opmerking |
|---|---|---|
| `id` | uuid pk | |
| `program_id` | uuid fk | on delete cascade (alleen drafts zijn verwijderbaar) |
| `day_number` | int | 1, 2, ... (afwisselend uitgevoerd) |
| `label` | text null | bv. "Dag 1: onderlichaam" |

### `program_exercises`

| kolom | type | opmerking |
|---|---|---|
| `id` | uuid pk | |
| `day_id` | uuid fk | |
| `slot` | text | check `slot ~ '^[A-G][12]$'`, uniek per dag; max 14 oefeningen per dag volgt hieruit vanzelf (was A t/m E en 10, verruimd in de tempo/slots-PR) |
| `exercise_id` | uuid fk exercises | |
| `sets` | int | |
| `reps_min` / `reps_max` | int | |
| `tempo_eccentric` | int | seconden omlaag; `-1` = X (explosief) |
| `tempo_pause_bottom` | int | seconden; `-1` = X, `0` = geen pauze |
| `tempo_concentric` | int | seconden omhoog; **`-1` = explosief, overal getoond als "X"** (bv. "20X0"); `0` is letterlijk 0 seconden. Geldt voor elk tempo-veld; de builder accepteert cijfers 0 t/m 20 en X, en alle code leest tempo via `src/lib/training-tempo.ts` (`TEMPO_EXPLOSIVE`) |
| `tempo_pause_top` | int | seconden; `-1` = X, `0` = geen pauze |
| `rest_seconds` | int | |
| `notes` | text null | per-oefening aanwijzing van Marlon |
| `start_weight_kg` | numeric(5,2) null | optioneel startgewicht van de coach; ghost value zolang het lid deze oefening nog nooit heeft afgevinkt. `duplicate_training_program` kopieert het mee |

### `workout_sessions` (logging, PR 4)

| kolom | type | opmerking |
|---|---|---|
| `id` | uuid pk | |
| `profile_id` | uuid fk | |
| `program_id` / `day_id` | uuid fk | vastleggen tegen welke versie gelogd is |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz null | null = sessie loopt nog of is afgebroken |

### `set_logs`

| kolom | type | opmerking |
|---|---|---|
| `id` | uuid pk | |
| `session_id` | uuid fk | |
| `program_exercise_id` | uuid fk | |
| `exercise_id` | uuid fk exercises | gevuld door `log_set` vanuit `program_exercises.exercise_id`; historie matcht hierop in plaats van op `program_exercise_id`, zodat archiveren of dupliceren van een schema de historie niet afkapt (zie PR 5-vervolg hieronder) |
| `set_number` | int | |
| `weight_kg` | numeric(5,2) | |
| `reps` | int | |
| `notes` | text null | |
| `completed_at` | timestamptz null | moment van afvinken; NULL = draft (waarden bewaard, set niet gedaan). Drafts komen nooit in `tmc.set_log_history` en dus nooit in de historie of de grafieken. Rijen van voor `20261031120000` zijn gebackfilld met `completed_at` van de sessie (anders `started_at`) |
| `source` | text null | `previous` = ghost value ongewijzigd overgenomen, `edited` = gewicht of reps afwijkend; NULL = onbekend (rijen van voor de migratie, en drafts) |

Uniek: `(session_id, program_exercise_id, set_number)`.

---

## Security (zelfde aanpak als RPC-laag PR #15)

- **Member leest** uitsluitend het eigen `active` schema (RLS: `profile_id = auth.uid() AND status = 'active'`); drafts en gearchiveerde versies zijn onzichtbaar voor de klant. Marlon ziet alle versies in de cockpit. Log-historie van de klant blijft wel volledig zichtbaar voor de klant zelf, ook als die tegen een inmiddels gearchiveerde versie is gelogd.
- **Member schrijft nooit direct** in tabellen. Sessie starten, set loggen, set verwijderen, sessie afronden lopen via SECURITY DEFINER stored procedures met validatie (log hoort bij eigen sessie, sessie hoort bij eigen actieve programma, set_number binnen sets-range). `tmc.delete_set_log(p_session_id, p_program_exercise_id, p_set_number)` (fix/workout-logging, migratie `20261027150000`) verwijdert een set uit de eigen, nog open sessie; idempotent als de rij al weg is; `search_path = ''` met volledig gekwalificeerde namen; EXECUTE alleen voor `authenticated`, REVOKE van PUBLIC en anon, geen service_role. `tmc.log_set(..., p_notes, p_completed default true, p_source default null)` (migratie `20261031120000`, zelfde patroon, de oude 6-argument-signature is gedropt) is de upsert: `p_completed` true zet `completed_at` op het eerste afvinkmoment (blijft staan bij latere aanpassingen), false zet het op NULL (draft); een draft mag reps 0 hebben, een afgevinkte set niet; `p_source` moet `previous`, `edited` of NULL zijn.
- **Marlon schrijft** via server actions met admin client, consistent met de rest van de cockpit. Activeren van een schema is één RPC die archiveren + activeren atomair doet.
- `exercises` is leesbaar voor ingelogde members (nodig om het schema te renderen), schrijfbaar alleen admin.

---

## Gefaseerd bouwplan (één PR per fase, elk blok standalone prompt)

### PR 1: migratie + oefeningenbibliotheek
Migratie met alle zes tabellen (logging-tabellen meteen mee, dan is het schema in één keer compleet en getest). Admin cockpit scherm "Oefeningen": lijst, toevoegen, hernoemen, deactiveren. Seed met de oefeningen uit het huidige Overload-schema.

### PR 2: programma-builder (admin)
Nieuw cockpit-scherm per klant (ingang via bestaande member-detailpagina): schema aanmaken, dagen toevoegen, oefeningen in slots plaatsen met sets/reps/tempo/rust, draft opslaan, activeren. Dupliceren-naar-nieuwe-versie knop op een actief schema. Versie-historie per klant zichtbaar voor Marlon (gearchiveerde versies read-only inzien). Tempo-invoer als 4 velden met live preview in "41X0" notatie (X en 0 blijven gescheiden: X wordt als `-1` opgeslagen).

### PR 3: klant-view (member app, read-only)
Nieuwe route `/app/schema` (of `/app/training`, copy check): toont het actieve schema per dag, met tempo uitgeschreven in begrijpelijke taal naast de "4140" notatie (bv. "4 sec zakken, 1 sec pauze, explosief omhoog"). Geen schema = vriendelijke lege staat. `// COPY: confirm met Marlon` op alle teksten.

### PR 4: workout logging (member app)
"Start workout" op een dag → sessie-flow: per oefening per set gewicht + reps invoeren, vorige sessie als referentie ernaast ("vorige keer: 80 kg x 4"), sessie afronden. RPC-laag zoals hierboven. Afgebroken sessies (completed_at null ouder dan 24u) opruimen kan mee in een bestaande cron.

**Vervolg, autosave (fix/workout-logging, 2026-10-27).** Aanleiding: een lid rondde twee workouts af zonder één opgeslagen set; het gewichtveld was `<input type="number">`, een komma maakt de value daar stil leeg en de validatie blokkeerde de save. De regels sindsdien:

- **Invoer.** Gewicht en reps zijn tekstvelden (`inputMode="decimal"` en `"numeric"`) met eigen parsing in `src/lib/member/workout-input.ts`: komma en punt zijn allebei goed ("22,5" en "22.5" worden 22.5), gewicht 0 tot 999,99 met maximaal 2 decimalen, reps een geheel getal vanaf 1. Gewicht 0 is geldig en betekent lichaamsgewicht (conform de historieweergave); leeg gewicht is onvolledig, niet 0. Een tussenstand met afsluitend scheidingsteken ("82,") of alleen een scheidingsteken is onvolledig: niet opslaan, geen melding zolang het veld focus heeft. Ongeldige invoer geeft altijd een melding bij de rij, nooit stil leegmaken of blokkeren.
- **Autosave.** Geen "Log set"-knop. Een set wordt opgeslagen zodra beide velden geldig zijn: 600ms na de laatste toets, of direct bij het verlaten van een veld. Aanpassen van een opgeslagen set gaat via dezelfde upsert (`log_set`). Na elke voltooide save vergelijkt de client de verstuurde waarde met de actuele veldwaarde en stuurt zo nodig opnieuw, zodat de laatste veldwaarde altijd wint. Per rij een status: bezig met opslaan, opgeslagen, of mislukt met één automatische herhaling na 2 seconden en daarna "Opnieuw proberen".
- **Verwijderen.** Beide velden leeg op een opgeslagen rij: na de debounce of bij blur `delete_set_log`, de rij gaat terug naar leeg. Eén veld leeg en het andere gevuld op een opgeslagen rij: melding, niets verwijderen, de opgeslagen waarde blijft tot de rij weer geldig of helemaal leeg is.
- **Afronden.** Bevriest de invoer, vuurt alle openstaande debounces af, wacht alle saves af en weigert zolang een geldige rij niet is opgeslagen (rij blijft gemarkeerd, sessie blijft open). Nul opgeslagen sets: bevestiging "Er zijn nog geen sets opgeslagen. Toch afronden?" met Terug en Toch afronden.
- **Veiligheidsnet.** Start, autosave, verwijderen en afronden zitten in try/catch; ingevulde waarden blijven in de UI en gaan per sessie-id naar sessionStorage (database leidend bij herladen). Herkent de fout een verouderde deployment ("Failed to find Server Action"), dan een banner met herlaadknop; de waarden komen na herladen terug en autosave schrijft ze alsnog weg.
- **Sessie.** De invoerrijen bestaan pas na "Start workout"; alleen kijken maakt geen sessie aan.

**Vervolg, vorige waarden (feat/schema-vorige-waarden, 2026-10-31).** De klant ziet per set wat hij vorige keer deed als ghost value, neemt die met een tik op het vinkje over, of past aan in een editor die bij het type materiaal past. Alleen afgevinkte sets tellen mee in de historie. Geen automatische suggestie om zwaarder te gaan (bewust geschrapt). De regels hieronder vervangen op die punten de autosave-regels hierboven:

- **Type materiaal.** `exercises.equipment`: `barbell`, `dumbbell`, `kettlebell`, `machine`, `bodyweight` of NULL (nog niet ingedeeld). Initiele indeling op naam in de migratie; Ab Wheel Rollout, Hip Thrust, Split Squat en Walking Lunge en alle niet-eenduidige namen bleven NULL en deelt Marlon in via `/app/admin/oefeningen`. Isometrische oefeningen (Plank, Side Plank) zijn `bodyweight` en tonen voorlopig reps; seconden als eenheid valt buiten deze PR. Stapgrootte: `exercises.weight_step_kg`, anders de standaard van het type (`src/lib/equipment.ts`). Kettlebellmaten staan op een plek in `equipment.ts` (`KETTLEBELL_SIZES_KG`, `// CONFIRM: kettlebellmaten van de studio met Marlon`).
- **Bron van "vorige keer".** De meest recente afgeronde sessie van dezelfde klant met dezelfde `exercise_id` waarin minstens een set is afgevinkt (`buildPreviousLogsByExercise` bovenop `tmc.set_log_history`, die sinds `20261031120000` alleen afgevinkte sets bevat). Per setnummer de waarde van die set; had de klant vorige keer minder sets, dan vult de laatste gedane set de extra sets. Geen historie: `program_exercises.start_weight_kg` als ghost-gewicht en `reps_min` als reps; geen startgewicht, dan blijft het gewicht leeg en kan de set pas afgevinkt worden als er een gewicht staat. Bij bodyweight is leeg 0, dus daar is het vinkje altijd bruikbaar. Pure logica in `src/lib/member/workout-ghost.ts`.
- **Drafts in de database.** Elke wijziging van een waarde gaat met dezelfde debounce (600ms of blur) als draft naar `log_set` met `p_completed false`, tenzij de set al afgevinkt was (dan blijft hij afgevinkt en wordt `source` opnieuw bepaald). De database is de bron van waarheid; sessionStorage blijft als vangnet, maar herstelt alleen rijen die de server niet als opgeslagen teruggeeft. Een rij die nooit is aangeraakt (beide velden leeg, niet afgevinkt) wordt nooit opgeslagen: geen ghost value in `set_logs`. Beide velden leeg op een opgeslagen draft verwijdert de set (`delete_set_log`), de rij toont weer de ghost value. Rijlogica in `src/lib/member/workout-rows.ts` (`intentOf`, `describeRow`, `materialize`), tests in `scripts/workout-logging/`.
- **Afvinken.** Het vinkje (minimaal 44px) neemt de getoonde waarden over, zet `completed` en bepaalt `source`: gelijk aan de ghost value is `previous`, anders `edited` (ook een ongewijzigd overgenomen startgewicht telt als `previous`). Nog eens tikken zet de set terug op niet gedaan, de waarden blijven bewaard. Onder een afgevinkte set die afwijkt van vorige keer: "Aangepast t.o.v. vorige keer: +2,5 kg, -1 reps", alleen de onderdelen die echt veranderd zijn en alleen bij historie (niet bij een startgewicht).
- **Editor.** Tik op gewicht of reps klapt inline open: barbell een stepper met schijvenberekening ("Stang 20 kg + X kg per kant", bij 20 kg of minder "Lege stang (20 kg)"), dumbbell "Kg per dumbbell" (kolom heet KG/HAND), kettlebell chips met de maten, machine "Stand op de stack", bodyweight alleen reps met een inklapbare optie "Extra gewicht" (KG-kolom valt weg tenzij er extra gewicht in het spel is; VORIGE toont dan "+10 × 8"), NULL een algemene stepper "Gewicht". Het grote getal is een tekstveld met `inputmode="decimal"`, parsing via `workout-input.ts` (komma en punt). Daaronder een reps-stepper en "Set afvinken".
- **Afronden.** "Training afronden" flusht ook de drafts; niet-afgevinkte sets blijven drafts (`completed_at` NULL) en komen nooit in de historie of de grafieken. Bevestiging bij nul afgevinkte sets: "Er zijn nog geen sets afgevinkt. Toch afronden?". Voortgangsbalk eronder: "<x> van <y> sets gedaan" en "<n> aangepast" (afgevinkte sets die afwijken van vorige keer).
- **Kop.** "Vorige keer: <weekdag> <datum>, <n> dagen geleden" (de meest recente bron-sessie over de oefeningen van de dag; dagen op de server berekend in Amsterdam-tijd), anders "Nieuw schema, nog geen eerdere sessie". Per oefeningkaart: naam, "Doel 3 × 5" (bij een range "3 × 8-12"), label met het type materiaal, en zonder historie "Eerste keer. Startgewicht van je coach: X kg" of "Geen startgewicht opgegeven. Kies een gewicht waarmee <reps_min> reps net lukt."
- **Admin.** `ExerciseForm`: select voor het type materiaal en "Stapgrootte (kg)" (placeholder = standaard van het type; niet van toepassing bij kettlebell). `ExerciseSlotForm`: "Startgewicht (kg)". `DayCard` toont het startgewicht in een kolom "Start".

### PR 5: historie en progressie
Marlon-kant: per klant per oefening de log-historie en een simpele progressielijn (gewicht over tijd). Klant-kant: eigen historie per oefening. Query-time aggregatie volstaat op boutique-volumes, geen materialized views nodig.

Volgorde is strikt: 1 → 2 → 3 → 4 → 5. PR 3 is het eerste moment waarop een klant iets ziet; 1+2+3 samen is een bruikbare V1 (read-only), 4 maakt er de besloten V2 van.

---

## Decision log (opgelost 2026-07-04)

1. **PDF-export: nee.** Het schema leeft in de app; geen export-PR.
2. **Routenaam en tempoweergave in begrijpelijke taal: copy-beslissing voor Marlon**, tijdens implementatie draften en flaggen met `// COPY: confirm met Marlon`. Werknaam in deze spec: `/app/schema`.
3. **Explosief tempo: ja**, opslaan als `-1` (`TEMPO_EXPLOSIVE`), overal tonen als "X" (bv. "20X0"). `0` blijft 0 seconden (bv. geen pauze), X en 0 zijn gescheiden. Eerder (2026-07-04) opgeslagen als 0; omgezet in de tempo/slots-PR (bestaande nullen in excentrisch en concentrisch werden -1, pauzevelden bleven 0).
4. **Zichtbaarheid oude versies: klant ziet alleen het actieve schema.** Marlon ziet in de cockpit de volledige versie-historie per klant. Log-historie blijft voor de klant zelf altijd zichtbaar, ook tegen gearchiveerde versies.
5. **RPE: weglaten.** Later toe te voegen als nullable kolom op `set_logs` zonder migratie-pijn.

## Expliciet buiten scope

- PDF-export (beslist: nee).
- Templates/hergebruik van schema's tussen klanten (beslist in intake: elk schema is uniek).
- Entitlement-koppeling aan PT of 12-wekentraject: Marlon bepaalt in de praktijk wie een schema krijgt.
- Video's/instructies per oefening: kolom `video_url` bestaat alvast, UI en content later.

---

## Ledger

- **PR #43 (2026-07-05, merge `a5f1064`, retroactief)**: historie en progressie (PR 5/5): `/app/schema/geschiedenis` voor het lid en de tab Historie in de admin-cockpit, beide met een grafiek (topgewicht per sessie) en een tabel met alle sets per oefening. Nog geen ledger-conventie op dat moment, vandaar deze regel achteraf. Bewust niet aangeraakt: de trainer-klantpagina (kreeg toen geen historie) en weergave 3 (per workout), die kwamen pas met de PR hieronder.
- **PR #287 (2026-10-13, merge `2832ff1`)**: tempo X en 0 gescheiden (X opgeslagen als `-1`, `TEMPO_EXPLOSIVE` in `src/lib/training-tempo.ts`) en slots verruimd tot A1 t/m G2 (max 14 per dag) via `src/lib/training-slots.ts`; migratie `20261013120000` zet de tempo-checks op `>= -1`, de slot-check op `^[A-G][12]$` en converteert bestaande nullen in excentrisch en concentrisch naar -1. Bewust niet aangeraakt: `duplicate_training_program` en `log_set` (kopieren of lezen de kolommen zonder te rekenen), de pauzevelden bij de conversie, en `20260503`.
- **PR #289 (2026-10-13)**: hinttekst tempo, de hinttekst onder de tempovelden in `ExerciseSlotForm.tsx` zei nog "X (of 0) betekent explosief" en luidt nu "X betekent explosief, 0 betekent 0 seconden" (`// COPY: confirm met Marlon`). Overige tempo-teksten in admin, klant, workout en trainer waren al correct. Bewust niet aangeraakt: de logica en de opslag uit #287.
- **PR #322 (2026-10-27, merge `5b53eb6`)**: trainingshistorie, gedeelde leeslaag voor de drie weergaven (inline "vorige keer" op `exercise_id`, per oefening met grafiek en tabel, per workout met inklapbare sessies) in `src/lib/training-history/` en `src/components/training-history/`, nu ook op de trainer-klantpagina (verruiming van PT-agenda C4, zie die sectie hierboven). Migratie `20261027120000` voegt drie `self_logged_read`-policies toe (program_days, training_programs, program_exercises), verruimt `exercises_member_read` naar ooit gelogde oefeningen, en voegt de security-invoker view `tmc.set_log_history` plus twee indexen op `workout_sessions` toe. Geen `SECURITY DEFINER`. Vervangt `src/lib/member/training-history-query.ts`, `src/lib/admin/training-history-query.ts` en `loadPreviousSetLogs` (matchte nog op `program_exercise_id`). Bewust niet aangeraakt: `log_set`/`start_workout_session`/`complete_workout_session` zelf, de workout-logging-flow (alleen de "vorige keer"-referentie binnenin verandert van bron), en `program_exercises_self_logged_read` dekt bewust alleen oefeningen die ook echt gelogd zijn, niet de volledige inhoud van een oud schema (een sessie zonder gelogde sets toont daarom "Geen sets gelogd" als geheel, niet per ongelogde oefening binnen een verder gevulde sessie).
- **PR #323 (2026-10-27, merge `c4ff926`)**: autosave in de workout-logger (fix/workout-logging). Gewicht en reps zijn tekstvelden met eigen parsing (`src/lib/member/workout-input.ts`, komma en punt, gewicht 0 = lichaamsgewicht, reps vanaf 1), geen "Log set"-knop meer: opslaan 600ms na de laatste toets of bij blur, beide velden leeg op een opgeslagen rij verwijdert de set via de nieuwe RPC `tmc.delete_set_log` (migratie `20261027150000`, SECURITY DEFINER met `search_path = ''`, EXECUTE alleen authenticated), afronden flusht en wacht alle saves af en bevestigt apart bij nul sets, try/catch op alle aanroepen met sessionStorage-concept per sessie en een banner bij een verouderde deployment. Herstelt ook de bug dat gewicht 0 door `!row?.weightKg` nooit gelogd kon worden. Unit tests in `scripts/workout-logging/`. Bewust niet aangeraakt: `log_set`, `start_workout_session` en `complete_workout_session` zelf, de gate dat invoerrijen pas na "Start workout" bestaan, de cron cleanup-workout-sessions, en de "vorige keer"-referentie uit #322.
- **PR #328 (2026-10-31)**: vorige waarden in de workout-logger (feat/schema-vorige-waarden). Ghost values per set uit de meest recente sessie met minstens een afgevinkte set (of het startgewicht van de coach), een vinkje per set dat de waarden overneemt en `completed_at` zet, een inline editor per type materiaal (barbell met schijvenberekening, dumbbell, kettlebell-chips, machine, bodyweight alleen reps, NULL algemene stepper), label "Aangepast t.o.v. vorige keer", voortgangsbalk en "Training afronden". Migratie `20261031120000`: `exercises.equipment` en `weight_step_kg` met initiele indeling op naam (13 oefeningen bleven NULL, zie de PR-body), `program_exercises.start_weight_kg`, `set_logs.completed_at` en `source` met backfill van de 27 bestaande rijen, `log_set` opnieuw met `p_completed` en `p_source` (oude signature gedropt, `search_path = ''`), `duplicate_training_program` kopieert `start_weight_kg`, `set_log_history` filtert op `completed_at`. Nieuw: `src/lib/equipment.ts`, `src/lib/member/workout-ghost.ts`, `src/lib/member/workout-rows.ts`, `SetRow`, `SetEditor`, `WorkoutProgressBar`; admin krijgt type materiaal, stapgrootte en startgewicht. Bewust niet aangeraakt: `start_workout_session`, `complete_workout_session` en `delete_set_log`, de cron cleanup-workout-sessions, de historiecomponenten zelf (alleen hun bron verandert), seconden als eenheid voor isometrische oefeningen, en `20260503`.
- **PR #330 (2026-10-31)**: reps-stepper op 390px (fix/workout-reps-stepper). Gevonden bij de browsercheck van #328: het reps-invoerveld in `SetEditor.tsx` had `flex-1` zonder vaste breedte, waardoor de min-knop een streepje werd en de plus-knop buiten beeld viel. Nu dezelfde opbouw als het gewichtveld (`w-24 min-w-0` in een `flex-1` wrapper) en `shrink-0` op de stepperknoppen. Bewust niet aangeraakt: de rijlogica, de autosave en alle andere componenten.
