-- Tests voor fix/trainer-pt-scope (migratie 20260928110000_trainer_pt_scope.sql).
--
-- Draaien als postgres tegen een LOKALE of branch-database waarop de
-- migratieketen is afgespeeld (supabase db start in de worktree), niet tegen
-- productie. Eigen wegwerp-fixtures (auth.users met profielen via de trigger,
-- twee trainers, pijler, lestype, les, boeking, PT-sessies, PT-boekingen,
-- annuleringsverzoeken), alles in een transactie die eindigt in ROLLBACK.
--
-- Rollen in de test:
--   lid       a1..01  rol member
--   PT-trainer a1..03  rol trainer, trainers-rij is_pt_available = true (rij b1..03)
--   trainer B  a1..04  rol trainer, trainers-rij is_pt_available = false (rij b1..04):
--              alleen kettlebell-lessen, geen PT
--   admin     a1..06  rol admin, geen eigen trainers-rij
--
-- Negatieve tests zitten in DO-blokken die de verwachte weigering
-- (SQLSTATE 42501 uit de RPC-gate, of een not_found-uitkomst) omzetten in een
-- PASS-notice en anders een FAIL-exception raisen, waarop het script stopt
-- (ON_ERROR_STOP). Positieve tests asserteren de uitkomst.
--
-- Uitvoeren:
--   docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < scripts/test-trainer-pt-scope.sql
-- Verwacht: alleen PASS-notices en aan het eind "ALLE TESTS GESLAAGD".

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- Fixtures (als postgres)
-- ---------------------------------------------------------------------------
insert into tmc.class_pillars (code, name_nl, age_category, display_order)
values ('kettlebell', 'Kettlebell', 'adult', 999)
on conflict (code) do nothing;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ps-lid@test.invalid',      '{"provider":"email","providers":["email"]}', '{"first_name":"Lid","last_name":"Test"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ps-pt@test.invalid',       '{"provider":"email","providers":["email"]}', '{"first_name":"Pt","last_name":"Trainer"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ps-trainerb@test.invalid', '{"provider":"email","providers":["email"]}', '{"first_name":"B","last_name":"Trainer"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ps-admin@test.invalid',    '{"provider":"email","providers":["email"]}', '{"first_name":"Admin","last_name":"Test"}', now(), now());

update tmc.profiles set role = 'trainer' where id in ('a1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000004');
update tmc.profiles set role = 'admin'   where id = 'a1000000-0000-4000-8000-000000000006';

insert into tmc.trainers (id, profile_id, display_name, slug, is_active, is_pt_available, pillar_specialties)
values
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'PT Trainer', 'ps-pt',       true, true,  '{}'),
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'Trainer B',  'ps-trainerb', true, false, '{kettlebell}');

-- Les van trainer B met het lid als deelnemer (het niet-PT-werk dat moet blijven werken).
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity)
values ('c1000000-0000-4000-8000-000000000001', 'ps-test-les', 'PS-testles', 'kettlebell', 'adult', 6);

insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
values ('d1000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000004', 'kettlebell', 'adult', now() + interval '2 days', now() + interval '2 days 1 hour', 6, 'scheduled');

insert into tmc.bookings (id, profile_id, session_id, status, iso_year, iso_week, session_date, pillar)
values ('e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-00000000000a', 'booked',
  extract(isoyear from now() + interval '2 days')::int, extract(week from now() + interval '2 days')::int, (now() + interval '2 days')::date, 'kettlebell');

