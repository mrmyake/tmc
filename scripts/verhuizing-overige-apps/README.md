# Verhuizing montagebaas en tvmuur uit het gedeelde Supabase-project

Scripts waarmee de twee andere apps uit het gedeelde project `xoivleieyfcxcfawgveh` naar een eigen project zijn verhuisd. Het verhuisplan (fase 0) staat in `verhuisplan.md`, de uitkomst per app in `verhuizing-overige-apps.md` in de repo-root.

## Regels

- Het gedeelde project wordt door elk script uitsluitend gelezen (pg_dump, SELECT, storage-downloads). Er is geen script dat er iets in schrijft.
- Elk schrijvend script begint met een guard (`guard_target` in `lib/env.sh`, `guardTarget` in `lib/common.mjs`): het stopt als de doel-URL de gedeelde ref bevat, als de ref uit de doel-DB-URL en de doel-REST-URL niet exact de verwachte nieuwe ref uit `apps.json` is, en als de doeldatabase een schema `tmc` heeft.
- Credentials staan alleen in `.env.local` in de repo-root: `SHARED_DB_URL`, `SHARED_SUPABASE_URL`, `SHARED_SERVICE_ROLE_KEY`, en per app `MONTAGEBAAS_*` en `TVMUUR_*` (DB-URL als Session-pooler-connectiestring, REST-URL `https://<ref>.supabase.co`, secret key). Scripts printen alleen refs, nooit URL's of keys.
- Dumps en rapporten landen in `out/` (gitignored; de dumps bevatten persoonsgegevens).

## Vereisten

- PostgreSQL 17 client-tools via Homebrew: `brew install postgresql@17`. De scripts gebruiken expliciet `/opt/homebrew/opt/postgresql@17/bin`.
- Node 20+ en `npm install` in deze map (`pg`, `@supabase/supabase-js`).
- Docker (alleen voor `check-migrations.sh`).
- Supabase CLI (alleen voor `repair-migrations.sh`).

## Scripts, in de volgorde van gebruik

| Script | Doet | Schrijft naar |
|---|---|---|
| `check-migrations.sh <app>` | Speelt de gecommitte repo-migraties af op een Postgres 17 in Docker en vergelijkt het resultaat schema-only met de live bron. | Docker-scratch |
| `copy-db.sh <app>` | Baseline-snapshot van de bron, `pg_dump` schema-only en data-only van de objectlijst uit `apps.json`, doel resetten, schema laden, data laden onder `session_replication_role = replica`, sequences gelijkzetten. Herhaalbaar. | doelproject |
| `copy-storage.mjs <app>` | Buckets met dezelfde instellingen, alle objecten met ongewijzigde paden en content-type, storage-policies via SQL. Idempotent. | doelproject |
| `verify.mjs <app> [--schema-only] [--target-db-url <url>]` | Diff-rapport bron versus doel: kolommen, rijen, sequences, functie-hashes, views, triggers, indexes, constraints, policies, RLS, grants, default privileges, types, extensies, buckets, objectlijst-hash, storage-policies. Exit 1 bij verschillen. Rapport in `out/<app>-verify.md`. | niets |
| `repair-migrations.sh <app>` | Registreert de repo-migraties als `applied` in de historie van het doelproject. Alleen na een schone `check-migrations.sh`. | doelproject |
| `snapshot.mjs <app> <source|target>` | Rijen, laatste tijdstempel, pg_stat-tellers en bucketstand. | niets |
| `delta-check.mjs <app>` | Na de omschakeling: vergelijkt de baseline van `copy-db.sh` met de bron van nu en meldt writes die nog in het gedeelde project zijn beland. Exit 1 bij verschillen. | niets |

`apps.json` bevat per app de doel-ref, schema's, dump-argumenten, reset-SQL, buckets, repo-pad, migratieversies en de tabellen voor de delta-check.

## Omschakeling (fase 2 en 4)

1. `./copy-db.sh <app>` en `node copy-storage.mjs <app>` opnieuw (laatste her-sync), dan `node verify.mjs <app>`: nul verschillen.
2. Ilja zet de Vercel-env-vars om en merget de PR van de app.
3. Smoke test in productie.
4. `node delta-check.mjs <app>`: nul writes in het gedeelde project sinds de her-sync. Bij verschillen: stap 1 herhalen voor de betreffende tabellen of objecten.
