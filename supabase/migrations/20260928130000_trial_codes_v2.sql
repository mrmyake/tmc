-- Proefcodes v2 (spec-community-growth.md §1 "Proefcodes"): een code blijft
-- geldig tot een admin hem intrekt en heeft een van drie soorten: eenmalig
-- (max_uses 1), X keer (max_uses > 1) of onbeperkt (max_uses null). Elke
-- inwisseling wordt vastgelegd in tmc.trial_code_redemptions, met een
-- unieke open inwisseling per (les, e-mailadres). Vervangt v1 uit
-- 20260808000000_trial_codes.sql (eenmalig, 28 dagen, pillar, batches).
--
-- Ontwerpbesluiten (akkoord Ilja 2026-09-28):
-- - Geen vervaldatum en geen pillar-restrictie meer: een code geldt voor
--   elke les die als proefles boekbaar is (alles behalve vrij_trainen).
-- - Status is afgeleid, geen kolom: ingetrokken als revoked_at gezet is,
--   op als max_uses niet null is en uses_count >= max_uses, anders actief.
-- - Annuleren van een codeboeking geeft het gebruik terug: de trigger zet
--   released_at op de inwisseling en verlaagt uses_count met een. De
--   inwisseling zelf blijft staan (audittrail en misbruiktelling).
-- - Een gratis boeking is een gewone tmc.trial_bookings-rij: status
--   'paid', price_paid_cents 0, mollie_payment_id null. Daardoor telt ze
--   automatisch mee in session_occupancy(), v_session_availability en de
--   capaciteitstrigger, blijft de expire-orders-cron (alleen 'pending')
--   en de Mollie-webhook (alleen op mollie_payment_id) er vanaf, en
--   ontstaat er geen tmc.payments-rij (mollie_payment_id is daar NOT
--   NULL), dus ook geen omzetregel in v_revenue_lines. vw_admin_kpis leest
--   trial_bookings niet.
-- - Rate limiting op het raden van codes volgt het patroon van
--   register_kiosk_pin_attempt (20260927, de opvolger van PR #130):
--   atomaire teller per IP, vlak beleid, alleen service_role.
-- - Grantmodel ongewijzigd: tabellen uitsluitend service_role plus een
--   is_admin()-policy als tweede laag; anon en authenticated hebben niets.
--   redeem_trial_code en register_trial_code_attempt alleen service_role;
--   create_trial_code, revoke_trial_code en admin_cancel_trial_booking
--   voor authenticated met is_admin() binnenin.
--
-- Bestaande v1-rijen: label uit batch_label, max_uses 1, uses_count 1 bij
-- status 'redeemed', revoked_at uit het intrek-event bij 'revoked'.
-- Een verzilverde v1-code met een nog bestaande boeking krijgt een
-- inwisselingsrij; zonder boeking (live: twee testcodes met
-- trial_booking_id null) alleen de teller.
--
-- Alle SECURITY DEFINER-functies uit v1 worden gedropt en herbouwd op
-- basis van de live definities (pg_get_functiondef, 2026-09-28), met
-- expliciete grant-restore en een assert aan het slot. Schema tmc only;
-- public en tvmuur onaangeroerd; 20260503 placeholder onaangeroerd.
-- Draaien met `supabase db push` na de merge; niet ervoor.

begin;

-- ---------------------------------------------------------------------------
-- 1. v1-functies weg (grants eerst, dan drop)
-- ---------------------------------------------------------------------------

revoke all on function tmc.generate_trial_codes(int, text, text, int) from public, anon, authenticated, service_role;
drop function if exists tmc.generate_trial_codes(int, text, text, int);

revoke all on function tmc.revoke_trial_batch(uuid) from public, anon, authenticated, service_role;
drop function if exists tmc.revoke_trial_batch(uuid);

revoke all on function tmc.revoke_trial_code(uuid) from public, anon, authenticated, service_role;
drop function if exists tmc.revoke_trial_code(uuid);

revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text) from public, anon, authenticated, service_role;
drop function if exists tmc.redeem_trial_code(text, uuid, text, text, text);

drop trigger if exists trial_bookings_release_code on tmc.trial_bookings;
drop function if exists tmc.trial_bookings_release_code();

-- ---------------------------------------------------------------------------
-- 2. trial_codes: nieuwe kolommen, backfill, oude kolommen weg
-- ---------------------------------------------------------------------------

