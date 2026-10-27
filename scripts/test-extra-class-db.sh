#!/usr/bin/env bash
# DB-tests voor het bijkopen van een extra les (spec-weekcap-extra-les.md,
# PR B): tmc.extra_class_price, het betaalde pad van booking_gate via
# book_class_session en start_extra_class_booking, confirm_extra_class_booking
# (betaald, mislukt, verlopen, te laat met en zonder plek), de refund-
# intenties van cancel_class_booking en cancel_class_session_core, de
# omzetview en de rechten. Alleen tegen een LOKALE database (supabase db
# start in de worktree), nooit tegen productie.
#
# Gebruik: scripts/test-extra-class-db.sh <supabase_db_container>
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
  set booking_window_days = 28, fair_use_daily_max = 2, vrij_trainen_max_concurrent = 5, cancellation_window_hours = 6;

-- Profielen: 1 Groepslessen 2x, 3 Vrij Trainen 2x, 4 Groepslessen Onbeperkt,
-- 5 alleen rittenkaart, 7 Groepslessen Onbeperkt (vulling), 9 admin.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'ec-' || n || '@test.invalid', '{"provider":"email","providers":["email"]}',
       json_build_object('first_name', 'Ec' || n, 'last_name', 'Test')::jsonb, now(), now()
from generate_series(1, 9) as n;
update tmc.profiles set role = 'admin' where id = 'a6000000-0000-4000-8000-000000000009';

insert into tmc.memberships (profile_id, plan_type, plan_variant, frequency_cap, covered_pillars, price_per_cycle_cents, start_date, commit_end_date, status, age_category, credits_total, credits_remaining) values
  ('a6000000-0000-4000-8000-000000000001', 'groepslessen',  'groepslessen_2x',  2,    array['yoga_mobility', 'kettlebell'], 7900,  current_date - 30, current_date + 365, 'active', 'adult', null, null),
  ('a6000000-0000-4000-8000-000000000003', 'vrij_trainen',  'vrij_trainen_2x',  2,    array['vrij_trainen'],                4900,  current_date - 30, current_date + 365, 'active', 'adult', null, null),
  ('a6000000-0000-4000-8000-000000000004', 'groepslessen',  'groepslessen_unl', null, array['yoga_mobility', 'kettlebell'], 11900, current_date - 30, current_date + 365, 'active', 'adult', null, null),
  ('a6000000-0000-4000-8000-000000000005', 'ten_ride_card', 'ten_ride_card',    null, '{}',                                  15000, current_date - 30, current_date + 365, 'active', 'adult', 10, 10),
  ('a6000000-0000-4000-8000-000000000007', 'groepslessen',  'groepslessen_unl', null, array['yoga_mobility', 'kettlebell'], 11900, current_date - 30, current_date + 365, 'active', 'adult', null, null);

insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000009', 'EC Trainer', 'ec-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity) values
  ('c6000000-0000-4000-8000-000000000001', 'ec-vrij', 'EC vrij', 'vrij_trainen', 'adult', null),
  ('c6000000-0000-4000-8000-000000000002', 'ec-yoga', 'EC yoga', 'yoga_mobility', 'adult', 10),
  ('c6000000-0000-4000-8000-000000000003', 'ec-kb', 'EC kettlebell', 'kettlebell', 'adult', null);

create function pg_temp.w(d int) returns text language sql as
$$ select (((current_date + 2) + ((8 - extract(isodow from (current_date + 2))::int) % 7)) + d)::text $$;
create function pg_temp.slot(d text, t text) returns timestamptz language sql as
$$ select (d || ' ' || t)::timestamp at time zone 'Europe/Amsterdam' $$;
create function pg_temp.sess(id text, ct text, pillar text, d int, t text, mins int, cap int) returns void language sql as
$$ insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
   values (id::uuid, ct::uuid, 'b6000000-0000-4000-8000-000000000001', pillar, 'adult',
           pg_temp.slot(pg_temp.w(d), t), pg_temp.slot(pg_temp.w(d), t) + make_interval(mins => mins), cap, 'scheduled', pg_temp.slot(pg_temp.w(d), t)) $$;

