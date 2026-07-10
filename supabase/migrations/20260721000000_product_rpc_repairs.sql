-- Product-RPC-reparaties (discovery-producten-tegoed.md, gaten B3/B4):
--
-- 1. tmc._compute_order_price: de product-branch accepteerde elke actieve
--    catalogusrij, ook drop_in* waarvoor de activatie geen correct pad
--    heeft. Nu een expliciete whitelist van online verkoopbare producten
--    (rittenkaarten en PT/Duo, los en pakket); al het andere krijgt
--    reason 'product_not_supported' vóór er een order ontstaat. Drop-in
--    blijft bewust buiten de pijplijn (besluit 2026-07-10): losse lessen
--    lopen via proefles/check-in, niet via de Kopen-tab.
-- 2. tmc.activate_order: de product-branch classificeerde alles wat niet
--    'ten_ride_card%' heet als 'pt_package', dus ook drop_in. Nu een
--    expliciete slug-naar-plan_type-mapping met een defensieve
--    paid-block (zelfde patroon als duplicate_membership) voor
--    onbekende product-slugs: geld binnen, geen verkeerde credit-rij,
--    ops-alert via de bestaande webhook-afhandeling.
-- 3. tmc.book_pt_credits: maakte geen onderscheid tussen duo- en
--    1-op-1-pakketten (duo-rit 110 euro per 2 personen, 1-op-1-rit 90
--    euro). Nu matcht het pakket op pt_sessions.format via
--    plan_variant (de catalogus-slug die activate_order wegschrijft):
--    duo-sessies vereisen een duo-pakket, 1-op-1-sessies een
--    niet-duo-pakket. small_group_4 heeft geen credit-product en wordt
--    geweigerd met 'format_not_supported'.
--
-- Alle drie de functies zijn hercreaties van de live definities
-- (opgehaald via pg_get_functiondef op 2026-07-10) met alleen de
-- bovenstaande gerichte wijzigingen. Schema tmc only; public en tvmuur
-- onaangeroerd; 20260503 placeholder onaangeroerd. Geen data-wijziging:
-- er bestaan nog geen product-orders (greenfield).

begin;

-- orders.blocked_reason: tweede toegestane waarde naast
-- duplicate_membership, voor de defensieve product-block in activate_order.
alter table tmc.orders drop constraint orders_blocked_reason_check;
alter table tmc.orders add constraint orders_blocked_reason_check
  check (blocked_reason is null or blocked_reason in ('duplicate_membership', 'product_not_supported'));

create or replace function tmc._compute_order_price(p_slug text, p_extended_access boolean, p_commit_24m boolean, p_early_member boolean)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_row tmc.catalogue%rowtype;
  v_ext tmc.catalogue%rowtype;
  v_fee tmc.catalogue%rowtype;
  v_deadline timestamptz;
  v_phase_open boolean;
  v_em_active boolean;
  v_kind text;
  v_base_price integer;
  v_commit_months integer;
  v_ext_price integer := 0;
  v_ext_flag boolean := false;
  v_fee_cents integer := 0;
  v_fee_waiver text := null;
  v_lock boolean := false;
  v_recurring integer;
  v_first_charge integer;
