-- Facturatie PR 5 (spec-facturatie.md sectie 14): de proefles krijgt een
-- eigen testmodus en wordt zichtbaar in de omzet.
--
-- Twee dingen, en een derde bewust NIET:
--
--   1. trial_bookings.is_test, gevuld door de aanmaakroute uit
--      trialBookingMode() (TS-kant, zelfde PR). Testrijen tellen niet mee
--      in de bezetting.
--   2. Backfill van de twee bestaande betaalde-proefles-payments naar
--      tmc.payments (het omzetlek uit 2.9), met de echte Mollie-statussen
--      als constante (read-only opgehaald op 2026-08-07, niet als call
--      vanuit deze migratie).
--   3. GEEN tweede bovengrens voor testrijen (besluitenlog 25). De
--      asymmetrie is bewust: een volle sessie weigert nog steeds een
--      testproefles (de trigger toetst tegen de echte bezetting), maar
--      testproeflessen begrenzen elkaar niet (ze verhogen de telling
--      niet). "Testdata past in de zaal" beschermt niets, want er komt
--      niemand opdagen.
--
-- Waar de telling werkelijk zit (discovery PR 5, correctie op de eerdere
-- spec-tekst): tmc.session_occupancy() is de enige telfunctie. De trigger
-- enforce_session_capacity (op bookings, guest_bookings en trial_bookings),
-- redeem_trial_code en book_class_session delegeren er alle vier naar.
-- Alleen v_session_availability heeft een eigen inline telling. De
-- wijziging landt dus op precies twee plekken: session_occupancy en de
-- view. Sectie 2.9 en 14 van de spec zijn hierop bijgewerkt in deze PR.

begin;

-- ---------------------------------------------------------------------------
-- 1. trial_bookings.is_test
--
-- Default false is hier juist (10.3): "geen test" is de veilige aanname, en
-- de aanmaakroute zet de vlag expliciet uit trialBookingMode(). De twee
-- bestaande rijen blijven false: is_test betekent "was dit bedoeld als
-- echte transactie", niet "op welke key is betaald". Alles uit die periode
-- liep op de testkey (het oude MOLLIE_API_KEY in productie was een
-- test_-key), dus die eigenschap onderscheidt niets; de rijen zijn
-- functioneel als echte boekingen behandeld, net als de vijf bestaande
-- payments-rijen uit dezelfde periode. Zie besluitenlog 28.
-- ---------------------------------------------------------------------------

alter table tmc.trial_bookings
  add column if not exists is_test boolean not null default false;

comment on column tmc.trial_bookings.is_test is
  'Testmodus van de publieke proefles: gezet door de aanmaakroute uit trialBookingMode() (deployment bepaalt, geen bezoekersinvoer). Testrijen tellen niet mee in session_occupancy en v_session_availability, maar een volle sessie weigert ze nog wel: de asymmetrie uit spec-facturatie.md besluitenlog 25. Betekent "bedoeld als echte transactie of niet", niet "op welke key is betaald".';

-- ---------------------------------------------------------------------------
-- 2. session_occupancy: testrijen uit de telling
--
-- Dit dekt in een keer de trigger op alle drie de tabellen,
-- redeem_trial_code en book_class_session. Bookings en guest_bookings
-- hebben geen is_test: leden en gasten bestaan alleen echt (testleden zijn
-- testPROFIELEN, en die boeken hun eigen sessies niet in productie-rooster;
-- spec 6.2 verbiedt precies dat scenario via profiles.is_test).
-- ---------------------------------------------------------------------------

create or replace function tmc.session_occupancy(p_session_id uuid)
 returns integer
 language sql
 stable
as $function$
  select (
    (select count(*) from tmc.bookings b
      where b.session_id = p_session_id
        and b.status = 'booked')
    + (select count(*) from tmc.trial_bookings tb
      where tb.session_id = p_session_id
        and tb.status in ('pending', 'paid', 'attended')
        and not tb.is_test)
    + (select count(*) from tmc.guest_bookings gb
      where gb.session_id = p_session_id
        and gb.status in ('booked', 'attended'))
  )::integer
$function$;

-- ---------------------------------------------------------------------------
-- 3. v_session_availability: dezelfde uitsluiting in de inline telling
--
-- Zelfde kolommen, dus CREATE OR REPLACE volstaat en alle achttien lezers
-- (waaronder de waitlist-promote cron, die spots_available leest) volgen
-- automatisch.
-- ---------------------------------------------------------------------------

create or replace view tmc.v_session_availability as
 select cs.id,
    cs.class_type_id,
    cs.trainer_id,
    cs.pillar,
    cs.age_category,
    cs.start_at,
    cs.end_at,
    cs.capacity,
    cs.status,
    occ.members_booked as booked_count,
        case
            when cs.capacity is null then null::bigint
            else cs.capacity - (occ.members_booked + occ.trials_taken + occ.guests_taken)
        end as spots_available,
    ( select count(*) as count
           from tmc.waitlist_entries w
          where w.session_id = cs.id and w.confirmed_at is null and w.expired_at is null) as waitlist_count,
    occ.members_booked + occ.trials_taken + occ.guests_taken as taken_count
   from tmc.class_sessions cs
     cross join lateral ( select ( select count(*) as count
                   from tmc.bookings b
                  where b.session_id = cs.id and b.status = 'booked'::text) as members_booked,
            ( select count(*) as count
                   from tmc.trial_bookings tb
                  where tb.session_id = cs.id
                    and (tb.status = any (array['pending'::text, 'paid'::text, 'attended'::text]))
                    and not tb.is_test) as trials_taken,
            ( select count(*) as count
                   from tmc.guest_bookings gb
                  where gb.session_id = cs.id and (gb.status = any (array['booked'::text, 'attended'::text]))) as guests_taken) occ
  where cs.status = 'scheduled'::text;

