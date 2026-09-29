#!/usr/bin/env bash
# Race-test voor feat/vrij-trainen-slots: twee echte psql-verbindingen boeken
# tegelijk het laatste plekje in een kwartier. Alleen tegen een LOKALE
# database (supabase db start in de worktree), nooit tegen productie.
#
# Gebruik:
#   scripts/test-vrij-trainen-slots-race.sh <supabase_db_container>
#
# De fixtures moeten gecommit zijn (een tweede verbinding ziet geen
# ongecommitte rijen); ze worden aan het eind altijd opgeruimd.
set -euo pipefail

C="${1:?geef de naam van de lokale db-container}"
psql_c() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

cleanup() {
  psql_c <<'SQL' >/dev/null
delete from tmc.class_sessions where id::text like 'd8000000-%';
delete from tmc.class_types where id::text like 'c8000000-%';
delete from tmc.trainers where id::text like 'b8000000-%';
delete from auth.users where id::text like 'a8000000-%';
SQL
}
trap cleanup EXIT

psql_c <<'SQL' >/dev/null
insert into tmc.class_pillars (code, name_nl, age_category, display_order)
values ('vrij_trainen', 'Vrij Trainen', 'adult', 998) on conflict (code) do nothing;
insert into tmc.booking_settings (id) values ('singleton') on conflict (id) do nothing;
update tmc.booking_settings set vrij_trainen_max_concurrent = 5, booking_window_days = 28;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'vtr-' || n || '@test.invalid', '{"provider":"email","providers":["email"]}',
       json_build_object('first_name', 'Race' || n, 'last_name', 'Test')::jsonb, now(), now()
from generate_series(1, 19) as n;
insert into tmc.memberships (profile_id, plan_type, price_per_cycle_cents, start_date, commit_end_date, status, age_category)
select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'all_inclusive', 10000, current_date - 30, current_date + 365, 'active', 'adult'
from generate_series(1, 19) as n;
insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000019', 'VTR Trainer', 'vtr-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity)
values ('c8000000-0000-4000-8000-000000000001', 'vtr-vrij', 'VTR vrij', 'vrij_trainen', 'adult', null);
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
select 'd8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
       'vrij_trainen', 'adult', t, t + interval '14 hours', null, 'scheduled', t
from (select ((current_date + 4)::text || ' 07:00')::timestamp at time zone 'Europe/Amsterdam' as t) s;
SQL

# SQL die lid n als authenticated een slot laat boeken op dag D+4.
boek_sql() {
  local n="$1" hhmm="$2" minutes="$3"
  cat <<SQL
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'a8000000-0000-4000-8000-0000000000$(printf %02d "$n")', 'role', 'authenticated')::text, false);
select tmc.book_class_session('d8000000-0000-4000-8000-000000000001', false, false,
  ((current_date + 4)::text || ' $hhmm')::timestamp at time zone 'Europe/Amsterdam', $minutes) ->> 'reason';
SQL
}

# Vier plekken bezet op 10:00-11:00.
for n in 1 2 3 4; do boek_sql "$n" 10:00 60 | psql_c >/dev/null; done

fail() { echo "FAIL $*"; exit 1; }
TMP=$(mktemp -d)

# --- Scenario A: RPC tegen RPC. Verbinding 1 boekt het laatste plekje en
# houdt de transactie 3 seconden open; verbinding 2 moet wachten op de
# sessie-lock en daarna slot_full krijgen.
( { echo "begin;"; boek_sql 5 10:00 60; echo "select pg_sleep(3); commit;"; } | psql_c > $TMP/vts-race-a1.out ) &
P1=$!
sleep 1
T0=$(date +%s)
R2=$( { echo "begin;"; boek_sql 6 10:15 30; echo "commit;"; } | psql_c | tail -1)
T1=$(date +%s)
wait $P1
R1=$(grep -v '^$' $TMP/vts-race-a1.out | sed -n 2p)
[ -z "$R1" ] || fail "A: verbinding 1 had moeten slagen, reason=$R1"
[ "$R2" = "slot_full" ] || fail "A: verbinding 2 gaf '$R2' in plaats van slot_full"
[ $((T1 - T0)) -ge 1 ] || fail "A: verbinding 2 wachtte niet op de lock"
echo "PASS A: RPC tegen RPC, tweede verbinding wachtte $((T1 - T0))s op de sessie-lock en kreeg slot_full"

# --- Scenario B: directe inserts buiten de RPC (trigger-backstop).
insert_sql() {
  local n="$1" hhmm="$2"
  cat <<SQL
insert into tmc.bookings (profile_id, session_id, status, iso_year, iso_week, session_date, pillar, slot_start_at, slot_end_at)
select 'a8000000-0000-4000-8000-0000000000$(printf %02d "$n")', 'd8000000-0000-4000-8000-000000000001', 'booked', 2026, 1, current_date + 4, 'vrij_trainen', t, t + interval '30 minutes'
from (select ((current_date + 4)::text || ' $hhmm')::timestamp at time zone 'Europe/Amsterdam' as t) s;
SQL
}
# Vier plekken bezet op 16:00-16:30 via directe inserts (leden 7-10).
for n in 7 8 9 10; do insert_sql "$n" 16:00 | psql_c >/dev/null; done
( { echo "begin;"; insert_sql 11 16:00; echo "select pg_sleep(3); commit;"; } | psql_c > $TMP/vts-race-b1.out 2>&1 ) &
P1=$!
sleep 1
set +e
R2=$( { echo "begin;"; insert_sql 12 16:00; echo "commit;"; } | psql_c 2>&1 )
set -e
wait $P1 || fail "B: verbinding 1 faalde: $(cat $TMP/vts-race-b1.out)"
echo "$R2" | grep -q "slot_full" || fail "B: verbinding 2 gaf '$R2' in plaats van slot_full"
echo "PASS B: directe insert tegen directe insert, trigger weigert de tweede met slot_full"

# --- Scenario C: twee verbindingen tegelijk zonder vooraf bepaalde winnaar.
# Op 18:00 staan vier plekken bezet (leden 13-16); leden 17 en 18 boeken gelijktijdig.
for n in 13 14 15 16; do boek_sql "$n" 18:00 30 | psql_c >/dev/null; done
( boek_sql 17 18:00 30 | psql_c | tail -1 > $TMP/vts-race-c1.out ) &
( boek_sql 18 18:00 30 | psql_c | tail -1 > $TMP/vts-race-c2.out ) &
wait
C1=$(cat $TMP/vts-race-c1.out); C2=$(cat $TMP/vts-race-c2.out)
PEAK=$(psql_c -c "select peak from tmc.vrij_trainen_slot_peak('d8000000-0000-4000-8000-000000000001',
  ((current_date + 4)::text || ' 18:00')::timestamp at time zone 'Europe/Amsterdam',
  ((current_date + 4)::text || ' 18:30')::timestamp at time zone 'Europe/Amsterdam')")
[ "$PEAK" = "5" ] || fail "C: piek is $PEAK in plaats van 5 (c1='$C1', c2='$C2')"
{ [ -z "$C1" ] && [ "$C2" = "slot_full" ]; } || { [ "$C1" = "slot_full" ] && [ -z "$C2" ]; } \
  || fail "C: verwacht precies een winnaar, kreeg c1='$C1' c2='$C2'"
echo "PASS C: gelijktijdig boeken, precies een winnaar en piek blijft 5"

rm -rf "$TMP"
echo "ALLE RACE-TESTS GESLAAGD"
