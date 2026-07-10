## WS-4 Subscription booking page + customer flow (`/abonnement`): design locked 2026-07-09, discovery complete 2026-07-10

The public booking surface. It rides entirely on the pipeline shipped in PR #69 (the `create_order` RPC and the `createOrderAndCheckout` server action) and the catalogue that Migration B left as the single price store. No migration, no new RPC, no schema in this workstream. Sonnet build, no Fable escalation (the one possible escalation, Vrij Trainen seeding, was resolved in discovery: see below).

### What exists to build onto (verified against the repo and live catalogue, not memory)

- **No `src/app/abonnement/` directory exists.** The public booking page is a clean-slate build.
- **The pipeline is complete and reusable as is.** `src/lib/orders/create-order.ts` exposes `createOrderAndCheckout({slug, extendedAccess, commit24m, earlyMember})`, which calls `tmc.create_order`, handles the Mollie customer and first payment, and returns `{ok:true, checkoutUrl, amountCents}` or `{ok:false, error}` with the RPC reason already translated to Dutch via `REASON_COPY` (9 reasons incl. `em_and_24m_exclusive`, `commit_24m_not_offered`, `extended_access_not_available`, `existing_membership`, `existing_open_order`). The configurator calls this action, it never touches the RPC directly. Reuse it, do not fork it.
- **It hard-requires an authenticated profile carrying first_name/last_name.** Stage 2 (identify) must complete the name write, not just OTP, before Stage 3 calls this action, or it returns the "vul eerst je profiel in" path instead of proceeding.
- **`create_order` recomputes everything server-side** from `tmc.catalogue` and `get_campaign_deadline()`: price, Early Member application (intent-only flag, never a price lever), the 24-month path (rejects when `price_cents_24m_computed` is null), extended-access validation, and the EM-vs-24m mutual exclusion. The client sends a selection, never an amount.
- **The old checkout is `src/app/app/abonnement/nieuw/`** (auth-gated, address-gated, no real configurator: it renders every plan slug as a card). It is retired in this WS.
- **OTP identity** lives at `src/app/login/` with `verifyLoginOtp(email, token, next?)` in `src/lib/actions/auth.ts` (open-redirect guarded via `safeNextPath`), and the `/login?next=` pattern is in use. The send-OTP action is to be confirmed exactly at the start of Stage 2 wiring, not built against a guess.
- **Address persists via `saveRegistrationAddress`** in `src/lib/actions/profile.ts` (all three address fields required together). Stage 2 reuses that validation, not `updateProfile`, since address is mandatory here.
- **The success page exists**: `src/app/app/abonnement/bedankt/` reads `?order=` and requires a logged-in buyer, which Stage 2 OTP guarantees. Mollie's `redirectUrl` in `create-order.ts` is hardcoded to it, so the new flow lands there unchanged.

### The catalogue models plans as discrete per-frequency slugs (the load-bearing fact)

Confirmed live: `groepslessen_2x/3x/unl`, `all_inclusive_2x/3x/unl`, and `vrij_trainen_2x/3x/unl`, all purchasable and active. All Access is its own family; the "Groepslessen + 30 vrij-trainen-add-on" idea is baked into the all_inclusive price (109 = 79 + 30), it is not a `create_order` flag. The `p_extended_access` boolean is a different add-on: the 06:00 to 23:00 extended access (slug `extended_access`), governed per row by `extended_access_mode` (`included` / `addon` / `na`). So the configurator presents a base + toggle UX over discrete slugs and resolves the choice down to one canonical plan slug plus the two real booleans before calling the pipeline.

### The five decisions (resolved 2026-07-09)

1. **Configurator model: three base families, not a morphing toggle.** The buyer picks a base offering (Groepslessen / Vrij Trainen / All Access), then a frequency (2x / 3x / onbeperkt), resolving to exactly one plan slug via a static lookup. All Access is its own path, not a state Groepslessen morphs into. On a Groepslessen selection, surface onbeperkt vrij trainen as an upsell hint that points at the matching All Access slug and shows the price delta, not a toggle that swaps product and price under the buyer.
2. **Configure freely, identify at commit; name, phone and address together in Stage 2.** No gate blocks the configurator. After the buyer commits, an unauthenticated visitor does OTP (email then 6-digit code), and name, phone and address are collected in that same step, before payment. A logged-in buyer skips identify. The old AddressGate is gone.
3. **Overstap is admin-mediated; the `/early-member` overstap CTA becomes an aanvraag/contact lead.** The overstap "geen inschrijfkosten" waiver lives only in `admin_create_order`; self-service `create_order` would charge the fee the card waives. So the overstap CTA links to a lead capture (the proefles pattern), not into self-service `/abonnement` checkout. No new RPC, no waiver mechanism here. A verified self-service overstap path is deferred.
4. **Subscriptions only in WS-4.** The configurator handles the subscription families. One-off products (drop-in, 10-rittenkaart, PT, Duo) stay in WS-6, on the same page and pipeline, added later.
5. **Mobile is a separate PR.** The move off the `allowNavigation` stopgap to `@capacitor/browser` is a named dependency, its own small PR, and does not gate WS-4's web delivery.

