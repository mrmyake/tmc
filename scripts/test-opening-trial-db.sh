#!/usr/bin/env bash
# DB-tests voor de gratis proefles in de openingsperiode
# (spec-community-growth.md par. 1 "Gratis openingsperiode"): tmc.book_opening_trial,
# de guard, de constraints en de grants. Testplan a t/m i van de PR op
# SQL-niveau (de race in scripts/test-opening-trial-race.sh, de routes en de
# kiosk via de preview). Alleen tegen een LOKALE database (supabase db start in
# de worktree), nooit tegen productie.
#
# Gebruik: scripts/test-opening-trial-db.sh <supabase_db_container>
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
  set vrij_trainen_max_concurrent = 5, cancellation_window_hours = 6,
      free_trial_start_at = now() - interval '1 day', free_trial_end_at = now() + interval '30 days';

-- Profielen: 1 lid (abonnement actief), 2 klant (order activated), 3 trainer,
-- 4 alleen een pending abonnement (geen klant), 5 testprofiel met actief abonnement.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('a8000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'ot-' || n || '@test.invalid', '{"provider":"email","providers":["email"]}',
       json_build_object('first_name', 'Ot' || n, 'last_name', 'Test')::jsonb, now(), now()
from generate_series(1, 5) as n;
update tmc.profiles set phone = '+3161000000' || right(id::text, 1) where id::text like 'a8000000-%';
update tmc.profiles set is_test = true where id = 'a8000000-0000-4000-8000-000000000005';
insert into tmc.memberships (profile_id, plan_type, price_per_cycle_cents, start_date, commit_end_date, status, age_category) values
  ('a8000000-0000-4000-8000-000000000001', 'all_inclusive', 10000, current_date - 30, current_date + 365, 'active', 'adult'),
  ('a8000000-0000-4000-8000-000000000003', 'all_inclusive', 10000, current_date - 30, current_date + 365, 'active', 'adult'),
  ('a8000000-0000-4000-8000-000000000004', 'all_inclusive', 10000, current_date - 30, current_date + 365, 'pending', 'adult'),
  ('a8000000-0000-4000-8000-000000000005', 'all_inclusive', 10000, current_date - 30, current_date + 365, 'active', 'adult');
insert into tmc.orders (profile_id, kind, catalogue_slug, status, base_price_cents, first_charge_cents, recurring_cents, billing_cycle_weeks, commit_months, pricing_snapshot, created_by, expires_at)
values ('a8000000-0000-4000-8000-000000000002', 'subscription', 'all_inclusive', 'activated', 10000, 10000, 10000, 4, 3, '{}'::jsonb, 'self', now() + interval '1 day');
insert into tmc.trainers (id, profile_id, display_name, slug, is_active)
values ('b8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000003', 'OT Trainer', 'ot-trainer', true);
insert into tmc.class_types (id, slug, name, pillar, age_category, default_capacity) values
  ('c8000000-0000-4000-8000-000000000001', 'ot-vrij', 'OT vrij', 'vrij_trainen', 'adult', null),
  ('c8000000-0000-4000-8000-000000000002', 'ot-yoga', 'OT yoga', 'yoga_mobility', 'adult', 10),
  ('c8000000-0000-4000-8000-000000000003', 'ot-kb', 'OT kettlebell', 'kettlebell', 'adult', 2);

create function pg_temp.nm() returns text language sql as
$$ select ((current_date + 2) + ((8 - extract(isodow from (current_date + 2))::int) % 7))::text $$;
create function pg_temp.sat() returns text language sql as
$$ select ((current_date + 2) + ((13 - extract(isodow from (current_date + 2))::int) % 7))::text $$;
create function pg_temp.slot(d text, t text) returns timestamptz language sql as
$$ select (d || ' ' || t)::timestamp at time zone 'Europe/Amsterdam' $$;

insert into tmc.class_sessions (id, class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status, occurrence_start_at) values
  -- S1 yoga over 10 dagen, capaciteit 10
  ('d8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'yoga_mobility', 'adult',
   now() + interval '10 days', now() + interval '10 days 1 hour', 10, 'scheduled', now() + interval '10 days'),
  -- S2 kettlebell over 9 dagen, capaciteit 2
  ('d8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000003', 'b8000000-0000-4000-8000-000000000001', 'kettlebell', 'adult',
   now() + interval '9 days', now() + interval '9 days 1 hour', 2, 'scheduled', now() + interval '9 days'),
  -- S3 vrij trainen op een maandag, dagsessie 07:00 tot 21:00
  ('d8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'vrij_trainen', 'adult',
   pg_temp.slot(pg_temp.nm(), '07:00'), pg_temp.slot(pg_temp.nm(), '21:00'), null, 'scheduled', pg_temp.slot(pg_temp.nm(), '07:00')),
  -- S4 yoga gisteren (voorbij)
  ('d8000000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'yoga_mobility', 'adult',
   now() - interval '1 day', now() - interval '1 day' + interval '1 hour', 10, 'scheduled', now() - interval '1 day'),
  -- S5 vrij trainen op zaterdag, dagsessie 08:00 tot 14:00 (nooit aanwezig)
  ('d8000000-0000-4000-8000-000000000005', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', 'vrij_trainen', 'adult',
   pg_temp.slot(pg_temp.sat(), '08:00'), pg_temp.slot(pg_temp.sat(), '14:00'), null, 'scheduled', pg_temp.slot(pg_temp.sat(), '08:00')),
  -- S6 yoga over 2 uur (binnen de annuleertermijn)
  ('d8000000-0000-4000-8000-000000000006', 'c8000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-000000000001', 'yoga_mobility', 'adult',
   now() + interval '2 hours', now() + interval '3 hours', 10, 'scheduled', now() + interval '2 hours');
insert into tmc.trial_codes (code, label, max_uses, scope, created_by) values
  ('OTGROEP', 'ot groep', null, 'group', 'a8000000-0000-4000-8000-000000000003'),
  ('OTVRIJ', 'ot vrij', null, 'vrij_trainen', 'a8000000-0000-4000-8000-000000000003');

create function pg_temp.check_(label text, ok boolean) returns text language sql as
$$ select case when ok then 'PASS ' || label else 'FAIL ' || label end $$;
-- Reden van de RPC, of 'ok'.
create function pg_temp.book(sid text, nm text, em text, ph text, slot timestamptz default null, test boolean default false) returns text language sql as
$$ select coalesce(tmc.book_opening_trial(sid::uuid, nm, em, ph, test, slot) ->> 'reason', 'ok') $$;
-- Dynamische SQL die moet falen; geeft de SQLSTATE terug, of 'geen fout'.
create function pg_temp.fails(q text) returns text language plpgsql as
$$ begin execute q; return 'geen fout'; exception when others then return sqlstate; end $$;
-- Dynamische SQL als een andere rol; geeft de SQLSTATE terug, of 'geen fout'.
create function pg_temp.as_role(r text, q text) returns text language plpgsql as
$$ begin execute 'set local role ' || r; execute q; reset role; return 'geen fout';
   exception when others then reset role; return sqlstate; end $$;

-- a. Gratis boeking: groepsles en vrij trainen.
select pg_temp.check_('a1 groepsles gratis geboekt', pg_temp.book('d8000000-0000-4000-8000-000000000001', 'A Test', 'a@test.invalid', '+31611111101') = 'ok');
select pg_temp.check_('a1 rij: source opening, paid, prijs 0, phone_e164, geen code',
  exists (select 1 from tmc.trial_bookings where email = 'a@test.invalid' and source = 'opening' and status = 'paid'
          and price_paid_cents = 0 and mollie_payment_id is null and trial_code_id is null and phone_e164 = '+31611111101' and phone = '+31611111101'));
select pg_temp.check_('a1 event trial_booking.created met source opening',
  exists (select 1 from tmc.events where type = 'trial_booking.created' and payload ->> 'source' = 'opening'
          and subject_id = (select id from tmc.trial_bookings where email = 'a@test.invalid')));
select pg_temp.check_('a1 telt mee in session_occupancy', tmc.session_occupancy('d8000000-0000-4000-8000-000000000001') = 1);
select pg_temp.check_('a2 vrij trainen 09:00 gratis geboekt', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'B Test', 'b@test.invalid', '+31611111102', pg_temp.slot(pg_temp.nm(), '09:00')) = 'ok');
select pg_temp.check_('a2 slot is precies een uur', exists (select 1 from tmc.trial_bookings where email = 'b@test.invalid' and slot_end_at = slot_start_at + interval '60 minutes'));
select pg_temp.check_('a2 telt mee in vrij_trainen_slot_peak', (select peak from tmc.vrij_trainen_slot_peak('d8000000-0000-4000-8000-000000000003', pg_temp.slot(pg_temp.nm(), '09:15'), pg_temp.slot(pg_temp.nm(), '09:30'))) = 1);
select pg_temp.check_('a invoer: ongeldig nummer', pg_temp.book('d8000000-0000-4000-8000-000000000001', 'X', 'x@test.invalid', '0612345678') = 'invalid_phone');
select pg_temp.check_('a invoer: ongeldig e-mailadres', pg_temp.book('d8000000-0000-4000-8000-000000000001', 'X', 'geen-adres', '+31611111199') = 'invalid_email');
select pg_temp.check_('a sessie voorbij', pg_temp.book('d8000000-0000-4000-8000-000000000004', 'X', 'x@test.invalid', '+31611111199') = 'session_in_past');
select pg_temp.check_('a groepsles met slot geweigerd', pg_temp.book('d8000000-0000-4000-8000-000000000001', 'X', 'x@test.invalid', '+31611111199', now() + interval '10 days') = 'slot_not_allowed');

