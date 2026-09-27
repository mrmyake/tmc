# Gemeenschappelijke omgeving voor de bash-scripts van de verhuizing.
# Gebruik: source "$(dirname "$0")/lib/env.sh" <app>   (app = montagebaas | tvmuur)
#
# Regels:
# - Credentials komen uitsluitend uit .env.local in de repo-root en worden nooit geprint.
# - Het gedeelde project (SHARED_REF) is alleen-lezen. Elke schrijvende stap loopt
#   door guard_target, die afbreekt zodra de doel-URL het gedeelde project raakt of
#   niet exact de verwachte nieuwe ref is.

set -euo pipefail

PG_BIN="/opt/homebrew/opt/postgresql@17/bin"
PG_DUMP="$PG_BIN/pg_dump"
PSQL="$PG_BIN/psql"
for bin in "$PG_DUMP" "$PSQL"; do
  [[ -x "$bin" ]] || { echo "ontbreekt: $bin (brew install postgresql@17)" >&2; exit 1; }
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$SCRIPT_DIR/out"
mkdir -p "$OUT_DIR"

ENV_FILE="$REPO_ROOT/.env.local"
[[ -f "$ENV_FILE" ]] || { echo "geen $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

SHARED_REF="xoivleieyfcxcfawgveh"

APP="${1:-}"
[[ -n "$APP" ]] || { echo "gebruik: $0 <montagebaas|tvmuur>" >&2; exit 1; }

app_json() { node -e '
  const apps = require(process.argv[1]); const a = apps[process.argv[2]];
  if (!a) { console.error("onbekende app: " + process.argv[2]); process.exit(1); }
  const v = a[process.argv[3]];
  if (Array.isArray(v)) console.log(v.join("\n")); else console.log(v ?? "");
' "$SCRIPT_DIR/apps.json" "$APP" "$1"; }

ENV_PREFIX="$(app_json envPrefix)"
EXPECTED_REF="$(app_json ref)"
[[ -n "$ENV_PREFIX" && -n "$EXPECTED_REF" ]] || { echo "app-config onvolledig" >&2; exit 1; }

SOURCE_DB_URL="${SHARED_DB_URL:-}"
TARGET_DB_URL_VAR="${ENV_PREFIX}_DB_URL"
TARGET_REST_URL_VAR="${ENV_PREFIX}_SUPABASE_URL"
TARGET_DB_URL="${!TARGET_DB_URL_VAR:-}"
TARGET_REST_URL="${!TARGET_REST_URL_VAR:-}"

[[ -n "$SOURCE_DB_URL" ]] || { echo "SHARED_DB_URL ontbreekt in .env.local" >&2; exit 1; }
[[ -n "$TARGET_DB_URL" ]] || { echo "$TARGET_DB_URL_VAR ontbreekt in .env.local" >&2; exit 1; }
[[ -n "$TARGET_REST_URL" ]] || { echo "$TARGET_REST_URL_VAR ontbreekt in .env.local" >&2; exit 1; }

# De bron moet het gedeelde project zijn; alleen lezen.
[[ "$SOURCE_DB_URL" == *"$SHARED_REF"* ]] || { echo "SHARED_DB_URL wijst niet naar $SHARED_REF" >&2; exit 1; }

ref_from_db_url() {
  local u="$1"
  if [[ "$u" =~ postgres\.([a-z]{20})[:@] ]]; then echo "${BASH_REMATCH[1]}"; return; fi
  if [[ "$u" =~ db\.([a-z]{20})\.supabase\.co ]]; then echo "${BASH_REMATCH[1]}"; return; fi
  echo ""
}

# guard_target: breekt af als het doel het gedeelde project is of niet de verwachte ref.
guard_target() {
  local db="$TARGET_DB_URL" rest="$TARGET_REST_URL"
  if [[ "$db" == *"$SHARED_REF"* || "$rest" == *"$SHARED_REF"* ]]; then
    echo "GUARD: doel bevat het gedeelde project $SHARED_REF. Stop." >&2; exit 2
  fi
  local ref; ref="$(ref_from_db_url "$db")"
  if [[ "$ref" != "$EXPECTED_REF" ]]; then
    echo "GUARD: doel-DB-ref '$ref' is niet de verwachte ref '$EXPECTED_REF'. Stop." >&2; exit 2
  fi
  if [[ "$rest" != "https://$EXPECTED_REF.supabase.co" ]]; then
    echo "GUARD: doel-REST-URL hoort https://$EXPECTED_REF.supabase.co te zijn. Stop." >&2; exit 2
  fi
  # Live check: het gedeelde project heeft schema tmc; een doelproject nooit.
  local tmc
  tmc="$("$PSQL" "$db" -Atc "select count(*) from pg_namespace where nspname = 'tmc'")"
  if [[ "$tmc" != "0" ]]; then
    echo "GUARD: doel-database bevat schema tmc; dit is niet het bedoelde nieuwe project. Stop." >&2; exit 2
  fi
  echo "guard ok: doel = $EXPECTED_REF"
}

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
