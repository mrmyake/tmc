# Spec: Email OTP Login (replaces magic link)

## Status
Decided — ready to serve as implementation prompt for a Sonnet build session on a branch.

## Problem

Magic link auth breaks inside the Capacitor-wrapped member app. The link opens in an external browser (Safari/Chrome) instead of the app unless Universal Links (iOS) and App Links (Android) are correctly configured, and even then some mail clients (Outlook Safe Links, corporate scanners) prefetch the link and burn the single-use token before the member clicks it. Net result: members get "link expired" or land in the wrong context.

## Goal

Replace magic link with a 6-digit email OTP for all login (web + app), removing the dependency on deep linking entirely. One flow, one implementation, works identically in browser and in the Capacitor shell.

## Non-goals (this spec)

- SMS OTP — deferred. Twilio/MessageBird cost (~€0,05–0,08/SMS) plus the fact that phone numbers already have an open production bug (`handle_new_auth_user` fallback phone violating `profiles_phone_e164_nl`) make this a bad time to lean on phone as an auth factor. Revisit after that bug is fixed and only if members explicitly ask for faster UX.
- Push-approval login — deferred. Doesn't solve first-login (no device token exists yet to push to). Possible future addition once Firebase project exists, not a v1 concern.
- Social login (Google/Apple) — out of scope, not requested.

## Proposed flow

1. Member enters email on login screen (app and web, same component).
2. `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })` for existing members. Signup flow uses `shouldCreateUser: true` as a separate entry point — do not silently create accounts from the login screen.
3. Supabase emails a 6-digit code.
4. Member enters code in-app. `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
5. On success, standard Supabase session is created and persisted exactly as it is today — no change needed here since this was never the broken part.
6. On failure, show inline error, allow retry within attempt limit (see open questions).

## Touchpoints in the existing codebase

- Login screen(s) in marketing + member route groups — replace magic-link request UI with email input → code input (two-step, one screen or two).
- Remove any magic-link callback route / deep-link handler that currently parses the token from a URL, once OTP is confirmed working end-to-end. Don't remove until parallel-run period ends (see rollout).
- Capacitor: no native plugin changes needed — this removes a dependency on deep linking rather than adding one. `@capacitor/browser` work already planned for Mollie stays a separate task.
- Email deliverability: Supabase Auth emails route through Supabase's own SMTP by default. TMC already runs MailerSend for transactional email. **Decision needed:** configure Supabase custom SMTP to send OTP emails via MailerSend for branding consistency and deliverability, or accept Supabase's default sender. Recommend MailerSend for brand consistency (Fraunces/Champagne styling won't apply to Supabase's default template anyway, so a custom template is needed regardless).
- Email template: needs a branded OTP template (Stone 100 / warm black / Champagne, Fraunces display font per design system) with the code prominent and short expiry messaging. Copy in Dutch. `// COPY: confirm with Marlon`

## Policy decisions (locked)

1. **Code expiry: 10 minutes.** Default of 1 hour is unnecessarily wide for a login code and only extends the brute-force window; shorter than 5 minutes causes false failures for members on slow mail (Outlook, greylisting). Set explicitly in Auth > Providers > Email > Email OTP Expiration — do not rely on the 3600s default.

2. **Resend cooldown: 60 seconds, with visible countdown in the UI.** Matches Supabase's default per-address OTP request cooldown. The UI countdown matters more than the number itself — without it, members re-request blindly and end up confused by two codes in one inbox. This is also why custom SMTP (see below) is a hard requirement, not just a branding nicety: Supabase's own SMTP caps out at 30 new-user emails/hour by default, and users report hitting much tighter effective limits in practice.

3. **Brute-force protection: no custom lockout table.** Rely on Supabase's built-in IP-based rate limiting (token-bucket, capacity 30 requests, refill rate configurable per project) plus the 10-minute expiry. Do not assume the "~30 per 5 min" figure as fixed — the refill rate is configurable in Authentication > Rate Limits and must be explicitly set and verified for this project, not left on whatever default ships. **Accepted residual risk:** this protection is IP-based, so an attacker rotating IPs is not fully mitigated. Acceptable at TMC's scale (boutique studio, not a high-value target); revisit with Supabase's CAPTCHA option on the sign-in endpoint if abuse is ever observed. Smoke test must confirm the rate limit is actually active, not just configured.

4. **Web/app parity: full replacement.** OTP replaces magic link everywhere, web included. One flow, one code path, consistent with the single-monorepo principle. Avoids maintaining two auth entry points and removes the Outlook-prefetch problem for web members too. Confirm with Marlon that no web members have flagged a preference for the one-tap link experience before shipping.

