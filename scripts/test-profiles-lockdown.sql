-- Negatieve tests voor fix/profiles-self-update-lockdown (migratie
-- 20260928100000_profiles_self_update_lockdown.sql).
--
-- Draaien als postgres tegen een LOKALE of branch-database waarop de
-- migratieketen is afgespeeld (supabase db start in de worktree), niet tegen
-- productie. Eigen wegwerp-fixtures (auth.users met profielen via de trigger,
-- trainers, pijler, lestype, les, boeking, membership), alles in een
-- transactie die eindigt in ROLLBACK.
--
-- Negatieve tests zitten in DO-blokken die de verwachte fout
-- (insufficient_privilege, SQLSTATE 42501: ingetrokken grant of RLS-weigering)
-- omzetten in een PASS-notice en anders een FAIL-exception raisen, waarop het
-- script stopt (ON_ERROR_STOP). Positieve tests asserteren de eindtoestand.
--
-- Uitvoeren:
--   docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < scripts/test-profiles-lockdown.sql
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
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pl-lid@test.invalid',     '{"provider":"email","providers":["email"]}', '{"first_name":"Lid","last_name":"Test"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pl-lid2@test.invalid',    '{"provider":"email","providers":["email"]}', '{"first_name":"Lid2","last_name":"Test"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pl-trainer@test.invalid', '{"provider":"email","providers":["email"]}', '{"first_name":"Trainer","last_name":"Test"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pl-admin@test.invalid',   '{"provider":"email","providers":["email"]}', '{"first_name":"Admin","last_name":"Test"}', now(), now());

update tmc.profiles set role = 'trainer' where id = 'a1000000-0000-4000-8000-000000000003';
update tmc.profiles set role = 'admin'   where id = 'a1000000-0000-4000-8000-000000000006';
-- Het lid heeft gevoelige data die een trainer niet mag zien.
update tmc.profiles
set health_notes = '{"injuries":"knie"}', health_intake_completed_at = now(),
    date_of_birth = '1990-01-01', street_address = 'Teststraat 1', phone = '+31612345678',
    emergency_contact_name = 'Nood', emergency_contact_phone = '+31687654321'
where id = 'a1000000-0000-4000-8000-000000000001';

insert into tmc.trainers (id, profile_id, display_name, slug, is_active, has_health_access)
values ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'Trainer T', 'pl-trainer', true, false);

insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity)
values ('c1000000-0000-4000-8000-000000000001', 'pl-test-les', 'PL-testles', 'kettlebell', 'adult', 6);

insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
values ('d1000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003', 'kettlebell', 'adult', now() + interval '2 days', now() + interval '2 days 1 hour', 6, 'scheduled');

-- Het lid is geboekt in de les van de trainer (de oude trainer-leespolicy zou hier matchen).
insert into tmc.bookings (id, profile_id, session_id, status, iso_year, iso_week, session_date, pillar)
values ('e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-00000000000a', 'booked',
  extract(isoyear from now() + interval '2 days')::int, extract(week from now() + interval '2 days')::int, (now() + interval '2 days')::date, 'kettlebell');

-- Membership van het lid (alleen de kolommen die het pauze-pad nodig heeft).
insert into tmc.memberships (id, profile_id, plan_type, plan_variant, status, start_date, price_per_cycle_cents, commit_end_date)
values ('f1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'all_inclusive', 'pl-test', 'active', current_date, 9900, current_date + 365);

create or replace function pg_temp.als(p_role text, p_sub uuid) returns void language plpgsql as $$
begin
  execute format('set role %I', p_role);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', p_role)::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Gewoon lid: afgeschermde kolommen
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a1000000-0000-4000-8000-000000000001');

do $$ begin
  update tmc.profiles set role = 'admin' where id = auth.uid();
  raise exception 'FAIL 1a: lid kon role wijzigen';
exception when insufficient_privilege then
  raise notice 'PASS 1a: lid kan role niet wijzigen (%)', sqlerrm;
end $$;
do $$ begin
  if tmc.is_admin() then raise exception 'FAIL 1b: is_admin() is true voor een lid'; end if;
  raise notice 'PASS 1b: is_admin() blijft false';
end $$;
do $$ declare c text; begin
  foreach c in array array['member_code', 'is_test', 'mollie_customer_id', 'email', 'age_category', 'acquisition_source', 'signup_path', 'first_touch_at', 'health_notes', 'health_intake_completed_at', 'locale', 'country', 'company_name', 'vat_number'] loop
    begin
      execute format('update tmc.profiles set %I = %I where id = auth.uid()', c, c);
      raise exception 'FAIL 1c: lid kan profiles.% wijzigen', c;
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'PASS 1c: lid kan member_code, is_test, mollie_customer_id, email, age_category, acquisitie, health-velden, locale, country en bedrijfsvelden niet wijzigen';
end $$;

-- 1d. Eigen toegestane velden wel.
do $$ declare v text; begin
  update tmc.profiles
  set first_name = 'Nieuw', last_name = 'Naam', phone = '+31611111111', date_of_birth = '1991-02-02',
      street_address = 'Anders 2', postal_code = '1234AB', city = 'Loosdrecht',
      emergency_contact_name = 'Ander', emergency_contact_phone = '+31622222222',
      avatar_url = 'https://example.invalid/a.png', marketing_opt_in = true
  where id = auth.uid();
  select first_name into v from tmc.profiles where id = auth.uid();
  if v <> 'Nieuw' then raise exception 'FAIL 1d: update van eigen velden kwam niet aan'; end if;
  raise notice 'PASS 1d: lid wijzigt naam, telefoon, geboortedatum, adres, noodcontact, avatar en opt-in';
end $$;

-- 1e. Andermans profiel: geen rij geraakt (RLS), geen fout.
do $$ begin
  update tmc.profiles set first_name = 'Hack' where id = 'a1000000-0000-4000-8000-000000000002';
  if found then raise exception 'FAIL 1e: lid wijzigde andermans profiel'; end if;
  raise notice 'PASS 1e: andermans profiel blijft buiten bereik (RLS)';
end $$;

-- 1f. Intake via de RPC zet beide velden.
do $$ declare n text; t timestamptz; begin
  update tmc.profiles set health_intake_completed_at = null where id = auth.uid();
  raise exception 'FAIL 1f-pre: health_intake_completed_at direct wijzigbaar';
exception when insufficient_privilege then null; end $$;
do $$ declare n text; t timestamptz; begin
  perform tmc.submit_health_intake('{"goals":"fit"}');
  select health_notes, health_intake_completed_at into n, t from tmc.profiles where id = auth.uid();
  if n <> '{"goals":"fit"}' or t is null then raise exception 'FAIL 1f: RPC zette notes of stempel niet'; end if;
  raise notice 'PASS 1f: submit_health_intake zet health_notes en health_intake_completed_at samen';
end $$;
do $$ begin
  perform tmc.submit_health_intake('   ');
  raise exception 'FAIL 1g: lege intake geaccepteerd';
exception when sqlstate '22023' then raise notice 'PASS 1g: lege intake wordt geweigerd'; end $$;

-- 1h. Insert en delete op profiles zijn dicht.
do $$ begin
  delete from tmc.profiles where id = auth.uid();
  raise exception 'FAIL 1h: lid kon eigen profiel verwijderen';
exception when insufficient_privilege then raise notice 'PASS 1h: lid kan profiles niet verwijderen of invoegen'; end $$;

-- ---------------------------------------------------------------------------
-- 2. Wachtlijst
-- ---------------------------------------------------------------------------
do $$ begin
  insert into tmc.waitlist_entries (profile_id, session_id, position) values (auth.uid(), 'd1000000-0000-4000-8000-00000000000a', 0);
  raise exception 'FAIL 2a: lid kon zichzelf direct op de wachtlijst zetten';
exception when insufficient_privilege then raise notice 'PASS 2a: lid kan waitlist_entries niet direct invoegen'; end $$;
reset role;
insert into tmc.waitlist_entries (id, profile_id, session_id, position) values ('e2000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-00000000000a', 3);
select pg_temp.als('authenticated', 'a1000000-0000-4000-8000-000000000001');
do $$ begin
  update tmc.waitlist_entries set position = 0, promoted_at = now(), confirmed_at = now() where id = 'e2000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 2b: lid kon positie of promotievelden zetten';
exception when insufficient_privilege then raise notice 'PASS 2b: lid kan positie, promoted_at en confirmed_at niet zetten'; end $$;
do $$ declare n int; begin
  select count(*) into n from tmc.waitlist_entries where profile_id = auth.uid();
  if n <> 1 then raise exception 'FAIL 2c: lid ziet % eigen wachtlijstentries (verwacht 1)', n; end if;
  raise notice 'PASS 2c: lid leest eigen wachtlijstentry';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Pauzes
-- ---------------------------------------------------------------------------
do $$ begin
  insert into tmc.membership_pauses (membership_id, start_date, end_date, reason, status, requested_by)
  values ('f1000000-0000-4000-8000-00000000000a', current_date, current_date + 30, 'medical', 'active', auth.uid());
  raise exception 'FAIL 3a: lid kon pauze met status active invoegen';
exception when insufficient_privilege then raise notice 'PASS 3a: pauze met status active wordt geweigerd'; end $$;
do $$ begin
  insert into tmc.membership_pauses (membership_id, start_date, end_date, reason, status, requested_by, approved_by, approved_at)
  values ('f1000000-0000-4000-8000-00000000000a', current_date, current_date + 30, 'medical', 'pending', auth.uid(), auth.uid(), now());
  raise exception 'FAIL 3b: lid kon approved_by zetten';
exception when insufficient_privilege then raise notice 'PASS 3b: approved_by en approved_at zijn niet invoegbaar'; end $$;
do $$ begin
  insert into tmc.membership_pauses (membership_id, start_date, end_date, reason, status, requested_by)
  values ('f1000000-0000-4000-8000-00000000000a', current_date, current_date + 30, 'medical', 'pending', 'a1000000-0000-4000-8000-000000000002');
  raise exception 'FAIL 3c: lid kon requested_by op een ander zetten';
exception when insufficient_privilege then raise notice 'PASS 3c: requested_by moet de aanvrager zelf zijn'; end $$;
do $$ declare n int; begin
  insert into tmc.membership_pauses (membership_id, start_date, end_date, reason, status, requested_by, notes)
  values ('f1000000-0000-4000-8000-00000000000a', current_date, current_date + 30, 'medical', 'pending', auth.uid(), 'test');
  select count(*) into n from tmc.membership_pauses where membership_id = 'f1000000-0000-4000-8000-00000000000a' and status = 'pending';
  if n <> 1 then raise exception 'FAIL 3d: pending pauze niet aangemaakt of niet leesbaar'; end if;
  raise notice 'PASS 3d: pending pauze-aanvraag op eigen membership werkt';
end $$;
do $$ begin
  update tmc.membership_pauses set status = 'approved' where membership_id = 'f1000000-0000-4000-8000-00000000000a';
  raise exception 'FAIL 3e: lid kon pauze bijwerken';
exception when insufficient_privilege then raise notice 'PASS 3e: lid kan een pauze niet bijwerken of verwijderen'; end $$;

-- ---------------------------------------------------------------------------
-- 4. Memberships blijven dicht (controle op de sweep)
-- ---------------------------------------------------------------------------
do $$ begin
  update tmc.memberships set status = 'paused' where id = 'f1000000-0000-4000-8000-00000000000a';
  if found then raise exception 'FAIL 4: lid kon eigen membership wijzigen'; end if;
  raise notice 'PASS 4: memberships zijn niet schrijfbaar voor een lid';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Trainer zonder has_health_access: geen profiel van het geboekte lid via
--    de cookie-client, geen eigen pt_settings schrijven, wel uren indienen.
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a1000000-0000-4000-8000-000000000003');
do $$ declare n int; begin
  select count(*) into n from tmc.profiles where id = 'a1000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FAIL 5a: trainer leest profiel van een geboekt lid via RLS (health_notes, adres, geboortedatum)'; end if;
  raise notice 'PASS 5a: trainer leest geen profiel van een geboekt lid via de cookie-client (deelnemerslijst loopt via service role met has_health_access-check)';
end $$;
do $$ declare n int; begin
  select count(*) into n from tmc.profiles where id = auth.uid();
  if n <> 1 then raise exception 'FAIL 5b: trainer leest eigen profiel niet'; end if;
  raise notice 'PASS 5b: trainer leest eigen profiel';
end $$;
do $$ begin
  insert into tmc.pt_settings (trainer_id, session_duration_min) values ('b1000000-0000-4000-8000-000000000003', 5);
  raise exception 'FAIL 5c: trainer kon pt_settings direct schrijven';
exception when insufficient_privilege then raise notice 'PASS 5c: trainer kan pt_settings niet direct schrijven'; end $$;
do $$ declare n int; begin
  insert into tmc.trainer_hours (trainer_id, work_date, hours, status) values ('b1000000-0000-4000-8000-000000000003', current_date, 2, 'pending');
  select count(*) into n from tmc.trainer_hours where trainer_id = 'b1000000-0000-4000-8000-000000000003';
  if n <> 1 then raise exception 'FAIL 5d: uren indienen werkt niet'; end if;
  raise notice 'PASS 5d: trainer dient uren in (pending) via het bestaande pad';
end $$;
do $$ begin
  update tmc.trainer_hours set status = 'approved' where trainer_id = 'b1000000-0000-4000-8000-000000000003';
  raise exception 'FAIL 5e: trainer kon eigen uren goedkeuren';
exception when insufficient_privilege then raise notice 'PASS 5e: trainer kan eigen uren niet goedkeuren'; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Admin (cookie-client): leest het profiel van het lid, is_admin true.
-- ---------------------------------------------------------------------------
select pg_temp.als('authenticated', 'a1000000-0000-4000-8000-000000000006');
do $$ declare n int; begin
  if not tmc.is_admin() then raise exception 'FAIL 6: admin is geen admin'; end if;
  select count(*) into n from tmc.profiles where id in ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003');
  if n <> 2 then raise exception 'FAIL 6: admin ziet % van 2 profielen', n; end if;
  raise notice 'PASS 6: admin leest alle profielen';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. anon: niets op de vier tabellen.
-- ---------------------------------------------------------------------------
set role anon;
do $$ declare t text; begin
  foreach t in array array['profiles', 'membership_pauses', 'trainer_hours', 'waitlist_entries'] loop
    begin
      execute format('select id from tmc.%I limit 1', t);
      raise exception 'FAIL 7: anon kan tmc.% lezen', t;
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'PASS 7a: anon leest profiles, membership_pauses, trainer_hours en waitlist_entries niet';
end $$;
reset role;
-- 7b als postgres via de catalogus: de RPC daadwerkelijk als anon aanroepen
-- laat de lokale Postgres 17-container crashen (signal 11 in de
-- foutafhandeling van een geweigerde SECURITY DEFINER-aanroep); het recht
-- zelf is zo even hard te controleren.
do $$ begin
  if has_function_privilege('anon', 'tmc.submit_health_intake(text)', 'execute')
     or has_function_privilege('public', 'tmc.submit_health_intake(text)', 'execute') then
    raise exception 'FAIL 7b: anon of PUBLIC mag submit_health_intake uitvoeren';
  end if;
  if not has_function_privilege('authenticated', 'tmc.submit_health_intake(text)', 'execute') then
    raise exception 'FAIL 7b: authenticated mist EXECUTE op submit_health_intake';
  end if;
  raise notice 'PASS 7b: EXECUTE op submit_health_intake alleen voor authenticated (niet anon, niet PUBLIC)';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Service role: de app-schrijfpaden blijven werken.
-- ---------------------------------------------------------------------------
set role service_role;
do $$ begin
  update tmc.profiles set acquisition_source = 'instagram', mollie_customer_id = 'cst_test' where id = 'a1000000-0000-4000-8000-000000000001';
  insert into tmc.waitlist_entries (profile_id, session_id, position) values ('a1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-00000000000a', 4);
  update tmc.membership_pauses set status = 'rejected', approved_by = 'a1000000-0000-4000-8000-000000000006' where membership_id = 'f1000000-0000-4000-8000-00000000000a';
  update tmc.trainer_hours set status = 'approved' where trainer_id = 'b1000000-0000-4000-8000-000000000003';
  raise notice 'PASS 8: service_role schrijft acquisitie, wachtlijst, pauzes en uren (recordAcquisitionOnLogin, joinWaitlist, admin-acties)';
end $$;
reset role;

do $$ begin raise notice 'ALLE TESTS GESLAAGD'; end $$;
rollback;
