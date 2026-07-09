# WS-2 Design: Order Pipeline (the spine)

Status: DESIGN COMPLETE, AWAITING APPROVAL. No code, no migration, no push. All DB inspection was read-only against project `xoivleieyfcxcfawgveh`, schema `tmc` only; definer functions were read live via `pg_get_functiondef`; `supabase migration list --linked` shows local = remote through `20260716000000`, placeholder `20260503` untouched. Built to `spec-membership-flow.md` (including the 2026-07-09 amendments) and the approved, live WS-1 outcome.

---

## 1. Discovery findings (live state, verified 2026-07-09)

1. **Current membership creation.** `startSignup` (`src/lib/actions/membership.ts`) is confirmed the only path that inserts into `tmc.memberships`. It: guards on auth plus completed profile plus no existing pending/active membership, loads the plan from `membership_plan_catalogue`, reads the signup fee and extended-access price from `booking_settings` (EM signup fee from `pricing_items`), reserves an EM pool slot via `reserve_early_member_slot`, creates or reuses a Mollie customer (looked up from prior membership rows), inserts a `pending` membership that snapshots `price_per_cycle_cents`, `extended_access_price_cents`, `commit_months` (0 for EM) and `lock_in_*`, creates the Mollie first payment (`SequenceType.first`, no method restriction), stores `first_payment:<id>` in `memberships.notes`, and logs an `open` row in `tmc.payments`. Status values on memberships: `pending, active, paused, cancellation_requested, cancelled, expired, payment_failed` (live CHECK).
2. **Current Mollie flow.** `/api/mollie/webhook` re-fetches the payment from Mollie (never trusts the callback body), upserts `tmc.payments` on the `mollie_payment_id` unique key, then branches on metadata: `first_payment` activates the membership and creates a **Mollie subscription via the Subscriptions API** (`customerSubscriptions.create`, `interval: "28 days"`, `startDate` = first payment + `billing_cycle_weeks * 7` days), guarded by `status !== 'active'` and `!mollie_subscription_id` (read-then-act, not atomic); `recurring` handles reactivation and payment-failure; `pt_booking` flips PT bookings. Recurring is therefore **Mollie-managed, not a self-managed cron**; the mandate lives implicitly in the Mollie customer, only `mollie_customer_id` and `mollie_subscription_id` are stored. `process-cancellations` cron cancels the Mollie subscription before flipping status (money before state, retried on failure). `payments` has UNIQUE(`mollie_payment_id`), the de facto idempotency anchor.
3. **memberships and plan_covers.** A membership records `plan_type` (= catalogue family), `plan_variant` (= catalogue slug), `frequency_cap`, `covered_pillars`, and self-contained price snapshots; no FK into any price table. `plan_covers(plan_type, pillar)` (invoker, pure) derives coverage; `book_class_session` consumes it and, for `plan_type = 'ten_ride_card'`, decrements `credits_remaining` under a row lock. **Product credits already are membership rows**: `plan_type` CHECK includes `ten_ride_card`, `pt_package`, `twelve_week_program`, with `credits_total / credits_remaining / credits_expires_at` columns. `book_pt_credits` consumes PT credits. This is the shape product activation reuses; no new balance table is needed.
4. **Catalogue (WS-1, live).** 29 rows verified live: 15 plans (kids/senior `is_active=false`), `extended_access` addon (1000), `signup_fee` fee (3900, `early_member_price_cents 0`), products `drop_in` (+kids/senior), `ten_ride_card` (+kids/senior inactive, credits 10, validity 4), `pt_single`, `pt_12`, `duo_single`, `duo_12` (credits 1/12/1/12), two `program_*_12w` rows with `purchasable=false`. 24-month price is **derived live**: `commit_24m_discount_factor = 0.920` on every plan row with generated `price_cents_24m_computed` (e.g. all_inclusive_unl 13708). EM per row: `early_member_eligible` on groepslessen + all_inclusive, `early_member_commit_months 0`, `early_member_price_cents` only on all_inclusive_unl (13900), `early_member_price_lock` on the all_inclusive family. `book_pt_pending_payment` already reads `catalogue` slug `pt_single` (migration `20260716000000`), PT flat.
5. **One-off reference patterns.** Crowdfunding checkout and `startTrialBooking` share one shape: server-side price resolution ("nooit uit client payload"), insert pending row, `mollie.payments.create` **without** `sequenceType` (oneoff), attach payment id, webhook confirms with an idempotent status-transition guard. `trial_bookings` carries a `cancel_token uuid` for unauthenticated access by link, the pattern the order token reuses. Note: `trial-booking.ts` still reads `booking_settings.drop_in_*` price columns (a Migration B blocker, see section 9).
6. **Identity.** `handle_new_auth_user` (definer, live): on any auth-user insert it creates the `tmc.profiles` row from `raw_user_meta_data` with a unique `member_code`, `on conflict (id) do nothing`. Admin-created users already work through it today: `createWalkInProfile` calls `auth.admin.createUser({ email, email_confirm: true, user_metadata })` and the trigger fills the profile. Admin-on-behalf therefore needs **no new identity primitive**: create the auth user up front with the real email (per the WS-0 amendment; no placeholders), the trigger makes the profile, and a later OTP login by the customer resolves to that same auth user by email. An order references `profile_id`.
7. **Campaign phase.** `tmc.get_campaign_deadline()` is live (definer, `max(closes_at) from early_member_pools`, EXECUTE for anon/authenticated/service_role). App-side `getCampaignDeadline()` wraps it in `unstable_cache` (300s, tag `campaign`) and `getCampaignPhase(deadline, now)` is pure. The `revalidateTag('campaign')` route named in WS-1 §5 is **not yet built** and is owned by WS-2.
8. **RLS and definer conventions.** Tables: self-read (`profile_id = auth.uid()`), `admin_all` via `tmc.is_admin()`, no client INSERT/UPDATE policies on money tables (memberships writes go through the service role). Definer functions: `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'tmc','extensions'`, `RETURNS jsonb` with `{ok, reason}`, `auth.uid()` guard raising `42501`, row locks (`for update`) to serialize money paths, unique constraints as race backstops, service-role-only functions carry a defense-in-depth self-check (see `reserve_early_member_slot`). Cron shape: `verifyCronAuth(req)`, `createAdminClient()`, guarded updates, ntfy on failure. Email is MailerSend (`src/lib/email.ts`). `@mollie/api-client` is `^4.5.0` (supports per-request `idempotencyKey`). Supabase clients are schema-scoped `db: { schema: 'tmc' }`.

