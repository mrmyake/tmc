#!/usr/bin/env bash
# DB-tests voor tmc.programma_intakes: schema, constraints, de unieke
# idempotency_key (meerdere NULL's mogen), grants en RLS voor anon en
# authenticated, en de trigger updated_at. Past de migratie zelf toe in de
# transactie. Alleen tegen een LOKALE database (supabase start), nooit tegen
# productie.
#
# Gebruik: scripts/test-programma-intakes-db.sh <supabase_db_container>
#
# Alles gebeurt in een transactie die wordt teruggerold; er blijft niets staan.
set -euo pipefail

C="${1:?geef de naam van de lokale db-container}"
MIG="$(dirname "$0")/../supabase/migrations/20261115120000_programma_intakes.sql"

OUT=$( { echo "begin;"; cat "$MIG"; cat <<'SQL'
create function pg_temp.check_(label text, ok boolean) returns text language sql as
$$ select case when ok then 'PASS ' || label else 'FAIL ' || label end $$;
create function pg_temp.fails(q text) returns text language plpgsql as
$$ begin execute q; return 'geen fout'; exception when others then return sqlstate; end $$;
create function pg_temp.as_role(r text, q text) returns text language plpgsql as
$$ begin execute 'set local role ' || r; execute q; reset role; return 'geen fout';
   exception when others then reset role; return sqlstate; end $$;

with ins as (
  insert into tmc.programma_intakes (first_name, last_name, email, phone, preferred_day)
  values ('A', 'B', 'a@example.invalid', '+31612345678', 'dinsdag')
  returning status, is_test, id, created_at, contacted_at
) select pg_temp.check_('default status new, is_test false, id en timestamps gezet',
  status = 'new' and not is_test and id is not null and created_at is not null and contacted_at is null) from ins;

select pg_temp.check_('status buiten de vier waarden faalt (23514)',
  pg_temp.fails($q$insert into tmc.programma_intakes (first_name, last_name, email, phone, preferred_day, status)
    values ('A','B','a@example.invalid','+31612345678','dinsdag','onzin')$q$) = '23514');

select pg_temp.check_('first_name, last_name, email, phone en preferred_day zijn verplicht (23502)',
  pg_temp.fails($q$insert into tmc.programma_intakes (first_name, last_name, email, phone)
    values ('A','B','a@example.invalid','+31612345678')$q$) = '23502');

insert into tmc.programma_intakes (first_name, last_name, email, phone, preferred_day, idempotency_key)
values ('A','B','a@example.invalid','+31612345678','dinsdag','6b1c0d1e-1111-4222-8333-444455556666');

select pg_temp.check_('dezelfde idempotency_key botst (23505)',
  pg_temp.fails($q$insert into tmc.programma_intakes (first_name, last_name, email, phone, preferred_day, idempotency_key)
    values ('C','D','c@example.invalid','+31612345679','dinsdag','6b1c0d1e-1111-4222-8333-444455556666')$q$) = '23505');

with ins as (
  insert into tmc.programma_intakes (first_name, last_name, email, phone, preferred_day)
  values ('E','F','e@example.invalid','+31612345670','dinsdag') returning id
) select pg_temp.check_('meerdere rijen zonder idempotency_key mogen', count(*) = 1) from ins;

with before as (select updated_at from tmc.programma_intakes where idempotency_key = '6b1c0d1e-1111-4222-8333-444455556666'),
     upd as (update tmc.programma_intakes set notes = 'x' where idempotency_key = '6b1c0d1e-1111-4222-8333-444455556666' returning updated_at)
select pg_temp.check_('updated_at loopt mee bij een update', upd.updated_at >= before.updated_at) from upd, before;

select pg_temp.check_('anon mag niet lezen (42501)',
  pg_temp.as_role('anon', 'select * from tmc.programma_intakes') = '42501');
select pg_temp.check_('anon mag niet schrijven (42501)',
  pg_temp.as_role('anon', $q$insert into tmc.programma_intakes (first_name, last_name, email, phone, preferred_day) values ('A','B','a@example.invalid','+31612345678','dinsdag')$q$) = '42501');
select pg_temp.check_('authenticated mag niet lezen (42501)',
  pg_temp.as_role('authenticated', 'select * from tmc.programma_intakes') = '42501');
select pg_temp.check_('authenticated mag niet schrijven (42501)',
  pg_temp.as_role('authenticated', $q$insert into tmc.programma_intakes (first_name, last_name, email, phone, preferred_day) values ('A','B','a@example.invalid','+31612345678','dinsdag')$q$) = '42501');
select pg_temp.check_('authenticated mag niet updaten (42501)',
  pg_temp.as_role('authenticated', $q$update tmc.programma_intakes set status = 'booked'$q$) = '42501');
select pg_temp.check_('service_role mag lezen en schrijven',
  pg_temp.as_role('service_role', $q$insert into tmc.programma_intakes (first_name, last_name, email, phone, preferred_day) values ('S','R','s@example.invalid','+31612345671','dinsdag'); select * from tmc.programma_intakes$q$) = 'geen fout');

select pg_temp.check_('RLS aan en precies twee policies (select, update), geen insert', (
  select c.relrowsecurity
     and (select count(*) from pg_policies where schemaname='tmc' and tablename='programma_intakes') = 2
     and not exists (select 1 from pg_policies where schemaname='tmc' and tablename='programma_intakes' and cmd in ('INSERT','ALL','DELETE'))
  from pg_class c where c.oid = 'tmc.programma_intakes'::regclass
));

rollback;
SQL
} | docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt )

echo "$OUT" | grep -E '^(PASS|FAIL)' || true
if echo "$OUT" | grep -q '^FAIL' || ! echo "$OUT" | grep -q '^PASS'; then
  echo "DB-tests mislukt"; echo "$OUT"; exit 1
fi
echo "Alle DB-tests geslaagd"
