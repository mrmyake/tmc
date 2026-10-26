-- Proefcodes voor campagnes (Google Ads, code MOVENOW) plus de groepsgrootte
-- van yoga en mobility (spec-community-growth.md par. 1 "Proefcodes",
-- fix/ads-landingspaginas-movenow).
--
-- Drie dingen in een migratie, omdat ze samen in een PR uitrollen:
--
-- 1. Groepsgrootte yoga en mobility: 8 in plaats van 10. Copy en echte
--    capaciteit liepen uiteen (CLASS_CAPACITY zei 8 en 20, de database 10 en
--    12; besluit Ilja 2026-10-26: yoga en mobility 8, kettlebell 12).
--    Voorcontrole: geen enkele toekomstige yoga- of mobilityles mag al meer
--    dan 8 bezette plekken hebben, anders stopt de migratie. Daarna
--    schedule_templates, toekomstige class_sessions en class_types
--    (default_capacity) voor pillar yoga_mobility van boven de 8 naar 8.
--    Kettlebell staat al op 12 en blijft staan.
--
-- 2. Gedeelde codes met einddatum en een-per-persoon. Nieuwe kolommen op
--    trial_codes: valid_through (date, inclusief, Amsterdamse kalenderdag,
--    null = geen einddatum; geldt voor het moment van inwisselen, niet voor
--    de les), new_customers_only (alleen nieuwe klanten, dezelfde regel als
--    book_opening_trial plus: geen proefles gepland die nog niet geannuleerd
--    is) en one_per_person (een inwisseling per e-mailadres en per
--    telefoonnummer per code). Op trial_code_redemptions komen phone_e164 en
--    een kopie van de vlag (one_per_person), zodat twee partiele unique
--    indexen de regel ook op databaseniveau afdwingen; alleen voor codes met
--    de vlag, bestaande codes houden hun gedrag. Een geannuleerde boeking
--    geeft de plek terug (released_at gezet, trigger trial_bookings_release_code),
--    dus wie op tijd annuleert kan de code opnieuw gebruiken.
--    redeem_trial_code normaliseert het telefoonnummer niet zelf: de app geeft
--    E.164 door (parsePhone, libphonenumber) en de RPC weigert elke andere
--    vorm (invalid_phone), zoals book_opening_trial.
--
-- 3. IP-teller: alleen mislukte pogingen tellen. register_trial_code_attempt
--    was pessimistisch (elke controle en elke boeking telde mee, ook een
--    geslaagde) en kon bezoekers achter een gedeeld mobiel IP na tien
--    geslaagde controles blokkeren. Nu is register_trial_code_attempt alleen
--    de poortcheck (leest locked_until, schrijft niets) en telt het nieuwe
--    register_trial_code_failure de mislukte pogingen (zelfde venster van 30
--    minuten, zelfde blokkade van 15 minuten na 10 missers).
--
-- Functies herbouwd op de live definitie (pg_get_functiondef op 2026-10-26),
-- drop en recreate in een transactie met expliciet herstel van de live
-- rechten: create_trial_code voor authenticated en service_role,
-- redeem_trial_code alleen voor service_role, register_trial_code_attempt
-- en register_trial_code_failure alleen voor service_role (geen SECURITY
-- DEFINER, zoals live). create_trial_codes_batch, revoke_trial_code,
-- trial_bookings_release_code en guard_trial_booking_vrij_trainen zijn
-- ongewijzigd; een batch krijgt de nieuwe vlaggen op hun default (uit).
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Geen afhankelijkheid van app-data (README regel 6): de
-- capaciteitsupdates zijn gewone updates die op een lege shadow-database
-- nul rijen raken. Draaien met `supabase db push` na merge van de PR.

begin;

-- ---------------------------------------------------------------------------
-- 1. Groepsgrootte yoga en mobility: 10 naar 8
-- ---------------------------------------------------------------------------

do $$
declare
  v_over int;
begin
  select count(*) into v_over
  from tmc.class_sessions cs
  where cs.pillar = 'yoga_mobility'
    and cs.status = 'scheduled'
    and cs.start_at > now()
    and tmc.session_occupancy(cs.id) > 8;
  if v_over > 0 then
    raise exception 'trial_codes_shared_campaign: % toekomstige yoga/mobility-lessen hebben meer dan 8 bezette plekken; capaciteit niet verlaagd', v_over;
  end if;
end $$;

update tmc.schedule_templates st
set capacity = 8
from tmc.class_types ct
where ct.id = st.class_type_id
  and ct.pillar = 'yoga_mobility'
  and st.capacity > 8;