-- Y1 ma, K1 di, Y2 wo, Y3 do, YS vr (capaciteit 1), V1 ma (vrij trainen).
select pg_temp.sess('d6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'yoga_mobility', 0, '18:00', 60, 10);
select pg_temp.sess('d6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000003', 'kettlebell',    1, '19:30', 60, null);
select pg_temp.sess('d6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000002', 'yoga_mobility', 2, '18:00', 60, 10);
select pg_temp.sess('d6000000-0000-4000-8000-000000000004', 'c6000000-0000-4000-8000-000000000002', 'yoga_mobility', 3, '18:00', 60, 10);
select pg_temp.sess('d6000000-0000-4000-8000-000000000005', 'c6000000-0000-4000-8000-000000000002', 'yoga_mobility', 4, '18:00', 60, 1);
select pg_temp.sess('d6000000-0000-4000-8000-000000000011', 'c6000000-0000-4000-8000-000000000001', 'vrij_trainen', 0, '07:00', 840, null);
-- YN: yoga over twee uur (binnen de annuleringstermijn van zes uur).
insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at)
values ('d6000000-0000-4000-8000-000000000021', 'c6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', 'yoga_mobility', 'adult',
        now() + interval '2 hours', now() + interval '3 hours', 10, 'scheduled', now() + interval '2 hours');

create function pg_temp.check_(label text, ok boolean) returns text language sql as
$$ select case when ok then 'PASS ' || label else 'FAIL ' || label end $$;
create function pg_temp.uid(n int) returns uuid language sql as
$$ select ('a6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function pg_temp.as_member(n int) returns void language plpgsql as
$$ begin
   perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true);
   execute 'set local role authenticated'; end $$;
create function pg_temp.as_system() returns void language plpgsql as
$$ begin reset role; perform set_config('request.jwt.claims', '', true); end $$;
-- Als lid n: book_class_session, volledige jsonb.
create function pg_temp.bookj(n int, sid text, slot timestamptz default null, mins int default null) returns jsonb language plpgsql as
$$ declare v jsonb; begin
   perform pg_temp.as_member(n);
   v := tmc.book_class_session(sid::uuid, slot, mins);
   perform pg_temp.as_system();
   return v;
   exception when others then perform pg_temp.as_system(); return jsonb_build_object('ok', false, 'reason', 'ERR ' || sqlstate || ' ' || sqlerrm); end $$;
create function pg_temp.book(n int, sid text, slot timestamptz default null, mins int default null) returns text language sql as
$$ select coalesce(pg_temp.bookj(n, sid, slot, mins) ->> 'reason', 'ok') $$;
-- Als lid n: start_extra_class_booking.
create function pg_temp.startj(n int, sid text, slot timestamptz default null, mins int default null) returns jsonb language plpgsql as
$$ declare v jsonb; begin
   perform pg_temp.as_member(n);
   v := tmc.start_extra_class_booking(sid::uuid, slot, mins);
   perform pg_temp.as_system();
   return v;
   exception when others then perform pg_temp.as_system(); return jsonb_build_object('ok', false, 'reason', 'ERR ' || sqlstate || ' ' || sqlerrm); end $$;
-- Als lid n: cancel_class_booking op de eigen actieve rij van sessie sid.
create function pg_temp.cancelj(n int, sid text) returns jsonb language plpgsql as
$$ declare v jsonb; bid uuid; begin
   select id into bid from tmc.bookings where profile_id = pg_temp.uid(n) and session_id = sid::uuid
     and status in ('booked', 'pending_payment') order by booked_at desc limit 1;
   perform pg_temp.as_member(n);
   v := tmc.cancel_class_booking(bid);
   perform pg_temp.as_system();
   return v;
   exception when others then perform pg_temp.as_system(); return jsonb_build_object('ok', false, 'reason', 'ERR ' || sqlstate || ' ' || sqlerrm); end $$;