-- b. Vijfde gratis proefplek per les, vijfde gratis proefgast tegelijk, buiten aanwezigheid.
select pg_temp.check_('b1 2e, 3e, 4e gratis plek op S1',
  pg_temp.book('d8000000-0000-4000-8000-000000000001', 'C Test', 'c@test.invalid', '+31611111103') = 'ok'
  and pg_temp.book('d8000000-0000-4000-8000-000000000001', 'D Test', 'd@test.invalid', '+31611111104') = 'ok'
  and pg_temp.book('d8000000-0000-4000-8000-000000000001', 'E Test', 'e@test.invalid', '+31611111105') = 'ok');
select pg_temp.check_('b1 5e gratis plek op S1 geweigerd (capaciteit 10 nog vrij)', pg_temp.book('d8000000-0000-4000-8000-000000000001', 'F Test', 'f@test.invalid', '+31611111106') = 'trial_quota_full');
select pg_temp.check_('b2 2e, 3e, 4e gratis proefgast 09:00',
  pg_temp.book('d8000000-0000-4000-8000-000000000003', 'G Test', 'g@test.invalid', '+31611111107', pg_temp.slot(pg_temp.nm(), '09:00')) = 'ok'
  and pg_temp.book('d8000000-0000-4000-8000-000000000003', 'H Test', 'h@test.invalid', '+31611111108', pg_temp.slot(pg_temp.nm(), '09:00')) = 'ok'
  and pg_temp.book('d8000000-0000-4000-8000-000000000003', 'I Test', 'i@test.invalid', '+31611111109', pg_temp.slot(pg_temp.nm(), '09:00')) = 'ok');
