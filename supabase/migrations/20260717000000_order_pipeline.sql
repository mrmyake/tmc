-- WS-2: tmc.orders, the order pipeline spine (additive only).
--
-- Approved design: ws2-order-pipeline-design.md (2026-07-09), locked with
-- two conditions: (1) the client-sent earlyMember flag is never authoritative
-- on its own, it only applies when tmc.get_campaign_deadline() says the
-- phase is open right now, checked server-side in the same transaction as
-- the price computation; (2) tmc.activate_order() must never create a
-- second active subscription for a profile that already has one.
--
-- This migration creates tmc.orders, two small additive columns
-- (tmc.payments.order_id, tmc.profiles.mollie_customer_id), a private
-- pricing helper, and the three SECURITY DEFINER RPCs. It does not touch,
-- drop, or alter tmc.pricing_items, tmc.membership_plan_catalogue, or any
-- booking_settings price column (Migration B, still pending, unrelated to
-- this PR). It does not touch public or tvmuur, and does not modify the
-- 20260503 placeholder.
--
-- tmc.orders carries NO insert/update/delete grant for the authenticated
-- role: the only way to create or transition a row is through the three
-- RPCs below (create_order, admin_create_order: definer, run as table
-- owner; activate_order: service-role only). This is what makes "one
-- order-creating path" a DB-enforced fact rather than a convention.

begin;

-- ---------------------------------------------------------------------------
-- 1. tmc.orders
-- ---------------------------------------------------------------------------

CREATE TABLE "tmc"."orders" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "profile_id" uuid NOT NULL,
    "kind" text NOT NULL,
    "catalogue_slug" text NOT NULL,

    -- Selection (choices only, no amounts; see tmc._compute_order_price).
    "extended_access" boolean DEFAULT false NOT NULL,
    "commit_months" integer,
    "early_member" boolean DEFAULT false NOT NULL,
    "class_session_id" uuid,
    "pt_session_id" uuid,

    -- Price snapshot, server-written once in create_order/admin_create_order,
    -- never recomputed or updated afterwards. activate_order reads only
    -- these columns, never tmc.catalogue, so a later price change cannot
    -- alter an order already placed.
    "base_price_cents" integer NOT NULL,
    "extended_access_price_cents" integer DEFAULT 0 NOT NULL,
    "signup_fee_cents" integer DEFAULT 0 NOT NULL,
    "first_charge_cents" integer NOT NULL,
    "recurring_cents" integer,
    "billing_cycle_weeks" integer,
    "early_member_price_lock" boolean DEFAULT false NOT NULL,
    "signup_fee_waiver" text,
    "pricing_snapshot" jsonb NOT NULL,

    -- Provenance.
    "created_by" text NOT NULL,
    "created_by_profile_id" uuid,

    -- Mollie.
    "mollie_customer_id" text,
    "mollie_payment_id" text,

    -- Lifecycle.
    "status" text DEFAULT 'draft' NOT NULL,
    "token" uuid DEFAULT gen_random_uuid() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "paid_at" timestamp with time zone,
    "activated_at" timestamp with time zone,
    "membership_id" uuid,

    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_token_key" UNIQUE ("token"),
    CONSTRAINT "orders_mollie_payment_id_key" UNIQUE ("mollie_payment_id"),
    CONSTRAINT "orders_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "tmc"."profiles"("id"),
    CONSTRAINT "orders_created_by_profile_id_fkey" FOREIGN KEY ("created_by_profile_id") REFERENCES "tmc"."profiles"("id"),
    CONSTRAINT "orders_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "tmc"."class_sessions"("id"),
    CONSTRAINT "orders_pt_session_id_fkey" FOREIGN KEY ("pt_session_id") REFERENCES "tmc"."pt_sessions"("id"),
    CONSTRAINT "orders_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "tmc"."memberships"("id"),
    CONSTRAINT "orders_kind_check" CHECK ("kind" IN ('subscription', 'product')),
    CONSTRAINT "orders_status_check" CHECK ("status" IN ('draft', 'pending', 'paid', 'activated', 'expired', 'cancelled')),
    CONSTRAINT "orders_created_by_check" CHECK ("created_by" IN ('self', 'admin')),
    CONSTRAINT "orders_signup_fee_waiver_check" CHECK ("signup_fee_waiver" IS NULL OR "signup_fee_waiver" IN ('early_member', 'overstap')),
    CONSTRAINT "orders_base_price_cents_check" CHECK ("base_price_cents" >= 0),
    CONSTRAINT "orders_first_charge_cents_check" CHECK ("first_charge_cents" >= 0),
    -- Subscription rows carry recurring/billing/commit data; product rows do not.
    CONSTRAINT "orders_subscription_shape_check" CHECK (
      ("kind" = 'subscription') = ("recurring_cents" IS NOT NULL AND "billing_cycle_weeks" IS NOT NULL AND "commit_months" IS NOT NULL)
    ),
    -- Admin-created orders always record who created them.
    CONSTRAINT "orders_admin_provenance_check" CHECK (
      ("created_by" = 'admin') = ("created_by_profile_id" IS NOT NULL)
    )
);

