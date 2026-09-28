-- Tests voor fix/trainer-no-session-cancel (migratie
-- 20260928120000_trainer_no_session_cancel.sql).
--
-- Draaien als postgres tegen een LOKALE of branch-database waarop de
-- migratieketen is afgespeeld (supabase db start in de worktree), niet tegen
-- productie. Eigen wegwerp-fixtures (auth.users met profielen via de trigger,
-- een PT-trainer, pijler, lestype, les met boeking, PT-sessies, PT-boekingen,
-- een annuleringsverzoek, een intake en een blok), alles in een transactie
-- die eindigt in ROLLBACK.
--
-- Rollen in de test:
--   lid        a2..01  rol member
--   PT-trainer a2..03  rol trainer, trainers-rij is_pt_available = true (rij b2..03)
--   admin      a2..06  rol admin, geen eigen trainers-rij
--
-- Negatieve tests zitten in DO-blokken die de verwachte weigering (reason
-- admin_only uit de RPC, of SQLSTATE 42501 uit een ontbrekende grant) omzetten
-- in een PASS-notice en anders een FAIL-exception raisen, waarop het script
-- stopt (ON_ERROR_STOP). Positieve tests asserteren de uitkomst.
--
-- Uitvoeren:
--   docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < scripts/test-trainer-no-session-cancel.sql
-- Verwacht: alleen PASS-notices, twee grant-overzichten en aan het eind
-- "ALLE TESTS GESLAAGD".

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
  ('a2000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nsc-lid@test.invalid',   '{"provider":"email","providers":["email"]}', '{"first_name":"Lid","last_name":"Test"}', now(), now()),
  ('a2000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nsc-pt@test.invalid',    '{"provider":"email","providers":["email"]}', '{"first_name":"Pt","last_name":"Trainer"}', now(), now()),
  ('a2000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nsc-admin@test.invalid', '{"provider":"email","providers":["email"]}', '{"first_name":"Admin","last_name":"Test"}', now(), now());

update tmc.profiles set role = 'trainer' where id = 'a2000000-0000-4000-8000-000000000003';
update tmc.profiles set role = 'admin'   where id = 'a2000000-0000-4000-8000-000000000006';

insert into tmc.trainers (id, profile_id, display_name, slug, is_active, is_pt_available, pillar_specialties)
values ('b2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'PT Trainer', 'nsc-pt', true, true, '{kettlebell}');

-- Groepsles van de PT-trainer met het lid als deelnemer.
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity)
values ('c2000000-0000-4000-8000-000000000001', 'nsc-test-les', 'NSC-testles', 'kettlebell', 'adult', 6);

insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
values ('d2000000-0000-4000-8000-00000000000a', 'c2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000003', 'kettlebell', 'adult', now() + interval '2 days', now() + interval '2 days 1 hour', 6, 'scheduled');

insert into tmc.bookings (id, profile_id, session_id, status, iso_year, iso_week, session_date, pillar)
values ('e2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-00000000000a', 'booked',
  extract(isoyear from now() + interval '2 days')::int, extract(week from now() + interval '2 days')::int, (now() + interval '2 days')::date, 'kettlebell');

-- PT-sessies van de PT-trainer, allemaal in de toekomst:
--   ..31 geboekt door het lid (het lid annuleert zelf)
--   ..32 geboekt door het lid (de admin annuleert direct)
--   ..33 geboekt door het lid, met een openstaand annuleringsverzoek (de admin keurt goed)
--   ..34 intake met prospect (de admin annuleert)
--   ..35 geblokkeerde tijd (de trainer verwijdert het eigen blok)
insert into tmc.pt_sessions (id, trainer_id, kind, format, start_at, end_at, duration_min, mode, capacity, status, prospect_name, prospect_email)
values
  ('f4000000-0000-4000-8000-000000000031', 'b2000000-0000-4000-8000-000000000003', 'bookable', 'one_on_one', now() + interval '3 days',         now() + interval '3 days 1 hour',         60, 'studio', 1, 'scheduled', null, null),
  ('f4000000-0000-4000-8000-000000000032', 'b2000000-0000-4000-8000-000000000003', 'bookable', 'one_on_one', now() + interval '4 days',         now() + interval '4 days 1 hour',         60, 'studio', 1, 'scheduled', null, null),
  ('f4000000-0000-4000-8000-000000000033', 'b2000000-0000-4000-8000-000000000003', 'bookable', 'one_on_one', now() + interval '5 days',         now() + interval '5 days 1 hour',         60, 'studio', 1, 'scheduled', null, null),
  ('f4000000-0000-4000-8000-000000000034', 'b2000000-0000-4000-8000-000000000003', 'intake',   null,         now() + interval '6 days',         now() + interval '6 days 30 minutes',     30, null,     1, 'scheduled', 'Prospect Test', 'nsc-prospect@test.invalid'),
  ('f4000000-0000-4000-8000-000000000035', 'b2000000-0000-4000-8000-000000000003', 'block',    null,         now() + interval '7 days',         now() + interval '7 days 1 hour',         60, null,     1, 'scheduled', null, null);