begin
  select * into v_row from tmc.catalogue where slug = p_slug and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'catalogue_row_not_found');
  end if;

  if not v_row.purchasable then
    return jsonb_build_object('ok', false, 'reason', 'not_purchasable');
  end if;

  if v_row.kind not in ('plan', 'product') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  end if;

  v_kind := case when v_row.kind = 'plan' then 'subscription' else 'product' end;

  -- Campaign phase, read fresh in this transaction (never the ISR-cached
  -- value). Condition 1: p_early_member is intent only. It becomes
  -- authoritative (v_em_active) only when the row is EM-eligible AND the
  -- phase is open right now; otherwise it is silently ignored -- never an
  -- error, never a price lever on its own.
  v_deadline := tmc.get_campaign_deadline();
  v_phase_open := v_deadline is not null and now() < v_deadline;
  v_em_active := p_early_member and v_row.early_member_eligible and v_phase_open;

  if v_kind = 'subscription' then
    if v_em_active and p_commit_24m then
      return jsonb_build_object('ok', false, 'reason', 'em_and_24m_exclusive');
    end if;
    if p_commit_24m and v_row.price_cents_24m_computed is null then
      return jsonb_build_object('ok', false, 'reason', 'commit_24m_not_offered');
    end if;

    if p_extended_access then
      if v_row.extended_access_mode = 'addon' then
        select * into v_ext from tmc.catalogue where slug = 'extended_access' and kind = 'addon' and is_active = true;
        if not found then
          raise exception 'extended_access catalogue row missing' using errcode = 'P0001';
        end if;
        v_ext_price := v_ext.price_cents;
        v_ext_flag := true;
      elsif v_row.extended_access_mode = 'included' then
        v_ext_price := 0;
        v_ext_flag := true;
      else
        return jsonb_build_object('ok', false, 'reason', 'extended_access_not_available');
      end if;
    elsif v_row.extended_access_mode = 'included' then
      v_ext_flag := true;
      v_ext_price := 0;
    end if;

    if v_em_active then
      v_base_price := coalesce(v_row.early_member_price_cents, v_row.price_cents);
      v_commit_months := coalesce(v_row.early_member_commit_months, 0);
      v_lock := v_row.early_member_price_lock;
    elsif p_commit_24m then
      v_base_price := v_row.price_cents_24m_computed;
      v_commit_months := 24;
      v_lock := false;
    else
      v_base_price := v_row.price_cents;
      v_commit_months := v_row.commit_months;
      v_lock := false;
    end if;

    select * into v_fee from tmc.catalogue where slug = 'signup_fee' and kind = 'fee' and is_active = true;
    if not found then
      raise exception 'signup_fee catalogue row missing' using errcode = 'P0001';
    end if;
    if v_em_active then
      v_fee_cents := coalesce(v_fee.early_member_price_cents, 0);
      v_fee_waiver := 'early_member';
    else
      v_fee_cents := v_fee.price_cents;
    end if;

    v_recurring := v_base_price + v_ext_price;
    v_first_charge := v_recurring + v_fee_cents;

    return jsonb_build_object(
      'ok', true,
      'kind', v_kind,
      'family', v_row.family,
      'frequency_cap', v_row.frequency_cap,
      'age_category', v_row.age_category,
      'covered_pillars', to_jsonb(v_row.covered_pillars),
      'catalogue', to_jsonb(v_row),
      'deadline', v_deadline,
      'phase_open', v_phase_open,
      'em_active', v_em_active,
      'commit_24m_requested', p_commit_24m,
      'base_price_cents', v_base_price,
      'extended_access', v_ext_flag,
      'extended_access_price_cents', v_ext_price,
      'signup_fee_cents', v_fee_cents,
      'signup_fee_waiver', v_fee_waiver,
      'first_charge_cents', v_first_charge,
      'recurring_cents', v_recurring,
      'billing_cycle_weeks', v_row.billing_cycle_weeks,
      'commit_months', v_commit_months,
      'early_member_price_lock', v_lock
    );
  else
    if p_extended_access or p_commit_24m or p_early_member then
      return jsonb_build_object('ok', false, 'reason', 'invalid_product_options');
    end if;

    -- Whitelist van online verkoopbare producten. Alles wat hier niet in
    -- staat (drop_in*, toekomstige lead-items) kan geen order worden;
    -- activate_order heeft dezelfde set als defensieve tweede laag.
    if not (v_row.slug like 'ten_ride_card%'
            or v_row.slug in ('pt_single', 'pt_10', 'duo_single', 'duo_10')) then
      return jsonb_build_object('ok', false, 'reason', 'product_not_supported');
    end if;

    return jsonb_build_object(
      'ok', true,
      'kind', v_kind,
      'family', v_row.family,
      'age_category', v_row.age_category,
      'credits', v_row.credits,
      'validity_months', v_row.validity_months,
      'catalogue', to_jsonb(v_row),
      'deadline', v_deadline,
      'phase_open', v_phase_open,
      'em_active', false,
      'commit_24m_requested', false,
      'base_price_cents', v_row.price_cents,
      'extended_access', false,
      'extended_access_price_cents', 0,
      'signup_fee_cents', 0,
      'signup_fee_waiver', null,
      'first_charge_cents', v_row.price_cents,
      'recurring_cents', null,
      'billing_cycle_weeks', null,
      'commit_months', null,
      'early_member_price_lock', false
    );
  end if;
end;
$function$;

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
      'mollie_customer_id', v_order.mollie_customer_id
    );
  end if;

  if v_order.status not in ('pending', 'expired') then
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

    insert into tmc.memberships (
      profile_id, plan_type, plan_variant, frequency_cap, age_category,
      price_per_cycle_cents, billing_cycle_weeks, commit_months,
      start_date, status, mollie_customer_id, covered_pillars, source,
      extended_access, extended_access_price_cents, registration_fee_paid,
      lock_in_active, lock_in_source, lock_in_price_cents
    )
    select
      v_order.profile_id, c.family, c.slug, c.frequency_cap, c.age_category,
      v_order.base_price_cents, v_order.billing_cycle_weeks, v_order.commit_months,
      v_today, 'active', v_order.mollie_customer_id, c.covered_pillars, v_source,
      v_order.extended_access, v_order.extended_access_price_cents, true,
      v_order.early_member_price_lock,
      case when v_order.early_member_price_lock then 'early_member' else null end,
      case when v_order.early_member_price_lock
        then v_order.base_price_cents + v_order.extended_access_price_cents
        else null end
    from tmc.catalogue c
    where c.slug = v_order.catalogue_slug
    returning id into v_membership_id;
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
      credits_total, credits_remaining, credits_expires_at,
      registration_fee_paid
    ) values (
      v_order.profile_id,
      v_plan_type,
      v_order.catalogue_slug,
      v_age_category,
      v_order.base_price_cents, 0, 0,
      v_today, 'active',
      case when v_order.created_by = 'admin' then 'admin_manual' else 'direct' end,
      coalesce(v_credits, 1), coalesce(v_credits, 1),
      case when v_validity_months is not null then v_today + make_interval(months => v_validity_months) else null end,
      true
    )
    returning id into v_membership_id;
  end if;

  update tmc.orders
  set status = 'activated', paid_at = coalesce(paid_at, v_now), activated_at = v_now,
      membership_id = v_membership_id
  where id = v_order.id;

  return jsonb_build_object(
    'ok', true,
    'already_activated', false,
    'needs_subscription', v_order.kind = 'subscription',
    'membership_id', v_membership_id,
    'recurring_cents', v_order.recurring_cents,
    'billing_cycle_weeks', v_order.billing_cycle_weeks,
    'mollie_customer_id', v_order.mollie_customer_id,
    'late_payment', v_order.status = 'expired'
  );
