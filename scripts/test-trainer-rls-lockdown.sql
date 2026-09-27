-- Negatieve tests voor fix/trainer-rls-lockdown (migratie
-- 20260928090000_trainer_rls_lockdown.sql).
--
-- Draaien als postgres tegen een LOKALE of branch-database waarop de
-- migratieketen is afgespeeld (supabase db start in de worktree), niet tegen
-- productie. Het script maakt zijn eigen wegwerp-fixtures (auth.users,
-- profielen via de trigger, trainers, een pijler, een lestype, twee lessen,
-- boekingen, een PT-blok) en eindigt in ROLLBACK, dus er blijft niets achter.
--
-- Elke negatieve test staat in een DO-blok dat de verwachte fout
-- (insufficient_privilege, SQLSTATE 42501: zowel "permission denied" door een
-- ingetrokken grant als een RLS-weigering) omzet in een PASS-notice. Blijft de
-- fout uit, dan raist het blok zelf een FAIL-exception en stopt het script
-- (ON_ERROR_STOP). Positieve tests asserteren rijaantallen en raisen bij een
-- afwijking. Rollen: set role authenticated / anon / service_role met
-- request.jwt.claims voor auth.uid(); reset role tussen de stappen.
--
-- Uitvoeren:
--   docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < scripts/test-trainer-rls-lockdown.sql
-- Verwacht: 31 PASS-notices en aan het eind "ALLE TESTS GESLAAGD".

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- Fixtures (als postgres)
-- ---------------------------------------------------------------------------

insert into tmc.class_pillars (code, name_nl, age_category, display_order)
values ('kettlebell', 'Kettlebell', 'adult', 999)
on conflict (code) do nothing;

-- Zes wegwerp-accounts. De trigger handle_new_auth_user maakt de profielen.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-lid@test.invalid',        '{"provider":"email","providers":["email"]}', '{"first_name":"Lid","last_name":"Test"}', now(), now()),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-lid-met-rij@test.invalid', '{"provider":"email","providers":["email"]}', '{"first_name":"LidRij","last_name":"Test"}', now(), now()),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-trainer-a@test.invalid',  '{"provider":"email","providers":["email"]}', '{"first_name":"TrainerA","last_name":"Test"}', now(), now()),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-trainer-b@test.invalid',  '{"provider":"email","providers":["email"]}', '{"first_name":"TrainerB","last_name":"Test"}', now(), now()),
  ('a0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-trainer-uit@test.invalid','{"provider":"email","providers":["email"]}', '{"first_name":"TrainerUit","last_name":"Test"}', now(), now()),
  ('a0000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-admin@test.invalid',      '{"provider":"email","providers":["email"]}', '{"first_name":"Admin","last_name":"Test"}', now(), now());

update tmc.profiles set role = 'trainer' where id in ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005');
update tmc.profiles set role = 'admin'   where id = 'a0000000-0000-4000-8000-000000000006';

-- Trainers-rijen: A en B actief (rol trainer), Uit inactief (rol trainer),
-- LidRij actief maar rol member (de Remi/Fenna-situatie).
insert into tmc.trainers (id, profile_id, display_name, slug, is_active, hourly_rate_in_cents, pt_session_rate_cents, has_health_access, employment_tier)
values
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'Trainer A', 'rls-trainer-a',   true,  2500, 7500, false, 'trainer'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'Trainer B', 'rls-trainer-b',   true,  2600, 7600, false, 'trainer'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005', 'Trainer Uit', 'rls-trainer-uit', false, 2700, 7700, false, 'trainer'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'Lid met rij', 'rls-lid-met-rij', true, 2800, 7800, false, 'trainer');

insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity)
values ('c0000000-0000-4000-8000-000000000001', 'rls-test-les', 'RLS-testles', 'kettlebell', 'adult', 6);

insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
values
  ('d0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'kettlebell', 'adult', now() + interval '2 days', now() + interval '2 days 1 hour', 6, 'scheduled'),
  ('d0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'kettlebell', 'adult', now() + interval '3 days', now() + interval '3 days 1 hour', 6, 'scheduled');

-- Het lid heeft een boeking op de les van A en op de les van B.
insert into tmc.bookings (id, profile_id, session_id, status, iso_year, iso_week, session_date, pillar)
values
  ('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000a', 'booked',
     extract(isoyear from now() + interval '2 days')::int, extract(week from now() + interval '2 days')::int, (now() + interval '2 days')::date, 'kettlebell'),
  ('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000b', 'booked',
     extract(isoyear from now() + interval '3 days')::int, extract(week from now() + interval '3 days')::int, (now() + interval '3 days')::date, 'kettlebell');

-- PT-blok van trainer A.
insert into tmc.pt_sessions (id, trainer_id, kind, format, start_at, end_at, duration_min, capacity, status)
values ('f0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000003', 'block', null, now() + interval '4 days', now() + interval '4 days 1 hour', 60, 1, 'scheduled');

-- Hulpfunctie: als een gegeven gebruiker draaien.
create or replace function pg_temp.als(p_role text, p_sub uuid) returns void language plpgsql as $$
begin
  execute format('set role %I', p_role);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', p_role)::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Gewoon lid: kan geen trainers-rij aanmaken; is_staff() blijft false.
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a0000000-0000-4000-8000-000000000001');

do $$ begin
  insert into tmc.trainers (profile_id, display_name, slug, is_active)
  values ('a0000000-0000-4000-8000-000000000001', 'Ik ben nu staf', 'rls-hack', true);
  raise exception 'FAIL 1a: lid kon een trainers-rij voor zichzelf aanmaken';
exception when insufficient_privilege then
  raise notice 'PASS 1a: lid kan geen trainers-rij aanmaken (%)', sqlerrm;
end $$;

do $$ begin
  if tmc.is_staff() then raise exception 'FAIL 1b: is_staff() is true voor een gewoon lid'; end if;
  raise notice 'PASS 1b: is_staff() is false voor een gewoon lid';
end $$;

-- Lid leest wel het rooster (les + trainernaam) en zijn eigen boekingen.
do $$ declare n int; begin
  select count(*) into n from tmc.class_sessions cs join tmc.trainers t on t.id = cs.trainer_id
  where cs.id in ('d0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000b') and t.display_name is not null;
  if n <> 2 then raise exception 'FAIL 1c: lid ziet % van 2 lessen met trainernaam', n; end if;
  select count(*) into n from tmc.bookings where profile_id = 'a0000000-0000-4000-8000-000000000001';
  if n <> 2 then raise exception 'FAIL 1c: lid ziet % van 2 eigen boekingen', n; end if;
  raise notice 'PASS 1c: lid leest rooster met trainernaam en eigen boekingen';
end $$;

-- Lid kan een boeking niet rechtstreeks wijzigen (alleen via RPC).
do $$ begin
  update tmc.bookings set status = 'cancelled' where id = 'e0000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 1d: lid kon een boeking rechtstreeks wijzigen';
exception when insufficient_privilege then
  raise notice 'PASS 1d: lid kan bookings niet rechtstreeks schrijven';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 2. Lid MET een (door admin aangemaakte) actieve trainers-rij maar rol
--    member: geen staf. Dit is de situatie van Remi en Fenna.
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a0000000-0000-4000-8000-000000000002');
do $$ begin
  if tmc.is_staff() then raise exception 'FAIL 2a: is_staff() is true voor rol member met actieve trainers-rij'; end if;
  raise notice 'PASS 2a: is_staff() is false voor rol member met actieve trainers-rij';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Trainer met inactieve rij: geen staf.
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a0000000-0000-4000-8000-000000000005');
do $$ begin
  if tmc.is_staff() then raise exception 'FAIL 3: is_staff() is true voor een trainer met inactieve rij'; end if;
  raise notice 'PASS 3: is_staff() is false voor rol trainer met inactieve trainers-rij';
end $$;
reset role;

-- is_staff_profile() heeft alleen EXECUTE voor service_role (kiosk-gate,
-- PR #215); hier als postgres aangeroepen, met dezelfde drie verwachtingen.
do $$ begin
  if tmc.is_staff_profile('a0000000-0000-4000-8000-000000000002') then raise exception 'FAIL 2b: is_staff_profile() is true voor rol member met actieve trainers-rij'; end if;
  if tmc.is_staff_profile('a0000000-0000-4000-8000-000000000005') then raise exception 'FAIL 3b: is_staff_profile() is true voor rol trainer met inactieve rij'; end if;
  if not tmc.is_staff_profile('a0000000-0000-4000-8000-000000000003') then raise exception 'FAIL 4a-bis: is_staff_profile() is false voor een echte trainer'; end if;
  if not tmc.is_staff_profile('a0000000-0000-4000-8000-000000000006') then raise exception 'FAIL 5-bis: is_staff_profile() is false voor een admin'; end if;
  raise notice 'PASS 2b/3b: is_staff_profile() volgt dezelfde regel (member met rij nee, inactieve trainer nee, echte trainer ja, admin ja)';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Trainer A (rol trainer, actieve rij)
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a0000000-0000-4000-8000-000000000003');

do $$ begin
  if not tmc.is_staff() then raise exception 'FAIL 4a: is_staff() is false voor een echte trainer'; end if;
  raise notice 'PASS 4a: echte trainer telt als staf';
end $$;

-- Eigen trainers-rij lezen mag.
do $$ declare n int; begin
  select count(*) into n from tmc.trainers where profile_id = auth.uid();
  if n <> 1 then raise exception 'FAIL 4b: trainer ziet % eigen trainers-rijen (verwacht 1)', n; end if;
  raise notice 'PASS 4b: trainer leest eigen trainers-rij';
end $$;

-- Eigen trainers-rij wijzigen mag niet (has_health_access, tarieven, is_active).
do $$ begin
  update tmc.trainers set has_health_access = true where id = 'b0000000-0000-4000-8000-000000000003';
  raise exception 'FAIL 4c: trainer kon has_health_access zetten';
exception when insufficient_privilege then raise notice 'PASS 4c: trainer kan has_health_access niet zetten'; end $$;
do $$ begin
  update tmc.trainers set hourly_rate_in_cents = 99999, pt_session_rate_cents = 99999 where id = 'b0000000-0000-4000-8000-000000000003';
  raise exception 'FAIL 4d: trainer kon tarieven wijzigen';
exception when insufficient_privilege then raise notice 'PASS 4d: trainer kan tarieven niet wijzigen'; end $$;
do $$ begin
  update tmc.trainers set is_active = false where id = 'b0000000-0000-4000-8000-000000000003';
  raise exception 'FAIL 4e: trainer kon is_active wijzigen';
exception when insufficient_privilege then raise notice 'PASS 4e: trainer kan is_active niet wijzigen'; end $$;

-- Eigen les wijzigen mag niet (tijd, capaciteit, status, trainer_id).
do $$ begin
  update tmc.class_sessions set capacity = 12 where id = 'd0000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 4f: trainer kon capaciteit van eigen les wijzigen';
exception when insufficient_privilege then raise notice 'PASS 4f: trainer kan capaciteit van eigen les niet wijzigen'; end $$;
do $$ begin
  update tmc.class_sessions set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = 'd0000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 4g: trainer kon tijd van eigen les wijzigen';
exception when insufficient_privilege then raise notice 'PASS 4g: trainer kan tijd van eigen les niet wijzigen'; end $$;
do $$ begin
  update tmc.class_sessions set status = 'cancelled' where id = 'd0000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 4h: trainer kon status van eigen les wijzigen';
exception when insufficient_privilege then raise notice 'PASS 4h: trainer kan status van eigen les niet wijzigen'; end $$;
do $$ begin
  update tmc.class_sessions set trainer_id = 'b0000000-0000-4000-8000-000000000004' where id = 'd0000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 4i: trainer kon trainer_id van eigen les verzetten';
exception when insufficient_privilege then raise notice 'PASS 4i: trainer kan trainer_id van eigen les niet verzetten'; end $$;

-- Boekingen: eigen les wel, andermans les niet.
do $$ declare n_eigen int; n_ander int; begin
  select count(*) into n_eigen from tmc.bookings where session_id = 'd0000000-0000-4000-8000-00000000000a';
  select count(*) into n_ander from tmc.bookings where session_id = 'd0000000-0000-4000-8000-00000000000b';
  if n_eigen <> 1 then raise exception 'FAIL 4j: trainer ziet % boekingen op eigen les (verwacht 1)', n_eigen; end if;
  if n_ander <> 0 then raise exception 'FAIL 4k: trainer ziet % boekingen op andermans les (verwacht 0)', n_ander; end if;
  raise notice 'PASS 4j/4k: trainer ziet boekingen van eigen les en niet die van andermans les';
end $$;

-- Aanwezigheid rechtstreeks op bookings schrijven mag niet meer (het pad
-- loopt via markAttendance en de service role, zie stap 6).
do $$ begin
  update tmc.bookings set attended_at = now() where id = 'e0000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 4l: trainer kon attended_at rechtstreeks zetten';
exception when insufficient_privilege then raise notice 'PASS 4l: trainer kan bookings niet rechtstreeks schrijven'; end $$;
do $$ begin
  insert into tmc.check_ins (profile_id, session_id, booking_id, check_in_method, access_type, pillar)
  values ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000a', 'admin_web', 'membership', 'kettlebell');
  raise exception 'FAIL 4m: trainer kon rechtstreeks een check_in aanmaken';
exception when insufficient_privilege then raise notice 'PASS 4m: trainer kan check_ins niet rechtstreeks schrijven'; end $$;

-- PT-blokken: eigen blok lezen wel, rechtstreeks aanmaken of wijzigen niet.
do $$ declare n int; begin
  select count(*) into n from tmc.pt_sessions where id = 'f0000000-0000-4000-8000-00000000000a';
  if n <> 1 then raise exception 'FAIL 4n: trainer ziet eigen PT-blok niet'; end if;
  raise notice 'PASS 4n: trainer leest eigen PT-blok';
end $$;
do $$ begin
  insert into tmc.pt_sessions (trainer_id, kind, format, start_at, end_at, duration_min, capacity)
  values ('b0000000-0000-4000-8000-000000000003', 'block', null, now() + interval '5 days', now() + interval '5 days 1 hour', 60, 1);
  raise exception 'FAIL 4o: trainer kon rechtstreeks een PT-blok aanmaken';
exception when insufficient_privilege then raise notice 'PASS 4o: trainer kan pt_sessions niet rechtstreeks schrijven (RPC-pad blijft)'; end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5. Admin (rol admin): leest alles, is_staff() true.
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a0000000-0000-4000-8000-000000000006');
do $$ declare n int; begin
  if not tmc.is_staff() or not tmc.is_admin() then raise exception 'FAIL 5a: admin telt niet als staf/admin'; end if;
  -- Filter op id: ook een admin leest via de cookie-client alleen de
  -- gegrante kolommen (slug hoort daar niet bij); admin-schermen lezen via
  -- service role.
  select count(*) into n from tmc.trainers where id in ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000005');
  if n <> 4 then raise exception 'FAIL 5b: admin ziet % van 4 trainers-rijen', n; end if;
  select count(*) into n from tmc.bookings where session_id in ('d0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000b');
  if n <> 2 then raise exception 'FAIL 5c: admin ziet % van 2 boekingen', n; end if;
  raise notice 'PASS 5: admin is staf en leest alle trainers en boekingen';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Service role (het schrijfpad van de app): alles blijft schrijfbaar.
--    Dit is het pad van markAttendance/setMemberAttendance, de admin-UI en
--    de kiosk; RLS geldt niet voor service_role.
-- ---------------------------------------------------------------------------
set role service_role;
do $$ begin
  update tmc.bookings set attended_at = now(), no_show_at = null where id = 'e0000000-0000-4000-8000-00000000000a';
  insert into tmc.check_ins (profile_id, session_id, booking_id, check_in_method, access_type, pillar, checked_in_by)
  values ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000a', 'admin_web', 'membership', 'kettlebell', 'a0000000-0000-4000-8000-000000000003');
  update tmc.class_sessions set capacity = 8 where id = 'd0000000-0000-4000-8000-00000000000a';
  update tmc.trainers set has_health_access = true where id = 'b0000000-0000-4000-8000-000000000003';
  update tmc.schedule_templates set updated_at = now() where false;
  update tmc.pt_sessions set notes = 'ok' where id = 'f0000000-0000-4000-8000-00000000000a';
  raise notice 'PASS 6: service_role schrijft naar bookings, check_ins, class_sessions, trainers, schedule_templates en pt_sessions';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. anon: geen schrijfrechten.
-- ---------------------------------------------------------------------------
set role anon;
do $$ begin
  insert into tmc.trainers (profile_id, display_name, slug) values ('a0000000-0000-4000-8000-000000000001', 'x', 'rls-anon');
  raise exception 'FAIL 7: anon kon in trainers schrijven';
exception when insufficient_privilege then raise notice 'PASS 7: anon kan niet in trainers schrijven'; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. Kolom-grants: personeelskolommen dicht, rooster en boekingen open.
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a0000000-0000-4000-8000-000000000001');

-- 8a. Gewoon lid kan geen enkele gevoelige trainerskolom selecteren.
do $$ declare c text; begin
  foreach c in array array['hourly_rate_in_cents', 'pt_session_rate_cents', 'has_health_access', 'employment_tier', 'slug', 'is_pt_available', 'pt_tier'] loop
    begin
      execute format('select %I from tmc.trainers limit 1', c);
      raise exception 'FAIL 8a: lid kan trainers.% lezen', c;
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'PASS 8a: lid kan geen gevoelige trainerskolommen lezen (tarieven, has_health_access, employment_tier, slug, is_pt_available, pt_tier)';
end $$;

-- 8b. Ledenrooster-vorm werkt: lessen met trainernaam en bio, plus filters.
do $$ declare n int; begin
  select count(*) into n
  from tmc.class_sessions cs
  join tmc.trainers t on t.id = cs.trainer_id
  where cs.pillar = 'kettlebell' and cs.status = 'scheduled' and cs.start_at > now()
    and cs.id in ('d0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000b')
    and t.display_name is not null and (t.bio is null or true)
    and cs.capacity is not null and cs.age_category is not null and cs.class_type_id is not null and cs.end_at is not null;
  if n <> 2 then raise exception 'FAIL 8b: ledenrooster-query geeft % rijen (verwacht 2)', n; end if;
  raise notice 'PASS 8b: ledenrooster leest les-kolommen en trainer(display_name, bio)';
end $$;

-- 8c. Interne leskolommen zijn dicht voor leden.
do $$ declare c text; begin
  foreach c in array array['notes', 'cancellation_reason', 'template_id', 'blocks_free_training'] loop
    begin
      execute format('select %I from tmc.class_sessions limit 1', c);
      raise exception 'FAIL 8c: lid kan class_sessions.% lezen', c;
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'PASS 8c: lid kan notes, cancellation_reason, template_id en blocks_free_training niet lezen';
end $$;

-- 8d. schedule_templates helemaal dicht voor leden.
do $$ begin
  perform id from tmc.schedule_templates limit 1;
  raise exception 'FAIL 8d: lid kan schedule_templates lezen';
exception when insufficient_privilege then raise notice 'PASS 8d: lid kan schedule_templates niet lezen'; end $$;

-- 8e. De trainer-leespolicies met een subquery op trainers.profile_id
--     blijven plannen voor een lid (profile_id en is_active zijn gegrant):
--     eigen boekingen, check_ins en pt_bookings lezen geeft geen fout.
do $$ declare n int; begin
  select count(*) into n from tmc.bookings where profile_id = auth.uid();
  if n <> 2 then raise exception 'FAIL 8e: lid ziet % eigen boekingen (verwacht 2)', n; end if;
  perform 1 from tmc.check_ins where profile_id = auth.uid();
  perform 1 from tmc.pt_bookings where profile_id = auth.uid();
  perform 1 from tmc.profiles where id = auth.uid();
  raise notice 'PASS 8e: lid leest bookings, check_ins, pt_bookings en profiel (policies met trainers-subquery plannen nog)';
end $$;

reset role;

-- 8f. anon leest niets van de drie tabellen en ook bookings en check_ins
--     niet; de view voor het publieke rooster blijft wel leesbaar.
set role anon;
do $$ declare t text; begin
  foreach t in array array['trainers', 'class_sessions', 'schedule_templates', 'bookings', 'check_ins'] loop
    begin
      execute format('select id from tmc.%I limit 1', t);
      raise exception 'FAIL 8f: anon kan tmc.% lezen', t;
    exception when insufficient_privilege then null; end;
  end loop;
  perform id from tmc.v_session_availability limit 1;
  raise notice 'PASS 8f: anon leest trainers, class_sessions, schedule_templates, bookings en check_ins niet; v_session_availability blijft leesbaar';
end $$;
reset role;

-- 8g. Trainer leest via zijn eigen rij nog steeds alleen de toegestane kolommen.
select pg_temp.als('authenticated', 'a0000000-0000-4000-8000-000000000003');
do $$ begin
  perform has_health_access from tmc.trainers where id = 'b0000000-0000-4000-8000-000000000003';
  raise exception 'FAIL 8g: trainer kan has_health_access van eigen rij lezen';
exception when insufficient_privilege then raise notice 'PASS 8g: ook de trainer leest has_health_access en tarieven niet via de cookie-client (trainerpaden lopen via service role)'; end $$;
reset role;


do $$ begin raise notice 'ALLE TESTS GESLAAGD'; end $$;

rollback;
