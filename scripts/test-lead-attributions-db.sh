#!/usr/bin/env bash
# DB-tests voor tmc.lead_attributions (spec-marketing-attribution.md):
# schema, constraints, de unieke index (testplan j), de grants en RLS voor
# anon en authenticated (testplan f) en de koppeling met de brontabellen.
# Alleen tegen een LOKALE database (supabase start in de worktree), nooit
# tegen productie.
#
# Gebruik: scripts/test-lead-attributions-db.sh <supabase_db_container>
#
# Alles gebeurt in een transactie die wordt teruggerold; er blijft niets staan.
set -euo pipefail

C="${1:?geef de naam van de lokale db-container}"
OUT=$(docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt <<'SQL'
begin;

create function pg_temp.check_(label text, ok boolean) returns text language sql as
$$ select case when ok then 'PASS ' || label else 'FAIL ' || label end $$;
-- Dynamische SQL die moet falen; geeft de SQLSTATE terug, of 'geen fout'.
create function pg_temp.fails(q text) returns text language plpgsql as
$$ begin execute q; return 'geen fout'; exception when others then return sqlstate; end $$;
-- Dynamische SQL als een andere rol; geeft de SQLSTATE terug, of 'geen fout'.
create function pg_temp.as_role(r text, q text) returns text language plpgsql as
$$ begin execute 'set local role ' || r; execute q; reset role; return 'geen fout';
   exception when others then reset role; return sqlstate; end $$;

-- Fixtures: een proefles-aanvraag en een proefboeking als bron.
insert into tmc.class_pillars (code, name_nl, age_category, display_order) values
  ('yoga_mobility', 'Yoga', 'adult', 1)
on conflict (code) do nothing;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('a9000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'la-trainer@test.invalid', '{"provider":"email","providers":["email"]}', '{"first_name":"LA","last_name":"Trainer"}', now(), now());
insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'LA Trainer', 'la-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity) values
  ('c9000000-0000-4000-8000-000000000001', 'la-yoga', 'LA yoga', 'yoga_mobility', 'adult', 10);
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at) values
  ('d9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'yoga_mobility', 'adult',
   now() + interval '10 days', now() + interval '10 days 1 hour', 10, 'scheduled', now() + interval '10 days');
insert into tmc.trial_bookings (id, session_id, name, email, phone, price_paid_cents, status, is_test, source)
values ('e9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'LA Test', 'la@test.invalid', '+31611111101', 1700, 'pending', false, 'paid');
insert into tmc.trial_requests (id, name, email) values ('e9000000-0000-4000-8000-000000000002', 'LA Bel', 'bel@test.invalid');

-- Schema
select pg_temp.check_('tabel bestaat met RLS aan',
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'tmc' and c.relname = 'lead_attributions'));
select pg_temp.check_('kolommen aanwezig',
  (select count(*) from information_schema.columns where table_schema = 'tmc' and table_name = 'lead_attributions'
     and column_name in ('id','created_at','source_type','source_id','email','gclid','gbraid','wbraid','fbclid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','landing_path','ad_consent')) = 16);
select pg_temp.check_('unieke index op (source_type, source_id)',
  exists (select 1 from pg_indexes where schemaname = 'tmc' and tablename = 'lead_attributions' and indexname = 'lead_attributions_source_uidx' and indexdef like 'CREATE UNIQUE INDEX%'));
select pg_temp.check_('index op lower(email)',
  exists (select 1 from pg_indexes where schemaname = 'tmc' and tablename = 'lead_attributions' and indexname = 'lead_attributions_email_idx' and indexdef like '%lower(email)%'));

-- Inserts (service_role-pad: hier als postgres)
insert into tmc.lead_attributions (source_type, source_id, email, gclid, utm_source, utm_campaign, landing_path, ad_consent)
values ('trial_booking', 'e9000000-0000-4000-8000-000000000001', 'la@test.invalid', 'test123', 'google', 'test', '/proefles?gclid=test123&utm_source=google&utm_campaign=test', 'granted');
select pg_temp.check_('a rij voor de proefboeking', (select count(*) from tmc.lead_attributions where source_type = 'trial_booking' and source_id = 'e9000000-0000-4000-8000-000000000001') = 1);
insert into tmc.lead_attributions (source_type, source_id, email, fbclid)
values ('trial_request', 'e9000000-0000-4000-8000-000000000002', 'bel@test.invalid', 'fb.1.abc');
select pg_temp.check_('a rij voor de aanvraag, ad_consent default unknown en landing_path null',
  (select ad_consent = 'unknown' and landing_path is null from tmc.lead_attributions where source_type = 'trial_request' and source_id = 'e9000000-0000-4000-8000-000000000002'));

-- j: dubbele aanroep
select pg_temp.check_('j tweede rij voor dezelfde bron geweigerd (23505)',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, gclid) values ('trial_booking', 'e9000000-0000-4000-8000-000000000001', 'la@test.invalid', 'anders')$q$) = '23505');
insert into tmc.lead_attributions (source_type, source_id, email, gclid) values ('trial_booking', 'e9000000-0000-4000-8000-000000000001', 'la@test.invalid', 'anders')
on conflict (source_type, source_id) do nothing;
select pg_temp.check_('j on conflict do nothing laat de eerste rij staan',
  (select gclid from tmc.lead_attributions where source_type = 'trial_booking' and source_id = 'e9000000-0000-4000-8000-000000000001') = 'test123'
  and (select count(*) from tmc.lead_attributions) = 2);
