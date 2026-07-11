# Spec: Pricing Overview, Subscription Booking, and Purchase Flow (greenfield)

## Status

**CONCEPT, target-state design, all decisions resolved (see Decision log).** This describes how it should be, not how the current code is built. Every current pricing, subscription, and membership page is removed and replaced by the two pages below. This spec names no prices: every figure lives in the DB catalogue and is authored by migration.

Goal: a clear way to see all prices, and a direct way to book a subscription or buy a one-off product, both sourced from the DB, running through one purchase pipeline that both the customer (self-service) and Marlon (in the gym, on behalf of the customer) use.

---

## Build status and outstanding gates (living, updated 2026-07-09)

Keep this current as workstreams land. The whole effort is not done until the final gate below is green.

**Done and approved:**
- WS-0 reconciliation and teardown design (Fable): approved.
- WS-1 catalogue (Sonnet), phases 1 to 3: pushed and live. `20260715000000_catalogue_single_price_store.sql` (tmc.catalogue seeded from live, 24-month derived, per-kind constraints, `get_campaign_deadline()`) and `20260716000000_pt_flat_pricing_from_catalogue.sql` (PT flat from catalogue). Deadline seam wired (`campaign.ts`, `EARLY_MEMBER_DEADLINE` deleted). Local equals remote through `20260716000000`.
- WS-3 prices overview (Sonnet): `/prijzen`, `/app/pt` display, and `/12-weken-programma` rebuilt on the catalogue via a shared `src/lib/catalogue.ts`; ISR preserved (verified static in build output); the Early Member callout is catalogue-sourced and phase-gated; hardcoded "8 percent" and inschrijfkosten text replaced with derived values. App-only, no migration. Surfaced two follow-ups (see freeze-list): `/early-member` still reads `pricing-items.ts`, and the emergency fallback price constants.
- `/early-member` repoint (Sonnet): moved onto the catalogue via `getCatalogue()`, no old-source reads left; also consolidated the campaign check to the single `getCampaignPhase()` source (one fewer date source, `now() >= OPENING_DATE` removed); overstap waiver correctly left un-gated by the campaign; static preserved. Surfaced the overstap-CTA integrity question (see open items).

**In progress:**
- WS-2 Order pipeline: COMPLETE in PR #69 (`github.com/mrmyake/tmc/pull/69`), pending merge and an end-to-end payment test. Phase 2 (schema plus `create_order` / `admin_create_order` / `activate_order`, `20260717000000_order_pipeline.sql`) was security-reviewed. Phase 3 landed all three pre-flight items and the cutover: `activate_order` proven in the real service-role context (decoded JWT has no `sub`, so `auth.uid()` is NULL and the guard correctly never fires, no code change needed); `create_order` and `admin_create_order` reject lead slugs (`not_purchasable`) before insert; paid-blocked visibility added (`orders.blocked_reason` plus a partial index and an ntfy alert). The webhook first_payment branch now calls `activate_order` (recurring / pt_booking untouched); `startSignup` deleted and its callers (`/app/abonnement/nieuw`, the bedankt page) rewired, with the bedankt page moved from `?membership=` to `?order=` for the async model; `trial-booking.ts` off `booking_settings`; a new expire-orders cron. Two follow-ups before trusting it (see the two actions under the ledger): confirm the commit state of WS-1/WS-3/`early-member`, and run a real Mollie end-to-end payment.

**Outstanding, the final gated step: Migration B (WS-1 contraction).** It drops `pricing_items`, `membership_plan_catalogue`, the `booking_settings` price columns, and the coupled Instellingen price form fields. This is the last PR of the whole effort, not an intermediate step. Its gate is a repo-wide grep returning zero for `pricing_items` and the `booking_settings` price columns. Do not push B until that grep is green; pushing early breaks every reader still on the old sources.

