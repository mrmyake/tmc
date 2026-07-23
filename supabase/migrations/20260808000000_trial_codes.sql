-- Trial-codes (PR B, community-growth §1 derde tak): Marlon genereert
-- batches unieke codes voor één gratis groepsles. Een code is eenmalig,
-- voor één persoon, 28 dagen geldig vanaf aanmaak, en optioneel beperkt
-- tot één pillar (yoga_mobility of kettlebell; null = elke groepsles).
--
-- Ontwerpbesluiten:
-- - Een verzilverde code produceert een GEWONE tmc.trial_bookings-rij met
--   price_paid_cents = 0 en mollie_payment_id = null. Geen tweede
--   boekingstabel; daardoor telt een codeboeking automatisch mee in
--   v_session_availability (die trial_bookings pending/paid/attended al
--   optelt in spots_available) en in het bestaande annuleerpad.
-- - Geen status 'expired': verlopen is afgeleid uit expires_at <= now().
--   Zo kan een geannuleerde boeking de code alleen heractiveren zolang
--   het venster nog open staat, zonder cron of extra statusbeheer.
-- - Geen no-show-registratie voor codehouders (gratis, geen account,
--   niets om een strike aan te hangen).
-- - RLS zoals trial_bookings: table-grants uitsluitend aan service_role,
--   RLS aan met alleen een is_admin() ALL-policy. anon en authenticated
--   hebben geen enkele table-grant, dus enumeratie van codes via
--   PostgREST is onmogelijk; het enige publieke pad is de RPC
--   redeem_trial_code, en die is alleen aan service_role gegund.
-- - De annuleer-teruggave (punt 6) zit als trigger op trial_bookings,
--   niet in de TS-laag: het bestaande annuleerpad (cancelTrialBooking in
--   src/lib/actions/trial-booking.ts) is een service-role update naar
--   status 'cancelled', en een trigger vangt dat pad plus elk toekomstig
--   annuleerpad atomair, zonder TS-wijziging in deze PR.
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Raakt book_class_session en v_session_availability niet.

-- 1. Tabel ------------------------------------------------------------------

create table tmc.trial_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code = upper(code)),
  pillar text
    check (pillar is null or pillar in ('yoga_mobility', 'kettlebell')),
  batch_id uuid not null,
  batch_label text,
  created_by uuid not null references tmc.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active'
    check (status in ('active', 'redeemed', 'revoked')),
  redeemed_at timestamptz,
  trial_booking_id uuid references tmc.trial_bookings(id) on delete set null
);

comment on table tmc.trial_codes is
  'Eenmalige codes voor één gratis groepsles (proefles). Verzilveren produceert een gewone trial_bookings-rij met price_paid_cents = 0. Verlopen is afgeleid (expires_at <= now()), geen aparte status.';
comment on column tmc.trial_codes.pillar is
  'Beperkt de code tot één pillar; null = elke groepsles (yoga_mobility of kettlebell).';
comment on column tmc.trial_codes.batch_id is
  'Eén uuid per generate_trial_codes-aanroep, ook bij één code. Basis voor batch-revoke en het batch-event.';

create index trial_codes_batch_id_idx on tmc.trial_codes (batch_id);
create index trial_codes_status_idx on tmc.trial_codes (status);

-- Zelfde grant-model als trial_bookings: uitsluitend service_role, plus
-- RLS met alleen een admin-policy als tweede laag.
revoke all on table tmc.trial_codes from public, anon, authenticated;
grant all on table tmc.trial_codes to service_role;

alter table tmc.trial_codes enable row level security;

create policy trial_codes_admin_all on tmc.trial_codes
  for all using (tmc.is_admin()) with check (tmc.is_admin());

-- 2. Koppeling op trial_bookings -------------------------------------------

alter table tmc.trial_bookings
  add column trial_code_id uuid references tmc.trial_codes(id);

comment on column tmc.trial_bookings.trial_code_id is
  'Gezet wanneer deze boeking via redeem_trial_code is ontstaan (price_paid_cents = 0, mollie_payment_id null). Null voor betaalde proeflessen.';

-- 3. Batch genereren (admin) ------------------------------------------------