-- PT-sessies: per trainer een sessie in het verleden (aanwezigheid) en een in
-- de toekomst (verzetten, annuleren). De sessies van trainer B bestaan als
-- fixture (alsof de PT-vlag later is uitgezet); een trainer zonder PT mag er
-- niets meer mee.
insert into tmc.pt_sessions (id, trainer_id, kind, format, start_at, end_at, duration_min, mode, capacity, status)
values
  ('f1000000-0000-4000-8000-000000000031', 'b1000000-0000-4000-8000-000000000003', 'bookable', 'one_on_one', now() - interval '2 hours', now() - interval '1 hour', 60, 'studio', 1, 'scheduled'),
  ('f1000000-0000-4000-8000-000000000032', 'b1000000-0000-4000-8000-000000000003', 'bookable', 'one_on_one', now() + interval '3 days', now() + interval '3 days 1 hour', 60, 'studio', 1, 'scheduled'),
  ('f1000000-0000-4000-8000-000000000041', 'b1000000-0000-4000-8000-000000000004', 'bookable', 'one_on_one', now() - interval '2 hours', now() - interval '1 hour', 60, 'studio', 1, 'scheduled'),
  ('f1000000-0000-4000-8000-000000000042', 'b1000000-0000-4000-8000-000000000004', 'bookable', 'one_on_one', now() + interval '3 days', now() + interval '3 days 1 hour', 60, 'studio', 1, 'scheduled');

insert into tmc.pt_bookings (id, profile_id, pt_session_id, price_paid_cents, status)
values
  ('f2000000-0000-4000-8000-000000000031', 'a1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000031', 9500, 'booked'),
  ('f2000000-0000-4000-8000-000000000032', 'a1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000032', 9500, 'booked'),
  ('f2000000-0000-4000-8000-000000000041', 'a1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000041', 9500, 'booked'),
  ('f2000000-0000-4000-8000-000000000042', 'a1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000042', 9500, 'booked');

insert into tmc.pt_cancellation_requests (id, pt_booking_id, profile_id, reason, status)
values
  ('f3000000-0000-4000-8000-000000000032', 'f2000000-0000-4000-8000-000000000032', 'a1000000-0000-4000-8000-000000000001', 'ziek', 'pending'),
  ('f3000000-0000-4000-8000-000000000042', 'f2000000-0000-4000-8000-000000000042', 'a1000000-0000-4000-8000-000000000001', 'ziek', 'pending');

create or replace function pg_temp.als(p_role text, p_sub uuid) returns void language plpgsql as $$
begin
  execute format('set role %I', p_role);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', p_role)::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Trainer B (rol trainer, geen PT): geen enkele PT-RPC, wel eigen lessen
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a1000000-0000-4000-8000-000000000004');

do $$ begin
  if tmc.is_pt_trainer_for() then raise exception 'FAIL 1a: is_pt_trainer_for() is true voor een trainer zonder PT'; end if;
  if tmc.is_pt_trainer_for('b1000000-0000-4000-8000-000000000004') then raise exception 'FAIL 1a: is_pt_trainer_for(eigen id) is true voor een trainer zonder PT'; end if;
  if not tmc.is_staff() then raise exception 'FAIL 1a: is_staff() is false voor een actieve trainer'; end if;
  raise notice 'PASS 1a: trainer zonder PT: is_pt_trainer_for() false, is_staff() blijft true';
end $$;

do $$ begin
  perform tmc.admin_book_pt_for_member('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000004', now() + interval '5 days', 'one_on_one', 'already_paid');
  raise exception 'FAIL 1b: trainer zonder PT kon een PT-sessie boeken';
exception when insufficient_privilege then
  raise notice 'PASS 1b: admin_book_pt_for_member geweigerd voor trainer zonder PT (%)', sqlerrm;
end $$;

do $$ begin
  perform tmc.admin_plan_pt_program('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000004', 'studio', now() + interval '5 days', now() + interval '7 days', null, 'already_paid');
  raise exception 'FAIL 1c: trainer zonder PT kon een programma plannen';
exception when insufficient_privilege then
  raise notice 'PASS 1c: admin_plan_pt_program geweigerd voor trainer zonder PT';
end $$;

