-- feat/checkout-intents-db (PR 1 van "checkout: betalen voor account")
--
-- De publieke checkout op /abonnement en /kopen gaat van "eerst account via
-- e-mail-OTP, dan gegevens, dan betalen" naar "eerst gegevens, dan betalen,
-- dan maken wij het account". Niemand heeft nog een auth-user of profiel
-- zonder geslaagde betaling. Deze migratie levert alleen de database:
-- de tussentabel tmc.checkout_intents en de service_role-RPC's eromheen.
-- De app-kant (server actions, webhookbranch, /welkom/<token>, publieke
-- bedankpagina) volgt in PR 2 en 3. Mockups: mockups/checkout-betalen-voor-
-- account.html (PR #252).
--
-- Ontwerpbesluiten (akkoord Ilja 2026-09-30):
-- - Prijs en Early Member-snapshot komen uitsluitend uit
--   tmc._compute_order_price en worden op de intent bevroren. Bij conversie
--   wordt niets herberekend, ook niet als closes_at intussen verstreken is;
--   de intent-expiry (24 uur) is de grens.
-- - Twee tokens, beide alleen als sha256-hash opgeslagen; plaintext bestaat
--   alleen in de Mollie-redirect-URL (status-token, ?t=) en in de
--   welkomstmail (inlogtoken, /welkom/<token>). Het status-token leest
--   uitsluitend status en e-mailadres en levert nooit een sessie op. Het
--   inlogtoken is 7 dagen geldig en eenmalig; alleen de POST van de knop
--   "Inloggen" verbruikt het (consume), een GET nooit. Tokens worden in de
--   database gegenereerd (gen_random_bytes) en eenmalig als plaintext aan
--   service_role teruggegeven.
-- - Conversie (convert_checkout_intent) maakt de order direct in 'pending'
--   uit het snapshot en koppelt de payments-spiegelrij; tmc.activate_order
--   blijft ongewijzigd in de bestaande keten (webhook, activation-chain).
-- - Profiel vullen gebeurt in dezelfde transactie, vóór het wissen van de
--   PII. Telefoon alleen als niemand anders dat nummer heeft (anders null
--   plus phone_skipped in het resultaat). Een bestaand account
--   (p_profile_created false) wordt niet aangeraakt: de intent gaat naar
--   failed met conversion_error 'existing_account', paid_at gezet, PII
--   blijft staan voor de staf; PR 2 stuurt de alert.
-- - Herkansing na failed: elk faalpunt ná het vaststellen van een nieuw
--   profiel legt profile_id op de intent vast. Bij de herhaalde webhook
--   geeft createUser email_exists (p_profile_created false), maar hetzelfde
--   profile_id als vastgelegd telt dan als "door deze intent gemaakt" en de
--   conversie loopt alsnog door. Een ander profile_id, of een intent zonder
--   vastgelegd profiel, blijft existing_account.
-- - Late conversie (expired, cancelled, failed): orders.expires_at wordt
--   greatest(intent.expires_at, now() + 24 uur), zodat de expire-orders-cron
--   de order niet op expired zet vóór activate_order.
-- - Retentie: PII van converted intents wordt direct gewist (e-mail voor de
--   bedankpagina komt daarna uit profiles.email). expired, cancelled en
--   failed worden na 30 dagen opgeruimd door de cron (PR 2). De lookup voor
--   de bedankpagina antwoordt na 7 dagen 'not_found'.
-- - Testmodus: intent.mode ('live' of 'test', in de app afgeleid van
--   VERCEL_ENV) zet bij een nieuw profiel profiles.is_test = true.
-- - RLS aan zonder policies; tabel en functies uitsluitend service_role.
--   Nieuwe tmc-functies krijgen expliciete grants (README regel 7, event
--   trigger uit 20260929150000). Elke RPC weigert auth.uid() is not null,
--   zoals activate_order.
-- - Geen PII in foutcodes of logs: conversion_error is een code, nooit tekst.
--
-- Bestaande functies (_compute_order_price, create_order, activate_order,
-- handle_new_auth_user) worden alleen aangeroepen, niet gewijzigd. Live
-- definities gelezen via pg_get_functiondef op 2026-09-30.
--
-- Tests: scripts/test-checkout-intents.sql (lokale stack, alles in een
-- transactie met rollback).

-- ---------------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------------

create table tmc.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',
  -- 'live' of 'test': Mollie-modus van de gastcheckout (VERCEL_ENV in de app).
  mode text not null,
  kind text not null,
  catalogue_slug text not null,
  extended_access boolean not null default false,
  commit_24m boolean not null default false,
  -- Intentie van de bezoeker; of EM echt is toegepast staat in het snapshot
  -- (em_active) en wordt bij conversie op orders.early_member gezet.
  early_member_intent boolean not null default false,
  pricing_snapshot jsonb not null,
  first_charge_cents integer not null,
  -- PII: verplicht zolang de intent draft of pending is (constraint
  -- hieronder), na conversie gewist. Bij failed blijft hij staan voor de
  -- staf, tot de opruiming na 30 dagen.
  email text,
  first_name text,
  last_name text,
  phone text,
  street_address text,
  postal_code text,
  city text,
  acquisition_source text,
  acquisition_medium text,
  acquisition_campaign text,
  acquisition_content text,
  signup_path text,
  first_touch_at timestamptz,
  ga_client_id text,
  ga_session_id text,
  return_target text,
  -- Status-token: publieke bedankpagina, nooit een sessie.
  status_token_hash text not null,
  -- Inlogtoken: /welkom/<token>, 7 dagen, eenmalig; ontstaat bij conversie.
  login_token_hash text,
  login_token_expires_at timestamptz,
  login_token_used_at timestamptz,
  mollie_customer_id text,
  mollie_payment_id text,
  paid_at timestamptz,
  converted_at timestamptz,
  profile_id uuid references tmc.profiles(id) on delete cascade,
  order_id uuid references tmc.orders(id) on delete cascade,
  -- Alleen een code (bv. existing_account, order_conflict), nooit tekst.
  conversion_error text,
  -- Scherm 7 versus scherm 6 op de bedankpagina: Mollie meldde paid, maar de
  -- conversie is mislukt.
  paid_but_failed boolean generated always as (status = 'failed' and paid_at is not null) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),

  constraint checkout_intents_status_check
    check (status in ('draft', 'pending', 'converted', 'expired', 'cancelled', 'failed')),
  constraint checkout_intents_mode_check check (mode in ('live', 'test')),
  constraint checkout_intents_kind_check check (kind in ('subscription', 'product')),
  constraint checkout_intents_first_charge_check check (first_charge_cents >= 0),
  constraint checkout_intents_email_check
    check (email is null or (email = lower(email) and email = btrim(email) and email like '%_@_%')),
  constraint checkout_intents_first_name_check check (first_name is null or btrim(first_name) <> ''),
  constraint checkout_intents_last_name_check check (last_name is null or btrim(last_name) <> ''),
  -- Zelfde regex als profiles_phone_e164 (20261001100000).
  constraint checkout_intents_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint checkout_intents_street_check check (street_address is null or btrim(street_address) <> ''),
  constraint checkout_intents_postal_check check (postal_code is null or btrim(postal_code) <> ''),
  constraint checkout_intents_city_check check (city is null or btrim(city) <> ''),
  constraint checkout_intents_status_token_hash_key unique (status_token_hash),
  constraint checkout_intents_login_token_hash_key unique (login_token_hash),
  constraint checkout_intents_mollie_payment_id_key unique (mollie_payment_id),
  constraint checkout_intents_pii_required
    check (status not in ('draft', 'pending')
           or (email is not null and first_name is not null and last_name is not null
               and phone is not null and street_address is not null
               and postal_code is not null and city is not null)),
  constraint checkout_intents_converted_shape
    check ((status = 'converted') = (profile_id is not null and order_id is not null and converted_at is not null)),
  constraint checkout_intents_failed_has_error
    check (status <> 'failed' or conversion_error is not null),
  constraint checkout_intents_login_token_shape
    check (login_token_hash is null or login_token_expires_at is not null),
  constraint checkout_intents_pending_has_payment
    check (status <> 'pending' or mollie_payment_id is not null)
);