update tmc.class_sessions
set capacity = 8
where pillar = 'yoga_mobility'
  and status = 'scheduled'
  and start_at > now()
  and capacity > 8;

update tmc.class_types
set default_capacity = 8
where pillar = 'yoga_mobility'
  and default_capacity > 8;

-- ---------------------------------------------------------------------------
-- 2. Kolommen en indexen
-- ---------------------------------------------------------------------------

alter table tmc.trial_codes
  add column valid_through date,
  add column new_customers_only boolean not null default false,
  add column one_per_person boolean not null default false;

comment on column tmc.trial_codes.valid_through is
  'Laatste kalenderdag (Europe/Amsterdam) waarop de code ingewisseld kan worden, inclusief. Null = geen einddatum. Geldt voor het moment van inwisselen, niet voor de datum van de les.';
comment on column tmc.trial_codes.new_customers_only is
  'Alleen voor nieuwe klanten: geen profiel met een abonnement (status ongelijk aan pending) of een betaalde order op dit e-mailadres of nummer, en geen eerdere of geplande proefles (elke bron, status ongelijk aan cancelled). Zelfde regel als book_opening_trial.';
comment on column tmc.trial_codes.one_per_person is
  'Een inwisseling per e-mailadres en per telefoonnummer per code, afgedwongen in redeem_trial_code onder de rijlock op de code en door de partiele unique indexen op trial_code_redemptions. Een geannuleerde boeking geeft de plek terug.';

alter table tmc.trial_code_redemptions
  add column phone_e164 text,
  add column one_per_person boolean not null default false;

alter table tmc.trial_code_redemptions
  add constraint trial_code_redemptions_phone_e164_check
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

comment on column tmc.trial_code_redemptions.phone_e164 is
  'Telefoonnummer van de inwisseling in E.164, voor de een-per-persoon-regel. Null voor inwisselingen van voor 2026-10-26.';
comment on column tmc.trial_code_redemptions.one_per_person is
  'Kopie van trial_codes.one_per_person op het moment van inwisselen; alleen deze rijen vallen onder de unique indexen per code.';

create unique index trial_code_redemptions_code_email_once_idx
  on tmc.trial_code_redemptions (code_id, email_normalized)
  where released_at is null and one_per_person;

create unique index trial_code_redemptions_code_phone_once_idx
  on tmc.trial_code_redemptions (code_id, phone_e164)
  where released_at is null and one_per_person and phone_e164 is not null;

-- ---------------------------------------------------------------------------
-- 3. Functies die veranderen weg (grants eerst, dan drop)
-- ---------------------------------------------------------------------------

revoke all on function tmc.create_trial_code(text, text, integer, text) from public, anon, authenticated, service_role;
drop function tmc.create_trial_code(text, text, integer, text);

revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated, service_role;
drop function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz);

revoke all on function tmc.register_trial_code_attempt(text) from public, anon, authenticated, service_role;
drop function tmc.register_trial_code_attempt(text);

-- ---------------------------------------------------------------------------
-- 4. create_trial_code (admin): einddatum en de twee vlaggen
--    (live definitie via pg_get_functiondef op 2026-10-26; nieuw zijn de
--    drie parameters, de check op een einddatum in het verleden, de insert,
--    het event en de return; live rechten: authenticated en service_role)
-- ---------------------------------------------------------------------------

