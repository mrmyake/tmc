#!/usr/bin/env bash
# DB-tests voor proefcodes met scope vrij trainen (PR 2): aanwezigheid in
# Amsterdamse tijd rond het einde van de zomertijd (25 oktober 2026), weekdag-
# conventie, slotregels van redeem_trial_code, het maximum van 5 met
# proefbezoekers (is_test telt niet mee), scope_mismatch in beide richtingen en
# een proefbezoeker in vrij_trainen_availability voor leden. Alleen tegen een
# LOKALE database (supabase db start in de worktree), nooit tegen productie.
#
# Gebruik: scripts/test-trial-vrij-trainen-db.sh <supabase_db_container>
#
# Alles gebeurt in een transactie die wordt teruggerold; er blijft niets staan.
set -euo pipefail

C="${1:?geef de naam van de lokale db-container}"
OUT=$(docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt <<'SQL'
begin;

insert into tmc.class_pillars (code, name_nl, age_category, display_order) values
  ('vrij_trainen', 'Vrij Trainen', 'adult', 998), ('yoga_mobility', 'Yoga', 'adult', 1), ('kettlebell', 'Kettlebell', 'adult', 2)
on conflict (code) do nothing;
insert into tmc.booking_settings (id) values ('singleton') on conflict (id) do nothing;
update tmc.booking_settings set vrij_trainen_max_concurrent = 5;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('a9000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'tvt-' || n || '@test.invalid', '{"provider":"email","providers":["email"]}',
       json_build_object('first_name', 'Tvt' || n, 'last_name', 'Test')::jsonb, now(), now()
from generate_series(1, 6) as n;
insert into tmc.memberships (profile_id, plan_type, price_per_cycle_cents, start_date, commit_end_date, status, age_category)
select ('a9000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'all_inclusive', 10000, current_date - 30, current_date + 365, 'active', 'adult'
from generate_series(1, 6) as n;
insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000006', 'TVT Trainer', 'tvt-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity)
values ('c9000000-0000-4000-8000-000000000001', 'tvt-vrij', 'TVT vrij', 'vrij_trainen', 'adult', null),
       ('c9000000-0000-4000-8000-000000000002', 'tvt-yoga', 'TVT yoga', 'yoga_mobility', 'adult', 10);

-- Vrijdag 23 oktober 2026 (nog zomertijd) en maandag 26 oktober 2026 (na de
-- wisseling van zondag 25 oktober): dagsessie 07:00 tot 21:00 lokaal.
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
select v.id::uuid, 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'vrij_trainen', 'adult',
       (v.d || ' 07:00')::timestamp at time zone 'Europe/Amsterdam', (v.d || ' 21:00')::timestamp at time zone 'Europe/Amsterdam', null, 'scheduled',
       (v.d || ' 07:00')::timestamp at time zone 'Europe/Amsterdam'
from (values ('d9000000-0000-4000-8000-000000000001', '2026-10-23'), ('d9000000-0000-4000-8000-000000000002', '2026-10-26')) v(id, d);
-- Een maandag dichtbij (binnen het boekvenster van leden) voor de mix van leden en proefbezoekers.
create function pg_temp.nm() returns text language sql as
$$ select ((current_date + 2) + ((8 - extract(isodow from (current_date + 2))::int) % 7))::text $$;
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
select 'd9000000-0000-4000-8000-000000000004', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'vrij_trainen', 'adult',
       (pg_temp.nm() || ' 07:00')::timestamp at time zone 'Europe/Amsterdam', (pg_temp.nm() || ' 21:00')::timestamp at time zone 'Europe/Amsterdam', null, 'scheduled',
       (pg_temp.nm() || ' 07:00')::timestamp at time zone 'Europe/Amsterdam';
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
values ('d9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001', 'yoga_mobility', 'adult',
        (current_date + 10)::timestamp at time zone 'Europe/Amsterdam' + interval '10 hours', (current_date + 10)::timestamp at time zone 'Europe/Amsterdam' + interval '11 hours', 10, 'scheduled',
        (current_date + 10)::timestamp at time zone 'Europe/Amsterdam' + interval '10 hours');

insert into tmc.trial_codes (code, label, max_uses, scope, created_by) values
  ('TVTVRIJ', 'tvt vrij', null, 'vrij_trainen', 'a9000000-0000-4000-8000-000000000006'),
  ('TVTGROEP', 'tvt groep', null, 'group', 'a9000000-0000-4000-8000-000000000006');

create function pg_temp.slot(d text, t text) returns timestamptz language sql as
$$ select (d || ' ' || t)::timestamp at time zone 'Europe/Amsterdam' $$;
create function pg_temp.present(d text, t text) returns boolean language sql as
$$ select tmc.vrij_trainen_trainer_present(pg_temp.slot(d, t), pg_temp.slot(d, t) + interval '60 minutes') $$;
create function pg_temp.check_(label text, ok boolean) returns text language sql as
$$ select case when ok then 'PASS ' || label else 'FAIL ' || label end $$;

-- 1. Aanwezigheid voor en na 25 oktober 2026: vensters blijven lokaal kloppen.
select pg_temp.check_('vr 23 okt 07:00 aanwezig', pg_temp.present('2026-10-23', '07:00'));
select pg_temp.check_('vr 23 okt 11:00 laatste start ochtend', pg_temp.present('2026-10-23', '11:00'));
select pg_temp.check_('vr 23 okt 11:15 niet', not pg_temp.present('2026-10-23', '11:15'));
select pg_temp.check_('vr 23 okt 12:00 niet', not pg_temp.present('2026-10-23', '12:00'));
select pg_temp.check_('vr 23 okt 16:45 niet', not pg_temp.present('2026-10-23', '16:45'));
select pg_temp.check_('vr 23 okt 17:00 aanwezig', pg_temp.present('2026-10-23', '17:00'));
select pg_temp.check_('vr 23 okt 20:00 laatste start avond', pg_temp.present('2026-10-23', '20:00'));
select pg_temp.check_('vr 23 okt 20:15 niet', not pg_temp.present('2026-10-23', '20:15'));
select pg_temp.check_('ma 26 okt 07:00 aanwezig', pg_temp.present('2026-10-26', '07:00'));
select pg_temp.check_('ma 26 okt 11:00 laatste start ochtend', pg_temp.present('2026-10-26', '11:00'));
select pg_temp.check_('ma 26 okt 11:15 niet', not pg_temp.present('2026-10-26', '11:15'));
select pg_temp.check_('ma 26 okt 17:00 aanwezig', pg_temp.present('2026-10-26', '17:00'));
select pg_temp.check_('ma 26 okt 20:00 laatste start avond', pg_temp.present('2026-10-26', '20:00'));
select pg_temp.check_('ma 26 okt 20:15 niet', not pg_temp.present('2026-10-26', '20:15'));
select pg_temp.check_('za 24 okt 09:00 weekend niet', not pg_temp.present('2026-10-24', '09:00'));
select pg_temp.check_('zo 25 okt 09:00 weekend niet', not pg_temp.present('2026-10-25', '09:00'));

-- 2. Weekdagconventie = extract(dow) in Amsterdamse tijd. De overgang van UTC naar
-- lokale tijd zit aan de randen: 05:00 UTC is 07:00 in zomertijd, 06:00 UTC is
-- 07:00 in wintertijd; zondag 22:30 UTC is al maandag? Nee: zondag 23:30 lokaal.
select pg_temp.check_('vr 23 okt: 05:00 UTC = 07:00 CEST aanwezig',
  tmc.vrij_trainen_trainer_present('2026-10-23 05:00+00', '2026-10-23 06:00+00'));
select pg_temp.check_('vr 23 okt: 04:00 UTC = 06:00 CEST niet',
  not tmc.vrij_trainen_trainer_present('2026-10-23 04:00+00', '2026-10-23 05:00+00'));
select pg_temp.check_('ma 26 okt: 06:00 UTC = 07:00 CET aanwezig',
  tmc.vrij_trainen_trainer_present('2026-10-26 06:00+00', '2026-10-26 07:00+00'));
select pg_temp.check_('ma 26 okt: 05:00 UTC = 06:00 CET niet',
  not tmc.vrij_trainen_trainer_present('2026-10-26 05:00+00', '2026-10-26 06:00+00'));
select pg_temp.check_('zo 25 okt 22:30 UTC = zondag 23:30 lokaal, geen venster',
  not tmc.vrij_trainen_trainer_present('2026-10-25 22:30+00', '2026-10-25 23:30+00'));
select pg_temp.check_('weekdagen in de seed 1 tot en met 5',
  (select array_agg(distinct weekday order by weekday) from tmc.trainer_presence_windows) = array[1,2,3,4,5]::smallint[]);
select pg_temp.check_('dow-conventie: maandag is 1',
  extract(dow from ('2026-10-26 08:00')::timestamp)::int = 1);

-- 3. Slotregels van redeem_trial_code.
select pg_temp.check_('vrij-trainen-code zonder slot geeft slot_required',
  tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000002', 'N', 'a1@test.invalid', '06', true) ->> 'reason' = 'slot_required');
select pg_temp.check_('slot niet op een kwartier geeft slot_invalid',
  tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000002', 'N', 'a1@test.invalid', '06', true, pg_temp.slot('2026-10-26', '10:07')) ->> 'reason' = 'slot_invalid');
select pg_temp.check_('11:15 geeft outside_presence',
  tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000002', 'N', 'a1@test.invalid', '06', true, pg_temp.slot('2026-10-26', '11:15')) ->> 'reason' = 'outside_presence');
select pg_temp.check_('20:15 wordt geweigerd',
  tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000002', 'N', 'a1@test.invalid', '06', true, pg_temp.slot('2026-10-26', '20:15')) ->> 'reason' in ('outside_presence', 'slot_outside_session'));
select pg_temp.check_('weekend geeft outside_presence of geen sessie',
  coalesce(tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000002', 'N', 'a1@test.invalid', '06', true, pg_temp.slot('2026-10-24', '09:00')) ->> 'reason', '') <> '');
select pg_temp.check_('vrij-trainen-code op yogales geeft scope_mismatch',
  tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000003', 'N', 'a2@test.invalid', '06', true) ->> 'reason' = 'scope_mismatch');
select pg_temp.check_('groepscode op vrij trainen geeft scope_mismatch',
  tmc.redeem_trial_code('TVTGROEP', 'd9000000-0000-4000-8000-000000000002', 'N', 'a2@test.invalid', '06', true) ->> 'reason' = 'scope_mismatch');

-- 4. Geldig uur: precies 60 minuten, de boeking heeft het slot, geen prijs.
create temp table r1 as select tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000002', 'N', 'a3@test.invalid', '06', false, pg_temp.slot('2026-10-26', '18:00')) j;
select pg_temp.check_('18:00 slaagt', (select (j ->> 'ok')::boolean from r1));
select pg_temp.check_('slot is precies 60 minuten', (select (j ->> 'slot_end_at')::timestamptz - (j ->> 'slot_start_at')::timestamptz from r1) = interval '60 minutes');
select pg_temp.check_('boeking gratis, paid, zonder Mollie',
  (select price_paid_cents = 0 and status = 'paid' and mollie_payment_id is null and slot_start_at = pg_temp.slot('2026-10-26', '18:00') from tmc.trial_bookings where email = 'a3@test.invalid'));
select pg_temp.check_('hetzelfde adres, ander slot, dezelfde dag: email_already_booked',
  tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000002', 'N', 'a3@test.invalid', '06', false, pg_temp.slot('2026-10-26', '09:00')) ->> 'reason' = 'email_already_booked');
select pg_temp.check_('constraint: geen 45 minuten',
  (select count(*) = 0 from (select 1) x where exists (select 1 from tmc.trial_bookings where slot_end_at - slot_start_at <> interval '60 minutes')));

-- 5. Maximum van 5 met een mix van leden en proefbezoekers; is_test telt niet mee.
do $$
declare i int; v jsonb;
begin
  -- Leden 1 en 2 boeken 10:00 via de RPC, proefbezoekers vullen aan tot 5.
  for i in 1..2 loop
    perform set_config('request.jwt.claims', json_build_object('sub', 'a9000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v := tmc.book_class_session('d9000000-0000-4000-8000-000000000004', false, false, pg_temp.slot(pg_temp.nm(), '10:00'), 60);
    execute 'reset role';
    if not (v ->> 'ok')::boolean then raise exception 'lid % kon niet boeken: %', i, v; end if;
  end loop;
  for i in 1..3 loop
    v := tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000004', 'N', 'p' || i || '@test.invalid', '06', false, pg_temp.slot(pg_temp.nm(), '10:00'));
    if not (v ->> 'ok')::boolean then raise exception 'proef % kon niet boeken: %', i, v; end if;
  end loop;
end $$;
select pg_temp.check_('piek is 5 (2 leden + 3 proefbezoekers)',
  (select peak from tmc.vrij_trainen_slot_peak('d9000000-0000-4000-8000-000000000004', pg_temp.slot(pg_temp.nm(), '10:00'), pg_temp.slot(pg_temp.nm(), '10:15'))) = 5);
select pg_temp.check_('zesde proefbezoeker krijgt slot_full',
  tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000004', 'N', 'p6@test.invalid', '06', false, pg_temp.slot(pg_temp.nm(), '10:00')) ->> 'reason' = 'slot_full');
select pg_temp.check_('een overlappend slot 10:30 is ook vol',
  tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000004', 'N', 'p7@test.invalid', '06', false, pg_temp.slot(pg_temp.nm(), '10:30')) ->> 'reason' = 'slot_full');
select pg_temp.check_('een testboeking telt niet mee en slaagt',
  (tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000004', 'N', 'ptest@test.invalid', '06', true, pg_temp.slot(pg_temp.nm(), '10:00')) ->> 'ok')::boolean);
select pg_temp.check_('piek blijft 5 na de testboeking',
  (select peak from tmc.vrij_trainen_slot_peak('d9000000-0000-4000-8000-000000000004', pg_temp.slot(pg_temp.nm(), '10:00'), pg_temp.slot(pg_temp.nm(), '10:15'))) = 5);
select tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000004', 'N', 'a9@test.invalid', '06', false, pg_temp.slot(pg_temp.nm(), '18:00')) is not null as _;
-- 6. Ledenbeschikbaarheid telt proefbezoekers mee (als authenticated lid).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-4000-8000-000000000005","role":"authenticated"}', true) is not null as _;
select pg_temp.check_('een lid krijgt slot_full op het volle kwartier',
  tmc.book_class_session('d9000000-0000-4000-8000-000000000004', false, false, pg_temp.slot(pg_temp.nm(), '10:00'), 60) ->> 'reason' = 'slot_full');
select pg_temp.check_('vrij_trainen_availability voor leden: booked 5, available 0 om 10:00',
  (select booked = 5 and available = 0 from tmc.vrij_trainen_availability(pg_temp.nm()::date) where quarter_start = pg_temp.slot(pg_temp.nm(), '10:00')));
select pg_temp.check_('vrij_trainen_availability voor leden: 18:00 heeft 1 proefbezoeker',
  (select booked = 1 and available = 4 from tmc.vrij_trainen_availability(pg_temp.nm()::date) where quarter_start = pg_temp.slot(pg_temp.nm(), '18:00')));
reset role;

-- 7. Bezoekersbeschikbaarheid: alleen kwartieren binnen de aanwezigheid.
select pg_temp.check_('bezoekersbeschikbaarheid: geen kwartier om 12:00 en 16:45',
  (select count(*) = 0 from tmc.vrij_trainen_visitor_availability(pg_temp.nm()::date, pg_temp.nm()::date)
   where quarter_start in (pg_temp.slot(pg_temp.nm(), '12:00'), pg_temp.slot(pg_temp.nm(), '16:45'))));
select pg_temp.check_('bezoekersbeschikbaarheid: wel 11:45 en 17:00',
  (select count(*) = 2 from tmc.vrij_trainen_visitor_availability(pg_temp.nm()::date, pg_temp.nm()::date)
   where quarter_start in (pg_temp.slot(pg_temp.nm(), '11:45'), pg_temp.slot(pg_temp.nm(), '17:00'))));
select pg_temp.check_('bezoekersbeschikbaarheid: 10:00 heeft booked 5 (zonder test)',
  (select booked = 5 and available = 0 from tmc.vrij_trainen_visitor_availability(pg_temp.nm()::date, pg_temp.nm()::date) where quarter_start = pg_temp.slot(pg_temp.nm(), '10:00')));
select pg_temp.check_('bezoekersbeschikbaarheid: het weekend heeft niets',
  (select count(*) = 0 from tmc.vrij_trainen_visitor_availability('2026-10-24', '2026-10-25')));

-- 8. Annuleren geeft het gebruik terug en het plekje vrij; termijn vanaf het slot.
update tmc.trial_bookings set status = 'cancelled', cancelled_at = now() where email = 'p1@test.invalid';
select pg_temp.check_('na annuleren is de piek 4 en kan een ander weer boeken',
  (tmc.redeem_trial_code('TVTVRIJ', 'd9000000-0000-4000-8000-000000000004', 'N', 'p8@test.invalid', '06', false, pg_temp.slot(pg_temp.nm(), '10:00')) ->> 'ok')::boolean);

-- 9. Een betaalde proefboeking op vrij trainen blijft onmogelijk.
do $$
begin
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, is_test)
  values ('d9000000-0000-4000-8000-000000000002', 'B', 'betaald@test.invalid', '06', 1700, 'pending', true);
  raise exception 'betaalde proefboeking op vrij trainen had moeten falen';
exception when raise_exception then
  if sqlerrm <> 'session_not_eligible' then raise; end if;
end $$;
select 'PASS betaalde proefboeking op vrij trainen geweigerd';

-- 10. Precies een redeem_trial_code en zes benoemde argumenten werken.
select pg_temp.check_('precies een redeem_trial_code',
  (select count(*) = 1 from pg_proc where pronamespace = 'tmc'::regnamespace and proname = 'redeem_trial_code'));
select pg_temp.check_('zes benoemde argumenten werken',
  tmc.redeem_trial_code(p_code => 'BESTAATNIET', p_session_id => 'd9000000-0000-4000-8000-000000000002', p_name => 'x', p_email => 'x@test.invalid', p_phone => '1', p_is_test => true) ->> 'reason' = 'code_invalid');

rollback;
SQL
)
echo "$OUT"
if echo "$OUT" | grep -q '^FAIL'; then
  echo "TESTS GEFAALD"; exit 1
fi
echo "ALLE DB-TESTS GESLAAGD ($(echo "$OUT" | grep -c '^PASS') checks)"
