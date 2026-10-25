#!/usr/bin/env bash
# DB-tests voor de harde weekcap per abonnement (spec-weekcap-extra-les.md,
# PR A): tmc.capped_pillars, de weekcap-tak van tmc.booking_gate via
# book_class_session, join_waitlist, book_walk_in en cancel_class_booking, en
# de grants. Het verificatieplan van de PR op SQL-niveau; de app zelf via de
# preview. Alleen tegen een LOKALE database (supabase db start in de
# worktree), nooit tegen productie.
#
# Gebruik: scripts/test-weekcap-db.sh <supabase_db_container>
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
update tmc.booking_settings
  set booking_window_days = 28, fair_use_daily_max = 2, vrij_trainen_max_concurrent = 5,
      check_in_enabled = true, check_in_pillars = array['yoga_mobility', 'kettlebell', 'vrij_trainen'];

-- Profielen (de trigger on_auth_user_created maakt tmc.profiles aan):
--  1 Groepslessen 2x        2 All Access 2x        3 Vrij Trainen 2x
--  4 Groepslessen Onbeperkt 5 rittenkaart          6 cap 2 zonder covered_pillars (vangnet)
--  7 Groepslessen Onbeperkt (vult de volle les)    9 admin en trainer
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('a5000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'wc-' || n || '@test.invalid', '{"provider":"email","providers":["email"]}',
       json_build_object('first_name', 'Wc' || n, 'last_name', 'Test')::jsonb, now(), now()
from generate_series(1, 9) as n;
update tmc.profiles set role = 'admin' where id = 'a5000000-0000-4000-8000-000000000009';

insert into tmc.memberships (profile_id, plan_type, plan_variant, frequency_cap, covered_pillars, price_per_cycle_cents, start_date, commit_end_date, status, age_category, credits_total, credits_remaining) values
  ('a5000000-0000-4000-8000-000000000001', 'groepslessen',  'groepslessen_2x',  2,    array['yoga_mobility', 'kettlebell'],                 7900,  current_date - 30, current_date + 365, 'active', 'adult', null, null),
  ('a5000000-0000-4000-8000-000000000002', 'all_inclusive', 'all_inclusive_2x', 2,    array['vrij_trainen', 'yoga_mobility', 'kettlebell'], 10900, current_date - 30, current_date + 365, 'active', 'adult', null, null),
  ('a5000000-0000-4000-8000-000000000003', 'vrij_trainen',  'vrij_trainen_2x',  2,    array['vrij_trainen'],                                4900,  current_date - 30, current_date + 365, 'active', 'adult', null, null),
  ('a5000000-0000-4000-8000-000000000004', 'groepslessen',  'groepslessen_unl', null, array['yoga_mobility', 'kettlebell'],                 11900, current_date - 30, current_date + 365, 'active', 'adult', null, null),
  ('a5000000-0000-4000-8000-000000000005', 'ten_ride_card', 'ten_ride_card',    null, '{}',                                                  15000, current_date - 30, current_date + 365, 'active', 'adult', 10, 10),
  ('a5000000-0000-4000-8000-000000000006', 'groepslessen',  'groepslessen_2x',  2,    '{}',                                                  7900,  current_date - 30, current_date + 365, 'active', 'adult', null, null),
  ('a5000000-0000-4000-8000-000000000007', 'groepslessen',  'groepslessen_unl', null, array['yoga_mobility', 'kettlebell'],                 11900, current_date - 30, current_date + 365, 'active', 'adult', null, null);

insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000009', 'WC Trainer', 'wc-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity) values
  ('c5000000-0000-4000-8000-000000000001', 'wc-vrij', 'WC vrij', 'vrij_trainen', 'adult', null),
  ('c5000000-0000-4000-8000-000000000002', 'wc-yoga', 'WC yoga', 'yoga_mobility', 'adult', 10),
  ('c5000000-0000-4000-8000-000000000003', 'wc-kb', 'WC kettlebell', 'kettlebell', 'adult', null);