-- Als systeem (auth.uid() null): confirm_extra_class_booking.
create function pg_temp.confirmj(bid uuid, pid text, outcome text) returns jsonb language plpgsql as
$$ declare v jsonb; begin
   perform pg_temp.as_system();
   v := tmc.confirm_extra_class_booking(bid, pid, outcome);
   return v;
   exception when others then return jsonb_build_object('ok', false, 'reason', 'ERR ' || sqlstate || ' ' || sqlerrm); end $$;
create function pg_temp.pending_of(n int, sid text) returns uuid language sql as
$$ select id from tmc.bookings where profile_id = pg_temp.uid(n) and session_id = sid::uuid and status = 'pending_payment' order by booked_at desc limit 1 $$;
create function pg_temp.booked_of(n int, sid text) returns uuid language sql as
$$ select id from tmc.bookings where profile_id = pg_temp.uid(n) and session_id = sid::uuid and status = 'booked' limit 1 $$;
create function pg_temp.status_of(bid uuid) returns text language sql as
$$ select status || ':' || coalesce(cancellation_reason, '-') from tmc.bookings where id = bid $$;
-- Mollie-payment koppelen en een betaalde betaalregel schrijven (wat de server action en de webhook doen).
create function pg_temp.attach(bid uuid, pid text) returns void language sql as
$$ update tmc.bookings set drop_in_payment_id = pid where id = bid $$;
create function pg_temp.paid_row(bid uuid, pid text, n int) returns void language sql as
$$ insert into tmc.payments (mollie_payment_id, profile_id, booking_id, amount_cents, status, kind, is_test, paid_at, vat_rate_bp, vat_amount_cents, net_amount_cents, description)
   values (pid, pg_temp.uid(n), bid, 1500, 'paid', 'extra_class', false, now(), 900, 124, 1376, 'Extra les: test') $$;
-- Dynamische SQL als een andere rol; geeft de SQLSTATE terug, of 'geen fout'.
create function pg_temp.as_role(r text, q text) returns text language plpgsql as
$$ begin execute 'set local role ' || r; execute q; reset role; return 'geen fout';
   exception when others then reset role; return sqlstate; end $$;

-- 0. Prijs en rechten.
select pg_temp.check_('0 prijs adult = 1500, 9 procent, les_tegoed, ten_ride_card',
  (select (price_cents, vat_rate_bp, revenue_category, catalogue_slug) = (1500, 900, 'les_tegoed', 'ten_ride_card') from tmc.extra_class_price('adult')));
update tmc.catalogue set price_cents = 16000 where slug = 'ten_ride_card';
select pg_temp.check_('0 prijs volgt de rittenkaart (tijdelijk 16000 / 10 = 1600)', (select price_cents from tmc.extra_class_price('adult')) = 1600);
update tmc.catalogue set price_cents = 15000 where slug = 'ten_ride_card';
select pg_temp.check_('0 kids zonder actieve kids-rittenkaart: geen prijs',
  not exists (select 1 from tmc.extra_class_price('kids')) = not exists (select 1 from tmc.catalogue where slug = 'ten_ride_card_kids' and is_active));

-- 1. Weekcap en dekking dragen het aanbod.
select pg_temp.check_('1 Y1 en K1 voor lid 1', pg_temp.book(1, 'd6000000-0000-4000-8000-000000000001') = 'ok' and pg_temp.book(1, 'd6000000-0000-4000-8000-000000000002') = 'ok');
select pg_temp.check_('1 derde groepsles: weekly_cap_reached met aanbod 1500',
  (select (j ->> 'reason', (j ->> 'extra_class_available')::boolean, (j ->> 'extra_class_price_cents')::int) = ('weekly_cap_reached', true, 1500)
   from pg_temp.bookj(1, 'd6000000-0000-4000-8000-000000000003') j));
