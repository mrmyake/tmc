-- 20260907120000_membership_conditions.sql
--
-- feat/condities-vastleggen (discovery 2026-09-07, akkoord met drie
-- correcties). Twee voorwaarden zijn BLIJVEND voor wie zich voor
-- 1 november 2026 aanmeldt: All Access Onbeperkt voor 139 per 4 weken en
-- geen minimumtermijn. De discovery bewees dat het bedrag en de termijn al
-- op tmc.memberships bevroren staan (price_per_cycle_cents, commit_months,
-- gekopieerd uit het order-snapshot door activate_order) en dat bestaande
-- leden niet meebewegen met catalogusprijzen. Wat ontbrak, en wat deze
-- migratie doet:
--
--   1. Deadline (correctie 1): early_member_pools.closes_at blijft de enige
--      bron via get_campaign_deadline(); geen hardgecodeerde datum in
--      _compute_order_price. Hier: assertie op de waarde
--      (2026-11-01 00:00:00+01:00, wintertijd) en schrijfrechten op de tabel
--      beperkt tot service_role (plus de eigenaar postgres, die migraties
--      draait). Het leespad is SECURITY DEFINER (get_campaign_deadline,
--      get_campaign_window, _compute_order_price, allemaal eigendom van
--      postgres) en raakt tabel-grants dus niet.
--   2. Extended access (correctie 2): all_inclusive_2x en all_inclusive_3x
--      krijgen extended_access_mode = 'included', gelijk aan
--      all_inclusive_unl. Toegang 06:00 tot 23:00 is inbegrepen bij alle
--      All Access-tiers.
--   3. Inschrijfkosten op de membership: signup_fee_cents en
--      signup_fee_waiver, gevuld door activate_order uit de order.
--      registration_fee_paid (altijd true, nergens gelezen) verdwijnt.
--   4. Opzegtermijn op een plek: booking_settings.cancellation_notice_days
--      (default 28), ontsloten via tmc.get_cancellation_notice_days(), gebruikt
--      door request_membership_cancellation en door de UI (via rpc).
--   5. DO-block-asserties (correctie 3, patroon 20260813) die de vier
--      eisen uit de opdracht aantonen, in een sub-transactie die altijd
--      terugrolt.
--
-- Replay: deze migratie leunt nergens op app-data (README regel 6). De
-- testen maken hun eigen auth.users/profiles/memberships-rij aan en rollen
-- die terug; de backfill van signup_fee_cents is voorwaardelijk en raakt
-- 0 rijen op een lege database (en ook op live: 0 memberships).
-- Terugwerkende kracht: geen; bestaande orders/memberships zijn er niet.

begin;

-- ===========================================================================
-- 1. Deadline: waarde bevestigen en schrijfrechten beperken (correctie 1)
-- ===========================================================================

do $$
declare
  v_rows int;
  v_wrong int;