-- W = de eerstvolgende maandag minstens twee dagen vooruit; de testweek is
-- W tot en met W+6, de week erna begint op W+7.
create function pg_temp.w(d int) returns text language sql as
$$ select (((current_date + 2) + ((8 - extract(isodow from (current_date + 2))::int) % 7)) + d)::text $$;
create function pg_temp.slot(d text, t text) returns timestamptz language sql as
$$ select (d || ' ' || t)::timestamp at time zone 'Europe/Amsterdam' $$;
create function pg_temp.sess(id text, ct text, pillar text, d int, t text, mins int, cap int) returns void language sql as
$$ insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
   values (id::uuid, ct::uuid, 'b5000000-0000-4000-8000-000000000001', pillar, 'adult',
           pg_temp.slot(pg_temp.w(d), t), pg_temp.slot(pg_temp.w(d), t) + make_interval(mins => mins), cap, 'scheduled', pg_temp.slot(pg_temp.w(d), t)) $$;

-- Groepslessen in de testweek: Y1 ma, K1 di, Y2 wo, YF wo (vol, 1 plek), Y3 do, K2 vr; Y4 ma volgende week.
select pg_temp.sess('d5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002', 'yoga_mobility', 0, '18:00', 60, 10);
select pg_temp.sess('d5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000003', 'kettlebell',    1, '19:30', 60, null);
select pg_temp.sess('d5000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000002', 'yoga_mobility', 2, '18:00', 60, 10);
select pg_temp.sess('d5000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000002', 'yoga_mobility', 2, '19:30', 60, 1);
select pg_temp.sess('d5000000-0000-4000-8000-000000000005', 'c5000000-0000-4000-8000-000000000002', 'yoga_mobility', 3, '18:00', 60, 10);
select pg_temp.sess('d5000000-0000-4000-8000-000000000006', 'c5000000-0000-4000-8000-000000000003', 'kettlebell',    4, '19:30', 60, null);
select pg_temp.sess('d5000000-0000-4000-8000-000000000007', 'c5000000-0000-4000-8000-000000000002', 'yoga_mobility', 7, '18:00', 60, 10);
-- Vrij trainen: dagsessies ma, di, wo (07:00 tot 21:00).
select pg_temp.sess('d5000000-0000-4000-8000-000000000011', 'c5000000-0000-4000-8000-000000000001', 'vrij_trainen', 0, '07:00', 840, null);
select pg_temp.sess('d5000000-0000-4000-8000-000000000012', 'c5000000-0000-4000-8000-000000000001', 'vrij_trainen', 1, '07:00', 840, null);
select pg_temp.sess('d5000000-0000-4000-8000-000000000013', 'c5000000-0000-4000-8000-000000000001', 'vrij_trainen', 2, '07:00', 840, null);
-- YW: yoga die over tien minuten begint (walk-in-venster).
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
values ('d5000000-0000-4000-8000-000000000021', 'c5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', 'yoga_mobility', 'adult',
        now() + interval '10 minutes', now() + interval '70 minutes', 10, 'scheduled', now() + interval '10 minutes');

create function pg_temp.check_(label text, ok boolean) returns text language sql as
$$ select case when ok then 'PASS ' || label else 'FAIL ' || label end $$;
create function pg_temp.uid(n int) returns text language sql as
$$ select 'a5000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0') $$;
-- Als lid n: book_class_session; de reason, of 'ok'.
create function pg_temp.book(n int, sid text, slot timestamptz default null, mins int default null) returns text language plpgsql as
$$ declare v jsonb; begin
   perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true);
   execute 'set local role authenticated';
   v := tmc.book_class_session(sid::uuid, slot, mins);
   reset role;
   return coalesce(v ->> 'reason', 'ok');
   exception when others then reset role; return 'ERR ' || sqlstate || ' ' || sqlerrm; end $$;
