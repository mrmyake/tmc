-- Walk-in (check-in-spoor PR 3): de databaseregels van tmc.book_walk_in en
-- tmc.undo_walk_in met eigen wegwerp-fixtures, alles in een transactie die
-- aan het einde terugrolt. Draaien na de merge en de db push:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-walk-in.sql
-- of in een rollback-transactie via de MCP. Elke PASS is een notice; een
-- fout stopt het script. Raakt geen bestaande rijen: profielen, trainers,
-- sessies en memberships worden hier aangemaakt en weer weggerold.
--
-- Gate-simulatie: de RPC's lezen auth.uid() en tmc.current_user_role()
-- (de rol uit tmc.profiles). We zetten request.jwt.claims zodat auth.uid()
-- het staf-profiel teruggeeft; de functies draaien als eigenaar (postgres),
-- dus RLS speelt hier geen rol, precies zoals via PostgREST.

begin;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_trainer_a uuid := gen_random_uuid();
  v_trainer_b uuid := gen_random_uuid();
  v_trainer_a_row uuid;
  v_trainer_b_row uuid;
  v_member_sub uuid := gen_random_uuid();
  v_member_card uuid := gen_random_uuid();
  v_member_none uuid := gen_random_uuid();
  v_member_vt uuid := gen_random_uuid();
  v_card uuid;
  v_class_type uuid;
  v_session uuid;
  v_session_other uuid;
  v_session_tomorrow uuid;
  v_session_vt uuid;
  v_res jsonb;
  v_booking uuid;
  v_credits int;
  v_count int;
  v_start timestamptz := now() - interval '20 minutes';
