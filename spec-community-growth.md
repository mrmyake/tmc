# Spec: Community & Growth Features

## Status

**UNDECIDED — draft for a Fable policy session.** Nothing here is a committed decision. This spec supersedes and fills in the placeholder roadmap entry "**Fase 4 — Content, voortgang, community**" from `spec-member-app.md` §6 ("Instructeursbio's, contentcluster, aanwezigheidsstreak, eventueel referral") — treat this document as that phase's real content, not a competing initiative running alongside it.

Covers three build-from-scratch-or-partial workstreams (trial booking, attendance-dropoff signal, milestone push) plus one net-new feature under discussion (social class visibility). The waitlist feature originally in scope for discovery was found to be **fully built already** (see below) and is dropped from this spec entirely.

---

## Waitlist — out of scope, already shipped

Discovery (2026-07-03) confirmed the waitlist is complete end-to-end: `waitlist_entries` table with position/promotion/confirmation-deadline tracking, the `waitlist-promote` cron (idempotent, handles both expiry of stale promotions and promoting the next person when a spot opens), email + push notification on promotion, and UI on both `/app/rooster` (booking sheet shows "Wachtlijst" state) and `/app/boekingen` (own bookings list shows waitlisted status). No workstream needed here. If there's a specific dissatisfaction with the current waitlist UX, that's a separate, narrowly-scoped ticket — not part of this spec.

---

## 1. Trial/guest booking without a full account

### What exists today

- `/proefles` is a **lead-capture form**, not a booking flow: name/email/phone/preferred day → MailerLite subscriber + an ntfy alert to staff (`src/app/api/proefles/route.ts`). No session selection, no payment, no self-service confirmation — Marlon follows up manually.
- `createBooking()` (`booking-actions.ts`) always requires `supabase.auth.getUser()` — no anonymous path exists.
- An architecturally-adjacent pattern already exists: `guest_passes`/`guest_bookings` (migration `20260427100000_guest_passes.sql`) lets an **existing, logged-in member** bring a companion (name + email, no account) to a session for free. The `guest_bookings` table already proves out "attach someone without an account to a session via name/email columns instead of a user FK" — but the trigger is inverted: today a member must already exist to invite a guest; a trial flow needs the opposite, a stranger with no account initiating their own booking.
- Mollie already supports one-off (non-recurring) charges in this codebase: `api/crowdfunding/checkout/route.ts` calls `mollie.payments.create({...})` with no `sequenceType`, which defaults to Mollie's `oneoff` mode — fully separate machinery from the `SequenceType.first`/`recurring` SEPA-mandate flow used for membership signup. This is the pattern a trial payment would reuse, not the membership checkout code.

### Proposed shape (PROPOSAL, not committed)

- New table, deliberately **not** named anything with "guest" in it to avoid collision with the existing member-invites-a-companion concept, which means something different. Working name: `tmc.trial_bookings` (`session_id`, `name`, `email`, `phone`, `mollie_payment_id`, `status: pending|paid|attended|no_show|cancelled`, no `profile_id` — the visitor has no account at booking time).
- Public (non-auth-gated) route showing bookable trial slots for a specific session type, one-off Mollie payment (reusing the crowdfunding checkout pattern) collecting name/email/phone as payment metadata, webhook confirms → row flips to `paid`.
- Post-attendance: an obvious upsell moment to become a real signup (`/app/abonnement` or a dedicated post-trial nudge) — not building the conversion mechanics here, just noting the seam.

### Open question for Marlon (not decided here)

**Does self-service instant trial booking replace `/proefles`'s manual-follow-up model, run alongside it as a second option, or become a deliberate choice presented to the visitor** ("book instantly" vs. "I'd rather they call me")? The personal follow-up may be a deliberate conversion strength for a boutique studio — a founder personally calling every prospective member is a positioning signal, not necessarily a gap to automate away. Do not assume full replacement is the goal. This is a tone/positioning call, not a technical one.

---

## 2. Attendance-dropoff / churn signal

### What exists today

- `tmc.events` already has the right event types (`checkin.recorded`, `checkin.reverted`, `attendance.no_show_marked`) plus a dedicated `check_ins` table with RLS — the raw data exists.
- The admin cockpit already has a working **inactive-member filter**: `src/lib/admin/members-query.ts` computes `INACTIVE_WINDOW_DAYS = 30` and a per-member "last session" date, but **this calculation lives in application code**, post-fetch, on the bounded page slice (`rows.filter(...)` after the Postgres query returns). It exists as an on-demand UI filter, not as a queryable aggregate — a periodic cron scanning "every active member with no attendance in N days" would need to refetch and recompute this logic for the *entire* member base every run, which doesn't scale the way the current bounded-page implementation was designed for.
- 7 existing crons all follow the same shape (`verifyCronAuth` → `createAdminClient()` → query → act → `emitEvent`/`sendPushToProfile`/`sendEmail`) — an 8th cron for dropoff detection would fit this convention directly.

### Proposed shape (PROPOSAL, not committed)

- Move the last-session-date + inactivity computation out of `members-query.ts`'s post-fetch JS and into a SQL view or a maintained computed column (e.g. `profiles.last_attended_at`, refreshed the same way `vw_admin_kpis` already is via the existing `refresh-kpis` cron, or a lighter trigger-maintained column updated on check-in). This is explicitly **not** "reuse the existing app-layer inactive-filter logic as-is" — that logic is fine for a bounded admin-UI page, wrong shape for a whole-membership-base periodic scan.
- New cron (matching the existing 7-cron pattern) that queries the resulting view/column for active memberships past a configurable inactivity threshold, and acts — exact action (admin notification only, direct member nudge, both) is an open question below.

