# WS-0 Reconciliation Report: Membership Flow Teardown Discovery

Status: DISCOVERY COMPLETE, AWAITING APPROVAL. This workstream pushed nothing: no migrations, no code changes, no deletions, no redirects. All DB inspection was read-only against project `xoivleieyfcxcfawgveh`, schema `tmc` only. All SECURITY DEFINER functions cited below were read live via `pg_get_functiondef`, not from repo files.

Source of truth: `spec-membership-flow.md`. Where discovery contradicts a spec assumption, it is flagged inline and collected in section 9.

---

## 1. Inventory: every profile / identity creation path

The load-bearing fact: **profiles are created in exactly one place, the DB trigger.** `tmc.handle_new_auth_user` (SECURITY DEFINER, verified live) fires on insert into `auth.users` and inserts `tmc.profiles` with `id = auth user id`, email, names, phone, a unique 6-digit `member_code`, and acquisition attribution from `raw_user_meta_data`, with `on conflict (id) do nothing`. A `pg_proc` scan confirms no other tmc function inserts into profiles. `tmc.profiles.id` is FK to `auth.users(id) on delete cascade`; unique constraints on `member_code` and `phone`; **no unique constraint on `profiles.email`** (email uniqueness is enforced upstream in auth, see section 2).

Paths that create an auth identity (and therefore, via the trigger, a profile):

| Path | Where | Creates | Details |
|---|---|---|---|
| OTP login at `/login` | `src/app/login/LoginForm.tsx:61` + `src/lib/actions/auth.ts` (`verifyLoginOtp`) | auth user + profile (new emails only) | `signInWithOtp` with `shouldCreateUser` left at default `true`, a deliberate decision (spec-otp-login.md): `/login` is the combined login plus signup entrypoint. UTM attribution goes into `user_metadata`, the trigger copies it to the profile. Verify step runs server-side with the service key and `Sb-Forwarded-For` for per-IP rate limiting. |
| Walk-in on the check-in tablet | `createWalkInProfile`, `src/lib/check-in/actions.ts:408` | auth user + profile | Staff-only. Dedupes on unique phone first. `admin.auth.admin.createUser` with `email_confirm: true`; **placeholder email `walkin-<last8ofphone>@walkin.tmc.internal` when no email is given**. Then updates the profile with phone and names. |
| Trainer invite | `inviteTrainer`, `src/lib/admin/trainer-actions.ts:331` | auth user + profile + trainers row | `admin.auth.admin.inviteUserByEmail`; trigger creates the profile, code bumps role to `trainer`. |
| Safety net | `ensureProfile`, `src/lib/supabase/ensure-profile.ts` | profile only (idempotent) | Upsert keyed on auth id with `ignoreDuplicates: true`, run in the `/app` layout auth guard. Not a second identity path: it can only materialize a profile for an already-existing auth user. |
| Seed scripts | `scripts/seed-dummy-members.mjs`, `scripts/seed-test-data.mjs` | auth users + profiles | Dev tooling, not a production surface. |

Paths that create **no** identity and no profile (lead capture and guest data only):

- `/api/leads/*` (early-member, beweeg-beter, mobility-check, mobility-reset, programma-intake, info, yoga-waitlist) and `/api/proefles`: MailerLite subscribe plus ntfy, nothing in Supabase.
- `trial_bookings` (`startTrialBooking`, `src/lib/actions/trial-booking.ts`): inserts name/email/phone into `tmc.trial_bookings` with a one-off Mollie payment. No profile, no auth user.
- `guest_bookings` (`bookGuest`, `src/lib/member/guest-pass-actions.ts:338`): guest name/email under a member's guest pass. No profile.
- Crowdfunding checkout (`/api/crowdfunding/checkout`): inserts `crowdfunding_backers`. No profile. The page 301s to `/early-member` already; the API route is still live.
- Admin cockpit `leden`: **there is no member-create UI in the cockpit.** The only admin-side member creation is the walk-in path on the check-in tablet. ("Nieuw lid" in `admin/page.tsx:199` is a dashboard notification label, not a creation flow.)

## 2. Inventory: identity-collision behavior (critical)

What happens today when an email that already has a profile does an OTP login: **it resolves to the existing identity, no duplicate is possible for the same email.** Concretely:

- `auth.users` carries `users_email_partial_key`, a UNIQUE index on `email WHERE is_sso_user = false` (verified live). One auth user per email is DB-enforced.
- `signInWithOtp` with an existing email does not create a second user; GoTrue resolves to the existing `auth.users` row and sends the code. Creation happens only when the email is absent.
- Even in a pathological double-insert, the trigger's `on conflict (id) do nothing` and the profiles PK/FK make a second profile for the same auth user impossible.
- Emails are normalized to lowercase on both sides (`verifyLoginOtp` normalizes; GoTrue stores lowercase; the unique index is on the stored value).

So the spec's sharpest fear (admin-precreate then OTP-first-login minting two identities) **does not reproduce for the same email today**: walk-in-with-real-email and trainer-invite both create the auth user up front, and a later OTP login lands on that same user, same profile. This is worth stating because the redesign should preserve exactly this property rather than invent a linking mechanism.

The real residual duplication vectors, documented precisely:

1. **Walk-in placeholder emails.** A walk-in created as `walkin-…@walkin.tmc.internal` who later logs in at `/login` with their real email gets a **second auth user and second profile**. The unique phone constraint blocks a second walk-in, but the OTP path collects no phone, so nothing links the two. This is the one genuine two-identity path in production today.
2. **`profiles.email` can drift** from `auth.users.email` (no constraint, several update sites). Cosmetic today because all identity checks key on auth id, but any future email-keyed logic against profiles would be unsafe.
3. **Profile existence does not mean customer.** Because `/login` is signup, any visitor typing any email mints an identity plus profile row with role `member`. By design, but the Order pipeline must never treat "profile exists" as "customer".

## 3. Inventory: every membership / order / checkout creation path

Every Mollie `payments.create` call site in the codebase (verified by grep, then read):

| # | Path | Type | Price source at charge time | Activation |
|---|---|---|---|---|
| 1 | `startSignup` (`src/lib/actions/membership.ts`), the checkout behind `/app/abonnement/nieuw` | Subscription: `SequenceType.first`, SEPA mandate | `membership_plan_catalogue` (plan + EM price), `booking_settings` (registration fee, extended access), `pricing_items.signup_fee` (EM fee 0) | `/api/mollie/webhook`: activates membership, creates the Mollie subscription (28-day interval) from the membership row's snapshotted `price_per_cycle_cents + extended_access_price_cents`, claims the EM pool slot |
| 2 | `startTrialBooking` (`src/lib/actions/trial-booking.ts`), public proefles | One-off, no auth | `booking_settings.drop_in_*_cents` | `/api/trial-bookings/webhook` flips `trial_bookings.status` |
| 3 | `createPtBookingWithPayment` (`src/lib/member/pt-booking-actions.ts`) | One-off | **Hardcoded in the live SECURITY DEFINER RPC `book_pt_pending_payment`: 9500 premium / 8000 standard / 4500 intake** | `/api/mollie/webhook` `type=pt_booking` |
| 4 | `/api/crowdfunding/checkout` | One-off, legacy | `crowdfunding_tiers` | own webhook; page already 301s to `/early-member` |

Adjacent, no payment: `createPtBookingFromCredits` (PT rittenkaart credits). Membership self-management (`src/lib/member/membership-actions.ts`) only writes `membership_pauses` and cancellation requests.

Two facts that simplify the teardown:

- **Exactly one code path inserts into `memberships` today**: `startSignup` (`membership.ts:272`). The webhook only updates.
- **Admin membership assignment does not exist.** There is no admin checkout, no payment-link flow, no on-behalf order creation. WS-5 is greenfield, not a teardown target.

The membership price snapshot the spec wants already half-exists: the membership row snapshots `price_per_cycle_cents` at signup and the recurring subscription is created from that snapshot, so catalogue changes do not retroactively reprice members.

## 4. Inventory: every price source

DB (three stores, which is two too many):