select pg_temp.check_('1 Vrij Trainen-lid op groepsles: no_coverage met aanbod',
  (select (j ->> 'reason', (j ->> 'extra_class_available')::boolean) = ('no_coverage', true)
   from pg_temp.bookj(3, 'd6000000-0000-4000-8000-000000000001') j));
select pg_temp.check_('1 alleen rittenkaart op vrij trainen: no_coverage zonder aanbod',
  (select (j ->> 'reason', (j ->> 'extra_class_available')::boolean) = ('no_coverage', false)
   from pg_temp.bookj(5, 'd6000000-0000-4000-8000-000000000011', pg_temp.slot(pg_temp.w(0), '10:00'), 60) j));

-- 2. Pending rij.
select pg_temp.check_('2 start extra les Y2 voor lid 1: ok, prijs 1500',
  (select (j ->> 'ok')::boolean and (j ->> 'price_cents')::int = 1500 and (j ->> 'hold_expires_at') is not null
   from pg_temp.startj(1, 'd6000000-0000-4000-8000-000000000003') j));
select pg_temp.check_('2 rij: pending_payment, prijs 1500, geen membership, hold ongeveer 20 min',
  exists (select 1 from tmc.bookings where id = pg_temp.pending_of(1, 'd6000000-0000-4000-8000-000000000003')
          and drop_in_price_cents = 1500 and membership_id is null and credits_used = 0
          and hold_expires_at between now() + interval '19 minutes' and now() + interval '21 minutes'));
select pg_temp.check_('2 pending telt in session_occupancy en de view', tmc.session_occupancy('d6000000-0000-4000-8000-000000000003') = 1
  and (select taken_count from tmc.v_session_availability where id = 'd6000000-0000-4000-8000-000000000003') = 1);
select pg_temp.check_('2 tweede start op dezelfde sessie: already_booked', (pg_temp.startj(1, 'd6000000-0000-4000-8000-000000000003') ->> 'reason') = 'already_booked');
select pg_temp.check_('2 gewoon boeken op dezelfde sessie: already_booked', pg_temp.book(1, 'd6000000-0000-4000-8000-000000000003') = 'already_booked');
select pg_temp.check_('2 onbeperkt lid hoeft niet bij te kopen: extra_class_not_needed', (pg_temp.startj(4, 'd6000000-0000-4000-8000-000000000001') ->> 'reason') = 'extra_class_not_needed');
select pg_temp.check_('2 alleen rittenkaart kan niet bijkopen: no_coverage', (pg_temp.startj(5, 'd6000000-0000-4000-8000-000000000011', pg_temp.slot(pg_temp.w(0), '10:00'), 60) ->> 'reason') = 'no_coverage');
select pg_temp.check_('2 event booking.extra_class_started', exists (select 1 from tmc.events where type = 'booking.extra_class_started' and subject_id = pg_temp.pending_of(1, 'd6000000-0000-4000-8000-000000000003')));

