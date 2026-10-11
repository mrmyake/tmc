#!/usr/bin/env bash
# Race-tests voor de gratis proefles in de openingsperiode (testplan e): twee
# echte psql-verbindingen roepen tmc.book_opening_trial tegelijk aan op de
# laatste gratis proefplek van een les; precies een slaagt, de ander krijgt
# trial_quota_full. Daarnaast dezelfde persoon tweemaal tegelijk (precies een
# slaagt, de ander already_used) en twee proefgasten tegelijk op het laatste
# kwartierquotum van vrij trainen. Alleen tegen een LOKALE database (supabase
# db start in de worktree), nooit tegen productie.
#
# Gebruik: scripts/test-opening-trial-race.sh <supabase_db_container>
#
# De fixtures moeten gecommit zijn (een tweede verbinding ziet geen
# ongecommitte rijen); ze worden aan het eind altijd opgeruimd.
set -euo pipefail

C="${1:?geef de naam van de lokale db-container}"
psql_c() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

cleanup() {
  psql_c <<'SQL' >/dev/null
delete from tmc.trial_bookings where email like 'otr-%@test.invalid';
delete from tmc.class_sessions where id::text like 'd7100000-%';
delete from tmc.class_types where id::text like 'c7100000-%';
delete from tmc.trainers where id::text like 'b7100000-%';
delete from auth.users where id::text like 'a7100000-%';
delete from tmc.opening_trial_attempts where ip like '203.0.113.%';
update tmc.booking_settings set free_trial_start_at = null, free_trial_end_at = null where id = 'singleton' and free_trial_start_at = timestamptz '2000-01-01';
SQL
}
trap cleanup EXIT
cleanup

psql_c <<'SQL' >/dev/null
insert into tmc.class_pillars (code, name_nl, age_category, display_order) values
  ('vrij_trainen', 'Vrij Trainen', 'adult', 998), ('yoga_mobility', 'Yoga', 'adult', 1)
on conflict (code) do nothing;
insert into tmc.booking_settings (id) values ('singleton') on conflict (id) do nothing;
-- Periode open; een herkenbare start zodat cleanup hem alleen dan terugzet.
update tmc.booking_settings set vrij_trainen_max_concurrent = 5,
  free_trial_start_at = case when free_trial_start_at is null then timestamptz '2000-01-01' else free_trial_start_at end,
  free_trial_end_at = case when free_trial_end_at is null or free_trial_end_at < now() then now() + interval '30 days' else free_trial_end_at end;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('a7100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'otr-trainer@test.invalid', '{"provider":"email","providers":["email"]}',
        '{"first_name":"Otr","last_name":"Trainer"}'::jsonb, now(), now());
insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'OTR Trainer', 'otr-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity) values
  ('c7100000-0000-4000-8000-000000000001', 'otr-yoga', 'OTR yoga', 'yoga_mobility', 'adult', 10),
  ('c7100000-0000-4000-8000-000000000002', 'otr-vrij', 'OTR vrij', 'vrij_trainen', 'adult', null);
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at) values
  ('d7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'yoga_mobility', 'adult',
   now() + interval '8 days', now() + interval '8 days 1 hour', 10, 'scheduled', now() + interval '8 days');
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
select 'd7100000-0000-4000-8000-000000000002', 'c7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000001',
       'vrij_trainen', 'adult', t, t + interval '14 hours', null, 'scheduled', t
from (select ((((current_date + 2) + ((8 - extract(isodow from (current_date + 2))::int) % 7))::text || ' 07:00')::timestamp at time zone 'Europe/Amsterdam') as t) s;
SQL

DAY=$(psql_c -c "select ((current_date + 2) + ((8 - extract(isodow from (current_date + 2))::int) % 7))::text")
S1='d7100000-0000-4000-8000-000000000001'
S2='d7100000-0000-4000-8000-000000000002'

book_sql() {
  local sid="$1" k="$2" slot="${3:-null}"
  cat <<SQL
select coalesce(tmc.book_opening_trial('$sid', 'Race $k', 'otr-$k@test.invalid', '+3161200$(printf %04d "$k")', false, $slot) ->> 'reason', 'ok');
SQL
}
slot_expr() { echo "(('$DAY $1')::timestamp at time zone 'Europe/Amsterdam')"; }

fail() { echo "FAIL $*"; exit 1; }
last() { tail -1; }
TMP=$(mktemp -d)

