-- WS-2 Phase 3, pre-flight item 3: make the paid-but-blocked state visible.
--
-- Condition 2 in tmc.activate_order() (never mint a second active
-- subscription for a profile that already has one) resolves a late/
-- duplicate payment by flipping the order to status='paid' instead of
-- 'activated' -- money is in, no membership was created. Until now that
-- state was a silent row: nothing pointed an admin at it. This migration
-- adds a queryable, persistent marker (blocked_reason) plus a partial
-- index so ops tooling can find every stuck order in one scan; the app
-- layer (Mollie webhook, WS-2 Phase 3) additionally fires an immediate
-- ntfy alert (sendNotification) the moment this happens, same house
-- pattern as the existing "Early Member claim geweigerd" / "Opzeggingen
-- niet afgerond" alerts.
--
-- Strictly additive. Does not touch pricing_items, membership_plan_catalogue,
-- or any booking_settings column (Migration B, separate). tmc schema only;
-- public/tvmuur untouched; 20260503 placeholder untouched.

begin;

ALTER TABLE "tmc"."orders" ADD COLUMN "blocked_reason" text;

ALTER TABLE "tmc"."orders" ADD CONSTRAINT "orders_blocked_reason_check" CHECK (
  "blocked_reason" IS NULL OR "blocked_reason" IN ('duplicate_membership')
);

COMMENT ON COLUMN "tmc"."orders"."blocked_reason" IS
  'Set by tmc.activate_order() when a paid order cannot activate because the profile already has a membership from a different order (the late-payment-on-a-stale-order case, condition 2). status stays ''paid'' (not ''activated''); this column is the queryable "why is money in with no membership" marker for refund/credit follow-up. NULL for every normal order.';

-- Lets ops tooling (and any future admin view or digest cron) find every
-- stuck order in one cheap scan instead of grepping full-table status.
CREATE INDEX "orders_paid_blocked_idx" ON "tmc"."orders" ("created_at" DESC)
  WHERE "status" = 'paid';

CREATE OR REPLACE FUNCTION tmc.activate_order(
  p_order_id uuid,
  p_mollie_payment_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_order tmc.orders%rowtype;
  v_payment_linked boolean;
  v_existing_id uuid;
  v_membership_id uuid;
  v_source text;
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
      case when v_order.catalogue_slug like 'ten_ride_card%' then 'ten_ride_card' else 'pt_package' end,
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

REVOKE ALL ON FUNCTION tmc.activate_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tmc.activate_order(uuid, text) TO "service_role";

commit;