comment on table tmc.checkout_intents is
  'Gastcheckout vóór account: gegevens en bevroren prijs tot de Mollie-webhook het account, profiel en de order aanmaakt (convert_checkout_intent). Alleen service_role; tokens uitsluitend als sha256-hash.';
comment on column tmc.checkout_intents.status_token_hash is
  'sha256 van het token in de Mollie-redirect-URL (?t=). Leest alleen status en e-mail, nooit een sessie.';
comment on column tmc.checkout_intents.login_token_hash is
  'sha256 van het token in /welkom/<token>. 7 dagen, eenmalig, alleen de POST van "Inloggen" verbruikt het.';
comment on column tmc.checkout_intents.paid_but_failed is
  'Mollie meldde paid maar de conversie faalde: bedankpagina toont scherm 7, staf krijgt een alert.';

create index checkout_intents_status_expires_idx on tmc.checkout_intents (status, expires_at);
create index checkout_intents_created_idx on tmc.checkout_intents (created_at);
create index checkout_intents_profile_idx on tmc.checkout_intents (profile_id);

create trigger checkout_intents_touch_updated_at
  before update on tmc.checkout_intents
  for each row execute function tmc.touch_updated_at();

alter table tmc.checkout_intents enable row level security;
-- Bewust geen policies: alleen service_role (bypasst RLS) via de RPC's
-- hieronder en de cron.
revoke all on table tmc.checkout_intents from public, anon, authenticated;
grant all on table tmc.checkout_intents to service_role;

