# WS-4 Phase 1 approved. Proceed to Phase 2 (Sonnet). Build these four directions in.

Phase 1 discovery is confirmed. Vrij Trainen is resolved: `vrij_trainen_2x/3x/unl` are live and purchasable, so all three families ship. VT is `early_member_eligible: false`, so render no EM banner or discount on VT (Groepslessen and All Access keep theirs). No migration, no RPC, no schema in this WS.

Four confirmed directions for the build:

1. **Confirm-screen pricing is display-only and catalogue-derived.** `createOrderAndCheckout` runs `create_order` plus Mollie in one shot and returns only `{checkoutUrl, amountCents}`, then redirects, so the confirm screen cannot show a server snapshot first. Derive the summary client-side from the catalogue using the same rules `/nieuw` already replicates (EM gate, 24m factor, extended-access add, inschrijfkosten or waived), show the components rather than one computed total, and treat the returned `amountCents` as authoritative. Do NOT add a preview RPC or endpoint.

2. **`profile.ts` revalidatePath calls: review, do not blind-repoint.** The two `revalidatePath("/app/abonnement/nieuw")` calls existed because `/nieuw` server-rendered the address gate. `/abonnement` is public and configure-freely: if it does not depend on a profile write for its render, remove them; only repoint if a real dependency exists.

3. **Retire `/app/abonnement/nieuw` via a `next.config` 301 to `/abonnement`, page body deleted.** Not an in-page `redirect()`. Exit test: the route returns 301, not a working parallel checkout, and a codebase search finds zero live references. A logged-in member landing there reaches `/abonnement` with identify skipped.

4. **Overstap lead endpoint uses a real configured MailerLite group via env** (mirror `MAILERLITE_INFO_GROUP_ID`) plus the ntfy staff alert. No hardcoded or guessed group id, no reuse of `/proefles` copy. Flag new copy `// COPY: confirm met Marlon`.

Also, at the start of Stage 2 wiring, confirm the exact send-OTP action call (Phase 1 found `verifyLoginOtp` but not the send action) before building the identify step against it. Reuse `saveRegistrationAddress`-style validation for the address write, not `updateProfile`.

Standing rules still apply: schema `tmc` only, skip `20260503`, prices "per 4 weken", no em dashes, Dutch copy flagged, read `~/.claude/skills/the-movement-club-design/` before any UI. Report the acceptance checks at the end.
