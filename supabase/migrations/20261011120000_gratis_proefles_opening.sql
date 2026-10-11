-- Gratis proefles tijdens de openingsperiode (spec-community-growth.md par. 1
-- "Gratis openingsperiode").
--
-- Tijdelijk, datumgestuurd en volledig buiten Mollie: zolang now() binnen
-- booking_settings.free_trial_start_at en free_trial_end_at valt, boekt een
-- bezoeker zonder account een gratis groepsles of een gratis uur vrij trainen.
-- Alle handhaving zit in een SECURITY DEFINER RPC (tmc.book_opening_trial) in
-- een transactie met row locking:
-- - periode uit de instellingen (geen deploy nodig om te schuiven of te sluiten);
-- - maximaal 4 gratis proefplekken per les, en per kwartier maximaal 4 gratis
--   proefgasten in vrij trainen; een proefplek telt daarnaast gewoon mee voor
--   de capaciteit (session_occupancy) en voor het maximum van 5 tegelijk
--   (vrij_trainen_slot_peak);
-- - een gratis proefles per persoon, ooit: genormaliseerd e-mailadres
--   (lowercase, trim) of telefoonnummer (E.164); een profiel met abonnement of
--   eerdere aankoop krijgt er geen; een eerdere proefles van welke bron ook die
--   attended of no_show is telt als gebruikt; op tijd annuleren niet;
-- - vrij trainen alleen binnen de aanwezigheid van Marlon
--   (trainer_presence_windows), vast 60 minuten, zonder deurtoegang.
--
-- Ontwerpbesluiten:
-- - trial_bookings.source ('paid', 'code', 'opening') vervangt de impliciete
--   afleiding "trial_code_id is not null = gratis via code". Backfill: code
--   waar trial_code_id gevuld is, anders paid. De oude constraint
--   trial_bookings_code_is_free_check wordt vervangen door
--   trial_bookings_source_consistency.
-- - trial_bookings.phone_e164 is het genormaliseerde nummer (alleen gevuld voor
--   nieuwe gratis boekingen; oude rijen houden het vrije tekstveld phone).
-- - trial_bookings.reminder_sent_at: stempel voor de herinneringsmail een dag
--   van tevoren, voor proefboekingen van elke bron (send-reminders cron).
-- - Twee partiele unieke indexen (lower(email), is_test) en (phone_e164,
--   is_test) op actieve gratis boekingen zijn de harde arbiter voor "een per
--   persoon"; de RPC serialiseert daarnaast per persoon met advisory locks.
-- - De guard trial_bookings_guard_vrij_trainen accepteert naast een code met
--   scope vrij_trainen nu ook source 'opening' (gratis, zonder code). Herbouwd
--   op de live definitie (pg_get_functiondef, 2026-10-11): alleen het
--   eligibiliteitsblok verandert.
-- - redeem_trial_code wordt herbouwd op de live definitie met source 'code' in
--   de insert; verder byte-identiek. Live rechten: postgres en service_role.
-- - Rate limiting per IP op de publieke boekingsroute: eigen tabel
--   tmc.opening_trial_attempts en RPC register_opening_trial_attempt, kopie van
--   het patroon van register_trial_code_attempt (10 per 30 minuten, daarna 15
--   minuten slot).
-- - vrij_trainen_opening_availability geeft per kwartier naast de gewone
--   telling ook het aantal gratis proefgasten, zodat de slotkiezer volle
--   kwartieren grijs toont. Alleen weergave; de RPC beslist.
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Geen afhankelijkheid van app-data (README regel 6). Draaien
-- met `supabase db push` na merge van de PR.

begin;

-- ---------------------------------------------------------------------------
-- 1. Periode in de instellingen
-- ---------------------------------------------------------------------------

alter table tmc.booking_settings
  add column free_trial_start_at timestamptz,
  add column free_trial_end_at timestamptz,
  add constraint booking_settings_free_trial_period_check
    check (
      free_trial_start_at is null
      or free_trial_end_at is null
      or free_trial_end_at > free_trial_start_at
    );

comment on column tmc.booking_settings.free_trial_start_at is
  'Start van de gratis openingsperiode voor proeflessen (groepslessen en vrij trainen). Null = geen gratis periode. Alleen binnen [start, einde] boekt tmc.book_opening_trial.';
comment on column tmc.booking_settings.free_trial_end_at is
  'Einde van de gratis openingsperiode (inclusief). Daarna toont /proefles automatisch weer de betaalde route en weigert de RPC met period_closed.';

-- Seed: vanaf nu tot en met 22 november 2026 23:59:59 Amsterdamse tijd. Bestaat
-- de singleton-rij al, dan alleen vullen wat nog leeg is (een later verschoven
-- periode wordt door een replay niet overschreven).
insert into tmc.booking_settings (id, free_trial_start_at, free_trial_end_at)
values (
  'singleton',
  now(),
  (timestamp '2026-11-22 23:59:59') at time zone 'Europe/Amsterdam'
)
on conflict (id) do update
  set free_trial_start_at = coalesce(tmc.booking_settings.free_trial_start_at, excluded.free_trial_start_at),
      free_trial_end_at = coalesce(tmc.booking_settings.free_trial_end_at, excluded.free_trial_end_at);