begin
  select count(*), count(*) filter (where closes_at <> timestamptz '2026-11-01 00:00:00+01')
    into v_rows, v_wrong
  from tmc.early_member_pools;
  if v_rows = 0 then
    raise exception 'membership_conditions: tmc.early_member_pools is leeg, geen deadline';
  end if;
  if v_wrong <> 0 then
    raise exception 'membership_conditions: % rij(en) hebben closes_at <> 2026-11-01 00:00:00+01 (wintertijd)', v_wrong;
  end if;
  -- Expliciete wintertijd-controle: dezelfde instant is NIET gelijk aan de
  -- zomertijd-variant, en in Europe/Amsterdam is het middernacht.
  if exists (select 1 from tmc.early_member_pools where closes_at = timestamptz '2026-11-01 00:00:00+02') then
    raise exception 'membership_conditions: closes_at staat op de zomertijd-variant (+02:00)';
  end if;
  if exists (
    select 1 from tmc.early_member_pools
    where to_char(closes_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD HH24:MI:SS') <> '2026-11-01 00:00:00'
  ) then
    raise exception 'membership_conditions: closes_at is in Europe/Amsterdam geen middernacht 1 november';
  end if;
end $$;

-- Schrijfrechten: alleen service_role (en de eigenaar postgres). anon en
-- authenticated hadden al geen schrijfrechten (gemeten 2026-09-07:
-- authenticated SELECT via RLS-policy early_member_pools_admin_read, anon
-- niets); dit maakt dat expliciet en asserteert het, zodat een latere grant
-- niet stil kan binnensluipen.
revoke insert, update, delete, truncate, references, trigger
  on tmc.early_member_pools from public, anon, authenticated;

comment on table tmc.early_member_pools is
  'Bron van de Early Member-deadline (closes_at, via get_campaign_deadline()). '
  'Schrijven uitsluitend via migraties (postgres) of service_role; anon en '
  'authenticated hebben geen insert/update/delete (sinds 20260907120000). '
  'Lezen loopt via SECURITY DEFINER-functies en is onafhankelijk van deze grants.';

do $$
begin
  if has_table_privilege('anon', 'tmc.early_member_pools', 'insert')
     or has_table_privilege('anon', 'tmc.early_member_pools', 'update')
     or has_table_privilege('anon', 'tmc.early_member_pools', 'delete')
     or has_table_privilege('authenticated', 'tmc.early_member_pools', 'insert')
     or has_table_privilege('authenticated', 'tmc.early_member_pools', 'update')
     or has_table_privilege('authenticated', 'tmc.early_member_pools', 'delete') then
    raise exception 'membership_conditions: anon/authenticated hebben nog schrijfrechten op early_member_pools';
  end if;
  if not (has_table_privilege('service_role', 'tmc.early_member_pools', 'insert')
          and has_table_privilege('service_role', 'tmc.early_member_pools', 'update')) then
    raise exception 'membership_conditions: service_role mist schrijfrechten op early_member_pools';
  end if;
  -- Leespad intact: de drie lezers zijn SECURITY DEFINER van postgres en de
  -- app-rollen mogen ze aanroepen.
  if not (
        has_function_privilege('anon', 'tmc.get_campaign_deadline()', 'execute')
    and has_function_privilege('authenticated', 'tmc.get_campaign_deadline()', 'execute')
    and has_function_privilege('service_role', 'tmc.get_campaign_deadline()', 'execute')
    and has_function_privilege('anon', 'tmc.get_campaign_window()', 'execute')
    and has_function_privilege('authenticated', 'tmc.get_campaign_window()', 'execute')
    and has_function_privilege('service_role', 'tmc.get_campaign_window()', 'execute')
  ) then
    raise exception 'membership_conditions: leespad get_campaign_deadline/get_campaign_window mist een execute-grant';
  end if;
  if exists (
    select 1 from pg_proc
    where pronamespace = 'tmc'::regnamespace
      and proname in ('get_campaign_deadline', 'get_campaign_window', '_compute_order_price')
      and (not prosecdef or pg_get_userbyid(proowner) <> 'postgres')
  ) then
    raise exception 'membership_conditions: een lezer van early_member_pools is geen SECURITY DEFINER van postgres';
  end if;
  if tmc.get_campaign_deadline() <> timestamptz '2026-11-01 00:00:00+01' then
    raise exception 'membership_conditions: get_campaign_deadline() geeft niet de verwachte deadline';
  end if;
end $$;

-- ===========================================================================
-- 2. Extended access inbegrepen bij alle All Access-tiers (correctie 2)
-- ===========================================================================

update tmc.catalogue
set extended_access_mode = 'included'
where slug in ('all_inclusive_2x', 'all_inclusive_3x')
  and extended_access_mode <> 'included';

do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
  from tmc.catalogue
  where family = 'all_inclusive' and extended_access_mode <> 'included';
  if v_bad <> 0 then
    raise exception 'membership_conditions: % All Access-rij(en) zonder extended_access_mode = included', v_bad;
  end if;
end $$;

comment on column tmc.catalogue.extended_access_mode is
  'included = verlengde toegang (06:00-23:00) zit in de prijs; addon = los bij te kopen via de extended_access-rij; na = niet beschikbaar. Sinds 20260907120000 included op alle drie de All Access-tiers.';

-- ===========================================================================
-- 3. Inschrijfkosten op de membership, registration_fee_paid weg
-- ===========================================================================

alter table tmc.memberships
  add column if not exists signup_fee_cents integer not null default 0,
  add column if not exists signup_fee_waiver text;

alter table tmc.memberships
  drop constraint if exists memberships_signup_fee_cents_check,
  add constraint memberships_signup_fee_cents_check check (signup_fee_cents >= 0),
  drop constraint if exists memberships_signup_fee_waiver_check,
  add constraint memberships_signup_fee_waiver_check
    check (signup_fee_waiver is null or signup_fee_waiver in ('early_member', 'overstap'));

comment on column tmc.memberships.signup_fee_cents is
  'Inschrijfkosten die bij aanmelding werkelijk in rekening zijn gebracht (0 bij een waiver), bevroren uit orders.signup_fee_cents door activate_order. Wijzigt nooit door catalogusmutaties.';
comment on column tmc.memberships.signup_fee_waiver is
  'Reden waarom de inschrijfkosten 0 waren: early_member of overstap; null als ze gewoon betaald zijn. Bevroren uit orders.signup_fee_waiver.';

-- Backfill uit de order waaruit de membership ontstond. Voorwaardelijk:
-- raakt alleen memberships met een gekoppelde order (0 rijen op een lege
-- database en, na de opruiming van 20260907, ook 0 op live).
update tmc.memberships m
set signup_fee_cents = o.signup_fee_cents,
    signup_fee_waiver = o.signup_fee_waiver
from tmc.orders o
where o.membership_id = m.id
  and o.kind = 'subscription';

-- activate_order: schrijft de twee kolommen uit de order en niet langer
-- registration_fee_paid. Verder letterlijk de live definitie
-- (pg_get_functiondef, 2026-09-07).
create or replace function tmc.activate_order(p_order_id uuid, p_mollie_payment_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_order tmc.orders%rowtype;
  v_payment_linked boolean;
  v_existing_id uuid;
  v_membership_id uuid;
  v_source text;
  v_plan_type text;
  v_credits integer;
  v_validity_months integer;
  v_age_category text;
  v_is_pt_order boolean;
  v_now timestamptz := now();
  v_today date := current_date;
begin
  if auth.uid() is not null then
    raise exception 'activate_order is service-role only.' using errcode = '42501';
  end if;

  select * into v_order from tmc.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  v_is_pt_order := v_order.pt_session_id is not null
    or v_order.catalogue_slug in ('program_studio_12w', 'program_online_12w');

  v_payment_linked := v_order.mollie_payment_id = p_mollie_payment_id
    or exists (
      select 1 from tmc.payments
      where order_id = v_order.id and mollie_payment_id = p_mollie_payment_id
    );
  if not v_payment_linked then
    return jsonb_build_object('ok', false, 'reason', 'payment_order_mismatch');
  end if;

  if v_order.status = 'activated' then
    return jsonb_build_object(
      'ok', true,
      'already_activated', true,
      'needs_subscription', v_order.kind = 'subscription'
        and v_order.membership_id is not null
        and not exists (
          select 1 from tmc.memberships
          where id = v_order.membership_id and mollie_subscription_id is not null
        ),
      'membership_id', v_order.membership_id,
      'recurring_cents', v_order.recurring_cents,
      'billing_cycle_weeks', v_order.billing_cycle_weeks,
      'mollie_customer_id', v_order.mollie_customer_id,
      'pt_order', v_is_pt_order
    );
  end if;

  -- PR 2: 'cancelled' wordt gehonoreerd zoals 'expired' (betaling wint van
  -- annuleren, zelfde patroon als de late betaling). 'draft' blijft bewust
  -- geweigerd: een payment ontstaat pas na markOrderPending.
  if v_order.status not in ('pending', 'expired', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_order.status);
  end if;

  if v_order.kind = 'subscription' then
    select id into v_existing_id
    from tmc.memberships
    where profile_id = v_order.profile_id
      and status in ('pending', 'active', 'paused', 'cancellation_requested')
    limit 1;
    if found then
      -- Condition 2: money in, no second mandate. blocked_reason is the
      -- persistent "why" marker (new); the caller (webhook) alerts on the
      -- returned reason the moment this happens.
      update tmc.orders
      set status = 'paid', paid_at = v_now, blocked_reason = 'duplicate_membership'
      where id = v_order.id;
      return jsonb_build_object('ok', false, 'reason', 'blocked_duplicate_membership', 'existing_membership_id', v_existing_id);
    end if;

    v_source := case
      when v_order.early_member then 'early_member'
      when v_order.created_by = 'admin' then 'admin_manual'
      else 'direct'
    end;

    -- De voorwaarden worden hier bevroren uit het order-snapshot: bedrag
    -- (price_per_cycle_cents + extended_access_price_cents), termijn
    -- (commit_months, 0 bij Early Member), inschrijfkosten
    -- (signup_fee_cents + signup_fee_waiver) en aanmelddatum (start_date).
    -- Er wordt niet uit tmc.catalogue gelezen behalve voor structuur
    -- (family, frequency_cap, covered_pillars, age_category).
    insert into tmc.memberships (
      profile_id, plan_type, plan_variant, frequency_cap, age_category,
      price_per_cycle_cents, billing_cycle_weeks, commit_months,
      start_date, status, mollie_customer_id, covered_pillars, source,
      extended_access, extended_access_price_cents,
      signup_fee_cents, signup_fee_waiver,
      lock_in_active, lock_in_source, lock_in_price_cents
    )
    select
      v_order.profile_id, c.family, c.slug, c.frequency_cap, c.age_category,
      v_order.base_price_cents, v_order.billing_cycle_weeks, v_order.commit_months,
      v_today, 'active', v_order.mollie_customer_id, c.covered_pillars, v_source,
      v_order.extended_access, v_order.extended_access_price_cents,
      v_order.signup_fee_cents, v_order.signup_fee_waiver,
      v_order.early_member_price_lock,
      case when v_order.early_member_price_lock then 'early_member' else null end,
      case when v_order.early_member_price_lock
        then v_order.base_price_cents + v_order.extended_access_price_cents
        else null end
    from tmc.catalogue c
    where c.slug = v_order.catalogue_slug
    returning id into v_membership_id;
  elsif v_is_pt_order then
    -- PT-agenda C1: het geld betaalt een al geboekte PT-sessie of een
    -- 12-weken-programma. Geen membership, geen credits; de sessie(s)
    -- en het pt_programs-record bestaan al (payment_ref = deze order).
    v_membership_id := null;
  else
    -- Expliciete slug-naar-plan_type-mapping, zelfde whitelist als
    -- _compute_order_price. De else-tak is de defensieve paid-block:
    -- geld is binnen (webhook-context) maar er mag geen verkeerd
    -- geclassificeerde credit-rij ontstaan. Zelfde patroon als
    -- duplicate_membership hierboven; de webhook alert op de reason.
    v_plan_type := case
      when v_order.catalogue_slug like 'ten_ride_card%' then 'ten_ride_card'
      when v_order.catalogue_slug in ('pt_single', 'pt_10', 'duo_single', 'duo_10') then 'pt_package'
      else null
    end;
    if v_plan_type is null then
      update tmc.orders
      set status = 'paid', paid_at = v_now, blocked_reason = 'product_not_supported'
      where id = v_order.id;
      return jsonb_build_object('ok', false, 'reason', 'blocked_product_not_supported');
    end if;

    select credits, validity_months, age_category into v_credits, v_validity_months, v_age_category
    from tmc.catalogue where slug = v_order.catalogue_slug;

    insert into tmc.memberships (
      profile_id, plan_type, plan_variant, age_category,
      price_per_cycle_cents, billing_cycle_weeks, commit_months,
      start_date, status, source,
      credits_total, credits_remaining, credits_expires_at
    ) values (
      v_order.profile_id,
      v_plan_type,
      v_order.catalogue_slug,
      v_age_category,
      v_order.base_price_cents, 0, 0,
      v_today, 'active',
      case when v_order.created_by = 'admin' then 'admin_manual' else 'direct' end,
      coalesce(v_credits, 1), coalesce(v_credits, 1),
      case when v_validity_months is not null then v_today + make_interval(months => v_validity_months) else null end
    )
    returning id into v_membership_id;
  end if;

  update tmc.orders
  set status = 'activated', paid_at = coalesce(paid_at, v_now), activated_at = v_now,
      membership_id = v_membership_id
  where id = v_order.id;

  -- PR 2: late_payment dekt nu ook de gehonoreerde betaling op een
  -- geannuleerde order; cancelled_at blijft staan als audit-spoor.
  return jsonb_build_object(
    'ok', true,
    'already_activated', false,
    'needs_subscription', v_order.kind = 'subscription',
    'membership_id', v_membership_id,
    'recurring_cents', v_order.recurring_cents,
    'billing_cycle_weeks', v_order.billing_cycle_weeks,
    'mollie_customer_id', v_order.mollie_customer_id,
    'late_payment', v_order.status in ('expired', 'cancelled'),
    'pt_order', v_is_pt_order
  );
end;
$function$;

-- Grants activate_order: signatuur ongewijzigd, ACL blijft (service_role
-- only). Geasserteerd, niet aangenomen.
do $$
begin
  if has_function_privilege('anon', 'tmc.activate_order(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'tmc.activate_order(uuid, text)', 'execute')
     or not has_function_privilege('service_role', 'tmc.activate_order(uuid, text)', 'execute') then
    raise exception 'membership_conditions: execute-grants op activate_order staan niet zoals bedoeld';
  end if;
end $$;

-- registration_fee_paid: lezers-controle voor het droppen. Gecontroleerd:
-- functiebodies (pg_proc.prosrc, na de vervanging van activate_order
-- hierboven), views, materialized views, RLS-policies, triggerfuncties,
-- generated columns/defaults (pg_depend) en rowtype-gebruikers.
-- %rowtype-variabelen breken niet op een kolomdrop (ze worden bij de
-- aanroep opgelost), maar een functie die de kolom bij naam noemt wel;
-- die set is na de replace leeg. TypeScript: alleen types/supabase.ts
-- (verouderd, nergens geimporteerd), gecontroleerd met grep.
do $$
declare
  v_readers text;
  v_rows int;
begin
  select string_agg(kind || ':' || name, ', ') into v_readers
  from (
    select 'function' as kind, proname::text as name from pg_proc
      where pronamespace = 'tmc'::regnamespace and prosrc ilike '%registration_fee_paid%'
    union all
    select 'view', viewname from pg_views where schemaname = 'tmc' and definition ilike '%registration_fee_paid%'
    union all
    select 'matview', matviewname from pg_matviews where schemaname = 'tmc' and definition ilike '%registration_fee_paid%'
    union all
    select 'policy', policyname || ' on ' || tablename from pg_policies
      where schemaname = 'tmc' and (coalesce(qual, '') ilike '%registration_fee_paid%' or coalesce(with_check, '') ilike '%registration_fee_paid%')
    union all
    select 'dependency', d.classid::regclass::text from pg_depend d
      join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
      where d.refobjid = 'tmc.memberships'::regclass and a.attname = 'registration_fee_paid'
        and d.deptype <> 'i' and d.classid <> 'pg_attrdef'::regclass
  ) r;
  if v_readers is not null then
    raise exception 'membership_conditions: registration_fee_paid heeft nog lezers: %', v_readers;
  end if;

  select count(*) into v_rows from tmc.memberships;
  raise notice 'membership_conditions: tmc.memberships heeft % rij(en) op het moment van droppen', v_rows;
end $$;

alter table tmc.memberships drop column if exists registration_fee_paid;

-- ===========================================================================
-- 4. Opzegtermijn op een plek
-- ===========================================================================

alter table tmc.booking_settings
  add column if not exists cancellation_notice_days integer not null default 28;

alter table tmc.booking_settings
  drop constraint if exists booking_settings_cancellation_notice_days_check,
  add constraint booking_settings_cancellation_notice_days_check
    check (cancellation_notice_days > 0);

comment on column tmc.booking_settings.cancellation_notice_days is
  'Opzegtermijn in dagen na de minimumtermijn (commit_end_date). Enige bron: request_membership_cancellation rekent ermee en de UI leest hem via get_cancellation_notice_days().';

create or replace function tmc.get_cancellation_notice_days()
returns integer
language sql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
  select coalesce(
    (select cancellation_notice_days from tmc.booking_settings where id = 'singleton'),
    28
  );
$function$;

comment on function tmc.get_cancellation_notice_days() is
  'Opzegtermijn in dagen uit booking_settings.cancellation_notice_days (default 28). Publieke leesfunctie, zelfde patroon als get_campaign_deadline().';

revoke execute on function tmc.get_cancellation_notice_days() from public;
grant execute on function tmc.get_cancellation_notice_days() to anon, authenticated, service_role;

create or replace function tmc.request_membership_cancellation(p_membership_id uuid)
 returns table(id uuid, status text, cancellation_requested_at timestamp with time zone, cancellation_effective_date date)
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_status text;
  v_commit_end_date date;
  v_effective_date date;
  v_notice_days integer := tmc.get_cancellation_notice_days();
begin
  select m.status, m.commit_end_date
    into v_status, v_commit_end_date
  from tmc.memberships m
  where m.id = p_membership_id
    and m.profile_id = auth.uid();

  if v_status is null then
    raise exception 'Abonnement niet gevonden.' using errcode = '42501';
  end if;

  if v_status = 'cancellation_requested' then
    raise exception 'Je opzegverzoek staat al open.';
  end if;

  if v_status not in ('active', 'paused', 'payment_failed') then
    raise exception 'Dit abonnement kan niet worden opgezegd.';
  end if;

  -- Opzegtermijn uit booking_settings (was hardgecodeerd 28). Met
  -- commit_months = 0 is commit_end_date = start_date, dus direct per
  -- opzegtermijn opzegbaar.
  v_effective_date := greatest(v_commit_end_date, current_date + v_notice_days);

  return query
  update tmc.memberships m
  set status = 'cancellation_requested',
      cancellation_requested_at = now(),
      cancellation_effective_date = v_effective_date,
      -- Provenance voor admin_undo_cancellation: een lid-opzegging is een
      -- pure drie-velden-mutatie en daarmee (vanuit 'active') veilig
      -- terugdraaibaar zolang de cron niet geeffectueerd heeft.
      cancellation_source = 'member',
      cancellation_prior_status = v_status
  where m.id = p_membership_id
    and m.profile_id = auth.uid()
  returning m.id, m.status, m.cancellation_requested_at, m.cancellation_effective_date;
end;
$function$;

do $$
begin
  if tmc.get_cancellation_notice_days() <> 28 then
    raise exception 'membership_conditions: get_cancellation_notice_days() geeft niet 28';
  end if;
  if not has_function_privilege('anon', 'tmc.get_cancellation_notice_days()', 'execute')
     or not has_function_privilege('authenticated', 'tmc.get_cancellation_notice_days()', 'execute')
     or not has_function_privilege('service_role', 'tmc.get_cancellation_notice_days()', 'execute') then
    raise exception 'membership_conditions: execute-grants op get_cancellation_notice_days ontbreken';
  end if;
  -- request_membership_cancellation: signatuur ongewijzigd, ACL blijft
  -- (authenticated only, gemeten 2026-09-07).
  if has_function_privilege('anon', 'tmc.request_membership_cancellation(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'tmc.request_membership_cancellation(uuid)', 'execute') then
    raise exception 'membership_conditions: execute-grants op request_membership_cancellation staan niet zoals bedoeld';
  end if;
end $$;

-- ===========================================================================
-- 5. Asserties (correctie 3): de vier eisen uit de opdracht, in een
--    sub-transactie die altijd terugrolt. Eigen testdata (auth.users +
--    profiel via de bestaande trigger, membership, tijdelijke
--    catalogus- en deadline-wijziging), nooit app-data.
-- ===========================================================================

do $$
declare
  v_r jsonb;
  v_uid uuid := gen_random_uuid();
  v_mid uuid;
  v_price integer;
  v_factor numeric;
  v_now_before_deadline boolean;
begin
  begin
    -- (c) Voor de deadline: 13900, 0 inschrijfkosten, commit_months 0.
    select now() < tmc.get_campaign_deadline() into v_now_before_deadline;
    if not v_now_before_deadline then
      raise exception 'membership_conditions test: now() ligt al na de deadline, test (c) niet uitvoerbaar';
    end if;
    v_r := tmc._compute_order_price('all_inclusive_unl', false, false, true, false);
    if not (v_r->>'ok')::boolean
       or (v_r->>'em_active')::boolean is distinct from true
       or (v_r->>'base_price_cents')::integer <> 13900
       or (v_r->>'signup_fee_cents')::integer <> 0
       or (v_r->>'commit_months')::integer <> 0
       or (v_r->>'recurring_cents')::integer <> 13900
       or (v_r->>'first_charge_cents')::integer <> 13900 then
      raise exception 'membership_conditions test (c) faalt: %', v_r;
    end if;

    -- (d) All Access 2x en 3x: geen extended access add-on meer, met en
    --     zonder p_extended_access.
    foreach v_price in array array[10900, 12900] loop
      v_r := tmc._compute_order_price(
        case v_price when 10900 then 'all_inclusive_2x' else 'all_inclusive_3x' end,
        true, false, false, false);
      if not (v_r->>'ok')::boolean
         or (v_r->>'extended_access')::boolean is distinct from true
         or (v_r->>'extended_access_price_cents')::integer <> 0
         or (v_r->>'recurring_cents')::integer <> v_price then
        raise exception 'membership_conditions test (d, p_extended_access=true) faalt: %', v_r;
      end if;
      v_r := tmc._compute_order_price(
        case v_price when 10900 then 'all_inclusive_2x' else 'all_inclusive_3x' end,
        false, false, false, false);
      if not (v_r->>'ok')::boolean
         or (v_r->>'extended_access')::boolean is distinct from true
         or (v_r->>'extended_access_price_cents')::integer <> 0
         or (v_r->>'recurring_cents')::integer <> v_price then
        raise exception 'membership_conditions test (d, p_extended_access=false) faalt: %', v_r;
      end if;
    end loop;

    -- (a) Een membership met 13900 behoudt dat bedrag als de catalogus naar
    --     15500 gaat. Eigen auth-user (de trigger on_auth_user_created maakt
    --     het profiel), eigen membership; alles rolt hieronder terug.
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'zelfcontrole-condities@test.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"first_name":"Zelfcontrole","last_name":"Condities"}'::jsonb, now(), now()
    );
    if not exists (select 1 from tmc.profiles where id = v_uid) then
      insert into tmc.profiles (id, email, first_name, last_name, member_code)
      values (v_uid, 'zelfcontrole-condities@test.invalid', 'Zelfcontrole', 'Condities', '999999');
    end if;

    insert into tmc.memberships (
      profile_id, plan_type, plan_variant, age_category,
      price_per_cycle_cents, billing_cycle_weeks, commit_months,
      start_date, status, covered_pillars, source,
      extended_access, extended_access_price_cents,
      signup_fee_cents, signup_fee_waiver
    ) values (
      v_uid, 'all_inclusive', 'all_inclusive_unl', 'adult',
      13900, 4, 0,
      current_date, 'active', array['vrij_trainen', 'yoga_mobility', 'kettlebell'], 'early_member',
      true, 0,
      0, 'early_member'
    )
    returning id into v_mid;

    -- Minimumtermijn 0: commit_end_date = start_date (trigger), dus direct
    -- per opzegtermijn opzegbaar.
    if (select commit_end_date from tmc.memberships where id = v_mid) <> current_date then
      raise exception 'membership_conditions test (a): commit_end_date bij commit_months 0 is niet start_date';
    end if;

    select commit_24m_discount_factor into v_factor from tmc.catalogue where slug = 'all_inclusive_unl';
    update tmc.catalogue
    set price_cents = 15500,
        price_cents_24m_override = (floor(15500 * v_factor / 100) * 100)::integer
    where slug = 'all_inclusive_unl';

    if (select price_per_cycle_cents from tmc.memberships where id = v_mid) <> 13900 then
      raise exception 'membership_conditions test (a) faalt: membership beweegt mee met de catalogus';
    end if;
    -- Ter controle dat de catalogus echt bewoog: een NIEUWE reguliere order
    -- rekent nu wel 15500.
    v_r := tmc._compute_order_price('all_inclusive_unl', false, false, false, false);
    if (v_r->>'base_price_cents')::integer <> 15500 then
      raise exception 'membership_conditions test (a): catalogusprijs niet doorgevoerd voor nieuwe orders: %', v_r;
    end if;
    -- Catalogus terug voor test (b), binnen dezelfde sub-transactie.
    update tmc.catalogue
    set price_cents = 14900,
        price_cents_24m_override = (floor(14900 * v_factor / 100) * 100)::integer
    where slug = 'all_inclusive_unl';

    -- (b) Na de deadline: 14900 en 3900 inschrijfkosten, ongeacht wat de
    --     client meestuurt (p_early_member = true).
    update tmc.early_member_pools set closes_at = now() - interval '1 day';
    v_r := tmc._compute_order_price('all_inclusive_unl', false, false, true, false);
    if not (v_r->>'ok')::boolean
       or (v_r->>'em_active')::boolean is distinct from false
       or (v_r->>'base_price_cents')::integer <> 14900
       or (v_r->>'signup_fee_cents')::integer <> 3900
       or (v_r->>'commit_months')::integer <> 12
       or (v_r->>'first_charge_cents')::integer <> 18800 then
      raise exception 'membership_conditions test (b) faalt: %', v_r;
    end if;

    raise exception using message = '__membership_conditions_test_rollback__';
  exception when others then
    if sqlerrm <> '__membership_conditions_test_rollback__' then
      raise;
    end if;
    -- Alle vier geslaagd; de sub-transactie is teruggerold.
  end;
end $$;

-- Na de rollback: deadline en catalogus staan zoals voor de test.
do $$
begin
  if exists (select 1 from tmc.early_member_pools where closes_at <> timestamptz '2026-11-01 00:00:00+01') then
    raise exception 'membership_conditions: closes_at na de test-rollback niet meer 2026-11-01 00:00:00+01';
  end if;
  if (select price_cents from tmc.catalogue where slug = 'all_inclusive_unl') <> 14900 then
    raise exception 'membership_conditions: catalogusprijs all_inclusive_unl na de test-rollback niet meer 14900';
  end if;
  if exists (select 1 from auth.users where email = 'zelfcontrole-condities@test.invalid') then
    raise exception 'membership_conditions: test-user niet teruggerold';
  end if;
end $$;

commit;