select pg_temp.check_('b2 5e gratis proefgast 09:00 geweigerd (maximum 5 nog niet bereikt)', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'J Test', 'j@test.invalid', '+31611111110', pg_temp.slot(pg_temp.nm(), '09:00')) = 'trial_quota_full');
select pg_temp.check_('b2 overlappend uur 09:30 ook geweigerd', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'J Test', 'j@test.invalid', '+31611111110', pg_temp.slot(pg_temp.nm(), '09:30')) = 'trial_quota_full');
select pg_temp.check_('b2 10:00 wel (geen overlap)', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'J Test', 'j@test.invalid', '+31611111110', pg_temp.slot(pg_temp.nm(), '10:00')) = 'ok');
select pg_temp.check_('b2 opening_availability toont 09:15 als vol en 10:15 als 1 over',
  (select opening_available from tmc.vrij_trainen_opening_availability(pg_temp.nm()::date, pg_temp.nm()::date) where quarter_start = pg_temp.slot(pg_temp.nm(), '09:15')) = 0
  and (select opening_available from tmc.vrij_trainen_opening_availability(pg_temp.nm()::date, pg_temp.nm()::date) where quarter_start = pg_temp.slot(pg_temp.nm(), '10:15')) = 3);
select pg_temp.check_('b3 13:00 buiten aanwezigheid', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'K Test', 'k@test.invalid', '+31611111111', pg_temp.slot(pg_temp.nm(), '13:00')) = 'outside_presence');
select pg_temp.check_('b3 11:15 loopt over 12:00 heen', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'K Test', 'k@test.invalid', '+31611111111', pg_temp.slot(pg_temp.nm(), '11:15')) = 'outside_presence');
select pg_temp.check_('b3 zaterdag nooit', pg_temp.book('d8000000-0000-4000-8000-000000000005', 'K Test', 'k@test.invalid', '+31611111111', pg_temp.slot(pg_temp.sat(), '09:00')) = 'outside_presence');
select pg_temp.check_('b3 kwartierraster', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'K Test', 'k@test.invalid', '+31611111111', pg_temp.slot(pg_temp.nm(), '09:05')) = 'slot_invalid');
select pg_temp.check_('b3 zonder slot', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'K Test', 'k@test.invalid', '+31611111111') = 'slot_required');
select pg_temp.check_('b4 capaciteit 2 op S2: twee gratis, derde capacity_full',
  pg_temp.book('d8000000-0000-4000-8000-000000000002', 'L Test', 'l@test.invalid', '+31611111112') = 'ok'
  and pg_temp.book('d8000000-0000-4000-8000-000000000002', 'M Test', 'm@test.invalid', '+31611111113') = 'ok'
  and pg_temp.book('d8000000-0000-4000-8000-000000000002', 'N Test', 'n@test.invalid', '+31611111114') = 'capacity_full');