-- ---------------------------------------------------------------------------
-- 2. Bron, genormaliseerd nummer en herinneringsstempel op trial_bookings
-- ---------------------------------------------------------------------------

alter table tmc.trial_bookings
  add column source text not null default 'paid',
  add column phone_e164 text,
  add column reminder_sent_at timestamptz;

update tmc.trial_bookings set source = 'code' where trial_code_id is not null;

alter table tmc.trial_bookings
  drop constraint trial_bookings_code_is_free_check,
  add constraint trial_bookings_source_check
    check (source in ('paid', 'code', 'opening')),
  add constraint trial_bookings_phone_e164_check
    check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint trial_bookings_source_consistency
    check (
      (source = 'code') = (trial_code_id is not null)
      and (source = 'paid' or (price_paid_cents = 0 and mollie_payment_id is null))
      and (source <> 'opening' or phone_e164 is not null)
    );

comment on column tmc.trial_bookings.source is
  'Hoe de proefboeking is ontstaan: paid (drop-in via Mollie), code (gratis via een proefcode, trial_code_id gevuld) of opening (gratis tijdens de openingsperiode via tmc.book_opening_trial).';
comment on column tmc.trial_bookings.phone_e164 is
  'Genormaliseerd telefoonnummer (E.164) voor de regel een gratis proefles per persoon. Verplicht bij source opening; null bij oudere rijen.';
comment on column tmc.trial_bookings.reminder_sent_at is
  'Stempel van de herinneringsmail een dag van tevoren (send-reminders cron, stempel eerst, dan mail). Null = nog niet verstuurd.';

-- Harde arbiter voor een gratis proefles per persoon, per is_test-modus.
-- Geannuleerd telt niet mee (op tijd annuleren geeft de kans terug).
create unique index trial_bookings_opening_email_uidx
  on tmc.trial_bookings (lower(email), is_test)
  where source = 'opening' and status in ('paid', 'attended', 'no_show');

create unique index trial_bookings_opening_phone_uidx
  on tmc.trial_bookings (phone_e164, is_test)
  where source = 'opening' and status in ('paid', 'attended', 'no_show');

-- Quotumtelling per les en de herinneringsselectie.
create index trial_bookings_opening_session_idx
  on tmc.trial_bookings (session_id, is_test)
  where source = 'opening' and status in ('pending', 'paid', 'attended');

create index trial_bookings_reminder_due_idx
  on tmc.trial_bookings (session_id)
  where status = 'paid' and reminder_sent_at is null;

-- ---------------------------------------------------------------------------
-- 3. Guard op trial_bookings: ook source 'opening' zonder code
--    (live definitie via pg_get_functiondef op 2026-10-11; alleen het
--    eligibiliteitsblok wijzigt; geen grants aan wie dan ook, zoals live)
-- ---------------------------------------------------------------------------

drop trigger trial_bookings_guard_vrij_trainen on tmc.trial_bookings;
revoke all on function tmc.guard_trial_booking_vrij_trainen() from public, anon, authenticated, service_role;
drop function tmc.guard_trial_booking_vrij_trainen();

create function tmc.guard_trial_booking_vrij_trainen()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_pillar text;
  v_session record;
  v_max int;
  v_peak int;
  v_blocked boolean;
begin
  select pillar into v_pillar from tmc.class_sessions where id = new.session_id;

  -- Gewone proeflessen hebben nooit een slot.
  if v_pillar is distinct from 'vrij_trainen' then
    if new.slot_start_at is not null then
      raise exception 'slot_not_allowed' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Een geannuleerde rij (of een annulering) wordt niet meer gecontroleerd.
  if new.status = 'cancelled' then
    return new;
  end if;

  -- Alleen gratis: via een code met scope vrij_trainen, of als gratis proefles
  -- in de openingsperiode (source opening, geen code). Een betaalde
  -- proefboeking op vrij trainen blijft onmogelijk.
  if new.price_paid_cents <> 0 or new.mollie_payment_id is not null then
    raise exception 'session_not_eligible' using errcode = 'P0001',
      hint = 'Vrij trainen is voor proefbezoekers alleen gratis te boeken.';
  end if;
  if new.source = 'code' then
    if new.trial_code_id is null
       or not exists (
         select 1 from tmc.trial_codes c
         where c.id = new.trial_code_id and c.scope = 'vrij_trainen'
       ) then
      raise exception 'session_not_eligible' using errcode = 'P0001',
        hint = 'Vrij trainen is voor proefbezoekers alleen gratis te boeken met een proefcode met scope vrij trainen.';
    end if;
  elsif new.source <> 'opening' then
    raise exception 'session_not_eligible' using errcode = 'P0001',
      hint = 'Vrij trainen is voor proefbezoekers alleen te boeken met een proefcode met scope vrij trainen of als gratis proefles in de openingsperiode.';
  end if;

  if new.slot_start_at is null then
    raise exception 'slot_required' using errcode = 'P0001';
  end if;

  -- Een rij die van sessie en slot niet wisselt en al actief was, is al
  -- gecontroleerd (bv. paid naar attended).
  if tg_op = 'UPDATE'
     and old.status <> 'cancelled'
     and new.session_id is not distinct from old.session_id
     and new.slot_start_at is not distinct from old.slot_start_at
     and new.slot_end_at is not distinct from old.slot_end_at then
    return new;
  end if;

  -- Serialisatiepunt: dezelfde rij-lock als book_class_session,
  -- enforce_vrij_trainen_slot, redeem_trial_code en book_opening_trial.
  select id, start_at, end_at into v_session
  from tmc.class_sessions
  where id = new.session_id
  for update;

  if new.slot_start_at < v_session.start_at or new.slot_end_at > v_session.end_at then
    raise exception 'slot_outside_session' using errcode = 'P0001';
  end if;

  if not tmc.vrij_trainen_trainer_present(new.slot_start_at, new.slot_end_at) then
    raise exception 'outside_presence' using errcode = 'P0001',
      hint = 'Vrij trainen als proefbezoeker kan alleen als Marlon er is.';
  end if;

  select coalesce(bs.vrij_trainen_max_concurrent, 5) into v_max
  from tmc.booking_settings bs limit 1;
  v_max := coalesce(v_max, 5);

  select p.peak, p.blocked into v_peak, v_blocked
  from tmc.vrij_trainen_slot_peak(
    new.session_id, new.slot_start_at, new.slot_end_at,
    case when tg_op = 'UPDATE' then new.id end) p;

  if v_blocked then
    raise exception 'slot_blocked' using errcode = 'P0001';
  end if;
  -- Testboekingen tellen niet mee voor het maximum en worden er ook niet op
  -- geweigerd (consistent met session_occupancy).
  if not new.is_test and v_peak >= v_max then
    raise exception 'slot_full' using errcode = 'P0001',
      hint = 'Maximaal aantal tegelijk bereikt in minstens een kwartier van dit slot.';
  end if;

  return new;