begin
  -- Fixtures --------------------------------------------------------------
  -- auth.users eerst: de trigger handle_new_auth_user maakt de profielen
  -- (first_name, last_name, member_code), daarna de rol en leeftijd zetten.
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
         '{"provider":"email","providers":["email"]}'::jsonb,
         json_build_object('first_name', 'Test', 'last_name', u.ln)::jsonb, now(), now()
  from (values
    (v_admin, 'walkin-test-admin@test.invalid', 'Admin'),
    (v_trainer_a, 'walkin-test-trainer-a@test.invalid', 'TrainerA'),
    (v_trainer_b, 'walkin-test-trainer-b@test.invalid', 'TrainerB'),
    (v_member_sub, 'walkin-test-sub@test.invalid', 'Abonnee'),
    (v_member_card, 'walkin-test-card@test.invalid', 'Rittenkaart'),
    (v_member_none, 'walkin-test-none@test.invalid', 'Zonder'),
    (v_member_vt, 'walkin-test-vt@test.invalid', 'VrijTrainen')
  ) as u(id, email, ln);
  update tmc.profiles set role = 'admin', age_category = 'adult' where id = v_admin;
  update tmc.profiles set role = 'trainer', age_category = 'adult' where id in (v_trainer_a, v_trainer_b);
  update tmc.profiles set role = 'member', age_category = 'adult'
  where id in (v_member_sub, v_member_card, v_member_none, v_member_vt);

  insert into tmc.trainers (profile_id, display_name, slug, is_active)
  values (v_trainer_a, 'Test TrainerA', 'walkin-test-a-' || left(v_trainer_a::text, 8), true)
  returning id into v_trainer_a_row;
  insert into tmc.trainers (profile_id, display_name, slug, is_active)
  values (v_trainer_b, 'Test TrainerB', 'walkin-test-b-' || left(v_trainer_b::text, 8), true)
  returning id into v_trainer_b_row;

  select id into v_class_type from tmc.class_types where pillar = 'kettlebell' limit 1;
  if v_class_type is null then
    raise exception 'geen class_type voor kettlebell; fixture niet mogelijk';
  end if;

  -- Volle les (capaciteit 1), 20 minuten geleden begonnen, trainer A.
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, occurrence_start_at, capacity, status)
  values (v_class_type, v_trainer_a_row, 'kettlebell', 'adult', v_start, v_start + interval '1 hour', v_start, 1, 'scheduled')
  returning id into v_session;
  -- Les van trainer B, zelfde moment.
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, occurrence_start_at, capacity, status)
  values (v_class_type, v_trainer_b_row, 'kettlebell', 'adult', v_start, v_start + interval '1 hour', v_start, 12, 'scheduled')
  returning id into v_session_other;
  -- Les van morgen (buiten het venster).
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, occurrence_start_at, capacity, status)
  values (v_class_type, v_trainer_a_row, 'kettlebell', 'adult', v_start + interval '1 day', v_start + interval '1 day 1 hour', v_start + interval '1 day', 12, 'scheduled')
  returning id into v_session_tomorrow;
  -- Vrij trainen: hooguit een per dag (class_sessions_vrij_trainen_one_per_day),
  -- dus de bestaande van vandaag hergebruiken en anders een aanmaken.
  select id into v_session_vt
  from tmc.class_sessions
  where pillar = 'vrij_trainen'
    and (start_at at time zone 'Europe/Amsterdam')::date = (now() at time zone 'Europe/Amsterdam')::date
  limit 1;
  if v_session_vt is null then
    insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, occurrence_start_at, capacity, status)
    values (v_class_type, v_trainer_a_row, 'vrij_trainen', 'adult', v_start, v_start + interval '4 hours', v_start, null, 'scheduled')
    returning id into v_session_vt;
  end if;

  insert into tmc.memberships (profile_id, plan_type, status, start_date, age_category, price_per_cycle_cents, commit_end_date)
  values (v_member_sub, 'groepslessen', 'active', current_date - 30, 'adult', 0, current_date + 300);
  insert into tmc.memberships (profile_id, plan_type, status, start_date, age_category, price_per_cycle_cents, commit_end_date, credits_total, credits_remaining, credits_expires_at)
  values (v_member_card, 'ten_ride_card', 'active', current_date - 30, 'adult', 0, current_date + 300, 10, 2, current_date + 100)
  returning id into v_card;
  insert into tmc.memberships (profile_id, plan_type, status, start_date, age_category, price_per_cycle_cents, commit_end_date)
  values (v_member_vt, 'vrij_trainen', 'active', current_date - 30, 'adult', 0, current_date + 300);

  -- De les is vol: een bestaande boeking vult de enige plek.
  insert into tmc.bookings (profile_id, session_id, session_date, pillar, iso_week, iso_year, status)
  values (v_member_vt, v_session, (v_start at time zone 'utc')::date, 'kettlebell',
          extract(week from v_start)::int, extract(isoyear from v_start)::int, 'booked');

  -- Als trainer A -----------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_trainer_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_trainer_a::text, true);

  -- 1. Volle les, na de start: walk-in komt erbij (capaciteit 1, bezetting 2).
  v_res := tmc.book_walk_in(v_session, v_member_sub);
  if not (v_res ->> 'ok')::boolean then
    raise exception 'test 1: walk-in op volle les geweigerd: %', v_res;
  end if;
  v_booking := (v_res ->> 'booking_id')::uuid;
  select count(*) into v_count from tmc.bookings where session_id = v_session and status = 'booked';
  if v_count <> 2 then raise exception 'test 1: bezetting % in plaats van 2', v_count; end if;
  if (select walk_in_at from tmc.bookings where id = v_booking) is null then
    raise exception 'test 1: walk_in_at niet gezet';
  end if;
  if (select trainer_alerted_at from tmc.bookings where id = v_booking) is null then
    raise exception 'test 1: trainer_alerted_at niet gezet';
  end if;
  if not exists (select 1 from tmc.events where type = 'booking.created' and subject_id = v_booking and payload ->> 'source' = 'walk_in' and actor_type = 'trainer') then
    raise exception 'test 1: booking.created met source walk_in ontbreekt';
  end if;
  raise notice 'PASS 1: walk-in op volle les na de start, walk_in_at en event';

  -- 2. Nogmaals: already_booked met dezelfde booking_id.
  v_res := tmc.book_walk_in(v_session, v_member_sub);
  if not ((v_res ->> 'ok')::boolean and v_res ->> 'reason' = 'already_booked' and (v_res ->> 'booking_id')::uuid = v_booking) then
    raise exception 'test 2: verwacht already_booked met bestaande id, kreeg %', v_res;
  end if;
  raise notice 'PASS 2: al geboekt geeft de bestaande boeking terug';

  -- 3. Rittenkaart: 1 rit eraf via apply_credit_adjustment, credits_used 1, spoor met booking_id.
  v_res := tmc.book_walk_in(v_session, v_member_card);
  if not (v_res ->> 'ok')::boolean then raise exception 'test 3: %', v_res; end if;
  if (v_res ->> 'credits_used')::int <> 1 then raise exception 'test 3: credits_used %', v_res ->> 'credits_used'; end if;
  select credits_remaining into v_credits from tmc.memberships where id = v_card;
  if v_credits <> 1 then raise exception 'test 3: credits_remaining % in plaats van 1', v_credits; end if;
  if (select credits_used from tmc.bookings where id = (v_res ->> 'booking_id')::uuid) <> 1 then
    raise exception 'test 3: bookings.credits_used niet 1';
  end if;
  if not exists (
    select 1 from tmc.events
    where type = 'credits.adjusted' and subject_id = v_card
      and (payload ->> 'delta')::int = -1 and payload ->> 'source' = 'booking'
      and payload ->> 'reason' like '%' || (v_res ->> 'booking_id') || '%'
  ) then
    raise exception 'test 3: credits.adjusted met booking_id in de reason ontbreekt';
  end if;
  raise notice 'PASS 3: rittenkaart min een rit via de kern, spoor met booking_id';

  -- 4. Geen dekking.
  v_res := tmc.book_walk_in(v_session, v_member_none);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'no_coverage' then
    raise exception 'test 4: verwacht no_coverage, kreeg %', v_res;
  end if;
  raise notice 'PASS 4: geen dekking geweigerd';

  -- 5. Buiten het venster (morgen).
  v_res := tmc.book_walk_in(v_session_tomorrow, v_member_sub);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'outside_window' then
    raise exception 'test 5: verwacht outside_window, kreeg %', v_res;
  end if;
  raise notice 'PASS 5: buiten het venster geweigerd';

  -- 7. Trainer van een andere sessie: 42501.
  begin
    v_res := tmc.book_walk_in(v_session_other, v_member_sub);
    raise exception 'test 7: trainer A mocht boeken op de les van trainer B';
  exception
    when insufficient_privilege then
      raise notice 'PASS 7: trainer van een andere sessie geweigerd (42501)';
  end;

  -- 8. Lid (geen staf): 42501.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_sub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_member_sub::text, true);
  begin
    v_res := tmc.book_walk_in(v_session_other, v_member_sub);
    raise exception 'test 8: een lid mocht een walk-in boeken';
  exception
    when insufficient_privilege then
      raise notice 'PASS 8: lid geweigerd (42501)';
  end;

  -- 9. Admin mag op elke sessie, ook die van trainer B.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  v_res := tmc.book_walk_in(v_session_other, v_member_sub);
  if not (v_res ->> 'ok')::boolean then raise exception 'test 9: admin geweigerd: %', v_res; end if;
  raise notice 'PASS 9: admin mag op de les van een andere trainer';

  -- 6. Vrij trainen (als admin, want de bestaande sessie van vandaag kan van
  -- een andere trainer zijn en de gate gaat voor de pillar-check).
  v_res := tmc.book_walk_in(v_session_vt, v_member_vt);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'not_a_class' then
    raise exception 'test 6: verwacht not_a_class, kreeg %', v_res;
  end if;
  raise notice 'PASS 6: vrij trainen geweigerd';

  -- 10. Gewone boeking blijft onder de capaciteitsgrens (override is walk-in-only).
  begin
    insert into tmc.bookings (profile_id, session_id, session_date, pillar, iso_week, iso_year, status)
    values (v_member_none, v_session, (v_start at time zone 'utc')::date, 'kettlebell',
            extract(week from v_start)::int, extract(isoyear from v_start)::int, 'booked');
    raise exception 'test 10: gewone insert op een volle les is doorgelaten';
  exception
    when raise_exception then
      if sqlerrm <> 'session_capacity_exceeded' then raise; end if;
      raise notice 'PASS 10: gewone boeking op een volle les blijft geweigerd';
  end;

  -- 11. Ongedaan maken: rittenkaart terug, status cancelled, reden walk_in_undone.
  perform set_config('request.jwt.claims', json_build_object('sub', v_trainer_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_trainer_a::text, true);
  select id into v_booking from tmc.bookings where session_id = v_session and profile_id = v_member_card and status = 'booked';
  v_res := tmc.undo_walk_in(v_booking);
  if not (v_res ->> 'ok')::boolean then raise exception 'test 11: %', v_res; end if;
  if (v_res ->> 'credits_refunded')::int <> 1 then raise exception 'test 11: credits_refunded %', v_res; end if;
  select credits_remaining into v_credits from tmc.memberships where id = v_card;
  if v_credits <> 2 then raise exception 'test 11: credits_remaining % in plaats van 2', v_credits; end if;
  if (select status || '/' || cancellation_reason || '/' || credits_used::text from tmc.bookings where id = v_booking) <> 'cancelled/walk_in_undone/0' then
    raise exception 'test 11: boeking niet netjes geannuleerd';
  end if;
  if exists (select 1 from tmc.no_show_strikes where booking_id = v_booking) then
    raise exception 'test 11: strike aangemaakt';
  end if;
  if not exists (select 1 from tmc.events where type = 'booking.cancelled' and subject_id = v_booking and payload ->> 'reason' = 'walk_in_undone') then
    raise exception 'test 11: booking.cancelled ontbreekt';
  end if;
  raise notice 'PASS 11: ongedaan maken boekt de rit terug en annuleert zonder strike';

  -- 12. Nogmaals ongedaan maken: not_booked. Gewone boeking: not_a_walk_in.
  v_res := tmc.undo_walk_in(v_booking);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'not_booked' then
    raise exception 'test 12a: verwacht not_booked, kreeg %', v_res;
  end if;
  select id into v_booking from tmc.bookings where session_id = v_session and profile_id = v_member_vt;
  v_res := tmc.undo_walk_in(v_booking);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'not_a_walk_in' then
    raise exception 'test 12b: verwacht not_a_walk_in, kreeg %', v_res;
  end if;
  raise notice 'PASS 12: dubbel ongedaan maken en gewone boeking geweigerd';

  -- 13. Na de walk-in kan het lid gewoon opnieuw worden toegevoegd (nieuwe rij naast de geannuleerde).
  v_res := tmc.book_walk_in(v_session, v_member_card);
  if not (v_res ->> 'ok')::boolean or v_res ->> 'reason' = 'already_booked' then
    raise exception 'test 13: opnieuw toevoegen na ongedaan maken faalt: %', v_res;
  end if;
  raise notice 'PASS 13: opnieuw toevoegen na ongedaan maken';

  -- 14. book_class_session (vijf argumenten, default p_walk_in false) weigert nog steeds op een begonnen les.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_none, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_member_none::text, true);
  v_res := tmc.book_class_session(v_session_other);
  if (v_res ->> 'ok')::boolean or v_res ->> 'reason' <> 'session_in_past' then
    raise exception 'test 14: verwacht session_in_past uit book_class_session, kreeg %', v_res;
  end if;
  raise notice 'PASS 14: gewoon boeken houdt de starttijd-cutoff';
end;
$$;

rollback;