-- Maximum van 5 tegelijk: vier leden plus een gratis proefgast op 17:00, zesde gratis proefgast slot_full.
insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, is_test, slot_start_at, slot_end_at, source, trial_code_id)
select 'd8000000-0000-4000-8000-000000000003', 'Code ' || n, 'code' || n || '@test.invalid', '0600', 0, 'paid', false,
       pg_temp.slot(pg_temp.nm(), '17:00'), pg_temp.slot(pg_temp.nm(), '18:00'), 'code', (select id from tmc.trial_codes where code = 'OTVRIJ')
from generate_series(1, 4) n;
select pg_temp.check_('b5 maximum 5 tegelijk: 5e (gratis) past, 6e slot_full voor het quotum',
  pg_temp.book('d8000000-0000-4000-8000-000000000003', 'O Test', 'o@test.invalid', '+31611111115', pg_temp.slot(pg_temp.nm(), '17:00')) = 'ok'
  and pg_temp.book('d8000000-0000-4000-8000-000000000003', 'P Test', 'p@test.invalid', '+31611111116', pg_temp.slot(pg_temp.nm(), '17:00')) = 'slot_full');

-- c. Dubbel e-mail en telefoon, na tijdig annuleren weer toegestaan.
select pg_temp.check_('c1 zelfde e-mail, ander nummer', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'A Test', 'a@test.invalid', '+31611111190', pg_temp.slot(pg_temp.nm(), '10:00')) = 'already_used');
select pg_temp.check_('c1 e-mail met hoofdletters en spaties', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'A Test', '  A@Test.INVALID ', '+31611111190', pg_temp.slot(pg_temp.nm(), '10:00')) = 'already_used');
select pg_temp.check_('c1 zelfde nummer, ander e-mail', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'A Test', 'a2@test.invalid', '+31611111101', pg_temp.slot(pg_temp.nm(), '10:00')) = 'already_used');
select pg_temp.check_('c1 zelfde les tweede keer', pg_temp.book('d8000000-0000-4000-8000-000000000001', 'A Test', 'a@test.invalid', '+31611111101') = 'already_used');
-- Losse statements: binnen een expressie is de volgorde van evaluatie niet gegarandeerd.
select pg_temp.check_('c2 tijdig annuleren via de annuleerlink', (tmc.visitor_cancel_trial_booking((select cancel_token from tmc.trial_bookings where email = 'c@test.invalid')) ->> 'ok')::boolean);
select pg_temp.check_('c2 rij geannuleerd met reden within_window', exists (select 1 from tmc.trial_bookings where email = 'c@test.invalid' and status = 'cancelled' and cancellation_reason = 'within_window'));
select pg_temp.check_('c2 na tijdig annuleren opnieuw boeken (zelfde les, plek was vrijgekomen)', pg_temp.book('d8000000-0000-4000-8000-000000000001', 'C Test', 'c@test.invalid', '+31611111103') = 'ok');
select pg_temp.check_('c2 quotum van 4 op S1 weer vol', pg_temp.book('d8000000-0000-4000-8000-000000000001', 'F Test', 'f@test.invalid', '+31611111106') = 'trial_quota_full');
select pg_temp.check_('c3 les over 2 uur geboekt', pg_temp.book('d8000000-0000-4000-8000-000000000006', 'Q Test', 'q@test.invalid', '+31611111117') = 'ok');
select pg_temp.check_('c3 te laat annuleren lukt', (tmc.visitor_cancel_trial_booking((select cancel_token from tmc.trial_bookings where email = 'q@test.invalid')) ->> 'ok')::boolean);
select pg_temp.check_('c3 reden late', exists (select 1 from tmc.trial_bookings where email = 'q@test.invalid' and status = 'cancelled' and cancellation_reason = 'late'));
select pg_temp.check_('c3 na te laat annuleren opnieuw boeken mag (geannuleerd telt niet als gebruikt)', pg_temp.book('d8000000-0000-4000-8000-000000000006', 'Q Test', 'q@test.invalid', '+31611111117') = 'ok');