---

## 3. Milestone / achievement push notifications

### What exists today

- `push.ts` + `PushNotificationRegister.tsx` are fully built and already in production use for three flows: payment-failed (Mollie webhook), session reminders (`send-reminders` cron), waitlist promotion. The send-side machinery is done.
- **Blocking prerequisite, not an assumption:** `isPushConfigured()` in `push.ts` returns `false` and `sendPushToProfile()` silently no-ops — **no error, nothing logged as a failure, just nothing sent** — until `FIREBASE_SERVICE_ACCOUNT_KEY` exists. That requires the Firebase project itself to exist first (proposed identity from `PushNotificationRegister.tsx`'s own comment: project id `tmc-member-app`, region `europe-west4`), which has not been created as of this discovery. **If this feature ships before that project exists, milestone detection will run correctly and silently produce zero visible output** — the failure mode is invisible, not a crash, which makes it easy to ship and only notice months later that no member ever got a milestone push. This must be called out explicitly to whoever schedules the build, not left as a footnote.
- No existing count of classes attended per member anywhere — no column, no view, no event aggregate. `bookings.status = 'attended'` is the raw data; nothing currently counts it.
- Zero hits for "milestone"/"achievement"/"streak" anywhere in schema, Sanity, or app code. This is a clean-slate build.

### Proposed shape (PROPOSAL, not committed)

- A counting mechanism for attended classes per member — either query-time `count()` against `bookings` (simplest, no new state) or a maintained counter column (faster reads, more moving parts to keep in sync). Given the volumes involved (a boutique studio, not a high-traffic gym), query-time counting is probably sufficient — flagged as a technical call, not locked here.
- A milestone-detection step (cron or triggered on check-in) comparing the current count/streak/anniversary against a milestone table or hardcoded thresholds, calling the already-working `sendPushToProfile()`.
- **Milestone set is not decided here** — options to put in front of Marlon: classes-attended thresholds (10/25/50/100), consecutive-week streaks, membership-anniversary dates. This is a copy/product call, not a technical one; the spec's job is to make the mechanism pluggable against whatever set gets chosen, not to lock the set.

---

## 4. Social class-attendance visibility ("who else is in this class") — proceeding exactly as scoped in discovery

- Confirmed in discovery: **no existing member-to-member visibility of any kind.** RLS on `bookings`/`pt_bookings` restricts every member to `profile_id = auth.uid()` — even a direct REST call can't see another member's booking. Trainers see their own sessions' rosters (staff visibility), which is unrelated.
- Confirmed: **no consent/privacy flag exists on `profiles`** that could gate this. The only opt-in field today is `marketing_opt_in` (email marketing, unrelated purpose).
- This spec presents the feature as **"who's coming" opt-in visibility, not a social feed** — a member could optionally see first-names (or similar) of others already booked into a session they're considering, nothing feed-like, nothing browsable independent of a specific session.
- **The opt-in-vs-default-on question is explicitly unresolved and flagged for Marlon.** This is a tone/community-feel decision (does visibility make the studio feel warmer and more social, or does it feel exposing for a boutique/private-feeling space), not a technical one. No default is proposed here. Whatever Marlon decides, the technical shape is straightforward (a boolean opt-in column + a filtered read of first-names for members who opted in, scoped to sessions the requesting member is themselves booked into) — the decision, not the mechanism, is the open item.

---

## Open questions for the Fable session

1. **Trial booking positioning** (§1): replace `/proefles`, run alongside it, or present as an explicit visitor choice? Marlon's call, tone/positioning not technical.
2. **Trial booking pricing/policy**: free trial vs. paid one-off (drop-in price already exists in `booking_settings` for some pillars — reuse those, or a distinct trial price)? Cancellation/no-show policy for a paying stranger with no account and no strike history?
3. **Dropoff-signal action**: admin-facing notification only (a cockpit alert/list), a direct nudge to the member themselves ("we miss you" email/push), or both? And what inactivity threshold — is 30 days (the existing admin-UI default) right for a churn signal, or does that need its own, possibly shorter, threshold?
4. **Milestone set** (§3): which milestones matter enough to notify on — classes-attended counts, streaks, anniversaries, some combination? Marlon's call, product/copy not technical.
5. **Social visibility default** (§4): opt-in only, confirmed — but opt-in *presented how* (onboarding toggle, profile settings, prompted contextually)? And default state of the toggle itself (defaulting to off is close to non-negotiable given no consent exists today, but confirm explicitly rather than assume).
6. **Sequencing**: do all three build-workstreams (trial booking, dropoff signal, milestone push) ship together, or independently as they each get decided? Given the Firebase blocker on milestone push (§3) is independent of the other two, it may make sense to sequence dropoff-signal and trial-booking ahead of milestone push regardless of decision order.

## Explicitly out of scope for this spec

- Waitlist (already built, see top).
- Any schema change, cron, Capacitor build change, or Mollie integration work in the drafting phase — all of that waits for "decided" status.
- Locking the exact milestone set, the trial-booking positioning, the dropoff threshold, or the social-visibility default — these are flagged for Marlon, not resolved here.
