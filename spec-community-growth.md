# Spec: Community & Growth Features

## Status

**DECIDED — ready to serve as implementation prompts, one per workstream.** All six open questions below are resolved (2026-07-03). This spec supersedes and fills in the placeholder roadmap entry "**Fase 4 — Content, voortgang, community**" from `spec-member-app.md` §6 ("Instructeursbio's, contentcluster, aanwezigheidsstreak, eventueel referral") — treat this document as that phase's real content, not a competing initiative running alongside it.

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

### Decided

**The visitor is presented an explicit choice** — "Book instantly" vs. "I'd rather they call me" — rather than replacing `/proefles` outright or running the two paths unmarked side by side. This preserves the personal-follow-up conversion strength for visitors who want it, without forcing everyone who's already decided through an unnecessary wait. `/proefles`'s existing manual-follow-up flow becomes the second branch of this choice, not a separate, competing entry point.

**Pricing: paid, reusing the existing drop-in price already defined per pillar in `booking_settings`** — no separate "trial price" concept. A paid trial fits a boutique/premium positioning better than a free one, and having money already on the table removes the need to build any no-show enforcement mechanism for someone with no account to attach a strike to.

**Cancellation/no-show policy: identical to the existing member policy.** Same cancellation window as members; a no-show simply forfeits the already-collected payment. No new policy surface, no separate rules to maintain.

---

## 2. Attendance-dropoff / churn signal

### What exists today

- `tmc.events` already has the right event types (`checkin.recorded`, `checkin.reverted`, `attendance.no_show_marked`) plus a dedicated `check_ins` table with RLS — the raw data exists.
- The admin cockpit already has a working **inactive-member filter**: `src/lib/admin/members-query.ts` computes `INACTIVE_WINDOW_DAYS = 30` and a per-member "last session" date, but **this calculation lives in application code**, post-fetch, on the bounded page slice (`rows.filter(...)` after the Postgres query returns). It exists as an on-demand UI filter, not as a queryable aggregate — a periodic cron scanning "every active member with no attendance in N days" would need to refetch and recompute this logic for the *entire* member base every run, which doesn't scale the way the current bounded-page implementation was designed for.
- 7 existing crons all follow the same shape (`verifyCronAuth` → `createAdminClient()` → query → act → `emitEvent`/`sendPushToProfile`/`sendEmail`) — an 8th cron for dropoff detection would fit this convention directly.

### Proposed shape (PROPOSAL, not committed)

- Move the last-session-date + inactivity computation out of `members-query.ts`'s post-fetch JS and into a SQL view or a maintained computed column (e.g. `profiles.last_attended_at`, refreshed the same way `vw_admin_kpis` already is via the existing `refresh-kpis` cron, or a lighter trigger-maintained column updated on check-in). This is explicitly **not** "reuse the existing app-layer inactive-filter logic as-is" — that logic is fine for a bounded admin-UI page, wrong shape for a whole-membership-base periodic scan.
- New cron (matching the existing 7-cron pattern) that queries the resulting view/column for active memberships past the threshold below, and acts per the decision below.

### Decided

**Admin-facing signal only — no automated message to the member.** The point of this signal is to let Marlon reach out personally, not to trigger a generic "we miss you" automated message. An automated nudge is exactly the kind of impersonal-at-scale mechanic this studio's positioning works against.

**Inactivity threshold: 14 days, distinct from the existing 30-day admin-UI "inactive" filter.** The 30-day figure is a lagging, after-the-fact definition suited to a cleanup/reporting filter. A churn signal needs to fire early enough to still be actionable — with a 4-week billing cycle, 14 days lands roughly at the cycle's midpoint: long enough to reflect a real pattern rather than one busy week, early enough to reach someone before they quietly decide not to renew.

---

## 3. Milestone / achievement push notifications

### What exists today