-- d. Bestaande leden en klanten.
select pg_temp.check_('d lid op e-mail', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'Ot1', 'ot-1@test.invalid', '+31611111191', pg_temp.slot(pg_temp.nm(), '10:00')) = 'already_customer');
select pg_temp.check_('d lid op nummer (ander e-mail)', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'Ot1', 'ot-1b@test.invalid', '+31610000001', pg_temp.slot(pg_temp.nm(), '10:00')) = 'already_customer');
select pg_temp.check_('d klant met order activated', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'Ot2', 'ot-2@test.invalid', '+31611111192', pg_temp.slot(pg_temp.nm(), '10:00')) = 'already_customer');
select pg_temp.check_('d alleen een pending abonnement is geen klant', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'Ot4', 'ot-4@test.invalid', '+31611111194', pg_temp.slot(pg_temp.nm(), '10:00')) = 'ok');
select pg_temp.check_('d testprofiel blokkeert alleen de testmodus',
  pg_temp.book('d8000000-0000-4000-8000-000000000003', 'Ot5', 'ot-5@test.invalid', '+31611111195', pg_temp.slot(pg_temp.nm(), '10:00')) = 'ok'
  and pg_temp.book('d8000000-0000-4000-8000-000000000003', 'Ot5', 'ot-5@test.invalid', '+31611111195', pg_temp.slot(pg_temp.nm(), '10:30'), true) = 'already_customer');

-- f. Periode voorbij of nog niet begonnen.
update tmc.booking_settings set free_trial_end_at = now() - interval '1 minute';
select pg_temp.check_('f einddatum in het verleden: period_closed', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'R Test', 'r@test.invalid', '+31611111118', pg_temp.slot(pg_temp.nm(), '11:00')) = 'period_closed');
update tmc.booking_settings set free_trial_start_at = now() + interval '1 day', free_trial_end_at = now() + interval '30 days';
select pg_temp.check_('f start in de toekomst: period_closed', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'R Test', 'r@test.invalid', '+31611111118', pg_temp.slot(pg_temp.nm(), '11:00')) = 'period_closed');
update tmc.booking_settings set free_trial_start_at = null, free_trial_end_at = null;
select pg_temp.check_('f geen periode ingesteld: period_closed', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'R Test', 'r@test.invalid', '+31611111118', pg_temp.slot(pg_temp.nm(), '11:00')) = 'period_closed');
update tmc.booking_settings set free_trial_start_at = now() - interval '1 day', free_trial_end_at = now() + interval '30 days';
select pg_temp.check_('f einde na start afgedwongen', pg_temp.fails($q$update tmc.booking_settings set free_trial_end_at = free_trial_start_at - interval '1 hour'$q$) = '23514');

