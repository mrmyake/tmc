# WS-1 Design: Catalogue Schema, Migration Plan, Seed Spec, closes_at ISR Injection

Status: DESIGN COMPLETE, AWAITING APPROVAL. Nothing was pushed, written to the DB, or seeded; no RPC was changed. All DB inspection was read-only against project `xoivleieyfcxcfawgveh`, schema `tmc` only. Definer functions were read live via `pg_get_functiondef`. Built to `spec-membership-flow.md` including the locked 2026-07-09 amendments and the approved WS-0 report.

---

## 1. Discovery findings (live state, verified 2026-07-09)

1. **Current price store.** `membership_plan_catalogue` holds **22 variants over 7 plan_types** (not 6/18 as the prompt assumed; flagged, harmless): active are groepslessen 2x/3x/unl (7900/9900/11900), vrij_trainen 2x/3x/unl (4900/5900/6900), all_inclusive 2x/3x/unl (10900/12900/14900), kids 1x/2x/unl (4500/7500/9500), senior 1x/2x/unl (4500/7500/9900); inactive dead stock is yoga_mobility 1x/2x/3x/unl and kettlebell 1x/2x/3x (PR #61 leftovers, never sold except one `payment_failed` kettlebell_2x attempt). All Access is modeled as three separate `all_inclusive` rows, and the add-on arithmetic already holds exactly: every all_inclusive price equals the groepslessen price at the same frequency plus 3000 (the `pricing_items.vrij_trainen_addon` value). `pricing_items` holds 9 slugs; `booking_settings` holds 13 price columns.
2. **Drift points: both pairs AGREE today.** Signup fee: `booking_settings.registration_fee_cents` 3900 = `pricing_items.signup_fee` 3900 (EM 0). Extended access: `booking_settings.extended_access_price_cents` 1000 = `pricing_items.extended_access` 1000. No disagreement to resolve; the migration will assert this equality at seed time and abort if it no longer holds.
3. **PT is flat in the live product.** `book_pt_pending_payment` (live) hardcodes premium 9500 / standard 8000 / intake 4500. Reality: 4 trainers, exactly **one** is PT-available and she is `premium`; **zero `pt_sessions` have ever existed and zero `pt_bookings` have ever existed**. The standard and intake tiers have never been offered or sold: dead code, **no revenue leak**. Effective live price is 9500, which equals `pricing_items.pt_one_on_one_single`. The shown-9500-charged-8000 bug is latent, not bleeding.
4. **Early Member fields.** `early_member_price_cents` exists (PR #68) and is populated only on `all_inclusive_unl` (13900); read by `/early-member`, `/app/abonnement/nieuw`, and `startSignup`. `early_member_pools`: two rows (`all_access`, `groepslessen`), both `closes_at = 2026-09-30 22:00:00+00`, `cap 40`, `hold_window_minutes 45`. Reservation machinery: `early_member_reservations` holds **2 rows, both `cancelled`, none ever claimed**; the release cron (`/api/cron/release-early-member-holds`, wired in `vercel.json:45`) and the reserve/claim/cancel RPCs are live but idle. Caps are dead per the amendments; nothing claimed means nothing to preserve.
5. **The memberships insert.** Confirmed single path: `startSignup` (`src/lib/actions/membership.ts:272`). The membership row snapshots `price_per_cycle_cents` and `extended_access_price_cents` at purchase (plus `lock_in_*` for the EM price lock), and the webhook creates the Mollie subscription **from the membership row, not from the catalogue**, so the snapshot already protects existing members from later catalogue changes. Live rows: 5 active `all_inclusive_unl`, 1 `payment_failed` `kettlebell_2x`. **No kids or senior member exists**, so deactivating those plans on sales surfaces strands no one.
6. **Placeholder profiles: zero.** `select count(*) ... email like '%@walkin.tmc.internal'` returns 0. **WS-5 skips the admin merge tool** per the amendment.

New discovery, flagged: **an admin price editor exists today.** `/app/admin/instellingen` (`settings-actions.ts:112`) reads and writes the `booking_settings` price columns. The spec says prices change by migration only and there is no admin price editor in scope. Dropping the price columns therefore also removes Marlon's price knobs from Instellingen; this is a Marlon-visible change that needs her confirmation, and the Instellingen form fields are a teardown item that would otherwise break on the column drop.

Also verified for the migration plan: the **only** definer functions touching any `booking_settings` column are `book_class_session` and `plan_covers` (operational columns and the `ten_ride_card` plan_type string only, **no price columns**) and `book_pt_pending_payment` (hardcoded prices, does not read the settings columns). No view in `tmc` references `booking_settings`. Migration state: local = remote, latest `20260714000000`, placeholder `20260503` untouched.

---

## 2. Target catalogue schema

One new table, `tmc.catalogue`, becomes the only price store. Both display and charge read it. Plans keep their legacy `plan_variant` strings as `slug`, so existing membership rows, `plan_covers`, and the pipeline mapping need no data migration.

```sql
create table tmc.catalogue (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,          -- stable key; equals legacy plan_variant for plans
  kind text not null check (kind in ('plan', 'addon', 'product', 'fee')),
  family text check (family in ('groepslessen', 'vrij_trainen', 'all_inclusive', 'kids', 'senior')),
  display_name text not null,         -- COPY: confirm met Marlon
  price_cents integer not null check (price_cents >= 0),   -- per 4 weken for plan/addon, per unit for product/fee
  billing_cycle_weeks integer,        -- plans and recurring addons: 4; null for one-offs
  frequency_cap integer,              -- plans: null = onbeperkt
  covered_pillars text[] not null default '{}',
  commit_months integer,              -- plans: 12
  price_cents_24m integer,            -- plans: 24-month commitment price per cycle; null = option not offered
  extended_access_mode text check (extended_access_mode in ('included', 'addon', 'na')),  -- plans only
  credits integer,                    -- products: 10 (rittenkaart), 12 (PT/Duo card), 1 (single/drop-in)
  validity_months integer,            -- products: rittenkaart validity
  purchasable boolean not null default true,   -- false = lead item: shown with price, aanvraag-CTA, no Order path
  early_member_eligible boolean not null default false,
  early_member_price_cents integer,   -- null = EM does not change the price
  early_member_commit_months integer, -- null = EM does not change the commitment
  early_member_price_lock boolean not null default false,
  age_category text not null default 'adult' check (age_category in ('adult', 'kids', 'senior')),
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shape guards (modest, not exhaustive):
alter table tmc.catalogue add constraint catalogue_plan_shape check (
  kind <> 'plan' or (family is not null and billing_cycle_weeks is not null
                     and commit_months is not null and extended_access_mode is not null)
);
alter table tmc.catalogue add constraint catalogue_lead_shape check (
  purchasable or kind = 'product'    -- lead items exist only as products
);
alter table tmc.catalogue add constraint catalogue_em_shape check (
  early_member_eligible or (early_member_price_cents is null
                            and early_member_commit_months is null
                            and not early_member_price_lock)
);
```

How the spec's structure maps onto it:

- **Families and frequencies**: `kind = 'plan'` rows, `family` × `frequency_cap` (null = onbeperkt). All three families are stored as priced plan rows, exactly as today. This is deliberate: memberships reference these slugs, `plan_covers` keys on the family, and the EM price column lives here.
- **The add-on model, resolved**: the configurator's "onbeperkt vrij trainen" toggle is a **row mapping, not a priced add-on row**. Toggling it on a `groepslessen_X` selection switches the draft order to `all_inclusive_X`. The "+ EUR 30" shown in the UI is computed as the difference between the two rows. **`pricing_items.vrij_trainen_addon` (3000) is retired without a stored replacement.** Reason: storing both the composed price and the addon price is two sources for one figure, the exact drift class this design removes; deriving the delta keeps one source and even allows the delta to differ per frequency later. The spec's "All Access = Groepslessen plus the add-on, always unlimited vrij trainen" is honored by the mapping and the page copy. This is a design decision, called out for approval.
- **Extended access**: one priced row (`kind = 'addon'`, slug `extended_access`, per cycle) holds the price; each plan row's `extended_access_mode` holds the tier rule (`included` on all_inclusive_unl, `addon` on all_inclusive_2x/3x and all vrij_trainen, `na` on groepslessen-only and kids/senior). The flow reads the rule, it does not encode it.
- **One-off products**: `kind = 'product'` rows: `drop_in` (plus kids/senior drop-in rows, active for charging via the proefles flow but never queried by `/prijzen`), `ten_ride_card` (credits 10, validity 4), `pt_single`, `pt_12` (credits 12), `duo_single`, `duo_12` (credits 12). PT is flat: one price, no tiers.
- **Fee**: `signup_fee` (`kind = 'fee'`), EM price 0. The overstap waiver is a pipeline waiver flag (WS-2/WS-5), not a catalogue value.
- **Commitment**: `commit_months` 12 standard; the 24-month option is `price_cents_24m` per plan row (an absolute per-cycle price, not a percent, so no rounding ambiguity; null hides the option). Values do not exist anywhere today and must come from Marlon; seeded null until then.
- **EM benefit shape per family**: `early_member_eligible` (replaces the pool reference), `early_member_price_cents`, `early_member_commit_months`, `early_member_price_lock`. Seeds mirror today's behavior exactly: eligible on groepslessen and all_inclusive plans, commit 0 when eligible, price override only on all_inclusive_unl, price lock on the all_inclusive family. When the campaign closes, checkout ignores these columns; no code change.
- **Lead items**: `purchasable = false` on the two 12-weken programma rows. See section 7.
- **`closes_at`**: stays in `early_member_pools` (the amendments name it the home), exposed via one accessor function. See section 5.

## 3. RLS and grants

Follows the established `tmc` pattern (verified live on the three current price tables):

```sql
alter table tmc.catalogue enable row level security;
create policy catalogue_public_read on tmc.catalogue for select using (is_active = true);
create policy catalogue_admin_all on tmc.catalogue for all
  using (tmc.is_admin()) with check (tmc.is_admin());
grant select on tmc.catalogue to anon, authenticated;
grant all on tmc.catalogue to service_role;
```

Deliberate tightening versus the legacy tables: `anon`/`authenticated` get **SELECT only** at the grant level (the legacy tables carry broad default grants with RLS as the sole gate; the new table gets belt and braces). Inactive rows are invisible to the public read, which is what makes `is_active = false` the off-menu mechanism for kids/senior. Writes happen via migration (service_role) and, in principle, admins; there is no admin price editor in scope, and the existing one is being removed.

## 4. Forward-migration approach (expand, freeze, contract)

Two migrations, deliberately not one, because the cutover crosses workstreams and the shared remote (tvmuur risk) demands that nothing live breaks between deploys. Every statement schema-qualifies `tmc.`; nothing reads or writes `public` or `tvmuur`; `20260503` stays untouched; `supabase migration list --linked` runs before any push; `supabase db push` is the push path, MCP `execute_sql` is used for read-only validation only.

**Migration A (WS-1, next free slot `20260715000000_catalogue_single_price_store.sql`), strictly additive:**

1. Create `tmc.catalogue` with constraints, RLS, grants, and the project's `updated_at` trigger convention (Sonnet: reuse the existing trigger helper if one exists in `tmc`, else a local one).
2. Create `tmc.get_campaign_deadline()` (section 5).
3. Seed via `insert ... select` **from the live tables in the same transaction**, never by transcribing numbers into the file, so the catalogue is born equal to production truth: plans from `membership_plan_catalogue` (with the per-row overrides from the seed spec in section 6), fee and PT/Duo/program rows from `pricing_items`, drop-in and rittenkaart rows from `booking_settings`. The only literal values in the migration are the new structural fields (modes, flags, credits, ordering).
4. A `do $$` assertion block that **aborts the transaction** if: the drift pairs disagree (`booking_settings.registration_fee_cents <> pricing_items.signup_fee price`, same for extended access), any seeded price is null or 0 where it must not be, or the expected row count is off. The migration self-verifies instead of trusting the operator.
5. Rollback: trivial by construction. Migration A touches nothing that exists; rollback is `drop table tmc.catalogue; drop function tmc.get_campaign_deadline();`. No live flow reads the new objects until code ships.

**Freeze window:** between Migration A and Migration B, the old stores and the catalogue coexist. Policy: **no price changes during the window** (they are migration-authored anyway; the freeze is simply "no price migration until contraction"). The window should be short, days not weeks.

**Code cutover (WS-2/3/4, between A and B):** readers move to `tmc.catalogue` (`startSignup`, webhook, `/prijzen`, `/early-member`, homepage, `/app/pt`, 12-weken, trial booking, the new pipeline), `campaign.ts` moves to the accessor, and the admin Instellingen form drops its price fields. The `book_pt_pending_payment` rewrite (flat PT, price read from `catalogue` slug `pt_single`, tiers and intake removed) is **WS-2 Fable-designed definer work**, shipped in WS-2's own migration, not smuggled into A or B.

**Migration B (contraction, pushed only after the WS-0 exit-test greps pass on the cut-over code):**

1. `early_member_pools`: drop `cap` and `hold_window_minutes`, collapse to a single row (`pool = 'campaign'`), keeping `closes_at` as the one deadline. `get_campaign_deadline()` reads `max(closes_at)` so it is row-count-agnostic across this step.
2. Drop the dead EM machinery: `reserve_early_member_slot`, `claim_early_member_slot`, `cancel_early_member_reservation`, `get_early_member_availability` (nothing claimed, 2 cancelled reservations, safe), and table `early_member_reservations`. Code-side in the same PR: delete `/api/cron/release-early-member-holds` and its `vercel.json` entry.
3. Drop the `booking_settings` price columns: `registration_fee_cents`, `extended_access_price_cents`, `drop_in_yoga_cents`, `drop_in_kettlebell_cents`, `drop_in_kids_cents`, `drop_in_senior_cents`, `ten_ride_card_cents`, `ten_ride_card_crowdfunding_cents`, `ten_ride_card_validity_months`, `kids_ten_ride_card_cents`, `senior_ten_ride_card_cents`, `pt_intake_discount_cents`, `member_pt_discount_percent`. Pre-verified: **no definer function and no view reads any of them** (`book_class_session` and `plan_covers` read only operational columns and the plan_type string), so nothing needs drop-and-recreate here; only app code and the Instellingen form, both gone by then.
4. Drop `pricing_items` and drop `membership_plan_catalogue` (all readers moved; membership rows are self-contained snapshots and reference no FK into either).
5. Rollback consideration: B is destructive, so its gate is the exit tests, not optimism. If rollback is ever needed, the values are deterministic: every dropped figure lives in the catalogue (seeded from the same truth in A) and in version-controlled migration history; a compensating migration can restore columns and re-fill them from `tmc.catalogue`. State this in the migration header.

## 5. `closes_at` ISR injection (the WS-1/WS-2 seam)

Live layout facts this design rides on: the root layout already has `export const revalidate = 60` and computes `getCampaignPhase()` **server-side inside ISR** (`layout.tsx:133`), passing `phase` down to the client `CampaignTeaser` as a prop. The client components (`CampaignTeaser`, `Countdown`) import the deadline constant directly today; that import is what gets replaced by props.

**WS-1 owns (DB side):**

```sql
create or replace function tmc.get_campaign_deadline()
returns timestamptz
language sql stable security definer
set search_path to 'tmc', 'extensions'
as $$ select max(closes_at) from tmc.early_member_pools; $$;
revoke all on function tmc.get_campaign_deadline() from public;
grant execute on function tmc.get_campaign_deadline() to anon, authenticated;
```

A definer accessor rather than a public-read policy on `early_member_pools`, because the pools RLS is admin-read today and the accessor exposes exactly one scalar instead of the table. `max()` makes it indifferent to the pool collapse in Migration B.

**WS-2 owns (app side):**

- `src/lib/campaign.ts`: `EARLY_MEMBER_DEADLINE` is deleted. A new server-only `getCampaignDeadline()` wraps the RPC call in `unstable_cache(fn, ['campaign-deadline'], { revalidate: 300, tags: ['campaign'] })`. `getCampaignPhase(deadline, now)` becomes a pure function of its arguments.
- The root layout calls `getCampaignDeadline()` during its ISR render and passes both `phase` and the deadline ISO string down as props to `CampaignTeaser`, `Navbar`'s EM slot, and (via `/early-member`'s own ISR page) `Countdown`. **No per-request DB call exists anywhere in this chain**: the layout render happens at revalidation (every 60s at most), and the tagged cache dedupes the DB hit across all ISR pages within its 300s window.
- On-demand revalidate: a small authed route (existing `verifyCronAuth` secret pattern) that calls `revalidateTag('campaign')`. The deploy checklist for any migration that changes `closes_at` includes hitting it once. Two honest observations that keep this simple: the deadline **passing** needs no revalidate at all (phase is computed from the stored date versus `now()` at each ISR render, so the site flips to `closed` within 60s of the deadline on its own); only Marlon **moving the date** needs the ping, and even without it the site converges within 300s.

Ownership summary: WS-1 ships the function and this design; WS-2 ships the TS helper, the prop plumbing, the constant's deletion, and the revalidate route.

## 6. Seed spec (every value with its source; nothing invented)

All seeds are `insert ... select` from the named live source. Drift pairs verified equal today and re-asserted in-transaction.

| slug | kind | price_cents | key attributes | source |
|---|---|---|---|---|
| groepslessen_2x / _3x / _unl | plan | 7900 / 9900 / 11900 | cap 2/3/null, commit 12, ext_access `na`, EM eligible, em_commit 0 | `membership_plan_catalogue` live rows |
| vrij_trainen_2x / _3x / _unl | plan | 4900 / 5900 / 6900 | cap 2/3/null, commit 12, ext_access `addon`, EM **not** eligible | same |
| all_inclusive_2x / _3x | plan | 10900 / 12900 | ext_access `addon`, EM eligible, em_commit 0, price_lock true | same |
| all_inclusive_unl | plan | 14900 | ext_access `included`, EM eligible, em_price 13900, em_commit 0, price_lock true | same (incl. `early_member_price_cents`) |
| kids_1x / _2x / _unl | plan | 4500 / 7500 / 9500 | **is_active false** (off menu; zero kids members exist) | same |
| senior_1x / _2x / _unl | plan | 4500 / 7500 / 9900 | **is_active false** (off menu; zero senior members exist) | same |
| extended_access | addon | 1000 | per 4 weken | `booking_settings` = `pricing_items` (agree) |
| signup_fee | fee | 3900 | em_price 0 | `booking_settings` = `pricing_items` (agree) |
| drop_in | product | 1700 | credits 1 | `booking_settings.drop_in_yoga_cents` (= kettlebell, agree) |
| drop_in_kids / drop_in_senior | product | 1300 / 1300 | age_category kids/senior; charged by proefles flow, never shown on `/prijzen` | `booking_settings` |
| ten_ride_card | product | 15000 | credits 10, validity_months 4 | `booking_settings` (only source, no drift) |
| ten_ride_card_kids / _senior | product | 11000 / 11000 | **is_active false** | `booking_settings` |
| pt_single | product | 9500 | credits 1, flat PT | `pricing_items` (= live RPC premium price, agree) |
| pt_12 | product | 90000 | credits 12 | `pricing_items` |
| duo_single / duo_12 | product | 12000 / 110000 | credits 1 / 12 | `pricing_items` |
| program_studio_12w | product | 240000 | **purchasable false** (lead item) | `pricing_items` |
| program_online_12w | product | 125000 | **purchasable false** (lead item) | `pricing_items` |

`price_cents_24m`: **null on every plan row** (option hidden) until Marlon supplies values; see section 9.

Retired without carry (each with the reason): `pricing_items.vrij_trainen_addon` 3000 (derived from the row pair henceforth, section 2), `ten_ride_card_crowdfunding_cents` 15000 (equal to regular, campaign over), `pt_intake_discount_cents` 4500 and the standard/intake tiers (never sold, PT flat), `member_pt_discount_percent` 0 (dead), the 7 inactive yoga_mobility/kettlebell variants (never sold; the one `payment_failed` kettlebell_2x membership is a self-contained snapshot and references no catalogue row), `pricing_items.early_member_price_cents` on the two programs (equal to the regular price, meaningless: seeded as null).

## 7. 12-weken programma's as lead items (option B)

The `purchasable` boolean is the schema-level distinction. `purchasable = false` means: the row is displayed on `/prijzen` with its price and an aanvraag-CTA, and **the Order pipeline refuses it**. Enforcement is two-layer so it cannot be bypassed by a crafted request: the WS-2 order-creation RPC rejects any catalogue row with `purchasable = false` (server-side, the real gate), and the UI never renders a buy path for it (cosmetic). The CTA routes to the existing lead capture shape: the `/12-weken-programma/intake` flow (MailerLite subscribe plus ntfy staff alert, the proefles second branch). No new lead machinery is built; the catalogue row only contributes the displayed price and the CTA target. Seeded: both programs, `purchasable = false`, `is_active = true`.

## 8. No caps, confirmed

The schema stores no cap anywhere: `tmc.catalogue` has no capacity column, EM eligibility is a boolean plus benefit values, and scarcity is purely `closes_at`. Migration B drops `early_member_pools.cap`, `hold_window_minutes`, the reservations table, the three reservation RPCs, `get_early_member_availability`, and the release cron. `early_member_pools` survives solely as the home of `closes_at`, collapsed to one row. Nothing in the seed spec or the WS-2 flow reads or enforces a cap. The 2 existing reservations are both `cancelled`; dropping the table loses no claimed benefit.

## 9. Values and confirmations needed before Sonnet seeds

For Ilja and/or Marlon; the seed is blocked only on none of these (defaults are safe), but each changes what customers see:

1. **24-month prices** (`price_cents_24m` per plan): exist nowhere today, spec introduces them. Until supplied, seeded null and the configurator hides the 24-month option. Needs Marlon (zij bepaalt de korting).
2. **Kids/senior plans go off-menu** (`is_active false`): display-only, zero existing kids/senior members (verified). Confirm with Marlon that walk-in/admin sales of kids/senior also stop, or they stay seeded active-but-unqueried instead.
3. **Drop-in collapses to one adult price row** (yoga and kettlebell are both 1700 today and `/prijzen` already shows one price). If they should ever diverge, rows are added per pillar. Confirm.
4. **Vrij Trainen stays EM-ineligible** (mirrors today: no pool membership). Confirm this is intent, not accident.
5. **EM price lock on all_inclusive_2x/3x at the regular price** (today's live behavior: lock_in at 10900/12900 with commit 0, no price cut). Seeding mirrors it. Confirm it is intended benefit shape.
6. **The Instellingen price editor disappears** (spec: prices change by migration only). Marlon-visible; confirm with her.
7. **Duo display labels**: `pricing_items` labels both duo rows identically ("Personal training duo"); `/prijzen` needs distinct display names (single versus 12-rittenkaart). COPY: confirm met Marlon.

## 10. Flags (contradictions found, not designed around)

- The prompt's "6 plan_types / 18 variants" understates the live table: 7 plan_types, 22 variants (7 of them dead stock that never sold).
- An **admin price editor exists** (`/app/admin/instellingen` writes `booking_settings` price columns), contradicting the spec's no-editor model. Resolved by the amendments' column drop, but it is a functional removal for Marlon, not just plumbing, and its form fields must be torn down with the columns or Instellingen breaks.
- `pricing_items` carries EM prices for the programs equal to their regular prices (noise; seeded null).
- PT's shown-versus-charged bug is latent, not active (zero PT sessions or bookings ever), so no revenue was leaked and no hotfix is needed ahead of WS-2.

## 11. Exit-test mapping (what this design makes true once implemented)

- **One price store**: after Migration B, `pricing_items`, `membership_plan_catalogue`, and every `booking_settings` price column are gone; every displayed and every charged figure is a `tmc.catalogue` row; display-equals-charge is testable per row.
- **PT flat, bug gone**: one `pt_single` price read by both `/prijzen`/`/app/pt` and the rewritten RPC; tiers and intake dead.
- **`booking_settings` carries no price columns**: Migration B step 3, pre-verified to break no definer function or view.
- **Single deadline, no per-request DB call**: `closes_at` via `get_campaign_deadline()` into `unstable_cache` into the already-ISR root layout; `EARLY_MEMBER_DEADLINE` deleted; phase flips at the deadline within the 60s ISR window with no revalidate needed.

---

*WS-1 design ends here. Approval requested for: the schema (section 2, specifically the derived vrij-trainen-addon decision), the RLS (3), the two-migration plan with freeze window (4), the ISR seam ownership (5), the seed spec (6), and the lead-item mechanism (7). Section 9 lists what needs Ilja or Marlon before Sonnet seeds; only item 1 (24-month prices) blocks a customer-visible feature, everything else has a safe seeded default. Nothing has been written, pushed, or seeded.*
