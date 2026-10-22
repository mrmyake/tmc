-- Proefcodes met scope all: geldig op groepslessen en op vrij trainen
-- (spec-community-growth.md par. 1 "Scope en batch", spec-vrij-trainen-slots.md
-- "Proefuren via een proefcode").
--
-- Een code met scope all laat de bezoeker zelf kiezen: een groepsles (elke
-- les die als proefles boekbaar is, zoals bij group) of een uur vrij trainen
-- (vast 60 minuten, binnen de aanwezigheid van Marlon, telt mee voor het
-- maximum tegelijk, zoals bij vrij_trainen). Nog steeds precies een gratis
-- proefboeking per gebruik; max_uses, uses_count, revoke, redemptions en het
-- misbruiksignaal (prior_free_count) zijn ongewijzigd.
--
-- Ontwerpbesluiten:
-- - redeem_trial_code kiest het slot-pad of het les-pad via een lokale
--   variabele v_is_vrij: scope vrij_trainen, of scope all op een sessie met
--   pillar vrij_trainen. Scope vrij_trainen eist nog steeds een
--   vrij-trainen-sessie (scope_mismatch); scope all op een groepsles volgt
--   exact het bestaande group-pad. Geen wijziging in reason-codes, locks,
--   lockvolgorde of return-vorm.
-- - guard_trial_booking_vrij_trainen accepteert een codeboeking op vrij
--   trainen bij scope vrij_trainen of all; alleen de scope-check en de twee
--   hint-teksten wijzigen.
-- - create_trial_code en create_trial_codes_batch: all toegestaan; default
--   blijft group.
-- - Alle vier de functies zijn herbouwd op de live definitie
--   (pg_get_functiondef op 2026-10-21, md5 van prosrc identiek aan de
--   repo-bestanden 20261002130000 en 20261011120000), met drop en recreate
--   in een transactie en expliciet herstel van de live rechten:
--   create_trial_code en create_trial_codes_batch voor authenticated en
--   service_role, redeem_trial_code alleen voor service_role, de guard voor
--   niemand (alleen de eigenaar).
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Geen afhankelijkheid van app-data (README regel 6). Draaien
-- met `supabase db push` na merge van de PR.

begin;

-- ---------------------------------------------------------------------------
-- 1. Functies en trigger die veranderen weg (grants eerst, dan drop)
-- ---------------------------------------------------------------------------

revoke all on function tmc.create_trial_code(text, text, integer, text) from public, anon, authenticated, service_role;
drop function tmc.create_trial_code(text, text, integer, text);

revoke all on function tmc.create_trial_codes_batch(integer, text, integer, text) from public, anon, authenticated, service_role;
drop function tmc.create_trial_codes_batch(integer, text, integer, text);

revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated, service_role;
drop function tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz);

drop trigger trial_bookings_guard_vrij_trainen on tmc.trial_bookings;
revoke all on function tmc.guard_trial_booking_vrij_trainen() from public, anon, authenticated, service_role;
drop function tmc.guard_trial_booking_vrij_trainen();

-- ---------------------------------------------------------------------------
-- 2. Constraint: all erbij
-- ---------------------------------------------------------------------------

alter table tmc.trial_codes drop constraint trial_codes_scope_check;
alter table tmc.trial_codes
  add constraint trial_codes_scope_check
  check (scope in ('yoga_mobility', 'kettlebell', 'group', 'vrij_trainen', 'all'));

comment on column tmc.trial_codes.scope is
  'Waarvoor de code geldt: yoga_mobility, kettlebell, group (alle groepslessen, dus elke pillar behalve vrij_trainen), vrij_trainen, of all (een groepsles of een uur vrij trainen, naar keuze van de bezoeker). Wordt bij het inwisselen opnieuw gecontroleerd in redeem_trial_code.';

-- ---------------------------------------------------------------------------
-- 3. create_trial_code (admin): all toegestaan
--    (live definitie via pg_get_functiondef op 2026-10-21; alleen de
--    scope-lijst wijzigt; live rechten: authenticated en service_role)
-- ---------------------------------------------------------------------------