ALTER TABLE "tmc"."orders" OWNER TO "postgres";

COMMENT ON TABLE "tmc"."orders" IS
  'The order pipeline spine. Holds a buyer selection plus a server-written price snapshot; a client never supplies an amount. Only tmc.create_order, tmc.admin_create_order (insert) and tmc.activate_order (the pending-to-activated transition) may write here -- no INSERT/UPDATE/DELETE grant exists for the authenticated role, so this is DB-enforced, not conventional. Replaces the single startSignup insert-into-memberships path.';

COMMENT ON COLUMN "tmc"."orders"."pricing_snapshot" IS
  'Audit trail: the catalogue row as read, the campaign deadline and phase at read time, and the computation inputs. Never used to recompute a charge; base_price_cents/extended_access_price_cents/signup_fee_cents/first_charge_cents/recurring_cents are the numbers actually charged and snapshotted onto the membership at activation.';

COMMENT ON COLUMN "tmc"."orders"."early_member" IS
  'Whether the Early Member benefit was actually applied (server-decided in tmc._compute_order_price against tmc.get_campaign_deadline() at order-creation time), not whether the client requested it. A request outside the campaign phase is silently ignored, never an error and never a price lever on its own.';

CREATE OR REPLACE TRIGGER "orders_touch_updated_at"
    BEFORE UPDATE ON "tmc"."orders"
    FOR EACH ROW EXECUTE FUNCTION "tmc"."touch_updated_at"();

CREATE INDEX "orders_status_expires_idx" ON "tmc"."orders" ("status", "expires_at");
CREATE INDEX "orders_profile_idx" ON "tmc"."orders" ("profile_id");

-- At most one open (draft/pending) subscription order per profile. Products
-- may stack (buying two rittenkaarten in a row is fine).
CREATE UNIQUE INDEX "orders_one_open_subscription_idx" ON "tmc"."orders" ("profile_id")
  WHERE "kind" = 'subscription' AND "status" IN ('draft', 'pending');

ALTER TABLE "tmc"."orders" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_self_read" ON "tmc"."orders"
    FOR SELECT USING ("profile_id" = auth.uid());

CREATE POLICY "orders_admin_all" ON "tmc"."orders"
    USING ("tmc"."is_admin"()) WITH CHECK ("tmc"."is_admin"());

-- Deliberately no INSERT/UPDATE/DELETE grant for authenticated: the
-- orders_admin_all policy exists for the admin cockpit's read views, but
-- without a write grant an authenticated admin session cannot reach it for
-- mutation -- every write, including admin cancel, goes through the RPCs
-- or the service-role TS pipeline, keeping every transition in one place.
GRANT SELECT ON TABLE "tmc"."orders" TO "authenticated";
GRANT ALL ON TABLE "tmc"."orders" TO "service_role";

-- ---------------------------------------------------------------------------
-- 2. Small additive columns.
-- ---------------------------------------------------------------------------

ALTER TABLE "tmc"."payments" ADD COLUMN "order_id" uuid REFERENCES "tmc"."orders"("id");

COMMENT ON COLUMN "tmc"."payments"."order_id" IS
  'Links every payment ever attached to an order (including superseded ones after a re-issue) for audit and idempotency cross-checks in tmc.activate_order.';

ALTER TABLE "tmc"."profiles" ADD COLUMN "mollie_customer_id" text UNIQUE;

COMMENT ON COLUMN "tmc"."profiles"."mollie_customer_id" IS
  'Canonical Mollie customer for this profile, one per profile. Replaces looking up mollie_customer_id off the most recent memberships row.';