end;
$function$;

create or replace function tmc.book_pt_credits(p_pt_session_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_session record;
  v_membership tmc.memberships%rowtype;
  v_booking_id uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select id, status, start_at, format into v_session
  from tmc.pt_sessions where id = p_pt_session_id;

  if v_session.id is null or v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_unavailable');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Alleen formats waar een credit-product voor bestaat; small_group_4
  -- heeft geen rittenkaart en valt buiten dit pad.
  if v_session.format not in ('one_on_one', 'duo') then
    return jsonb_build_object('ok', false, 'reason', 'format_not_supported');
  end if;

  -- Lock op het PT-pakket: credits-check en decrement zijn atomair
  -- (edge-cases 3 en 4) en status wordt onder de lock geverifieerd.
  -- Pakket moet bij het sessie-format horen: een duo-rittenkaart
  -- (plan_variant duo_*) betaalt geen 1-op-1-sessie en omgekeerd
  -- (duo-rit 110 euro per 2 personen, 1-op-1-rit 90 euro). Legacy rijen
  -- zonder plan_variant tellen als 1-op-1.
  select m.* into v_membership
  from tmc.memberships m
  where m.profile_id = v_uid
    and m.status = 'active'
    and m.plan_type = 'pt_package'
    and coalesce(m.credits_remaining, 0) > 0
    and (
      (v_session.format = 'duo' and m.plan_variant like 'duo%')
      or (v_session.format = 'one_on_one'
          and (m.plan_variant is null or m.plan_variant not like 'duo%'))
    )
  order by m.start_date desc
  limit 1
  for update of m;

  if v_membership.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_credits');
  end if;

  begin
    insert into tmc.pt_bookings (
      profile_id, pt_session_id, price_paid_cents, credits_used_from,
      is_intake_discount, status
    ) values (
      v_uid, p_pt_session_id, 0, v_membership.id, false, 'booked'
    )
    returning id into v_booking_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end;

  update tmc.memberships
  set credits_remaining = credits_remaining - 1
  where id = v_membership.id
    and coalesce(credits_remaining, 0) > 0;
  if not found then
    raise exception 'Geen PT-credits meer beschikbaar.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'membership_id', v_membership.id
  );
end;
$function$;

-- Self-verifying: functionele asserts tegen de zojuist gecreëerde
-- definities. Abort bij elke afwijking.
do $$
declare
  v_result jsonb;
  v_constraint text;
begin
  -- drop_in mag geen order meer worden.
  v_result := tmc._compute_order_price('drop_in', false, false, false);
  if (v_result->>'ok')::boolean or v_result->>'reason' is distinct from 'product_not_supported' then
    raise exception 'whitelist faalt: drop_in gaf %', v_result;
  end if;

  -- De verkoopbare producten blijven werken, met de juiste prijs.
  v_result := tmc._compute_order_price('ten_ride_card', false, false, false);
  if not (v_result->>'ok')::boolean or (v_result->>'first_charge_cents')::integer is distinct from 15000 then
    raise exception 'ten_ride_card faalt: %', v_result;
  end if;

  v_result := tmc._compute_order_price('pt_10', false, false, false);
  if not (v_result->>'ok')::boolean or (v_result->>'first_charge_cents')::integer is distinct from 90000 then
    raise exception 'pt_10 faalt: %', v_result;
  end if;

  v_result := tmc._compute_order_price('duo_10', false, false, false);
  if not (v_result->>'ok')::boolean or (v_result->>'first_charge_cents')::integer is distinct from 110000 then
    raise exception 'duo_10 faalt: %', v_result;
  end if;

  -- Abonnementen onaangeroerd door de whitelist.
  v_result := tmc._compute_order_price('groepslessen_2x', false, false, false);
  if not (v_result->>'ok')::boolean then
    raise exception 'groepslessen_2x regressie: %', v_result;
  end if;

  -- Constraint kent de nieuwe blocked_reason.
  select pg_get_constraintdef(oid) into v_constraint
  from pg_constraint where conname = 'orders_blocked_reason_check';
  if v_constraint not like '%product_not_supported%' then
    raise exception 'orders_blocked_reason_check mist product_not_supported: %', v_constraint;
  end if;
end $$;

commit;