- `tmc.membership_plan_catalogue`: plan prices (`price_per_cycle_cents`), `early_member_price_cents`, `commit_months`, `early_member_pool`, per variant (groepslessen/vrij_trainen/all_inclusive × 2x/3x/unl, plus kids/senior variants filtered out of display).
- `tmc.pricing_items` (9 rows, seeded by #68): `vrij_trainen_addon` 3000, `extended_access` 1000, `pt_one_on_one_single` 9500, `pt_one_on_one_12` 90000, `duo_single` 12000, `duo_12` 110000, `signup_fee` 3900 (EM 0), `program_studio_12w` 240000, `program_online_12w` 125000.
- `tmc.booking_settings` singleton: `registration_fee_cents`, `extended_access_price_cents`, `drop_in_{yoga,kettlebell,kids,senior}_cents`, `ten_ride_card_cents` (+ crowdfunding variant, validity, kids/senior variants), `pt_intake_discount_cents`, `member_pt_discount_percent`.

**Intra-DB duplication**: signup fee lives in both `booking_settings.registration_fee_cents` and `pricing_items.signup_fee`; extended access lives in both `booking_settings.extended_access_price_cents` and `pricing_items.extended_access`. Checkout (`startSignup`) reads the regular values from `booking_settings` and only the EM fee from `pricing_items`. Same value, two rows, hand-synced.

Hardcoded prices in code (the retirement list):

- **`tmc.book_pt_pending_payment` (live definition): PT prices hardcoded in SQL** (9500/8000/4500). Meanwhile `/prijzen` and `/app/pt` display `pricing_items.pt_one_on_one_single` = 9500. **A standard-tier PT session charges 8000 while the price pages show 9500: display does not equal charge on PT, today, in production.**
- TS fallback blocks (each marked "noodgreep", but each is a full copy of the live price list that must be hand-synced): `FALLBACK_PRICING` in `src/app/prijzen/page.tsx:27` and `src/app/early-member/page.tsx:24`, `FALLBACK_TIERS` in `src/app/page.tsx:30`, PT fallback in `src/app/app/pt/page.tsx`, plus inline defaults `?? 3900` / `?? 1000` in `startSignup` and `/app/abonnement/nieuw`.
- `campaign.ts` `EARLY_MEMBER_DEADLINE` (a date, not a price, but the same drift class; see section 6).
- Mat/handdoek rental copy in `BookingSheet.tsx:325` (2,50 / 1,50 / 3,50 hardcoded label text).
- Sanity `pricingTier`: deregistered from the studio schema (prices come from the catalogue per the comment in `sanity/schemas/index.ts`), but `sanity/seed.ts:232` still seeds 3 pricingTier docs and the dataset may still hold them. Dead, should go.

Spec reconciliation note: the "TS Early Member All Access constant" the spec orders retired has **already been retired into `membership_plan_catalogue.early_member_price_cents`** (PR #68). What remains in TS is the fallback copy (13900) and the deadline constant.

## 5. Inventory: pricing / subscription / membership surfaces and inbound links

| Route | What it is | Inbound references |
|---|---|---|
| `/prijzen` | Full price overview, **already DB-sourced with 60s revalidate** | `NAV_LINKS` (navbar + footer render the same list, `constants.ts:59`), `/aanbod` 3 anchor links (`AanbodContent.tsx:245,266,287`), homepage tier CTAs ("Bekijk alle tarieven"), `PrijzenContent.tsx:493` cross-link to `/early-member` |
| `/early-member` | Campaign page, DB prices + `campaign.ts` deadline | `NAV_LINKS` (`constants.ts:60`), `CampaignTeaser.tsx:73` (site-wide teaser), `/prijzen` CTA |
| `/app/abonnement/nieuw` | **The current checkout (plan picker + EM availability via `get_early_member_availability` RPC + `startSignup`)** | `/early-member` CTAs ×3 (`EarlyMemberContent.tsx:217,274,472`), `/app/abonnement` page button (`page.tsx:149`), `/app/abonnement/bedankt:130`, self `login?next=`, `revalidatePath` ×3 in `src/lib/actions/profile.ts` |
| `/app/abonnement` | Member self-management (current membership, pause, cancel) | `MemberNav.tsx:41`, `/app/support:123`, `/app/vrij-trainen:392`, `/proefles/boeken/bedankt:95`, `/app/abonnement/nieuw` back-link |
| `/app/abonnement/bedankt` | Mollie redirect target of `startSignup` | Mollie `redirectUrl` in `membership.ts:313` |
| `/app/pt` (+`/bedankt`) | PT purchase surface (display from `pricing_items`, charge from RPC) | `MemberNav`, mobile tab bar |
| `/proefles`, `/proefles/boeken` (+`bedankt`, `annuleren/[token]`) | Paid trial drop-in flow (`startTrialBooking`) | Navbar CTA button, footer, various pages |
| `/12-weken-programma` (+`/intake`) | Program pricing from `pricing_items`, lead intake, **no checkout** | `AANBOD_DROPDOWN` (`constants.ts:84`), internal CTAs to `/intake` ×5 |
| `/aanbod` | Offering hub, no prices | `NAV_LINKS`, `AANBOD_DROPDOWN` anchors, emails (`guest_confirmation`) |
| Homepage pricing section | 3 "Onbeperkt" tiers from the catalogue | on `/` |
| `/crowdfunding/*` | Already 301 to `/early-member` in `next.config.ts`; API routes `/api/crowdfunding/{checkout,webhook}` still live | old external links only |

Transactional email templates (MailerSend, all in `src/emails/`): links go to `/app/facturen`, `/app/boekingen`, `/app/rooster`, `/aanbod`, and the site root. **Zero links to any pricing/subscription/membership route**, so no email repointing is needed in the repo. MailerLite marketing automations live outside the repo and need a one-time manual audit (flagged as an ops task, not a code task).

Capacitor: server-mode wrapper (`capacitor.config.ts`), `server.url` points at the live site, so the native apps inherit every web route and every 301 automatically. No pricing/membership route is hardcoded anywhere in `ios/` (verified by grep). `allowNavigation: ['*.mollie.com', …]` is the documented stopgap; the move to `@capacitor/browser` remains the cross-cutting mobile dependency from the spec.

## 6. Inventory: Early Member deadline sources

Both exist, and they are two hand-synced representations of the same instant:

- **Display**: `campaign.ts:17` `EARLY_MEMBER_DEADLINE = 2026-10-01T00:00+02:00`, a static TS constant feeding the teaser bar, the navbar slot, and the `/early-member` countdown. Its own comment documents the decoupling: "weergave-deadline, niet de handhaving… moet handmatig mee-schuiven".
- **Enforcement**: `tmc.early_member_pools.closes_at = 2026-09-30 22:00:00+00` (same instant) on both pools (`all_access`, `groepslessen`; cap 40 each, 45-minute holds). Enforced inside `reserve_early_member_slot` (live definition verified: closes gate, idempotent per profile-per-pool, existing holds honored just past close).

One surface already reads the DB truth: `/app/abonnement/nieuw` shows EM availability and `closes_at` via the `get_early_member_availability` RPC. So the split is precisely: public marketing surfaces read the constant, the checkout reads the DB.

---

## 7. Decision: the identity model (one email-keyed primitive)

**Decision: the profile-creation primitive is "an `auth.users` row plus the `handle_new_auth_user` trigger", keyed on email by the `users_email_partial_key` unique index. Nothing else may ever write a profiles row.** This is not a new mechanism; it is the existing one, kept and enforced.

Resolution of admin-precreate versus OTP-first-login: **create the auth user at admin-create time** (the spec's first option), which is what walk-in and trainer-invite already do. `admin.auth.admin.createUser({ email, email_confirm: true })` is the "pending state": the user exists, has a profile, has never logged in, and the first OTP login resolves to that same row because the email unique index makes any alternative impossible. No linking-on-first-login logic is needed, and none should be built: link-on-login implies a window where two identities exist, which is exactly the bug class this design removes.

Rules that make it hold, for WS-2/WS-5 to implement:

1. The admin Nieuw-lid wizard **requires a real email, always**. No placeholder domain in the purchase pipeline. The Pay stage needs a mailbox anyway (payment link via MailerSend), so an order without a real email cannot complete by construction.
2. The wizard's create step is: normalize email to lowercase, look up existing auth user by email, create only if absent, then proceed with the resolved id. One RPC or one admin-scoped server action, used by nothing and no one else.
3. Self-service keeps `/login` OTP with `shouldCreateUser: true` as the identity entry (spec Stage 2), collecting name and phone at that stage.
4. `ensureProfile` stays as the idempotent safety net; it cannot create identities.
5. The walk-in placeholder path (`walkin.tmc.internal`) stays for check-in only and is **documented as outside the purchase pipeline**. It is today's one real duplicate vector; a merge tool is future work, out of WS-0 scope. The teardown's acceptance test (section 10, test 6) covers the pipeline paths, not walk-in.
6. No new email-keyed store. `profiles.email` remains a mirror; all identity resolution goes through auth.

## 8. Decision: keep / delete / 301 map

| Surface | Decision | Notes |
|---|---|---|
| `/prijzen` | **Keep, rebuild in place (WS-3)** | Already the DB-sourced overview; gains EM benefit surfacing and CTAs to `/abonnement`. No 301 needed. |
| `/abonnement` | **New (WS-4)** | The booking page; does not exist today. |
| `/app/abonnement/nieuw` | **Delete + 301 → `/abonnement`** | The one checkout being retired. |
| `/app/abonnement/bedankt` | **Delete + 301 → new pipeline success page**, after in-flight `pending` memberships drain | It is a live Mollie `redirectUrl`; cutover must wait for zero pending rows or keep a compat window. |
| `/app/abonnement` | **Keep** | Becomes the WS-7 self-management surface, unchanged role. |
| `/early-member` | **Keep** | Campaign surface per spec; CTAs repoint from `/app/abonnement/nieuw` to `/abonnement`. |
| `/aanbod`, homepage pricing section | **Keep** | Already point at `/prijzen`; homepage tiers switch to the WS-1 catalogue read. |
| `/app/pt` | **Keep for now, converge in WS-6** | Becomes a front-end onto the Order pipeline (product `type`); its RPC pricing is retired into the catalogue (section 9, finding 3). |
| `/proefles`, `/proefles/boeken/*` | **Keep for now, converge in WS-6** | This is the drop-in product minus identity; WS-6's drop-in absorbs `trial_bookings` or explicitly supersedes it. Decision deferred to WS-6 design, flagged. |
| `/12-weken-programma` | **Keep** | Lead flow, no checkout. Programs are not in the spec's catalogue families; see section 9, finding 5. |
| `/api/crowdfunding/{checkout,webhook}` | **Delete** (routes return 410/404) | Page already 301s; the API is dead surface with a live Mollie key behind it. |
| `sanity/seed.ts` pricingTier block + any pricingTier docs in the dataset | **Delete** | Schema already deregistered. |

Inbound links to repoint (complete list for `/app/abonnement/nieuw`): `EarlyMemberContent.tsx:217,274,472` → `/abonnement`; `/app/abonnement/page.tsx:149` → `/abonnement`; `/app/abonnement/bedankt:130` → `/abonnement`; `src/lib/actions/profile.ts:93,103,136` revalidate paths; the `login?next=/app/abonnement/nieuw` self-reference. Emails: nothing to repoint (verified). Capacitor: nothing to repoint (server-mode; 301s carry it).

## 9. Decision: single sources (and the drift found)

**Price source: the DB catalogue (WS-1), one row per sellable thing.** What gets retired into it:

1. The intra-DB duplicates: `booking_settings.registration_fee_cents` and `booking_settings.extended_access_price_cents` retire in favor of catalogue rows (today's `pricing_items.signup_fee` / `extended_access` shape). `booking_settings` keeps operational settings only, no prices. The `drop_in_*` and `ten_ride_card_*` columns move to the catalogue as one-off products (WS-1/WS-6).
2. The TS fallback price blocks (4 files) are **deleted, not maintained**. `/prijzen` and the homepage are ISR projections; the last-good cached page is the fallback. A DB outage must never show a stale hand-typed price list that can diverge from what checkout charges.
3. **PT prices come out of `book_pt_pending_payment` and into the catalogue.** This is the concrete display-not-equal-charge bug found live (shown 9500, standard tier charges 8000). The RPC keeps computing eligibility (intake discount, tier) but reads amounts from catalogue rows. Fable-owned in WS-2/WS-6 since it is a SECURITY DEFINER surface.
4. The Sanity pricingTier remnants are deleted (seed block + dataset docs). Sanity holds no charge source, per spec.
5. **Flag, needs a product decision in WS-1**: the 12-weken programma's and kids/senior ten-ride variants are live price points that are not in the spec's catalogue families or one-off list. Recommendation: they become catalogue one-off/product rows like everything else; the spec's "kids and senior are not offered on these surfaces" governs display, not storage.
6. Mat/handdoek rental labels in `BookingSheet` are out of purchase scope (no online charge); flagged for copy-consistency only.

**Early Member deadline: `tmc.early_member_pools.closes_at` is the single source.** `campaign.ts` `EARLY_MEMBER_DEADLINE` is retired; `getCampaignPhase` becomes a server-side read of `closes_at` (cached with the same 60s ISR the consuming pages already use), and the countdown/teaser/navbar props flow from that. `OPENING_DATE` (pre-open vs open framing) is a separate, deliberately decoupled constant and stays. One wrinkle to design around in WS-2: the two pools have independent `closes_at` values in principle; the campaign phase should read the max (campaign open while any pool is open) and per-family gating stays in the reserve RPC, which already enforces per-pool close correctly.

## 10. Exit tests (the teardown is done when all pass)

1. **No orphans (grep zero)**: `grep -rn "app/abonnement/nieuw"` over `src/`, `sanity/`, `capacitor.config.ts`, `ios/`, `src/emails/` returns only the 301 rule. Same for `/api/crowdfunding` (only the redirect/410 handler), and for every other route the map above deletes. `grep -rn "EARLY_MEMBER_DEADLINE"` returns zero. `grep -rn "FALLBACK_PRICING\|FALLBACK_TIERS"` returns zero.
2. **One profile-creation path**: the catalog scan `select proname from pg_proc … where prosrc ilike '%insert into tmc.profiles%'` returns exactly `handle_new_auth_user`; repo grep for `.from("profiles")` followed by `.insert(` or `.upsert(` returns only `ensureProfile` (documented safety net) and nothing new.
3. **One order path**: repo grep for `payments.create(` returns exactly one module (the WS-2 pipeline) plus, until WS-6 absorbs them, the explicitly-listed legacy sites (`trial-booking.ts`, `pt-booking-actions.ts`), each carrying a `// WS-6: converge into Order pipeline` marker; grep for inserts into `memberships` returns only the pipeline. `/app/abonnement/nieuw` returns 301, and submitting its old server action path is impossible (action deleted).
4. **Display equals charge**: a test that, for every active catalogue row, asserts the amount rendered on `/prijzen` equals the amount the Order snapshot stores and the Mollie payment/subscription is created with. Must include PT (the known live failure) and the signup fee and extended access (the known intra-DB duplicates).
5. **Early Member consistent**: with `closes_at` in the future, the EM price/benefit shown on `/prijzen` and `/early-member` equals the benefit the checkout applies (same rows asserted equal); with `closes_at` in the past (test against a branch DB or injected clock, never by editing the live pool), checkout produces regular values and pages hide EM, with no code change. Grep proves a single deadline source (test 1).
6. **Admin-precreate resolves to one identity**: create a user via the admin primitive with email X (pending state), then complete an OTP login with X; assert exactly one `auth.users` row and exactly one `tmc.profiles` row for X. Also assert the lowercase-normalization case (create with `X@Example.com`, log in with `x@example.com`).

## 11. Spec contradictions and surprises flagged (not designed around)

1. **`/prijzen` already exists in near-target shape** (DB-sourced, ISR). WS-3 is a rebuild-in-place, not greenfield. The spec's "every existing pricing page is removed" should read "except `/prijzen`, which is reworked".
2. **The TS Early Member price constant is already retired** (PR #68 moved it to `early_member_price_cents`); what remains is fallback copies and the deadline constant. WS-1's retirement list shrinks accordingly.
3. **Display does not equal charge on PT today** (9500 shown, 8000 charged for standard tier). Live bug, independent of this redesign; fixed by section 9 item 3.
4. **Admin membership assignment does not exist today**, so the spec's "admin path" (WS-5) has no legacy to tear down, only to build.
5. **The identity-collision fear does not reproduce for same-email paths**; the real vector is walk-in placeholder emails, which the spec does not mention. Section 7 rule 1 (real email required in the pipeline) plus the documented walk-in exception covers it.
6. **Programs and kids/senior ten-rides are live price points outside the spec's catalogue structure** (section 9 item 5); WS-1 must place them.
7. `early_member_pools` still carries `cap 40` per pool and reservation plumbing; the spec treats EM as time-gated benefits. Whether caps remain a benefit dimension is a WS-1/WS-2 input (the migration name `early_member_time_only_gate` suggests caps are already vestigial; `reserve_early_member_slot` no longer enforces a cap, verified live, but claim-time warnings still reference pool counts).

---

*WS-0 ends here by design: nothing was built, deleted, redirected, or migrated. Approval is requested before WS-1 (Fable, catalogue) and the Sonnet teardown execute against sections 7 through 10.*
