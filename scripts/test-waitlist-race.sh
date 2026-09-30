#!/usr/bin/env bash
# Race-tests voor feat/waitlist-and-cron-frequency (testplan punt 3): echte
# psql-verbindingen die tegelijk boeken, inschrijven en promoveren. Alleen
# tegen een LOKALE database (supabase start in de worktree), nooit tegen
# productie.
#
# Gebruik:
#   scripts/test-waitlist-race.sh <supabase_db_container>
#
# De fixtures moeten gecommit zijn (een tweede verbinding ziet geen
# ongecommitte rijen); ze worden aan het eind altijd opgeruimd.
set -euo pipefail

C="${1:?geef de naam van de lokale db-container}"
psql_c() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

cleanup() {
  psql_c <<'SQL' >/dev/null
delete from tmc.class_sessions where id::text like 'd9000000-%';
delete from tmc.class_types where id::text like 'c9000000-%';
delete from tmc.trainers where id::text like 'b9000000-%';
delete from auth.users where id::text like 'a9000000-%';
SQL
}
trap cleanup EXIT

psql_c <<'SQL' >/dev/null
insert into tmc.class_pillars (code, name_nl, age_category, display_order)
values ('yoga_mobility', 'Yoga & Mobility', 'adult', 997) on conflict (code) do nothing;
insert into tmc.booking_settings (id) values ('singleton') on conflict (id) do nothing;
update tmc.booking_settings set booking_window_days = 28, waitlist_confirmation_minutes = 30;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('a9000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'wlr-' || n || '@test.invalid', '{"provider":"email","providers":["email"]}',
       json_build_object('first_name', 'Race' || n, 'last_name', 'Test')::jsonb, now(), now()
from generate_series(1, 12) as n;
insert into tmc.memberships (profile_id, plan_type, price_per_cycle_cents, start_date, commit_end_date, status, age_category)
select ('a9000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'all_inclusive', 10000, current_date - 30, current_date + 365, 'active', 'adult'
from generate_series(1, 12) as n;
insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000012', 'WLR Trainer', 'wlr-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity)
values ('c9000000-0000-4000-8000-000000000001', 'wlr-yoga', 'WLR yoga', 'yoga_mobility', 'adult', 2);
-- Vier lessen op D+4 (18:00, 19:00, 20:00, 21:00), capaciteit 2, 2, 1, 1.
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
select ('d9000000-0000-4000-8000-00000000000' || n)::uuid, 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001',
       'yoga_mobility', 'adult', t, t + interval '1 hour', case when n <= 2 then 2 else 1 end, 'scheduled', t
from (select n, ((current_date + 4)::text || ' ' || (17 + n) || ':00')::timestamp at time zone 'Europe/Amsterdam' as t
      from generate_series(1, 4) as n) s;
SQL

# SQL die lid n als authenticated een RPC laat aanroepen.
as_member() {
  local n="$1" sql="$2"
  cat <<SQL
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'a9000000-0000-4000-8000-0000000000$(printf %02d "$n")', 'role', 'authenticated')::text, false);
$sql
SQL
}
S1='d9000000-0000-4000-8000-000000000001'
S2='d9000000-0000-4000-8000-000000000002'
S3='d9000000-0000-4000-8000-000000000003'
S4='d9000000-0000-4000-8000-000000000004'
book_sql() { as_member "$1" "select tmc.book_class_session('$2') ->> 'reason';"; }
join_sql() { as_member "$1" "select tmc.join_waitlist('$2') ->> 'position';"; }

fail() { echo "FAIL $*"; exit 1; }
TMP=$(mktemp -d)

# --- Scenario A: boeken tegen boeken op de laatste plek (S1, cap 2, lid 1
# al geboekt). Verbinding 1 houdt de transactie 3 seconden open; verbinding 2
# moet wachten op de sessie-lock en daarna capacity_full krijgen.
book_sql 1 "$S1" | psql_c >/dev/null
( { echo "begin;"; book_sql 2 "$S1"; echo "select pg_sleep(3); commit;"; } | psql_c > "$TMP/a1.out" ) &
P1=$!
sleep 1
T0=$(date +%s)
R2=$( { echo "begin;"; book_sql 3 "$S1"; echo "commit;"; } | psql_c | tail -1)
T1=$(date +%s)
wait $P1
R1=$(grep -v '^$' "$TMP/a1.out" | sed -n 2p)
[ -z "$R1" ] || fail "A: verbinding 1 had moeten slagen, reason=$R1"
[ "$R2" = "capacity_full" ] || fail "A: verbinding 2 gaf '$R2' in plaats van capacity_full"
[ $((T1 - T0)) -ge 1 ] || fail "A: verbinding 2 wachtte niet op de lock"
echo "PASS A: boeken tegen boeken, tweede verbinding wachtte $((T1 - T0))s en kreeg capacity_full"