create function pg_temp.vrij(n int, sid text, d int, t text) returns text language sql as
$$ select pg_temp.book(n, sid, pg_temp.slot(pg_temp.w(d), t), 60) $$;
-- Als lid n: join_waitlist; de reason, of 'ok'.
create function pg_temp.wait(n int, sid text) returns text language plpgsql as
$$ declare v jsonb; begin
   perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true);
   execute 'set local role authenticated';
   v := tmc.join_waitlist(sid::uuid);
   reset role;
   return coalesce(v ->> 'reason', 'ok');
   exception when others then reset role; return 'ERR ' || sqlstate || ' ' || sqlerrm; end $$;
-- Als lid n: cancel_class_booking van de eigen boeking op sessie sid.
create function pg_temp.cancel(n int, sid text) returns text language plpgsql as
$$ declare v jsonb; bid uuid; begin
   select id into bid from tmc.bookings where profile_id = pg_temp.uid(n)::uuid and session_id = sid::uuid and status = 'booked';
   perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true);
   execute 'set local role authenticated';
   v := tmc.cancel_class_booking(bid);
   reset role;
   return case when (v ->> 'ok')::boolean then 'ok' else coalesce(v ->> 'reason', 'nok') end;
   exception when others then reset role; return 'ERR ' || sqlstate || ' ' || sqlerrm; end $$;
-- Als admin 9: book_walk_in voor lid n.
create function pg_temp.walkin(n int, sid text) returns text language plpgsql as
$$ declare v jsonb; begin
   perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(9), 'role', 'authenticated')::text, true);
   execute 'set local role authenticated';
   v := tmc.book_walk_in(sid::uuid, pg_temp.uid(n)::uuid);
   reset role;
   return case when (v ->> 'ok')::boolean then 'ok' else coalesce(v ->> 'reason', 'nok') end;
   exception when others then reset role; return 'ERR ' || sqlstate || ' ' || sqlerrm; end $$;
create function pg_temp.booked(n int, sid text) returns boolean language sql as
$$ select exists (select 1 from tmc.bookings where profile_id = pg_temp.uid(n)::uuid and session_id = sid::uuid and status = 'booked') $$;

-- 0. Afleiding en rechten.
select pg_temp.check_('0 capped_pillars All Access = groepspillars', tmc.capped_pillars(array['vrij_trainen', 'yoga_mobility', 'kettlebell']) = array['kettlebell', 'yoga_mobility']);
select pg_temp.check_('0 capped_pillars vrij trainen = vrij trainen', tmc.capped_pillars(array['vrij_trainen']) = array['vrij_trainen']);
select pg_temp.check_('0 booking_gate niet uitvoerbaar voor app-rollen',
  not has_function_privilege('anon', 'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)', 'execute')
  and not has_function_privilege('service_role', 'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)', 'execute'));
select pg_temp.check_('0 capped_pillars niet uitvoerbaar voor app-rollen',
  not has_function_privilege('anon', 'tmc.capped_pillars(text[])', 'execute')
  and not has_function_privilege('authenticated', 'tmc.capped_pillars(text[])', 'execute'));
select pg_temp.check_('0 booking_gate gebruikt capped_pillars en kent check_in_pillars niet meer',
  (select prosrc from pg_proc where oid = 'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)'::regprocedure) ilike '%capped_pillars%'
  and (select prosrc from pg_proc where oid = 'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)'::regprocedure) not ilike '%check_in_pillars%');

-- 1. Groepslessen 2x: yoga plus kettlebell lukt, derde groepsles niet, volgende week wel.
select pg_temp.check_('1a Y1 ma', pg_temp.book(1, 'd5000000-0000-4000-8000-000000000001') = 'ok');
select pg_temp.check_('1a K1 di', pg_temp.book(1, 'd5000000-0000-4000-8000-000000000002') = 'ok');
select pg_temp.check_('1b derde groepsles Y2 wo: weekly_cap_reached', pg_temp.book(1, 'd5000000-0000-4000-8000-000000000003') = 'weekly_cap_reached');
select pg_temp.check_('1b derde groepsles K2 vr: weekly_cap_reached', pg_temp.book(1, 'd5000000-0000-4000-8000-000000000006') = 'weekly_cap_reached');
select pg_temp.check_('1c Y4 volgende week ma: ok', pg_temp.book(1, 'd5000000-0000-4000-8000-000000000007') = 'ok');