-- 3. Betaald: pending wordt booked, telt niet voor de weekcap.
select pg_temp.attach(pg_temp.pending_of(1, 'd6000000-0000-4000-8000-000000000003'), 'tr_a');
select pg_temp.check_('3 confirm paid: confirmed', (pg_temp.confirmj(pg_temp.pending_of(1, 'd6000000-0000-4000-8000-000000000003'), 'tr_a', 'paid') ->> 'result') = 'confirmed');
select pg_temp.check_('3 rij is booked zonder hold', exists (select 1 from tmc.bookings where profile_id = pg_temp.uid(1) and session_id = 'd6000000-0000-4000-8000-000000000003' and status = 'booked' and hold_expires_at is null and drop_in_payment_id = 'tr_a'));
select pg_temp.check_('3 herhaling: already_confirmed', (pg_temp.confirmj(pg_temp.booked_of(1, 'd6000000-0000-4000-8000-000000000003'), 'tr_a', 'paid') ->> 'result') = 'already_confirmed');
select pg_temp.check_('3 mislukt na betaald: ignored', (pg_temp.confirmj(pg_temp.booked_of(1, 'd6000000-0000-4000-8000-000000000003'), 'tr_a', 'failed') ->> 'result') = 'ignored');
select pg_temp.check_('3 extra les telt niet mee: Y3 blijft weekly_cap_reached met aanbod', (pg_temp.bookj(1, 'd6000000-0000-4000-8000-000000000004') ->> 'reason') = 'weekly_cap_reached');
select pg_temp.check_('3 verkeerd payment-id: payment_mismatch', (pg_temp.confirmj(pg_temp.booked_of(1, 'd6000000-0000-4000-8000-000000000003'), 'tr_x', 'paid') ->> 'reason') = 'payment_mismatch');

