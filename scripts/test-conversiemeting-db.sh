#!/usr/bin/env bash
# DB-tests voor de conversiemeting-kolommen (spec-conversiemeting.md):
# tmc.trial_bookings.ga_client_id, ga_session_id, ad_consent en action_page,
# en tmc.orders.ad_consent. Kolommen, defaults, checks, grants en dat een
# bestaande insert zonder de nieuwe kolommen blijft werken.
# Alleen tegen een LOKALE database, nooit tegen productie.
#
# Gebruik: scripts/test-conversiemeting-db.sh <supabase_db_container>
#
# Standaard verwacht het script dat de migratie al is toegepast (supabase
# start in de worktree). Met APPLY_MIGRATION=1 past het de migratie eerst toe
# binnen dezelfde transactie, voor een lokale database die op een andere
# branch is gestart.
#
# Alles gebeurt in een transactie die wordt teruggerold; er blijft niets staan.
set -euo pipefail

C="${1:?geef de naam van de lokale db-container}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATION="$HERE/../supabase/migrations/20261116120000_conversiemeting_ga_consent.sql"

APPLY="${APPLY_MIGRATION:-0}"

run_sql() {
  echo "begin;"
  if [ "$APPLY" = "1" ]; then cat "$MIGRATION"; fi
  cat <<'SQL'
create function pg_temp.check_(label text, ok boolean) returns text language sql as
$$ select case when ok then 'PASS ' || label else 'FAIL ' || label end $$;
-- Dynamische SQL die moet falen; geeft de SQLSTATE terug, of 'geen fout'.
create function pg_temp.fails(q text) returns text language plpgsql as
$$ begin execute q; return 'geen fout'; exception when others then return sqlstate; end $$;
-- Dynamische SQL als een andere rol; geeft de SQLSTATE terug, of 'geen fout'.
create function pg_temp.as_role(r text, q text) returns text language plpgsql as
$$ begin execute 'set local role ' || r; execute q; reset role; return 'geen fout';
   exception when others then reset role; return sqlstate; end $$;

-- Fixtures: een sessie en een proefboeking, ingevoegd ZONDER de nieuwe
-- kolommen (zoals de bestaande insert in startTrialBooking en de RPC's).
insert into tmc.class_pillars (code, name_nl, age_category, display_order) values
  ('yoga_mobility', 'Yoga', 'adult', 1)
on conflict (code) do nothing;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('a8000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'cm-trainer@test.invalid', '{"provider":"email","providers":["email"]}', '{"first_name":"CM","last_name":"Trainer"}', now(), now());
insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'CM Trainer', 'cm-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity) values
  ('c8000000-0000-4000-8000-000000000001', 'cm-yoga', 'CM yoga', 'yoga_mobility', 'adult', 10);
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at) values
  ('d8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'yoga_mobility', 'adult',
   now() + interval '10 days', now() + interval '10 days 1 hour', 10, 'scheduled', now() + interval '10 days');
insert into tmc.trial_bookings (id, session_id, name, email, phone, price_paid_cents, status, is_test, source)
values ('e8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'CM Test', 'cm@test.invalid', '+31611111801', 1700, 'pending', false, 'paid');

-- Kolommen en defaults
select pg_temp.check_('trial_bookings: vier nieuwe kolommen aanwezig',
  (select count(*) from information_schema.columns where table_schema = 'tmc' and table_name = 'trial_bookings'
     and column_name in ('ga_client_id','ga_session_id','ad_consent','action_page')) = 4);
select pg_temp.check_('trial_bookings: ga_client_id, ga_session_id en action_page nullable tekst',
  (select count(*) from information_schema.columns where table_schema = 'tmc' and table_name = 'trial_bookings'
     and column_name in ('ga_client_id','ga_session_id','action_page') and is_nullable = 'YES' and data_type = 'text') = 3);
select pg_temp.check_('trial_bookings: ad_consent not null met default unknown',
  (select is_nullable = 'NO' and column_default like '%unknown%' from information_schema.columns
     where table_schema = 'tmc' and table_name = 'trial_bookings' and column_name = 'ad_consent'));
select pg_temp.check_('orders: ad_consent not null met default unknown',
  (select is_nullable = 'NO' and column_default like '%unknown%' from information_schema.columns
     where table_schema = 'tmc' and table_name = 'orders' and column_name = 'ad_consent'));
select pg_temp.check_('bestaande insert zonder de nieuwe kolommen werkt: ad_consent unknown, rest null',
  (select ad_consent = 'unknown' and ga_client_id is null and ga_session_id is null and action_page is null
     from tmc.trial_bookings where id = 'e8000000-0000-4000-8000-000000000001'));
select pg_temp.check_('bestaande orders-rijen hebben ad_consent unknown',
  not exists (select 1 from tmc.orders where ad_consent <> 'unknown'));

-- Losse updates zoals de app ze doet
update tmc.trial_bookings set ga_client_id = '1234567890.1700000000', ga_session_id = '1700000001'
where id = 'e8000000-0000-4000-8000-000000000001';
update tmc.trial_bookings set ad_consent = 'granted' where id = 'e8000000-0000-4000-8000-000000000001';
select pg_temp.check_('losse updates: ga-id''s en ad_consent geschreven',
  (select ga_client_id = '1234567890.1700000000' and ga_session_id = '1700000001' and ad_consent = 'granted'
     from tmc.trial_bookings where id = 'e8000000-0000-4000-8000-000000000001'));

-- Check ad_consent
select pg_temp.check_('trial_bookings: ad_consent denied geaccepteerd',
  pg_temp.fails($q$update tmc.trial_bookings set ad_consent = 'denied' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = 'geen fout');
select pg_temp.check_('trial_bookings: ad_consent buiten de drie waarden geweigerd (23514)',
  pg_temp.fails($q$update tmc.trial_bookings set ad_consent = 'yes' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = '23514');
select pg_temp.check_('trial_bookings: ad_consent null geweigerd (23502)',
  pg_temp.fails($q$update tmc.trial_bookings set ad_consent = null where id = 'e8000000-0000-4000-8000-000000000001'$q$) = '23502');
select pg_temp.check_('orders: check op ad_consent bestaat met de drie waarden',
  exists (select 1 from pg_constraint where conname = 'orders_ad_consent_check' and conrelid = 'tmc.orders'::regclass
            and pg_get_constraintdef(oid) like '%granted%' and pg_get_constraintdef(oid) like '%denied%' and pg_get_constraintdef(oid) like '%unknown%'));

-- Check action_page: tekst, max 64, alleen [a-z0-9-], NULL toegestaan
select pg_temp.check_('action_page: geldige slug geaccepteerd',
  pg_temp.fails($q$update tmc.trial_bookings set action_page = 'zomer-actie-2027' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = 'geen fout');
select pg_temp.check_('action_page: 64 tekens geaccepteerd',
  pg_temp.fails($q$update tmc.trial_bookings set action_page = repeat('a', 64) where id = 'e8000000-0000-4000-8000-000000000001'$q$) = 'geen fout');
select pg_temp.check_('action_page: 65 tekens geweigerd (23514)',
  pg_temp.fails($q$update tmc.trial_bookings set action_page = repeat('a', 65) where id = 'e8000000-0000-4000-8000-000000000001'$q$) = '23514');
select pg_temp.check_('action_page: hoofdletters geweigerd (23514)',
  pg_temp.fails($q$update tmc.trial_bookings set action_page = 'Zomer' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = '23514');
select pg_temp.check_('action_page: spatie, slash en underscore geweigerd (23514)',
  pg_temp.fails($q$update tmc.trial_bookings set action_page = 'zomer actie' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = '23514'
  and pg_temp.fails($q$update tmc.trial_bookings set action_page = 'actie/zomer' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = '23514'
  and pg_temp.fails($q$update tmc.trial_bookings set action_page = 'zomer_actie' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = '23514');
select pg_temp.check_('action_page: lege string geweigerd (23514)',
  pg_temp.fails($q$update tmc.trial_bookings set action_page = '' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = '23514');
select pg_temp.check_('action_page: regeleinde na een geldige slug geweigerd (23514)',
  pg_temp.fails($q$update tmc.trial_bookings set action_page = E'zomer\n' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = '23514');
select pg_temp.check_('action_page: null toegestaan',
  pg_temp.fails($q$update tmc.trial_bookings set action_page = null where id = 'e8000000-0000-4000-8000-000000000001'$q$) = 'geen fout');

-- Grants: trial_bookings blijft uitsluitend service_role
select pg_temp.check_('anon select op trial_bookings geweigerd (42501)',
  pg_temp.as_role('anon', 'select ga_client_id, ad_consent, action_page from tmc.trial_bookings') = '42501');
select pg_temp.check_('authenticated select op trial_bookings geweigerd (42501)',
  pg_temp.as_role('authenticated', 'select ga_client_id, ad_consent, action_page from tmc.trial_bookings') = '42501');
select pg_temp.check_('authenticated update op trial_bookings geweigerd (42501)',
  pg_temp.as_role('authenticated', $q$update tmc.trial_bookings set ad_consent = 'granted'$q$) = '42501');
select pg_temp.check_('service_role leest en schrijft de nieuwe kolommen op trial_bookings',
  pg_temp.as_role('service_role', $q$update tmc.trial_bookings set ad_consent = 'unknown' where id = 'e8000000-0000-4000-8000-000000000001'$q$) = 'geen fout'
  and pg_temp.as_role('service_role', 'select ga_client_id, ga_session_id, ad_consent, action_page from tmc.trial_bookings') = 'geen fout');

-- Grants: orders volgt het patroon van ga_client_id
select pg_temp.check_('anon select op orders.ad_consent geweigerd (42501)',
  pg_temp.as_role('anon', 'select ad_consent from tmc.orders') = '42501');
select pg_temp.check_('authenticated update op orders.ad_consent geweigerd (42501)',
  pg_temp.as_role('authenticated', $q$update tmc.orders set ad_consent = 'granted'$q$) = '42501');
select pg_temp.check_('orders.ad_consent heeft dezelfde leesrechten als orders.ga_client_id',
  has_column_privilege('authenticated', 'tmc.orders', 'ad_consent', 'select')
    = has_column_privilege('authenticated', 'tmc.orders', 'ga_client_id', 'select')
  and has_column_privilege('anon', 'tmc.orders', 'ad_consent', 'select')
    = has_column_privilege('anon', 'tmc.orders', 'ga_client_id', 'select'));
select pg_temp.check_('service_role schrijft orders.ad_consent',
  pg_temp.as_role('service_role', $q$update tmc.orders set ad_consent = 'denied' where false$q$) = 'geen fout');

SQL
  if [ "$APPLY" = "1" ]; then
    # De migratie is idempotent: een tweede keer draaien mag niet falen.
    cat "$MIGRATION"
    echo "select pg_temp.check_('migratie is idempotent (tweede keer zonder fout)', true);"
  fi
  echo "rollback;"
}

OUT=$(run_sql | docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt)

echo "$OUT"
if echo "$OUT" | grep -q '^FAIL'; then
  echo "ER ZIJN TESTS GEFAALD"
  exit 1
fi
echo "ALLE DB-TESTS GESLAAGD"