- `push.ts` + `PushNotificationRegister.tsx` are fully built and already in production use for three flows: payment-failed (Mollie webhook), session reminders (`send-reminders` cron), waitlist promotion. The send-side machinery is done.
- **Blocking prerequisite, not an assumption:** `isPushConfigured()` in `push.ts` returns `false` and `sendPushToProfile()` silently no-ops — **no error, nothing logged as a failure, just nothing sent** — until `FIREBASE_SERVICE_ACCOUNT_KEY` exists. That requires the Firebase project itself to exist first (proposed identity from `PushNotificationRegister.tsx`'s own comment: project id `tmc-member-app`, region `europe-west4`), which has not been created as of this discovery. **If this feature ships before that project exists, milestone detection will run correctly and silently produce zero visible output** — the failure mode is invisible, not a crash, which makes it easy to ship and only notice months later that no member ever got a milestone push. This must be called out explicitly to whoever schedules the build, not left as a footnote.
- No existing count of classes attended per member anywhere — no column, no view, no event aggregate. `bookings.status = 'attended'` is the raw data; nothing currently counts it.
- Zero hits for "milestone"/"achievement"/"streak" anywhere in schema, Sanity, or app code. This is a clean-slate build.

### Proposed shape (PROPOSAL, not committed)

- A counting mechanism for attended classes per member — either query-time `count()` against `bookings` (simplest, no new state) or a maintained counter column (faster reads, more moving parts to keep in sync). Given the volumes involved (a boutique studio, not a high-traffic gym), query-time counting is probably sufficient — flagged as a technical call, not locked here.
- A milestone-detection step (cron or triggered on check-in) comparing the current count/anniversary against a milestone table or hardcoded thresholds, calling the already-working `sendPushToProfile()`.

### Decided

**Milestone set: classes-attended thresholds (10/25/50/100) plus membership anniversaries. No streaks.** Attendance counts and anniversaries are unambiguously positive — there's no version of "your 25th class!" or "1 year with us!" that lands badly. Streaks were deliberately excluded: they work only as long as someone stays consistent, and turn a missed week (illness, travel, a busy stretch) into a negative-feeling notification dressed up as encouragement. That failure mode is also the most generic, app-gamification-flavored of the three options, which cuts against the personal, coach-led tone the rest of this spec has held to.

---

## 4. Social class-attendance visibility ("who else is in this class") — proceeding exactly as scoped in discovery

- Confirmed in discovery: **no existing member-to-member visibility of any kind.** RLS on `bookings`/`pt_bookings` restricts every member to `profile_id = auth.uid()` — even a direct REST call can't see another member's booking. Trainers see their own sessions' rosters (staff visibility), which is unrelated.
- Confirmed: **no consent/privacy flag exists on `profiles`** that could gate this. The only opt-in field today is `marketing_opt_in` (email marketing, unrelated purpose).
- This spec presents the feature as **"who's coming" opt-in visibility, not a social feed** — a member could optionally see first-names (or similar) of others already booked into a session they're considering, nothing feed-like, nothing browsable independent of a specific session.
### Decided

**Default: off.** With zero existing consent infrastructure to build on, this was never really a live option — starting from anything other than off would be assuming consent that doesn't exist.

**Presentation: contextual, at the moment it becomes relevant** — e.g. the first time a member views a session where visibility would add something ("Turn on visibility to see who else is coming — and be seen yourself?"), rather than a toggle buried in onboarding or profile settings. An onboarding toggle gets clicked through without real consideration, which is technically opt-in but not meaningfully informed consent. A settings-page toggle is safe but invisible enough that the feature would likely sit unused. Contextual presentation gives the member exactly enough reason to make a real decision, at the point where the decision actually matters. Technical shape: a boolean opt-in column + a filtered read of first-names for members who opted in, scoped to sessions the requesting member is themselves booked into.

---

## Decision log (resolved 2026-07-03)

1. **Trial booking positioning** (§1): visitor is given an explicit choice — book instantly, or request a call. Not a full replacement of `/proefles`, not an unmarked parallel path.
2. **Trial booking pricing/policy** (§1): paid, using the existing per-pillar drop-in price. Cancellation/no-show policy identical to members' — payment is forfeited on no-show, no separate enforcement mechanism.
3. **Dropoff-signal action and threshold** (§2): admin-facing signal only, no automated member-facing message. 14-day inactivity threshold, deliberately shorter than and independent from the existing 30-day admin-UI "inactive" filter.
4. **Milestone set** (§3): classes-attended thresholds (10/25/50/100) and membership anniversaries. Streaks explicitly excluded.
5. **Social visibility default and presentation** (§4): default off. Presented contextually, at the point where it's relevant, not during onboarding or buried in settings.
6. **Sequencing**: independent per workstream. Trial booking and the dropoff signal can build as soon as scheduled; milestone push remains gated on Firebase project creation (`tmc-member-app`, `europe-west4`) regardless of when that happens relative to the other two.

## Explicitly out of scope for this spec

- Waitlist (already built, see top).
- Firebase project creation itself — tracked separately, blocks §3's delivery but isn't part of this spec's build work.
- Exact copy for milestone notifications, the contextual visibility prompt, and the trial-booking choice screen — content decisions, drafted during implementation and flagged `// COPY: confirm with Marlon`, not locked here.