end;
$function$;

revoke all on function tmc.guard_trial_booking_vrij_trainen() from public, anon, authenticated, service_role;

create trigger trial_bookings_guard_vrij_trainen
  before insert or update of session_id, status, slot_start_at, slot_end_at, trial_code_id, price_paid_cents, source
  on tmc.trial_bookings
  for each row execute function tmc.guard_trial_booking_vrij_trainen();

-- ---------------------------------------------------------------------------
-- 4. redeem_trial_code: source 'code' in de insert
--    (live definitie via pg_get_functiondef op 2026-10-11, verder identiek;
--    live rechten: postgres en service_role)
-- ---------------------------------------------------------------------------

revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated, service_role;
drop function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz);

create function tmc.redeem_trial_code(
  p_code text,
  p_session_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_is_test boolean default false,
  p_slot_start_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_code_norm text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
  v_tc tmc.trial_codes%rowtype;
  v_session tmc.class_sessions%rowtype;
  v_trial_id uuid;
  v_cancel_token uuid;
  v_redemption_id uuid;
  v_prior_free int;
  v_slot_end timestamptz;
  v_max int;
  v_peak int;
  v_blocked boolean;
begin
  if v_code_norm = '' or v_name = '' or v_email = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;

  -- Lock de code-rij: serialiseert gelijktijdig inwisselen, zodat
  -- uses_count nooit boven max_uses uitkomt.
  select * into v_tc
  from tmc.trial_codes
  where code = v_code_norm
  for update;

  -- Bestaat niet, ingetrokken en op krijgen dezelfde reason: de bezoeker
  -- mag niet kunnen afleiden welke codes bestaan.
  if not found
     or v_tc.revoked_at is not null
     or (v_tc.max_uses is not null and v_tc.uses_count >= v_tc.max_uses) then
    return jsonb_build_object('ok', false, 'reason', 'code_invalid');
  end if;

  -- Lock de sessie-rij: pint status en capaciteit vast en serialiseert met
  -- elke ledenboeking op dezelfde vrij-trainen-dag (book_class_session,
  -- enforce_vrij_trainen_slot nemen dezelfde lock).
  select * into v_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;

  if v_tc.scope = 'vrij_trainen' then
    -- Een vrij-trainen-code geldt alleen voor een vrij-trainen-sessie.
    if v_session.pillar <> 'vrij_trainen' then
      return jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
    end if;
    if p_slot_start_at is null then
      return jsonb_build_object('ok', false, 'reason', 'slot_required');
    end if;
    -- Vaste duur van 60 minuten en start op een kwartier, server-side.
    if extract(epoch from p_slot_start_at)::bigint % 900 <> 0 then
      return jsonb_build_object('ok', false, 'reason', 'slot_invalid');
    end if;
    v_slot_end := p_slot_start_at + interval '60 minutes';
    if p_slot_start_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'slot_in_past');
    end if;
    if p_slot_start_at < v_session.start_at or v_slot_end > v_session.end_at then
      return jsonb_build_object('ok', false, 'reason', 'slot_outside_session');
    end if;
    -- Alleen binnen de aanwezigheid van Marlon (tmc.trainer_presence_windows).
    if not tmc.vrij_trainen_trainer_present(p_slot_start_at, v_slot_end) then
      return jsonb_build_object('ok', false, 'reason', 'outside_presence');
    end if;
  else
    if p_slot_start_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'slot_not_allowed');
    end if;
    if v_session.start_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'session_in_past');
    end if;
    -- Een groepscode boekt nooit vrij trainen; yoga_mobility en kettlebell
    -- gelden per pillar. group = elke les die als proefles boekbaar is (het
    -- v2-gedrag). De lijst in de UI is alleen weergave.
    if v_session.pillar = 'vrij_trainen' then
      return jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
    end if;
    if v_tc.scope in ('yoga_mobility', 'kettlebell') and v_session.pillar <> v_tc.scope then
      return jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
    end if;
  end if;

  -- Een e-mailadres kan per les (bij vrij trainen: per dagsessie, dus ook
  -- nooit twee overlappende slots) maar een keer geboekt staan, betaald of
  -- gratis. Aparte reason: dit mag de bezoeker wel te horen krijgen.
  if exists (
    select 1 from tmc.trial_bookings tb
    where tb.session_id = p_session_id
      and lower(trim(tb.email)) = v_email
      and tb.status in ('pending', 'paid', 'attended')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'email_already_booked');
  end if;

  if v_tc.scope = 'vrij_trainen' then
    -- Blokkerende les en het maximum tegelijk, onder de sessielock, via de
    -- enige telling. Een testboeking telt niet mee en wordt er niet op
    -- geweigerd.
    select coalesce(bs.vrij_trainen_max_concurrent, 5) into v_max
    from tmc.booking_settings bs limit 1;
    v_max := coalesce(v_max, 5);

    select p.peak, p.blocked into v_peak, v_blocked
    from tmc.vrij_trainen_slot_peak(p_session_id, p_slot_start_at, v_slot_end) p;

    if v_blocked then
      return jsonb_build_object('ok', false, 'reason', 'slot_blocked');
    end if;
    if not coalesce(p_is_test, false) and v_peak >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'slot_full');
    end if;
  elsif v_session.capacity is not null
     and tmc.session_occupancy(p_session_id) >= v_session.capacity then
    -- Capaciteit onder de sessie-lock via tmc.session_occupancy(): dezelfde
    -- som als v_session_availability en de andere schrijf-gates.
    return jsonb_build_object('ok', false, 'reason', 'capacity_full');
  end if;

  -- Gratis en direct definitief: status 'paid', prijs 0, geen Mollie.
  -- is_test is een snapshot van de deployment-modus, zoals bij een
  -- betaalde proefles (trialBookingMode()).
  insert into tmc.trial_bookings (
    session_id, name, email, phone,
    price_paid_cents, mollie_payment_id, status, trial_code_id, is_test,
    slot_start_at, slot_end_at, source
  ) values (
    p_session_id, v_name, v_email, v_phone,
    0, null, 'paid', v_tc.id, coalesce(p_is_test, false),
    p_slot_start_at, v_slot_end, 'code'
  )
  returning id, cancel_token into v_trial_id, v_cancel_token;

  insert into tmc.trial_code_redemptions (code_id, trial_booking_id, session_id, email_normalized)
  values (v_tc.id, v_trial_id, p_session_id, v_email)
  returning id into v_redemption_id;

  update tmc.trial_codes
  set uses_count = uses_count + 1
  where id = v_tc.id;

  -- Eerdere gratis proeflessen van dit adres, via welke code dan ook,
  -- inclusief geannuleerde (released_at gezet). Basis voor de
  -- misbruikmelding in de app-laag; de boeking gaat gewoon door.
  select count(*) into v_prior_free
  from tmc.trial_code_redemptions r
  where r.email_normalized = v_email
    and r.id <> v_redemption_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.redeemed', 'visitor', null, 'trial_code', v_tc.id,
    jsonb_build_object(
      'code_id', v_tc.id,
      'trial_booking_id', v_trial_id,
      'session_id', p_session_id,
      'pillar', v_session.pillar,
      'scope', v_tc.scope,
      'slot_start_at', p_slot_start_at,
      'slot_end_at', v_slot_end,
      'uses_count', v_tc.uses_count + 1,
      'max_uses', v_tc.max_uses,
      'prior_free_count', v_prior_free
    )
  );

  return jsonb_build_object(
    'ok', true,
    'trial_booking_id', v_trial_id,
    'cancel_token', v_cancel_token,
    'code_id', v_tc.id,
    'code', v_tc.code,
    'session_id', p_session_id,
    'session_start_at', v_session.start_at,
    'slot_start_at', p_slot_start_at,
    'slot_end_at', v_slot_end,
    'prior_free_count', v_prior_free
  );
