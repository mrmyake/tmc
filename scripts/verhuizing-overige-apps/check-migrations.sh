#!/usr/bin/env bash
# Controleert of de gecommitte repo-migraties van een app hetzelfde schema opleveren
# als de live dump uit het gedeelde project. Speelt de migraties af op een tijdelijke
# Postgres 17 in Docker (met stubs voor de Supabase-rollen, storage.buckets/objects
# en auth.role()) en draait daarna verify.mjs --schema-only tegen die scratch-database.
#   ./check-migrations.sh montagebaas
# Raakt het gedeelde project alleen lezend (via verify.mjs) en het doelproject niet.

cd "$(dirname "$0")"
# shellcheck disable=SC1091
source ./lib/env.sh "${1:-}"

REPO="$(app_json repo)"
MIGDIR="$(app_json migrationsDir)"
VERSIONS=(); while IFS= read -r l; do [[ -n "$l" ]] && VERSIONS+=("$l"); done < <(app_json migrationVersions)
[[ -d "$REPO/$MIGDIR" ]] || { echo "geen migratiemap $REPO/$MIGDIR" >&2; exit 1; }

NAME="verhuis-scratch-$APP"
PORT=55432
SCRATCH_URL="postgresql://postgres:scratch@127.0.0.1:$PORT/postgres"
cleanup() { docker rm -f "$NAME" > /dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
log "scratch Postgres 17 starten (docker $NAME)"
docker run -d --name "$NAME" -p "$PORT:5432" -e POSTGRES_PASSWORD=scratch postgres:17 > /dev/null
for _ in $(seq 1 60); do
  "$PSQL" "$SCRATCH_URL" -Atc "select 1" > /dev/null 2>&1 && break
  sleep 1
done
"$PSQL" "$SCRATCH_URL" -Atc "select version()" | sed 's/^/  /'

log "stubs: rollen, extensions, storage, auth"
"$PSQL" "$SCRATCH_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin; create role supabase_admin nologin;
create schema extensions; create extension if not exists pgcrypto schema extensions; create extension if not exists "uuid-ossp" schema extensions;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now());
create schema auth;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public to anon, authenticated, service_role;
SQL

for v in "${VERSIONS[@]}"; do
  f="$(ls "$REPO/$MIGDIR/${v}_"*.sql 2>/dev/null | head -1)"
  [[ -n "$f" ]] || { echo "geen migratiebestand voor versie $v" >&2; exit 1; }
  log "migratie $(basename "$f")"
  "$PSQL" "$SCRATCH_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

log "verify --schema-only: bron versus scratch"
node ./verify.mjs "$APP" --schema-only --target-db-url "$SCRATCH_URL"
