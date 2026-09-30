#!/usr/bin/env bash
# Race-test voor proefcodes met scope vrij trainen (PR 2): twee echte psql-
# verbindingen boeken tegelijk het laatste plekje van een kwartier, een lid via
# book_class_session en een proefbezoeker via redeem_trial_code. Precies een
# slaagt; de ander krijgt slot_full. Alleen tegen een LOKALE database (supabase
# db start in de worktree), nooit tegen productie. Naast
# scripts/test-vrij-trainen-slots-race.sh (lid tegen lid).
#
# Gebruik: scripts/test-trial-vrij-trainen-race.sh <supabase_db_container>
#
# De fixtures moeten gecommit zijn (een tweede verbinding ziet geen
# ongecommitte rijen); ze worden aan het eind altijd opgeruimd.
set -euo pipefail

C="${1:?geef de naam van de lokale db-container}"
psql_c() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

cleanup() {
  psql_c <<'SQL' >/dev/null
delete from tmc.trial_code_redemptions where trial_booking_id in (select id from tmc.trial_bookings where email like 'tvtr-%@test.invalid');
delete from tmc.trial_bookings where email like 'tvtr-%@test.invalid';
delete from tmc.trial_codes where code = 'TVTRACE';
delete from tmc.bookings where session_id::text like 'd7000000-%';
delete from tmc.class_sessions where id::text like 'd7000000-%';
delete from tmc.class_types where id::text like 'c7000000-%';
delete from tmc.trainers where id::text like 'b7000000-%';
delete from auth.users where id::text like 'a7000000-%';
SQL
}
trap cleanup EXIT
cleanup

psql_c <<'SQL' >/dev/null
insert into tmc.class_pillars (code, name_nl, age_category, display_order)
values ('vrij_trainen', 'Vrij Trainen', 'adult', 998) on conflict (code) do nothing;
insert into tmc.booking_settings (id) values ('singleton') on conflict (id) do nothing;
update tmc.booking_settings set vrij_trainen_max_concurrent = 5, booking_window_days = 28;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'tvtr-' || n || '@test.invalid', '{"provider":"email","providers":["email"]}',
       json_build_object('first_name', 'Race' || n, 'last_name', 'Test')::jsonb, now(), now()
from generate_series(1, 12) as n;
insert into tmc.memberships (profile_id, plan_type, price_per_cycle_cents, start_date, commit_end_date, status, age_category)
select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'all_inclusive', 10000, current_date - 30, current_date + 365, 'active', 'adult'
from generate_series(1, 12) as n;
insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000012', 'TVTR Trainer', 'tvtr-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity)
values ('c7000000-0000-4000-8000-000000000001', 'tvtr-vrij', 'TVTR vrij', 'vrij_trainen', 'adult', null);
-- Een maandag binnen het boekvenster, dagsessie 07:00 tot 21:00 lokaal.
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
select 'd7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001',
       'vrij_trainen', 'adult', t, t + interval '14 hours', null, 'scheduled', t
from (select ((((current_date + 2) + ((8 - extract(isodow from (current_date + 2))::int) % 7))::text || ' 07:00')::timestamp at time zone 'Europe/Amsterdam') as t) s;
insert into tmc.trial_codes (code, label, max_uses, scope, created_by)
values ('TVTRACE', 'race', null, 'vrij_trainen', 'a7000000-0000-4000-8000-000000000012');
SQL

DAY=$(psql_c -c "select ((current_date + 2) + ((8 - extract(isodow from (current_date + 2))::int) % 7))::text")
SID='d7000000-0000-4000-8000-000000000001'

# Lid n boekt het slot (hh:mm, 60 minuten) via book_class_session als authenticated.
lid_sql() {
  local n="$1" hhmm="$2"
  cat <<SQL
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'a7000000-0000-4000-8000-0000000000$(printf %02d "$n")', 'role', 'authenticated')::text, false) is not null;
select coalesce(tmc.book_class_session('$SID', false, false, ('$DAY $hhmm')::timestamp at time zone 'Europe/Amsterdam', 60) ->> 'reason', 'ok');
SQL
}
# Proefbezoeker k boekt hetzelfde uur via redeem_trial_code (service-role-pad).
proef_sql() {
  local k="$1" hhmm="$2"
  cat <<SQL
select coalesce(tmc.redeem_trial_code('TVTRACE', '$SID', 'Race $k', 'tvtr-p$k@test.invalid', '0600000000', false, ('$DAY $hhmm')::timestamp at time zone 'Europe/Amsterdam') ->> 'reason', 'ok');
SQL
}
peak_sql() {
  local hhmm="$1"
  echo "select peak from tmc.vrij_trainen_slot_peak('$SID', ('$DAY $hhmm')::timestamp at time zone 'Europe/Amsterdam', (('$DAY $hhmm')::timestamp at time zone 'Europe/Amsterdam') + interval '15 minutes');"
}

fail() { echo "FAIL $*"; exit 1; }
last() { tail -1; }
TMP=$(mktemp -d)

# Vier plekken bezet op 10:00 (leden 1 tot 4).
for n in 1 2 3 4; do lid_sql "$n" 10:00 | psql_c >/dev/null; done