create function tmc.create_trial_code(
  p_code text,
  p_label text,
  p_max_uses integer,
  p_scope text default 'group',
  p_valid_through date default null,
  p_new_customers_only boolean default false,
  p_one_per_person boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  -- Zonder 0, O, 1, I en L: voorleesbaar en overtypbaar.
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_uid uuid := auth.uid();
  v_label text := trim(coalesce(p_label, ''));
  v_scope text := coalesce(p_scope, 'group');
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_new_only boolean := coalesce(p_new_customers_only, false);
  v_one_pp boolean := coalesce(p_one_per_person, false);
  v_generated boolean := false;
  v_attempts int := 0;
  v_row tmc.trial_codes%rowtype;
  j int;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;

  -- Verwachte weigeringen als jsonb-reason, geen exceptions
  -- (conventie book_class_session).
  if v_label = '' then
    return jsonb_build_object('ok', false, 'reason', 'label_required');
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    return jsonb_build_object('ok', false, 'reason', 'max_uses_invalid');
  end if;
  if v_scope not in ('yoga_mobility', 'kettlebell', 'group', 'vrij_trainen', 'all') then
    return jsonb_build_object('ok', false, 'reason', 'scope_invalid');
  end if;
  -- Een einddatum die al voorbij is levert een code op die nooit werkt.
  if p_valid_through is not null
     and p_valid_through < (now() at time zone 'Europe/Amsterdam')::date then
    return jsonb_build_object('ok', false, 'reason', 'valid_through_past');
  end if;

  if v_code = '' then
    v_generated := true;
    loop
      v_code := '';
      for j in 1..8 loop
        v_code := v_code || substr(c_alphabet, 1 + floor(random() * length(c_alphabet))::int, 1);
      end loop;
      exit when not exists (select 1 from tmc.trial_codes where code = v_code);
      v_attempts := v_attempts + 1;
      if v_attempts > 50 then
        raise exception 'trial_code collision storm';
      end if;
    end loop;
  else
    if v_code !~ '^[A-Z0-9]{4,32}$' then
      return jsonb_build_object('ok', false, 'reason', 'code_invalid');
    end if;
    if exists (select 1 from tmc.trial_codes where code = v_code) then
      return jsonb_build_object('ok', false, 'reason', 'code_exists');
    end if;
  end if;

  insert into tmc.trial_codes (
    code, label, max_uses, scope, created_by,
    valid_through, new_customers_only, one_per_person
  )
  values (
    v_code, v_label, p_max_uses, v_scope, v_uid,
    p_valid_through, v_new_only, v_one_pp
  )
  returning * into v_row;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.created', 'admin', v_uid, 'trial_code', v_row.id,
    jsonb_build_object(
      'code_id', v_row.id,
      'max_uses', p_max_uses,
      'scope', v_scope,
      'generated', v_generated,
      'valid_through', p_valid_through,
      'new_customers_only', v_new_only,
      'one_per_person', v_one_pp
    )
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'code', v_row.code,
    'label', v_row.label,
    'max_uses', v_row.max_uses,
    'scope', v_row.scope,
    'created_at', v_row.created_at,
    'valid_through', v_row.valid_through,
    'new_customers_only', v_row.new_customers_only,
    'one_per_person', v_row.one_per_person
  );
end;
$$;