insert into tmc.pt_bookings (id, profile_id, pt_session_id, price_paid_cents, status)
values
  ('f5000000-0000-4000-8000-000000000031', 'a2000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000031', 9500, 'booked'),
  ('f5000000-0000-4000-8000-000000000032', 'a2000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000032', 9500, 'booked'),
  ('f5000000-0000-4000-8000-000000000033', 'a2000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000033', 9500, 'booked');

insert into tmc.pt_cancellation_requests (id, pt_booking_id, profile_id, reason, status)
values ('f6000000-0000-4000-8000-000000000033', 'f5000000-0000-4000-8000-000000000033', 'a2000000-0000-4000-8000-000000000001', 'ziek', 'pending');

create or replace function pg_temp.als(p_role text, p_sub uuid) returns void language plpgsql as $$
begin
  execute format('set role %I', p_role);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', p_role)::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 1. PT-trainer: annuleren en afhandelen geweigerd met admin_only, ook op
--    de eigen sessie; eigen blok verwijderen blijft werken
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a2000000-0000-4000-8000-000000000003');

do $$ declare r jsonb; begin
  if not tmc.is_pt_trainer_for() then raise exception 'FAIL 1a: fixture is geen PT-trainer'; end if;
  r := tmc.cancel_pt('f5000000-0000-4000-8000-000000000032', false);
  if coalesce((r ->> 'ok')::boolean, false) or r ->> 'reason' <> 'admin_only' then
    raise exception 'FAIL 1a: cancel_pt gaf % voor de PT-trainer van de sessie', r;
  end if;
  r := tmc.cancel_pt('f5000000-0000-4000-8000-000000000032');
  if r ->> 'reason' <> 'admin_only' then
    raise exception 'FAIL 1a: cancel_pt zonder restitutiekeuze gaf % voor de PT-trainer', r;
  end if;
  raise notice 'PASS 1a: cancel_pt weigert de PT-trainer van de sessie met admin_only';
end $$;

do $$ declare r jsonb; begin
  r := tmc.resolve_pt_cancellation('f6000000-0000-4000-8000-000000000033', true, false);
  if coalesce((r ->> 'ok')::boolean, false) or r ->> 'reason' <> 'admin_only' then
    raise exception 'FAIL 1b: resolve_pt_cancellation (goedkeuren) gaf % voor de PT-trainer', r;
  end if;
  r := tmc.resolve_pt_cancellation('f6000000-0000-4000-8000-000000000033', false);
  if r ->> 'reason' <> 'admin_only' then
    raise exception 'FAIL 1b: resolve_pt_cancellation (afwijzen) gaf % voor de PT-trainer', r;
  end if;
  raise notice 'PASS 1b: resolve_pt_cancellation weigert de PT-trainer met admin_only (goedkeuren en afwijzen)';
end $$;

do $$ declare r jsonb; begin
  r := tmc.cancel_pt_intake('f4000000-0000-4000-8000-000000000034');
  if coalesce((r ->> 'ok')::boolean, false) or r ->> 'reason' <> 'admin_only' then
    raise exception 'FAIL 1c: cancel_pt_intake gaf % voor de PT-trainer van de intake', r;
  end if;
  raise notice 'PASS 1c: cancel_pt_intake weigert de PT-trainer met admin_only';
end $$;

do $$ declare r jsonb; begin
  r := tmc.delete_pt_block('f4000000-0000-4000-8000-000000000035');
  if not coalesce((r ->> 'ok')::boolean, false) then
    raise exception 'FAIL 1d: delete_pt_block op het eigen blok gaf %', r;
  end if;
  raise notice 'PASS 1d: delete_pt_block blijft werken voor de PT-trainer op het eigen blok';