create function tmc.create_trial_code(
  p_code text,
  p_label text,
  p_max_uses integer,
  p_scope text default 'group'
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

  insert into tmc.trial_codes (code, label, max_uses, scope, created_by)
  values (v_code, v_label, p_max_uses, v_scope, v_uid)
  returning * into v_row;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.created', 'admin', v_uid, 'trial_code', v_row.id,
    jsonb_build_object(
      'code_id', v_row.id,
      'max_uses', p_max_uses,
      'scope', v_scope,
      'generated', v_generated
    )
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'code', v_row.code,
    'label', v_row.label,
    'max_uses', v_row.max_uses,
    'scope', v_row.scope,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function tmc.create_trial_code(text, text, integer, text) from public, anon;
grant execute on function tmc.create_trial_code(text, text, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. create_trial_codes_batch (admin): all toegestaan
--    (live definitie via pg_get_functiondef op 2026-10-21; alleen de
--    scope-lijst wijzigt; live rechten: authenticated en service_role)
-- ---------------------------------------------------------------------------

create function tmc.create_trial_codes_batch(
  p_count integer,
  p_label text,
  p_max_uses integer,
  p_scope text
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_uid uuid := auth.uid();
  v_label text := trim(coalesce(p_label, ''));
  v_scope text := coalesce(p_scope, 'group');
  v_batch uuid := gen_random_uuid();
  v_code text;
  v_attempts int;
  v_inserted uuid;
  i int;
  j int;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;

  -- Alles valideren vóór de eerste insert; de hele batch is een
  -- transactie: alle codes of geen.
  if p_count is null or p_count < 1 or p_count > 50 then
    return jsonb_build_object('ok', false, 'reason', 'count_invalid');
  end if;
  if v_label = '' then
    return jsonb_build_object('ok', false, 'reason', 'label_required');
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    return jsonb_build_object('ok', false, 'reason', 'max_uses_invalid');
  end if;
  if v_scope not in ('yoga_mobility', 'kettlebell', 'group', 'vrij_trainen', 'all') then
    return jsonb_build_object('ok', false, 'reason', 'scope_invalid');
  end if;

  for i in 1..p_count loop
    -- Botsingsconventie: loop met teller, harde grens 50 pogingen per code.
    -- on conflict do nothing vangt ook een gelijktijdige batch op die
    -- dezelfde code net eerder commit.
    v_attempts := 0;
    loop
      v_code := '';
      for j in 1..8 loop
        v_code := v_code || substr(c_alphabet, 1 + floor(random() * length(c_alphabet))::int, 1);
      end loop;
      insert into tmc.trial_codes (code, label, max_uses, scope, batch_id, created_by)
      values (v_code, v_label, p_max_uses, v_scope, v_batch, v_uid)
      on conflict (code) do nothing
      returning id into v_inserted;
      exit when v_inserted is not null;
      v_attempts := v_attempts + 1;
      if v_attempts > 50 then
        raise exception 'trial_code collision storm';
      end if;
    end loop;
  end loop;

  -- Een event per batch, niet per code.
  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.batch_created', 'admin', v_uid, 'trial_code_batch', v_batch,
    jsonb_build_object(
      'batch_id', v_batch,
      'count', p_count,
      'max_uses', p_max_uses,
      'scope', v_scope
    )
  );

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch,
    'codes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'code', t.code,
        'label', t.label,
        'max_uses', t.max_uses,
        'scope', t.scope,
        'created_at', t.created_at
      ) order by t.code), '[]'::jsonb)
      from tmc.trial_codes t
      where t.batch_id = v_batch
    )
  );
end;
$$;