do $$ begin
  perform * from tmc.get_pt_busy('b1000000-0000-4000-8000-000000000004', now() - interval '1 day', now() + interval '10 days');
  raise exception 'FAIL 1d: trainer zonder PT kon bezette tijden lezen';
exception when insufficient_privilege then
  raise notice 'PASS 1d: get_pt_busy geweigerd voor trainer zonder PT';
end $$;

do $$ begin
  perform tmc.create_pt_block(now() + interval '6 days', now() + interval '6 days 1 hour', 'b1000000-0000-4000-8000-000000000004', 'test');
  raise exception 'FAIL 1e: trainer zonder PT kon een blok aanmaken';
exception when insufficient_privilege then
  raise notice 'PASS 1e: create_pt_block geweigerd voor trainer zonder PT';
end $$;

do $$ begin
  perform tmc.mark_pt_attendance('f2000000-0000-4000-8000-000000000041', 'attended');
  raise exception 'FAIL 1f: trainer zonder PT kon PT-aanwezigheid registreren';
exception when insufficient_privilege then
  raise notice 'PASS 1f: mark_pt_attendance geweigerd voor trainer zonder PT';
end $$;

do $$ begin
  perform tmc.delete_pt_block('f1000000-0000-4000-8000-000000000041');
  raise exception 'FAIL 1g: delete_pt_block niet geweigerd';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform tmc.complete_pt_intake('f1000000-0000-4000-8000-000000000041');
  raise exception 'FAIL 1g: complete_pt_intake niet geweigerd';
exception when insufficient_privilege then null; end $$;
-- cancel_pt_intake is sinds fix/trainer-no-session-cancel admin-only en
-- antwoordt met reason admin_only in plaats van een gate-exception.
do $$ declare r jsonb; begin
  r := tmc.cancel_pt_intake('f1000000-0000-4000-8000-000000000041');
  if r ->> 'reason' <> 'admin_only' then
    raise exception 'FAIL 1g: cancel_pt_intake gaf % voor trainer zonder PT', r;
  end if;
  raise notice 'PASS 1g: delete_pt_block en complete_pt_intake geweigerd voor trainer zonder PT, cancel_pt_intake admin_only';
end $$;

-- Gedeelde RPC's: de trainer-tak eist PT, dus de eigen (fixture-)sessie is onzichtbaar.
do $$ declare r jsonb; begin
  r := tmc.reschedule_pt('f2000000-0000-4000-8000-000000000042', now() + interval '4 days');
  if coalesce((r ->> 'ok')::boolean, false) or r ->> 'reason' <> 'not_found' then
    raise exception 'FAIL 1h: reschedule_pt gaf % voor trainer zonder PT', r;
  end if;
  r := tmc.reschedule_pt('f2000000-0000-4000-8000-000000000042', now() + interval '4 days', true, false);
  if r ->> 'reason' <> 'override_not_allowed' then
    raise exception 'FAIL 1h: override door trainer zonder PT gaf %', r;
  end if;
  r := tmc.cancel_pt('f2000000-0000-4000-8000-000000000042');
  if coalesce((r ->> 'ok')::boolean, false) or r ->> 'reason' <> 'admin_only' then
    raise exception 'FAIL 1h: cancel_pt gaf % voor trainer zonder PT', r;
  end if;
  r := tmc.resolve_pt_cancellation('f3000000-0000-4000-8000-000000000042', false);
  if coalesce((r ->> 'ok')::boolean, false) or r ->> 'reason' <> 'admin_only' then
    raise exception 'FAIL 1h: resolve_pt_cancellation gaf % voor trainer zonder PT', r;
  end if;
  raise notice 'PASS 1h: reschedule_pt ziet de sessie van een trainer zonder PT niet (not_found), override geweigerd; cancel_pt en resolve_pt_cancellation admin_only';
end $$;