### The flow WS-4 builds

- **Stage 1 Configure** (`/abonnement`, public, ISR-friendly catalogue read via `getCatalogue()`): base family, then frequency, then applicable add-ons. Extended access shown only where `extended_access_mode = 'addon'` (paid toggle), noted as included where `'included'`, hidden where `'na'`. The 24-month upgrade shown only where `price_cents_24m_computed` is not null, never alongside an active Early Member benefit. Groepslessen shows the onbeperkt-vrij-trainen upsell hint with the delta to the matching `all_inclusive` slug. Output is a selection `{slug, extendedAccess, commit24m, earlyMember}`.
- **Stage 2 Identify**: logged-in skips. Otherwise OTP via the existing primitive, collecting name, phone and address here via `saveRegistrationAddress`-style validation, written before Stage 3.
- **Stage 3 Pay**: a confirm screen, then `createOrderAndCheckout` (reused as is), inline redirect to Mollie. The client never sends an amount.
- **Stage 4 Activate**: unchanged, webhook plus `bedankt?order=`.

### Build directions confirmed 2026-07-10

1. **Confirm-screen pricing is display-only, catalogue-derived.** `createOrderAndCheckout` runs `create_order` and the Mollie call in one shot and returns only `{checkoutUrl, amountCents}`, then redirects, so the confirm screen cannot show a server snapshot before redirect. Derive the summary client-side from the catalogue using the same rules the old `/nieuw` already replicates (EM gate, 24m factor, extended-access add, inschrijfkosten or waived), show the components rather than a single computed total, and treat the returned `amountCents` as authoritative. Do not add a preview RPC or endpoint (that is pricing-RPC territory, Fable, out of scope).
2. **The two `revalidatePath("/app/abonnement/nieuw")` calls in `profile.ts` are reviewed, not blindly repointed.** They existed because `/nieuw` server-rendered the address-gate state. `/abonnement` is public and configure-freely, so if it does not depend on a profile write for its render, remove them; only repoint if a real dependency exists.
3. **The teardown is a real 301, not an in-page redirect.** Retire `/app/abonnement/nieuw` via a `next.config` 301 to `/abonnement` and delete the page body, so the exit test holds: the route returns 301, not a working parallel checkout, and a codebase search finds zero live references. A logged-in member landing there reaches `/abonnement` with identify skipped.
4. **Overstap lead endpoint uses a real configured MailerLite group via env**, mirroring `MAILERLITE_INFO_GROUP_ID`, plus the ntfy staff alert. No hardcoded or guessed group id, no reuse of `/proefles` copy. New copy flagged `// COPY: confirm met Marlon`.

### Teardown inventory (from Phase 1 discovery)

Four live references to `/app/abonnement/nieuw`: `app/abonnement/page.tsx` ("Bekijk abonnementen"), `app/abonnement/bedankt/page.tsx` ("Opnieuw proberen"), the page's own `redirect()` (removed with the body), and the two `profile.ts` `revalidatePath` calls (per direction 2). `/prijzen` and `/early-member` CTAs already point at `/abonnement` and need no change. No transactional email or Capacitor path reference to fix.

### Phase 1 discovery outcome (2026-07-10)

Vrij Trainen is resolved and not blocking. `vrij_trainen_2x/3x/unl` are live in `tmc.catalogue` (purchasable, active, `extended_access_mode: 'addon'`). They were seeded by copy from `membership_plan_catalogue`, not literal INSERTs, and mpc was dropped in Migration B, which is why a repo file-grep missed them; the live catalogue is authoritative. One nuance to handle in the UI: all VT rows are `early_member_eligible: false`, so VT never shows the EM banner or discount, unlike Groepslessen and All Access. All three families ship in WS-4. No WS-1 seed, no Fable escalation.

### Model allocation

Sonnet. No SECURITY DEFINER work, no migration, no schema. The only escalation path (VT seeding) is closed by discovery.