No discovery item contradicts the spec, the amendments, or the WS-1 outcome. Two seams are flagged, not designed around: the webhook keeps its `recurring` and (until WS-6) `pt_booking` branches, and `trial-booking.ts` must be repointed to the catalogue before Migration B (section 9).

---

## 2. Order schema

One new table, `tmc.orders`. It stores a **selection** (what the buyer chose) and a **server-written snapshot** (what it costs); the client never supplies an amount.

```sql
create table tmc.orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references tmc.profiles(id),
  kind text not null check (kind in ('subscription', 'product')),
  catalogue_slug text not null references tmc.catalogue(slug),

  -- Selection (choices only, no amounts)
  extended_access boolean not null default false,
  commit_months integer,          -- subscription: 0 (EM), 12, 24; null for products
  early_member boolean not null default false,
  class_session_id uuid references tmc.class_sessions(id),  -- drop_in, optional (WS-6)
  pt_session_id uuid references tmc.pt_sessions(id),        -- pt/duo single, optional (WS-6)

  -- Price snapshot (server-written in create_order, never updated afterwards)
  base_price_cents integer not null check (base_price_cents >= 0),
  extended_access_price_cents integer not null default 0,
  signup_fee_cents integer not null default 0,
  first_charge_cents integer not null check (first_charge_cents >= 0),
  recurring_cents integer,        -- subscription: base + extended access
  billing_cycle_weeks integer,    -- subscription: from catalogue (4)
  early_member_price_lock boolean not null default false,
  signup_fee_waiver text check (signup_fee_waiver in ('early_member', 'overstap')),
  pricing_snapshot jsonb not null,  -- audit: catalogue row as read + deadline + phase + computation inputs

  -- Provenance
  created_by text not null check (created_by in ('self', 'admin')),
  created_by_profile_id uuid references tmc.profiles(id),  -- admin profile when created_by='admin'

  -- Mollie
  mollie_customer_id text,
  mollie_payment_id text unique,  -- current payment; superseded ones live in tmc.payments (order_id)

  -- Lifecycle
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'paid', 'activated', 'expired', 'cancelled')),
  token uuid not null default gen_random_uuid() unique,  -- unauthenticated status/re-pay page, trial_bookings.cancel_token pattern
  expires_at timestamptz not null,
  paid_at timestamptz,
  activated_at timestamptz,
  membership_id uuid references tmc.memberships(id),  -- written at activation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()       -- touch_updated_at trigger
);

-- One open subscription order per profile (products may stack)
create unique index orders_one_open_subscription_idx on tmc.orders (profile_id)
  where kind = 'subscription' and status in ('draft', 'pending');
create index orders_status_expires_idx on tmc.orders (status, expires_at);
create index orders_profile_idx on tmc.orders (profile_id);

-- Shape guards
alter table tmc.orders add constraint orders_subscription_shape check (
  (kind = 'subscription') = (recurring_cents is not null and billing_cycle_weeks is not null and commit_months is not null)
);
alter table tmc.orders add constraint orders_admin_provenance check (
  (created_by = 'admin') = (created_by_profile_id is not null)
);
```

Two small additive columns elsewhere:

```sql
alter table tmc.payments add column order_id uuid references tmc.orders(id);
alter table tmc.profiles add column mollie_customer_id text unique;
```

