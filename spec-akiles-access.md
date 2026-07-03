# Spec: Akiles Door Access (Member App Fase 3)

## Status

**UNDECIDED — draft for the Fable policy session.** Nothing in this document is a committed decision. The proposed data model is a proposal based on discovery findings (2026-07-03, live Akiles docs + live TMC schema), not a design that has been accepted. Every item in "Open questions" must be explicitly decided before any implementation starts, following the same flow as spec-otp-login.md (draft → Fable session locks decisions → Sonnet builds).

---

## ⚠️ Blocking prerequisite (own ticket, NOT scoped into this work)

**The membership cancellation lifecycle bug must be fixed before physical door access ships.** Today, member-initiated cancellation sets `status = 'cancellation_requested'` via a client that RLS silently blocks (0 rows updated, no error — AUDIT-SECURITY.md §2), so the cron that should finalize cancellations and stop the Mollie subscription never finds anything. As long as entitlement is billing-only, this is a financial/AVG bug. The moment door access derives from `memberships.status`, it becomes a **physical security risk**: a member who cancelled (or whose payment failed, same silent-blockade class of risk) keeps a working key to the building.

This fix is a prerequisite with its own ticket and timeline, independent of when the Akiles work happens. This spec assumes it is fixed and must not inherit it.

---

## Parallel work items (start now, do not wait for the Fable session)

1. **Capacitor/Cordova compatibility spike (urgent, parallel).** Akiles officially ships SDKs for Android, iOS, React Native and Cordova (`akiles-cordova`); **Capacitor is not mentioned anywhere in their docs** (verified 2026-07-03). Capacitor claims general Cordova plugin compatibility, but BLE/NFC plugins are exactly the category where that claim breaks. The spike's outcome can change the technical approach materially (Cordova plugin as-is → thin custom Capacitor bridge over the native SDKs → in the worst case a different app-shell strategy), which affects what the Fable session should decide. Do not sequence it after the spec is decided.
2. **Two questions to Akiles support (hello@akiles.app / support@akiles.app), send now:**
   - (a) Is there a **sandbox, demo unit, or virtual device/gadget** so SDK development can start before the physical lock is delivered? The Developer Center mentions "test organizations" but the docs say nothing about hardware-less testing.
   - (b) Do Akiles **events distinguish successful from failed unlock attempts**? Their event model (subject-verb-object, `gadget_action`) does not document this, and the audit requirement below depends on it.

---

## Context from discovery (verified, not assumed)

### What exists on the TMC side

- `tmc.memberships` (live) has **no access/after-hours field of any kind**. Entitlement-relevant fields today: `plan_type`, `plan_variant`, `frequency_cap`, `covered_pillars[]`, `status`, validity dates, plus `membership_pauses` as a separate table. Plans live in `membership_plan_catalogue` (`plan_variant` unique, `is_active`).
- `tmc.events` is the audit foundation: append-only (DB-level trigger blocks UPDATE/DELETE), free-text `type` guarded only by the TS union in `src/lib/events/emit.ts`, FK-less nullable `actor_id`/`subject_id`, jsonb payload with a no-PII convention, writes via service-role only, `emitEvent()` never throws. `auth.otp_failed` (2026-07-03) is the freshest precedent for adding a new event family without a migration.
- The push-notification integration is the reference native-bridge pattern: client component gated on `Capacitor.isNativePlatform()` → plugin → server action persisting per-device state; server lib is no-op until its env secret exists (`isPushConfigured()` pattern); secrets never reach the client.
- There is **zero** existing Akiles code, config or env in the repo. Only roadmap mentions in spec-member-app.md §4-8 and docs/spec-functional-design.md (M-41, I-08 — the latter notes the insurer must be consulted).

### What Akiles actually offers (docs.akiles.app, 2026-07-03)