alter table tmc.trial_codes
  add column if not exists label text,
  add column if not exists max_uses integer,
  add column if not exists uses_count integer not null default 0,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references tmc.profiles(id) on delete set null;

update tmc.trial_codes tc
set label = coalesce(nullif(trim(tc.label), ''), nullif(trim(tc.batch_label), ''), tc.code),
    max_uses = 1,
    uses_count = case when tc.status = 'redeemed' then 1 else 0 end,
    revoked_at = case
      when tc.status = 'revoked' then coalesce(
        (select max(e.created_at) from tmc.events e
          where e.type = 'trial_code.revoked' and e.subject_id = tc.id),
        (select max(e.created_at) from tmc.events e
          where e.type = 'trial_code.batch_revoked' and e.subject_id = tc.batch_id),
        now())
      else null
    end;

alter table tmc.trial_codes
  alter column label set not null,
  add constraint trial_codes_label_check check (length(trim(label)) > 0),
  add constraint trial_codes_max_uses_check check (max_uses is null or max_uses > 0),
  add constraint trial_codes_uses_count_check check (uses_count >= 0);

-- ---------------------------------------------------------------------------
-- 3. trial_code_redemptions
-- ---------------------------------------------------------------------------

create table tmc.trial_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references tmc.trial_codes(id),
  trial_booking_id uuid not null unique references tmc.trial_bookings(id) on delete cascade,
  session_id uuid not null references tmc.class_sessions(id) on delete cascade,
  email_normalized text not null
    check (email_normalized = lower(trim(email_normalized)) and length(email_normalized) > 0),
  redeemed_at timestamptz not null default now(),
  released_at timestamptz
);

comment on table tmc.trial_code_redemptions is
  'Een rij per inwisseling van een proefcode. released_at wordt gezet als de bijbehorende boeking geannuleerd wordt (het gebruik gaat dan terug naar de code); de rij blijft staan voor de audittrail en de misbruiktelling per e-mailadres.';

-- Een e-mailadres kan per les maar een open codeboeking hebben.
create unique index trial_code_redemptions_session_email_open_idx
  on tmc.trial_code_redemptions (session_id, email_normalized)
  where released_at is null;
create index trial_code_redemptions_code_id_idx on tmc.trial_code_redemptions (code_id);
create index trial_code_redemptions_email_idx on tmc.trial_code_redemptions (email_normalized);

revoke all on table tmc.trial_code_redemptions from public, anon, authenticated;
grant all on table tmc.trial_code_redemptions to service_role;
alter table tmc.trial_code_redemptions enable row level security;
create policy trial_code_redemptions_admin_all on tmc.trial_code_redemptions
  for all using (tmc.is_admin()) with check (tmc.is_admin());

-- Backfill: verzilverde v1-codes waarvan de boeking nog bestaat.
insert into tmc.trial_code_redemptions (code_id, trial_booking_id, session_id, email_normalized, redeemed_at, released_at)
select tc.id, tb.id, tb.session_id, lower(trim(tb.email)), coalesce(tc.redeemed_at, tb.booked_at),
       case when tb.status = 'cancelled' then tb.cancelled_at else null end
from tmc.trial_codes tc
join tmc.trial_bookings tb on tb.id = tc.trial_booking_id
where tc.status = 'redeemed'
on conflict (trial_booking_id) do nothing;

-- Oude kolommen (en hun indexen en constraints) weg.
alter table tmc.trial_codes
  drop column status,
  drop column expires_at,
  drop column pillar,
  drop column batch_id,
  drop column batch_label,
  drop column redeemed_at,
  drop column trial_booking_id;

comment on table tmc.trial_codes is
  'Proefcodes voor een gratis proefles. Geldig tot revoked_at gezet is; max_uses null = onbeperkt, 1 = eenmalig, >1 = X keer. Status is afgeleid: ingetrokken (revoked_at), op (uses_count >= max_uses) of actief. Schrijven uitsluitend via de RPCs; geen grants voor anon en authenticated.';
comment on column tmc.trial_codes.max_uses is
  'null = onbeperkt (actiecode), 1 = eenmalig, >1 = X keer te gebruiken.';
comment on column tmc.trial_codes.uses_count is
  'Aantal open inwisselingen. Gaat omhoog in redeem_trial_code en omlaag (via de release-trigger) als een codeboeking geannuleerd wordt.';