end $$;

-- Niets is stiekem gewijzigd: alle drie de boekingen en de intake staan er nog.
do $$ declare n int; begin
  select count(*) into n from tmc.pt_bookings where status = 'booked';
  if n <> 3 then raise exception 'FAIL 1e: de PT-trainer ziet % geboekte boekingen (verwacht 3)', n; end if;
  select count(*) into n from tmc.pt_sessions where kind = 'intake' and status = 'scheduled';
  if n <> 1 then raise exception 'FAIL 1e: de intake is verdwenen'; end if;
  raise notice 'PASS 1e: na de geweigerde aanroepen staan de drie boekingen en de intake ongewijzigd';
end $$;

-- ---------------------------------------------------------------------------
-- 2. authenticated met trainer-claims: geen directe schrijfweg via REST
-- ---------------------------------------------------------------------------
do $$ begin
  update tmc.class_sessions set status = 'cancelled' where id = 'd2000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 2a: UPDATE op class_sessions niet geweigerd';
exception when insufficient_privilege then
  raise notice 'PASS 2a: UPDATE op class_sessions geweigerd (%)', sqlerrm;
end $$;
do $$ begin
  delete from tmc.class_sessions where id = 'd2000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 2b: DELETE op class_sessions niet geweigerd';
exception when insufficient_privilege then
  raise notice 'PASS 2b: DELETE op class_sessions geweigerd';
end $$;
do $$ begin
  update tmc.pt_sessions set status = 'cancelled' where id = 'f4000000-0000-4000-8000-000000000032';
  raise exception 'FAIL 2c: UPDATE op pt_sessions niet geweigerd';
exception when insufficient_privilege then
  raise notice 'PASS 2c: UPDATE op pt_sessions geweigerd';
end $$;
do $$ begin
  delete from tmc.pt_sessions where id = 'f4000000-0000-4000-8000-000000000032';
  raise exception 'FAIL 2d: DELETE op pt_sessions niet geweigerd';
exception when insufficient_privilege then
  raise notice 'PASS 2d: DELETE op pt_sessions geweigerd';
end $$;
do $$ begin
  insert into tmc.pt_bookings (profile_id, pt_session_id, price_paid_cents, status)
  values ('a2000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000032', 0, 'booked');
  raise exception 'FAIL 2e: INSERT op pt_bookings niet geweigerd';
exception when insufficient_privilege then
  raise notice 'PASS 2e: INSERT op pt_bookings geweigerd';
end $$;
do $$ begin
  update tmc.pt_bookings set status = 'cancelled' where id = 'f5000000-0000-4000-8000-000000000032';
  raise exception 'FAIL 2f: UPDATE op pt_bookings niet geweigerd';
exception when insufficient_privilege then
  raise notice 'PASS 2f: UPDATE op pt_bookings geweigerd';
end $$;
do $$ begin
  delete from tmc.pt_bookings where id = 'f5000000-0000-4000-8000-000000000032';
  raise exception 'FAIL 2g: DELETE op pt_bookings niet geweigerd';
exception when insufficient_privilege then
  raise notice 'PASS 2g: DELETE op pt_bookings geweigerd';
end $$;

-- Lezen blijft: de eigen les, de eigen PT-sessies en de eigen PT-boekingen.
do $$ declare n int; begin
  select count(*) into n from tmc.class_sessions where trainer_id = 'b2000000-0000-4000-8000-000000000003';
  if n <> 1 then raise exception 'FAIL 2h: trainer leest % eigen lessen (verwacht 1)', n; end if;
  select count(*) into n from tmc.pt_sessions where trainer_id = 'b2000000-0000-4000-8000-000000000003';
  if n <> 4 then raise exception 'FAIL 2h: trainer leest % eigen PT-sessies (verwacht 4)', n; end if;
  select count(*) into n from tmc.pt_bookings;
  if n <> 3 then raise exception 'FAIL 2h: trainer leest % PT-boekingen op eigen sessies (verwacht 3)', n; end if;
  raise notice 'PASS 2h: trainer leest eigen les, eigen PT-sessies en de boekingen daarop nog gewoon';
