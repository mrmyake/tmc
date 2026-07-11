-- WS-5 betaalverzoek-overzicht PR 2: annuleren met betaling-wint-invariant
-- (discovery-ws5-betaalverzoek-overzicht.md sectie 6).
--
-- 1. tmc.orders.cancelled_at: audit-timestamp voor de annulering, zelfde
--    patroon als paid_at/activated_at. Blijft staan als een kruisende
--    betaling de order alsnog activeert: de kolom documenteert dan dat de
--    order op T1 geannuleerd was en de betaling op T2 won.
-- 2. tmc.admin_cancel_order: admin-gated annulering van een openstaand
--    betaalverzoek, onder dezelfde rijlock als tmc.activate_order zodat
--    annuleren en activeren serialiseren. Cancelt alleen draft/pending
--    zonder paid payment; weigert anders met een expliciete reden.
-- 3. tmc.activate_order: 'cancelled' wordt net als 'expired' gehonoreerd,
--    geen aparte nieuwe tak: de statusguard en de late_payment-marker
--    krijgen 'cancelled' erbij, verder is de functie de letterlijke live
--    definitie (pg_get_functiondef, opgehaald 2026-07-11).
--
-- Beide functie-wijzigingen zitten in EEN transactie: er bestaat geen
-- tussenstaat waarin admin_cancel_order al kan annuleren maar een
-- binnenkomende betaling nog niet van 'cancelled' wint.
--
-- De race, uitgeschreven:
-- - Activatie wint de lock eerst: status wordt 'activated' (of 'paid' bij
--   een block), admin_cancel_order ziet dat na de lock-wait en weigert.
-- - Annulering wint de lock eerst: status wordt 'cancelled'; de webhook
--   die daarna activate_order aanroept, activeert de order alsnog
--   (betaling wint). De paid-payment-check in admin_cancel_order dekt
--   daarnaast het venster waarin de webhook de payments-rij (status
--   'paid') al heeft geupsert maar activate_order nog niet is aangeroepen.
-- - Twee gelijktijdige annuleringen: de tweede ziet na de lock-wait
--   status 'cancelled' en krijgt already_cancelled, geen tweede transitie
--   (de UPDATE guard't bovendien zelf op status in ('draft','pending')).
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Geen data-wijziging.

begin;

alter table tmc.orders add column cancelled_at timestamptz;

create or replace function tmc.admin_cancel_order(p_order_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_order tmc.orders%rowtype;
  v_updated integer;
begin
  -- DB-level gate; de aanroepende server action draait daarnaast
  -- requireAdmin() in TS (zelfde laagdeling als tmc.admin_create_order).
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  -- Zelfde rijlock als activate_order: annuleren en activeren serialiseren
  -- op deze rij, er is geen volgorde waarin beide "winnen".
  select * into v_order from tmc.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  -- Dit scherm annuleert uitsluitend admin-betaalverzoeken; self-service
  -- orders hebben hun eigen levenscyclus (abandonOrder + expiry-cron).
  if v_order.created_by <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'not_admin_order');
  end if;

  -- Idempotent: een tweede annulering (bv. twee tabbladen) is geen fout,
  -- maar voert ook geen tweede transitie uit.
  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'already_cancelled', true);
  end if;

  if v_order.status = 'activated' or v_order.activated_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'activated');
  end if;

  -- 'paid' is de geblokkeerd-betaald-status (blocked_reason gezet door
  -- activate_order): geld is binnen, dus annuleren mag niet meer.
  if v_order.status = 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'already_paid');
  end if;

  -- Paid-payment-check: de webhook upsert de payments-rij (status 'paid')
  -- VOOR de activate_order-aanroep, dus dit vangt precies het venster
  -- tussen die twee. Het venster daarvoor (betaald bij Mollie, webhook nog
  -- onderweg, geen rij) is aan de annuleerkant niet afsluitbaar; daar is
  -- de cancelled-honorering in activate_order het sluitstuk.
  if exists (
    select 1 from tmc.payments
    where order_id = v_order.id and status = 'paid'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_paid');
  end if;

  -- Alleen open verzoeken; 'expired' valt hier bewust buiten (niet open,
  -- en annuleren zou de nette verlopen-pagina in een kale 404 veranderen).
  if v_order.status not in ('draft', 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable', 'status', v_order.status);
  end if;

  -- De guard zit ook in het UPDATE zelf: mocht er ooit een pad bestaan dat
  -- de rij muteert zonder deze lock, dan kan deze update nog steeds geen
  -- betaalde of geactiveerde order dood verklaren.
  update tmc.orders
  set status = 'cancelled', cancelled_at = now()
  where id = v_order.id
    and status in ('draft', 'pending')
    and activated_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  end if;

  return jsonb_build_object('ok', true, 'already_cancelled', false);
end;
$function$;

comment on function tmc.admin_cancel_order(uuid) is
  'Annuleert een admin-betaalverzoek (tmc.orders, created_by=admin) onder rijlock. Cancelt alleen draft/pending zonder paid payment; een betaling wint altijd: activate_order honoreert cancelled zoals expired.';

-- Zelfde ACL-profiel als tmc.admin_create_order (postgres, authenticated,
-- service_role): de ingelogde admin-sessie roept dit via rpc() aan en de
-- tmc.is_admin()-gate doet de autorisatie.
revoke all on function tmc.admin_cancel_order(uuid) from public;
revoke all on function tmc.admin_cancel_order(uuid) from anon;
grant execute on function tmc.admin_cancel_order(uuid) to authenticated;
grant execute on function tmc.admin_cancel_order(uuid) to service_role;

-- Hercreatie van de live definitie (pg_get_functiondef 2026-07-11) met
-- exact twee gerichte wijzigingen, gemarkeerd met "PR 2:":
-- de statusguard en de late_payment-marker accepteren nu ook 'cancelled'.
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
    'late_payment', v_order.status in ('expired', 'cancelled')
  );
end;
$function$;

-- ACL-herstel: activate_order is en blijft service-role only (create or
-- replace behoudt de ACL, maar expliciet is deterministisch).
revoke all on function tmc.activate_order(uuid, text) from public;
revoke all on function tmc.activate_order(uuid, text) from anon;
revoke all on function tmc.activate_order(uuid, text) from authenticated;
grant execute on function tmc.activate_order(uuid, text) to service_role;

commit;