-- g. Geen directe route voor anon en authenticated.
select pg_temp.check_('g anon kan trial_bookings niet lezen', pg_temp.as_role('anon', 'select count(*) from tmc.trial_bookings') = '42501');
select pg_temp.check_('g anon kan niet inserten', pg_temp.as_role('anon', $q$insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, source, phone_e164) values ('d8000000-0000-4000-8000-000000000001', 'x', 'x@test.invalid', '+31611111199', 0, 'paid', 'opening', '+31611111199')$q$) = '42501');
select pg_temp.check_('g anon kan de RPC niet aanroepen', pg_temp.as_role('anon', $q$select tmc.book_opening_trial('d8000000-0000-4000-8000-000000000001', 'x', 'x@test.invalid', '+31611111199')$q$) = '42501');
select pg_temp.check_('g authenticated kan de RPC niet aanroepen', pg_temp.as_role('authenticated', $q$select tmc.book_opening_trial('d8000000-0000-4000-8000-000000000001', 'x', 'x@test.invalid', '+31611111199')$q$) = '42501');
select pg_temp.check_('g authenticated kan trial_bookings niet lezen', pg_temp.as_role('authenticated', 'select count(*) from tmc.trial_bookings') = '42501');
select pg_temp.check_('g anon kan de pogingenteller niet lezen', pg_temp.as_role('anon', 'select count(*) from tmc.opening_trial_attempts') = '42501');
select pg_temp.check_('g service_role mag de RPC wel', pg_temp.as_role('service_role', $q$select tmc.book_opening_trial('00000000-0000-0000-0000-000000000000', 'x', 'svc@test.invalid', '+31611111198')$q$) = 'geen fout');

-- i. Eerdere proefles van een andere bron die attended of no_show is, telt als gebruikt.
select pg_temp.check_('i proefcode ingewisseld', (tmc.redeem_trial_code('OTGROEP', 'd8000000-0000-4000-8000-000000000001', 'S Test', 's@test.invalid', '+31611111119', false) ->> 'ok')::boolean);
select pg_temp.check_('i codeboeking heeft source code', exists (select 1 from tmc.trial_bookings where email = 's@test.invalid' and source = 'code' and trial_code_id is not null));
select pg_temp.check_('i codeboeking paid (niet geweest): gratis proefles nog toegestaan op ander moment', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'S Test', 's@test.invalid', '+31611111119', pg_temp.slot(pg_temp.nm(), '11:00')) = 'ok');
update tmc.trial_bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'test' where email = 's@test.invalid' and source = 'opening';
update tmc.trial_bookings set status = 'attended' where email = 's@test.invalid' and source = 'code';
select pg_temp.check_('i attended via code: already_used', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'S Test', 's@test.invalid', '+31611111119', pg_temp.slot(pg_temp.nm(), '11:00')) = 'already_used');
insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, mollie_payment_id, status, is_test, source)
values ('d8000000-0000-4000-8000-000000000004', 'T Test', 't@test.invalid', '06 11111120', 1700, 'tr_test', 'no_show', false, 'paid');
select pg_temp.check_('i no_show betaalde proefles: already_used op e-mail', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'T Test', 't@test.invalid', '+31611111120', pg_temp.slot(pg_temp.nm(), '11:00')) = 'already_used');
select pg_temp.check_('i oud vrij nummerveld telt alleen letterlijk mee (E.164 vs 06-notatie): niet herkend', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'T Test', 't2@test.invalid', '+31611111120', pg_temp.slot(pg_temp.nm(), '11:00')) = 'ok');

-- Testmodus: quotum en een-per-persoon per modus (S6, want een adres kan per
-- les maar een keer, ongeacht de modus).
select pg_temp.check_('is_test: zelfde adres op dezelfde les ook in testmodus geweigerd', pg_temp.book('d8000000-0000-4000-8000-000000000001', 'A Test', 'a@test.invalid', '+31611111101', null, true) = 'email_already_booked');
select pg_temp.check_('is_test: zelfde persoon in testmodus apart geteld', pg_temp.book('d8000000-0000-4000-8000-000000000006', 'A Test', 'a@test.invalid', '+31611111101', null, true) = 'ok');
select pg_temp.check_('is_test: testrij telt niet in session_occupancy', tmc.session_occupancy('d8000000-0000-4000-8000-000000000006') = 1);