select pg_temp.check_('j zelfde id als ander brontype is wel een eigen rij',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, gclid) values ('trial_request', 'e9000000-0000-4000-8000-000000000001', 'la@test.invalid', 'x')$q$) = 'geen fout');

-- Constraints
select pg_temp.check_('c zonder enige parameter geweigerd (23514)',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, landing_path, ad_consent) values ('trial_request', gen_random_uuid(), 'x@test.invalid', '/proefles', 'granted')$q$) = '23514');
select pg_temp.check_('source_type buiten de twee waarden geweigerd',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, gclid) values ('order', gen_random_uuid(), 'x@test.invalid', 'x')$q$) = '23514');
select pg_temp.check_('ad_consent buiten de drie waarden geweigerd',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, gclid, ad_consent) values ('trial_request', gen_random_uuid(), 'x@test.invalid', 'x', 'yes')$q$) = '23514');
select pg_temp.check_('e-mail met hoofdletters geweigerd',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, gclid) values ('trial_request', gen_random_uuid(), 'X@test.invalid', 'x')$q$) = '23514');
select pg_temp.check_('g landing_path zonder / geweigerd',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, gclid, landing_path) values ('trial_request', gen_random_uuid(), 'x@test.invalid', 'x', 'https://evil.example/x')$q$) = '23514');
select pg_temp.check_('g landing_path langer dan 2048 geweigerd',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, gclid, landing_path) values ('trial_request', gen_random_uuid(), 'x@test.invalid', 'x', '/' || repeat('a', 2048))$q$) = '23514');
select pg_temp.check_('g landing_path van 2048 tekens met / toegestaan',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, gclid, landing_path) values ('trial_request', gen_random_uuid(), 'x@test.invalid', 'x', '/' || repeat('a', 2047))$q$) = 'geen fout');
select pg_temp.check_('parameter langer dan 512 geweigerd',
  pg_temp.fails($q$insert into tmc.lead_attributions (source_type, source_id, email, utm_campaign) values ('trial_request', gen_random_uuid(), 'x@test.invalid', repeat('a', 513))$q$) = '23514');

-- f: grants en RLS
select pg_temp.check_('f geen tabelgrants voor anon, authenticated of PUBLIC',
  not exists (select 1 from information_schema.role_table_grants where table_schema = 'tmc' and table_name = 'lead_attributions' and grantee in ('anon', 'authenticated', 'PUBLIC')));
select pg_temp.check_('f geen kolomgrants voor anon of authenticated',
  not exists (select 1 from information_schema.column_privileges where table_schema = 'tmc' and table_name = 'lead_attributions' and grantee in ('anon', 'authenticated', 'PUBLIC')));
select pg_temp.check_('f service_role heeft alle rechten',
  (select count(distinct privilege_type) from information_schema.role_table_grants where table_schema = 'tmc' and table_name = 'lead_attributions' and grantee = 'service_role') >= 4);
select pg_temp.check_('f anon select geweigerd (42501)', pg_temp.as_role('anon', 'select count(*) from tmc.lead_attributions') = '42501');
select pg_temp.check_('f anon insert geweigerd (42501)', pg_temp.as_role('anon', $q$insert into tmc.lead_attributions (source_type, source_id, email, gclid) values ('trial_request', gen_random_uuid(), 'x@test.invalid', 'x')$q$) = '42501');
select pg_temp.check_('f authenticated select geweigerd (42501)', pg_temp.as_role('authenticated', 'select count(*) from tmc.lead_attributions') = '42501');
select pg_temp.check_('f authenticated insert geweigerd (42501)', pg_temp.as_role('authenticated', $q$insert into tmc.lead_attributions (source_type, source_id, email, gclid) values ('trial_request', gen_random_uuid(), 'x@test.invalid', 'x')$q$) = '42501');
select pg_temp.check_('f authenticated update geweigerd (42501)', pg_temp.as_role('authenticated', $q$update tmc.lead_attributions set gclid = 'y'$q$) = '42501');
select pg_temp.check_('f authenticated delete geweigerd (42501)', pg_temp.as_role('authenticated', $q$delete from tmc.lead_attributions$q$) = '42501');
select pg_temp.check_('f service_role select werkt', pg_temp.as_role('service_role', 'select count(*) from tmc.lead_attributions') = 'geen fout');
select pg_temp.check_('policy alleen select voor is_admin()',
  (select count(*) from pg_policies where schemaname = 'tmc' and tablename = 'lead_attributions') = 1
  and exists (select 1 from pg_policies where schemaname = 'tmc' and tablename = 'lead_attributions' and policyname = 'lead_attributions_admin_select' and cmd = 'SELECT' and qual like '%is_admin()%'));

-- Export-join: status en bron van de brontabel
select pg_temp.check_('export-join: status en bron van de proefboeking',
  (select b.status = 'pending' and b.source = 'paid' from tmc.lead_attributions a join tmc.trial_bookings b on b.id = a.source_id where a.source_type = 'trial_booking' and a.source_id = 'e9000000-0000-4000-8000-000000000001'));
select pg_temp.check_('export-join: status van de aanvraag',
  (select r.status = 'new' from tmc.lead_attributions a join tmc.trial_requests r on r.id = a.source_id where a.source_type = 'trial_request' and a.source_id = 'e9000000-0000-4000-8000-000000000002'));

rollback;
SQL
)
echo "$OUT"
if echo "$OUT" | grep -q '^FAIL'; then
  echo "ER ZIJN TESTS GEFAALD"
  exit 1
fi
echo "ALLE DB-TESTS GESLAAGD"