do $$ declare n int; begin
  select count(*) into n from tmc.pt_cancellation_requests;
  if n <> 0 then raise exception 'FAIL 1i: trainer zonder PT leest % annuleringsverzoeken (verwacht 0)', n; end if;
  raise notice 'PASS 1i: pcr_trainer_read geeft een trainer zonder PT geen annuleringsverzoeken';
end $$;

-- Het niet-PT-werk blijft: eigen les, deelnemers, eigen trainers-rij.
do $$ declare n int; begin
  select count(*) into n from tmc.class_sessions where trainer_id = 'b1000000-0000-4000-8000-000000000004';
  if n <> 1 then raise exception 'FAIL 1j: trainer zonder PT ziet % eigen lessen (verwacht 1)', n; end if;
  select count(*) into n from tmc.bookings where session_id = 'd1000000-0000-4000-8000-00000000000a';
  if n <> 1 then raise exception 'FAIL 1j: trainer zonder PT ziet % deelnemers op de eigen les (verwacht 1)', n; end if;
  select count(*) into n from tmc.trainers where profile_id = auth.uid();
  if n <> 1 then raise exception 'FAIL 1j: trainer zonder PT leest de eigen trainers-rij niet'; end if;
  raise notice 'PASS 1j: trainer zonder PT leest eigen les, deelnemers en eigen trainers-rij (aanwezigheid loopt via requireTrainerOrAdmin, is_staff() blijft true)';
end $$;

-- ---------------------------------------------------------------------------
-- 2. PT-trainer: alles op de eigen trainer_id, niets op die van een collega
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.als('authenticated', 'a1000000-0000-4000-8000-000000000003');

do $$ begin
  if not tmc.is_pt_trainer_for() then raise exception 'FAIL 2a: is_pt_trainer_for() is false voor een PT-trainer'; end if;
  if not tmc.is_pt_trainer_for('b1000000-0000-4000-8000-000000000003') then raise exception 'FAIL 2a: is_pt_trainer_for(eigen id) is false'; end if;
  if tmc.is_pt_trainer_for('b1000000-0000-4000-8000-000000000004') then raise exception 'FAIL 2a: is_pt_trainer_for(collega) is true'; end if;
  raise notice 'PASS 2a: PT-trainer: is_pt_trainer_for() en eigen id true, collega false';
end $$;

do $$ begin
  perform tmc.admin_book_pt_for_member('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000004', now() + interval '5 days', 'one_on_one', 'already_paid');
  raise exception 'FAIL 2b: PT-trainer kon boeken op de agenda van een collega';
exception when insufficient_privilege then
  raise notice 'PASS 2b: admin_book_pt_for_member op een collega geweigerd';
end $$;
do $$ begin
  perform tmc.admin_plan_pt_program('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000004', 'studio', now() + interval '5 days', now() + interval '7 days', null, 'already_paid');
  raise exception 'FAIL 2b: PT-trainer kon een programma plannen bij een collega';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform * from tmc.get_pt_busy('b1000000-0000-4000-8000-000000000004', now() - interval '1 day', now() + interval '10 days');
  raise exception 'FAIL 2b: PT-trainer kon bezette tijden van een collega lezen';
exception when insufficient_privilege then
  raise notice 'PASS 2b: admin_plan_pt_program en get_pt_busy op een collega geweigerd';
end $$;

do $$ declare r jsonb; begin
  r := tmc.admin_book_pt_for_member('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003', now() + interval '5 days', 'one_on_one', 'already_paid');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 2c: boeken op eigen agenda gaf %', r; end if;
  raise notice 'PASS 2c: PT-trainer boekt op de eigen agenda';
end $$;

do $$ declare n int; begin
  select count(*) into n from tmc.get_pt_busy('b1000000-0000-4000-8000-000000000003', now() - interval '1 day', now() + interval '10 days');
  if n < 2 then raise exception 'FAIL 2d: get_pt_busy op eigen agenda gaf % rijen', n; end if;
  raise notice 'PASS 2d: PT-trainer leest eigen bezette tijden (% rijen)', n;