# --- Scenario D: lid houdt de sessielock vast, de proefbezoeker moet wachten en
# krijgt slot_full. Verbinding 1 (lid 5) boekt het laatste plekje en houdt de
# transactie 3 seconden open.
( { echo "begin;"; lid_sql 5 10:00; echo "select pg_sleep(3); commit;"; } | psql_c > $TMP/d1.out ) &
P1=$!
sleep 1
T0=$(date +%s)
RD2=$( { echo "begin;"; proef_sql 1 10:00; echo "commit;"; } | psql_c | last)
T1=$(date +%s)
wait $P1
RD1=$(grep -v '^$' $TMP/d1.out | grep -E '^(ok|slot_full|slot_blocked)' | head -1)
[ "$RD1" = "ok" ] || fail "D: het lid had moeten slagen, kreeg '$RD1'"
[ "$RD2" = "slot_full" ] || fail "D: de proefbezoeker gaf '$RD2' in plaats van slot_full"
[ $((T1 - T0)) -ge 1 ] || fail "D: de proefbezoeker wachtte niet op de sessielock"
[ "$(psql_c -c "$(peak_sql 10:00)")" = "5" ] || fail "D: piek is niet 5"
echo "PASS D: lid (5e) wint van proefbezoeker, die $((T1 - T0))s op de sessielock wachtte en slot_full kreeg; piek 5"

# --- Scenario E: omgekeerd. De proefbezoeker houdt de sessielock vast op 17:00
# (binnen de aanwezigheid); vier plekken zijn bezet door leden 6 tot 9.
for n in 6 7 8 9; do lid_sql "$n" 17:00 | psql_c >/dev/null; done
( { echo "begin;"; proef_sql 2 17:00; echo "select pg_sleep(3); commit;"; } | psql_c > $TMP/e1.out ) &
P1=$!
sleep 1
T0=$(date +%s)
RE2=$( { echo "begin;"; lid_sql 10 17:00; echo "commit;"; } | psql_c | last)
T1=$(date +%s)
wait $P1
RE1=$(grep -v '^$' $TMP/e1.out | grep -E '^(ok|slot_full|slot_blocked)' | head -1)
[ "$RE1" = "ok" ] || fail "E: de proefbezoeker had moeten slagen, kreeg '$RE1'"
[ "$RE2" = "slot_full" ] || fail "E: het lid gaf '$RE2' in plaats van slot_full"
[ $((T1 - T0)) -ge 1 ] || fail "E: het lid wachtte niet op de sessielock"
[ "$(psql_c -c "$(peak_sql 17:00)")" = "5" ] || fail "E: piek is niet 5"
echo "PASS E: proefbezoeker (5e) wint van lid, dat $((T1 - T0))s op de sessielock wachtte en slot_full kreeg; piek 5"

# --- Scenario F: twee proefbezoekers tegelijk zonder vooraf bepaalde winnaar.
# Op 18:00 staan vier plekken bezet (leden 11 en 12, proefbezoekers 3 en 4).
lid_sql 11 18:00 | psql_c >/dev/null
lid_sql 12 18:00 | psql_c >/dev/null
proef_sql 3 18:00 | psql_c >/dev/null
proef_sql 4 18:00 | psql_c >/dev/null
( { proef_sql 5 18:00; } | psql_c | last > $TMP/f1.out ) &
( { proef_sql 6 18:00; } | psql_c | last > $TMP/f2.out ) &
wait
F1=$(cat $TMP/f1.out); F2=$(cat $TMP/f2.out)
PEAKF=$(psql_c -c "$(peak_sql 18:00)")
[ "$PEAKF" = "5" ] || fail "F: piek is $PEAKF in plaats van 5 (f1='$F1', f2='$F2')"
{ [ "$F1" = "ok" ] && [ "$F2" = "slot_full" ]; } || { [ "$F1" = "slot_full" ] && [ "$F2" = "ok" ]; } \
  || fail "F: verwacht precies een winnaar, kreeg f1='$F1' f2='$F2'"
echo "PASS F: twee proefbezoekers tegelijk op het laatste plekje, precies een winnaar en piek blijft 5"

# --- Scenario H: een lid en een proefbezoeker tegelijk op het laatste plekje, zonder
# vooraf bepaalde winnaar. Op 19:00 staan vier proefbezoekers; lid 10 en
# proefbezoeker 11 boeken gelijktijdig. Precies een slaagt, de piek blijft 5.
for k in 7 8 9 10; do proef_sql "$k" 19:00 | psql_c >/dev/null; done
( { lid_sql 10 19:00; } | psql_c | last > $TMP/h1.out ) &
( { proef_sql 11 19:00; } | psql_c | last > $TMP/h2.out ) &
wait
H1=$(cat $TMP/h1.out); H2=$(cat $TMP/h2.out)
PEAKH=$(psql_c -c "$(peak_sql 19:00)")
[ "$PEAKH" = "5" ] || fail "H: piek is $PEAKH in plaats van 5 (lid='$H1', proef='$H2')"
{ [ "$H1" = "ok" ] && [ "$H2" = "slot_full" ]; } || { [ "$H1" = "slot_full" ] && [ "$H2" = "ok" ]; } \
  || fail "H: verwacht precies een winnaar, kreeg lid='$H1' proef='$H2'"
echo "PASS H: lid en proefbezoeker tegelijk op het laatste plekje, precies een winnaar (lid='$H1', proef='$H2') en piek blijft 5"

# --- Scenario G: een proefbezoeker telt mee voor leden: een lid ziet in
# vrij_trainen_availability dat 17:00 vol is (5 geboekt, waarvan een proef).
AV=$(psql_c <<SQL | tail -1
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-4000-8000-000000000012","role":"authenticated"}', false) is not null;
select booked || '/' || available from tmc.vrij_trainen_availability('$DAY'::date)
 where quarter_start = ('$DAY 17:00')::timestamp at time zone 'Europe/Amsterdam';
SQL
)
[ "$AV" = "5/0" ] || fail "G: ledenbeschikbaarheid op 17:00 is '$AV' in plaats van 5/0 (proefbezoeker telt mee)"
echo "PASS G: vrij_trainen_availability voor leden telt de proefbezoeker mee (17:00 is 5/0)"

rm -rf "$TMP"
echo "ALLE RACE-TESTS GESLAAGD"