-- ---------------------------------------------------------------------------
-- 4. Backfill: de twee betaalde-proefles-payments naar tmc.payments (2.9)
--
-- Mollie-statussen read-only opgehaald op 2026-08-07 en hier als constante:
--   tr_dF2fufM8697aFeXXLwgTJ  paid     paidAt 2026-07-08T15:01:33+00  ideal
--   tr_pcCJ9FUeYp8GVTdTDvpTJ  expired
-- BTW-snapshot volgens dezelfde regel als PR 2/3: drop_in draagt 900, dus
-- vat = round(1700 * 900 / 10900) = 140, net = 1560. De expired-rij krijgt
-- hetzelfde snapshot (het bedrag klopt; expired telt toch niet als omzet,
-- zelfde behandeling als de expired rijen uit de PR 2-backfill).
-- ---------------------------------------------------------------------------

insert into tmc.payments (
  mollie_payment_id, amount_cents, status, method, description, paid_at,
  kind, trial_booking_id, is_test, vat_rate_bp, vat_amount_cents, net_amount_cents
) values
  ('tr_dF2fufM8697aFeXXLwgTJ', 1700, 'paid', 'ideal',
   'Proefles (backfill PR 5)', timestamptz '2026-07-08 15:01:33+00',
   'trial_booking', '72655e88-3e21-448c-83b0-20cc9bf9ae57', false, 900, 140, 1560),
  ('tr_pcCJ9FUeYp8GVTdTDvpTJ', 1700, 'expired', null,
   'Proefles (backfill PR 5)', null,
   'trial_booking', '1db18a42-572c-4c09-a02d-7f43471323f8', false, 900, 140, 1560)
on conflict (mollie_payment_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Zelfcontrole binnen dezelfde transactie
--
-- Synthetische sessie met expliciete capacity 2, binnen deze transactie
-- aangemaakt en weer verwijderd; er wordt niet tegen een bestaande sessie
-- geleund waarvan de bezetting morgen anders kan zijn. Dit speelt E9 tak A
-- en B en beide helften van E10 na.
-- ---------------------------------------------------------------------------

do $$
declare
  v_sid uuid;
  v_ct uuid;
  v_tr uuid;
begin
  select id into v_ct from tmc.class_types limit 1;
  select id into v_tr from tmc.trainers limit 1;
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'yoga_mobility', 'adult', now() + interval '365 days', now() + interval '365 days 1 hour', 2, 'scheduled')
  returning id into v_sid;

  -- E9 tak A: een testproefles telt niet mee.
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, is_test)
  values (v_sid, 'Zelfcontrole Test', 'zelfcontrole@test.invalid', '0600000000', 0, 'paid', true);
  if tmc.session_occupancy(v_sid) <> 0 then
    raise exception 'trial_booking_mode: testrij telt mee in session_occupancy';
  end if;
  if (select taken_count from tmc.v_session_availability where id = v_sid) <> 0 then
    raise exception 'trial_booking_mode: testrij telt mee in v_session_availability';
  end if;

  -- E10 tweede helft: testrijen begrenzen elkaar niet (capacity 2, derde testrij slaagt).
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, is_test)
  values (v_sid, 'Zelfcontrole Test 2', 'zelfcontrole2@test.invalid', '0600000000', 0, 'paid', true),
         (v_sid, 'Zelfcontrole Test 3', 'zelfcontrole3@test.invalid', '0600000000', 0, 'paid', true);
  if tmc.session_occupancy(v_sid) <> 0 then
    raise exception 'trial_booking_mode: testrijen verhogen de telling';
  end if;

  -- E9 tak B (de belangrijkste): een ECHTE proefles telt wel mee, en de
  -- trigger handhaaft er nog op. Twee echte rijen vullen capacity 2; de
  -- derde echte moet weigeren.
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, is_test)
  values (v_sid, 'Zelfcontrole Echt 1', 'zelfcontrole-echt1@test.invalid', '0600000000', 0, 'paid', false),
         (v_sid, 'Zelfcontrole Echt 2', 'zelfcontrole-echt2@test.invalid', '0600000000', 0, 'paid', false);
  if tmc.session_occupancy(v_sid) <> 2 then
    raise exception 'trial_booking_mode: echte rijen tellen niet mee (occupancy=%)', tmc.session_occupancy(v_sid);
  end if;
  begin
    insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, is_test)
    values (v_sid, 'Zelfcontrole Echt 3', 'zelfcontrole-echt3@test.invalid', '0600000000', 0, 'paid', false);
    raise exception 'trial_booking_mode: derde echte rij had moeten weigeren op session_capacity_exceeded';
  exception
    when others then
      if sqlerrm not like '%session_capacity_exceeded%' then
        raise;
      end if;
  end;

  -- E10 eerste helft: een volle sessie weigert ook een TESTrij; de
  -- testmodus omzeilt de fysieke grens niet.
  begin
    insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, is_test)
    values (v_sid, 'Zelfcontrole Test 4', 'zelfcontrole4@test.invalid', '0600000000', 0, 'paid', true);
    raise exception 'trial_booking_mode: testrij in volle sessie had moeten weigeren';
  exception
    when others then
      if sqlerrm not like '%session_capacity_exceeded%' then
        raise;
      end if;
  end;

  -- Opruimen binnen de transactie.
  delete from tmc.trial_bookings where session_id = v_sid;
  delete from tmc.class_sessions where id = v_sid;

  -- Backfill-controle: beide rijen aanwezig en gekoppeld.
  if (select count(*) from tmc.payments where kind = 'trial_booking' and trial_booking_id is not null) < 2 then
    raise exception 'trial_booking_mode: backfill onvolledig';
  end if;
end $$;

commit;
