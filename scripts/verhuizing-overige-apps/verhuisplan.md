# Verhuisplan fase 0: montagebaas en tvmuur uit het gedeelde Supabase-project

Datum: 2026-09-27. Bron: `xoivleieyfcxcfawgveh` (org The Movement Club, eu-central-1, PostgreSQL 17.6, platform 17.6.1.104). Alles in dit document is read-only vastgesteld: catalogusqueries via MCP, Management API GET's, git en Vercel-metadata. Er is niets geschreven naar het gedeelde project.

Doelen:

| App | Nieuw project | Organisatie | Regio | Postgres | Staat |
|---|---|---|---|---|---|
| montagebaas | `vqhdxylnlduugrfjdrfz` | Montagebaas (`tbsqpwttxaopdmstyomn`) | eu-central-1 | 17.6 (17.6.1.166) | leeg: geen tabellen in `public`, geen buckets, geen storage-policies |
| tvmuur | `ofmvajrmzckgxzjfwyoo` | TVmuur (`eexhvapaykiibmyvkzuw`) | eu-west-1 | 17.6 (17.6.1.166) | leeg, idem |

Beide nieuwe projecten hebben dezelfde vijf extensies als het gedeelde project (`plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto` in `extensions`, `supabase_vault`), dezelfde rollen, PostgREST op `public,graphql_public`, extra search path `public, extensions`, max rows 1000. Er bestaat nog geen `supabase_migrations`-schema. tvmuur verhuist van Frankfurt naar Ierland; de Vercel-functies draaien in Frankfurt (regio ongewijzigd), dus reken op een paar ms extra per query.

Het gedeelde project heeft als exposed schemas `public,graphql_public,tvmuur,tmc,tmm,montagebaas`, extra search path `public,extensions`, max rows 1000.

## A. montagebaas

### A1. Wat verhuist

Schema `montagebaas` (eigenaar `postgres`), volledig. Geen enkel object hangt aan een extensie.

Tabellen (rijen op 2026-09-27, met `pg_stat_user_tables`):

| Tabel | Rijen | ins/upd/del sinds stats-reset | RLS |
|---|---|---|---|
| `aanvragen` | 48 | 59 / 128 / 11 | aan, geen policy |
| `lead_status_log` | 58 | 59 / 0 / 0 | aan, geen policy |
| `steden` | 16 | 16 / 0 / 0 | aan, policy `steden_public_read` (SELECT voor anon, authenticated) |
| `tarieven` | 1 | 1 / 0 / 0 | aan, geen policy |
| `advertentiekosten` | 0 | 0 / 0 / 0 | aan, geen policy |