create or replace function tmc.generate_trial_codes(
  p_count int,
  p_pillar text default null,
  p_label text default null,
  p_valid_days int default 28
) returns setof tmc.trial_codes
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  -- Zonder O, 0, I en 1: voorleesbaar en overtypbaar.
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_uid uuid := auth.uid();
  v_batch uuid := gen_random_uuid();
  v_expires timestamptz;
  v_code text;
  v_attempts int;
  i int;
  j int;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;

  -- Alles valideren vóór de eerste insert; de hele batch is één
  -- transactie: 30 codes of 0, nooit 17.
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'p_count moet tussen 1 en 50 liggen.';
  end if;
  if p_pillar is not null and p_pillar not in ('yoga_mobility', 'kettlebell') then
    raise exception 'Ongeldige pillar: %', p_pillar;
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 365 then
    raise exception 'p_valid_days moet tussen 1 en 365 liggen.';
  end if;

  v_expires := now() + make_interval(days => p_valid_days);

  for i in 1..p_count loop
    -- Botsingsconventie uit handle_new_auth_user: loop met exit when not
    -- exists, teller, harde grens 50 pogingen. Per code, niet per batch.
    v_attempts := 0;
    loop
      v_code := '';
      for j in 1..8 loop
        v_code := v_code
          || substr(c_alphabet, 1 + floor(random() * 32)::int, 1);
      end loop;
      exit when not exists (
        select 1 from tmc.trial_codes where code = v_code
      );
      v_attempts := v_attempts + 1;
      if v_attempts > 50 then
        raise exception 'trial_code collision storm';
      end if;
    end loop;

    insert into tmc.trial_codes (code, pillar, batch_id, batch_label, created_by, expires_at)
    values (v_code, p_pillar, v_batch, p_label, v_uid, v_expires);
  end loop;

  -- Eén event per batch, niet N losse events.
  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.batch_created', 'admin', v_uid, 'trial_code_batch', v_batch,
    jsonb_build_object(
      'batch_id', v_batch,
      'count', p_count,
      'pillar', p_pillar,
      'label', p_label,
      'valid_days', p_valid_days,
      'expires_at', v_expires
    )
  );

  return query
    select * from tmc.trial_codes
    where batch_id = v_batch
    order by code;
end;
$$;

revoke execute on function tmc.generate_trial_codes(int, text, text, int) from public, anon;
grant execute on function tmc.generate_trial_codes(int, text, text, int) to authenticated, service_role;

-- 4. Verzilveren (publiek, via de service-role client) ----------------------

create or replace function tmc.redeem_trial_code(
  p_code text,
  p_session_id uuid,
  p_name text,
  p_email text,
  p_phone text
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_code_norm text := upper(trim(coalesce(p_code, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
  v_tc tmc.trial_codes%rowtype;
  v_session tmc.class_sessions%rowtype;
  v_taken int;
  v_trial_id uuid;
  v_cancel_token uuid;
begin
  -- Verwachte weigeringen als jsonb-reason, geen exceptions
  -- (conventie book_class_session).
  if v_code_norm = '' or v_name = '' or v_email = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;

  -- Lock de code-rij: serialiseert dubbel verzilveren van dezelfde code.
  select * into v_tc
  from tmc.trial_codes
  where code = v_code_norm
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'code_not_found');
  end if;
  if v_tc.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'code_not_active');
  end if;
  if v_tc.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'code_expired');
  end if;

  -- Lock de sessie-rij: pint status/capaciteit vast, zelfde patroon als
  -- book_class_session.
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
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;
  if v_tc.pillar is not null and v_tc.pillar <> v_session.pillar then
    return jsonb_build_object('ok', false, 'reason', 'pillar_mismatch');
  end if;

  -- Capaciteit hertellen onder de sessie-lock, dezelfde optelling als
  -- v_session_availability: leden-boekingen plus trial-boekingen.
  -- capacity null = onbeperkt (alleen kettlebell): nooit vol.
  if v_session.capacity is not null then
    select
      (select count(*) from tmc.bookings
        where session_id = p_session_id and status = 'booked')
      + (select count(*) from tmc.trial_bookings
        where session_id = p_session_id
          and status in ('pending', 'paid', 'attended'))
    into v_taken;

    if v_taken >= v_session.capacity then
      return jsonb_build_object('ok', false, 'reason', 'capacity_full');
    end if;
  end if;

  -- Gratis en direct definitief: status 'paid' (er is geen betaling om
  -- op te wachten), price 0, geen Mollie-payment. cancel_token via de
  -- kolom-default, zoals elke trial_booking.
  insert into tmc.trial_bookings (
    session_id, name, email, phone,
    price_paid_cents, mollie_payment_id, status, trial_code_id
  ) values (
    p_session_id, v_name, v_email, v_phone,
    0, null, 'paid', v_tc.id
  )
  returning id, cancel_token into v_trial_id, v_cancel_token;

  update tmc.trial_codes
  set status = 'redeemed',
      redeemed_at = now(),
      trial_booking_id = v_trial_id
  where id = v_tc.id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.redeemed', 'visitor', null, 'trial_code', v_tc.id,
    jsonb_build_object(
      'code_id', v_tc.id,
      'batch_id', v_tc.batch_id,
      'trial_booking_id', v_trial_id,
      'session_id', p_session_id,
      'pillar', v_session.pillar
    )
  );

  return jsonb_build_object(
    'ok', true,
    'trial_booking_id', v_trial_id,
    'cancel_token', v_cancel_token,
    'code_id', v_tc.id,
    'session_id', p_session_id,
    'pillar', v_session.pillar,
    'session_start_at', v_session.start_at
  );