-- Invariant op de boeking: een codeboeking is altijd gratis en zonder
-- Mollie-betaling. Dit houdt de payments-spiegel en de omzet er vanaf.
alter table tmc.trial_bookings
  add constraint trial_bookings_code_is_free_check
  check (trial_code_id is null or (price_paid_cents = 0 and mollie_payment_id is null));

-- ---------------------------------------------------------------------------
-- 4. Rate limiting: pogingenteller per IP (patroon register_kiosk_pin_attempt)
-- ---------------------------------------------------------------------------

create table tmc.trial_code_attempts (
  ip text primary key,
  fail_count integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

comment on table tmc.trial_code_attempts is
  'Pogingenteller voor het inwisselen van proefcodes, per client-IP. Schrijven uitsluitend via service_role (register_trial_code_attempt); de rij wordt verwijderd bij een geslaagde inwisseling. Geen policies: RLS aan als slot voor niet-service-rollen.';

alter table tmc.trial_code_attempts enable row level security;
revoke all on table tmc.trial_code_attempts from public, anon, authenticated;
grant all on table tmc.trial_code_attempts to service_role;

create function tmc.register_trial_code_attempt(p_ip text)
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

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', ceil(extract(epoch from (v_row.locked_until - v_now)))::int
    );
  end if;

  -- Verlopen lockout of dertig minuten zonder pogingen: vers venster.
  if v_row.locked_until is not null
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

  return jsonb_build_object('allowed', true, 'fail_count', v_row.fail_count);
end;
$$;

comment on function tmc.register_trial_code_attempt(text) is
  'Registreert atomair een inwisselpoging voor een IP en zegt of die door mag. Vlak beleid: 10 pogingen per venster, daarna 15 min lockout; reset na 30 min rust. Aanroepen voor redeem_trial_code; bij succes verwijdert de app-laag de rij.';