`payments.order_id` keeps every payment ever attached to an order traceable (needed for re-issued payment links, section 4). `profiles.mollie_customer_id` makes the Mollie customer canonical per profile instead of today's "latest membership row" lookup; one profile, one Mollie customer, one mandate chain. No backfill (no live data per the amendment; the TS layer falls back to create-and-store).

### State machine

| From | To | Trigger | Writer |
|---|---|---|---|
| (none) | `draft` | `create_order` / `admin_create_order` RPC inserts | RPC (definer) |
| `draft` | `pending` | Mollie payment created and attached (`mollie_payment_id` set) | TS pipeline, service role, guarded update `where status = 'draft'` |
| `draft` | `cancelled` | Mollie payment creation failed, or buyer abandoned; sweep also cancels drafts older than 1 hour | TS pipeline / sweep cron |
| `pending` | `pending` | Payment re-issue: prior payment terminally failed or expired, `now() < expires_at`; new `mollie_payment_id` attached, old one remains in `tmc.payments` | TS pipeline (self via token page, admin via resend) |
| `pending` | `activated` | Webhook verified `paid` at Mollie; `activate_order` performs the transition and all effects in one transaction (`paid_at` and `activated_at` both set) | `activate_order` (definer, service role) |
| `pending` | `paid` | Money received but activation blocked by a business guard (e.g. a second active membership appeared between order and payment). Persisted so ops sees money-in-not-activated; ntfy, manual refund | `activate_order` |
| `pending` | `expired` | Sweep: `now() > expires_at` and not paid | sweep cron, guarded update |
| `expired` | `activated` | Late `paid` webhook on an expired order: honored (money is money, mirrors the current honor-expired-hold behavior), ntfy | `activate_order` |
| `pending` / `draft` | `cancelled` | Admin cancels (also cancels the open Mollie payment via API when cancelable) | TS pipeline |

`activated`, `cancelled` are terminal. `paid` resolves manually (refund then `cancelled`, or admin fix then re-run activation). Every writer guards the transition with `where status in (...)`; `activate_order` additionally locks the row.

---

## 3. RPC surface (the security core)

**The rule, stated plainly: the server recomputes the price from `tmc.catalogue` plus the campaign phase, given the selected slug and options. It never trusts a client-sent price. The client sends a selection, not an amount.** There is no INSERT or UPDATE policy on `tmc.orders` for any client role, so the RPCs below are the only order-creating path at the DB layer, which is what turns "one order-creating path" from convention into enforcement.

Exactly **three** definer functions. Everything else (attach payment, record subscription id, expiry sweep) is a guarded service-role UPDATE in one TS module: the service role bypasses RLS anyway, so a definer wrapper there would add ceremony, not security; what those steps need is state-machine guards (`where status = ...`, `where mollie_subscription_id is null`), which plain updates express.

All three follow the house conventions: `plpgsql`, `SECURITY DEFINER`, `SET search_path TO 'tmc', 'extensions'`, `RETURNS jsonb` `{ok, reason, ...}`, `REVOKE ALL FROM public` then explicit grants.

### 3.1 `tmc.create_order(p_slug text, p_extended_access boolean default false, p_commit_24m boolean default false, p_early_member boolean default false, p_class_session_id uuid default null, p_pt_session_id uuid default null) returns jsonb`

Self-service order creation for `auth.uid()`.

- **Why definer:** must INSERT into `tmc.orders`, which deliberately has no client insert policy; must read `tmc.catalogue` (including inactive-row rejection) and `tmc.get_campaign_deadline()` atomically with the price computation.
- **Allowed to do, exactly:** one INSERT into `tmc.orders` with `profile_id = auth.uid()`, `created_by = 'self'`, amounts computed from the catalogue. Nothing else. No updates, no reads returned beyond the snapshot.
- **Callers / grants:** `GRANT EXECUTE TO authenticated` only (anon revoked: Identify precedes Pay; service_role granted for completeness).
- **Guards, in order:** `auth.uid()` not null (`42501`); catalogue row exists with `is_active = true` (kids/senior off-menu rejected here too) and `purchasable = true` (the WS-1 lead-item server gate: `program_*_12w` refused) and `kind in ('plan', 'product')` (addon and fee are not standalone orderables); for plans: no existing membership in `('pending','active','paused','cancellation_requested')` and no open subscription order (explicit check for a friendly `reason`, the partial unique index is the race backstop); EM requested only if `early_member_eligible` and `now() < tmc.get_campaign_deadline()` (uncached, authoritative, same transaction); EM and 24-month commitment are mutually exclusive (two different benefit sets, reject the combination, see Decisions); 24-month only if `price_cents_24m_computed` is not null; extended access only if the plan row's `extended_access_mode = 'addon'` (`included` sets the flag at 0 cents, `na` plus selection rejects); products reject `p_extended_access`, `p_commit_24m`, `p_early_member` (all product rows are `early_member_eligible = false`, enforced by the row flag, not by kind).
- **Price computation (subscription):**
  - `base` = EM ? `coalesce(early_member_price_cents, price_cents)` : (24m ? `price_cents_24m_computed` : `price_cents`)
  - `commit_months` = EM ? `early_member_commit_months` (0) : (24m ? 24 : `commit_months` (12))
  - `ext` = mode `addon` and selected ? addon row `price_cents` : 0; `extended_access` boolean also true when mode `included`
  - `fee` = EM ? fee row `early_member_price_cents` (0, waiver `early_member`) : fee row `price_cents`
  - `first_charge = base + ext + fee`; `recurring = base + ext`; `early_member_price_lock` from the plan row.