end $$;

-- ---------------------------------------------------------------------------
-- 3. anon: geen EXECUTE meer op de vier historisch-PUBLIC RPC's
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.als('anon', null);

do $$ begin
  perform tmc.cancel_pt_intake('f4000000-0000-4000-8000-000000000034');
  raise exception 'FAIL 3a: anon kon cancel_pt_intake aanroepen';
exception when insufficient_privilege then
  raise notice 'PASS 3a: anon op cancel_pt_intake: %', sqlerrm;
end $$;
do $$ begin
  perform tmc.complete_pt_intake('f4000000-0000-4000-8000-000000000034');
  raise exception 'FAIL 3b: anon kon complete_pt_intake aanroepen';
exception when insufficient_privilege then
  raise notice 'PASS 3b: anon op complete_pt_intake: %', sqlerrm;
end $$;
do $$ begin
  perform tmc.create_pt_block(now() + interval '8 days', now() + interval '8 days 1 hour', 'b2000000-0000-4000-8000-000000000003', 'anon');
  raise exception 'FAIL 3c: anon kon create_pt_block aanroepen';
exception when insufficient_privilege then
  raise notice 'PASS 3c: anon op create_pt_block: %', sqlerrm;
end $$;
do $$ begin
  perform tmc.delete_pt_block('f4000000-0000-4000-8000-000000000035');
  raise exception 'FAIL 3d: anon kon delete_pt_block aanroepen';
exception when insufficient_privilege then
  raise notice 'PASS 3d: anon op delete_pt_block: %', sqlerrm;
end $$;
do $$ begin
  perform tmc.cancel_pt('f5000000-0000-4000-8000-000000000032');
  raise exception 'FAIL 3e: anon kon cancel_pt aanroepen';
exception when insufficient_privilege then
  raise notice 'PASS 3e: anon op cancel_pt: %', sqlerrm;
end $$;
do $$ begin
  perform tmc.resolve_pt_cancellation('f6000000-0000-4000-8000-000000000033', false);
  raise exception 'FAIL 3f: anon kon resolve_pt_cancellation aanroepen';
exception when insufficient_privilege then
  raise notice 'PASS 3f: anon op resolve_pt_cancellation: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Lid: de eigen boeking annuleren werkt nog, restitutiekeuze blijft dicht
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.als('authenticated', 'a2000000-0000-4000-8000-000000000001');

do $$ declare r jsonb; begin
  r := tmc.cancel_pt('f5000000-0000-4000-8000-000000000031', true);
  if r ->> 'reason' <> 'restitution_not_allowed' then
    raise exception 'FAIL 4a: restitutiekeuze door het lid gaf %', r;
  end if;
  r := tmc.cancel_pt('f5000000-0000-4000-8000-000000000031');
  if not coalesce((r ->> 'ok')::boolean, false) then
    raise exception 'FAIL 4a: lid annuleert eigen boeking gaf %', r;
  end if;
  raise notice 'PASS 4a: lid annuleert de eigen boeking (within_window=%), restitutiekeuze blijft restitution_not_allowed', r ->> 'within_window';
end $$;

do $$ declare r jsonb; begin
  r := tmc.cancel_pt_intake('f4000000-0000-4000-8000-000000000034');
  if r ->> 'reason' <> 'admin_only' then raise exception 'FAIL 4b: cancel_pt_intake door een lid gaf %', r; end if;
  r := tmc.resolve_pt_cancellation('f6000000-0000-4000-8000-000000000033', false);
  if r ->> 'reason' <> 'admin_only' then raise exception 'FAIL 4b: resolve_pt_cancellation door een lid gaf %', r; end if;
  raise notice 'PASS 4b: lid krijgt admin_only op cancel_pt_intake en resolve_pt_cancellation';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Admin: annuleren, afhandelen en intake annuleren slagen
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.als('authenticated', 'a2000000-0000-4000-8000-000000000006');