-- 2. Volle les boven de cap: geen wachtlijst (weekly_cap_reached, niet capacity_full).
select pg_temp.check_('2 YF vol door lid 7', pg_temp.book(7, 'd5000000-0000-4000-8000-000000000004') = 'ok');
select pg_temp.check_('2 lid 1 boven de cap op volle YF: weekly_cap_reached, geen wachtlijst', pg_temp.wait(1, 'd5000000-0000-4000-8000-000000000004') = 'weekly_cap_reached');
select pg_temp.check_('2 lid 4 (onbeperkt) op volle YF: wachtlijst lukt', pg_temp.wait(4, 'd5000000-0000-4000-8000-000000000004') = 'ok');

-- 3. Annuleren geeft het weektegoed vrij.
select pg_temp.check_('3 Y1 annuleren', pg_temp.cancel(1, 'd5000000-0000-4000-8000-000000000001') = 'ok');
select pg_temp.check_('3 Y2 wo lukt nu', pg_temp.book(1, 'd5000000-0000-4000-8000-000000000003') = 'ok');
select pg_temp.check_('3 Y1 opnieuw: weekly_cap_reached', pg_temp.book(1, 'd5000000-0000-4000-8000-000000000001') = 'weekly_cap_reached');

-- 4. Een bijgekochte extra les (drop_in_payment_id, PR B) telt niet mee.
select pg_temp.check_('4 Y2 annuleren', pg_temp.cancel(1, 'd5000000-0000-4000-8000-000000000003') = 'ok');
insert into tmc.bookings (profile_id, session_id, session_date, pillar, iso_week, iso_year, membership_id, credits_used, status, drop_in_payment_id, drop_in_price_cents)
select pg_temp.uid(1)::uuid, id, (start_at at time zone 'utc')::date, pillar,
       extract(week from (start_at at time zone 'utc')::date)::int, extract(isoyear from (start_at at time zone 'utc')::date)::int,
       null, 0, 'booked', 'tr_weekcap_test', 1500
from tmc.class_sessions where id = 'd5000000-0000-4000-8000-000000000005';
select pg_temp.check_('4 K1 plus extra les Y3: K2 vr lukt (extra les telt niet)', pg_temp.book(1, 'd5000000-0000-4000-8000-000000000006') = 'ok');
select pg_temp.check_('4 K1 plus K2: Y2 wo weer weekly_cap_reached', pg_temp.book(1, 'd5000000-0000-4000-8000-000000000003') = 'weekly_cap_reached');

-- 5. Kiosk-walk-in boven de cap: lukt.
select pg_temp.check_('5 walk-in voor lid 1 boven de cap: ok', pg_temp.walkin(1, 'd5000000-0000-4000-8000-000000000021') = 'ok');
select pg_temp.check_('5 walk-in-boeking staat met walk_in_at',
  exists (select 1 from tmc.bookings where profile_id = pg_temp.uid(1)::uuid and session_id = 'd5000000-0000-4000-8000-000000000021' and status = 'booked' and walk_in_at is not null));
select pg_temp.check_('5 lid 1 heeft nu drie gewone groepslessen in de testweek plus extra les en walk-in',
  (select count(*) from tmc.bookings b where b.profile_id = pg_temp.uid(1)::uuid and b.status = 'booked') = 5);

