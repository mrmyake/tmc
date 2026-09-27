#!/usr/bin/env bash
# Kopieert schema en data van de app-objecten uit het gedeelde project naar het
# nieuwe project van de app. Herhaalbaar: het doel wordt eerst leeggemaakt.
#
#   ./copy-db.sh montagebaas
#
# Stappen: guard -> baseline-snapshot van de bron (voor delta-check.mjs) ->
# pg_dump schema-only en data-only (met grants, policies, triggers, functies,
# types, views, indexes) -> doel resetten -> schema laden -> data laden onder
# session_replication_role = replica (geen triggers, geen FK-checks) ->
# sequences gelijkzetten aan de bron.
# Het gedeelde project wordt uitsluitend gelezen (pg_dump en SELECT's).

cd "$(dirname "$0")"
# shellcheck disable=SC1091
source ./lib/env.sh "${1:-}"

guard_target

DUMP_ARGS=(); while IFS= read -r l; do [[ -n "$l" ]] && DUMP_ARGS+=("$l"); done < <(app_json dumpArgs)
SCHEMAS=(); while IFS= read -r l; do [[ -n "$l" ]] && SCHEMAS+=("$l"); done < <(app_json schemas)
RESET_SQL="$(app_json resetSql)"
SCHEMA_DUMP="$OUT_DIR/$APP-schema.sql"
DATA_DUMP="$OUT_DIR/$APP-data.sql"
SCHEMAS_SQL="array[$(printf "'%s'," "${SCHEMAS[@]}" | sed 's/,$//')]::text[]"

log "baseline-snapshot van de bron -> out/$APP-baseline.json"
node ./snapshot.mjs "$APP" source "$OUT_DIR/$APP-baseline.json" > /dev/null
COPY_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

log "pg_dump schema-only ($("$PG_DUMP" --version))"
"$PG_DUMP" "$SOURCE_DB_URL" --schema-only --no-owner "${DUMP_ARGS[@]}" -f "$SCHEMA_DUMP"
log "pg_dump data-only"
"$PG_DUMP" "$SOURCE_DB_URL" --data-only --no-owner "${DUMP_ARGS[@]}" -f "$DATA_DUMP"
log "dumps: $(wc -l < "$SCHEMA_DUMP") regels schema, $(wc -l < "$DATA_DUMP") regels data"

log "doel resetten"
"$PSQL" "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -1 -q -c "$RESET_SQL"

log "schema laden"
"$PSQL" "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -1 -q -f "$SCHEMA_DUMP" > "$OUT_DIR/$APP-schema.log" 2>&1

log "data laden (session_replication_role = replica, een transactie)"
"$PSQL" "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -1 -q \
  -c "set session_replication_role = replica" \
  -f "$DATA_DUMP" > "$OUT_DIR/$APP-data.log" 2>&1

log "sequences gelijkzetten"
while IFS='|' read -r seq last called; do
  [[ -n "$seq" ]] || continue
  if [[ "$last" == "" ]]; then
    "$PSQL" "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select setval('$seq', 1, false)" > /dev/null
    log "  $seq -> niet aangeroepen (start op 1)"
  else
    "$PSQL" "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select setval('$seq', $last, $called)" > /dev/null
    log "  $seq -> $last (is_called=$called)"
  fi
done < <("$PSQL" "$SOURCE_DB_URL" -Atq -c "
  select quote_ident(schemaname)||'.'||quote_ident(sequencename), coalesce(last_value::text, ''), (last_value is not null)::text
  from pg_sequences where schemaname = any($SCHEMAS_SQL) order by 1")

cat > "$OUT_DIR/$APP-copy.json" <<EOF
{ "app": "$APP", "target": "$EXPECTED_REF", "copyStartedAt": "$COPY_STARTED_AT", "copyFinishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" }
EOF
log "klaar: kopie van $APP naar $EXPECTED_REF (gestart $COPY_STARTED_AT)"