do $$ declare r jsonb; s text; b text; begin
  r := tmc.cancel_pt('f5000000-0000-4000-8000-000000000032', false);
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 5a: admin cancel_pt gaf %', r; end if;
  if not coalesce((r ->> 'restitution_explicit')::boolean, false) then raise exception 'FAIL 5a: restitution_explicit ontbreekt'; end if;
  select status into s from tmc.pt_sessions where id = 'f4000000-0000-4000-8000-000000000032';
  select status into b from tmc.pt_bookings where id = 'f5000000-0000-4000-8000-000000000032';
  if s <> 'cancelled' or b <> 'cancelled' then raise exception 'FAIL 5a: status na admin-annulering sessie=% boeking=%', s, b; end if;
  raise notice 'PASS 5a: admin annuleert een PT-boeking met expliciete restitutiekeuze, sessie en boeking op cancelled';
end $$;

do $$ declare r jsonb; s text; begin
  r := tmc.resolve_pt_cancellation('f6000000-0000-4000-8000-000000000033', true, false, 'akkoord');
  if not coalesce((r ->> 'ok')::boolean, false) or r ->> 'outcome' <> 'approved' then
    raise exception 'FAIL 5b: admin resolve_pt_cancellation gaf %', r;
  end if;
  select status into s from tmc.pt_cancellation_requests where id = 'f6000000-0000-4000-8000-000000000033';
  if s <> 'approved' then raise exception 'FAIL 5b: verzoekstatus is %', s; end if;
  select status into s from tmc.pt_bookings where id = 'f5000000-0000-4000-8000-000000000033';
  if s <> 'cancelled' then raise exception 'FAIL 5b: boeking na goedkeuring is %', s; end if;
  r := tmc.resolve_pt_cancellation('f6000000-0000-4000-8000-000000000033', true, false);
  if r ->> 'reason' <> 'already_resolved' then raise exception 'FAIL 5b: tweede resolve gaf %', r; end if;
  raise notice 'PASS 5b: admin keurt een annuleringsverzoek goed (boeking cancelled), tweede keer already_resolved';
end $$;

do $$ declare r jsonb; n int; begin
  r := tmc.cancel_pt_intake('f4000000-0000-4000-8000-000000000034');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'FAIL 5c: admin cancel_pt_intake gaf %', r; end if;
  select count(*) into n from tmc.pt_sessions where id = 'f4000000-0000-4000-8000-000000000034';
  if n <> 0 then raise exception 'FAIL 5c: intake staat er nog'; end if;
  r := tmc.cancel_pt_intake('f4000000-0000-4000-8000-000000000034');
  if r ->> 'reason' <> 'not_found' then raise exception 'FAIL 5c: tweede cancel_pt_intake gaf %', r; end if;
  raise notice 'PASS 5c: admin annuleert de intake (harde delete), tweede keer not_found';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Groepsles annuleren door de admin: de bestaande flow (adminCancelSession
--    in src/lib/admin/session-actions.ts) schrijft via service role. Die weg
--    is ongewijzigd en werkt nog.
-- ---------------------------------------------------------------------------
reset role;
set role service_role;

do $$ declare s text; b text; begin
  update tmc.bookings
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'session_cancelled'
  where session_id = 'd2000000-0000-4000-8000-00000000000a' and status = 'booked';
  update tmc.class_sessions
  set status = 'cancelled', cancellation_reason = 'test'
  where id = 'd2000000-0000-4000-8000-00000000000a';
  select status into s from tmc.class_sessions where id = 'd2000000-0000-4000-8000-00000000000a';
  select status into b from tmc.bookings where id = 'e2000000-0000-4000-8000-00000000000a';
  if s <> 'cancelled' or b <> 'cancelled' then raise exception 'FAIL 6a: groepsles-annulering via service role gaf sessie=% boeking=%', s, b; end if;
  raise notice 'PASS 6a: groepsles annuleren via service role (de weg van adminCancelSession) werkt nog';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 7. Grant-overzicht na de migratie (uit de catalogi)
-- ---------------------------------------------------------------------------
select r.routine_name, string_agg(r.grantee, ', ' order by r.grantee) as execute_grantees
from information_schema.routine_privileges r
where r.specific_schema = 'tmc'
  and r.routine_name in ('cancel_pt', 'resolve_pt_cancellation', 'cancel_pt_intake', 'complete_pt_intake', 'create_pt_block', 'delete_pt_block')
  and r.privilege_type = 'EXECUTE'
group by r.routine_name
order by r.routine_name;

select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'tmc' and table_name = 'pt_bookings'
group by grantee
order by grantee;

do $$ begin raise notice 'ALLE TESTS GESLAAGD'; end $$;
rollback;