end;
$$;

revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Rate limiting per IP voor de publieke gratis boekingsroute
--    (kopie van trial_code_attempts en register_trial_code_attempt)
-- ---------------------------------------------------------------------------

create table tmc.opening_trial_attempts (
  ip text primary key,
  fail_count integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

comment on table tmc.opening_trial_attempts is
  'Pogingenteller per IP voor de gratis proefles in de openingsperiode (startOpeningTrialBooking). 10 pogingen per 30 minuten, daarna 15 minuten slot. Alleen service_role; geen RLS-policies, de app leest en schrijft uitsluitend via de service-role client.';

revoke all on table tmc.opening_trial_attempts from public, anon, authenticated;
grant all on table tmc.opening_trial_attempts to service_role;
alter table tmc.opening_trial_attempts enable row level security;

create function tmc.register_opening_trial_attempt(p_ip text)
returns jsonb
language plpgsql
set search_path to 'tmc'
as $function$
declare
  v_now timestamptz := now();
  v_row tmc.opening_trial_attempts%rowtype;
begin
  -- Upsert met no-op update: zorgt dat de rij bestaat en pakt de row-lock,
  -- zodat de rest race-vrij is tegen parallelle pogingen.
  insert into tmc.opening_trial_attempts as a (ip)
  values (p_ip)
  on conflict (ip) do update set ip = excluded.ip
  returning * into v_row;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', ceil(extract(epoch from (v_row.locked_until - v_now)))::int
    );
  end if;

  -- Verlopen slot of dertig minuten zonder pogingen: vers venster.
  if v_row.locked_until is not null
     or v_now - v_row.updated_at > interval '30 minutes' then
    v_row.fail_count := 0;
  end if;

  v_row.fail_count := v_row.fail_count + 1;

  update tmc.opening_trial_attempts
  set fail_count = v_row.fail_count,
      window_start = case when v_row.fail_count = 1 then v_now else window_start end,
      locked_until = case when v_row.fail_count >= 10 then v_now + interval '15 minutes' else null end,
      updated_at = v_now
  where ip = p_ip;

  return jsonb_build_object('allowed', true, 'fail_count', v_row.fail_count);