- **Price computation (product):** `first_charge = base = price_cents`; no fee, no recurring.
- Inserts with `status = 'draft'`, `expires_at = now() + interval '24 hours'`, writes `pricing_snapshot` (catalogue row as read, deadline value, phase, inputs), returns `{ok, order_id, token, first_charge_cents, recurring_cents, ...}` for the confirm screen.

### 3.2 `tmc.admin_create_order(p_profile_id uuid, p_slug text, p_extended_access boolean default false, p_commit_24m boolean default false, p_early_member boolean default false, p_waive_signup_fee boolean default false, p_expires_in_days integer default 7) returns jsonb`

On-behalf order creation, staff-scoped.

- **Why definer:** same insert privilege as 3.1 plus the on-behalf capability (an order for another `profile_id`) and the waiver control, both of which must never be reachable from a non-admin session no matter what the front-end does.
- **Authorization:** first statement is `if not tmc.is_admin() then raise ... using errcode = '42501'` (DB-level gate); the calling server action additionally runs `requireAdmin()` (the shared TS gate), the same defense-in-depth layering as `reserve_early_member_slot`. `created_by = 'admin'`, `created_by_profile_id = auth.uid()`.
- **Grants:** `GRANT EXECUTE TO authenticated` (the internal `is_admin()` raise is the real gate, matching the house pattern), plus service_role.
- **Differences from 3.1, exhaustively:** target profile is `p_profile_id` (must exist); `p_waive_signup_fee` sets `signup_fee_cents = 0` with `signup_fee_waiver = 'overstap'` (the EM waiver stays automatic via the EM branch; overstap is the only manual waiver, per the catalogue design that keeps it a pipeline flag, not a catalogue value); `expires_at = now() + p_expires_in_days` clamped to 1..14 days (payment links live longer than an inline checkout). Everything else, including every guard and the whole price computation, is byte-identical: same helper, so admin cannot reach a different price than self-service. EM is gated by the same phase check; there is no admin override to sell EM after `closes_at`.

### 3.3 `tmc.activate_order(p_order_id uuid, p_mollie_payment_id text) returns jsonb`

The single activation path, invoked by the webhook after re-fetching the payment from Mollie. Both arguments come from the Mollie payment's metadata plus id; the webhook only calls this after seeing `status = 'paid'` **on the re-fetched payment object**, never on the callback body.