revoke all on function tmc.register_trial_code_attempt(text) from public, anon, authenticated;
grant execute on function tmc.register_trial_code_attempt(text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. create_trial_code (admin)
-- ---------------------------------------------------------------------------

create function tmc.create_trial_code(
  p_code text,
  p_label text,
  p_max_uses integer
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

  insert into tmc.trial_codes (code, label, max_uses, created_by)
  values (v_code, v_label, p_max_uses, v_uid)
  returning * into v_row;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.created', 'admin', v_uid, 'trial_code', v_row.id,
    jsonb_build_object(
      'code_id', v_row.id,
      'max_uses', p_max_uses,
      'generated', v_generated
    )
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'code', v_row.code,
    'label', v_row.label,
    'max_uses', v_row.max_uses,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function tmc.create_trial_code(text, text, integer) from public, anon;
grant execute on function tmc.create_trial_code(text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. revoke_trial_code (admin): alleen vooruit, bestaande boekingen blijven
-- ---------------------------------------------------------------------------

create function tmc.revoke_trial_code(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_revoked_at timestamptz;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;

  select revoked_at into v_revoked_at
  from tmc.trial_codes
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'code_not_found');
  end if;
  if v_revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'code_already_revoked');
  end if;

  update tmc.trial_codes
  set revoked_at = now(), revoked_by = v_uid
  where id = p_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.revoked', 'admin', v_uid, 'trial_code', p_id,
    jsonb_build_object('code_id', p_id)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function tmc.revoke_trial_code(uuid) from public, anon;
grant execute on function tmc.revoke_trial_code(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. redeem_trial_code (publiek via de service-role client)
-- ---------------------------------------------------------------------------

create function tmc.redeem_trial_code(
  p_code text,
  p_session_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_is_test boolean default false
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

  -- Lock de sessie-rij: pint status en capaciteit vast, zelfde patroon als
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
  -- Alleen lessen die ook betaald als proefles boekbaar zijn (alles
  -- behalve vrij trainen, zie dropInSlugForPillar in trial-booking.ts).
  if v_session.pillar = 'vrij_trainen' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_trial_eligible');
  end if;

  -- Een e-mailadres kan per les maar een keer geboekt staan, betaald of
  -- gratis. Aparte reason: dit mag de bezoeker wel te horen krijgen.
  if exists (
    select 1 from tmc.trial_bookings tb
    where tb.session_id = p_session_id
      and lower(trim(tb.email)) = v_email
      and tb.status in ('pending', 'paid', 'attended')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'email_already_booked');
  end if;

  -- Capaciteit onder de sessie-lock via tmc.session_occupancy(): dezelfde
  -- som als v_session_availability en de andere schrijf-gates.
  -- capacity null = onbeperkt: nooit vol.
  if v_session.capacity is not null
     and tmc.session_occupancy(p_session_id) >= v_session.capacity then
    return jsonb_build_object('ok', false, 'reason', 'capacity_full');
  end if;

  -- Gratis en direct definitief: status 'paid', prijs 0, geen Mollie.
  -- is_test is een snapshot van de deployment-modus, zoals bij een
  -- betaalde proefles (trialBookingMode()).
  insert into tmc.trial_bookings (
    session_id, name, email, phone,
    price_paid_cents, mollie_payment_id, status, trial_code_id, is_test
  ) values (
    p_session_id, v_name, v_email, v_phone,
    0, null, 'paid', v_tc.id, coalesce(p_is_test, false)
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
    'prior_free_count', v_prior_free
  );
end;
$$;

-- Publiek betekent hier: via de service-role client in de TS-laag, achter
-- register_trial_code_attempt. Niet rechtstreeks door anon/authenticated.
revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 8. admin_cancel_trial_booking (admin): alleen 'paid' is annuleerbaar.
--    Een 'pending' rij hoort bij een lopende Mollie-betaling; die laat de
--    expire-orders-cron met Mollie reconcilieren, anders kan een bezoeker
--    betalen voor een plek die al weg is.
-- ---------------------------------------------------------------------------

create function tmc.admin_cancel_trial_booking(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_tb tmc.trial_bookings%rowtype;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;

  select * into v_tb
  from tmc.trial_bookings
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;
  if v_tb.status <> 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_open');
  end if;

  update tmc.trial_bookings
  set status = 'cancelled', cancelled_at = now()
  where id = p_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_booking.cancelled', 'admin', v_uid, 'trial_booking', p_id,
    jsonb_build_object(
      'session_id', v_tb.session_id,
      'trial_code_id', v_tb.trial_code_id,
      'via', 'admin'
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function tmc.admin_cancel_trial_booking(uuid) from public, anon;
grant execute on function tmc.admin_cancel_trial_booking(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Annuleer-teruggave: elk pad dat een codeboeking op 'cancelled' zet
--    (bezoeker via cancel_token, admin via de RPC, toekomstige paden)
--    geeft het gebruik terug.
-- ---------------------------------------------------------------------------

create function tmc.trial_bookings_release_code()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
begin
  update tmc.trial_code_redemptions
  set released_at = now()
  where trial_booking_id = new.id
    and released_at is null;

  if found then
    update tmc.trial_codes
    set uses_count = greatest(uses_count - 1, 0)
    where id = new.trial_code_id;

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

-- ---------------------------------------------------------------------------
-- 10. Grants asserteren
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_public_fns text[] := array[
    'tmc.redeem_trial_code(text, uuid, text, text, text, boolean)',
    'tmc.register_trial_code_attempt(text)'
  ];
  v_admin_fns text[] := array[
    'tmc.create_trial_code(text, text, integer)',
    'tmc.revoke_trial_code(uuid)',
    'tmc.admin_cancel_trial_booking(uuid)'
  ];
  v_tbl text;
begin
  foreach v_fn in array v_public_fns loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'trial_codes_v2: % mag niet voor anon/authenticated', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'trial_codes_v2: % moet voor service_role', v_fn;
    end if;
  end loop;

  foreach v_fn in array v_admin_fns loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'trial_codes_v2: % mag niet voor anon', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'trial_codes_v2: % moet voor authenticated en service_role', v_fn;
    end if;
  end loop;

  foreach v_tbl in array array['tmc.trial_codes', 'tmc.trial_code_redemptions', 'tmc.trial_code_attempts', 'tmc.trial_bookings'] loop
    if has_table_privilege('anon', v_tbl, 'select')
       or has_table_privilege('authenticated', v_tbl, 'select')
       or has_table_privilege('authenticated', v_tbl, 'insert') then
      raise exception 'trial_codes_v2: % heeft grants voor anon/authenticated', v_tbl;
    end if;
    if not has_table_privilege('service_role', v_tbl, 'insert') then
      raise exception 'trial_codes_v2: % mist service_role', v_tbl;
    end if;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tmc' and p.proname in ('generate_trial_codes', 'revoke_trial_batch')
  ) then
    raise exception 'trial_codes_v2: v1-functies bestaan nog';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Zelfcontrole binnen dezelfde transactie
--
-- Speelt de kern na zonder app-data te eisen: is er geen class_types-,
-- trainers- of profiles-rij (verse shadow-database), dan slaat de controle
-- zichzelf over met een notice (migrations/README.md, regel 6). Alles wordt
-- aan het eind weer verwijderd.
-- ---------------------------------------------------------------------------

do $$
declare
  v_ct uuid;
  v_tr uuid;
  v_pr uuid;
  v_sid uuid;
  v_sid2 uuid;
  v_code uuid;
  v_code_unl uuid;
  v_res jsonb;
  v_tb1 uuid;
  v_tb2 uuid;
begin
  select id into v_ct from tmc.class_types limit 1;
  select id into v_tr from tmc.trainers limit 1;
  select id into v_pr from tmc.profiles limit 1;
  if v_ct is null or v_tr is null or v_pr is null then
    raise notice 'trial_codes_v2: zelfcontrole overgeslagen, geen class_types/trainers/profiles-rij (lege database)';
    return;
  end if;

  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'yoga_mobility', 'adult', now() + interval '400 days', now() + interval '400 days 1 hour', 2, 'scheduled')
  returning id into v_sid;
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'kettlebell', 'adult', now() + interval '401 days', now() + interval '401 days 1 hour', null, 'scheduled')
  returning id into v_sid2;

  insert into tmc.trial_codes (code, label, max_uses, created_by)
  values ('ZELFCONTROLE1', 'zelfcontrole eenmalig', 1, v_pr)
  returning id into v_code;
  insert into tmc.trial_codes (code, label, max_uses, created_by)
  values ('ZELFCONTROLE2', 'zelfcontrole onbeperkt', null, v_pr)
  returning id into v_code_unl;

  -- Normalisatie: kleine letters en spaties worden geaccepteerd.
  v_res := tmc.redeem_trial_code(' zelf controle1 ', v_sid, 'Zelf Controle', 'ZELF@Test.invalid ', '0600000000', true);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_codes_v2: eerste inwisseling faalde: %', v_res;
  end if;
  v_tb1 := (v_res->>'trial_booking_id')::uuid;
  if (v_res->>'prior_free_count')::int <> 0 then
    raise exception 'trial_codes_v2: prior_free_count hoort 0 te zijn';
  end if;
  if (select uses_count from tmc.trial_codes where id = v_code) <> 1 then
    raise exception 'trial_codes_v2: uses_count niet opgehoogd';
  end if;
  if (select price_paid_cents from tmc.trial_bookings where id = v_tb1) <> 0
     or (select mollie_payment_id from tmc.trial_bookings where id = v_tb1) is not null
     or (select status from tmc.trial_bookings where id = v_tb1) <> 'paid' then
    raise exception 'trial_codes_v2: codeboeking is niet gratis/paid/zonder Mollie';
  end if;

  -- Eenmalige code een tweede keer: generieke weigering.
  v_res := tmc.redeem_trial_code('ZELFCONTROLE1', v_sid, 'Ander Persoon', 'ander@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'code_invalid' then
    raise exception 'trial_codes_v2: eenmalige code tweede keer hoort code_invalid te geven: %', v_res;
  end if;

  -- Zelfde e-mail, zelfde les, andere (onbeperkte) code: aparte melding.
  v_res := tmc.redeem_trial_code('ZELFCONTROLE2', v_sid, 'Zelf Controle', 'zelf@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'email_already_booked' then
    raise exception 'trial_codes_v2: dubbele e-mail per les hoort email_already_booked te geven: %', v_res;
  end if;

  -- Zelfde e-mail, andere les: gaat door, met prior_free_count 1.
  v_res := tmc.redeem_trial_code('ZELFCONTROLE2', v_sid2, 'Zelf Controle', 'zelf@test.invalid', '0600000000', true);
  if not (v_res->>'ok')::boolean or (v_res->>'prior_free_count')::int <> 1 then
    raise exception 'trial_codes_v2: tweede gratis les op ander adres hoort door te gaan met prior 1: %', v_res;
  end if;
  v_tb2 := (v_res->>'trial_booking_id')::uuid;

  -- Capaciteit: een gratis (niet-test) boeking telt mee zoals een betaalde.
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, status, is_test)
  values (v_sid, 'Betaald Een', 'betaald1@test.invalid', '0600000000', 1700, 'paid', false),
         (v_sid, 'Betaald Twee', 'betaald2@test.invalid', '0600000000', 1700, 'paid', false);
  if tmc.session_occupancy(v_sid) <> 2 then
    raise exception 'trial_codes_v2: occupancy verwacht 2, kreeg %', tmc.session_occupancy(v_sid);
  end if;
  update tmc.trial_bookings set is_test = false where id = v_tb1;
  if tmc.session_occupancy(v_sid) <> 3 then
    raise exception 'trial_codes_v2: gratis boeking telt niet mee in session_occupancy';
  end if;
  update tmc.trial_bookings set is_test = true where id = v_tb1;
  v_res := tmc.redeem_trial_code('ZELFCONTROLE2', v_sid, 'Derde Persoon', 'derde@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'capacity_full' then
    raise exception 'trial_codes_v2: volle sessie hoort capacity_full te geven: %', v_res;
  end if;

  -- Annuleren geeft het gebruik terug en maakt de code weer bruikbaar.
  update tmc.trial_bookings set status = 'cancelled', cancelled_at = now() where id = v_tb1;
  if (select uses_count from tmc.trial_codes where id = v_code) <> 0 then
    raise exception 'trial_codes_v2: uses_count niet verlaagd na annulering';
  end if;
  if (select released_at from tmc.trial_code_redemptions where trial_booking_id = v_tb1) is null then
    raise exception 'trial_codes_v2: released_at niet gezet na annulering';
  end if;
  v_res := tmc.redeem_trial_code('ZELFCONTROLE1', v_sid2, 'Zelf Controle', 'zelf2@test.invalid', '0600000000', true);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_codes_v2: vrijgegeven eenmalige code hoort weer te werken: %', v_res;
  end if;

  -- Intrekken werkt alleen vooruit.
  update tmc.trial_codes set revoked_at = now() where id = v_code_unl;
  v_res := tmc.redeem_trial_code('ZELFCONTROLE2', v_sid2, 'Vierde', 'vierde@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'code_invalid' then
    raise exception 'trial_codes_v2: ingetrokken code hoort code_invalid te geven: %', v_res;
  end if;
  if (select status from tmc.trial_bookings where id = v_tb2) <> 'paid' then
    raise exception 'trial_codes_v2: intrekken raakte een bestaande boeking';
  end if;

  -- Rate limiting: de tiende poging sluit af.
  for j in 1..9 loop
    v_res := tmc.register_trial_code_attempt('zelfcontrole-ip');
    if not (v_res->>'allowed')::boolean then
      raise exception 'trial_codes_v2: poging % hoort nog toegestaan te zijn', j;
    end if;
  end loop;
  v_res := tmc.register_trial_code_attempt('zelfcontrole-ip');
  if not (v_res->>'allowed')::boolean then
    raise exception 'trial_codes_v2: de tiende poging zelf hoort nog door te gaan';
  end if;
  v_res := tmc.register_trial_code_attempt('zelfcontrole-ip');
  if (v_res->>'allowed')::boolean then
    raise exception 'trial_codes_v2: elfde poging hoort geblokkeerd te zijn';
  end if;

  -- Opruimen binnen de transactie (redemptions cascaden mee met de boekingen).
  -- tmc.events is append-only (trigger events_no_update_delete); voor de
  -- events van deze zelfcontrole wordt die trigger binnen deze transactie
  -- even uitgezet, zodat er geen events naar niet-bestaande testcodes
  -- achterblijven.
  delete from tmc.trial_code_attempts where ip = 'zelfcontrole-ip';
  alter table tmc.events disable trigger events_no_update_delete;
  delete from tmc.events where type like 'trial_code.%' and subject_id in (v_code, v_code_unl);
  alter table tmc.events enable trigger events_no_update_delete;
  delete from tmc.trial_bookings where session_id in (v_sid, v_sid2);
  delete from tmc.trial_codes where id in (v_code, v_code_unl);
  delete from tmc.class_sessions where id in (v_sid, v_sid2);
end $$;

commit;