-- ---------------------------------------------------------------------------
-- 3. tmc._compute_order_price: private pricing helper, not exposed to any
--    client role. Both create_order and admin_create_order call this same
--    function so admin cannot reach a different price than self-service --
--    "same helper" is the guarantee, not a matching pair of hand-written
--    computations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tmc._compute_order_price(
  p_slug text,
  p_extended_access boolean,
  p_commit_24m boolean,
  p_early_member boolean
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'tmc', 'extensions'
AS $function$
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

REVOKE ALL ON FUNCTION tmc._compute_order_price(text, boolean, boolean, boolean) FROM PUBLIC;
-- No grant to authenticated/anon on purpose: this is an internal helper,
-- only called in-process from the two definer RPCs below (which execute as
-- the function owner, so no separate grant is needed for that call).

-- ---------------------------------------------------------------------------
-- 4. tmc.create_order: self-service order creation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tmc.create_order(
  p_slug text,
  p_extended_access boolean DEFAULT false,
  p_commit_24m boolean DEFAULT false,
  p_early_member boolean DEFAULT false,
  p_class_session_id uuid DEFAULT null,
  p_pt_session_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_pricing jsonb;
  v_existing_id uuid;
  v_order tmc.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  v_pricing := tmc._compute_order_price(p_slug, p_extended_access, p_commit_24m, p_early_member);
  if not (v_pricing->>'ok')::boolean then
    return v_pricing;
  end if;

  if v_pricing->>'kind' = 'subscription' then
    select id into v_existing_id
    from tmc.memberships
    where profile_id = v_uid
      and status in ('pending', 'active', 'paused', 'cancellation_requested')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_membership');
    end if;

    -- Explicit, friendly guard; the partial unique index is the race backstop.
    select id into v_existing_id
    from tmc.orders
    where profile_id = v_uid and kind = 'subscription' and status in ('draft', 'pending')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_open_order', 'order_id', v_existing_id);
    end if;
  end if;

  insert into tmc.orders (
    profile_id, kind, catalogue_slug, extended_access, commit_months, early_member,
    class_session_id, pt_session_id,
    base_price_cents, extended_access_price_cents, signup_fee_cents, first_charge_cents,
    recurring_cents, billing_cycle_weeks, early_member_price_lock, signup_fee_waiver,
    pricing_snapshot, created_by, status, expires_at
  ) values (
    v_uid,
    v_pricing->>'kind',
    p_slug,
    (v_pricing->>'extended_access')::boolean,
    (v_pricing->>'commit_months')::integer,
    (v_pricing->>'em_active')::boolean,
    p_class_session_id, p_pt_session_id,
    (v_pricing->>'base_price_cents')::integer,
    (v_pricing->>'extended_access_price_cents')::integer,
    (v_pricing->>'signup_fee_cents')::integer,
    (v_pricing->>'first_charge_cents')::integer,
    (v_pricing->>'recurring_cents')::integer,
    (v_pricing->>'billing_cycle_weeks')::integer,
    (v_pricing->>'early_member_price_lock')::boolean,
    v_pricing->>'signup_fee_waiver',
    v_pricing, 'self', 'draft', now() + interval '24 hours'
  )
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'token', v_order.token,
    'first_charge_cents', v_order.first_charge_cents,
    'recurring_cents', v_order.recurring_cents,
    'signup_fee_cents', v_order.signup_fee_cents,
    'extended_access_price_cents', v_order.extended_access_price_cents,
    'commit_months', v_order.commit_months,
    'early_member', v_order.early_member,
    'expires_at', v_order.expires_at
  );
end;
$function$;

REVOKE ALL ON FUNCTION tmc.create_order(text, boolean, boolean, boolean, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tmc.create_order(text, boolean, boolean, boolean, uuid, uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION tmc.create_order(text, boolean, boolean, boolean, uuid, uuid) TO "service_role";

-- ---------------------------------------------------------------------------
-- 5. tmc.admin_create_order: on-behalf order creation, staff-scoped.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tmc.admin_create_order(
  p_profile_id uuid,
  p_slug text,
  p_extended_access boolean DEFAULT false,
  p_commit_24m boolean DEFAULT false,
  p_early_member boolean DEFAULT false,
  p_waive_signup_fee boolean DEFAULT false,
  p_expires_in_days integer DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_admin_uid uuid := auth.uid();
  v_pricing jsonb;
  v_existing_id uuid;
  v_order tmc.orders%rowtype;
  v_fee_cents integer;
  v_fee_waiver text;
  v_first_charge integer;
  v_expires_days integer;
begin
  -- DB-level gate. The calling server action additionally runs
  -- requireAdmin() in TS before this is ever invoked (defense in depth,
  -- same layering as tmc.reserve_early_member_slot).
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  if p_profile_id is null then
    raise exception 'p_profile_id is verplicht.' using errcode = '22004';
  end if;

  if not exists (select 1 from tmc.profiles where id = p_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  -- Same helper as create_order: admin cannot reach a different price than
  -- self-service for the same selection.
  v_pricing := tmc._compute_order_price(p_slug, p_extended_access, p_commit_24m, p_early_member);
  if not (v_pricing->>'ok')::boolean then
    return v_pricing;
  end if;

  if v_pricing->>'kind' = 'subscription' then
    select id into v_existing_id
    from tmc.memberships
    where profile_id = p_profile_id
      and status in ('pending', 'active', 'paused', 'cancellation_requested')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_membership');
    end if;

    select id into v_existing_id
    from tmc.orders
    where profile_id = p_profile_id and kind = 'subscription' and status in ('draft', 'pending')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_open_order', 'order_id', v_existing_id);
    end if;
  end if;

  -- Overstap waiver: manual, admin-only. The Early Member waiver (already
  -- zero in v_pricing when em_active) always wins; overstap only applies
  -- when EM did not already zero the fee -- an order never carries two
  -- waiver reasons.
  v_fee_cents := (v_pricing->>'signup_fee_cents')::integer;
  v_fee_waiver := v_pricing->>'signup_fee_waiver';
  if p_waive_signup_fee and v_fee_waiver is null then
    v_fee_cents := 0;
    v_fee_waiver := 'overstap';
  end if;

  v_first_charge := (v_pricing->>'base_price_cents')::integer
    + (v_pricing->>'extended_access_price_cents')::integer
    + v_fee_cents;

  -- Payment links live longer than an inline checkout; clamp to a sane
  -- range regardless of what the caller passes.
  v_expires_days := greatest(1, least(14, coalesce(p_expires_in_days, 7)));

  insert into tmc.orders (
    profile_id, kind, catalogue_slug, extended_access, commit_months, early_member,
    base_price_cents, extended_access_price_cents, signup_fee_cents,
    first_charge_cents, recurring_cents, billing_cycle_weeks,
    early_member_price_lock, signup_fee_waiver,
    pricing_snapshot, created_by, created_by_profile_id, status, expires_at
  ) values (
    p_profile_id,
    v_pricing->>'kind',
    p_slug,
    (v_pricing->>'extended_access')::boolean,
    (v_pricing->>'commit_months')::integer,
    (v_pricing->>'em_active')::boolean,
    (v_pricing->>'base_price_cents')::integer,
    (v_pricing->>'extended_access_price_cents')::integer,
    v_fee_cents,
    v_first_charge,
    (v_pricing->>'recurring_cents')::integer,
    (v_pricing->>'billing_cycle_weeks')::integer,
    (v_pricing->>'early_member_price_lock')::boolean,
    v_fee_waiver,
    v_pricing || jsonb_build_object('waive_signup_fee_requested', p_waive_signup_fee),
    'admin', v_admin_uid, 'draft', now() + make_interval(days => v_expires_days)
  )
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'token', v_order.token,
    'first_charge_cents', v_order.first_charge_cents,
    'recurring_cents', v_order.recurring_cents,
    'signup_fee_cents', v_order.signup_fee_cents,
    'extended_access_price_cents', v_order.extended_access_price_cents,
    'commit_months', v_order.commit_months,
    'early_member', v_order.early_member,
    'expires_at', v_order.expires_at
  );
end;
$function$;

REVOKE ALL ON FUNCTION tmc.admin_create_order(uuid, text, boolean, boolean, boolean, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tmc.admin_create_order(uuid, text, boolean, boolean, boolean, boolean, integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION tmc.admin_create_order(uuid, text, boolean, boolean, boolean, boolean, integer) TO "service_role";

-- ---------------------------------------------------------------------------
-- 6. tmc.activate_order: the single atomic pending-to-activated transition.
--    Service-role only. Invoked by the webhook after it has re-fetched the
--    payment from Mollie and confirmed status = 'paid' on that object --
--    never on the callback body.
-- ---------------------------------------------------------------------------

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
  -- Defense in depth: must never be reachable from a logged-in client
  -- session even if a grant is ever widened by mistake (mirrors
  -- tmc.reserve_early_member_slot's own self-check).
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

  -- Idempotent repeat: a webhook retry or duplicate callback on an
  -- already-activated order never re-inserts a membership or a credit row.
  -- It reports whether the Mollie subscription still needs to be created
  -- (the repair path for a first-payment-succeeded-but-subscription-create-
  -- failed run).
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
    -- Condition 2: never mint a second active mandate for a profile that
    -- already has one -- a double-submit, a returning member, or an
    -- admin link paid after a self-service signup already landed all
    -- resolve here instead of creating a second subscription.
    select id into v_existing_id
    from tmc.memberships
    where profile_id = v_order.profile_id
      and status in ('pending', 'active', 'paused', 'cancellation_requested')
    limit 1;
    if found then
      update tmc.orders set status = 'paid', paid_at = v_now where id = v_order.id;
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
    -- Product: ten_ride_card* and pt/duo package rows are credit rows on
    -- tmc.memberships, reusing the live plan_type/credits_* shape already
    -- consumed by tmc.book_class_session and tmc.book_pt_credits. No new
    -- balance table. billing_cycle_weeks/commit_months are 0 (non-
    -- recurring); the memberships_set_commit_end trigger handles that
    -- without error (commit_end_date = start_date).
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
