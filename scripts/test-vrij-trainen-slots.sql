-- Tests voor feat/vrij-trainen-slots (migratie
-- 20260930090000_vrij_trainen_slots.sql).
--
-- Draaien als postgres tegen een LOKALE of branch-database waarop de
-- migratieketen is afgespeeld (supabase db start in de worktree), niet tegen
-- productie. Eigen wegwerp-fixtures, alles in een transactie die eindigt in
-- ROLLBACK. De race-test met twee verbindingen staat apart in
-- scripts/test-vrij-trainen-slots-race.sh.
--
-- Uitvoeren:
--   docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < scripts/test-vrij-trainen-slots.sql
-- Verwacht: alleen PASS-notices en aan het eind "ALLE TESTS GESLAAGD".

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- Fixtures (als postgres)
-- ---------------------------------------------------------------------------
insert into tmc.class_pillars (code, name_nl, age_category, display_order)
values ('vrij_trainen', 'Vrij Trainen', 'adult', 998), ('kettlebell', 'Kettlebell', 'adult', 999)
on conflict (code) do nothing;

insert into tmc.booking_settings (id) values ('singleton') on conflict (id) do nothing;
update tmc.booking_settings
set vrij_trainen_max_concurrent = 5, vrij_trainen_cancel_window_minutes = 5,
    fair_use_daily_max = 2, booking_window_days = 28;

-- Leden m1..m9 (a7..01 t/m a7..09) en een admin (a7..99).
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'vts-' || n || '@test.invalid', '{"provider":"email","providers":["email"]}',
       json_build_object('first_name', 'Lid' || n, 'last_name', 'Test')::jsonb, now(), now()
from unnest(array[1,2,3,4,5,6,7,8,9,99]) as n;

update tmc.profiles set role = 'admin' where id = 'a7000000-0000-4000-8000-000000000099';

insert into tmc.memberships (profile_id, plan_type, price_per_cycle_cents, start_date, commit_end_date, status, age_category)
select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'all_inclusive', 10000, current_date - 30, current_date + 365, 'active', 'adult'
from generate_series(1, 9) as n;

insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000099', 'VTS Trainer', 'vts-trainer', true);

insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity)
values
  ('c7000000-0000-4000-8000-000000000001', 'vts-vrij', 'VTS vrij', 'vrij_trainen', 'adult', null),
  ('c7000000-0000-4000-8000-000000000002', 'vts-kb', 'VTS kettlebell', 'kettlebell', 'adult', 6);

-- Tijd op dag D (over drie dagen, Amsterdam-lokaal).
create or replace function pg_temp.at(p_hhmm text) returns timestamptz language sql as $$
  select ((current_date + 3)::text || ' ' || p_hhmm)::timestamp at time zone 'Europe/Amsterdam'
$$;