revoke execute on function tmc.create_trial_code(text, text, integer, text, date, boolean, boolean) from public, anon;
grant execute on function tmc.create_trial_code(text, text, integer, text, date, boolean, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. redeem_trial_code (publiek, via service_role): einddatum, nieuwe
--    klanten, een per persoon, telefoonnummer in E.164
--    (live definitie via pg_get_functiondef op 2026-10-26; de slot- en
--    les-paden, de locks, de capaciteitstelling, het misbruiksignaal en de
--    return-vorm zijn ongewijzigd; live rechten: alleen service_role)
-- ---------------------------------------------------------------------------

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
  v_is_test boolean := coalesce(p_is_test, false);
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
  -- Slot-pad (vrij trainen) of les-pad: hangt bij scope all af van de pillar.
  v_is_vrij boolean;
begin
  if v_code_norm = '' or v_name = '' or v_email = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;
  -- Zelfde grenzen als book_opening_trial: de app normaliseert het nummer
  -- met libphonenumber naar E.164, dit is de server-side grens. Het nummer
  -- gaat zo de een-per-persoon-regel en phone_e164 in.
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  -- Lock de code-rij: serialiseert gelijktijdig inwisselen, zodat
  -- uses_count nooit boven max_uses uitkomt en de een-per-persoon-check
  -- per code race-vrij is.
  select * into v_tc
  from tmc.trial_codes
  where code = v_code_norm
  for update;

  -- Bestaat niet, ingetrokken, op en verlopen krijgen dezelfde reason: de
  -- bezoeker mag niet kunnen afleiden welke codes bestaan. De einddatum is
  -- een Amsterdamse kalenderdag, inclusief, en geldt voor het moment van
  -- inwisselen.
  if not found
     or v_tc.revoked_at is not null
     or (v_tc.max_uses is not null and v_tc.uses_count >= v_tc.max_uses)
     or (v_tc.valid_through is not null
         and (now() at time zone 'Europe/Amsterdam')::date > v_tc.valid_through) then
    return jsonb_build_object('ok', false, 'reason', 'code_invalid');
  end if;

  -- Serialiseer per persoon (zelfde sleutels als book_opening_trial): eerst
  -- e-mail, dan telefoon. Na de code-lock en voor de sessie-lock.
  perform pg_advisory_xact_lock(hashtext('opening_trial_email'), hashtext(v_email));
  perform pg_advisory_xact_lock(hashtext('opening_trial_phone'), hashtext(v_phone));

  -- Alleen nieuwe klanten: een profiel (zelfde is_test-modus) met dit adres
  -- of nummer dat een abonnement (status ongelijk aan pending) of een
  -- betaalde order heeft, of een proefles van welke bron ook die nog niet
  -- geannuleerd is (gepland, gehad of niet komen opdagen). Op tijd
  -- geannuleerd telt niet.
  if v_tc.new_customers_only then
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
    ) or exists (
      select 1
      from tmc.trial_bookings tb
      where tb.is_test = v_is_test
        and (
          lower(trim(tb.email)) = v_email
          or tb.phone_e164 = v_phone
          or trim(tb.phone) = v_phone
        )
        and tb.status <> 'cancelled'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'already_customer');
    end if;
  end if;

  -- Een per persoon per code: een openstaande inwisseling van deze code op
  -- dit adres of dit nummer. Los van is_test, net als de unique indexen die
  -- dit als backstop afdwingen.
  if v_tc.one_per_person and exists (
    select 1 from tmc.trial_code_redemptions r
    where r.code_id = v_tc.id
      and r.released_at is null
      and (r.email_normalized = v_email or r.phone_e164 = v_phone)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_used_code');
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

  -- Scope vrij_trainen volgt altijd het slot-pad (en eist daarin een
  -- vrij-trainen-sessie); scope all volgt het slot-pad alleen op een
  -- vrij-trainen-sessie en anders exact het les-pad.
  v_is_vrij := v_tc.scope = 'vrij_trainen'
    or (v_tc.scope = 'all' and v_session.pillar = 'vrij_trainen');

  if v_is_vrij then
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
    -- v2-gedrag); all volgt hier dezelfde regel als group. De lijst in de UI
    -- is alleen weergave.
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

  if v_is_vrij then
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
    if not v_is_test and v_peak >= v_max then
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
  -- betaalde proefles (trialBookingMode()). phone en phone_e164 beide E.164.
  insert into tmc.trial_bookings (
    session_id, name, email, phone, phone_e164,
    price_paid_cents, mollie_payment_id, status, trial_code_id, is_test,
    slot_start_at, slot_end_at, source
  ) values (
    p_session_id, v_name, v_email, v_phone, v_phone,
    0, null, 'paid', v_tc.id, v_is_test,
    p_slot_start_at, v_slot_end, 'code'
  )
  returning id, cancel_token into v_trial_id, v_cancel_token;

  insert into tmc.trial_code_redemptions (
    code_id, trial_booking_id, session_id, email_normalized, phone_e164, one_per_person
  )
  values (v_tc.id, v_trial_id, p_session_id, v_email, v_phone, v_tc.one_per_person)
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

revoke execute on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 6. IP-teller: poortcheck zonder schrijven, en een aparte teller voor
--    mislukte pogingen (live definitie van register_trial_code_attempt via
--    pg_get_functiondef op 2026-10-26; geen SECURITY DEFINER, search_path
--    tmc, rechten alleen service_role, allemaal zoals live)
-- ---------------------------------------------------------------------------

create function tmc.register_trial_code_attempt(p_ip text)
returns jsonb
language plpgsql
set search_path to 'tmc'
as $$
declare
  v_now timestamptz := now();
  v_locked timestamptz;
begin
  -- Alleen lezen: staat dit IP op slot? Een geslaagde controle of boeking
  -- laat geen spoor achter; alleen register_trial_code_failure schrijft.
  select locked_until into v_locked
  from tmc.trial_code_attempts
  where ip = p_ip;

  if v_locked is not null and v_locked > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', ceil(extract(epoch from (v_locked - v_now)))::int
    );
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;

revoke execute on function tmc.register_trial_code_attempt(text) from public, anon, authenticated;
grant execute on function tmc.register_trial_code_attempt(text) to service_role;

create function tmc.register_trial_code_failure(p_ip text)
returns jsonb
language plpgsql
set search_path to 'tmc'
as $$
declare
  v_now timestamptz := now();
  v_row tmc.trial_code_attempts%rowtype;
begin
  -- Upsert met no-op update: zorgt dat de rij bestaat en pakt de row-lock,
  -- zodat de rest race-vrij is tegen parallelle pogingen.
  insert into tmc.trial_code_attempts as a (ip)
  values (p_ip)
  on conflict (ip) do update set ip = excluded.ip
  returning * into v_row;

  -- Verlopen lockout of dertig minuten zonder missers: vers venster.
  if (v_row.locked_until is not null and v_row.locked_until <= v_now)
     or v_now - v_row.updated_at > interval '30 minutes' then
    v_row.fail_count := 0;
  end if;

  v_row.fail_count := v_row.fail_count + 1;

  update tmc.trial_code_attempts
  set fail_count = v_row.fail_count,
      window_start = case when v_row.fail_count = 1 then v_now else window_start end,
      locked_until = case when v_row.fail_count >= 10 then v_now + interval '15 minutes' else null end,
      updated_at = v_now
  where ip = p_ip;

  return jsonb_build_object(
    'fail_count', v_row.fail_count,
    'locked', v_row.fail_count >= 10
  );