end $$;

do $$ declare r jsonb; begin
  r := tmc.create_pt_block(now() + interval '6 days', now() + interval '6 days 1 hour', 'b1000000-0000-4000-8000-000000000003', 'eigen blok');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 2e: eigen blok gaf %', r; end if;
  r := tmc.create_pt_block(now() + interval '6 days', now() + interval '6 days 1 hour', 'b1000000-0000-4000-8000-000000000004', 'andermans blok');
  if r ->> 'reason' <> 'not_own_agenda' then raise exception 'FAIL 2e: blok op collega gaf %', r; end if;
  raise notice 'PASS 2e: PT-trainer blokkeert eigen agenda, collega-agenda blijft not_own_agenda';
end $$;

do $$ declare r jsonb; begin
  r := tmc.mark_pt_attendance('f2000000-0000-4000-8000-000000000031', 'attended');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 2f: aanwezigheid eigen sessie gaf %', r; end if;
  r := tmc.mark_pt_attendance('f2000000-0000-4000-8000-000000000041', 'attended');
  if r ->> 'reason' <> 'not_found' then raise exception 'FAIL 2f: aanwezigheid op collega-sessie gaf %', r; end if;
  raise notice 'PASS 2f: PT-trainer registreert aanwezigheid op eigen sessie, collega-sessie blijft not_found';
end $$;

do $$ declare r jsonb; begin
  r := tmc.reschedule_pt('f2000000-0000-4000-8000-000000000032', now() + interval '4 days', true, true);
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 2g: verzetten eigen boeking met override gaf %', r; end if;
  r := tmc.reschedule_pt('f2000000-0000-4000-8000-000000000042', now() + interval '4 days');
  if r ->> 'reason' <> 'not_found' then raise exception 'FAIL 2g: verzetten collega-boeking gaf %', r; end if;
  raise notice 'PASS 2g: PT-trainer verzet eigen boeking (met override), collega-boeking blijft not_found';
end $$;

-- Sinds fix/trainer-no-session-cancel (20260928120000) is afhandelen en
-- annuleren admin-only; de PT-trainer krijgt admin_only, ook op de eigen sessie.
do $$ declare n int; r jsonb; begin
  select count(*) into n from tmc.pt_cancellation_requests;
  if n <> 1 then raise exception 'FAIL 2h: PT-trainer leest % annuleringsverzoeken (verwacht 1, alleen eigen sessie)', n; end if;
  r := tmc.resolve_pt_cancellation('f3000000-0000-4000-8000-000000000042', false);
  if r ->> 'reason' <> 'admin_only' then raise exception 'FAIL 2h: resolve op collega-verzoek gaf %', r; end if;
  r := tmc.resolve_pt_cancellation('f3000000-0000-4000-8000-000000000032', false, null, 'nee');
  if r ->> 'reason' <> 'admin_only' then raise exception 'FAIL 2h: resolve op eigen verzoek gaf %', r; end if;
  raise notice 'PASS 2h: pcr_trainer_read alleen het eigen verzoek; resolve_pt_cancellation admin_only voor een PT-trainer';
end $$;

do $$ declare r jsonb; begin
  r := tmc.cancel_pt('f2000000-0000-4000-8000-000000000042', false);
  if r ->> 'reason' <> 'admin_only' then raise exception 'FAIL 2i: annuleren collega-boeking gaf %', r; end if;
  r := tmc.cancel_pt('f2000000-0000-4000-8000-000000000032', false);
  if r ->> 'reason' <> 'admin_only' then raise exception 'FAIL 2i: annuleren eigen boeking gaf %', r; end if;
  raise notice 'PASS 2i: cancel_pt admin_only voor een PT-trainer, ook op de eigen boeking';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Admin: alles, voor elke trainer (ook een trainer zonder PT-vlag)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.als('authenticated', 'a1000000-0000-4000-8000-000000000006');

