# Spec: Trainingsprotocol (schema's + logging)

## Status

**DECIDED (2026-07-04), klaar als implementatieprompts, één per PR.** Alle open punten uit de intake zijn opgelost, zie decision log onderaan. Enige resterende punt is copy (routenaam en tempoweergave in begrijpelijke taal), dat volgt het standaardpatroon: tijdens implementatie draften en flaggen met `// COPY: confirm met Marlon`.

Doel: Marlon kan per klant een trainingsprotocol maken en bijhouden (het Overload-model: dagen, supersets A1/A2 t/m E1/E2, sets, rep-range, tempo, rust). De klant ziet zijn actieve schema in de app en logt per workout gewicht en reps per set. Marlon ziet de historie en stuurt bij.

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
| `slot` | text | check `slot ~ '^[A-E][12]$'`, uniek per dag; max 10 oefeningen per dag volgt hieruit vanzelf |
| `exercise_id` | uuid fk exercises | |
| `sets` | int | |
| `reps_min` / `reps_max` | int | |
| `tempo_eccentric` | int | seconden omlaag |
| `tempo_pause_bottom` | int | |
| `tempo_concentric` | int | seconden omhoog; **0 = explosief, overal getoond als "X"** (bv. "41X0"). Geldt voor elk tempo-veld, invoer in de builder accepteert zowel 0 als X |
| `tempo_pause_top` | int | |
| `rest_seconds` | int | |
| `notes` | text null | per-oefening aanwijzing van Marlon |

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
| `set_number` | int | |
| `weight_kg` | numeric(5,2) | |
| `reps` | int | |
| `notes` | text null | |

Uniek: `(session_id, program_exercise_id, set_number)`.

---

## Security (zelfde aanpak als RPC-laag PR #15)

- **Member leest** uitsluitend het eigen `active` schema (RLS: `profile_id = auth.uid() AND status = 'active'`); drafts en gearchiveerde versies zijn onzichtbaar voor de klant. Marlon ziet alle versies in de cockpit. Log-historie van de klant blijft wel volledig zichtbaar voor de klant zelf, ook als die tegen een inmiddels gearchiveerde versie is gelogd.
- **Member schrijft nooit direct** in tabellen. Sessie starten, set loggen, sessie afronden lopen via SECURITY DEFINER stored procedures met validatie (log hoort bij eigen sessie, sessie hoort bij eigen actieve programma, set_number binnen sets-range).
- **Marlon schrijft** via server actions met admin client, consistent met de rest van de cockpit. Activeren van een schema is één RPC die archiveren + activeren atomair doet.
- `exercises` is leesbaar voor ingelogde members (nodig om het schema te renderen), schrijfbaar alleen admin.

---

## Gefaseerd bouwplan (één PR per fase, elk blok standalone prompt)

### PR 1: migratie + oefeningenbibliotheek
Migratie met alle zes tabellen (logging-tabellen meteen mee, dan is het schema in één keer compleet en getest). Admin cockpit scherm "Oefeningen": lijst, toevoegen, hernoemen, deactiveren. Seed met de oefeningen uit het huidige Overload-schema.

### PR 2: programma-builder (admin)
Nieuw cockpit-scherm per klant (ingang via bestaande member-detailpagina): schema aanmaken, dagen toevoegen, oefeningen in slots plaatsen met sets/reps/tempo/rust, draft opslaan, activeren. Dupliceren-naar-nieuwe-versie knop op een actief schema. Versie-historie per klant zichtbaar voor Marlon (gearchiveerde versies read-only inzien). Tempo-invoer als 4 velden met live preview in "41X0" notatie (0 wordt als X getoond).

### PR 3: klant-view (member app, read-only)
Nieuwe route `/app/schema` (of `/app/training`, copy check): toont het actieve schema per dag, met tempo uitgeschreven in begrijpelijke taal naast de "4140" notatie (bv. "4 sec zakken, 1 sec pauze, explosief omhoog"). Geen schema = vriendelijke lege staat. `// COPY: confirm met Marlon` op alle teksten.

### PR 4: workout logging (member app)
"Start workout" op een dag → sessie-flow: per oefening per set gewicht + reps invoeren, vorige sessie als referentie ernaast ("vorige keer: 80 kg x 4"), sessie afronden. RPC-laag zoals hierboven. Afgebroken sessies (completed_at null ouder dan 24u) opruimen kan mee in een bestaande cron.

### PR 5: historie en progressie
Marlon-kant: per klant per oefening de log-historie en een simpele progressielijn (gewicht over tijd). Klant-kant: eigen historie per oefening. Query-time aggregatie volstaat op boutique-volumes, geen materialized views nodig.

Volgorde is strikt: 1 → 2 → 3 → 4 → 5. PR 3 is het eerste moment waarop een klant iets ziet; 1+2+3 samen is een bruikbare V1 (read-only), 4 maakt er de besloten V2 van.

---

## Decision log (opgelost 2026-07-04)

1. **PDF-export: nee.** Het schema leeft in de app; geen export-PR.
2. **Routenaam en tempoweergave in begrijpelijke taal: copy-beslissing voor Marlon**, tijdens implementatie draften en flaggen met `// COPY: confirm met Marlon`. Werknaam in deze spec: `/app/schema`.
3. **Explosief tempo: ja**, opslaan als 0, overal tonen als "X" (bv. "41X0"). Builder accepteert beide invoervormen.
4. **Zichtbaarheid oude versies: klant ziet alleen het actieve schema.** Marlon ziet in de cockpit de volledige versie-historie per klant. Log-historie blijft voor de klant zelf altijd zichtbaar, ook tegen gearchiveerde versies.
5. **RPE: weglaten.** Later toe te voegen als nullable kolom op `set_logs` zonder migratie-pijn.

## Expliciet buiten scope

- PDF-export (beslist: nee).
- Templates/hergebruik van schema's tussen klanten (beslist in intake: elk schema is uniek).
- Entitlement-koppeling aan PT of 12-wekentraject: Marlon bepaalt in de praktijk wie een schema krijgt.
- Video's/instructies per oefening: kolom `video_url` bestaat alvast, UI en content later.