end;
$function$;

revoke all on function tmc.register_opening_trial_attempt(text) from public, anon, authenticated;
grant execute on function tmc.register_opening_trial_attempt(text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. De boek-RPC: alle handhaving in een transactie onder rijlocks
-- ---------------------------------------------------------------------------

-- Weigeringen als jsonb-reason (conventie book_class_session en
-- redeem_trial_code), in deze volgorde: missing_fields, invalid_phone,
-- invalid_email, period_closed, already_customer, already_used,
-- session_not_found, session_not_scheduled, session_not_trial_eligible,
-- email_already_booked, dan per soort: groepsles slot_not_allowed,
-- session_in_past, trial_quota_full, capacity_full; vrij trainen slot_required,
-- slot_invalid, slot_in_past, slot_outside_session, outside_presence,
-- slot_blocked, slot_full, trial_quota_full.
--
-- Locks: eerst twee advisory locks per persoon (e-mail, dan telefoon; altijd in
-- die volgorde, dus geen deadlock), dan FOR UPDATE op de sessierij (dezelfde
-- lock als book_class_session, redeem_trial_code en de triggers). Twee
-- gelijktijdige aanvragen op de laatste plek leveren zo precies een boeking.
-- De partiele unieke indexen op (lower(email), is_test) en (phone_e164,
-- is_test) zijn de harde backstop voor een gratis proefles per persoon.
create function tmc.book_opening_trial(
  p_session_id uuid,
  p_name text,
  p_email text,
  p_phone_e164 text,
  p_is_test boolean default false,
  p_slot_start_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  -- Vaste besluiten (spec-community-growth.md, gratis openingsperiode).
  c_max_per_session constant int := 4;
  c_max_concurrent_vrij constant int := 4;
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone_e164, ''));
  v_is_test boolean := coalesce(p_is_test, false);
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_session tmc.class_sessions%rowtype;
  v_slot_end timestamptz;
  v_max int;
  v_peak int;
  v_blocked boolean;
  v_opening_count int;
  v_trial_id uuid;
  v_cancel_token uuid;