5. **Existing sessions: no impact, confirmed.** Roles are read fresh from `profiles.role` per request via layout guards, and RLS checks `auth.uid()` — nothing in the codebase depends on which auth method produced the session. Already-logged-in members are unaffected by this change.

6. **Audit/event logging: yes, verify must run through a server action.** Client-side `verifyOtp()` calls never reach the server, so failed attempts can't be written to `tmc.events`. Route verification through a server action that calls `verifyOtp()` and emits `emitEvent('auth.otp_failed', ...)` on failure.

   **Critical implementation requirement uncovered during review:** moving `verifyOtp()` server-side changes which IP address Supabase sees for rate-limiting purposes — it becomes the Vercel server's IP instead of the member's IP. Left unhandled, this pools every member's login attempts into one shared rate-limit bucket, which (a) breaks the brute-force math in decision 3, since one attacker exhausts the quota for all members at once, and (b) risks a self-inflicted lockout during normal traffic (e.g. many members logging in on a busy morning). To fix: forward the real end-user IP via the `Sb-Forwarded-For` header, use a secret API key (not the anon/publishable key) for the server-side call, and explicitly enable IP address forwarding in the project's rate limit settings. This must ship together with the server action, not as a follow-up.

**SMTP decision: MailerSend as custom SMTP for Supabase Auth.** Resolves the email rate-limit ceiling from decision 2 and is required regardless for the branded template (Stone 100 / warm black / Champagne, Fraunces display) since Supabase's default template won't carry TMC branding.

**Build note:** magic links and email OTP share the same underlying Supabase mechanism — they differ only in the email template. To send a code instead of a link, the template must use `{{ .Token }}` instead of `{{ .ConfirmationURL }}`. Easy to miss during implementation; call it out explicitly in the build prompt.

## Rollout

- Build behind a flag or on a branch, parallel-run against magic link briefly if feasible, then cut over.
- Once confirmed stable, remove magic-link callback/deep-link parsing code to avoid maintaining two auth entry points.
- Smoke test: new member signup, existing member login, wrong code entry, code expiry, resend, lockout (once policy is set).

## Cost impact

None. Email OTP uses existing Supabase Auth + existing MailerSend account if custom SMTP route is chosen. No new vendor, no per-message cost (unlike SMS).

## Recommendation

Email OTP, fully replacing magic link on both web and app, custom template sent via MailerSend for brand consistency. Policy decisions above are locked. Hand this spec to Sonnet for implementation as a single PR (`feat: email OTP login`), one PR per the existing convention. The IP-forwarding configuration for the server-side verify action is not optional and must land in the same PR, not as a fast-follow.

## Implementation record (2026-07-03, branch feat/otp-login)

Built and smoke-tested against the live project. Deviations from the flow section above, per go-ahead corrections:

- `shouldCreateUser` stays on its default (true): `/login` remains the combined login/signup entrypoint with UTM attribution, no separate signup route.
- OTP length set to 6 digits (`mailer_otp_length`, was 8 on the live project).
- `/auth/callback` and the implicit fallback are NOT removed: trainer invites (`inviteUserByEmail`) and the seed workflow depend on them. Only the member login UI dropped the link flow.

Config applied via Management API: `rate_limit_email_sent` 2 to 30 per hour (the 2/hour was a leftover built-in-SMTP ceiling that blocked all testing), `mailer_otp_exp` 900 to 600, `security_sb_forwarded_for_enabled` on, `mailer_otp_length` 8 to 6. Both the magic_link and the confirmation (signup) templates now render `{{ .Token }}` with Dutch branded copy and 10-minute expiry messaging; the confirmation template previously still carried the English Supabase default with a link, which would have broken the signup half of the flow.

Smoke test results: existing-member login end-to-end in browser (role redirect to admin cockpit verified), wrong code shows inline error and allows retry, resend blocked server-side within 60s (HTTP 429) with visible UI countdown, failed verify writes `auth.otp_failed` to `tmc.events` with the real profile as actor, auth logs show the member's real IP on server-side verify calls (IP forwarding confirmed working), new-user signup path verified (user created, code verified, session issued; test user cleaned up afterwards). Capacitor in-app verification pending production deploy since the shell loads the live site.

**Open operational blocker (outside this PR):** the MailerSend account is on a trial plan and rejects new unique recipients ("trial account unique recipients limit"). Any genuinely new member will not receive the signup email (this also applied to the old magic-link flow). Upgrade MailerSend before member-facing launch.