Views: `lead_overzicht`, `roi_per_maand`, `ads_offline_conversies` (alle drie alleen over `montagebaas.*`).
Functie: `montagebaas.log_lead_status()` (plpgsql, trigger, schrijft in `montagebaas.lead_status_log`; md5 van de definitie `bced89a8…`).
Trigger: `aanvragen_lead_status_log` BEFORE UPDATE ON `aanvragen`.
Types: enums `lead_bron` (website, werkspot, doorverwijzing, overig) en `lead_status` (nieuw, contact_gelegd, offerte_verstuurd, wacht_op_klant, gewonnen, uitgevoerd, verloren, geen_reactie, niet_passend).
Sequences: `lead_status_log_id_seq` (last_value 59), `advertentiekosten_id_seq` (nooit gebruikt).
Constraints: 9 (5 PK's, FK `aanvragen.tarieven_id -> tarieven`, FK `lead_status_log.aanvraag_id -> aanvragen` ON DELETE CASCADE, unique `advertentiekosten(maand,kanaal,campagne)`, check `aanvragen_bedrag_past_bij_status`).
Indexes: 15 (inclusief PK-indexes).
Grants: schema USAGE voor anon, authenticated, service_role; tabelrechten alleen voor service_role (aanvragen/steden/tarieven/advertentiekosten: SELECT, INSERT, UPDATE, DELETE; lead_status_log: SELECT, INSERT; views: SELECT); `steden` daarnaast SELECT voor anon en authenticated; USAGE op beide sequences voor service_role. Geen default privileges op het schema.

Extensies die de app nodig heeft: alleen `pgcrypto`/`uuid-ossp` voor `gen_random_uuid()`-defaults, en die staan al in het nieuwe project.
Cron-jobs, Edge Functions, database-webhooks, realtime-publicaties, Vault-secrets: geen (pg_cron/pg_net afwezig, 0 Edge Functions, publicatie `supabase_realtime` bevat geen tabellen, `vault.secrets` is leeg).

Storage: bucket `offerte-tekeningen`, privé, `file_size_limit` 8388608, `allowed_mime_types` [application/pdf, image/png, image/jpeg]. 64 objecten, 50.879.573 bytes, grootste 2,7 MB, alle direct onder `aanvragen/`, mimetypes pdf/jpeg/png, geen owner, geen user_metadata. Geen storage-policies (alle toegang via service role). `aanvragen.tekening_pad` is een JSON-array van bucket-relatieve paden (`["aanvragen/<uuid>-bestand.pdf", …]`): 58 elementen, alle 58 bestaan in storage; 6 objecten horen bij geen enkele aanvraag meer (11 aanvragen zijn ooit verwijderd). Alle 64 gaan mee met ongewijzigde paden.

### A2. Schrijfactiviteit

Ja, de app schrijft nog: laatste `aanvragen`-rij 2026-09-26 19:09 UTC, laatste `lead_status_log` 2026-09-25 07:56, laatste storage-upload 2026-09-24 13:02. Aanvragen komen dagelijks tot wekelijks binnen via het publieke formulier, statuswijzigingen via `/admin/leads`.

Voorstel omschakeling: geen lange freeze, wel een korte her-sync.
1. Ilja gebruikt `/admin` niet tijdens het venster (dat is de enige menselijke schrijver).
2. Kopie + verify draaien (data is klein: hele kopie duurt onder een minuut, storage-kopie is idempotent en slaat al aanwezige objecten met gelijke grootte over).
3. Direct daarna: Vercel-env omzetten en de PR mergen (redeploy 1 tot 2 minuten). Het publieke formulier kan in dat venster nog een aanvraag in het oude project zetten.
4. Na de deploy: delta-check op het gedeelde project (`max(created_at)` van `aanvragen`, `lead_status_log` en storage-objecten na het kopie-tijdstip, plus `pg_stat_user_tables.n_tup_ins`). Zijn er rijen: die worden met het delta-script (alleen rijen en objecten nieuwer dan het kopie-tijdstip, geen truncate) nagestuurd. Verwacht: nul.
Beste moment: 's avonds laat, dan is de kans op een aanvraag in het venster het kleinst.

### A3. Repo

`/Users/ilja/Projects/montagebaas`, remote `https://github.com/mrmyake/montagebaas.git`, branch `main` op `4a66ddf` (schoon op 2 untracked bestanden: `docs/OFFERTEKETEN-VOORSTEL.md`, `tools/`). Productie op Vercel (project `montagebaas`, `prj_WtzbbueLEHyDbs2FiSa7qeSLKfd2`) draait `4a66ddf`.

Plekken met ref, URL, keys, env-varnamen of schema-instelling:

| Bestand:regel | Wat |
|---|---|
| `src/lib/supabase.ts:17-19` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DB_SCHEMA ?? "montagebaas"` |
| `src/lib/supabase.ts:6-10, 27` | commentaar "gedeeld project", "Exposed schemas"; `SUPABASE_SERVICE_ROLE_KEY` |
| `src/app/api/offerte-upload/route.ts:18`, `src/lib/tekening-lezer.ts:18`, `src/lib/notify.ts:263,266` | bucketnaam `offerte-tekeningen` (blijft gelijk) |
| `scripts/verify-db.mjs:33, 48-49` | `DATABASE_URL` (pg), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DB_SCHEMA` |
| `scripts/run-migration.mjs:18-19`, `scripts/seed-steden.mjs:20` | `DATABASE_URL` |
| `.env.local.example:3, 5-11` | tekst "GEDEELD project (zelfde waarden als tvmuur/klimaatbaas)", `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`, anon key, service key, `DB_SCHEMA=montagebaas` |
| `docs/SETUP.md:6-13, 23` | "gedeeld project", instructie exposed schemas "naast public, tvmuur" |
| `.env.local` (gitignored) | oude ref in `NEXT_PUBLIC_SUPABASE_URL` en `DATABASE_URL` (session pooler `postgres.<ref>@aws-1-eu-central-1.pooler.supabase.com:5432`) |
| `Import.env` (gitignored) | oude ref |

Niet aanwezig: `supabase/config.toml`, type-generatie (`src/lib/db.types.ts` is handgeschreven), CSP-headers, `images.remotePatterns`. Migraties `supabase/migrations/0001` t/m `0006` worden door de eigen runner (`scripts/run-migration.mjs` op `DATABASE_URL`) toegepast, niet door de Supabase CLI; alleen `0006` staat in de Supabase-history van het gedeelde project.

Vercel env vars om te wijzigen (alle Sensitive, elk één variabele met targets production + preview; geen development-target):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
Ongewijzigd: `DB_SCHEMA` (blijft `montagebaas`). Er staat geen `DATABASE_URL` in Vercel; die is alleen lokaal voor de scripts.

### A4. Versies

Oud 17.6 (aarch64), nieuw 17.6 (aarch64). Lokaal zijn `pg_dump`, `psql` en `pg_restore` niet geïnstalleerd (geen Homebrew-formula, wel Homebrew 7.0.4 en Docker 29.8). Opties: `brew install postgresql@17` (17.11, exact dezelfde major) of `brew install libpq` (18.6; pg_dump 18 dumpt een 17-server zonder problemen, maar 17 is de veilige keuze). Supabase CLI 2.116.0 aanwezig (`supabase db dump` gebruikt intern een Docker-image met pg_dump en kan als alternatief dienen, maar geeft minder controle over de objectselectie).

### A5. Handmatig in het nieuwe project (Ilja)

- API: exposed schemas `public, graphql_public, montagebaas` (nu `public,graphql_public`). Zonder deze stap geeft PostgREST "Invalid schema".
- Extra search path: `public, extensions` laten staan.
- Max rows: 1000 laten staan (zelfde als oud).
- Storage-bucket: niets handmatig, het script maakt de bucket met dezelfde instellingen.
- Auth: niets (app gebruikt geen Supabase Auth).
- Vercel: de drie variabelen uit A3, in production en preview.

### A6. Welke env vars echt nodig zijn

Voor de scripts: `SHARED_DB_URL` (lezen: pg_dump + catalogusqueries), `MONTAGEBAAS_DB_URL` (schrijven), `SHARED_SERVICE_ROLE_KEY` (storage lezen via de Storage API), `MONTAGEBAAS_SERVICE_ROLE_KEY` (storage schrijven). De REST-URL is `https://<ref>.supabase.co` en volgt uit de ref. Zie de opmerking over `.env.local` onder "Vragen".

## B. tvmuur

### B1. Wat verhuist: de objecten in `public`, met bewijs

Productie draait commit `67fa13d` (Vercel-deployment `dpl_3dBZ1KQM…`, 2026-06-05). Die code maakt een supabase-js client zonder `db.schema` (`src/lib/supabase.ts`), dus tegen `public`, en gebruikt de buckets `gallery` (`src/app/admin/photo-actions.ts:10`, `video-actions.ts:14`, `actions.ts:91-103`, `src/lib/projects.ts:40`), `cinewall-previews` (`src/app/api/generate-preview/route.ts:52,62`) en impliciet `lead-photos` (leeg). In Vercel bestaan geen `DB_SCHEMA` en geen `DATABASE_URL`, dus de Lucia/`tvmuur`-schema-variant is nooit gedeployd.

Alle objecten in `public` zijn van tvmuur; er staat niets anders in `public`:

| Object | Soort | Bewijs |
|---|---|---|
| `public.leads` (8 rijen; stats 26/2/18) | tabel | kolommen `pad`, `tv_maat`, `haard_klein`, `akupanelen`, `soundbar`; migratie `20260503_leads_v2_pad_aware.sql` in de tvmuur-repo; nieuwste lead 2026-09-06 staat alleen hier |
| `public.offertes` (4; 5/18/0) | tabel | `20260517_offertes*.sql` in de tvmuur-repo; FK naar `leads` |
| `public.projects` (16; 16/87/0) | tabel | `20260503_gallery.sql`; hourly REST-reads door de site |
| `public.project_photos` (40; 42/17/2) | tabel | idem; paden wijzen naar bucket `gallery` |
| `public.set_offerte_updated_at()` | functie | `20260517_offertes.sql`; alleen gebruikt door de trigger hieronder |
| `offertes_updated_at` BEFORE UPDATE ON `offertes` | trigger | idem |
| policies `Public select published projects`, `Public select photos of published projects`, `service role full access on offertes` | 3 policies | `20260503_gallery.sql`, `20260517_offertes.sql` |
| 17 indexes, 10 constraints (4 PK, 2 FK met CASCADE, 3 unique, 1 check op `leads.pad`) | | uit dezelfde migraties |

Eigenaar van alles: `postgres`. Geen object in `public` hangt aan een extensie. Geen sequences, geen eigen types, geen views in `public`. Niet toewijsbaar: niets.

Wat in `public` niet van tvmuur is en niet verhuist: alleen platform-defaults, namelijk de `ALTER DEFAULT PRIVILEGES` van `postgres` en `supabase_admin` voor anon/authenticated/service_role en de schema-grants. Die bestaan in het nieuwe project al identiek. De tabelgrants op de vier tabellen (volledige rechten voor anon, authenticated, service_role) komen uit diezelfde default privileges en ontstaan in het nieuwe project vanzelf bij het aanmaken; het verify-script controleert dat.

Grants: schema `public` USAGE voor anon, authenticated, service_role (platform). Tabellen: alle privileges voor anon, authenticated, service_role, postgres (platform-default). RLS aan op alle vier; `leads` zonder policy (alleen service role), `offertes` via `auth.role() = 'service_role'`, `projects`/`project_photos` publiek leesbaar indien `published`.

Extensies: alleen `pgcrypto` voor uuid-defaults, aanwezig. Cron, Edge Functions, webhooks, realtime, Vault: geen.

Storage (de originelen, niet de `tvmuur-*`-kopieën):

| Bucket | Publiek | Objecten | Bytes | Grootste | Mimetypes | Policy |
|---|---|---|---|---|---|---|
| `gallery` | ja | 81 | 15.153.152 | 6,0 MB | image/webp, video/mp4 | `Public read gallery` (SELECT op storage.objects, `bucket_id = 'gallery'`) |
| `cinewall-previews` | ja | 70 | 139.678.732 | 2,3 MB | image/png | `Public read cinewall-previews` |
| `lead-photos` | nee | 0 | 0 | | | geen |

Geen `file_size_limit`, geen `allowed_mime_types`, geen owner/user_metadata op objecten. Objectnamen in `gallery` zijn `<project-slug>/<bestand>`, in `cinewall-previews` `<uuid>.png`. De pad-kolommen (`projects.video_path`, `project_photos.thumb_path`/`large_path`, `leads.preview_url`, `leads.*_fotos`) bevatten geen volledige URL's en niet de oude host; de site bouwt de URL uit `NEXT_PUBLIC_SUPABASE_URL` (`src/lib/projects.ts:42-45`).

Verhuist niet: schema `tvmuur` (8 tabellen, kopie van 2026-06-04), buckets `tvmuur-gallery`, `tvmuur-cinewall-previews`, `tvmuur-lead-photos`, schema `tmm`.

### B2. Schrijfactiviteit

Laag. Laatste lead 2026-09-06 17:42 (formulier, service role), laatste offerte-update 2026-05-18, laatste galerij-wijziging 2026-05-17, laatste storage-upload 2026-05-17. Leesactiviteit: elk uur `projects` + `project_photos` (ISR) en afbeeldingen uit `gallery`. Voorstel: dezelfde korte her-sync-aanpak als montagebaas, zonder aparte freeze; Ilja logt tijdens het venster niet in op `/admin`. Delta-check na de deploy op `leads`, `offertes` en de drie buckets.

### B3. Repo

`/Users/ilja/Projects/tvmuur`, remote `https://github.com/mrmyake/tvmuur.git`, branch `main` op `67fa13d` (= productie). De working tree is vuil: 14 gewijzigde en 7 untracked bestanden, het niet-afgemaakte Lucia/`DB_SCHEMA=tvmuur`-werk van juni (`src/lib/supabase.ts`, `proxy.ts`, `src/lib/db.ts`, `src/lib/lucia.ts`, `.env.example`, `package.json` enz.). Dat werk is nooit gecommit of gedeployd. Ik raak het niet aan en maak de feature-branch in een eigen worktree vanaf `origin/main`.

Plekken met ref, URL, keys, env-varnamen of schema-instelling (gecommitte code):

| Bestand:regel | Wat |
|---|---|
| `supabase/.temp/project-ref:1`, `supabase/.temp/linked-project.json:1`, `supabase/.temp/pooler-url:1` | oude ref en pooler-host, getrackt in git (CLI-cache die nooit in `.gitignore` is gezet) |
| `src/lib/supabase.ts:6-7, 14-15` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; geen schema-instelling (= `public`) |
| `src/app/api/generate-preview/route.ts:44-45, 52, 62` | URL + service key, bucket `cinewall-previews` |
| `src/lib/projects.ts:40-45` | `STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/gallery/"`, URL uit env |
| `src/app/admin/photo-actions.ts:10`, `video-actions.ts:14`, `actions.ts:91-103` | bucket `gallery` |
| `next.config.ts:3-9, 24-32` | `images.remotePatterns` afgeleid uit `NEXT_PUBLIC_SUPABASE_URL` (geen hardcoded host) |
| `.env.example:22-24` | generieke placeholders (`xxxxxxxx.supabase.co`, `sb_publishable_…`, `sb_secret_…`) |
| `supabase/migrations/20260503_gallery.sql:73-85`, `20260503_leads_v2_pad_aware.sql:64-76` | bucket- en policy-definities (blijven gelijk) |
| `.env.local` (gitignored) | oude ref in `NEXT_PUBLIC_SUPABASE_URL` en `DATABASE_URL` (placeholder-wachtwoord) |

Niet aanwezig: `supabase/config.toml`, type-generatie, CSP. Bucketnamen en schema blijven gelijk, dus de codewijziging in de PR is klein: `supabase/.temp/*` uit git halen en in `.gitignore` zetten (of de ref bijwerken), plus documentatie.

Vercel env vars om te wijzigen (project `tvmuur`, `prj_k0bS8Z5D1Tb60R5wbPP5XfMeChHt`; type "encrypted", niet Sensitive; elk één variabele met targets production + preview + development):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### B4. Versies

Als A4: oud 17.6 aarch64, nieuw 17.6 x86_64 (andere architectuur, geen effect op een SQL-dump).

### B5. Handmatig in het nieuwe project

- API: exposed schemas ongewijzigd laten (`public, graphql_public`); extra search path `public, extensions`; max rows 1000.
- Storage-policies `Public read gallery` en `Public read cinewall-previews`: het storage-script probeert ze via SQL aan te maken; lukt dat niet door eigenaarschap van `storage.objects`, dan via Dashboard > Storage > Policies.
- Vercel: de drie variabelen uit B3 in production, preview en development.

### B6. Env vars

Als A6, met `TVMUUR_DB_URL` en `TVMUUR_SERVICE_ROLE_KEY`.

## C. Gedeeld: scripts en werkwijze (fase 1 en 3)

- `scripts/verhuizing-overige-apps/` in de TMC-repo, branch `chore/verhuizing-overige-apps`, worktree `/Users/ilja/Projects/tmc-verhuizing-overige-apps`.
- Dump: `pg_dump --schema-only` en `--data-only` per objectlijst (montagebaas: `--schema=montagebaas`; tvmuur: `--schema=public --table=public.leads …` plus de functie), met `--no-owner`. Grants en policies zitten in de schema-dump. Laden met `session_replication_role = replica` in één transactie, daarna `setval` per sequence. Herhaalbaar: het script dropt eerst de doelobjecten (`drop schema montagebaas cascade` resp. `drop table if exists public.leads, … cascade` en de functie) en controleert vóór het droppen dat de doel-ref klopt.
- Guard in elk schrijvend script: breekt af als de doel-URL `xoivleieyfcxcfawgveh` bevat, en controleert dat de doel-ref exact de verwachte nieuwe ref is (uit de DB-URL én uit de REST-URL).
- Storage: Node-script op de Storage API (`@supabase/supabase-js`): bucket aanmaken met dezelfde `public`, `file_size_limit`, `allowed_mime_types`; objecten streamen met dezelfde `name` en `contentType`; idempotent (overslaan als het doelobject bestaat met gelijke grootte).
- Verify: rijen per tabel, sequences, md5 van `pg_get_functiondef`, `pg_policies`, grants, triggers, indexes, constraints, extensies, en per bucket aantal + bytes; diff-rapport met nul onverklaarde verschillen als doel. Verwachte verklaarde verschillen: het `postgres`-grant-blok is platform-eigen en gelijk; `pg_stat`-tellers zijn niet vergelijkbaar en worden niet vergeleken.
- Migratiehistory in de nieuwe projecten: voorstel om die leeg te laten; de dump is de baseline. montagebaas gebruikt de Supabase CLI niet voor migraties, tvmuur alleen incidenteel.

## D. Vragen aan Ilja

1. `.env.local` in de TMC-repo bevat `SHARED_DB_URL`/`MONTAGEBAAS_DB_URL`/`TVMUUR_DB_URL` met alleen de ref (geen connectiestring), `*_SUPABASE_URL` met een publishable key in plaats van een URL, en `*_SERVICE_ROLE_KEY` met een secret key. Voor pg_dump/psql zijn volledige Postgres-connectiestrings nodig (Session pooler, poort 5432, met wachtwoord) voor alle drie de projecten. Wil je die zelf invullen als `*_DB_URL`, en `*_SUPABASE_URL` op `https://<ref>.supabase.co` zetten? De publishable keys zijn voor de scripts niet nodig.
2. Mag ik `postgresql@17` via Homebrew installeren (of `libpq` 18.6)? Zonder pg_dump/psql kan fase 1 niet starten.
3. tvmuur: bevestig dat het niet-gecommitte Lucia/`tvmuur`-schema-werk in `~/Projects/tvmuur` mag blijven staan zoals het is (ik werk eromheen in een aparte worktree). Wil je dat het `tvmuur`-schema en de `tvmuur-*`-buckets bij de latere opruiming verdwijnen, dan is dat werk daarna niet meer uitvoerbaar zonder herbouw.
4. tvmuur `supabase/.temp/*` staat in git met de oude ref. Voorkeur: uit git halen en in `.gitignore` zetten (CLI-cache hoort niet in de repo), of bijwerken naar de nieuwe ref en linken?
5. Migratiehistory in de nieuwe projecten leeg laten (dump = baseline), of wil je de repo-migraties opnieuw registreren?
6. Plan van de nieuwe organisaties: gratis of Pro? Op gratis pauzeert montagebaas na 7 dagen zonder verkeer; een keepalive (Vercel Cron die `steden` leest) voorkomt dat. Nog niet ingebouwd.
7. Storage-policies op `storage.objects` in het nieuwe TVmuur-project: mag het script die via SQL aanmaken, of zet je ze liever zelf in het dashboard?
8. Tijdstip omschakeling montagebaas: 's avonds laat op een dag dat je `/admin` niet gebruikt.