-- Status-overgangen en de guard (losse statements, zie boven).
select pg_temp.check_('status paid naar attended op een vrij-trainen-rij', pg_temp.fails($q$update tmc.trial_bookings set status = 'attended' where email = 'b@test.invalid'$q$) = 'geen fout');
select pg_temp.check_('status attended naar no_show', pg_temp.fails($q$update tmc.trial_bookings set status = 'no_show' where email = 'b@test.invalid'$q$) = 'geen fout');
select pg_temp.check_('status no_show terug naar paid', pg_temp.fails($q$update tmc.trial_bookings set status = 'paid' where email = 'b@test.invalid'$q$) = 'geen fout');
select pg_temp.check_('occupancy S1 voor no_show is 5 (4 gratis plus de codeboeking)', tmc.session_occupancy('d8000000-0000-4000-8000-000000000001') = 5);
select pg_temp.check_('no_show zetten lukt', pg_temp.fails($q$update tmc.trial_bookings set status = 'no_show' where email = 'd@test.invalid'$q$) = 'geen fout');
select pg_temp.check_('no_show telt niet meer in session_occupancy', tmc.session_occupancy('d8000000-0000-4000-8000-000000000001') = 4);
select pg_temp.check_('no_show telt wel voor een-per-persoon', pg_temp.book('d8000000-0000-4000-8000-000000000003', 'D Test', 'd@test.invalid', '+31611111104', pg_temp.slot(pg_temp.nm(), '11:00')) = 'already_used');
select pg_temp.check_('guard: opening zonder phone_e164 geweigerd', pg_temp.fails($q$insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, source) values ('d8000000-0000-4000-8000-000000000001', 'x', 'g1@test.invalid', '+31611111197', 0, 'paid', 'opening')$q$) = '23514');
select pg_temp.check_('guard: opening met prijs geweigerd', pg_temp.fails($q$insert into tmc.trial_bookings (session_id, name, email, phone, phone_e164, price_paid_cents, status, source) values ('d8000000-0000-4000-8000-000000000001', 'x', 'g2@test.invalid', '+31611111196', '+31611111196', 1700, 'paid', 'opening')$q$) = '23514');
select pg_temp.check_('guard: source code zonder code geweigerd', pg_temp.fails($q$insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, source) values ('d8000000-0000-4000-8000-000000000001', 'x', 'g3@test.invalid', '+31611111195', 0, 'paid', 'code')$q$) = '23514');
select pg_temp.check_('guard: betaalde proefles op vrij trainen blijft onmogelijk', pg_temp.fails($q$insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, source, slot_start_at, slot_end_at) values ('d8000000-0000-4000-8000-000000000003', 'x', 'g4@test.invalid', '+31611111194', 1700, 'pending', 'paid', pg_temp.slot(pg_temp.nm(), '10:00'), pg_temp.slot(pg_temp.nm(), '11:00'))$q$) = 'P0001');
select pg_temp.check_('unieke index: tweede actieve openingsrij voor hetzelfde adres geweigerd (backstop naast de RPC)', pg_temp.fails($q$insert into tmc.trial_bookings (session_id, name, email, phone, phone_e164, price_paid_cents, status, source) values ('d8000000-0000-4000-8000-000000000006', 'A', 'A@TEST.invalid', '+31611111189', '+31611111189', 0, 'paid', 'opening')$q$) = '23505');
select pg_temp.check_('unieke index: zelfde nummer, ander adres geweigerd', pg_temp.fails($q$insert into tmc.trial_bookings (session_id, name, email, phone, phone_e164, price_paid_cents, status, source) values ('d8000000-0000-4000-8000-000000000006', 'A', 'anders@test.invalid', '+31611111101', '+31611111101', 0, 'paid', 'opening')$q$) = '23505');
select pg_temp.check_('rate limit: 10 pogingen toegestaan, 11e geweigerd',
  (select bool_and((tmc.register_opening_trial_attempt('203.0.113.7') ->> 'allowed')::boolean) from generate_series(1, 10))
  and not (tmc.register_opening_trial_attempt('203.0.113.7') ->> 'allowed')::boolean);

rollback;
SQL
)
echo "$OUT"
if echo "$OUT" | grep -q '^FAIL'; then
  echo "ER ZIJN TESTS GEFAALD"
  exit 1
fi
echo "ALLE DB-TESTS GESLAAGD"