# --- Scenario B: twee gelijktijdige inschrijvingen op de volle S1: posities
# 1 en 2, nooit twee keer dezelfde.
( join_sql 4 "$S1" | psql_c | tail -1 > "$TMP/b1.out" ) &
( join_sql 5 "$S1" | psql_c | tail -1 > "$TMP/b2.out" ) &
wait
B1=$(cat "$TMP/b1.out"); B2=$(cat "$TMP/b2.out")
{ [ "$B1" = "1" ] && [ "$B2" = "2" ]; } || { [ "$B1" = "2" ] && [ "$B2" = "1" ]; } \
  || fail "B: verwacht posities 1 en 2, kreeg '$B1' en '$B2'"
N=$(psql_c -c "select count(distinct \"position\") from tmc.waitlist_entries where session_id = '$S1'")
[ "$N" = "2" ] || fail "B: posities niet uniek ($N)"
echo "PASS B: gelijktijdig inschrijven geeft posities $B1 en $B2"

# --- Scenario C: promotie tegen boeken (S3, cap 1, leeg, lid 6 wacht).
# Verbinding 1 promoveert en houdt de transactie open; verbinding 2 (lid 7)
# boekt, wacht op de lock en ziet daarna de reservering: capacity_full.
# Daarna bevestigt lid 6 wel.
psql_c <<SQL >/dev/null
insert into tmc.waitlist_entries (profile_id, session_id, "position")
values ('a9000000-0000-4000-8000-000000000006', '$S3', 1);
SQL
( { echo "begin; select tmc.promote_waitlist_entries() ->> 'ok'; select pg_sleep(3); commit;"; } | psql_c > "$TMP/c1.out" ) &
P1=$!
sleep 1
T0=$(date +%s)
R2=$( { echo "begin;"; book_sql 7 "$S3"; echo "commit;"; } | psql_c | tail -1)
T1=$(date +%s)
wait $P1
[ "$(grep -v '^$' "$TMP/c1.out" | head -1)" = "true" ] || fail "C: promotie faalde: $(cat "$TMP/c1.out")"
[ "$R2" = "capacity_full" ] || fail "C: verbinding 2 gaf '$R2' in plaats van capacity_full"
[ $((T1 - T0)) -ge 1 ] || fail "C: verbinding 2 wachtte niet op de lock"
R6=$(book_sql 6 "$S3" | psql_c | tail -1)
[ -z "$R6" ] || fail "C: gepromoveerd lid kon niet bevestigen, reason=$R6"
CONF=$(psql_c -c "select count(*) from tmc.waitlist_entries where session_id = '$S3' and confirmed_at is not null")
[ "$CONF" = "1" ] || fail "C: entry niet bevestigd"
echo "PASS C: promotie tegen boeken, boeker wachtte $((T1 - T0))s en kreeg capacity_full; gepromoveerd lid bevestigde"

# --- Scenario D: twee promotie-runs tegelijk (S4, cap 1, leden 8 en 9
# wachten): precies een promotie, een event.
psql_c <<SQL >/dev/null
insert into tmc.waitlist_entries (profile_id, session_id, "position")
values ('a9000000-0000-4000-8000-000000000008', '$S4', 1),
       ('a9000000-0000-4000-8000-000000000009', '$S4', 2);
SQL
( echo "select jsonb_array_length(tmc.promote_waitlist_entries() -> 'promoted');" | psql_c | tail -1 > "$TMP/d1.out" ) &
( echo "select jsonb_array_length(tmc.promote_waitlist_entries() -> 'promoted');" | psql_c | tail -1 > "$TMP/d2.out" ) &
wait
D1=$(cat "$TMP/d1.out"); D2=$(cat "$TMP/d2.out")
PROM=$(psql_c -c "select count(*) from tmc.waitlist_entries where session_id = '$S4' and promoted_at is not null")
EV=$(psql_c -c "select count(*) from tmc.events where type = 'waitlist.promoted' and payload ->> 'session_id' = '$S4'")
[ "$PROM" = "1" ] || fail "D: $PROM promoties in plaats van 1 (runs: $D1 en $D2)"
[ "$EV" = "1" ] || fail "D: $EV events in plaats van 1"
[ $((D1 + D2)) -eq 1 ] || fail "D: runs rapporteerden samen $((D1 + D2)) promoties"
echo "PASS D: twee promotie-runs tegelijk, precies een promotie en een event"

rm -rf "$TMP"
echo "ALLE RACE-TESTS GESLAAGD"
