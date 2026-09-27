#!/usr/bin/env bash
# Registreert de gecommitte repo-migraties van een app als "applied" in de
# migratiehistorie van het NIEUWE project, zodat een toekomstige `supabase db push`
# in die repo niets opnieuw afspeelt. Pas draaien nadat check-migrations.sh en
# verify.mjs schoon zijn.
#   ./repair-migrations.sh montagebaas
# Schrijft uitsluitend naar het doelproject (guard), nooit naar het gedeelde project.

cd "$(dirname "$0")"
# shellcheck disable=SC1091
source ./lib/env.sh "${1:-}"

guard_target
VERSIONS=(); while IFS= read -r l; do [[ -n "$l" ]] && VERSIONS+=("$l"); done < <(app_json migrationVersions)
REPO="$(app_json repo)"

log "supabase migration repair --status applied: ${VERSIONS[*]} (doel $EXPECTED_REF)"
( cd "$REPO" && supabase migration repair --db-url "$TARGET_DB_URL" --status applied "${VERSIONS[@]}" )
log "migratiehistorie in het doel:"
"$PSQL" "$TARGET_DB_URL" -Atc "select version||' '||coalesce(name,'') from supabase_migrations.schema_migrations order by version" | sed 's/^/  /'