revoke all on function tmc.create_trial_codes_batch(integer, text, integer, text) from public, anon;
grant execute on function tmc.create_trial_codes_batch(integer, text, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. redeem_trial_code: slot-pad of les-pad via v_is_vrij
--    (live definitie via pg_get_functiondef op 2026-10-21; alleen de twee
--    vertakkingen op scope wijzigen; live rechten: service_role)
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
-- 6. Guard op trial_bookings: codeboeking op vrij trainen bij scope
--    vrij_trainen of all (live definitie via pg_get_functiondef op
--    2026-10-21; alleen de scope-check en de hints wijzigen; geen grants aan
--    wie dan ook, zoals live)
-- ---------------------------------------------------------------------------

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

  -- Alleen gratis: via een code met scope vrij_trainen of all, of als gratis
  -- proefles in de openingsperiode (source opening, geen code). Een betaalde
  -- proefboeking op vrij trainen blijft onmogelijk.
  if new.price_paid_cents <> 0 or new.mollie_payment_id is not null then
    raise exception 'session_not_eligible' using errcode = 'P0001',
      hint = 'Vrij trainen is voor proefbezoekers alleen gratis te boeken.';
  end if;
  if new.source = 'code' then
    if new.trial_code_id is null
       or not exists (
         select 1 from tmc.trial_codes c
         where c.id = new.trial_code_id and c.scope in ('vrij_trainen', 'all')
       ) then
      raise exception 'session_not_eligible' using errcode = 'P0001',
        hint = 'Vrij trainen is voor proefbezoekers alleen gratis te boeken met een proefcode met scope vrij trainen of alles.';
    end if;
  elsif new.source <> 'opening' then
    raise exception 'session_not_eligible' using errcode = 'P0001',
      hint = 'Vrij trainen is voor proefbezoekers alleen te boeken met een proefcode met scope vrij trainen of alles, of als gratis proefles in de openingsperiode.';
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
-- 7. Grants en definities asserteren
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_admin_fns text[] := array[
    'tmc.create_trial_code(text, text, integer, text)',
    'tmc.create_trial_codes_batch(integer, text, integer, text)'
  ];
begin
  -- Admin-RPC's: authenticated en service_role, nooit anon.
  foreach v_fn in array v_admin_fns loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'trial_codes_scope_all: % mag niet voor anon', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'trial_codes_scope_all: % moet voor authenticated en service_role', v_fn;
    end if;
  end loop;

  -- Alleen service_role: redeem_trial_code.
  v_fn := 'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)';
  if has_function_privilege('anon', v_fn, 'execute')
     or has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'trial_codes_scope_all: % mag niet voor anon/authenticated', v_fn;
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'trial_codes_scope_all: % moet voor service_role', v_fn;
  end if;

  -- Intern, zonder grants: de guard.
  if has_function_privilege('anon', 'tmc.guard_trial_booking_vrij_trainen()', 'execute')
     or has_function_privilege('authenticated', 'tmc.guard_trial_booking_vrij_trainen()', 'execute')
     or has_function_privilege('service_role', 'tmc.guard_trial_booking_vrij_trainen()', 'execute') then
    raise exception 'trial_codes_scope_all: guard_trial_booking_vrij_trainen mag alleen de eigenaar uitvoeren';
  end if;

  -- Alle vier blijven SECURITY DEFINER met vaste search_path.
  if exists (
    select 1 from pg_proc p
    where p.oid in (
      'tmc.create_trial_code(text, text, integer, text)'::regprocedure,
      'tmc.create_trial_codes_batch(integer, text, integer, text)'::regprocedure,
      'tmc.redeem_trial_code(text, uuid, text, text, text, boolean, timestamptz)'::regprocedure,
      'tmc.guard_trial_booking_vrij_trainen()'::regprocedure
    )
    and (not p.prosecdef or p.proconfig is null)
  ) then
    raise exception 'trial_codes_scope_all: functie zonder SECURITY DEFINER of vaste search_path';
  end if;

  -- Trigger terug, met dezelfde kolommen.
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trial_bookings_guard_vrij_trainen' and tgrelid = 'tmc.trial_bookings'::regclass
  ) then
    raise exception 'trial_codes_scope_all: trigger trial_bookings_guard_vrij_trainen ontbreekt';
  end if;

  -- Constraint kent all; default blijft group.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tmc.trial_codes'::regclass and conname = 'trial_codes_scope_check'
      and pg_get_constraintdef(oid) like '%''all''%'
  ) then
    raise exception 'trial_codes_scope_all: trial_codes_scope_check kent all niet';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'tmc' and table_name = 'trial_codes' and column_name = 'scope')
     is distinct from '''group''::text' then
    raise exception 'trial_codes_scope_all: scope heeft niet de default group';
  end if;
end $$;

commit;