end;
$$;

-- Publiek betekent hier: via de service-role client in de TS-laag. Niet
-- rechtstreeks door anon/authenticated aanroepbaar, zodat codes ook via
-- de RPC niet online ge-bruteforcet kunnen worden.
revoke execute on function tmc.redeem_trial_code(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function tmc.redeem_trial_code(text, uuid, text, text, text) to service_role;

-- 5. Intrekken (admin) ------------------------------------------------------

create or replace function tmc.revoke_trial_code(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;

  select status into v_status
  from tmc.trial_codes
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'code_not_found');
  end if;
  -- Alleen 'active' is intrekbaar; een al verzilverde code (en zijn
  -- boeking) blijft intact.
  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'code_not_active');
  end if;

  update tmc.trial_codes set status = 'revoked' where id = p_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.revoked', 'admin', v_uid, 'trial_code', p_id,
    jsonb_build_object('code_id', p_id)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function tmc.revoke_trial_code(uuid) from public, anon;
grant execute on function tmc.revoke_trial_code(uuid) to authenticated, service_role;

create or replace function tmc.revoke_trial_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_revoked int;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;

  if not exists (select 1 from tmc.trial_codes where batch_id = p_batch_id) then
    return jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  end if;

  update tmc.trial_codes
  set status = 'revoked'
  where batch_id = p_batch_id and status = 'active';
  get diagnostics v_revoked = row_count;

  -- Eén event per aanroep, en alleen als er echt iets is ingetrokken.
  if v_revoked > 0 then
    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values (
      'trial_code.batch_revoked', 'admin', v_uid, 'trial_code_batch', p_batch_id,
      jsonb_build_object('batch_id', p_batch_id, 'revoked_count', v_revoked)
    );
  end if;

  return jsonb_build_object('ok', true, 'revoked_count', v_revoked);
end;
$$;

revoke execute on function tmc.revoke_trial_batch(uuid) from public, anon;
grant execute on function tmc.revoke_trial_batch(uuid) to authenticated, service_role;

-- 6. Annuleer-teruggave -----------------------------------------------------
-- Het bestaande annuleerpad (cancelTrialBooking, service-role update naar
-- status 'cancelled') blijft ongewijzigd; deze trigger geeft de code
-- terug zolang die nog niet verlopen is. Verlopen codes blijven
-- 'redeemed'. actor_type 'system': de trigger kent de annulerende partij
-- niet (bezoeker via cancel_token of admin), het teruggeven zelf is een
-- systeemgevolg.

create or replace function tmc.trial_bookings_release_code()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
begin
  update tmc.trial_codes
  set status = 'active',
      redeemed_at = null,
      trial_booking_id = null
  where id = new.trial_code_id
    and status = 'redeemed'
    and expires_at > now();

  if found then
    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values (
      'trial_code.released', 'system', null, 'trial_code', new.trial_code_id,
      jsonb_build_object(
        'code_id', new.trial_code_id,
        'trial_booking_id', new.id
      )
    );
  end if;

  return new;
end;
$$;

create trigger trial_bookings_release_code
  after update of status on tmc.trial_bookings
  for each row
  when (
    new.status = 'cancelled'
    and old.status is distinct from 'cancelled'
    and new.trial_code_id is not null
  )
  execute function tmc.trial_bookings_release_code();