- **Mobile SDK**: session-based. Server creates a member, then a **member token** (`POST /members/{member_id}/tokens`, scoped to that member only); app calls `addSession(token)`, `refreshSession()`, `action()` (unlock), `getGadgets()`. Unlock channels: internet + Bluetooth attempted in parallel (fastest wins), NFC via Host Card Emulation. iOS requires an explicit `startCardEmulation()` call; Android HCE works system-wide automatically. Org-level API credentials must never ship in the app.
- **Server API**: `api.akiles.app/v2`, OAuth2 (client_id/secret from the Developer Center, access token 1h + refresh token, scopes `full_read_write`/`full_read_only`/`offline`).
- **Permission model**: member → member_group_associations → member groups → permission rules. Rules target org/site/gadget/action and carry restrictions: **schedule** (e.g. Mon-Fri 9:00-18:00), GPS presence, per-method (online/BLE/NFC/pin/card). OR-logic across rules, AND within a rule's restrictions.
- **Association-level validity windows** exist (a member's group membership can itself have a start/end). **Context, not a decision:** this makes "access only around a booked class" implementable with Akiles-native mechanics (create/expire a short-lived association per booking) instead of a custom scheduler. It lowers the cost of the per-booking model that spec-member-app.md §4 assumed was the complex option.
- **Webhooks** (Akiles → us): URL + mandatory `object.type` filter + secret, HMAC-SHA256 signature in `X-Akiles-Sig-Sha256`, retries with backoff up to 1h; polling fallback. For us → Akiles there is no push mechanism; the planned membership-status sync simply calls their REST API (fits the existing `emitEvent()`-driven pattern: status change happens → sync layer reacts).

---

## Proposed entitlement data model (PROPOSAL ONLY — not committed)

The minimal shape that supports both candidate policies (flat after-hours flag vs per-booking windows), kept deliberately open on the plan-vs-member granularity question below:

1. **Entitlement source**: either
   - (a) a column on `membership_plan_catalogue` (e.g. `door_access_level text` — values like `none | opening_hours | after_hours`), inherited by every membership on that plan, **or**
   - (b) the same column on `memberships` (set from the plan at signup, overridable per member), **or**
   - (c) both: plan-level default + nullable member-level override.
   Which of these is correct is an open question (see below), not a default.
2. **Link table** `tmc.akiles_members`: `profile_id uuid` ↔ `akiles_member_id text`, plus `member_group_ids`, `synced_at`, `sync_status`. Updated exclusively by the sync layer, never by client code.
3. **Tier-to-schedule mapping**: one Akiles member group per access level, each group carrying a permission rule with the matching `schedule` (e.g. group "members-opening-hours" vs "members-24-7"). The mapping table (access level → Akiles group id) lives in config/DB, not hardcoded.
4. **Sync layer**: server-side (Next.js server action or Supabase Edge Function — open), reacting to the same lifecycle moments that already emit events (`membership.activated`, `membership.cancelled`, `membership.payment_failed`, pause granted/ended). OAuth client credentials server-side only, `isAkilesConfigured()` no-op pattern until env exists.
5. **Audit trail**: new `tmc.events` family following the existing conventions (`access.granted`, `access.revoked`, `access.unlock_succeeded`, `access.unlock_failed`, `access.sync_failed` — exact set open). Actor = member profile where known, payload without PII per the emit.ts convention. Whether unlock events can be sourced reliably depends on Akiles support question (b).

---

## Open questions for the Fable policy session (NO recommendations here, by design)

1. **Which tiers get after-hours access, and how granular?** Flat flag per plan, or finer-grained scheduling per tier (e.g. different hour windows per plan)? Related: is "per booked class only" (via association validity windows, see context) a policy option on the table for some or all tiers?
2. **Plan-level vs member-level entitlement granularity.** Does entitlement live purely on `membership_plan_catalogue`, or must the model support member-level overrides (trainers, Marlon herself, temporary exceptions, comped access)? Deliberately left open — the data-model options (a/b/c) above map to this answer.
3. **Revocation rules.** What happens to door access, and how fast, on: payment failure; voluntary pause; cancellation request; cancellation effective date; membership expiry? Immediate revoke vs grace period per case. Who is accountable if revocation fails or lags (sync error, Akiles outage) — and does the sync layer need a reconciliation sweep (periodic full compare) on top of event-driven updates?
4. **Liability and insurance for unsupervised after-hours access.** A member alone in the building at 23:00 who gets injured: what does the insurer require (camera coverage, emergency button, max occupancy, age limits, waiver)? The insurer-consultation note in spec-functional-design I-08 must be answered *before* launch, not after. This is a Marlon/insurer question that code cannot solve; the session should decide what the app must enforce (e.g. block under-18 after hours) once the insurer's answer is known.
5. **Audit logging requirements for door access.** Retention period for `access.*` events (AVG: location-ish data of identifiable members); what must be immutable (current events table is already append-only at DB level — is that sufficient?); do *failed* unlock attempts need the same treatment as `auth.otp_failed` (pattern exists) — and can we even get them from Akiles (support question (b))? Do we log our own app-side unlock attempts regardless of what Akiles delivers?
6. **Apple App Review 4.7.2 risk, revisited with real SDK facts.** The shell loads a remote `server.url`; guideline 4.7.2 restricts apps whose core value lives in web content. Discovery confirms the Akiles integration adds genuinely native BLE/NFC capability (SDK sessions, HCE card emulation with an explicit iOS `startCardEmulation()` call) — that strengthens the "real native functionality" argument but also increases review scrutiny on the hybrid architecture. Decide: accept the current server-mode shell and argue native value at review time, or plan a partial local-UI fallback for the door screen. Input needed from the Capacitor/Cordova spike before this can be decided properly.
7. **Sync architecture placement.** Next.js server action vs Supabase Edge Function for the Akiles OAuth proxy + sync (the OTP work established the server-action pattern; an Edge Function decouples from Vercel deploys). Also: where do Akiles webhook receipts land (`/api/akiles/webhook` route following the Mollie webhook pattern?). Technical, but policy-adjacent because it determines the failure modes in question 3.

---

## Explicitly out of scope for this spec

- The cancellation lifecycle fix (own ticket, prerequisite — see top).
- Kiosk/staff interfaces, Sonos/lighting, TMM/Movement Profile.
- Any schema change, Edge Function, Capacitor build change or Akiles account setup in the drafting phase. All of that waits for "decided" status plus the spike outcome.