-- ---------------------------------------------------------------------------
-- 2. Interne helpers (geen grants: alleen vanuit de SECURITY DEFINER-RPC's,
--    die als eigenaar draaien)
-- ---------------------------------------------------------------------------

create function tmc._checkout_token_hash(p_token text)
returns text
language sql
immutable
set search_path to 'tmc', 'extensions'
as $$
  select encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;
revoke execute on function tmc._checkout_token_hash(text) from public, anon, authenticated, service_role;

-- 32 willekeurige bytes als 64 hex-tekens.
create function tmc._checkout_new_token()
returns text
language sql
volatile
set search_path to 'tmc', 'extensions'
as $$
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;
revoke execute on function tmc._checkout_new_token() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. create_checkout_intent
-- ---------------------------------------------------------------------------

create function tmc.create_checkout_intent(
  p_mode text,
  p_slug text,
  p_extended_access boolean,
  p_commit_24m boolean,
  p_early_member boolean,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_street_address text,
  p_postal_code text,
  p_city text,
  p_acquisition jsonb default '{}'::jsonb,
  p_ga_client_id text default null,
  p_ga_session_id text default null,
  p_return_target text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_pricing jsonb;
  v_token text;
  v_row tmc.checkout_intents%rowtype;
  v_constraint text;
begin
  if auth.uid() is not null then
    raise exception 'create_checkout_intent is service-role only.' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('live', 'test') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_mode');
  end if;

  -- De enige prijsbron. p_early_member is intentie; _compute_order_price
  -- beslist (em_active) op eligibility en closes_at, in deze transactie.
  v_pricing := tmc._compute_order_price(
    p_slug,
    coalesce(p_extended_access, false),
    coalesce(p_commit_24m, false),
    coalesce(p_early_member, false)
  );
  if not coalesce((v_pricing ->> 'ok')::boolean, false) then
    return v_pricing;
  end if;

  v_token := tmc._checkout_new_token();

  begin
    insert into tmc.checkout_intents (
      status, mode, kind, catalogue_slug, extended_access, commit_24m, early_member_intent,
      pricing_snapshot, first_charge_cents,
      email, first_name, last_name, phone, street_address, postal_code, city,
      acquisition_source, acquisition_medium, acquisition_campaign, acquisition_content,
      signup_path, first_touch_at, ga_client_id, ga_session_id, return_target,
      status_token_hash
    ) values (
      'draft', p_mode, v_pricing ->> 'kind', p_slug,
      (v_pricing ->> 'extended_access')::boolean,
      coalesce(p_commit_24m, false),
      coalesce(p_early_member, false),
      v_pricing, (v_pricing ->> 'first_charge_cents')::integer,
      lower(btrim(p_email)), nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
      nullif(btrim(p_phone), ''), nullif(btrim(p_street_address), ''),
      nullif(btrim(p_postal_code), ''), nullif(btrim(p_city), ''),
      nullif(btrim(p_acquisition ->> 'acquisition_source'), ''),
      nullif(btrim(p_acquisition ->> 'acquisition_medium'), ''),
      nullif(btrim(p_acquisition ->> 'acquisition_campaign'), ''),
      nullif(btrim(p_acquisition ->> 'acquisition_content'), ''),
      nullif(btrim(p_acquisition ->> 'signup_path'), ''),
      nullif(p_acquisition ->> 'first_touch_at', '')::timestamptz,
      nullif(btrim(p_ga_client_id), ''), nullif(btrim(p_ga_session_id), ''),
      nullif(btrim(p_return_target), ''),
      tmc._checkout_token_hash(v_token)
    )
    returning * into v_row;
  exception
    when check_violation then
      -- Alleen de constraintnaam: geen ingevoerde waarde in het resultaat.
      get stacked diagnostics v_constraint = constraint_name;
      return jsonb_build_object('ok', false, 'reason', 'invalid_input', 'constraint', v_constraint);
  end;

  return jsonb_build_object(
    'ok', true,
    'intent_id', v_row.id,
    -- Eenmalig plaintext; hierna bestaat het alleen nog in de redirect-URL.
    'status_token', v_token,
    'kind', v_row.kind,
    'first_charge_cents', v_row.first_charge_cents,
    'recurring_cents', (v_pricing ->> 'recurring_cents')::integer,
    'early_member', (v_pricing ->> 'em_active')::boolean,
    'expires_at', v_row.expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. mark_checkout_intent_pending: na het aanmaken van de Mollie-betaling
-- ---------------------------------------------------------------------------

create function tmc.mark_checkout_intent_pending(
  p_intent_id uuid,
  p_mollie_payment_id text,
  p_mollie_customer_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_row tmc.checkout_intents%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'mark_checkout_intent_pending is service-role only.' using errcode = '42501';
  end if;
  if p_mollie_payment_id is null or btrim(p_mollie_payment_id) = '' then
    return jsonb_build_object('ok', false, 'reason', 'payment_id_required');
  end if;

  select * into v_row from tmc.checkout_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'intent_not_found');
  end if;
  if v_row.status = 'pending' and v_row.mollie_payment_id = p_mollie_payment_id then
    return jsonb_build_object('ok', true, 'already_pending', true);
  end if;
  if v_row.status <> 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_row.status);
  end if;
  if v_row.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  update tmc.checkout_intents
  set status = 'pending',
      mollie_payment_id = p_mollie_payment_id,
      mollie_customer_id = coalesce(nullif(btrim(p_mollie_customer_id), ''), mollie_customer_id)
  where id = p_intent_id;

  return jsonb_build_object('ok', true, 'already_pending', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. convert_checkout_intent: webhook paid, na createUser
-- ---------------------------------------------------------------------------

create function tmc.convert_checkout_intent(
  p_intent_id uuid,
  p_profile_id uuid,
  p_mollie_payment_id text,
  p_paid_at timestamptz,
  p_profile_created boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_row tmc.checkout_intents%rowtype;
  v_profile tmc.profiles%rowtype;
  v_pricing jsonb;
  v_paid_at timestamptz;
  v_from_failed boolean;
  v_order_id uuid;
  v_phone_skipped boolean := false;
  v_login_token text;
  v_login_expires timestamptz;
begin
  if auth.uid() is not null then
    raise exception 'convert_checkout_intent is service-role only.' using errcode = '42501';
  end if;

  select * into v_row from tmc.checkout_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'intent_not_found');
  end if;

  -- Idempotent: een herhaalde webhook krijgt het bestaande resultaat, zonder
  -- nieuw inlogtoken (dat kan alleen via rotate_checkout_login_token).
  if v_row.status = 'converted' then
    return jsonb_build_object(
      'ok', true,
      'already_converted', true,
      'order_id', v_row.order_id,
      'profile_id', v_row.profile_id
    );
  end if;

  -- pending is het normale pad; expired en cancelled worden gehonoreerd zoals
  -- activate_order een late betaling honoreert; failed alleen na paid
  -- (herhaalde webhook na een eerder mislukte conversie, wijziging A).
  v_from_failed := v_row.status = 'failed' and v_row.paid_at is not null;
  if not (v_row.status in ('pending', 'expired', 'cancelled') or v_from_failed) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_row.status);
  end if;
  if v_row.mollie_payment_id is distinct from p_mollie_payment_id then
    return jsonb_build_object('ok', false, 'reason', 'payment_intent_mismatch');
  end if;

  v_paid_at := coalesce(p_paid_at, v_row.paid_at, now());

  -- Wijziging B: bestaand account. Niets aan profiles of orders; de intent
  -- gaat naar failed met code existing_account, PII blijft voor de staf.
  -- Het profiel telt als "door deze intent gemaakt" als de webhook het net
  -- heeft aangemaakt (p_profile_created), of als een eerdere mislukte
  -- poging van deze intent het al had vastgelegd (retry na failed: de
  -- webhook krijgt dan email_exists en geeft p_profile_created false).
  if not (coalesce(p_profile_created, false)
          or (v_row.profile_id is not null and v_row.profile_id = p_profile_id)) then
    update tmc.checkout_intents
    set status = 'failed', conversion_error = 'existing_account', paid_at = v_paid_at
    where id = p_intent_id;
    return jsonb_build_object('ok', false, 'reason', 'existing_account', 'intent_id', p_intent_id);
  end if;

  select * into v_profile from tmc.profiles where id = p_profile_id for update;
  if not found then
    update tmc.checkout_intents
    set status = 'failed', conversion_error = 'profile_not_found', paid_at = v_paid_at
    where id = p_intent_id;
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found', 'intent_id', p_intent_id);
  end if;

  -- Profiel vullen uit de intent (nieuw account), vóór het wissen van de
  -- PII. Telefoon apart: een botsing op profiles_phone_unique mag de
  -- conversie nooit laten falen (geld is binnen).
  update tmc.profiles
  set first_name = coalesce(v_row.first_name, first_name),
      last_name = coalesce(v_row.last_name, last_name),
      street_address = coalesce(v_row.street_address, street_address),
      postal_code = coalesce(v_row.postal_code, postal_code),
      city = coalesce(v_row.city, city),
      mollie_customer_id = coalesce(mollie_customer_id, v_row.mollie_customer_id),
      is_test = (is_test or v_row.mode = 'test'),
      acquisition_source = coalesce(acquisition_source, v_row.acquisition_source),
      acquisition_medium = coalesce(acquisition_medium, v_row.acquisition_medium),
      acquisition_campaign = coalesce(acquisition_campaign, v_row.acquisition_campaign),
      acquisition_content = coalesce(acquisition_content, v_row.acquisition_content),
      signup_path = coalesce(signup_path, v_row.signup_path),
      first_touch_at = coalesce(first_touch_at, v_row.first_touch_at)
  where id = p_profile_id;

  if v_row.phone is not null and v_profile.phone is null then
    if exists (select 1 from tmc.profiles where phone = v_row.phone and id <> p_profile_id) then
      v_phone_skipped := true;
    else
      begin
        update tmc.profiles set phone = v_row.phone where id = p_profile_id;
      exception
        when unique_violation then
          -- Race met een gelijktijdige schrijver: nummer overslaan, code
          -- in het resultaat, geen nummer in de melding.
          v_phone_skipped := true;
      end;
    end if;
  end if;

  -- Order direct in pending uit het bevroren snapshot; zelfde kolommen als
  -- create_order, zonder herberekening. activate_order (bestaande keten)
  -- vindt de betaling via orders.mollie_payment_id.
  v_pricing := v_row.pricing_snapshot;
  begin
    insert into tmc.orders (
      profile_id, kind, catalogue_slug, extended_access, commit_months, early_member,
      base_price_cents, extended_access_price_cents, signup_fee_cents, first_charge_cents,
      recurring_cents, billing_cycle_weeks, early_member_price_lock, signup_fee_waiver,
      vat_amount_cents, pricing_snapshot, created_by, status, expires_at,
      mollie_customer_id, mollie_payment_id, ga_client_id, ga_session_id
    ) values (
      p_profile_id,
      v_row.kind,
      v_row.catalogue_slug,
      coalesce((v_pricing ->> 'extended_access')::boolean, false),
      (v_pricing ->> 'commit_months')::integer,
      coalesce((v_pricing ->> 'em_active')::boolean, false),
      (v_pricing ->> 'base_price_cents')::integer,
      coalesce((v_pricing ->> 'extended_access_price_cents')::integer, 0),
      coalesce((v_pricing ->> 'signup_fee_cents')::integer, 0),
      (v_pricing ->> 'first_charge_cents')::integer,
      (v_pricing ->> 'recurring_cents')::integer,
      (v_pricing ->> 'billing_cycle_weeks')::integer,
      coalesce((v_pricing ->> 'early_member_price_lock')::boolean, false),
      v_pricing ->> 'signup_fee_waiver',
      (v_pricing ->> 'first_charge_vat_amount_cents')::integer,
      v_pricing, 'self', 'pending',
      -- Late conversie: nooit een order die al verlopen is bij aanmaak.
      greatest(v_row.expires_at, now() + interval '24 hours'),
      v_row.mollie_customer_id, v_row.mollie_payment_id, v_row.ga_client_id, v_row.ga_session_id
    )
    returning id into v_order_id;
  exception
    when unique_violation then
      -- orders_one_open_subscription_idx of orders_mollie_payment_id_key.
      -- Geld is binnen: intent naar failed, staf lost het op (PR 2 alert).
      -- profile_id blijft vastgelegd zodat de herkansing dit profiel als
      -- het eigen profiel herkent (checkout_intents_converted_shape laat
      -- profile_id zonder order_id toe zolang status niet converted is).
      update tmc.checkout_intents
      set status = 'failed', conversion_error = 'order_conflict', paid_at = v_paid_at,
          profile_id = p_profile_id
      where id = p_intent_id;
      return jsonb_build_object('ok', false, 'reason', 'order_conflict', 'intent_id', p_intent_id);
  end;

  -- Spiegelrij in payments. De webhook upsert deze rij doorgaans al vóór de
  -- conversie (zonder profiel en order); dan vullen we alleen de koppeling
  -- aan en laten status en bedrag van de webhook staan.
  insert into tmc.payments (
    profile_id, order_id, mollie_payment_id, amount_cents, status, paid_at, is_test, kind,
    description
  ) values (
    p_profile_id, v_order_id, v_row.mollie_payment_id, v_row.first_charge_cents, 'paid',
    v_paid_at, v_row.mode = 'test', 'order', 'The Movement Club | ' || v_row.catalogue_slug
  )
  on conflict (mollie_payment_id) do update
    set profile_id = excluded.profile_id,
        order_id = excluded.order_id,
        kind = coalesce(tmc.payments.kind, excluded.kind);

  -- Inlogtoken: 7 dagen, eenmalig; plaintext gaat eenmalig terug naar de
  -- webhook voor de welkomstmail. Daarna PII wissen (besluit 4); e-mail voor
  -- de bedankpagina komt voortaan uit profiles.email.
  v_login_token := tmc._checkout_new_token();
  v_login_expires := now() + interval '7 days';

  update tmc.checkout_intents
  set status = 'converted',
      profile_id = p_profile_id,
      order_id = v_order_id,
      paid_at = v_paid_at,
      converted_at = now(),
      conversion_error = null,
      login_token_hash = tmc._checkout_token_hash(v_login_token),
      login_token_expires_at = v_login_expires,
      login_token_used_at = null,
      email = null, first_name = null, last_name = null, phone = null,
      street_address = null, postal_code = null, city = null
  where id = p_intent_id;

  return jsonb_build_object(
    'ok', true,
    'already_converted', false,
    'from_failed', v_from_failed,
    'order_id', v_order_id,
    'profile_id', p_profile_id,
    'login_token', v_login_token,
    'login_token_expires_at', v_login_expires,
    'phone_skipped', v_phone_skipped,
    'is_test', v_row.mode = 'test'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. fail_checkout_intent: de webhook markeert een mislukte conversie
-- ---------------------------------------------------------------------------

create function tmc.fail_checkout_intent(
  p_intent_id uuid,
  p_error_code text,
  p_paid_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_row tmc.checkout_intents%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'fail_checkout_intent is service-role only.' using errcode = '42501';
  end if;
  -- Alleen een korte code: nooit een foutmelding of PII in deze kolom.
  if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_error_code');
  end if;

  select * into v_row from tmc.checkout_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'intent_not_found');
  end if;
  if v_row.status = 'converted' then
    return jsonb_build_object('ok', false, 'reason', 'already_converted');
  end if;

  update tmc.checkout_intents
  set status = 'failed',
      conversion_error = p_error_code,
      paid_at = coalesce(p_paid_at, paid_at)
  where id = p_intent_id
  returning * into v_row;

  return jsonb_build_object('ok', true, 'paid_but_failed', v_row.paid_but_failed);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. checkout_intent_status: publieke bedankpagina (status-token)
-- ---------------------------------------------------------------------------

create function tmc.checkout_intent_status(p_status_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_status text;
  v_paid boolean;
  v_paid_but_failed boolean;
  v_email text;
begin
  if auth.uid() is not null then
    raise exception 'checkout_intent_status is service-role only.' using errcode = '42501';
  end if;
  if p_status_token is null or length(p_status_token) <> 64 then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Precies vier sleutels, niets anders: dit token staat in de
  -- browsergeschiedenis. Na 7 dagen antwoordt de lookup not_found
  -- (wijziging D). E-mail na conversie uit profiles.
  select i.status, i.paid_at is not null, i.paid_but_failed, coalesce(i.email, p.email)
  into v_status, v_paid, v_paid_but_failed, v_email
  from tmc.checkout_intents i
  left join tmc.profiles p on p.id = i.profile_id
  where i.status_token_hash = tmc._checkout_token_hash(p_status_token)
    and i.created_at > now() - interval '7 days';
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', v_status,
    'paid', v_paid,
    'paid_but_failed', v_paid_but_failed,
    'email', v_email
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. consume_checkout_login_token: POST van "Inloggen" op /welkom/<token>
-- ---------------------------------------------------------------------------

create function tmc.consume_checkout_login_token(p_login_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_row tmc.checkout_intents%rowtype;
  v_email text;
begin
  if auth.uid() is not null then
    raise exception 'consume_checkout_login_token is service-role only.' using errcode = '42501';
  end if;
  if p_login_token is null or length(p_login_token) <> 64 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_row
  from tmc.checkout_intents
  where login_token_hash = tmc._checkout_token_hash(p_login_token)
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_row.login_token_used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;
  if v_row.login_token_expires_at is null or v_row.login_token_expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_row.status <> 'converted' or v_row.profile_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_converted');
  end if;

  update tmc.checkout_intents set login_token_used_at = now() where id = v_row.id;
  select email into v_email from tmc.profiles where id = v_row.profile_id;

  return jsonb_build_object('ok', true, 'profile_id', v_row.profile_id, 'email', v_email);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. rotate_checkout_login_token: nieuwe link als de welkomstmail faalde
-- ---------------------------------------------------------------------------

create function tmc.rotate_checkout_login_token(p_intent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_row tmc.checkout_intents%rowtype;
  v_token text;
  v_expires timestamptz;
begin
  if auth.uid() is not null then
    raise exception 'rotate_checkout_login_token is service-role only.' using errcode = '42501';
  end if;

  select * into v_row from tmc.checkout_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'intent_not_found');
  end if;
  if v_row.status <> 'converted' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_row.status);
  end if;

  v_token := tmc._checkout_new_token();
  v_expires := now() + interval '7 days';
  update tmc.checkout_intents
  set login_token_hash = tmc._checkout_token_hash(v_token),
      login_token_expires_at = v_expires,
      login_token_used_at = null
  where id = p_intent_id;

  return jsonb_build_object('ok', true, 'login_token', v_token, 'login_token_expires_at', v_expires);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. auth_user_id_for_email: bestaand account herkennen na email_exists
-- ---------------------------------------------------------------------------

create function tmc.auth_user_id_for_email(p_email text)
returns uuid
language sql
security definer
stable
set search_path to 'tmc', 'extensions'
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
    and u.is_sso_user = false
    and u.deleted_at is null
  order by u.created_at
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 11. Grants: alleen service_role (README regel 7)
-- ---------------------------------------------------------------------------

revoke execute on function tmc.create_checkout_intent(text, text, boolean, boolean, boolean, text, text, text, text, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function tmc.create_checkout_intent(text, text, boolean, boolean, boolean, text, text, text, text, text, text, text, jsonb, text, text, text) to service_role;

revoke execute on function tmc.mark_checkout_intent_pending(uuid, text, text) from public, anon, authenticated;
grant execute on function tmc.mark_checkout_intent_pending(uuid, text, text) to service_role;

revoke execute on function tmc.convert_checkout_intent(uuid, uuid, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function tmc.convert_checkout_intent(uuid, uuid, text, timestamptz, boolean) to service_role;

revoke execute on function tmc.fail_checkout_intent(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function tmc.fail_checkout_intent(uuid, text, timestamptz) to service_role;

revoke execute on function tmc.checkout_intent_status(text) from public, anon, authenticated;
grant execute on function tmc.checkout_intent_status(text) to service_role;

revoke execute on function tmc.consume_checkout_login_token(text) from public, anon, authenticated;
grant execute on function tmc.consume_checkout_login_token(text) to service_role;

revoke execute on function tmc.rotate_checkout_login_token(uuid) from public, anon, authenticated;
grant execute on function tmc.rotate_checkout_login_token(uuid) to service_role;

revoke execute on function tmc.auth_user_id_for_email(text) from public, anon, authenticated;
grant execute on function tmc.auth_user_id_for_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- 12. Zelfcontrole
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_fns text[] := array[
    'tmc.create_checkout_intent(text, text, boolean, boolean, boolean, text, text, text, text, text, text, text, jsonb, text, text, text)',
    'tmc.mark_checkout_intent_pending(uuid, text, text)',
    'tmc.convert_checkout_intent(uuid, uuid, text, timestamptz, boolean)',
    'tmc.fail_checkout_intent(uuid, text, timestamptz)',
    'tmc.checkout_intent_status(text)',
    'tmc.consume_checkout_login_token(text)',
    'tmc.rotate_checkout_login_token(uuid)',
    'tmc.auth_user_id_for_email(text)'
  ];
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'tmc' and c.relname = 'checkout_intents' and c.relrowsecurity
  ) then
    raise exception 'checkout_intents: RLS staat niet aan';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'tmc' and tablename = 'checkout_intents') then
    raise exception 'checkout_intents: er horen geen policies te zijn';
  end if;
  if has_table_privilege('anon', 'tmc.checkout_intents', 'SELECT')
     or has_table_privilege('authenticated', 'tmc.checkout_intents', 'SELECT')
     or has_table_privilege('authenticated', 'tmc.checkout_intents', 'INSERT') then
    raise exception 'checkout_intents: anon of authenticated heeft tabelrechten';
  end if;
  if not has_table_privilege('service_role', 'tmc.checkout_intents', 'SELECT') then
    raise exception 'checkout_intents: service_role mist tabelrechten';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'tmc' and table_name = 'checkout_intents'
      and column_name = 'paid_but_failed' and is_generated = 'ALWAYS'
  ) then
    raise exception 'checkout_intents: paid_but_failed is geen generated column';
  end if;

  foreach v_fn in array v_fns loop
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '%: anon of authenticated mag uitvoeren', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '%: service_role mag niet uitvoeren', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid = v_fn::regprocedure and p.prosecdef
        and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
    ) then
      raise exception '%: geen SECURITY DEFINER met expliciete search_path', v_fn;
    end if;
  end loop;

  if has_function_privilege('service_role', 'tmc._checkout_token_hash(text)', 'EXECUTE')
     or has_function_privilege('service_role', 'tmc._checkout_new_token()', 'EXECUTE') then
    raise exception 'checkout-helpers: interne helpers horen geen grants te hebben';
  end if;
end $$;