do $$ declare r jsonb; n int; begin
  if not tmc.is_pt_trainer_for('b1000000-0000-4000-8000-000000000004') then raise exception 'FAIL 3a: is_pt_trainer_for(trainer B) is false voor admin'; end if;
  r := tmc.admin_book_pt_for_member('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000004', now() + interval '8 days', 'one_on_one', 'already_paid');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 3a: admin boeken op trainer B gaf %', r; end if;
  select count(*) into n from tmc.get_pt_busy('b1000000-0000-4000-8000-000000000004', now() - interval '1 day', now() + interval '10 days');
  if n < 2 then raise exception 'FAIL 3a: get_pt_busy voor admin gaf % rijen', n; end if;
  r := tmc.create_pt_block(now() + interval '9 days', now() + interval '9 days 1 hour', 'b1000000-0000-4000-8000-000000000004', 'admin blok');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 3a: admin blok op trainer B gaf %', r; end if;
  r := tmc.mark_pt_attendance('f2000000-0000-4000-8000-000000000041', 'no_show');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 3a: admin aanwezigheid op trainer B gaf %', r; end if;
  r := tmc.reschedule_pt('f2000000-0000-4000-8000-000000000042', now() + interval '4 days 2 hours', true, true);
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 3a: admin verzetten op trainer B gaf %', r; end if;
  r := tmc.resolve_pt_cancellation('f3000000-0000-4000-8000-000000000042', false);
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 3a: admin resolve op trainer B gaf %', r; end if;
  select count(*) into n from tmc.pt_cancellation_requests;
  if n <> 2 then raise exception 'FAIL 3a: admin leest % annuleringsverzoeken (verwacht 2)', n; end if;
  raise notice 'PASS 3a: admin boekt, leest, blokkeert, registreert, verzet en resolvet voor trainer B';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Lid: niets
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.als('authenticated', 'a1000000-0000-4000-8000-000000000001');

do $$ begin
  if tmc.is_pt_trainer_for() then raise exception 'FAIL 4a: is_pt_trainer_for() is true voor een lid'; end if;
  perform tmc.admin_book_pt_for_member('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003', now() + interval '5 days', 'one_on_one', 'already_paid');
  raise exception 'FAIL 4a: lid kon een PT-sessie boeken via de staf-RPC';
exception when insufficient_privilege then
  raise notice 'PASS 4a: lid: is_pt_trainer_for() false, staf-RPC geweigerd';
end $$;

do $$ declare r jsonb; begin
  -- De ledenkant van cancel_pt werkt nog: eigen boeking op de (nieuwe) sessie van trainer B.
  r := tmc.cancel_pt((select b.id from tmc.pt_bookings b join tmc.pt_sessions s on s.id = b.pt_session_id
                      where b.profile_id = auth.uid() and s.trainer_id = 'b1000000-0000-4000-8000-000000000004' and b.status = 'booked' and s.start_at > now() order by s.start_at limit 1));
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 4b: lid annuleert eigen boeking gaf %', r; end if;
  -- Restitutiekeuze door een lid blijft geweigerd (boeking op de sessie die de PT-trainer in 2c boekte).
  r := tmc.cancel_pt((select b.id from tmc.pt_bookings b join tmc.pt_sessions s on s.id = b.pt_session_id
                      where b.profile_id = auth.uid() and s.trainer_id = 'b1000000-0000-4000-8000-000000000003' and b.status = 'booked' and s.start_at > now() order by s.start_at limit 1), true);
  if r ->> 'reason' <> 'restitution_not_allowed' then raise exception 'FAIL 4b: restitutiekeuze door lid gaf %', r; end if;
  raise notice 'PASS 4b: lid annuleert eigen boeking, restitutiekeuze blijft staf-only';
end $$;

reset role;
do $$ begin raise notice 'ALLE TESTS GESLAAGD'; end $$;
rollback;