-- 6. All Access 2x: vrij trainen onbeperkt, groepslessen samen geteld.
select pg_temp.check_('6 V1 ma 10:00', pg_temp.vrij(2, 'd5000000-0000-4000-8000-000000000011', 0, '10:00') = 'ok');
select pg_temp.check_('6 V2 di 10:00', pg_temp.vrij(2, 'd5000000-0000-4000-8000-000000000012', 1, '10:00') = 'ok');
select pg_temp.check_('6 V3 wo 10:00 (derde vrij trainen): ok', pg_temp.vrij(2, 'd5000000-0000-4000-8000-000000000013', 2, '10:00') = 'ok');
select pg_temp.check_('6 Y1 ma', pg_temp.book(2, 'd5000000-0000-4000-8000-000000000001') = 'ok');
select pg_temp.check_('6 K1 di', pg_temp.book(2, 'd5000000-0000-4000-8000-000000000002') = 'ok');
select pg_temp.check_('6 derde groepsles Y2: weekly_cap_reached', pg_temp.book(2, 'd5000000-0000-4000-8000-000000000003') = 'weekly_cap_reached');

-- 7. Vrij Trainen 2x: derde vrij-trainen-sessie geweigerd, groepsles is geen dekking.
select pg_temp.check_('7 V1 ma', pg_temp.vrij(3, 'd5000000-0000-4000-8000-000000000011', 0, '11:00') = 'ok');
select pg_temp.check_('7 V2 di', pg_temp.vrij(3, 'd5000000-0000-4000-8000-000000000012', 1, '11:00') = 'ok');
select pg_temp.check_('7 V3 wo: weekly_cap_reached', pg_temp.vrij(3, 'd5000000-0000-4000-8000-000000000013', 2, '11:00') = 'weekly_cap_reached');
select pg_temp.check_('7 groepsles: no_coverage', pg_temp.book(3, 'd5000000-0000-4000-8000-000000000001') = 'no_coverage');

-- 8. Groepslessen Onbeperkt en rittenkaart: ongewijzigd.
select pg_temp.check_('8 onbeperkt: vijf groepslessen in een week',
  pg_temp.book(4, 'd5000000-0000-4000-8000-000000000001') = 'ok' and pg_temp.book(4, 'd5000000-0000-4000-8000-000000000002') = 'ok'
  and pg_temp.book(4, 'd5000000-0000-4000-8000-000000000003') = 'ok' and pg_temp.book(4, 'd5000000-0000-4000-8000-000000000005') = 'ok'
  and pg_temp.book(4, 'd5000000-0000-4000-8000-000000000006') = 'ok');
select pg_temp.check_('8 rittenkaart: drie groepslessen in een week',
  pg_temp.book(5, 'd5000000-0000-4000-8000-000000000001') = 'ok' and pg_temp.book(5, 'd5000000-0000-4000-8000-000000000002') = 'ok'
  and pg_temp.book(5, 'd5000000-0000-4000-8000-000000000003') = 'ok');
select pg_temp.check_('8 rittenkaart: drie ritten af', (select credits_remaining from tmc.memberships where profile_id = pg_temp.uid(5)::uuid) = 7);

-- 9. Vangnet: cap zonder covered_pillars telt per pillar van de sessie.
select pg_temp.check_('9 Y1 ok, K1 ok, Y2 ok (yoga 2e), Y3 weekly_cap_reached (yoga 3e)',
  pg_temp.book(6, 'd5000000-0000-4000-8000-000000000001') = 'ok' and pg_temp.book(6, 'd5000000-0000-4000-8000-000000000002') = 'ok'
  and pg_temp.book(6, 'd5000000-0000-4000-8000-000000000003') = 'ok' and pg_temp.book(6, 'd5000000-0000-4000-8000-000000000005') = 'weekly_cap_reached');

rollback;
SQL
)
echo "$OUT"
if echo "$OUT" | grep -q '^FAIL\|ERR '; then
  echo "ER ZIJN TESTS GEFAALD"
  exit 1
fi
echo "ALLE DB-TESTS GESLAAGD"