end;
$$;

revoke execute on function tmc.register_trial_code_failure(text) from public, anon, authenticated;
grant execute on function tmc.register_trial_code_failure(text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Grants, definities en kolommen asserteren
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_service_only text[] := array[
    'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)',
    'tmc.register_trial_code_attempt(text)',
    'tmc.register_trial_code_failure(text)'
  ];
begin
  -- Admin-RPC: authenticated en service_role, nooit anon.
  v_fn := 'tmc.create_trial_code(text, text, integer, text, date, boolean, boolean)';
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'trial_codes_shared_campaign: % mag niet voor anon', v_fn;
  end if;
  if not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'trial_codes_shared_campaign: % moet voor authenticated en service_role', v_fn;
  end if;

  -- Alleen service_role: de publieke paden.
  foreach v_fn in array v_service_only loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'trial_codes_shared_campaign: % mag niet voor anon/authenticated', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'trial_codes_shared_campaign: % moet voor service_role', v_fn;
    end if;
  end loop;

  -- De oude signatuur van create_trial_code bestaat niet meer.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tmc' and p.proname = 'create_trial_code'
      and pg_get_function_identity_arguments(p.oid) = 'p_code text, p_label text, p_max_uses integer, p_scope text'
  ) then
    raise exception 'trial_codes_shared_campaign: oude create_trial_code(text, text, integer, text) staat er nog';
  end if;

  -- SECURITY DEFINER met vaste search_path voor de twee definer-functies;
  -- de twee tellerfuncties bewust zonder definer (zoals live), wel met
  -- vaste search_path.
  if exists (
    select 1 from pg_proc p
    where p.oid in (
      'tmc.create_trial_code(text, text, integer, text, date, boolean, boolean)'::regprocedure,
      'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)'::regprocedure
    )
    and (not p.prosecdef or p.proconfig is null)
  ) then
    raise exception 'trial_codes_shared_campaign: definer-functie zonder SECURITY DEFINER of vaste search_path';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.oid in (
      'tmc.register_trial_code_attempt(text)'::regprocedure,
      'tmc.register_trial_code_failure(text)'::regprocedure
    )
    and (p.prosecdef or p.proconfig is null)
  ) then
    raise exception 'trial_codes_shared_campaign: tellerfunctie met SECURITY DEFINER of zonder vaste search_path';
  end if;

  -- Kolommen en indexen.
  if (select count(*) from information_schema.columns
      where table_schema = 'tmc' and table_name = 'trial_codes'
        and column_name in ('valid_through', 'new_customers_only', 'one_per_person')) <> 3 then
    raise exception 'trial_codes_shared_campaign: kolommen op trial_codes ontbreken';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'tmc' and table_name = 'trial_code_redemptions'
        and column_name in ('phone_e164', 'one_per_person')) <> 2 then
    raise exception 'trial_codes_shared_campaign: kolommen op trial_code_redemptions ontbreken';
  end if;
  if (select count(*) from pg_indexes
      where schemaname = 'tmc' and tablename = 'trial_code_redemptions'
        and indexname in ('trial_code_redemptions_code_email_once_idx', 'trial_code_redemptions_code_phone_once_idx')) <> 2 then
    raise exception 'trial_codes_shared_campaign: unique indexen op trial_code_redemptions ontbreken';
  end if;

  -- Geen yoga- of mobilitycapaciteit boven de 8 meer in templates,
  -- toekomstige lessen en lestypes.
  if exists (
    select 1 from tmc.schedule_templates st join tmc.class_types ct on ct.id = st.class_type_id
    where ct.pillar = 'yoga_mobility' and st.capacity > 8
  ) or exists (
    select 1 from tmc.class_sessions
    where pillar = 'yoga_mobility' and status = 'scheduled' and start_at > now() and capacity > 8
  ) or exists (
    select 1 from tmc.class_types where pillar = 'yoga_mobility' and default_capacity > 8
  ) then
    raise exception 'trial_codes_shared_campaign: yoga/mobility-capaciteit boven de 8 blijft staan';
  end if;
end $$;

commit;