begin
  if v_name = '' or v_email = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;
  -- Zelfde vorm als profiles_phone_e164; de app normaliseert met
  -- libphonenumber, dit is de server-side grens.
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  -- 1. Periode uit de instellingen (inclusief einde).
  select bs.free_trial_start_at, bs.free_trial_end_at
  into v_period_start, v_period_end
  from tmc.booking_settings bs
  where bs.id = 'singleton';
  if v_period_start is null or v_period_end is null
     or now() < v_period_start or now() > v_period_end then
    return jsonb_build_object('ok', false, 'reason', 'period_closed');
  end if;

  -- 2. Serialiseer per persoon: eerst e-mail, dan telefoon.
  perform pg_advisory_xact_lock(hashtext('opening_trial_email'), hashtext(v_email));
  perform pg_advisory_xact_lock(hashtext('opening_trial_phone'), hashtext(v_phone));

  -- 3. Bestaande klant: een profiel (zelfde is_test-modus) met dit
  --    e-mailadres of dit nummer dat een abonnement (status ongelijk aan
  --    pending) of een eerdere aankoop (order paid of activated) heeft.
  --    profiles.phone is al E.164 (CHECK profiles_phone_e164), dus een
  --    directe vergelijking.
  if exists (
    select 1
    from tmc.profiles p
    where coalesce(p.is_test, false) = v_is_test
      and (lower(trim(coalesce(p.email, ''))) = v_email or p.phone = v_phone)
      and (
        exists (
          select 1 from tmc.memberships m
          where m.profile_id = p.id and m.status <> 'pending'
        )
        or exists (
          select 1 from tmc.orders o
          where o.profile_id = p.id and o.status in ('paid', 'activated')
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_customer');
  end if;

  -- 4. Al gebruikt: een actieve gratis openingsboeking (paid, attended,
  --    no_show), of een proefles van welke bron ook die attended of no_show
  --    is. Op tijd geannuleerd (status cancelled) telt niet. Zelfde
  --    is_test-modus.
  if exists (
    select 1
    from tmc.trial_bookings tb
    where tb.is_test = v_is_test
      and (
        lower(trim(tb.email)) = v_email
        or tb.phone_e164 = v_phone
        or trim(tb.phone) = v_phone
      )
      and (
        (tb.source = 'opening' and tb.status in ('paid', 'attended', 'no_show'))
        or tb.status in ('attended', 'no_show')
      )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;

  -- 5. Sessie-lock: pint status en capaciteit vast en serialiseert met elke
  --    andere boeking op deze sessie.
  select * into v_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;
  if v_session.pillar not in ('yoga_mobility', 'kettlebell', 'kids', 'senior', 'vrij_trainen') then
    return jsonb_build_object('ok', false, 'reason', 'session_not_trial_eligible');
  end if;

  -- 6. Een adres per les (bij vrij trainen per dagsessie), welke bron ook.
  if exists (
    select 1 from tmc.trial_bookings tb
    where tb.session_id = p_session_id
      and lower(trim(tb.email)) = v_email
      and tb.status in ('pending', 'paid', 'attended')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'email_already_booked');
  end if;

  if v_session.pillar = 'vrij_trainen' then
    -- 7a. Vrij trainen: vast uur op een kwartier, in de toekomst, binnen de
    --     dagsessie en binnen de aanwezigheid van Marlon.
    if p_slot_start_at is null then
      return jsonb_build_object('ok', false, 'reason', 'slot_required');
    end if;
    if extract(epoch from p_slot_start_at)::bigint % 900 <> 0 then
      return jsonb_build_object('ok', false, 'reason', 'slot_invalid');
    end if;
    v_slot_end := p_slot_start_at + interval '60 minutes';
    if p_slot_start_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'slot_in_past');
    end if;
    if p_slot_start_at < v_session.start_at or v_slot_end > v_session.end_at then
      return jsonb_build_object('ok', false, 'reason', 'slot_outside_session');
    end if;
    if not tmc.vrij_trainen_trainer_present(p_slot_start_at, v_slot_end) then
      return jsonb_build_object('ok', false, 'reason', 'outside_presence');
    end if;

    -- Het gewone maximum tegelijk (leden plus alle proefbezoekers) via de
    -- enige telling; een testboeking telt niet mee en wordt er niet op
    -- geweigerd.
    select coalesce(bs.vrij_trainen_max_concurrent, 5) into v_max
    from tmc.booking_settings bs limit 1;
    v_max := coalesce(v_max, 5);

    select p.peak, p.blocked into v_peak, v_blocked
    from tmc.vrij_trainen_slot_peak(p_session_id, p_slot_start_at, v_slot_end) p;

    if v_blocked then
      return jsonb_build_object('ok', false, 'reason', 'slot_blocked');
    end if;
    if not v_is_test and v_peak >= v_max then
      return jsonb_build_object('ok', false, 'reason', 'slot_full');
    end if;

    -- Het openingsquotum: in geen kwartier van het uur al 4 gratis
    -- proefgasten (zelfde is_test-modus).
    select coalesce(max(c.n), 0) into v_opening_count
    from generate_series(p_slot_start_at, v_slot_end - interval '15 minutes', interval '15 minutes') as q(qs)
    cross join lateral (
      select count(*)::int as n
      from tmc.trial_bookings t
      where t.session_id = p_session_id
        and t.source = 'opening'
        and t.status in ('pending', 'paid', 'attended')
        and t.is_test = v_is_test
        and t.slot_start_at <= q.qs
        and t.slot_end_at > q.qs
    ) c;
    if v_opening_count >= c_max_concurrent_vrij then
      return jsonb_build_object('ok', false, 'reason', 'trial_quota_full');
    end if;
  else
    -- 7b. Groepsles: geen slot, in de toekomst, hoogstens 4 gratis
    --     proefplekken per les, en de gewone capaciteit.
    if p_slot_start_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'slot_not_allowed');
    end if;
    if v_session.start_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'session_in_past');
    end if;

    select count(*) into v_opening_count
    from tmc.trial_bookings t
    where t.session_id = p_session_id
      and t.source = 'opening'
      and t.status in ('pending', 'paid', 'attended')
      and t.is_test = v_is_test;
    if v_opening_count >= c_max_per_session then
      return jsonb_build_object('ok', false, 'reason', 'trial_quota_full');
    end if;

    -- Capaciteit onder de sessie-lock via tmc.session_occupancy(): dezelfde
    -- som als v_session_availability; de trigger enforce_session_capacity
    -- blijft de harde grens.
    if v_session.capacity is not null
       and tmc.session_occupancy(p_session_id) >= v_session.capacity then
      return jsonb_build_object('ok', false, 'reason', 'capacity_full');
    end if;
  end if;

  -- 8. Gratis en direct definitief: status 'paid', prijs 0, geen Mollie,
  --    geen code. phone en phone_e164 beide genormaliseerd.
  insert into tmc.trial_bookings (
    session_id, name, email, phone, phone_e164,
    price_paid_cents, mollie_payment_id, status, trial_code_id, is_test,
    slot_start_at, slot_end_at, source
  ) values (
    p_session_id, v_name, v_email, v_phone, v_phone,
    0, null, 'paid', null, v_is_test,
    p_slot_start_at, v_slot_end, 'opening'
  )
  returning id, cancel_token into v_trial_id, v_cancel_token;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_booking.created', 'visitor', null, 'trial_booking', v_trial_id,
    jsonb_build_object(
      'session_id', p_session_id,
      'pillar', v_session.pillar,
      'source', 'opening',
      'price_paid_cents', 0,
      'is_test', v_is_test,
      'slot_start_at', p_slot_start_at,
      'slot_end_at', v_slot_end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'trial_booking_id', v_trial_id,
    'cancel_token', v_cancel_token,
    'session_id', p_session_id,
    'pillar', v_session.pillar,
    'session_start_at', v_session.start_at,
    'session_end_at', v_session.end_at,
    'slot_start_at', p_slot_start_at,
    'slot_end_at', v_slot_end
  );
end;
$$;

-- Publiek betekent: via de service-role client in de TS-laag, achter
-- register_opening_trial_attempt. Nooit rechtstreeks door anon of
-- authenticated.
revoke all on function tmc.book_opening_trial(uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function tmc.book_opening_trial(uuid, text, text, text, boolean, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Beschikbaarheid voor de gratis slotkiezer (weergave)
-- ---------------------------------------------------------------------------

-- Zoals vrij_trainen_visitor_availability (zelfde kwartieren, zelfde
-- telling), plus per kwartier het aantal gratis proefgasten en wat er van het
-- openingsquotum van 4 over is, in de gevraagde is_test-modus. Alleen
-- tellingen, geen persoonsgegevens. Alleen service_role.
create function tmc.vrij_trainen_opening_availability(
  p_from date,
  p_to date,
  p_is_test boolean default false
)
returns table (
  session_id uuid,
  quarter_start timestamptz,
  booked integer,
  available integer,
  blocked boolean,
  opening_booked integer,
  opening_available integer
)
language sql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
  select
    a.session_id,
    a.quarter_start,
    a.booked,
    a.available,
    a.blocked,
    o.n as opening_booked,
    greatest(4 - o.n, 0) as opening_available
  from tmc.vrij_trainen_visitor_availability(p_from, p_to) a
  cross join lateral (
    select count(*)::int as n
    from tmc.trial_bookings t
    where t.session_id = a.session_id
      and t.source = 'opening'
      and t.status in ('pending', 'paid', 'attended')
      and t.is_test = coalesce(p_is_test, false)
      and t.slot_start_at <= a.quarter_start
      and t.slot_end_at > a.quarter_start
  ) o
$function$;

revoke all on function tmc.vrij_trainen_opening_availability(date, date, boolean) from public, anon, authenticated;
grant execute on function tmc.vrij_trainen_opening_availability(date, date, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Zelfcontrole (structureel; geen app-data nodig)
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_n int;
  v_res jsonb;
begin
  -- Kolommen en constraints.
  if not exists (select 1 from information_schema.columns where table_schema = 'tmc' and table_name = 'booking_settings' and column_name = 'free_trial_start_at')
     or not exists (select 1 from information_schema.columns where table_schema = 'tmc' and table_name = 'booking_settings' and column_name = 'free_trial_end_at') then
    raise exception 'gratis_proefles_opening: periodekolommen op booking_settings ontbreken';
  end if;
  foreach v_fn in array array['source', 'phone_e164', 'reminder_sent_at'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'tmc' and table_name = 'trial_bookings' and column_name = v_fn) then
      raise exception 'gratis_proefles_opening: kolom trial_bookings.% ontbreekt', v_fn;
    end if;
  end loop;
  if exists (select 1 from pg_constraint where conrelid = 'tmc.trial_bookings'::regclass and conname = 'trial_bookings_code_is_free_check') then
    raise exception 'gratis_proefles_opening: oude constraint trial_bookings_code_is_free_check bestaat nog';
  end if;
  foreach v_fn in array array['trial_bookings_source_check', 'trial_bookings_source_consistency', 'trial_bookings_phone_e164_check'] loop
    if not exists (select 1 from pg_constraint where conrelid = 'tmc.trial_bookings'::regclass and conname = v_fn) then
      raise exception 'gratis_proefles_opening: constraint % ontbreekt', v_fn;
    end if;
  end loop;
  -- Backfill: geen rij met code zonder source code en omgekeerd.
  if exists (select 1 from tmc.trial_bookings where (source = 'code') <> (trial_code_id is not null)) then
    raise exception 'gratis_proefles_opening: backfill van source klopt niet';
  end if;

  -- Indexen.
  foreach v_fn in array array['trial_bookings_opening_email_uidx', 'trial_bookings_opening_phone_uidx', 'trial_bookings_opening_session_idx', 'trial_bookings_reminder_due_idx'] loop
    if not exists (select 1 from pg_indexes where schemaname = 'tmc' and tablename = 'trial_bookings' and indexname = v_fn) then
      raise exception 'gratis_proefles_opening: index % ontbreekt', v_fn;
    end if;
  end loop;

  -- Precies een redeem_trial_code met 7 argumenten en 2 defaults; de aanroep
  -- met zes benoemde argumenten (de productiecode) werkt.
  select count(*) into v_n from pg_proc p where p.pronamespace = 'tmc'::regnamespace and p.proname = 'redeem_trial_code';
  if v_n <> 1 then
    raise exception 'gratis_proefles_opening: % overloads van redeem_trial_code, verwacht 1', v_n;
  end if;
  if (tmc.redeem_trial_code(
        p_code => 'BESTAATNIET', p_session_id => '00000000-0000-0000-0000-000000000000'::uuid,
        p_name => 'x', p_email => 'x@test.invalid', p_phone => '1', p_is_test => true
      ) ->> 'reason') <> 'code_invalid' then
    raise exception 'gratis_proefles_opening: redeem_trial_code met zes benoemde argumenten werkt niet';
  end if;

  -- book_opening_trial: volgorde van de eerste weigeringen, zonder app-data.
  v_res := tmc.book_opening_trial('00000000-0000-0000-0000-000000000000'::uuid, '', 'x@test.invalid', '+31612345678', true);
  if v_res ->> 'reason' <> 'missing_fields' then
    raise exception 'gratis_proefles_opening: missing_fields verwacht, kreeg %', v_res;
  end if;
  v_res := tmc.book_opening_trial('00000000-0000-0000-0000-000000000000'::uuid, 'Test', 'x@test.invalid', '0612345678', true);
  if v_res ->> 'reason' <> 'invalid_phone' then
    raise exception 'gratis_proefles_opening: invalid_phone verwacht, kreeg %', v_res;
  end if;
  v_res := tmc.book_opening_trial('00000000-0000-0000-0000-000000000000'::uuid, 'Test', 'geen-adres', '+31612345678', true);
  if v_res ->> 'reason' <> 'invalid_email' then
    raise exception 'gratis_proefles_opening: invalid_email verwacht, kreeg %', v_res;
  end if;
  -- Periode staat sinds deze migratie open, dus een onbekende sessie komt tot
  -- session_not_found (de persoonschecks vinden op een lege database niets).
  v_res := tmc.book_opening_trial('00000000-0000-0000-0000-000000000000'::uuid, 'Test', 'x@test.invalid', '+31612345678', true);
  if v_res ->> 'reason' not in ('session_not_found', 'already_used', 'already_customer') then
    raise exception 'gratis_proefles_opening: session_not_found verwacht, kreeg %', v_res;
  end if;

  -- Alleen service_role: book_opening_trial, register_opening_trial_attempt,
  -- vrij_trainen_opening_availability, redeem_trial_code.
  foreach v_fn in array array[
    'tmc.book_opening_trial(uuid, text, text, text, boolean, timestamptz)',
    'tmc.register_opening_trial_attempt(text)',
    'tmc.vrij_trainen_opening_availability(date, date, boolean)',
    'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'gratis_proefles_opening: % mag niet voor anon/authenticated', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'gratis_proefles_opening: % moet voor service_role', v_fn;
    end if;
  end loop;

  -- Intern, zonder grants: de guard.
  if has_function_privilege('anon', 'tmc.guard_trial_booking_vrij_trainen()', 'execute')
     or has_function_privilege('authenticated', 'tmc.guard_trial_booking_vrij_trainen()', 'execute')
     or has_function_privilege('service_role', 'tmc.guard_trial_booking_vrij_trainen()', 'execute') then
    raise exception 'gratis_proefles_opening: guard_trial_booking_vrij_trainen mag alleen de eigenaar uitvoeren';
  end if;

  -- SECURITY DEFINER met vaste search_path.
  if exists (
    select 1 from pg_proc p
    where p.oid in (
      'tmc.book_opening_trial(uuid, text, text, text, boolean, timestamptz)'::regprocedure,
      'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)'::regprocedure,
      'tmc.vrij_trainen_opening_availability(date, date, boolean)'::regprocedure,
      'tmc.guard_trial_booking_vrij_trainen()'::regprocedure
    )
    and (not p.prosecdef or p.proconfig is null)
  ) then
    raise exception 'gratis_proefles_opening: functie zonder SECURITY DEFINER of vaste search_path';
  end if;

  -- Trigger terug, nu ook op source.
  if not exists (select 1 from pg_trigger where tgname = 'trial_bookings_guard_vrij_trainen' and tgrelid = 'tmc.trial_bookings'::regclass) then
    raise exception 'gratis_proefles_opening: trigger trial_bookings_guard_vrij_trainen ontbreekt';
  end if;

  -- Tabelrechten van de pogingenteller.
  if has_table_privilege('anon', 'tmc.opening_trial_attempts', 'select')
     or has_table_privilege('authenticated', 'tmc.opening_trial_attempts', 'select')
     or not has_table_privilege('service_role', 'tmc.opening_trial_attempts', 'insert') then
    raise exception 'gratis_proefles_opening: verkeerde rechten op opening_trial_attempts';
  end if;

  -- Geen directe route voor anon of authenticated op trial_bookings.
  if has_table_privilege('anon', 'tmc.trial_bookings', 'insert')
     or has_table_privilege('authenticated', 'tmc.trial_bookings', 'insert')
     or has_table_privilege('anon', 'tmc.trial_bookings', 'select')
     or has_table_privilege('authenticated', 'tmc.trial_bookings', 'select') then
    raise exception 'gratis_proefles_opening: anon of authenticated heeft rechten op trial_bookings';
  end if;
end $$;

commit;