- **Why definer:** performs the money-consequential writes (membership insert, credit grant, order transition) that no client role may ever perform, atomically in one transaction under a row lock. This function is the idempotency guarantee; it exists so that check-then-act never happens across the TS/DB boundary.
- **Grants:** `REVOKE ALL`, `GRANT EXECUTE TO service_role` **only**. Defense in depth inside: `if auth.uid() is not null then raise` (a logged-in user must never reach it even if a grant is ever widened), mirroring `reserve_early_member_slot`.
- **Logic, in one transaction:**
  1. `select * from tmc.orders where id = p_order_id for update`. Not found: `{ok:false, reason:'order_not_found'}` (webhook logs, returns 200).
  2. Verify `p_mollie_payment_id` is this order's current `mollie_payment_id` **or** recorded for this order in `tmc.payments.order_id` (a superseded link that got paid anyway). Otherwise `{ok:false, reason:'payment_order_mismatch'}`, ntfy.
  3. If `status = 'activated'`: return `{ok:true, already_activated:true, needs_subscription: kind='subscription' and the membership's mollie_subscription_id is null, membership_id, recurring_cents, billing_cycle_weeks, mollie_customer_id}`. This is the repair path: a webhook retry after a failed subscription-create finishes the job, and a duplicate payment on an already-activated order surfaces as `already_activated` plus a paid second payment row, which the webhook ntfy's for refund.
  4. If `status` not in `('pending', 'expired')`: `{ok:false, reason:'invalid_status'}`, ntfy. (`expired` proceeds, flagged `late_payment: true` in the return for the webhook's ntfy.)
  5. Subscription: guard again for a conflicting membership (`pending/active/paused/cancellation_requested`); if one exists, set `status = 'paid', paid_at = now()` and return `{ok:false, reason:'blocked_duplicate_membership'}` (money-in state persisted, ntfy, manual refund). Otherwise INSERT the membership **from the order snapshot only**: `plan_type` = catalogue family, `plan_variant` = slug, `frequency_cap` and `covered_pillars` from the snapshot, `price_per_cycle_cents = base_price_cents`, `billing_cycle_weeks`, `commit_months` (0 for EM, trigger `set_commit_end_date` handles the rest), `start_date = current_date`, `status = 'active'`, `mollie_customer_id`, `extended_access`, `extended_access_price_cents`, `registration_fee_paid = true`, `source` = `early_member` when `early_member`, else `admin_manual` when `created_by = 'admin'`, else `direct`, and `lock_in_active/lock_in_source/lock_in_price_cents = recurring_cents` when `early_member_price_lock`. The activation never reads `tmc.catalogue`: shown price = snapshotted price = charged price, and a catalogue change between order and payment cannot alter the deal.
  6. Product: `ten_ride_card*` inserts a membership `plan_type = 'ten_ride_card'`, `plan_variant = slug`, `credits_total = credits_remaining = snapshot credits` (10), `credits_expires_at = current_date + validity_months`, `covered_pillars` from the snapshot, `status = 'active'`, `commit_months = 0`. `pt_single / pt_12 / duo_single / duo_12` insert `plan_type = 'pt_package'` with credits 1/12/1/12, `plan_variant` = slug (distinguishes duo for WS-6), consumed by the existing `book_pt_credits`. `drop_in` with a `class_session_id` books that session; without one it credits a 1-ride balance; the exact booking insert is WS-6's detail, the state machine and idempotency here do not change.
  7. Set `status = 'activated'`, `paid_at`, `activated_at`, `membership_id`; return `{ok:true, needs_subscription: kind='subscription', membership_id, recurring_cents, billing_cycle_weeks, mollie_customer_id}`.
- **Idempotency guarantees:** the row lock plus status guard make the pending-to-activated transition happen exactly once, so the membership insert, the credit grant, and the EM benefit apply exactly once under any number of Mollie retries or duplicate callbacks. `tmc.payments` UNIQUE(`mollie_payment_id`) keeps the payment log idempotent (upsert, unchanged). `orders.mollie_payment_id` UNIQUE prevents one payment from activating two orders. The idempotency key of the whole path is the Mollie payment id, cross-checked against the order id from the same metadata.

### RLS and grants on `tmc.orders`

```sql
alter table tmc.orders enable row level security;
create policy orders_self_read on tmc.orders for select using (profile_id = auth.uid());
create policy orders_admin_all on tmc.orders for all using (tmc.is_admin()) with check (tmc.is_admin());
grant select on tmc.orders to authenticated;   -- no anon, no client writes
grant all on tmc.orders to service_role;
```

No insert/update/delete policy for `authenticated`: even the admin cockpit creates orders through `admin_create_order` (the `orders_admin_all` policy exists for the cockpit's list/detail/cancel views; the cancel action goes through the TS pipeline's guarded update under service role, keeping transitions in one module). The token page (`/bestelling/[token]`, WS-4/WS-5) reads server-side via the service client filtered on `token`; anon gets nothing at the DB layer.

---

## 4. Mollie integration

### Recommendation: keep the Mollie Subscriptions API (not a self-managed cron)

Discovery settles this: recurring billing today **is** `customerSubscriptions.create` on a 28-day interval, started one cycle after the first payment; `process-cancellations` already cancels subscriptions Mollie-side; the `recurring` webhook branch already handles success, failure, and reactivation. Reasons to keep it, beyond incumbency: Mollie owns the charge scheduler and SEPA retry mechanics (a self-managed cron would reimplement scheduling, retry policy, and a new failure surface for zero benefit at this scale); the 4-week cycle maps exactly to `interval: "28 days"`; amount changes for WS-7 membership modifications are supported via subscription update from the next cycle. A self-managed cron creating `recurring` payments against the mandate would only be warranted if we needed per-cycle amount recomputation or invoice-line control, which the snapshot model explicitly does not want. The design assumes Subscriptions API; nothing in the schema precludes switching later (the mandate lives with the Mollie customer, not the subscription).

### Subscription orders (mandate capture)

1. TS pipeline (`src/lib/orders/`): resolve the Mollie customer: `profiles.mollie_customer_id`, else `mollie.customers.create({ name, email, metadata: { profile_id } })` and store it on the profile (single canonical customer per profile; the mandate chain hangs off it).
2. `mollie.payments.create` with `sequenceType: 'first'`, `customerId`, `amount` = order `first_charge_cents` (read back from the RPC return, never recomputed in TS), `redirectUrl = /abonnement/bedankt?order=<token>`, `webhookUrl = /api/mollie/webhook`, `metadata: { type: 'order', orderId, profileId }`, and `idempotencyKey: 'order-' + orderId + '-p1'` (client 4.5.0 supports it; a network-level retry of the create cannot mint two payments).
3. Guarded update: `orders` set `mollie_payment_id`, `mollie_customer_id`, `status = 'pending'` where `id = orderId and status = 'draft'`; insert the `open` row in `tmc.payments` with `order_id`.
4. Customer pays (iDEAL/card/SEPA, no method restriction, same as today: the first payment doubles as mandate authorization). Webhook fires.
5. Webhook: fetch payment, upsert `payments`, `paid` implies `rpc('activate_order')`; when the result carries `needs_subscription: true`, create the subscription: `customerSubscriptions.create({ customerId, amount: recurring_cents, interval: '28 days', startDate: paid date + billing_cycle_weeks * 7 days, description: 'TMC ' + slug, webhookUrl, metadata: { membershipId, type: 'recurring' }, idempotencyKey: 'order-' + orderId + '-sub' })`, then guarded update `memberships set mollie_subscription_id = ... where id = ... and mollie_subscription_id is null` (UNIQUE constraint is the backstop). If the create fails: ntfy, membership stays active, and the next webhook retry repairs it via `already_activated + needs_subscription` (a strict improvement on today's read-then-create: the exactly-once transition plus the Mollie idempotency key close the double-subscription race).

### Product orders (no mandate)

Same pipeline, `mollie.payments.create` **without** `sequenceType` (oneoff, the crowdfunding/trial pattern) and without requiring a Mollie customer (create one anyway when the profile has none? No: oneoff needs no customer; keep the payment customer-less and the code simpler). Activation credits the balance per 3.3 step 6.

### Payment failure and re-issue

A terminal `failed / expired / canceled` payment does **not** kill the order: the webhook records it in `payments` (and ntfy's when `created_by = 'admin'`, so Marlon can follow up). The order stays `pending` until `expires_at`. Re-issue (customer on the token page, or Marlon's resend button): verify the current payment is terminal at Mollie (cancel it via API if still open and cancelable), create a new payment with a fresh idempotency key (`-p2`, `-p3`), attach via guarded update. `payments.order_id` keeps the trail; `activate_order` step 2 accepts a paid superseded payment, so even the pathological "customer pays the old link after a resend" resolves to one activation and one ntfy for the double-pay refund if both get paid.

### Expiry sweep

`/api/cron/expire-orders` (vercel.json, hourly), house cron shape: `verifyCronAuth`, `createAdminClient()`, then one guarded update moving `pending/draft` past `expires_at` to `expired` (drafts also after 1 hour), `.select()` returning the expired rows; ntfy Marlon per expired admin-created order ("link verlopen, opnieuw sturen?"). Resend after expiry creates a **new order at current catalogue prices and current campaign phase** (fresh snapshot); expired snapshots are never revived, which is what bounds the EM tail (Decisions, item 3).

### Webhook (rewritten, same URL)

`/api/mollie/webhook` keeps its URL and its skeleton (always 2xx, re-fetch payment, upsert `payments`, `payment.received / payment.failed` events with `dedupe_key`), and branches:

- `metadata.type = 'order'`: the new activation path above, replacing the `first_payment` branch entirely (no EM reservation claim/cancel calls anymore, caps are dead).
- `sequenceType = 'recurring'`: unchanged logic (reactivation on paid, `payment_failed` plus member email on failure). This branch is the new pipeline's own recurring tail, not legacy.
- `metadata.type = 'pt_booking'`: kept verbatim until WS-6 unifies PT purchases onto the pipeline; flagged, not orphaned.

---

## 5. Early Member gated by phase

- **One gate, evaluated where money moves.** `create_order` evaluates `now() < tmc.get_campaign_deadline()` inside the same transaction as the price computation. The displayed phase (ISR + 300s cached deadline) can lag by at most the cache window; the only possible divergence is a buyer seeing EM shortly after close, and the RPC then answers `{ok:false, reason:'em_closed'}` with friendly copy (the existing "De Early Member-periode is afgelopen" pattern). Display can never under-charge or over-promise into a charge.
- **All values from the catalogue row:** `early_member_price_cents` (price override where set, all_inclusive_unl today), `early_member_commit_months` (0: direct opzegbaar per 4 weken, the `set_commit_end_date` trigger already reduces commit 0 to pure notice), fee row `early_member_price_cents` (waived inschrijfkosten, 0 today), `early_member_price_lock` (lock_in_* on the membership, expire-on-cancel trigger already live). Per-family differences are data, not code.
- **Fallback by construction:** when `closes_at` passes, the same `if` takes the regular branch; zero code change. When Marlon moves the date, the DB gate is correct instantly and the display converges within the cache window (or immediately via the `revalidateTag('campaign')` route WS-2 ships).
- **Shown equals charged:** the confirm screen (WS-4) renders the amounts returned by `create_order` (the snapshot), not client arithmetic; activation charges and records only the snapshot. The same catalogue-plus-phase read backs both.
- **The EM tail, bounded:** an order snapshotted during the phase keeps its EM benefit if paid within its `expires_at` (24h self-service, up to 14 days admin). After expiry, resend means a new snapshot at the then-current phase. See Decisions item 3.

---

## 6. Replacing `startSignup` and the current webhook (cutover)

Greenfield replace, one migration plus one code PR, nothing left forked:

**Migration `20260717000000_order_pipeline.sql` (next free slot), strictly additive:** `tmc.orders` (table, constraints, indexes, RLS, grants, `touch_updated_at` trigger), `payments.order_id`, `profiles.mollie_customer_id`, and the three RPCs with their grants. Nothing existing is dropped or altered in shape; no view or definer function depends on the touched columns (verified in discovery), so there is no drop-and-recreate set. `tmc.` schema-qualified throughout; `20260503` untouched; `supabase migration list --linked` before push; rollback is `drop table tmc.orders cascade` plus the two column drops and three function drops (additive-only, nothing live reads them until the code PR).

**Code PR (same workstream, after the migration):**

1. New module `src/lib/orders/`: `createOrderAndCheckout(selection)` (RPC + Mollie + attach), `adminCreateOrderAndLink(...)` (customer create-or-find + RPC + Mollie + attach, returns `checkoutUrl` + token for WS-5's MailerSend delivery), `reissueOrderPayment(token)`, `cancelOrder(orderId)`, `getOrderByToken(token)`. All Mollie amounts come from RPC returns.
2. `/api/mollie/webhook` rewritten per section 4 (order branch replaces `first_payment`; recurring and pt_booking branches kept).
3. `startSignup` **deleted**. Its two callers (`/app/abonnement/nieuw` PlanChooser, `/early-member` CTAs) are rewired onto `createOrderAndCheckout` as a thin adapter in the same PR, so from this PR onward exactly one order-creating path exists; WS-3/WS-4 later replace those pages and add the 301s. No interregnum with two live checkouts, and none with zero.
4. `/api/cron/expire-orders` plus its `vercel.json` entry.
5. The `revalidateTag('campaign')` route (WS-1 §5 assigned it to WS-2): `verifyCronAuth`-style secret, one POST, revalidates the tag.
6. `trial-booking.ts` repointed from `booking_settings.drop_in_*` to `tmc.catalogue` drop-in rows (10 lines, read-only swap). This is the last non-Instellingen reader of the doomed price columns and must land before WS-1's Migration B.
7. This PR removes the last callers of `reserve_early_member_slot`, `claim_early_member_slot`, `cancel_early_member_reservation`, unblocking Migration B's drop of the EM cap machinery exactly as WS-1 planned (Migration B remains WS-1's file, pushed after the exit greps pass).

Branch and PR per the money-path convention (branch + PR + review, no direct push to main).

---

## 7. Admin-on-behalf

Per the WS-0 amendment, the identity is created up front, no link-on-login:

1. **Customer create (TS server action, `requireAdmin`):** search `tmc.profiles` by email/phone first (the wizard's search step); if new: `auth.admin.createUser({ email, email_confirm: true, user_metadata: { first_name, last_name, phone } })`, real email required (the desk captures it; no `@walkin.tmc.internal` placeholders, closing that vector by policy). `handle_new_auth_user` (on conflict do nothing) fills the profile. "Pending" means: auth user plus profile exist, no membership yet; the customer's later OTP login with the same email resolves to this same auth user by construction, no second identity possible.
2. **Order:** `admin_create_order` (staff-gated twice: `requireAdmin` in TS, `tmc.is_admin()` in the RPC), with the overstap waiver control and the same phase-gated EM as self-service.
3. **Payment link:** the order's Mollie `checkoutUrl` (from `payments.create`, `_links.checkout.href` via `getCheckoutUrl()`), delivered by WS-5 through the existing MailerSend `sendEmail` with a react template (`// COPY: confirm met Marlon`), alongside the `/bestelling/<token>` fallback page where the customer can see the status and re-open or re-issue the checkout. The customer completes payment exactly as a self-service buyer: same payment, same webhook, same `activate_order`.
4. **Non-payment:** sweep expires the order at `expires_at`, ntfy to Marlon, resend creates a fresh-snapshot order (section 4).

Marlon never sees or enters payment data; SEPA authorization stays with the account holder, which is why the pipeline has one Pay stage and not two.

---

## 8. The seam with WS-3/WS-4 (what the front-end may send)

The front-end sends a **selection**; the server answers with money. Exhaustively, the client-to-server payload for `createOrderAndCheckout` is:

```ts
{
  slug: string,               // catalogue slug of a plan or product
  extendedAccess?: boolean,
  commit24m?: boolean,
  earlyMember?: boolean,
  classSessionId?: string,    // drop_in only (WS-6)
  ptSessionId?: string,       // pt/duo single only (WS-6)
}
```

There is no amount field anywhere in the payload, no field is added without a WS-2 review, and the RPC ignores everything it does not know. The RPC computes and returns `base_price_cents`, `extended_access_price_cents`, `signup_fee_cents` (with waiver), `first_charge_cents`, `recurring_cents`, `commit_months`, and the EM application. Division of labor on display: while configuring, the UI may do live arithmetic from the same ISR-cached catalogue rows for responsiveness (presentational); the **confirm screen renders the RPC-returned snapshot**, so the number on the Pay button is the order row's number, and the Mollie charge is created from that same row. A front-end cannot smuggle a price because no client-writable path into `tmc.orders` exists and the TS pipeline never passes client numbers to Mollie.

Admin (WS-5) is the same seam plus `profileId`, `waiveSignupFee`, `expiresInDays`, gated as in section 7.

---

## 9. Flags (surfaced, not designed around)

1. **`trial-booking.ts` still reads `booking_settings` price columns.** Repointed in the WS-2 code PR (section 6 item 6); until then Migration B is blocked, exactly as WS-1's freeze-window policy intends.
2. **The webhook's `pt_booking` branch and `book_pt_pending_payment` remain a second, session-tied PT purchase path** until WS-6 decides whether PT singles fold fully into the credit model (`pt_single` order granting 1 `pt_package` credit consumed by `book_pt_credits` would retire the pending-payment RPC). Kept working, explicitly not orphaned, explicitly WS-6's call.
3. **Five active `all_inclusive_unl` memberships with live Mollie subscriptions exist** (WS-1 discovery; test-grade per the no-live-data amendment). The rewritten webhook's recurring branch stays metadata-compatible with them regardless, so nothing breaks either way.
4. **Kids/senior stay unsellable through the pipeline** (`is_active = false` rejected in both RPC variants, including admin). Reactivating them is a one-line migration if Marlon decides otherwise (WS-1 §9 item 2 pending with her).

---

## 10. Exit-test mapping

- **Exactly one order-creating path, one activation path:** no client INSERT policy on `tmc.orders`; `create_order`/`admin_create_order` are the only writers of new orders; `activate_order` is the only path to `activated` and the only membership-creating code once `startSignup` is deleted in the same PR. Grep bar: no `.from("memberships").insert` outside `activate_order`'s SQL, no `.from("orders").insert` anywhere in TS.
- **Server recomputes price:** amounts exist only as RPC outputs; the seam payload (section 8) has no money fields; Mollie amounts are read from the order row.
- **Mandate + 4-week recurring / product credits:** section 4 first-payment flow stores the customer and subscription; products credit `ten_ride_card`/`pt_package` membership rows consumed by the live booking RPCs.
- **Webhook idempotent:** exactly-once transition under row lock + status guard; UNIQUE on `payments.mollie_payment_id` and `orders.mollie_payment_id`; Mollie `idempotencyKey` on create calls; retry repairs a missing subscription instead of duplicating it.
- **EM shown equals charged, clean fallback:** one catalogue-plus-`get_campaign_deadline()` read backs display and charge; after `closes_at` the same branch falls through with no code change.
- **Admin link = same pipeline:** `admin_create_order` differs from self-service only in target profile, waiver, and TTL; payment, webhook, and activation are byte-identical.

---

## 11. Decisions needed from Ilja (with recommendations)

1. **Recurring mechanism: keep the Mollie Subscriptions API.** Recommended, discovery leaves it not genuinely open (it is live, integrated with cancellation, and WS-7-compatible via subscription amount updates). Confirm to lock.
2. **EM and 24-month commitment are mutually exclusive.** EM means commit 0 and the EM price; 24m means commit 24 and the derived discount. Combining them (EM price and an 8% discount and monthly cancellability) is almost certainly not intended. Recommended: reject the combination in the RPC; the configurator never offers both at once.
3. **Order TTLs and the EM tail:** 24 hours self-service, default 7 days (max 14) for admin links; an EM order paid within its TTL keeps the EM snapshot even if `closes_at` passed meanwhile; expiry plus resend re-snapshots at current phase. Accept these numbers or set others; they are constants in one place.
4. **Late payment on an expired order is honored** (activate + ntfy) rather than refunded. Mirrors the existing honor-expired-hold behavior. Confirm.
5. **Failed payment keeps the order re-issuable until `expires_at`** (token page retry for self-service, resend for admin) instead of terminal-on-first-failure. Confirm.
6. **`profiles.mollie_customer_id`** as the canonical Mollie customer home (small additive column, no backfill). Confirm.

---

*WS-2 design ends here. Approval requested for: the order schema and state machine (section 2), the three-definer RPC surface with grants and RLS (3), the Mollie integration including the Subscriptions API recommendation and the idempotency mechanics (4), the EM gating (5), the cutover shape (6), the admin-on-behalf flow (7), and the WS-3/WS-4 seam contract (8), plus the six decisions in section 11. Nothing has been written to the database, no migration file exists yet, nothing was pushed. Sonnet builds only after sign-off, with every definer function reviewed via `pg_get_functiondef` after it lands.*