**Freeze-list** (readers still on the old price sources; each repointed removes a grep hit and brings B closer):
- `/prijzen`, `/app/pt` display, `/12-weken-programma` lead items: DONE (WS-3, now on the catalogue via `src/lib/catalogue.ts`).
- `/app/abonnement/nieuw`, `startSignup`, the Mollie webhook, `trial-booking.ts`: DONE, merged to `main` in PR #69 (`710870e`). `startSignup` deleted; `pricing-items.ts` now has zero callers on `main` (goes with Migration B).
- `/early-member`: DONE (repointed onto the catalogue). With `startSignup` deleted in PR #69, `pricing-items.ts` has no callers left and the module plus its `pricing_items` read go with Migration B.
- `/proefles/boeken`: DONE, on `main` (`37b69e8`), repointed onto the catalogue.
- `/app/admin/instellingen` price fields (removed together with the columns inside Migration B).
- Emergency fallback price constants (the PR #68 "fallback copies"): per the delete-fallback-blocks decision, remove them so the catalogue is the only price source, relying on ISR last-good plus an error state. Confirm they never serve as a production price source.

**Open item for WS-4/WS-5 (overstap CTA integrity):** the `/early-member` overstap card promises "geen inschrijfkosten" and its CTA points to `/abonnement` (self-service `create_order`), but the overstap waiver lives only in `admin_create_order`. A self-service overstap booking would therefore be charged the fee the card waives, a display-versus-charge mismatch. Resolve in WS-4/WS-5: either overstap routes through Marlon (the card CTA becomes an aanvraag/contact, not self-service checkout), or self-service gets a verified overstap path. Overstap normally needs proof of switching, so admin-mediated is the likely answer.

**Open correction (WS-1 seed, before Migration B): the PT and Duo cards are 10-rittenkaarten, not 12.** The catalogue faithfully seeded the value confirmed on 2026-07-08 (12 ritten); this is Ilja updating that decision to 10, an input change, not a build defect. Change the credit count (12 to 10), the label ("10 ritten"), and the slug (`pt_one_on_one_12` and `duo_12` become the `_10` form) via a small forward catalogue migration; prices are unchanged. Grep for any hardcoded 12 in the PT and Duo credit and activation paths, and repoint any reference to the old slug. Sonnet, a bounded seed correction; slot it after the current WS-2 session and before Migration B.

**Trigger, not a memory:** after each workstream that repoints a reader, re-run the grep. When it returns zero, Migration B is unblocked. That is the measurable signal to push B; nothing here relies on remembering.

### WS-ledger (huidige staat)

Bijgewerkt 2026-07-11, geverifieerd tegen de live git-staat (`gh pr list`, `git log`). Regel: elke PR werkt deze ledger bij als onderdeel van zijn definition of done, geverifieerd tegen git. De authoritative bronnen blijven de repo en `supabase migration list --linked`; deze ledger is het overzicht, niet de waarheid.

#### Fasering (afgesproken 2026-07-10)

- **Fase 1**: prijzen, abonnementen, credits en regels overal uniform en werkend met de standaard boek- en koop-pagina's. Early Member NERGENS actief toegepast (de bestaande phase-gating blijft wel staan en klapt vanzelf aan bij opening).
- **Fase 2**: Early Member als laag erbovenop, pas nadat fase 1 getest is.
- Klantbeheer (adres bijwerken, pauzeren, stopzetten) is een APARTE admin-workstream na WS-5, met eigen discovery en eigen Fable-stukken (mandaat-wijziging). Niet in WS-5.

#### Gereed / gemerged

- **WS-0 t/m WS-3**: gereed (auth/OTP, check-in hard cap + release cron, class-types via admin cockpit, schema-baseline PR #49).
- **WS-2 (order-pijplijn)**: gemerged (PR #69, merge `710870e`). create_order / createOrderAndCheckout / activate_order zijn de spine; single-order-path DB-afgedwongen. De volledige Mollie-round-trip is end-to-end geverifieerd op een preview met live env; de testdata is daarna uit productie verwijderd.
- **Prijs-consolidatie**: LIVE. PT/Duo naar 10 ritten (PR #70, `c9862b0`, migratie `20260719`), /prijzen-fallback weg (PR #71, `ab6c0bf`), Migratie B (PR #72, merge `61f51c8`, migratie `20260720`): pricing_items / membership_plan_catalogue / booking_settings-prijskolommen gedropt; tmc.catalogue is de enige prijsbron. Display-equals-charge is structureel.
- **WS-4 (publieke /abonnement boekflow)**: gemerged (PR #73, merge `b2112ae`). Configure / Identify / Pay. Oude /app/abonnement/nieuw verwijderd + 308-redirect naar /abonnement. Product-RPC-reparaties in PR #74 (`d892f66`).
- **WS-4 configurator-ombouw naar toggle-mockup**: gemerged (PR #78, merge `b78b667`). Plus-30 als zichtbare toggle (rij-wissel naar all_inclusive_*), All Access als eigen uitgelichte kaart, 7 kaarten in grid, globale 12/24-toggle. Phase-gate en EM-logica woordelijk ongemoeid (computeBreakdown, "Not a bug, do not fix this").
- **Credit-integriteit (fundament onder WS-6)**: gemerged.
  - PR #75 (`a60c77c`): adjust_membership_credits RPC onder row lock + credits.adjusted-audit; alle vier de TS-schrijvers (check-in, admin-saldo, attendance-refund, sessie-annulering-cascade) erdoorheen; undoCheckIn refundt-eerst-dan-delete; constraint credits_remaining >= 0.
  - PR #76 (`89366a6`): replay-fix (20260715 sectie-0 reconstrueert de bronstaat met ON CONFLICT DO NOTHING; keten weer from-scratch afspeelbaar; db diff werkt weer).
  - PR #77 (`c4f3cba`): expiry-handhaving (20260723) over alle vijf debit-paden; debit weigert credits_expired; refunds mogen op een verlopen kaart; vervaldag telt als geldig.
- **WS-5 PR A (betaallink-fundament)**: GEMERGED (PR #80, merge `ebee074`, commit `bd93724`, branch feat/ws5-betaallink) en END-TO-END GEVERIFIEERD op de preview tegen de Mollie-test-API: product-oneoff (pt_single) en abonnement-first-payment (groepslessen_2x) beide betaald, mandaat onder de klant-Mollie-customer, subscription door de bestaande webhook aangemaakt, en het retry-na-expiry-pad live bewezen (verlopen script-payments, verse mint bij klik). Levert: publieke /betaal/[token]-route (service-role lookup, noindex, kale 404 bij onbekend token), lazy Mollie-payment-creatie met dubbele-betaling-invariant in drie lagen (open-payment-hergebruik, deterministische idempotencyKey per poging, statusguard; bewijs in scripts/test-payment-link-invariant.ts), createPaymentRequest-server-action (requireAdmin) boven het ongewijzigde admin_create_order, en de MailerSend-mail payment_request.tsx. De testdata (2 orders, 2 memberships, 4 payments) is uit productie verwijderd en de Mollie-test-subscription geannuleerd; alle klant-copy wacht op Marlon (// COPY: confirm met Marlon). Correctie op een eerdere ledger-regel die beweerde dat de MailerSend-betaallink al bestond: die bestond niet vóór PR #80; alleen admin_create_order en de expire-orders cron waren er al.
- **WS-6 (losse producten + tegoed)**: GEMERGED (PR #79, merge `c26033f`, commit `a794f86`, branch feat/producten-tab). /app/producten met Kopen + Mijn tegoed, URL-tabs ?tab=kopen|tegoed (patroon /app/boekingen), op bestaande paden. Kopen verkoopt ten_ride_card, pt_single, pt_10, duo_single, duo_10 via de bestaande pijplijn (geen drop-in, die blijft publiek; geen inactieve kids/senior-slugs). Mijn tegoed leest uitsluitend (nul writes op credits_remaining): labels uit plan_type + plan_variant identiek aan tmc.book_pt_credits, dots alleen bij credits_total > 1, vervaldatum + waarschuwing alleen waar credits_expires_at bestaat, inline aankoophistorie uit tmc.payments (geen facturen). Enige pijplijn-wijziging: conditionele redirectUrl op isSubscription in create-order.ts, subscription-tak byte-voor-byte ongewijzigd. Vóór de merge herbeoordeeld tegen main (rebase zonder conflicten, ook niet in create-order.ts), tsc en eslint schoon, de #80-dubbele-betaling-invariant (scripts/test-payment-link-invariant.ts) slaagt op de gerebasede branch, en Vercel's build op de merge-commit is groen.
  - OPENSTAAND: redirect-verificatie met een echte product- en subscription-koop op preview (product -> /app/producten?tab=tegoed, subscription -> /app/abonnement/bedankt?order=...). Niet blokkerend voor de merge: de subscription-redirect is ongewijzigd en een verkeerde product-redirect is een onschadelijke, direct zichtbare landingsfout, geen geld- of mandaatprobleem.
  - OPENSTAAND: MemberNav-ingang voor /app/producten bewust UITGESTELD naar het aparte navigatie-project (mobiele bottom-tab-bar zit vol op 7 items). Moet vóór opening vindbaar worden.

#### In uitvoering / open

- **WS-5 (admin betaalverzoek-systeem)**: mockup goedgekeurd (Nieuw-betaalverzoek-wizard: klant zoeken/aanmaken, catalogus-product, betaallink per e-mail + kopieerbare link). Restant na PR A:
  - **PR B (Fable) on-behalf klant-aanmaak**: GEBOUWD, PR #81 (feat/ws5-onbehalf-klant, commit `4eba962`) staat OPEN. `findOrCreateCustomer` (requireAdmin): zoek-eerst op genormaliseerde e-mail (unieke sleutel via `users_email_partial_key`; treffer blokkeert aanmaak), anders `auth.admin.createUser` met `email_confirm: false` (trigger maakt profiel + member_code, nooit een directe profiel-insert), dubbel-ingevoerde-e-mail-check server-side, race op `email_exists`/422 afgehandeld als re-search (geen dubbele klant, ook niet gelijktijdig), telefoon bewust buiten het aanmaakpad (trigger-terugrol op `profiles_phone_unique` structureel onmogelijk), `member.created`-audit met source `admin_wizard`. Plus `searchCustomers` (alleen-lezen, ilike op naam/e-mail/telefoon). Bewijs: deterministische invariant-test (`scripts/test-find-or-create-customer.ts`, 24/24 inclusief de kern-race) en een live smoke-test met wegwerpaccount (daarna verwijderd): OTP-login op het vooraf aangemaakte onbevestigde account convergeert naar hetzelfde user-id en bevestigt het adres — een account, geen split. Discovery in `discovery-ws5-onbehalf-klant.md`.
  - **PR C (Sonnet) wizard-UI**: nog niet gestart. Doelbeeld = de goedgekeurde mockup. Consumeert PR A en B. Meenemen: besluit of /betaal het volledige site-chrome (navbar/footer met Early Member-banner) houdt of een kalere pagina wordt.
  - **PR D (custom bedrag / factuur)**: GEPARKEERD, bewust uit scope. Custom bedragen doorbreken de catalogus-single-source en leveren zonder BTW-registratie geen kloppende factuur op. Waarschijnlijke richting: extern boekhoudpakket met sync. Wacht op het facturatie-besluit met Marlons accountant.

#### Nog te doen (na WS-5)

- **Klantbeheer-workstream**: adres bijwerken, abonnement pauzeren/stopzetten. Eigen discovery; pauzeren/stoppen is Fable (mandaat-wijziging).
- **Navigatie-herziening**: mobiele bottom-tab-bar opnieuw indelen (nu vol op 7), inclusief de MemberNav-ingang voor /app/producten. Met Marlons blik op welke items primair zijn.
- **Fase 2 Early Member**: EM-prijs (139 All Access), waived inschrijfkosten, Groepslessen direct opzegbaar, campagnefase-afhandeling, en de server-ondergrens op de openingsdatum in _compute_order_price (nu alleen een bovengrens op closes_at). Klapt bij opening vanzelf aan tenzij expliciet tegengehouden.
- **Facturatie-besluit**: bepaalt PR D en de custom-bedrag-route. Afstemmen met Marlons accountant (boekhoudpakket, factuurnummers, BTW).

#### Bekende losse eindjes (buiten de membership-flow, uit eerdere audits)

- Footer KvK/BTW zijn placeholders (00000000 / NL000000000B01); blokkeren productie-facturatie.
- /aanbod mist een H1.
- Geen ptloosdrecht.nl naar themovementclub redirect.
- Mollie-navigatie op de mobiele wrapper draait nog op de allowNavigation-stopgap; @capacitor/browser-migratie is een aparte latere PR.
- Geen CI (.github/workflows).
- vw_admin_kpis: no_show_rate_30d staat permanent op 0 (gebouwd op booking-statussen die de check-constraint niet toestaat); aparte beslissing, geen simpele bugfix.
- Firebase-project tmc-member-app bestaat niet; alle push is stil no-op tot FIREBASE_SERVICE_ACCOUNT_KEY bestaat.

### Cutover checklist (each step stays UNCONFIRMED until its output is reported back)

Migration B is the destructive final step and may run only after steps 1 to 4 are each CONFIRMED by an actual git/grep/migration output, not by memory or a partial report. Claude flips a step to CONFIRMED only when the relevant output is pasted back; otherwise it stays UNCONFIRMED. While any step is UNCONFIRMED, the effort is not done.

1. **Establish the truth (no code).** CONFIRMED 2026-07-09. `main` is at PR #68 (`5e91c6f`); all pricing, catalogue, and Early Member work (PRs #56 to #68) is merged to `main`, nothing important floating uncommitted. PR #69 (WS-2 cutover) is open on `feat/order-pipeline-cutover`, not merged. Migrations through `20260718000000` are local equals remote (so #69's migration is already on the remote; DB ahead of `main`'s code, expected). One real gap found: `spec-membership-flow.md` and `ws0-reconciliation-report.md` are untracked, commit them.
2. **Merge PR #69, after the money test.** CONFIRMED. #69 is merged to `main` (`710870e`); migrations local equals remote through `20260718`. The real Mollie round-trip was verified end-to-end on a preview with live env (order pending to activated, membership created, Mollie subscription, clean webhook). Housekeeping to confirm separately: re-enable Deployment Protection and clean up the test order/membership rows.
3. **The two small corrections, each its own small PR.** CONFIRMED. `/proefles/boeken` repoint on `main` (`37b69e8`). PT/Duo 12-to-10 correction merged (`c9862b0`, migration `20260719000000_pt_duo_ten_ride_correction.sql`); slugs now `pt_10`/`duo_10`, credits 10, per-session price derived from the credits count, prices unchanged; grep on `pt_12`/`duo_12`/`Twelve`/`12-rittenkaart` all empty.
4. **Green grep, the go signal.** CORRECTED. The stap-4 grep was too narrow: it covered `pricing_items` and the `booking_settings` price columns but NOT `membership_plan_catalogue`. Fable's B-discovery found three live `mpc` readers the grep missed: `src/app/page.tsx` (homepage, a real price reader with a hardcoded FALLBACK_TIERS drift trap), `src/app/app/facturen/page.tsx` (name lookup), and `src/app/app/abonnement/page.tsx` (name plus bullets). These are repointed to `tmc.catalogue` inside the Migration B PR. Lesson: the grep gate must cover all three old sources (`pricing_items`, `membership_plan_catalogue`, the `booking_settings` price columns), not two. DB-side is otherwise clean (no views, functions, or inbound FKs on the doomed objects).
5. **Migration B, the final PR.** CONFIRMED. Live in production. `20260720000000_migration_b_drop_legacy_price_stores.sql` merged (`61f51c8`), local equals remote. Production serves the merge commit; homepage and `/prijzen` both 200 and render real catalogue prices from `tmc.catalogue`. The old tables (`pricing_items`, `membership_plan_catalogue`), the 13 `booking_settings` price columns, `pricing-items.ts`, the Instellingen price fields, and the dead Early Member cap machinery are gone; the three `mpc` readers were repointed. Post-drop assertions guarded `get_campaign_deadline()`, the 29-row catalogue, and the operational columns. **Display-equals-charge is now structural, not a promise: there is no second price source left to drift.** The price-consolidation track is complete.

---

## Amendments after WS-0 (locked 2026-07-09)

WS-0 reconciliation is done and approved (its sections 7 to 10). These supersede anything earlier in this spec that conflicts; WS-1 builds to these and does not re-derive them.

- **Identity primitive stays as is.** Supabase auth user plus the `handle_new_auth_user` trigger (verified live, on conflict do nothing), one insert path; same-email paths already converge, so no link-on-login is added. Admin-create resolves by creating the auth user up front in a pending state.
- **Placeholder walk-in vector, closed by design.** With no legacy data (see the no-live-data amendment below), there are no existing placeholder profiles to merge. Going forward, design walk-ins to capture a real email so placeholder identities (`...@walkin.tmc.internal`) are never created; that closes the only duplicate vector without needing any merge mechanism.
- **Single deadline source without a render regression.** `early_member_pools.closes_at` becomes the only deadline source and `campaign.ts` `EARLY_MEMBER_DEADLINE` is retired. Constraint: the root layout computes the campaign phase without a per-request DB call, to keep ISR and static rendering intact. So `closes_at` is authoritative but injected into the ISR layer at build and revalidate, with on-demand revalidate when it changes; no per-request DB call is reintroduced into the root layout. Design this in WS-1/WS-2, not as a later surprise.
- **Catalogue is the only price store.** PT prices come out of the `book_pt_pending_payment` RPC; `booking_settings` loses its price columns (signup fee and extended access currently live in both `booking_settings` and `pricing_items`, hand-synced, and collapse to the catalogue). Fallback price blocks are deleted in favor of ISR last-good pages.
- **PT is flat.** The current model is flat PT (single session or 12-rittenkaart), no tiers. The RPC's premium/standard/intake tiers, and the live bug where the standard tier charges less than the shown price, are dead or wrong: WS-1 verifies PT is flat and folds the correction into WS-1/WS-2 rather than a separate hotfix. If standard/intake sessions are still being sold, flag it as a revenue leak, not just dead code.
- **Early Member caps are dead.** Decided 2026-07-08: no maximum places, scarcity is purely time-based. `early_member_pools` is kept only as the home of `closes_at`; the cap column, reservation, and release cron are presentation-less and treated as dead unless deliberately reused. WS-1 seeds and enforces no caps.
- **Teardown is smaller than assumed.** `/prijzen` already exists near target (DB-sourced, ISR). The TS Early Member price constant is already retired into `early_member_price_cents` (PR #68); only fallback copies and the deadline constant remain. Admin membership assignment does not exist, so WS-5 only builds, it does not tear down. One path inserts into memberships (`startSignup`). Emails and the Capacitor wrapper contain zero links to any removed route.
- **12-weken programma's, decided: shown with an aanvraag-CTA (option B).** The studio and online programma's appear on `/prijzen` with an intake/aanvraag CTA that creates a lead (the second branch of proefles: MailerLite plus a staff alert), not a direct-buy through the pipeline. Their prices still live in the DB catalogue like everything else, but they are display-and-lead items, not orderable products, so the catalogue needs a purchasable-versus-lead flag. WS-1 seeds them on this basis.

### No live TMC data yet (treat `tmc` as greenfield)

There are no active TMC members, no bookings, and no live checkout. So within the `tmc` schema this is a new build: no data to preserve, no existing memberships or orders to protect, no migration gymnastics to keep an in-place column or table intact, no rollback-for-data concern. Tables and RPCs can be dropped and recreated cleanly. The price snapshot on an Order stays, but only as ordinary order-record practice (refunds, history), not as a safety mechanism against changing a live member's charge. The placeholder walk-in vector is forward design only, since there is no legacy data to merge.

What does not relax: the Supabase project is still shared with the live tvmuur app. Every migration stays schema `tmc` only, never `public` or `tvmuur`, the `20260503` placeholder stays untouched, and the migration chain on the shared remote stays valid. These guardrails protect the co-tenant app, not TMC customers, so "new build" does not license anything cross-schema. Where a Postgres dependency requires drop-and-recreate in one transaction (a view and its dependent function), that stays as correctness, not as data safety.

---

## WS-2 Order pipeline design (approved 2026-07-09, two conditions)

Fable's WS-2 design is approved (its sections 2 to 8). Locked decisions, which WS-3 through WS-7 build to:

- **Recurring stays on the Mollie Subscriptions API** (28-day interval, subscription created one cycle after the first payment). Not rebuilt as a cron.
- **Product orders reuse existing membership rows** (`ten_ride_card`, `pt_package` with `credits_*` columns, consumed under row locks). No new balance table.
- **One table `tmc.orders`**: a selection plus a server-written price snapshot plus token plus `expires_at`; statuses draft, pending, activated, plus `paid` as a persisted money-in-but-activation-blocked ops state, plus expired and cancelled.
- **Exactly three SECURITY DEFINER functions**: `create_order` (authenticated, self), `admin_create_order` (staff-gated inside via `is_admin()`, adds target profile, overstap waiver, longer TTL), `activate_order` (service-role only, the single atomic activation under a row lock). `tmc.orders` has no client insert policy, so "one order-creating path" is DB-enforced, not conventional.
- **Client sends only a selection** `{slug, extendedAccess, commit24m, earlyMember}`; the RPC recomputes price, Early Member, waivers, and the snapshot from `tmc.catalogue` plus `get_campaign_deadline()` in one transaction. The confirm screen and the Mollie charge both render that snapshot, so shown equals charged by construction.
- **Idempotency**: exactly-once pending-to-activated (lock plus status guard), unique `mollie_payment_id` on orders and payments, a Mollie `idempotencyKey` on every create call, and webhook retries repair a missing subscription instead of duplicating it.
- **Early Member is a data branch** (price override, commit 0, fee 0, price lock, all from the catalogue row); the post-deadline fallback is the else-branch, no code change.
- **EM and the 24-month discount are mutually exclusive** (no stacking). For Groepslessen this is forced anyway (EM is monthly-cancellable, which cannot also be a 24-month lock). Marlon blesses this as the commercial default for the All Access case.
- **TTLs**: 24h self-service, 7 days (max 14) admin. An EM order paid within its TTL keeps the EM snapshot even just past the deadline; a resend after expiry re-snapshots at current prices. A late payment on an expired order is honored, not refunded, bounded so an EM snapshot can never survive beyond the order TTL and the Mollie payment expiry. A failed payment stays re-issuable until it expires.
- **`profiles.mollie_customer_id`** is the canonical Mollie customer per profile (one customer, reused, so mandates never fragment).
- **Cutover**: `startSignup` is deleted in the same PR that rewires its two callers onto the pipeline; the webhook keeps its URL with the first_payment branch replaced and the recurring and pt_booking branches retained; `trial-booking.ts` is repointed off `booking_settings` in this PR.

Two conditions before Sonnet builds:

1. **The `earlyMember` flag from the client is never authoritative for price.** The server applies Early Member only when `get_campaign_deadline()` says the phase is open, regardless of the flag; the flag is at most an intent or routing hint, never a price lever. Same principle as never trusting a client-sent amount.
2. **`activate_order` must not create a second active subscription** for a profile that already has one. Define the behavior explicitly (block, or route to a change), which is the seam with WS-7 member self-management. A double-submit or a returning member must never mint two active mandates.

---

## The one idea this whole thing rests on

There is a single purchase pipeline with four stages. The customer path and the admin path are not two features; they are two entry points into the same pipeline that diverge only in the first two stages and converge for the last two.

1. **Configure** (pick offering, frequency, add-ons, commitment; price comes from the catalogue): customer does it on the site, OR Marlon does it in admin.
2. **Identify** (a profile exists for the buyer): customer creates it via OTP, OR Marlon creates/searches it in admin.
3. **Pay** (customer completes the Mollie payment; for a subscription this captures the SEPA mandate): ALWAYS the customer. Delivered as an inline redirect (self-service) or as a payment link emailed via MailerSend (admin).
4. **Activate** (webhook confirms, membership goes active / product is credited): identical for both.

Why "pay" is always the customer and not a workaround: a SEPA recurring mandate can only be authorized by the account holder. Marlon literally cannot complete it for someone. So "Marlon sends a payment link" is not a second checkout; it is the exact same Pay stage, handed to the customer asynchronously. That is why one pipeline covers both. It also keeps bank and card data out of Marlon's hands entirely, which is the correct boundary.

Build consequence: build the pipeline once (the spine), then thin front-ends onto it. Do not build two checkouts.

---

## No duplication by construction (one identity, one order, one price)

The point of this design is that there is exactly one of each thing that could otherwise fork. That is what prevents double flows, orphan pages, and price discrepancies, but it only holds if the cutover enforces it, so each item below is paired with an acceptance check in WS-0.

- **One profile-creation primitive.** Every way a customer comes into existence, self-signup, admin creating a customer, or a payment completing, resolves to the same OTP-based identity. The sharpest risk in the whole design is here: if Marlon pre-creates a profile for an email in admin, and that customer later does an OTP login with the same email, the system must resolve to the one existing profile, not mint a second auth identity and orphan the first. Design this as one identity keyed on email (create the auth user at admin-create time in a pending state, or link on first login), never two paths writing profiles differently.
- **One order-creating path.** Only the Order pipeline creates a purchase. `/app/abonnement/nieuw` is retired, not left running beside the new flow.
- **One price source.** The DB catalogue, for both display and charge. Retire the TS Early Member constant. Reconcile the Early Member deadline too: today `campaign.ts` (display) and `early_member_pools.closes_at` (enforcement) are two hand-synced values; unify them so the campaign that gates EM display and the campaign that gates EM checkout are the same truth, or you have reintroduced exactly the drift this design removes.
- **No orphans.** Removing a page is not enough; every inbound reference is repointed: nav, footer, `/early-member` CTAs, transactional emails, and the Capacitor app's routes. The bar is zero references to any removed route anywhere in the codebase.

---

## Two pages, two jobs (and everything old is deleted)

Every existing pricing, subscription, and membership page is removed, including the current in-app checkout `/app/abonnement/nieuw`; these two replace them, and any old route 301's to the right new one:

1. **Prices overview** (`/prijzen`): the whole catalogue shown clearly and scannably, read from the DB. All memberships and their frequencies, the add-on, the one-off products, the commitment terms and inschrijfkosten. Prices are shown as they are. While the Early Member campaign runs, the page also makes the Early Member benefits clear (see the Early Member section). Its job is orientation and comparison; it holds no checkout logic. Its CTAs point to `/abonnement`.
2. **Subscription booking** (`/abonnement`): where you directly book a subscription (and buy one-off products), running the Configure, Identify, Pay, Activate flow below.

A logged-in buyer who lands on `/abonnement` skips Identify. The `/early-member` page keeps its role as the campaign surface, but its CTAs now link into the `/abonnement` flow with Early Member benefits applied, not to any removed page.

---

## Catalogue structure (values live in the DB, none in this spec)

This spec names no prices, discounts, or fees; every figure lives in the DB catalogue and is seeded and changed by migration. What follows is the structure the catalogue holds, not its values.

Membership families:
- **Groepslessen** (yoga + mobility + kettlebell as one offering), with a frequency choice (2x / 3x / onbeperkt per week).
- **Vrij Trainen** (standalone), same frequency choice.
- **All Access** (public name; internal `all_inclusive`) = Groepslessen plus the Vrij-Trainen-add-on, which ALWAYS gives unlimited vrij trainen regardless of the lesson frequency. State this explicitly on both pages.

Add-on:
- **Extended access** (06:00 to 23:00): included with All Access onbeperkt, a paid add-on on All Access 2x/3x and on standalone Vrij Trainen tiers, not applicable to Groepslessen-only.

One-off products (all purchasable directly, see below):
- **Drop-in**, **10-rittenkaart**, **Personal Training** (single session and 12-rittenkaart), **Duo** (single session and 12-rittenkaart). No member discount, no weekend surcharge.

Terms and modifiers:
- **Commitment**: standaard 1 jaar, daarna maandelijks (per 4 weken) opzegbaar; optie 24 maanden met korting; geen restitutie.
- **Inschrijfkosten** (one-off), vervalt bij Early Member en overstap.
- **Early Member**: a distinct benefit set during the campaign phase (price and terms; see below).

Kids and senior are not offered on these surfaces. Public labels Dutch (flagged `// COPY: confirm met Marlon`), code and columns English, no em dashes.

---

## Prices come from the DB, authored by migration

Every price is read from the DB catalogue, for both what a page shows and what checkout charges, so the number a visitor sees and the number Mollie charges are the same row and cannot drift. No price is hardcoded in TS and no price used for a charge comes from Sanity; retire any price constant living in code (for example the Early Member All Access constant) and move it into the catalogue. If Sanity keeps pricing content it is marketing decoration only, never a charge source. Prices are seeded and changed by migration (version-controlled, a price change is a deploy, auditable); there is no admin price editor in this scope.

Two consequences to build in deliberately:

- **The overview page stays fast without giving up the DB as source.** Read the catalogue at build/revalidate time (ISR) and revalidate on demand when a migration changes prices, rather than hitting the DB on every request. The DB is the source; the page is a cached projection of it.
- **A catalogue price change never retroactively alters an existing member's charge.** The catalogue price is the price for new orders. Each Order locks a price snapshot at purchase (in the object model), and the recurring Mollie charge runs off that snapshot and the mandate. A price change affects who buys next, not who already has a mandate. This is why the snapshot exists, and it is a feature, not a caveat.

---

## Early Member handling (display and checkout, gated by campaign phase)

While the Early Member campaign is active, the benefits must be clear on the pages AND actually applied at checkout. This is driven by the campaign phase (the existing campaign source), while every value comes from the DB. Nothing about Early Member is hardcoded.

- **Display**: `/prijzen` shows the regular prices as they are, and additionally surfaces the Early Member benefits while the campaign runs. `/early-member` remains the dedicated campaign page. Both read the same EM values from the DB, so the shown benefit and the charged benefit cannot diverge.
- **Checkout**: when the campaign phase is active, the flow applies the Early Member benefit set for the chosen family. The benefit set differs per family (for example: the distinct All Access Early Member price; waived inschrijfkosten; the Early Member commitment terms such as immediate monthly cancellability where that applies). The exact benefit-per-family mapping and its values live in the catalogue; the flow reads them, it does not encode them.
- When the campaign phase closes, checkout falls back to the regular catalogue values automatically, with no code change.

---

## The flow, stage by stage

### Stage 1: Configure

On `/abonnement`, you first choose the base offering and its **frequency** (2x / 3x / onbeperkt). Then optional add-ons and upgrades, priced from the catalogue and reflected live:

- **Extended access** (add-on).
- **Onbeperkt vrij trainen** (the Vrij-Trainen-add-on): on a Groepslessen membership this makes it All Access, always unlimited vrij trainen regardless of the class frequency.
- **Upgrade to a 24-month commitment** at the catalogue discount.

A clear first-charge summary shows the recurring amount plus inschrijfkosten (or waived), and, while the campaign runs, the Early Member benefit applied. Output is a draft order.

Admin variant: the same configurator inside the cockpit, plus explicit waiver and discount controls (waive inschrijfkosten for EM/overstap, apply the EM benefit, apply the 24-month discount).

Low-friction principle: let the buyer configure freely before asking for anything. The account is requested only at the commit point (Stage 2), not up front.

### Stage 2: Identify

Customer self-service: OTP (email then 6-digit code, the existing login primitive), collecting name and phone here since a profile and SEPA both need them. If already logged in, this stage is skipped.

Admin: Marlon searches for an existing customer or creates a new profile (name, email, phone). Because Marlon sets the email, the customer's account already exists the first time they log in via OTP later.

### Stage 3: Pay

Confirm screen: plan, frequency, add-ons, commitment, price per 4 weken, first-charge amount, inschrijfkosten or waiver, Early Member benefit if active, terms. Then:

- **Subscription**: create a Mollie Customer for the profile and a first payment (`SequenceType.first`) so the SEPA mandate is captured; subsequent charges run `recurring` on a 4-week cycle. Do not use Mollie's generic Payment Links for a subscription: a plain link does not establish the mandate.
- **One-off product** (drop-in, rittenkaart, PT/Duo package): a `oneoff` payment; no mandate.

Delivery differs only in transport, not in substance:
- Self-service: inline redirect to the Mollie checkout, back to a success page.
- Admin: the order's Mollie checkout URL (`_links.checkout.href`) is the payment link, emailed to the customer via MailerSend. The customer completes it exactly as a self-service buyer would.

### Stage 4: Activate

Webhook `paid` resolves the order: for a subscription, create the membership, store the mandate, and schedule recurring charges; for a product, credit the rittenkaart balance or register the drop-in. Confirmation email plus push. This path is identical regardless of who created the order.

---

## One-off products (in scope now)

Drop-in, 10-rittenkaart, PT (single and 12-rittenkaart), Duo (single and 12-rittenkaart) are built in this effort, through the same Order pipeline with `type = product` and a `oneoff` Mollie payment (no mandate). They are visible on `/prijzen` and directly purchasable; Marlon can also create a product order in admin and send its payment link via MailerSend, exactly as for a subscription. Drop-in ties to a specific session; rittenkaarten and PT/Duo packages credit a balance on activation.

---

## Extended access: at purchase and afterwards

Extended access can be added two ways, both in scope:
- **At purchase**: as an option in the configurator (Stage 1), included in the first order.
- **Afterwards**: as an add-on to an existing membership, from the member's own account. This is a membership change that adjusts the recurring amount from the next 4-week cycle (a small membership-modification path on top of the existing mandate, not a new mandate). It reads the extended-access value from the catalogue like everything else, and respects the tier rule (included free with All Access onbeperkt, paid elsewhere, n/a for Groepslessen-only).

---

## Conceptual object model (the spine)

- **Catalogue**: the single source of offerings (Groepslessen, Vrij Trainen, All Access), their frequency options and prices, the add-ons, the one-off products, and the Early Member benefit values. Kids/senior not present. Everything a page shows and every price a checkout charges comes from here, so display and charge can never disagree.
- **Order** (the spine): a configured purchase. Holds the buyer profile, type (`subscription` | `product`), the selected offering, frequency, add-ons and commitment, a price snapshot, applied waivers/discounts (including any Early Member benefit), `created_by` (`self` | admin profile), a Mollie payment id, a token, an `expires_at`, and a status: `draft` then `pending` then `paid` then `activated`, or `expired` / `cancelled`. Both entry points create an Order; both resolve through it.
- **Profile**: the customer account.
- **Membership**: the active subscription produced by a paid subscription order, referencing the Mollie mandate for recurring billing; can be modified (for example adding extended access) from the next cycle.
- **Product credit**: rittenkaart balance / drop-in entitlement produced by a paid product order.

The Order is what makes the customer and admin paths one thing: it does not care who created it, only that it gets paid.

---

## Admin path specifics

A "Nieuw lid" wizard that mirrors the customer configurator, with: customer search or create, waiver/discount controls, and payment-link delivery via MailerSend. Marlon never enters payment details and never completes a payment; she produces the link and the customer pays. Any RPC that creates a profile or an order on someone else's behalf is admin-only and a SECURITY DEFINER surface: scope it to staff, verify live definitions with `pg_get_functiondef`, never let `db push` silently overwrite it.

If the customer never pays an admin-created link, the order expires (`expires_at`, plus Mollie payment expiry) and Marlon is notified so she can re-send or follow up. A light sweep cron (existing cron shape: `verifyCronAuth`, `createAdminClient()`, act) moves stale `pending` orders to `expired`.

---

## /app/ integration (member app, admin, and mobile)

This is not only the public website; it lands in `/app/` in three places, and in the native apps through the Capacitor wrapper. There is one flow and one pipeline, reached from more than one surface, never a parallel re-implementation.

1. **Logged-in booking.** `/app/abonnement/nieuw` is one of the pages this replaces. A logged-in member who starts a membership enters the same Configure, Pay, Activate flow with Identify skipped, whether they arrive from public `/abonnement` or from inside the app. Same route, same Order, same pipeline.
2. **Member self-management.** Existing members manage their membership inside their `/app/` account. This is where the post-signup changes live: add extended access, change frequency, upgrade to a 24-month commitment, cancel per the commitment terms. These are membership modifications on the existing mandate, effective from the next 4-week cycle, reading values from the same catalogue. The extended-access-afterwards path in this spec is the first of these; the others share its shape.
3. **Admin cockpit.** The Nieuw-lid wizard and the MailerSend payment link (WS-5) live in the app's admin area. Marlon runs the same configurator and the same Order pipeline; the only difference is that she creates or searches the customer and the customer pays via the emailed link.

**Mobile (Capacitor).** Because `/app/` is wrapped into the iOS and Android apps, this flow appears there too. Two implications: the Mollie checkout must open correctly in-app, which is the pending move off the `allowNavigation` stopgap to `@capacitor/browser` and should be resolved as part of shipping the flow on mobile; and on iOS the purchase is for a real-world service (gym membership and classes), outside Apple's in-app-purchase requirement, so external payment via Mollie is permitted. That is still a review-sensitive area and should be validated at submission, separate from the Akiles 4.7.2 review risk already tracked.

---

## Build breakdown for CC

The first CC step is an inventory of the existing pricing, subscription, and membership surfaces, so they can be deleted and 301'd cleanly and the `/early-member` CTAs repointed. That is the only role "what exists" plays here.

- **WS-0 Reconciliation and teardown (do this first; it is the guarantee).** Inventory every existing surface that creates a profile, starts or sells a membership, or shows a price. For each, decide keep-and-route-into-the-pipeline or delete-and-301, and repoint every inbound link. This is the step that turns "designed not to duplicate" into "verified not to duplicate," and its exit test is the Acceptance criteria below. The greenfield framing and this teardown are not in conflict: the target design ignores current code, but this step must read current code precisely, because that is the only way to know nothing is left orphaned or forked.
- **WS-1 Catalogue**: the single-source catalogue in the add-on model, all values (including Early Member benefit values and product prices) seeded by migration, kids/senior out. Everything else reads from this.
- **WS-2 Order pipeline (the spine)**: the Order object and its state machine, the Mollie integration for both subscription (first payment plus mandate) and one-off products, the Early Member benefit application gated by campaign phase, and the webhook activation. Shared by every front-end.
- **WS-3 Prices overview page** (`/prijzen`): the DB-sourced overview (ISR + on-demand revalidate), with Early Member benefits surfaced during the campaign. Delete all old pricing/subscription/membership pages, 301 them, and repoint `/early-member` CTAs into `/abonnement`.
- **WS-4 Subscription booking page + customer flow** (`/abonnement`): the configurator (frequency, then extended access / onbeperkt-vrij-trainen add-on / 24-month upgrade), OTP identify, confirm/pay, success, with Early Member applied when active. The 24-month upgrade is intentionally hidden while Early Member is open (mutual exclusivity, plus pre-launch flexibility-first) and returns automatically once the campaign phase closes, this is a deliberate rule, not an oversight.
- **WS-5 Admin front-end**: the Nieuw-lid wizard and MailerSend payment-link generation/delivery, for subscriptions and products.
- **WS-6 One-off products**: drop-in / rittenkaart / PT / Duo purchase through the pipeline, plus the post-signup extended-access add-on path.
- **WS-7 Member self-management in `/app/`**: the member account surface for changes on an existing membership (add extended access, change frequency, upgrade to 24-month, cancel per commitment), as modifications on the existing mandate effective next cycle. Discovery decides what already exists here versus what is new.
- **Mobile dependency (cross-cutting)**: shipping the flow in the native apps requires the Mollie checkout to open cleanly in-app, that is the move off `allowNavigation` to `@capacitor/browser`. Track it with WS-4/WS-6 rather than as an afterthought.

Every prompt carries the universal preamble: project ref `xoivleieyfcxcfawgveh`, schema scope `tmc` only (never `public,tvmuur`, skip `20260503`), design skill at `~/.claude/skills/the-movement-club-design/`, Dutch copy flagged `// COPY: confirm met Marlon`, no em dashes, prices "per 4 weken", Marlon zij/haar, SECURITY DEFINER verified via `pg_get_functiondef`, Phase 1 discovery with a stop-and-report before code, `supabase migration list --linked` shown before any push, new migrations as repo files.

---

## Model allocation (Fable vs Sonnet)

Principle unchanged: Fable owns the high-stakes design, anything touching SECURITY DEFINER RPCs, payments and SEPA mandates, identity, access policy, Early Member and pricing correctness, and migrations on the shared Supabase remote. Sonnet implements once that design is locked: the pages and the wiring. Where a workstream carries both, Fable produces and signs off the design, then Sonnet builds to it.

- **WS-0 Reconciliation and teardown**: Fable designs the identity model (one email-keyed profile primitive; how admin-precreate resolves against OTP-first-login) and makes the keep/delete/301 calls. Sonnet executes the mechanical teardown, redirects, link repointing, and writes the acceptance checks.
- **WS-1 Catalogue**: Fable designs the schema (add-on model, Early Member benefit shape, RLS) and the migration approach on the shared remote (supersedes #61, forward migration). Sonnet writes the migration file and seeds the values.
- **WS-2 Order pipeline (the spine)**: Fable, the highest-stakes piece: the SECURITY DEFINER RPC boundaries, the Mollie first-payment/mandate and oneoff handling, the state machine, the Early-Member-gated-by-phase logic, and the webhook activation. Sonnet implements the well-scoped parts once each is locked; Fable reviews every definer function via `pg_get_functiondef`.
- **WS-3 Prices overview page**: Sonnet, a DB-sourced presentational page with ISR against the design skill. No Fable design beyond WS-1.
- **WS-4 Booking page + customer flow**: Sonnet builds the configurator, OTP identify, confirm/pay and success, riding on the WS-0 identity design and the WS-2 pipeline.
- **WS-5 Admin front-end**: Fable designs the on-behalf authorization (who may create a profile or order for another person, as a staff-scoped definer surface). Sonnet builds the Nieuw-lid wizard and the MailerSend link delivery.
- **WS-6 One-off products**: Sonnet for the product purchases through the existing pipeline. Fable reviews the membership-modification-on-existing-mandate billing for the post-signup extended-access add-on (proration and next-cycle correctness).
- **WS-7 Member self-management**: Fable sets the change and cancellation policy and the mandate-adjustment rules (commitment terms, next-cycle effect). Sonnet builds the account UI and wiring.

Rule of thumb for anything not listed: if getting it wrong charges the wrong amount, creates a second identity, or opens an access path, it is Fable; if it renders or wires up a design that is already locked, it is Sonnet.

---

## Acceptance criteria (how we know "for sure", not just by intent)

These are the exit tests that convert the design intent into a checked guarantee. WS-0 is not done until they pass:

- **One profile-creation path**: exactly one function creates a profile; a codebase search finds no other insert into the profiles table from app code. A test proves that an admin-pre-created email, used later for OTP login, resolves to a single profile with no duplicate identity.
- **One checkout path**: exactly one code path creates an Order and initiates payment; `/app/abonnement/nieuw` and any other former checkout return 404 or 301, not a working parallel flow.
- **No orphans**: zero references anywhere (routes, nav, footer, transactional emails, Capacitor app) to any removed pricing, subscription, or membership page.
- **Display equals charge**: for every catalogue row, the price shown on `/prijzen` equals the price the Order snapshots and Mollie charges.
- **Early Member consistent**: with the campaign phase active, the EM benefit shown equals the benefit applied at checkout; with it closed, both fall back to regular values with no code change; the EM deadline reads from a single source.

---

## Decision log (resolved)

1. **Routes**: `/prijzen` (overview) and `/abonnement` (booking). All existing pricing, subscription, and membership pages are removed and 301'd; `/early-member` CTAs link into the `/abonnement` flow.
2. **One-off products**: in scope now (drop-in, rittenkaart, PT, Duo), through the same Order pipeline as `type = product` with one-off Mollie payments.
3. **Early Member**: `/prijzen` shows regular prices as they are and, while the campaign runs, clearly surfaces the Early Member benefits; checkout applies the Early Member benefit set (price, waived inschrijfkosten, terms) gated by the campaign phase. All values from the DB, phase from the campaign source; the benefit set differs per family.
4. **Payment-link delivery**: via MailerSend (email).
5. **Configurator depth**: choose frequency first; then optional extended access, onbeperkt vrij trainen (the add-on that makes Groepslessen into All Access), and an upgrade to a 24-month commitment at the catalogue discount.
6. **Extended access**: available both at purchase (in the configurator) and afterwards as an add-on to an existing membership.

---

## Out of scope

- The Early Member campaign mechanics themselves (already built; this spec reads the campaign phase and the EM values, and applies them).
- Exact Dutch copy for the pages, configurator, confirm screen, and payment-link email (drafted at implementation, flagged `// COPY: confirm met Marlon`).
- Access control enforcement for extended hours (Akiles-gated, separate track); this spec only sells the `extended_access` entitlement, it does not enforce the door.