# --- Scenario A: laatste gratis plek van een les, twee bezoekers tegelijk.
for k in 1 2 3; do book_sql "$S1" "$k" | psql_c >/dev/null; done
( book_sql "$S1" 4 | psql_c | last > "$TMP/a1.out" ) &
( book_sql "$S1" 5 | psql_c | last > "$TMP/a2.out" ) &
wait
A1=$(cat "$TMP/a1.out"); A2=$(cat "$TMP/a2.out")
NA=$(psql_c -c "select count(*) from tmc.trial_bookings where session_id = '$S1' and source = 'opening' and status = 'paid'")
[ "$NA" = "4" ] || fail "A: $NA gratis plekken in plaats van 4 (a1='$A1', a2='$A2')"
{ [ "$A1" = "ok" ] && [ "$A2" = "trial_quota_full" ]; } || { [ "$A1" = "trial_quota_full" ] && [ "$A2" = "ok" ]; } \
  || fail "A: verwacht precies een winnaar, kreeg a1='$A1' a2='$A2'"
echo "PASS A: twee bezoekers tegelijk op de laatste gratis plek, precies een winnaar (a1='$A1', a2='$A2'), 4 gratis plekken"

# --- Scenario B: dezelfde persoon tweemaal tegelijk (twee tabbladen).
same_sql() {
  local sid="$1"
  echo "select coalesce(tmc.book_opening_trial('$sid', 'Dubbel', 'otr-dubbel@test.invalid', '+31612009999', false, null) ->> 'reason', 'ok');"
}
psql_c -c "delete from tmc.trial_bookings where session_id = '$S1' and email = 'otr-5@test.invalid'" >/dev/null || true
# Een plek vrijmaken zodat capaciteit en quotum niet de reden zijn.
psql_c -c "update tmc.trial_bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'test' where session_id = '$S1' and email = 'otr-3@test.invalid'" >/dev/null
( same_sql "$S1" | psql_c | last > "$TMP/b1.out" ) &
( same_sql "$S1" | psql_c | last > "$TMP/b2.out" ) &
wait
B1=$(cat "$TMP/b1.out"); B2=$(cat "$TMP/b2.out")
NB=$(psql_c -c "select count(*) from tmc.trial_bookings where email = 'otr-dubbel@test.invalid' and status = 'paid'")
[ "$NB" = "1" ] || fail "B: $NB rijen voor dezelfde persoon in plaats van 1 (b1='$B1', b2='$B2')"
{ [ "$B1" = "ok" ] && [ "$B2" = "already_used" ]; } || { [ "$B1" = "already_used" ] && [ "$B2" = "ok" ]; } \
  || fail "B: verwacht ok en already_used, kreeg b1='$B1' b2='$B2'"
echo "PASS B: dezelfde persoon tweemaal tegelijk, een boeking (b1='$B1', b2='$B2')"

# --- Scenario C: laatste kwartierquotum vrij trainen, twee proefgasten tegelijk op 09:00.
for k in 11 12 13; do book_sql "$S2" "$k" "$(slot_expr 09:00)" | psql_c >/dev/null; done
( book_sql "$S2" 14 "$(slot_expr 09:00)" | psql_c | last > "$TMP/c1.out" ) &
( book_sql "$S2" 15 "$(slot_expr 09:30)" | psql_c | last > "$TMP/c2.out" ) &
wait
C1=$(cat "$TMP/c1.out"); C2=$(cat "$TMP/c2.out")
NC=$(psql_c -c "select count(*) from tmc.trial_bookings where session_id = '$S2' and source = 'opening' and status = 'paid' and slot_start_at <= $(slot_expr 09:30) and slot_end_at > $(slot_expr 09:30)")
[ "$NC" = "4" ] || fail "C: $NC gratis proefgasten op 09:30 in plaats van 4 (c1='$C1', c2='$C2')"
{ [ "$C1" = "ok" ] && [ "$C2" = "trial_quota_full" ]; } || { [ "$C1" = "trial_quota_full" ] && [ "$C2" = "ok" ]; } \
  || fail "C: verwacht precies een winnaar, kreeg c1='$C1' c2='$C2'"
echo "PASS C: twee proefgasten tegelijk op het laatste kwartierquotum, precies een winnaar (c1='$C1', c2='$C2')"

rm -rf "$TMP"
echo "ALLE RACE-TESTS GESLAAGD"