-- d7..01 vrij trainen dag D 07:00-21:00, capacity null.
-- d7..02 vrij trainen vandaag, al begonnen (start 2 uur geleden).
-- d7..03 kettlebell dag D 18:00, d7..04 kettlebell dag D 19:00, d7..05
-- kettlebell dag D 20:00 (capacity 6), d7..06 blokkerende les dag D
-- 15:00-16:00.
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, blocks_free_training, occurrence_start_at)
values
  ('d7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'vrij_trainen', 'adult', pg_temp.at('07:00'), pg_temp.at('21:00'), null, 'scheduled', false, pg_temp.at('07:00')),
  ('d7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'vrij_trainen', 'adult', now() - interval '2 hours', now() + interval '10 hours', null, 'scheduled', false, now() - interval '2 hours'),
  ('d7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'kettlebell', 'adult', pg_temp.at('18:00'), pg_temp.at('19:00'), 6, 'scheduled', false, pg_temp.at('18:00')),
  ('d7000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'kettlebell', 'adult', pg_temp.at('19:00'), pg_temp.at('20:00'), 6, 'scheduled', false, pg_temp.at('19:00')),
  ('d7000000-0000-4000-8000-000000000005', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'kettlebell', 'adult', pg_temp.at('20:00'), pg_temp.at('21:00'), 6, 'scheduled', false, pg_temp.at('20:00')),
  ('d7000000-0000-4000-8000-000000000006', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'kettlebell', 'adult', pg_temp.at('15:00'), pg_temp.at('16:00'), 6, 'scheduled', true, pg_temp.at('15:00'));

create or replace function pg_temp.als(p_role text, p_sub uuid) returns void language plpgsql as $$
begin
  execute format('set role %I', p_role);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', p_role)::text, true);
end $$;

create or replace function pg_temp.lid(n int) returns uuid language sql as $$
  select ('a7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

-- Boek als lid n; geeft de jsonb-uitkomst terug.
create or replace function pg_temp.boek(n int, p_session uuid, p_start timestamptz, p_minutes int) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.als('authenticated', pg_temp.lid(n));
  r := tmc.book_class_session(p_session, false, false, p_start, p_minutes);
  reset role;
  return r;
end $$;

create or replace function pg_temp.verwacht(p_label text, r jsonb, p_ok boolean, p_reason text default null) returns void language plpgsql as $$
begin
  if coalesce((r ->> 'ok')::boolean, false) <> p_ok
     or (p_reason is not null and r ->> 'reason' is distinct from p_reason) then
    raise exception 'FAIL %: kreeg %', p_label, r;
  end if;
  raise notice 'PASS %', p_label;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Vijf tegelijk lukt, de zesde wordt geweigerd
-- ---------------------------------------------------------------------------
do $$ declare n int; begin
  for n in 1..5 loop
    perform pg_temp.verwacht('1a lid ' || n || ' boekt 10:00-11:30',
      pg_temp.boek(n, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('10:00'), 90), true);
  end loop;
  perform pg_temp.verwacht('1b zesde op 10:00-11:00 geweigerd met slot_full',
    pg_temp.boek(6, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('10:00'), 60), false, 'slot_full');
  perform pg_temp.verwacht('1c zesde op 11:15-11:45 (raakt een vol kwartier) geweigerd',
    pg_temp.boek(6, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('11:15'), 30), false, 'slot_full');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Aansluitende slots tellen niet dubbel (half-open intervallen)
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.verwacht('2a 11:30-13:00 naast vijf keer 10:00-11:30 lukt',
    pg_temp.boek(6, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('11:30'), 90), true);
  perform pg_temp.verwacht('2b 09:00-10:00 voor vijf keer 10:00-11:30 lukt',
    pg_temp.boek(7, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('09:00'), 60), true);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Slotvalidatie in de RPC
-- ---------------------------------------------------------------------------
do $$ begin
  perform pg_temp.verwacht('3a vrij trainen zonder slot: slot_required',
    pg_temp.boek(8, 'd7000000-0000-4000-8000-000000000001', null, null), false, 'slot_required');
  perform pg_temp.verwacht('3b duur 20 minuten: slot_invalid',
    pg_temp.boek(8, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('12:00'), 20), false, 'slot_invalid');
  perform pg_temp.verwacht('3c start 12:07: slot_invalid',
    pg_temp.boek(8, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('12:07'), 30), false, 'slot_invalid');
  perform pg_temp.verwacht('3d 20:30-21:30 buiten de sessie: slot_outside_session',
    pg_temp.boek(8, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('20:30'), 60), false, 'slot_outside_session');
  perform pg_temp.verwacht('3e slot op een gewone les: slot_not_allowed',
    pg_temp.boek(8, 'd7000000-0000-4000-8000-000000000003', pg_temp.at('18:00'), 60), false, 'slot_not_allowed');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Trigger-backstop bij directe inserts (paden buiten de RPC)
-- ---------------------------------------------------------------------------
do $$ begin
  begin
    insert into tmc.bookings (profile_id, session_id, status, iso_year, iso_week, session_date, pillar, slot_start_at, slot_end_at)
    values (pg_temp.lid(8), 'd7000000-0000-4000-8000-000000000001', 'booked', 2026, 1, current_date + 3, 'vrij_trainen', pg_temp.at('10:15'), pg_temp.at('10:45'));
    raise exception 'FAIL 4a: directe zesde insert werd toegelaten';
  exception when raise_exception then
    if sqlerrm <> 'slot_full' then raise; end if;
    raise notice 'PASS 4a: trigger weigert directe zesde insert met slot_full';
  end;
  begin
    insert into tmc.bookings (profile_id, session_id, status, iso_year, iso_week, session_date, pillar, slot_start_at, slot_end_at)
    values (pg_temp.lid(8), 'd7000000-0000-4000-8000-000000000001', 'booked', 2026, 1, current_date + 3, 'vrij_trainen', pg_temp.at('06:30'), pg_temp.at('07:30'));
    raise exception 'FAIL 4b: slot buiten de sessie werd toegelaten';
  exception when raise_exception then
    if sqlerrm <> 'slot_outside_session' then raise; end if;
    raise notice 'PASS 4b: trigger weigert slot buiten de sessie';
  end;
  begin
    insert into tmc.bookings (profile_id, session_id, status, iso_year, iso_week, session_date, pillar, slot_start_at, slot_end_at)
    values (pg_temp.lid(8), 'd7000000-0000-4000-8000-000000000001', 'booked', 2026, 1, current_date + 3, 'vrij_trainen', pg_temp.at('12:10'), pg_temp.at('12:40'));
    raise exception 'FAIL 4c: slot buiten het kwartierraster werd toegelaten';
  exception when check_violation then
    raise notice 'PASS 4c: check-constraint weigert slot buiten het kwartierraster';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Annuleren en opnieuw boeken: vrij trainen en een gewone les
-- ---------------------------------------------------------------------------
do $$ declare r jsonb; v_booking uuid; begin
  select id into v_booking from tmc.bookings
  where profile_id = pg_temp.lid(1) and session_id = 'd7000000-0000-4000-8000-000000000001' and status = 'booked';
  perform pg_temp.als('authenticated', pg_temp.lid(1));
  r := tmc.cancel_class_booking(v_booking);
  reset role;
  if not (r ->> 'ok')::boolean or not (r ->> 'within_window')::boolean then
    raise exception 'FAIL 5a: annuleren vrij trainen gaf %', r;
  end if;
  raise notice 'PASS 5a: vrij trainen annuleren binnen de termijn';

  perform pg_temp.verwacht('5b opnieuw boeken vrij trainen na annulering lukt',
    pg_temp.boek(1, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('13:00'), 60), true);
  if (select count(*) from tmc.bookings where profile_id = pg_temp.lid(1)
        and session_id = 'd7000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'FAIL 5b: verwacht een geannuleerde en een geboekte rij';
  end if;
  perform pg_temp.verwacht('5c tweede actieve boeking op dezelfde dag: already_booked',
    pg_temp.boek(1, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('16:00'), 60), false, 'already_booked');

  perform pg_temp.verwacht('5d gewone les boeken',
    pg_temp.boek(9, 'd7000000-0000-4000-8000-000000000003', null, null), true);
  select id into v_booking from tmc.bookings
  where profile_id = pg_temp.lid(9) and session_id = 'd7000000-0000-4000-8000-000000000003' and status = 'booked';
  perform pg_temp.als('authenticated', pg_temp.lid(9));
  r := tmc.cancel_class_booking(v_booking);
  reset role;
  if not (r ->> 'ok')::boolean then raise exception 'FAIL 5e: annuleren gewone les gaf %', r; end if;
  perform pg_temp.verwacht('5e gewone les opnieuw boeken na annulering lukt',
    pg_temp.boek(9, 'd7000000-0000-4000-8000-000000000003', null, null), true);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Termijn en verleden rekenen vanaf slot_start_at
-- ---------------------------------------------------------------------------
do $$ declare r jsonb; v_booking uuid; v_slot timestamptz := date_trunc('hour', now()) + interval '2 hours'; begin
  perform pg_temp.verwacht('6a boeken op een al begonnen dagsessie met een slot in de toekomst lukt',
    pg_temp.boek(2, 'd7000000-0000-4000-8000-000000000002', v_slot, 60), true);
  perform pg_temp.verwacht('6b slot in het verleden: session_in_past',
    pg_temp.boek(3, 'd7000000-0000-4000-8000-000000000002', date_trunc('hour', now()) - interval '1 hour', 30), false, 'session_in_past');

  update tmc.booking_settings set vrij_trainen_cancel_window_minutes = 600;
  select id into v_booking from tmc.bookings
  where profile_id = pg_temp.lid(2) and session_id = 'd7000000-0000-4000-8000-000000000002' and status = 'booked';
  perform pg_temp.als('authenticated', pg_temp.lid(2));
  r := tmc.cancel_class_booking(v_booking);
  reset role;
  if (r ->> 'within_window')::boolean then
    raise exception 'FAIL 6c: termijn van 600 minuten had late moeten geven, kreeg %', r;
  end if;
  update tmc.booking_settings set vrij_trainen_cancel_window_minutes = 60;
  perform pg_temp.verwacht('6c-rebook opnieuw boeken voor termijntest',
    pg_temp.boek(2, 'd7000000-0000-4000-8000-000000000002', v_slot, 60), true);
  select id into v_booking from tmc.bookings
  where profile_id = pg_temp.lid(2) and session_id = 'd7000000-0000-4000-8000-000000000002' and status = 'booked';
  perform pg_temp.als('authenticated', pg_temp.lid(2));
  r := tmc.cancel_class_booking(v_booking);
  reset role;
  if not (r ->> 'within_window')::boolean then
    raise exception 'FAIL 6c: slot meer dan 60 minuten weg had binnen de termijn moeten zijn (sessiestart ligt al in het verleden), kreeg %', r;
  end if;
  update tmc.booking_settings set vrij_trainen_cancel_window_minutes = 5;
  raise notice 'PASS 6c: annuleertermijn rekent vanaf slot_start_at, niet vanaf de sessiestart';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Daglimiet: vrij trainen telt niet mee en wordt er niet door geweigerd
-- ---------------------------------------------------------------------------
do $$ begin
  -- Lid 3 heeft vrij trainen op dag D en boekt nog twee lessen (limiet 2).
  perform pg_temp.verwacht('7a les 1 naast vrij trainen',
    pg_temp.boek(3, 'd7000000-0000-4000-8000-000000000003', null, null), true);
  perform pg_temp.verwacht('7b les 2 naast vrij trainen (vrij telt niet mee)',
    pg_temp.boek(3, 'd7000000-0000-4000-8000-000000000004', null, null), true);
  perform pg_temp.verwacht('7c derde les: daily_cap_reached',
    pg_temp.boek(3, 'd7000000-0000-4000-8000-000000000005', null, null), false, 'daily_cap_reached');
  -- Lid 8 heeft twee lessen op dag D en boekt daarna nog vrij trainen.
  perform pg_temp.verwacht('7d lid 8 les 1', pg_temp.boek(8, 'd7000000-0000-4000-8000-000000000004', null, null), true);
  perform pg_temp.verwacht('7e lid 8 les 2', pg_temp.boek(8, 'd7000000-0000-4000-8000-000000000005', null, null), true);
  perform pg_temp.verwacht('7f lid 8 vrij trainen na twee lessen lukt',
    pg_temp.boek(8, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('13:00'), 60), true);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Blokkerende les: kwartieren op 0, boeking geweigerd met slot_blocked
-- ---------------------------------------------------------------------------
do $$ declare r record; begin
  perform pg_temp.verwacht('8a slot 14:45-15:15 raakt blokkerende les: slot_blocked',
    pg_temp.boek(9, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('14:45'), 30), false, 'slot_blocked');
  perform pg_temp.verwacht('8b slot 14:00-15:00 grenst aan de les en lukt',
    pg_temp.boek(9, 'd7000000-0000-4000-8000-000000000001', pg_temp.at('14:00'), 60), true);

  perform pg_temp.als('authenticated', pg_temp.lid(9));
  for r in
    select * from tmc.vrij_trainen_availability(current_date + 3)
    where session_id = 'd7000000-0000-4000-8000-000000000001'
      and quarter_start in (pg_temp.at('09:00'), pg_temp.at('10:00'), pg_temp.at('11:15'),
                            pg_temp.at('11:30'), pg_temp.at('14:45'), pg_temp.at('15:00'),
                            pg_temp.at('15:45'), pg_temp.at('16:00'))
  loop
    if (r.quarter_start = pg_temp.at('09:00') and (r.booked, r.available, r.blocked) <> (1, 4, false))
       or (r.quarter_start = pg_temp.at('10:00') and (r.booked, r.available) <> (4, 1))
       or (r.quarter_start = pg_temp.at('11:15') and (r.booked, r.available) <> (4, 1))
       or (r.quarter_start = pg_temp.at('11:30') and (r.booked, r.available) <> (1, 4))
       or (r.quarter_start = pg_temp.at('14:45') and (r.booked, r.available, r.blocked) <> (1, 4, false))
       or (r.quarter_start in (pg_temp.at('15:00'), pg_temp.at('15:45')) and (r.available, r.blocked) <> (0, true))
       or (r.quarter_start = pg_temp.at('16:00') and (r.available, r.blocked) <> (5, false)) then
      raise exception 'FAIL 8c: beschikbaarheid % booked % available % blocked %', r.quarter_start, r.booked, r.available, r.blocked;
    end if;
  end loop;
  if (select count(*) from tmc.vrij_trainen_availability(current_date + 3)
      where session_id = 'd7000000-0000-4000-8000-000000000001') <> 56 then
    raise exception 'FAIL 8c: verwacht 56 kwartieren voor 07:00-21:00';
  end if;
  reset role;
  raise notice 'PASS 8c: beschikbaarheid per kwartier klopt (lid 1 annuleerde 10:00, blokkade 15:00-16:00 op 0)';
end $$;

-- EXECUTE-rechten via has_function_privilege en niet via een echte aanroep:
-- de lokale PG17-container crasht (signal 11) als anon een ingetrokken
-- SECURITY DEFINER-functie aanroept en de weigering wordt gevangen.
do $$ begin
  if has_function_privilege('anon', 'tmc.vrij_trainen_availability(date)', 'EXECUTE') then
    raise exception 'FAIL 8d: anon heeft EXECUTE op vrij_trainen_availability';
  end if;
  raise notice 'PASS 8d: anon heeft geen EXECUTE op vrij_trainen_availability';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Gast, proefcode en betaalde proefles op vrij trainen geweigerd
-- ---------------------------------------------------------------------------
insert into tmc.guest_passes (id, profile_id, period_start, period_end, passes_allocated)
values ('e7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000004', current_date - 1, current_date + 30, 2);
insert into tmc.trial_codes (id, code, created_by, label, max_uses)
values ('e7000000-0000-4000-8000-000000000002', 'VTSTEST1', 'a7000000-0000-4000-8000-000000000099', 'vts', 5);

do $$ declare r jsonb; begin
  perform pg_temp.als('authenticated', pg_temp.lid(4));
  r := tmc.book_guest_session('d7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001', 'Gast', 'gast@test.invalid');
  reset role;
  perform pg_temp.verwacht('9a gast via book_guest_session: session_not_eligible', r, false, 'session_not_eligible');

  begin
    insert into tmc.guest_bookings (guest_pass_id, session_id, booked_by, guest_name, guest_email, status)
    values ('e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', pg_temp.lid(4), 'Gast', 'gast@test.invalid', 'booked');
    raise exception 'FAIL 9b: directe gastboeking toegelaten';
  exception when raise_exception then
    if sqlerrm <> 'session_not_eligible' then raise; end if;
    raise notice 'PASS 9b: trigger weigert directe gastboeking op vrij trainen';
  end;

  set local role service_role;
  r := tmc.redeem_trial_code('VTSTEST1', 'd7000000-0000-4000-8000-000000000001', 'Bezoeker', 'bez@test.invalid', '0600000000');
  reset role;
  perform pg_temp.verwacht('9c proefcode op vrij trainen: session_not_trial_eligible', r, false, 'session_not_trial_eligible');

  begin
    insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status)
    values ('d7000000-0000-4000-8000-000000000001', 'Bezoeker', 'bez@test.invalid', '0600000000', 1500, 'pending');
    raise exception 'FAIL 9d: betaalde proefles op vrij trainen toegelaten';
  exception when raise_exception then
    if sqlerrm <> 'session_not_eligible' then raise; end if;
    raise notice 'PASS 9d: trigger weigert betaalde proefles op vrij trainen';
  end;

end $$;

-- ---------------------------------------------------------------------------
-- 10. Geen no-show en geen strike op vrij trainen
-- ---------------------------------------------------------------------------
do $$ declare v_vrij uuid; v_kb uuid; begin
  select id into v_vrij from tmc.bookings where profile_id = pg_temp.lid(5) and pillar = 'vrij_trainen' and status = 'booked';
  select id into v_kb from tmc.bookings where profile_id = pg_temp.lid(9) and pillar = 'kettlebell' and status = 'booked';
  begin
    update tmc.bookings set no_show_at = now() where id = v_vrij;
    raise exception 'FAIL 10a: no_show_at op vrij trainen toegelaten';
  exception when check_violation then
    raise notice 'PASS 10a: check-constraint weigert no_show_at op vrij trainen';
  end;
  begin
    insert into tmc.no_show_strikes (profile_id, booking_id, expires_at) values (pg_temp.lid(5), v_vrij, now() + interval '30 days');
    raise exception 'FAIL 10b: strike op vrij trainen toegelaten';
  exception when raise_exception then
    if sqlerrm <> 'vrij_trainen_no_strike' then raise; end if;
    raise notice 'PASS 10b: trigger weigert strike op vrij trainen';
  end;
  update tmc.bookings set no_show_at = now() where id = v_kb;
  insert into tmc.no_show_strikes (profile_id, booking_id, expires_at) values (pg_temp.lid(9), v_kb, now() + interval '30 days');
  raise notice 'PASS 10c: no-show en strike op een gewone les werken nog';
end $$;

-- ---------------------------------------------------------------------------
-- 11. Verschuiven van de dagsessie geweigerd
-- ---------------------------------------------------------------------------
do $$ declare r jsonb; begin
  perform pg_temp.als('authenticated', pg_temp.lid(99));
  r := tmc.admin_reschedule_class_session('d7000000-0000-4000-8000-000000000001', pg_temp.at('08:00'));
  reset role;
  perform pg_temp.verwacht('11a admin_reschedule op vrij trainen: vrij_trainen_not_reschedulable', r, false, 'vrij_trainen_not_reschedulable');

  begin
    update tmc.class_sessions set end_at = pg_temp.at('10:30') where id = 'd7000000-0000-4000-8000-000000000001';
    raise exception 'FAIL 11b: sessie kromp buiten geboekte slots';
  exception when raise_exception then
    if sqlerrm <> 'vrij_trainen_slots_outside_session' then raise; end if;
    raise notice 'PASS 11b: guard weigert een sessie die krimpt buiten geboekte slots';
  end;
  update tmc.class_sessions set end_at = pg_temp.at('20:45') where id = 'd7000000-0000-4000-8000-000000000001';
  raise notice 'PASS 11c: krimpen zonder geraakte slots mag';
end $$;

-- ---------------------------------------------------------------------------
-- 12. Unique-index: oude constraint weg, partiele index aanwezig
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'bookings_profile_id_session_id_key') then
    raise exception 'FAIL 12: oude constraint bestaat nog';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'tmc' and indexname = 'bookings_profile_session_active_key'
                 and indexdef like '%WHERE%') then
    raise exception 'FAIL 12: partiele unique index ontbreekt';
  end if;
  raise notice 'PASS 12: partiele unique index vervangt de oude constraint';
end $$;

-- ---------------------------------------------------------------------------
-- 13. Review PR #245: pillar-guard en maximaal een vrij-trainen-sessie per dag
--     (gaten R5a, R5b en R10 uit de review, nu dicht)
-- ---------------------------------------------------------------------------
-- Extra kettlebell-sessies op dag D+5 en D+6:
--   d7..07 alleen een betaalde proefles, d7..08 alleen een gast,
--   d7..09 leeg, d7..0a alleen een actieve wachtlijst-entry.
create or replace function pg_temp.at_d(p_days int, p_hhmm text) returns timestamptz language sql as $$
  select ((current_date + p_days)::text || ' ' || p_hhmm)::timestamp at time zone 'Europe/Amsterdam'
$$;
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, blocks_free_training, occurrence_start_at)
values
  ('d7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'kettlebell', 'adult', pg_temp.at_d(5, '09:00'), pg_temp.at_d(5, '10:00'), 6, 'scheduled', false, pg_temp.at_d(5, '09:00')),
  ('d7000000-0000-4000-8000-000000000008', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'kettlebell', 'adult', pg_temp.at_d(5, '11:00'), pg_temp.at_d(5, '12:00'), 6, 'scheduled', false, pg_temp.at_d(5, '11:00')),
  ('d7000000-0000-4000-8000-000000000009', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'kettlebell', 'adult', pg_temp.at_d(6, '07:00'), pg_temp.at_d(6, '21:00'), 6, 'scheduled', false, pg_temp.at_d(6, '07:00')),
  ('d7000000-0000-4000-8000-00000000000a', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'kettlebell', 'adult', pg_temp.at_d(5, '13:00'), pg_temp.at_d(5, '14:00'), 6, 'scheduled', false, pg_temp.at_d(5, '13:00'));
insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status)
values ('d7000000-0000-4000-8000-000000000007', 'Bezoeker', 'bez2@test.invalid', '0600000000', 1500, 'paid');
insert into tmc.guest_bookings (guest_pass_id, session_id, booked_by, guest_name, guest_email, status)
values ('e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000008', 'a7000000-0000-4000-8000-000000000004', 'Gast', 'gast2@test.invalid', 'booked');
insert into tmc.waitlist_entries (profile_id, session_id, position)
values ('a7000000-0000-4000-8000-000000000005', 'd7000000-0000-4000-8000-00000000000a', 1);

do $$ declare v_ids uuid[]; begin
  select array_agg(x order by x) into v_ids from tmc.sessions_with_participants(array[
    'd7000000-0000-4000-8000-000000000004', 'd7000000-0000-4000-8000-000000000007',
    'd7000000-0000-4000-8000-000000000008', 'd7000000-0000-4000-8000-000000000009',
    'd7000000-0000-4000-8000-00000000000a']::uuid[]) as t(x);
  if v_ids is distinct from array[
    'd7000000-0000-4000-8000-000000000004', 'd7000000-0000-4000-8000-000000000007',
    'd7000000-0000-4000-8000-000000000008', 'd7000000-0000-4000-8000-00000000000a']::uuid[] then
    raise exception 'FAIL 13a: sessions_with_participants gaf %', v_ids;
  end if;
  raise notice 'PASS 13a: sessions_with_participants telt boekingen, proeflessen, gasten en wachtlijst; lege sessie niet';
end $$;

do $$ begin
  -- R5a: vrij trainen met geboekte slots naar kettlebell.
  begin
    update tmc.class_sessions set pillar = 'kettlebell' where id = 'd7000000-0000-4000-8000-000000000001';
    raise exception 'FAIL 13b: pillar vrij_trainen naar kettlebell met geboekte slots toegelaten';
  exception when raise_exception then
    if sqlerrm <> 'vrij_trainen_pillar_change_not_empty' then raise; end if;
    raise notice 'PASS 13b: pillar van vrij trainen af met geboekte slots geweigerd';
  end;
  -- R5b: les met ledenboekingen, met alleen een proefles, met alleen een gast
  -- en met alleen een wachtlijst naar vrij trainen.
  begin
    update tmc.class_sessions set pillar = 'vrij_trainen', capacity = null where id = 'd7000000-0000-4000-8000-000000000004';
    raise exception 'FAIL 13c: les met boekingen werd vrij trainen';
  exception when raise_exception then
    if sqlerrm <> 'vrij_trainen_pillar_change_not_empty' then raise; end if;
    raise notice 'PASS 13c: les met ledenboekingen naar vrij trainen geweigerd';
  end;
  begin
    update tmc.class_sessions set pillar = 'vrij_trainen', capacity = null where id = 'd7000000-0000-4000-8000-000000000007';
    raise exception 'FAIL 13d: les met alleen een proefles werd vrij trainen';
  exception when raise_exception then
    if sqlerrm <> 'vrij_trainen_pillar_change_not_empty' then raise; end if;
    raise notice 'PASS 13d: les met alleen een betaalde proefles naar vrij trainen geweigerd';
  end;
  begin
    update tmc.class_sessions set pillar = 'vrij_trainen', capacity = null where id = 'd7000000-0000-4000-8000-000000000008';
    raise exception 'FAIL 13e: les met alleen een gast werd vrij trainen';
  exception when raise_exception then
    if sqlerrm <> 'vrij_trainen_pillar_change_not_empty' then raise; end if;
    raise notice 'PASS 13e: les met alleen een gast naar vrij trainen geweigerd';
  end;
  begin
    update tmc.class_sessions set pillar = 'vrij_trainen', capacity = null where id = 'd7000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL 13f: les met alleen een wachtlijst werd vrij trainen';
  exception when raise_exception then
    if sqlerrm <> 'vrij_trainen_pillar_change_not_empty' then raise; end if;
    raise notice 'PASS 13f: les met alleen een actieve wachtlijst naar vrij trainen geweigerd';
  end;
  -- Lege les mag wel vrij trainen worden (dag D+6 heeft nog geen vrij trainen).
  update tmc.class_sessions set pillar = 'vrij_trainen', capacity = null where id = 'd7000000-0000-4000-8000-000000000009';
  raise notice 'PASS 13g: lege les naar vrij trainen toegelaten';
end $$;

do $$ begin
  -- R10: tweede geplande vrij-trainen-sessie op dag D.
  begin
    insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, blocks_free_training, occurrence_start_at)
    values ('d7000000-0000-4000-8000-0000000000bb', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'vrij_trainen', 'adult', pg_temp.at('07:00'), pg_temp.at('21:00'), null, 'scheduled', false, pg_temp.at('07:01'));
    raise exception 'FAIL 13h: tweede vrij-trainen-sessie op dezelfde dag toegelaten';
  exception when unique_violation then
    if sqlerrm not like '%class_sessions_vrij_trainen_one_per_day%' then raise; end if;
    raise notice 'PASS 13h: tweede geplande vrij-trainen-sessie op dezelfde dag geweigerd door de index';
  end;
  -- Een geannuleerde tweede sessie mag bestaan, maar niet heractiveren.
  insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, blocks_free_training, occurrence_start_at)
  values ('d7000000-0000-4000-8000-0000000000bc', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'vrij_trainen', 'adult', pg_temp.at('08:00'), pg_temp.at('12:00'), null, 'cancelled', false, pg_temp.at('08:00'));
  begin
    update tmc.class_sessions set status = 'scheduled' where id = 'd7000000-0000-4000-8000-0000000000bc';
    raise exception 'FAIL 13i: heractiveren van een tweede vrij-trainen-sessie toegelaten';
  exception when unique_violation then
    raise notice 'PASS 13i: heractiveren van een tweede vrij-trainen-sessie op dezelfde dag geweigerd';
  end;
  -- Een lege les op dag D naar vrij trainen: botst met de bestaande dagsessie.
  begin
    update tmc.class_sessions set pillar = 'vrij_trainen', capacity = null where id = 'd7000000-0000-4000-8000-000000000006';
    raise exception 'FAIL 13j: lege les op dag D werd een tweede vrij-trainen-sessie';
  exception when unique_violation then
    raise notice 'PASS 13j: pillar-wijziging naar vrij trainen op een dag met vrij trainen geweigerd';
  end;
end $$;

do $$ begin
  if has_function_privilege('authenticated', 'tmc.sessions_with_participants(uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'tmc.sessions_with_participants(uuid[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'tmc.sessions_with_participants(uuid[])', 'EXECUTE') then
    raise exception 'FAIL 13k: rechten op sessions_with_participants kloppen niet';
  end if;
  raise notice 'PASS 13k: sessions_with_participants alleen voor service_role';
end $$;

do $$ begin raise notice 'ALLE TESTS GESLAAGD'; end $$;

rollback;