-- 4. Mislukt: plek vrij.
select pg_temp.check_('4 start voor lid 3 op Y1 (buiten abonnement)', (pg_temp.startj(3, 'd6000000-0000-4000-8000-000000000001') ->> 'ok')::boolean);
select pg_temp.attach(pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000001'), 'tr_b');
select pg_temp.check_('4 confirm failed: released, reden payment_failed',
  (select (pg_temp.confirmj(b, 'tr_b', 'failed') ->> 'result') = 'released' and pg_temp.status_of(b) = 'cancelled:payment_failed'
   from (select pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000001') as b) x));
select pg_temp.check_('4 occupancy Y1: lid 1 plus niets van lid 3', tmc.session_occupancy('d6000000-0000-4000-8000-000000000001') = 1);

-- 5. Verlopen hold: start sluit de eigen verlopen rij; late betaling zonder plek (eigen nieuwe pending) wordt refund_needed, daarna met plek confirmed_late.
select pg_temp.check_('5 start opnieuw voor lid 3 op Y1', (pg_temp.startj(3, 'd6000000-0000-4000-8000-000000000001') ->> 'ok')::boolean);
select pg_temp.attach(pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000001'), 'tr_c');
create temp table t5 as select pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000001') as old_id;
update tmc.bookings set hold_expires_at = now() - interval '1 minute' where id = (select old_id from t5);
select pg_temp.check_('5 verlopen hold: cron-uitkomst expired geeft vrij',
  (pg_temp.confirmj((select old_id from t5), 'tr_c', 'expired') ->> 'result') = 'released' and pg_temp.status_of((select old_id from t5)) = 'cancelled:payment_expired');
select pg_temp.check_('5 nieuwe start maakt een nieuwe pending rij', (pg_temp.startj(3, 'd6000000-0000-4000-8000-000000000001') ->> 'ok')::boolean and pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000001') <> (select old_id from t5));
select pg_temp.check_('5 late betaling op de oude rij terwijl de nieuwe pending staat: refund_needed (already_booked)',
  (select (j ->> 'result', j ->> 'reason') = ('refund_needed', 'already_booked') from pg_temp.confirmj((select old_id from t5), 'tr_c', 'paid') j));
select pg_temp.check_('5 nieuwe pending afbreken door het lid: aborted_pending', (pg_temp.cancelj(3, 'd6000000-0000-4000-8000-000000000001') ->> 'aborted_pending')::boolean);
select pg_temp.check_('5 late betaling nu met plek: confirmed_late en booked',
  (pg_temp.confirmj((select old_id from t5), 'tr_c', 'paid') ->> 'result') = 'confirmed_late' and pg_temp.status_of((select old_id from t5)) = 'booked:-');

-- 6. Late betaling zonder plek (capaciteit 1 gevuld): refund_needed capacity_full.
select pg_temp.check_('6 start lid 3 op YS (cap 1)', (pg_temp.startj(3, 'd6000000-0000-4000-8000-000000000005') ->> 'ok')::boolean);
select pg_temp.attach(pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000005'), 'tr_d');
create temp table t6 as select pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000005') as b;
select pg_temp.check_('6 lid breekt af, lid 7 vult de plek', (pg_temp.cancelj(3, 'd6000000-0000-4000-8000-000000000005') ->> 'ok')::boolean and pg_temp.book(7, 'd6000000-0000-4000-8000-000000000005') = 'ok');
-- De rij is door het lid afgebroken (payment_canceled): het geld gaat terug
-- ongeacht de plek, de gate komt er niet aan te pas (fix PR 319).
select pg_temp.check_('6 late betaling op een afgebroken pending: refund_needed payment_canceled, rij blijft geannuleerd',
  (select (j ->> 'result', j ->> 'reason') = ('refund_needed', 'payment_canceled') from pg_temp.confirmj((select b from t6), 'tr_d', 'paid') j)
  and pg_temp.status_of((select b from t6)) = 'cancelled:payment_canceled');
select pg_temp.paid_row((select b from t6), 'tr_d', 3);
-- De insert in de functie is binnen dezelfde statement nog niet zichtbaar
-- voor een losse subquery; daarom eerst de aanroep, dan de controle.
create temp table t6r as select tmc.request_booking_refund((select b from t6), 'test', 'system', null) as j;
select pg_temp.check_('6 request_booking_refund maakt een intentie met booking_id',
  (select (j ->> 'ok')::boolean and (j ->> 'amount_cents')::int = 1500 from t6r)
  and exists (select 1 from tmc.payment_refunds r join tmc.payments p on p.id = r.payment_id where p.mollie_payment_id = 'tr_d' and r.booking_id = (select b from t6) and r.status = 'requested'));
select pg_temp.check_('6 tweede intentie: nothing_left (het hele bedrag is al geclaimd)', (tmc.request_booking_refund((select b from t6), 'test', 'system', null) ->> 'skipped') = 'nothing_left');

-- 7. Annuleren binnen het venster: refund-intentie; buiten het venster: geen.
select pg_temp.paid_row(pg_temp.booked_of(1, 'd6000000-0000-4000-8000-000000000003'), 'tr_a', 1);
select pg_temp.check_('7 binnen venster: refund_id en 1500',
  (select (j ->> 'ok')::boolean and (j ->> 'paid_extra_class')::boolean and (j ->> 'within_window')::boolean and (j ->> 'refund_id') is not null and (j ->> 'refund_amount_cents')::int = 1500
   from pg_temp.cancelj(1, 'd6000000-0000-4000-8000-000000000003') j));
select pg_temp.check_('7 refund-intentie staat met booking_id', exists (select 1 from tmc.payment_refunds r join tmc.payments p on p.id = r.payment_id where p.mollie_payment_id = 'tr_a' and r.status = 'requested' and r.booking_id is not null));
select pg_temp.check_('7 Y2 is weer vrij voor lid 1 (weektegoed telt de extra les niet)', pg_temp.startj(1, 'd6000000-0000-4000-8000-000000000003') ->> 'ok' = 'true');
select pg_temp.check_('7 opruimen pending Y2', (pg_temp.cancelj(1, 'd6000000-0000-4000-8000-000000000003') ->> 'ok')::boolean);
-- Lid 3 (Vrij Trainen) op een groepsles over twee uur: geen dekking, dus
-- bijkopen; lid 1 zou deze week nog gewoon kunnen boeken.
select pg_temp.check_('7 start YN (over twee uur) voor lid 3 en betaal', (pg_temp.startj(3, 'd6000000-0000-4000-8000-000000000021') ->> 'ok')::boolean);
select pg_temp.attach(pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000021'), 'tr_e');
select pg_temp.check_('7 YN betaald', (pg_temp.confirmj(pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000021'), 'tr_e', 'paid') ->> 'result') = 'confirmed');
select pg_temp.paid_row(pg_temp.booked_of(3, 'd6000000-0000-4000-8000-000000000021'), 'tr_e', 3);
select pg_temp.check_('7 buiten venster: geannuleerd zonder refund',
  (select (j ->> 'ok')::boolean and (j ->> 'paid_extra_class')::boolean and not (j ->> 'within_window')::boolean and (j ->> 'refund_id') is null
   from pg_temp.cancelj(3, 'd6000000-0000-4000-8000-000000000021') j));
select pg_temp.check_('7 geen intentie voor tr_e', not exists (select 1 from tmc.payment_refunds r join tmc.payments p on p.id = r.payment_id where p.mollie_payment_id = 'tr_e'));

-- 8. Sessie geannuleerd door de studio: betaalde extra les krijgt een refund-intentie, pending vervalt.
select pg_temp.check_('8 lid 3 betaalt extra les op Y3', (pg_temp.startj(3, 'd6000000-0000-4000-8000-000000000004') ->> 'ok')::boolean);
select pg_temp.attach(pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000004'), 'tr_f');
select pg_temp.check_('8 Y3 betaald', (pg_temp.confirmj(pg_temp.pending_of(3, 'd6000000-0000-4000-8000-000000000004'), 'tr_f', 'paid') ->> 'result') = 'confirmed');
select pg_temp.paid_row(pg_temp.booked_of(3, 'd6000000-0000-4000-8000-000000000004'), 'tr_f', 3);
select pg_temp.check_('8 lid 1 heeft een pending op Y3 (lid 1 zit aan de cap)', (pg_temp.startj(1, 'd6000000-0000-4000-8000-000000000004') ->> 'ok')::boolean);
select pg_temp.check_('8 cancel_class_session_core: refund_id voor de betaalde extra les',
  (select exists (select 1 from jsonb_array_elements(j -> 'bookings') b where b ->> 'profile_id' = pg_temp.uid(3)::text and b ->> 'refund_id' is not null)
   from tmc.cancel_class_session_core('d6000000-0000-4000-8000-000000000004', 'test', pg_temp.uid(9)) j));
select pg_temp.check_('8 pending van lid 1 is vervallen met session_cancelled',
  exists (select 1 from tmc.bookings where profile_id = pg_temp.uid(1) and session_id = 'd6000000-0000-4000-8000-000000000004' and status = 'cancelled' and cancellation_reason = 'session_cancelled'));

-- 10. Herhaalde webhook met paid op een geannuleerde rij (fix PR 319): Mollie
-- meldt zich ook bij een refund, met status paid. Alleen payment_expired mag
-- alsnog bevestigen (scenario 5); de rest blijft geannuleerd.
select pg_temp.check_('10 door lid geannuleerd met refund-intentie (tr_a): ignored refund_exists, blijft cancelled:within_window',
  (select (j ->> 'result', j ->> 'reason') = ('ignored', 'refund_exists') from pg_temp.confirmj((select id from tmc.bookings where drop_in_payment_id = 'tr_a'), 'tr_a', 'paid') j)
  and pg_temp.status_of((select id from tmc.bookings where drop_in_payment_id = 'tr_a')) = 'cancelled:within_window');
select pg_temp.check_('10 geen tweede refund-intentie voor tr_a', (select count(*) from tmc.payment_refunds r join tmc.payments p on p.id = r.payment_id where p.mollie_payment_id = 'tr_a') = 1);
select pg_temp.check_('10 buiten het venster geannuleerd zonder refund (tr_e): ignored cancelled_after_confirmation, blijft cancelled:late',
  (select (j ->> 'result', j ->> 'reason') = ('ignored', 'cancelled_after_confirmation') from pg_temp.confirmj((select id from tmc.bookings where drop_in_payment_id = 'tr_e'), 'tr_e', 'paid') j)
  and pg_temp.status_of((select id from tmc.bookings where drop_in_payment_id = 'tr_e')) = 'cancelled:late');
select pg_temp.check_('10 geen refund-intentie voor tr_e na de herhaling', not exists (select 1 from tmc.payment_refunds r join tmc.payments p on p.id = r.payment_id where p.mollie_payment_id = 'tr_e'));
select pg_temp.check_('10 les geannuleerd door de studio, betaald met refund-intentie (tr_f): ignored refund_exists',
  (select (j ->> 'result', j ->> 'reason') = ('ignored', 'refund_exists') from pg_temp.confirmj((select id from tmc.bookings where drop_in_payment_id = 'tr_f'), 'tr_f', 'paid') j)
  and pg_temp.status_of((select id from tmc.bookings where drop_in_payment_id = 'tr_f')) = 'cancelled:session_cancelled');
-- Pending van lid 1 op Y3 verviel met de les voordat er geld was: komt de
-- betaling alsnog, dan moet die terug.
select pg_temp.attach((select id from tmc.bookings where profile_id = pg_temp.uid(1) and session_id = 'd6000000-0000-4000-8000-000000000004' and cancellation_reason = 'session_cancelled'), 'tr_g');
select pg_temp.check_('10 les geannuleerd voordat de pending betaald was (tr_g): refund_needed session_cancelled, blijft geannuleerd',
  (select (j ->> 'result', j ->> 'reason') = ('refund_needed', 'session_cancelled') from pg_temp.confirmj((select id from tmc.bookings where drop_in_payment_id = 'tr_g'), 'tr_g', 'paid') j)
  and pg_temp.status_of((select id from tmc.bookings where drop_in_payment_id = 'tr_g')) = 'cancelled:session_cancelled');
select pg_temp.check_('10 payment_expired blijft de enige weg naar confirmed_late (scenario 5 staat nog)', pg_temp.status_of((select old_id from t5)) = 'booked:-');

-- 9. Omzetview en rechten.
select pg_temp.check_('9 v_revenue_lines: extra_class valt onder les_tegoed', (select revenue_category from tmc.v_revenue_lines where payment_id = (select id from tmc.payments where mollie_payment_id = 'tr_a')) = 'les_tegoed');
select pg_temp.check_('9 lid kan geen pending of betaalde rij inserten',
  pg_temp.as_role('authenticated', $q$insert into tmc.bookings (profile_id, session_id, session_date, pillar, iso_week, iso_year, status, drop_in_price_cents) values ('a6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', current_date, 'yoga_mobility', 1, 2026, 'pending_payment', 0)$q$) = '42501');
select pg_temp.check_('9 lid kan zijn rij niet zelf op booked zetten',
  pg_temp.as_role('authenticated', $q$update tmc.bookings set status = 'booked' where profile_id = 'a6000000-0000-4000-8000-000000000003'$q$) = '42501');
select pg_temp.check_('9 lid kan confirm_extra_class_booking niet aanroepen', pg_temp.as_role('authenticated', $q$select tmc.confirm_extra_class_booking('00000000-0000-0000-0000-000000000000', 'x', 'paid')$q$) = '42501');
select pg_temp.check_('9 lid kan request_booking_refund niet aanroepen', pg_temp.as_role('authenticated', $q$select tmc.request_booking_refund('00000000-0000-0000-0000-000000000000', 'x', 'member', null)$q$) = '42501');
select pg_temp.check_('9 service_role kan confirm wel, maar een onbekende rij geeft booking_not_found',
  (select (tmc.confirm_extra_class_booking('00000000-0000-0000-0000-000000000000', 'x', 'paid') ->> 'reason') = 'booking_not_found'));

rollback;
SQL
)
echo "$OUT"
if echo "$OUT" | grep -q '^FAIL\|ERR '; then
  echo "ER ZIJN TESTS GEFAALD"
  exit 1
fi
echo "ALLE DB-TESTS GESLAAGD"
