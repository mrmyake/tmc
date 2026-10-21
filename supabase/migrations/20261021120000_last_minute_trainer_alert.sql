-- Last-minute trainersmelding (spec-last-minute-alerts.md).
--
-- Een stempel per inschrijving: de trainer van de les (of de fallback, of
-- buiten productie het omleidingsadres) is gemaild omdat deze inschrijving
-- minder dan drie uur voor de start definitief werd. Stamp-first, hetzelfde
-- patroon als reminder_sent_at: de helper in src/lib/alerts/ zet de kolom
-- met "where trainer_alerted_at is null" en mailt alleen als die update een
-- rij raakte. Zo gaat er per inschrijving hooguit een mail, ook als de
-- Mollie-webhook dubbel binnenkomt of de reconciliatiecron opnieuw draait.
--
-- Alleen kolommen, geen functies (dus geen grants, regel 7 van de README).
-- Geschreven door service_role vanuit TypeScript; de app-rollen raken de
-- kolom niet aan. Schema uitsluitend tmc.

alter table tmc.bookings
  add column trainer_alerted_at timestamptz;

comment on column tmc.bookings.trainer_alerted_at is
  'Last-minute trainersmelding verstuurd (spec-last-minute-alerts.md). Stamp-first-dedupe, zelfde patroon als reminder_sent_at; null = niet gemeld, ook als de boeking buiten het venster van drie uur viel.';

alter table tmc.trial_bookings
  add column trainer_alerted_at timestamptz;

comment on column tmc.trial_bookings.trainer_alerted_at is
  'Last-minute trainersmelding verstuurd (spec-last-minute-alerts.md). Gezet op het moment dat de proefles definitief werd (paid), niet bij pending.';

alter table tmc.guest_bookings
  add column trainer_alerted_at timestamptz;

comment on column tmc.guest_bookings.trainer_alerted_at is
  'Last-minute trainersmelding verstuurd (spec-last-minute-alerts.md). Stamp-first-dedupe per gastboeking.';

-- Zelfcheck: de drie kolommen bestaan, zijn timestamptz en hebben geen
-- default (een default zou elke nieuwe inschrijving als al gemeld markeren).
-- Geen afhankelijkheid van app-data (regel 6 van de README).
do $$
declare
  v_tbl text;
  v_type text;
  v_default text;
begin
  foreach v_tbl in array array['bookings', 'trial_bookings', 'guest_bookings'] loop
    select data_type, column_default
      into v_type, v_default
      from information_schema.columns
     where table_schema = 'tmc'
       and table_name = v_tbl
       and column_name = 'trainer_alerted_at';
    if v_type is null then
      raise exception 'last_minute_trainer_alert: kolom tmc.%.trainer_alerted_at ontbreekt', v_tbl;
    end if;
    if v_type <> 'timestamp with time zone' then
      raise exception 'last_minute_trainer_alert: kolom tmc.%.trainer_alerted_at is % in plaats van timestamptz', v_tbl, v_type;
    end if;
    if v_default is not null then
      raise exception 'last_minute_trainer_alert: kolom tmc.%.trainer_alerted_at heeft een default (%)', v_tbl, v_default;
    end if;
  end loop;
end $$;
