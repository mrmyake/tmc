# TRACKING.md — The Movement Club

Addendum op `CLAUDE.md`. Dekt alles wat nodig is om gedrag én gezondheid van de TMC website + member portal te meten, nu het portal live is.

**Scope:**
- Publieke site analytics (al gebouwd — hier alleen checklist)
- Member portal analytics (grotendeels nieuw)
- Acquisition attributie (doortrekken UTM naar Supabase)
- Admin KPI view (operationeel dashboard)
- Error tracking (Sentry)
- Email performance (MailerLite → GA4)
- Business rapportage (Metabase op Supabase)

**Repo locatie:** leg dit document naast `CLAUDE.md` in `~/projects/tmc/TRACKING.md`.

---

## Huidige staat (uit repo grep)

### Al geïmplementeerd (niet opnieuw bouwen)

**`src/lib/analytics.ts`** bevat:
- `trackEvent` (basis)
- `trackLead`, `trackCTA`, `trackContact`, `trackFormStart`, `trackOutbound` (marketing site)
- `trackViewItemList`, `trackSelectItem`, `trackBeginCheckout`, `trackPurchase`, `trackShare` (crowdfunding funnel — volledig)
- `trackScheduleDayView`, `trackSchedulePaginateForward`, `trackMyBookingsTabSwitch` (eerste member portal events)

**Consent Mode v2** live via `src/components/layout/Analytics.tsx` + `src/lib/consent.ts`.

**Form tracking** actief op: proefles, mobility check, mobility reset, beweeg beter, contact, lead magnet banner.

**Crowdfunding tracking** volledig: `TierGrid`, `TierCard`, `CheckoutModal`, `PurchaseTracker`, `ShareButtons`.

**CTA + outbound tracking** via `TrackedLink`.

### Gaps die dit document oplost

1. Geen `user_id` set in GA4 bij login → ingelogd gedrag niet koppelbaar aan dezelfde persoon over devices, geen cohort analyse
2. Member portal events beperkt tot 3 navigatie-events → core acties (boeken, annuleren, wachtlijst, abbo, pauze, opzeg, profiel, intake) worden niet gemeten
3. UTM data uit `sessionStorage` persisteert niet naar `profiles` → geen attributie van lead → active member
4. Geen admin KPI view → `/app/admin` dashboard moet bij elke pageload 20 tabellen bevragen
5. Geen error tracking → stille fouten in booking/payment flow zijn onzichtbaar
6. Geen email → GA4 koppeling → MailerLite sequence performance niet in context van rest van de funnel
7. Geen business rapportage laag → MRR, churn, LTV, cohort retention niet benaderbaar

---

## Stack context (aanvulling op CLAUDE.md)

- **Next.js 15** App Router, routes onder `/app/*` zijn authenticated member portal
- **Supabase** auth via magic link, RLS policies actief op alle tabellen
- **GA4** via `@next/third-parties/google`, Measurement ID `G-2VFCDM4KRZ`
- **Vercel Analytics** parallel voor Core Web Vitals
- Geen Sentry, geen Metabase, geen log drain (nog) actief

---

## Prioritering (ROI volgorde)

| # | Prioriteit | Inspanning | Impact |
|---|---|---|---|
| 1 | `user_id` set bij login | 10 min | Hoog — ontsluit cohort analyse |
| 2 | Portal events uitbreiden | 2-3 uur | Hoog — meet of product werkt |
| 3 | UTM kolommen op `profiles` + capture | 1 uur | Hoog — zonder dit is attributie kapot |
| 4 | Sentry setup | 30 min | Hoog — voorkom blinde opening |
| 5 | `vw_admin_kpis` materialized view + RPC | 1-2 uur | Medium — snel admin dashboard |
| 6 | MailerLite UTM discipline | 15 min | Laag — simpele config |
| 7 | Metabase op Supabase + query pack | 2 uur | Medium — schaalt als DB groeit |

---

## 1. `user_id` op GA4 bij login

### Doel

Koppel ingelogd gedrag in `/app/*` aan dezelfde gebruiker over meerdere devices en sessies. Vereist voor cohort-analyse (actieve leden vs churners), lifecycle-attributie, en cross-device funnels.

### Regels

- **Alleen `profiles.id`** (Supabase UUID). Nooit email, naam, of andere PII.
- Set bij succesvolle auth callback én bij page load als sessie al actief is.
- Clear bij logout.
- Respecteer consent mode — alleen setten als `analytics_storage = 'granted'`.

### Implementatie

Nieuwe helper in `src/lib/analytics.ts`:

```typescript
export const setUserId = (userId: string | null) => {
  if (typeof window === 'undefined' || !window.gtag) return;

  if (userId) {
    window.gtag('config', 'G-2VFCDM4KRZ', {
      user_id: userId,
      send_page_view: false, // voorkom dubbele pageview
    });
  } else {
    // Logout — clear user_id
    window.gtag('config', 'G-2VFCDM4KRZ', {
      user_id: null,
      send_page_view: false,
    });
  }
};
```

**Aanroepen in de auth flow.** In de bestaande auth-provider / session listener (check `src/app/auth/` of wherever `createClient()` + `onAuthStateChange` zit):

```typescript
import { setUserId } from '@/lib/analytics';

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    setUserId(session.user.id);
  }
  if (event === 'SIGNED_OUT') {
    setUserId(null);
  }
});
```

**Bij eerste page load** (server component die `getUser()` aanroept): geef user id door naar client via provider, die roept `setUserId` aan in `useEffect`.

### Privacy

GA4 `user_id` is een opaque ID. Supabase UUIDs zijn niet terug te herleiden naar personen zonder toegang tot de DB. Dit is AVG-conform zolang je het niet koppelt aan identificeerbare data in GA4 custom dimensions.

---

## 2. Member portal events

### Nieuwe helpers in `src/lib/analytics.ts`

Voeg onderstaande toe aan het bestaande bestand. Houd de huidige helpers intact.

```typescript
// ============================================================================
// Member portal events
// ============================================================================

export const trackPortalLogin = (method: 'magic_link' | 'oauth' = 'magic_link') => {
  trackEvent('portal_login', {
    event_category: 'portal',
    method,
  });
};

// Booking lifecycle
export const trackBookingStart = (params: {
  sessionId: string;
  classType: string;
  trainerId?: string;
  pillar: string;
}) => {
  trackEvent('booking_start', {
    event_category: 'booking',
    session_id: params.sessionId,
    class_type: params.classType,
    trainer_id: params.trainerId,
    pillar: params.pillar,
  });
};

export const trackBookingComplete = (params: {
  sessionId: string;
  classType: string;
  pillar: string;
  membershipType: string;
  creditCharged: boolean;
  hoursBeforeStart: number;
}) => {
  trackEvent('booking_complete', {
    event_category: 'booking',
    session_id: params.sessionId,
    class_type: params.classType,
    pillar: params.pillar,
    membership_type: params.membershipType,
    credit_charged: params.creditCharged ? 1 : 0,
    hours_before_start: Math.round(params.hoursBeforeStart),
  });
};

export const trackBookingCancel = (params: {
  sessionId: string;
  classType: string;
  hoursBeforeStart: number;
  withinWindow: boolean; // true = gratis annulering, false = credit verloren of strike
  reason?: string;
}) => {
  trackEvent('booking_cancel', {
    event_category: 'booking',
    session_id: params.sessionId,
    class_type: params.classType,
    hours_before_start: Math.round(params.hoursBeforeStart),
    within_window: params.withinWindow ? 1 : 0,
    reason: params.reason,
  });
};

// Waitlist
export const trackWaitlistJoin = (params: {
  sessionId: string;
  classType: string;
  position: number; // positie in de wachtrij
}) => {
  trackEvent('waitlist_join', {
    event_category: 'booking',
    session_id: params.sessionId,
    class_type: params.classType,
    waitlist_position: params.position,
  });
};

export const trackWaitlistConfirm = (params: {
  sessionId: string;
  minutesToConfirm: number;
}) => {
  trackEvent('waitlist_confirm', {
    event_category: 'booking',
    session_id: params.sessionId,
    minutes_to_confirm: Math.round(params.minutesToConfirm),
  });
};

export const trackWaitlistExpire = (sessionId: string) => {
  trackEvent('waitlist_expire', {
    event_category: 'booking',
    session_id: sessionId,
  });
};

// Rooster filters
export const trackRoosterFilter = (params: {
  pillar?: string;
  trainerId?: string;
  classType?: string;
}) => {
  trackEvent('rooster_filter', {
    event_category: 'portal',
    pillar: params.pillar,
    trainer_id: params.trainerId,
    class_type: params.classType,
  });
};

// Membership lifecycle
export const trackMembershipView = (currentPlan: string) => {
  trackEvent('membership_view', {
    event_category: 'membership',
    current_plan: currentPlan,
  });
};

export const trackMembershipPauseRequest = (params: {
  weeks: number;
  reason?: string;
}) => {
  trackEvent('membership_pause_request', {
    event_category: 'membership',
    weeks: params.weeks,
    reason: params.reason,
  });
};

export const trackMembershipCancelAttempt = (params: {
  withinLockIn: boolean; // true = binnen commit-periode
  currentPlan: string;
  reason?: string;
}) => {
  trackEvent('membership_cancel_attempt', {
    event_category: 'membership',
    within_lock_in: params.withinLockIn ? 1 : 0,
    current_plan: params.currentPlan,
    reason: params.reason,
  });
};

export const trackMembershipCancelComplete = (params: {
  currentPlan: string;
  effectiveDate: string; // ISO date
  daysUntilEffective: number;
}) => {
  trackEvent('membership_cancel_complete', {
    event_category: 'membership',
    current_plan: params.currentPlan,
    effective_date: params.effectiveDate,
    days_until_effective: params.daysUntilEffective,
  });
};

export const trackMembershipUpgrade = (params: {
  fromPlan: string;
  toPlan: string;
  valueDiff: number; // prijs verschil in EUR
}) => {
  trackEvent('membership_upgrade', {
    event_category: 'membership',
    from_plan: params.fromPlan,
    to_plan: params.toPlan,
    value: params.valueDiff,
    currency: 'EUR',
  });
};

// Profile & onboarding
export const trackProfileUpdate = (fieldsChanged: string[]) => {
  trackEvent('profile_update', {
    event_category: 'portal',
    fields_changed: fieldsChanged.join(','),
    fields_count: fieldsChanged.length,
  });
};

export const trackHealthIntakeComplete = () => {
  trackEvent('health_intake_complete', {
    event_category: 'onboarding',
  });
};

export const trackHealthIntakeStart = () => {
  trackEvent('health_intake_start', {
    event_category: 'onboarding',
  });
};

// Payments (member side, Mollie redirect flow)
export const trackPaymentStart = (params: {
  amount: number;
  context: 'first_membership' | 'drop_in' | 'pt_package' | 'strippenkaart';
  planId?: string;
}) => {
  trackEvent('payment_start', {
    event_category: 'payment',
    value: params.amount,
    currency: 'EUR',
    context: params.context,
    plan_id: params.planId,
  });
};

export const trackPaymentSuccess = (params: {
  amount: number;
  context: string;
  transactionId: string;
}) => {
  trackEvent('payment_success', {
    event_category: 'payment',
    value: params.amount,
    currency: 'EUR',
    context: params.context,
    transaction_id: params.transactionId,
  });
};

export const trackPaymentFailed = (params: {
  amount: number;
  context: string;
  reason: string;
}) => {
  trackEvent('payment_failed', {
    event_category: 'payment',
    value: params.amount,
    currency: 'EUR',
    context: params.context,
    reason: params.reason,
  });
};
```

### Waar elk event aangeroepen moet worden

| Event | Component / file | Trigger |
|---|---|---|
| `portal_login` | Auth callback handler (`src/app/auth/callback/route.ts` of `src/components/providers/AuthProvider.tsx`) | Na succesvolle sessie creatie |
| `booking_start` | `BookingModal` / session click handler | Klik op sessie card in rooster |
| `booking_complete` | `BookingModal` na server action success | Boeking server action returns OK |
| `booking_cancel` | Cancel knop in `/app/boekingen` of sessie detail | Server action success |
| `waitlist_join` | Wachtlijst-inschrijf-CTA bij volle sessie | Server action success |
| `waitlist_confirm` | Wachtlijst bevestigingspagina (komt vanuit email link) | Bevestiging klik |
| `waitlist_expire` | Cron `/api/cron/waitlist-promote` — maar dit draait server-side zonder GA. Fire client-side als gebruiker de expired-state ziet | Email link geopend na deadline |
| `rooster_filter` | Filter chips component in `/app/rooster` | Chip click (alleen bij wijziging, debounced) |
| `membership_view` | `/app/abonnement` page | Op mount (useEffect) |
| `membership_pause_request` | Pauze-formulier submit | Server action success |
| `membership_cancel_attempt` | Opzeg-knop in `/app/abonnement` | Eerste klik, vóór confirm modal |
| `membership_cancel_complete` | Opzeg-confirm modal submit | Server action success |
| `membership_upgrade` | Upgrade flow in `/app/abonnement` | Server action success |
| `profile_update` | `/app/profiel` save button | Form submit success, geef changed field names mee |
| `health_intake_start` | Intake wizard page mount | On mount, eerste stap |
| `health_intake_complete` | Intake wizard final submit | Server action success |
| `payment_start` | Voordat Mollie redirect | Vlak vóór `window.location = paymentUrl` |
| `payment_success` | Mollie return page `/app/abonnement?payment=success` | Op mount als `payment=success` in URL |
| `payment_failed` | Mollie return page met failure | Op mount als `payment=failed` in URL |

### Component voorbeeld: `booking_complete`

In `src/app/app/rooster/_components/BookingModal.tsx` (of waar de boeking server action wordt aangeroepen):

```typescript
'use client';
import { trackBookingComplete, trackBookingStart } from '@/lib/analytics';
import { bookSession } from './actions';

// Op modal open
const openBookingModal = (session: ClassSession) => {
  trackBookingStart({
    sessionId: session.id,
    classType: session.class_type_name,
    trainerId: session.trainer_id,
    pillar: session.pillar,
  });
  setSelectedSession(session);
};

// Op confirm
const handleConfirm = async () => {
  const result = await bookSession(selectedSession.id);

  if (result.success) {
    const hoursBeforeStart =
      (new Date(selectedSession.start_at).getTime() - Date.now()) / 3_600_000;

    trackBookingComplete({
      sessionId: selectedSession.id,
      classType: selectedSession.class_type_name,
      pillar: selectedSession.pillar,
      membershipType: result.membership_type,
      creditCharged: result.credit_charged,
      hoursBeforeStart,
    });

    toast.success('Geboekt');
    closeModal();
  }
};
```

### GA4 conversion markers

Markeer in GA4 Admin → Events → als conversion:
- `booking_complete` (core activatie)
- `membership_cancel_complete` (retentie signaal, negatief)
- `health_intake_complete` (onboarding succes)
- `payment_success` (revenue event)

---

## 3. Acquisition attributie op `profiles`

### Doel

Koppel "15 leads uit Instagram crowdfunding campagne" aan "3 werden actieve leden" — nu eindigt de attributie bij de lead magnet signup en is de lijn naar lid niet trekbaar.

### Supabase migration

Nieuwe migration `supabase/migrations/YYYYMMDDHHMMSS_profiles_acquisition.sql`:

```sql
-- Acquisition attribution on profiles
alter table public.profiles
  add column if not exists acquisition_source text,
  add column if not exists acquisition_medium text,
  add column if not exists acquisition_campaign text,
  add column if not exists acquisition_content text,
  add column if not exists signup_path text,
  add column if not exists first_touch_at timestamptz;

-- Indexen voor rapportage queries
create index if not exists profiles_acquisition_source_idx
  on public.profiles(acquisition_source);
create index if not exists profiles_acquisition_campaign_idx
  on public.profiles(acquisition_campaign);
create index if not exists profiles_signup_path_idx
  on public.profiles(signup_path);

comment on column public.profiles.acquisition_source is
  'utm_source bij eerste pageview (instagram, google, mailerlite, direct, etc.)';
comment on column public.profiles.acquisition_medium is
  'utm_medium (social, cpc, email, referral, organic)';
comment on column public.profiles.acquisition_campaign is
  'utm_campaign (crowdfunding_launch, mobility_reset, etc.)';
comment on column public.profiles.signup_path is
  'Route waar de gebruiker zich inschreef (/proefles, /mobility-check, /crowdfunding, /signup)';
comment on column public.profiles.first_touch_at is
  'Timestamp van eerste pageview, opgeslagen in sessionStorage en doorgegeven bij signup';
```

### UTM capture in browser

Nieuwe helper `src/lib/attribution.ts`:

```typescript
const STORAGE_KEY = 'tmc_attribution';

export type Attribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  firstTouchAt: string; // ISO timestamp
  landingPath: string;
};

/**
 * Bij elke eerste pageview in een sessie: parse UTM's uit URL,
 * merge met bestaande attribution (first-touch wins), sla op in sessionStorage.
 */
export const captureAttribution = () => {
  if (typeof window === 'undefined') return;

  const existing = getAttribution();
  if (existing) return; // first-touch wins — niet overschrijven

  const params = new URLSearchParams(window.location.search);
  const attribution: Attribution = {
    source: params.get('utm_source') || guessSource(document.referrer),
    medium: params.get('utm_medium') || undefined,
    campaign: params.get('utm_campaign') || undefined,
    content: params.get('utm_content') || undefined,
    firstTouchAt: new Date().toISOString(),
    landingPath: window.location.pathname,
  };

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
};

export const getAttribution = (): Attribution | null => {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const clearAttribution = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
};

// Simpele referrer-mapping als er geen UTM aanwezig is
const guessSource = (referrer: string): string | undefined => {
  if (!referrer) return 'direct';
  const host = new URL(referrer).hostname.replace('www.', '');
  if (host === 'themovementclub.nl' || host.endsWith('.themovementclub.nl'))
    return undefined; // interne navigatie
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('facebook')) return 'facebook';
  if (host.includes('google')) return 'google';
  if (host.includes('mailerlite')) return 'mailerlite';
  return host;
};
```

Roep `captureAttribution()` aan in de root layout client wrapper (bijvoorbeeld in `src/components/layout/Analytics.tsx`):

```typescript
useEffect(() => {
  captureAttribution();
}, []);
```

### Doorgeven bij signup

Elke route waar `profiles` wordt aangemaakt (magic link callback of eerste pageview na signup) moet de attribution meenemen. Concreet in de auth callback server action:

```typescript
import { getAttribution, clearAttribution } from '@/lib/attribution';

// Client-side: vlak voor signup/auth aanroep, stuur attribution mee
const attribution = getAttribution();

const { error } = await signInWithOtp({
  email,
  options: {
    data: {
      acquisition_source: attribution?.source,
      acquisition_medium: attribution?.medium,
      acquisition_campaign: attribution?.campaign,
      acquisition_content: attribution?.content,
      signup_path: window.location.pathname,
      first_touch_at: attribution?.firstTouchAt,
    },
  },
});
```

### Trigger update

De auth trigger die `profiles` aanmaakt moet deze metadata kopiëren. Update in migration:

```sql
-- Update bestaande trigger handle_new_user om attribution velden te kopiëren
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    role,
    acquisition_source,
    acquisition_medium,
    acquisition_campaign,
    acquisition_content,
    signup_path,
    first_touch_at
  )
  values (
    new.id,
    new.email,
    'member',
    new.raw_user_meta_data->>'acquisition_source',
    new.raw_user_meta_data->>'acquisition_medium',
    new.raw_user_meta_data->>'acquisition_campaign',
    new.raw_user_meta_data->>'acquisition_content',
    new.raw_user_meta_data->>'signup_path',
    (new.raw_user_meta_data->>'first_touch_at')::timestamptz
  );
  return new;
end;
$$;
```

### Lead magnet forms ook taggen

Voor `/beweeg-beter`, `/mobility-reset`, `/mobility-check`, `/proefles`, `/contact`: geef de attribution mee naar MailerLite als custom fields op de subscriber. Dan zie je in MailerLite welke campagne een lead opleverde, en wanneer die persoon uiteindelijk lid wordt matcht email-attribution met `profiles`-attribution.

In de `/api/leads/route.ts` (of hoe die heet):

```typescript
const attribution = body.attribution; // uit client payload

await mailerliteClient.subscribers.create({
  email: body.email,
  fields: {
    name: body.firstName,
    acquisition_source: attribution?.source,
    acquisition_campaign: attribution?.campaign,
    signup_path: attribution?.landingPath,
  },
  groups: [resolveGroupForForm(body.formType)],
});
```

---

## 4. Admin KPI view (`vw_admin_kpis`)

### Doel

Marlon's `/app/admin` dashboard laadt snel en consistent zonder 20 sub-queries. Materialized view, elke 5 min verversen via cron.

### Migration

`supabase/migrations/YYYYMMDDHHMMSS_admin_kpis.sql`:

```sql
-- ============================================================================
-- Materialized view: vw_admin_kpis
-- Ververst elke 5 minuten via Vercel Cron (/api/cron/refresh-kpis)
-- ============================================================================

create materialized view if not exists public.vw_admin_kpis as
with
  active_members as (
    select count(*) filter (
      where status = 'active'
    ) as count
    from public.memberships
  ),
  mrr as (
    -- MRR = som van maandelijkse equivalent van alle actieve abbo's
    -- price_per_cycle is per 28 dagen, dus * (365/12/28) voor maand-equivalent
    select coalesce(
      sum(mp.price_per_cycle_cents * (365.0 / 12.0 / 28.0)),
      0
    )::bigint as cents
    from public.memberships m
    join public.membership_plan_catalogue mp on mp.id = m.plan_id
    where m.status = 'active'
  ),
  new_signups_week as (
    select count(*) as count
    from public.memberships
    where created_at >= now() - interval '7 days'
  ),
  new_signups_month as (
    select count(*) as count
    from public.memberships
    where created_at >= now() - interval '30 days'
  ),
  churn_30d as (
    select count(*) as count
    from public.memberships
    where status = 'cancelled'
      and cancellation_effective_date >= now() - interval '30 days'
      and cancellation_effective_date < now()
  ),
  active_pauses as (
    select count(*) as count
    from public.membership_pauses
    where status = 'active'
      and paused_until > now()
  ),
  open_pause_requests as (
    select count(*) as count
    from public.membership_pauses
    where status = 'requested'
  ),
  failed_payments_7d as (
    select count(*) as count,
      coalesce(sum(amount_cents), 0) as amount_cents
    from public.payments
    where status = 'failed'
      and created_at >= now() - interval '7 days'
  ),
  bookings_today as (
    select count(*) as count
    from public.bookings b
    join public.class_sessions s on s.id = b.class_session_id
    where b.status = 'booked'
      and s.start_at::date = current_date
  ),
  sessions_today as (
    select count(*) as count
    from public.class_sessions
    where start_at::date = current_date
      and status = 'scheduled'
  ),
  fill_rate_week as (
    -- Gem. bezetting (%) voor sessies van afgelopen 7 dagen
    select coalesce(
      avg(
        case
          when s.capacity > 0
          then (
            select count(*) from public.bookings b
            where b.class_session_id = s.id and b.status != 'cancelled'
          )::numeric / s.capacity
          else 0
        end
      ),
      0
    ) as ratio
    from public.class_sessions s
    where s.start_at >= now() - interval '7 days'
      and s.start_at < now()
      and s.status = 'completed'
  ),
  no_show_rate_30d as (
    select coalesce(
      count(*) filter (where status = 'no_show')::numeric
        / nullif(count(*) filter (where status in ('attended','no_show')), 0),
      0
    ) as ratio
    from public.bookings
    where created_at >= now() - interval '30 days'
  ),
  crowdfunding_conversion as (
    -- Hoeveel backers werden actieve leden
    select
      count(distinct b.email) as total_backers,
      count(distinct case when m.id is not null then b.email end) as converted_members
    from public.crowdfunding_backers b
    left join public.profiles p on lower(p.email) = lower(b.email)
    left join public.memberships m on m.profile_id = p.id and m.status = 'active'
  )
select
  (select count from active_members) as active_members,
  (select cents from mrr) as mrr_cents,
  (select count from new_signups_week) as new_signups_week,
  (select count from new_signups_month) as new_signups_month,
  (select count from churn_30d) as churn_30d,
  (select count from active_pauses) as active_pauses,
  (select count from open_pause_requests) as open_pause_requests,
  (select count from failed_payments_7d) as failed_payments_7d,
  (select amount_cents from failed_payments_7d) as failed_payments_amount_cents,
  (select count from bookings_today) as bookings_today,
  (select count from sessions_today) as sessions_today,
  (select round(ratio * 100, 1) from fill_rate_week) as fill_rate_week_pct,
  (select round(ratio * 100, 1) from no_show_rate_30d) as no_show_rate_30d_pct,
  (select total_backers from crowdfunding_conversion) as crowdfunding_total_backers,
  (select converted_members from crowdfunding_conversion) as crowdfunding_converted_members,
  now() as refreshed_at;

create unique index if not exists vw_admin_kpis_singleton_idx
  on public.vw_admin_kpis ((refreshed_at is not null));

-- RLS: alleen admins lezen
alter materialized view public.vw_admin_kpis owner to postgres;

-- RPC voor veilige access vanuit app (controleert admin role)
create or replace function public.get_admin_kpis()
returns public.vw_admin_kpis
language plpgsql
security definer set search_path = public
as $$
declare
  result public.vw_admin_kpis;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Unauthorized';
  end if;

  select * into result from public.vw_admin_kpis limit 1;
  return result;
end;
$$;

grant execute on function public.get_admin_kpis to authenticated;
```

### Refresh cron

Nieuwe route `src/app/api/cron/refresh-kpis/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Verifieer Vercel Cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.rpc('refresh_admin_kpis');
  if (error) {
    console.error('KPI refresh failed', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, refreshed_at: new Date().toISOString() });
}
```

En de RPC voor de refresh zelf (in dezelfde migration):

```sql
create or replace function public.refresh_admin_kpis()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view public.vw_admin_kpis;
end;
$$;
```

Vercel cron config in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/refresh-kpis", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/send-reminders", "schedule": "0 9 * * *" },
    { "path": "/api/cron/waitlist-promote", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/expire-strikes", "schedule": "0 3 * * *" }
  ]
}
```

### Gebruik in `/app/admin`

Server component:

```typescript
import { createClient } from '@/lib/supabase/server';

export default async function AdminDashboard() {
  const supabase = createClient();
  const { data: kpis } = await supabase.rpc('get_admin_kpis');

  return (
    <AdminShell>
      <KpiGrid>
        <KpiCard
          label="Actieve leden"
          value={kpis.active_members}
        />
        <KpiCard
          label="MRR"
          value={`€${(kpis.mrr_cents / 100).toLocaleString('nl-NL')}`}
        />
        <KpiCard
          label="Bezetting (afgelopen week)"
          value={`${kpis.fill_rate_week_pct}%`}
        />
        <KpiCard
          label="No-show rate (30d)"
          value={`${kpis.no_show_rate_30d_pct}%`}
        />
      </KpiGrid>
    </AdminShell>
  );
}
```

---

## 5. Sentry error tracking

### Doel

Stille fouten in transactionele flows (booking race conditions, RLS violations, Mollie webhook failures, cron jobs) worden zichtbaar. Zonder dit opent Marlon de gym blind.

### Setup

```bash
npx @sentry/wizard@latest -i nextjs
```

De wizard maakt automatisch aan:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- Aanpassing van `next.config.ts`
- `.env.sentry-build-plugin` (voor source map uploads)

### Env vars

Toevoegen aan `.env.local`:

```env
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ORG=the-movement-club
SENTRY_PROJECT=tmc-web
SENTRY_AUTH_TOKEN=xxx  # alleen voor source maps upload build-time
```

### Configuratie — privacy

In `sentry.client.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% — voldoende voor klein volume
  replaysSessionSampleRate: 0, // geen session replay (privacy)
  replaysOnErrorSampleRate: 1.0, // alleen bij error
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  beforeSend(event) {
    // Strip email / PII uit error context
    if (event.user?.email) delete event.user.email;
    if (event.request?.cookies) delete event.request.cookies;
    return event;
  },
  environment: process.env.NODE_ENV,
});
```

### Context toevoegen

Set user context bij login (zonder email):

```typescript
import * as Sentry from '@sentry/nextjs';

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    Sentry.setUser({ id: session.user.id }); // geen email!
  }
  if (event === 'SIGNED_OUT') {
    Sentry.setUser(null);
  }
});
```

### Kritieke paden taggen

Wrap booking server action + Mollie webhook met context:

```typescript
// In booking server action
import * as Sentry from '@sentry/nextjs';

export async function bookSession(sessionId: string) {
  return Sentry.withScope(async (scope) => {
    scope.setTag('feature', 'booking');
    scope.setContext('booking', { session_id: sessionId });

    try {
      // booking logica
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    }
  });
}
```

### Alert rules (Sentry dashboard)

Stel in via Sentry UI → Alerts → Create Alert Rule:

1. **Mollie webhook failures** — tag `feature:mollie-webhook`, >1 error in 5 min → email naar jou
2. **Booking failures** — tag `feature:booking`, >3 errors in 15 min → email
3. **Cron failures** — tag `feature:cron`, any error → email
4. **RLS violations** — message contains "row-level security" → email (directe bug)

---

## 6. MailerLite UTM discipline

### Doel

Elke klik vanuit een MailerLite email die terug naar de site komt is herkenbaar als email-traffic in GA4, en specifiek welke campagne.

### Convention

Elke CTA in een MailerLite template moet UTM's hebben:

```
utm_source=mailerlite
utm_medium=email
utm_campaign=<sequence_name>
utm_content=<specific_email_or_cta>
```

Voorbeelden:

| Campagne | CTA URL |
|---|---|
| Mobility Reset dag 7 naar check | `https://themovementclub.nl/mobility-check?utm_source=mailerlite&utm_medium=email&utm_campaign=mobility_reset&utm_content=day7_cta` |
| Welkom PDF bevestigingsmail | `https://themovementclub.nl/mobility-reset?utm_source=mailerlite&utm_medium=email&utm_campaign=welcome&utm_content=pdf_download_upsell` |
| Nieuwsbrief maandelijks | `https://themovementclub.nl/aanbod?utm_source=mailerlite&utm_medium=email&utm_campaign=newsletter&utm_content=yyyy_mm_aanbod` |
| Crowdfunding launch email | `https://themovementclub.nl/crowdfunding?utm_source=mailerlite&utm_medium=email&utm_campaign=crowdfunding_launch&utm_content=initial_announcement` |

### Implementatie check

Na setup: maak een checklist in MailerLite per automation sequence en controleer elke template één keer. Blokkerend voor campagne launches.

### MailerLite → GA4 custom dimension (optioneel)

Als je geavanceerder wilt: MailerLite heeft webhooks voor open/click events. Die kun je naar een Next.js webhook sturen die het event doorpusht naar GA4 Measurement Protocol. Niet kritiek voor nu — UTM-based attributie via kliks is voldoende voor eerste 6 maanden.

---

## 7. Metabase op Supabase

### Doel

Business rapportage (MRR trend, churn, cohort retention, LTV, crowdfunding funnel) zonder eigen UI te bouwen. Marlon en jij klikken dashboards in elkaar met SQL eronder.

### Setup

**Hosting opties:**

| Optie | Kosten | Complexiteit |
|---|---|---|
| Metabase Cloud | $85/mnd | 5 min setup |
| Self-hosted Fly.io | ~$5/mnd | 30 min setup |
| Self-hosted Railway | ~$10/mnd | 15 min setup |
| Self-hosted Docker op eigen VPS | hardware kosten | 1 uur setup |

**Aanbeveling voor nu:** self-hosted Fly.io. Goedkoop, betrouwbaar, 1 persoon admin.

```bash
# Fly.io Metabase deployment
curl -L https://fly.io/install.sh | sh
fly launch --image metabase/metabase:latest
fly secrets set MB_DB_TYPE=postgres \
  MB_DB_HOST=... \
  MB_DB_DBNAME=metabase \
  MB_DB_USER=... \
  MB_DB_PASS=...
fly deploy
```

Later upgraden naar Cloud als Marlon het zelf wil kunnen beheren.

### Supabase connection

In Metabase → Admin → Databases → Add Database:
- Type: PostgreSQL
- Host: `db.cdkgjiotqlxnoxhfcjic.supabase.co`
- Port: `5432`
- Database: `postgres`
- Username: `metabase_read` (dedicated read-only user — zie hieronder)
- Password: (uit Supabase)
- SSL: required

### Read-only database user

Maak in Supabase een dedicated read-only user voor Metabase (zodat een compromise van Metabase credentials de DB niet in gevaar brengt):

```sql
-- Run als superuser in Supabase SQL Editor
create user metabase_read with password 'xxx_strong_password_xxx';
grant connect on database postgres to metabase_read;
grant usage on schema public to metabase_read;
grant select on all tables in schema public to metabase_read;
alter default privileges in schema public
  grant select on tables to metabase_read;

-- Bypass RLS zodat Metabase alle rijen ziet (read-only, dus veilig)
alter user metabase_read bypassrls;
```

### Query pack — start dashboards

Maak deze queries één keer aan in Metabase, gebruik ze als building blocks voor dashboards.

**MRR trend (laatste 12 maanden):**

```sql
with months as (
  select generate_series(
    date_trunc('month', now() - interval '11 months'),
    date_trunc('month', now()),
    '1 month'::interval
  )::date as month
)
select
  m.month,
  coalesce(
    sum(mp.price_per_cycle_cents * (365.0 / 12.0 / 28.0)) filter (
      where ms.start_date <= m.month + interval '1 month'
        and (ms.cancellation_effective_date is null or ms.cancellation_effective_date > m.month)
    ),
    0
  )::bigint / 100 as mrr_eur
from months m
left join memberships ms on true
left join membership_plan_catalogue mp on mp.id = ms.plan_id
group by m.month
order by m.month;
```

**Membership mix (pie):**

```sql
select
  mp.name as plan,
  count(*) as active_count
from memberships m
join membership_plan_catalogue mp on mp.id = m.plan_id
where m.status = 'active'
group by mp.name
order by active_count desc;
```

**Cohort retention (maandcohorten):**

```sql
with cohorts as (
  select
    id,
    date_trunc('month', created_at) as cohort_month,
    cancellation_effective_date,
    status
  from memberships
),
cohort_sizes as (
  select cohort_month, count(*) as size
  from cohorts
  group by cohort_month
)
select
  c.cohort_month,
  cs.size as cohort_size,
  count(*) filter (
    where c.status = 'active'
      or c.cancellation_effective_date > c.cohort_month + interval '1 month'
  ) as retained_month_1,
  count(*) filter (
    where c.status = 'active'
      or c.cancellation_effective_date > c.cohort_month + interval '3 months'
  ) as retained_month_3,
  count(*) filter (
    where c.status = 'active'
      or c.cancellation_effective_date > c.cohort_month + interval '6 months'
  ) as retained_month_6
from cohorts c
join cohort_sizes cs on cs.cohort_month = c.cohort_month
where c.cohort_month < date_trunc('month', now())
group by c.cohort_month, cs.size
order by c.cohort_month desc;
```

**Fill rate per lestype + weekdag:**

```sql
select
  ct.name as class_type,
  to_char(s.start_at, 'Day') as weekday,
  extract(hour from s.start_at) as hour,
  count(distinct s.id) as sessions,
  avg(
    (select count(*) from bookings b
     where b.class_session_id = s.id and b.status != 'cancelled')::numeric
    / nullif(s.capacity, 0)
  ) * 100 as avg_fill_pct
from class_sessions s
join class_types ct on ct.id = s.class_type_id
where s.start_at >= now() - interval '4 weeks'
  and s.status = 'completed'
group by ct.name, to_char(s.start_at, 'Day'), extract(hour from s.start_at)
order by avg_fill_pct desc;
```

**No-show rate per lid (top 20):**

```sql
select
  p.first_name || ' ' || p.last_name as member,
  count(*) filter (where b.status = 'no_show') as no_shows,
  count(*) filter (where b.status in ('attended','no_show')) as total_attended_bookings,
  round(
    count(*) filter (where b.status = 'no_show')::numeric
      / nullif(count(*) filter (where b.status in ('attended','no_show')), 0)
      * 100,
    1
  ) as no_show_pct
from bookings b
join profiles p on p.id = b.profile_id
where b.created_at >= now() - interval '90 days'
group by p.id, p.first_name, p.last_name
having count(*) filter (where b.status in ('attended','no_show')) >= 5
order by no_show_pct desc
limit 20;
```

**Crowdfunding → active member conversion:**

```sql
select
  count(distinct b.email) as total_backers,
  count(distinct case when m.id is not null then b.email end) as converted_to_active,
  round(
    count(distinct case when m.id is not null then b.email end)::numeric
      / nullif(count(distinct b.email), 0)
      * 100,
    1
  ) as conversion_pct,
  count(distinct b.email) filter (where b.tier_id = 'founding_premium') as founding_premium_backers,
  count(distinct case
    when b.tier_id = 'founding_premium' and m.id is not null then b.email
  end) as founding_premium_active
from crowdfunding_backers b
left join profiles p on lower(p.email) = lower(b.email)
left join memberships m on m.profile_id = p.id and m.status = 'active';
```

**Acquisition funnel (lead → lid):**

```sql
select
  coalesce(acquisition_source, 'unknown') as source,
  coalesce(acquisition_campaign, 'none') as campaign,
  count(*) as total_signups,
  count(*) filter (
    where id in (select profile_id from memberships where status = 'active')
  ) as active_members,
  round(
    count(*) filter (
      where id in (select profile_id from memberships where status = 'active')
    )::numeric / count(*) * 100,
    1
  ) as conversion_pct
from profiles
where created_at >= now() - interval '90 days'
group by acquisition_source, acquisition_campaign
order by total_signups desc;
```

**Top trainers (bookings laatste 4 weken):**

```sql
select
  t.name,
  count(*) as total_bookings,
  count(*) filter (where b.status = 'attended') as attended,
  round(avg(s.capacity) filter (where s.start_at < now()), 1) as avg_capacity,
  round(
    count(*) filter (where b.status in ('attended', 'no_show'))::numeric
      / nullif(sum(s.capacity) filter (where s.start_at < now()), 0)
      * 100,
    1
  ) as fill_pct
from bookings b
join class_sessions s on s.id = b.class_session_id
join trainers t on t.id = s.trainer_id
where s.start_at >= now() - interval '4 weeks'
group by t.id, t.name
order by total_bookings desc;
```

**Failed payments (laatste 30 dagen):**

```sql
select
  p.email,
  pay.amount_cents / 100 as amount_eur,
  pay.failure_reason,
  pay.created_at,
  case when m.id is not null then 'nog actief' else 'geannuleerd' end as membership_status
from payments pay
join profiles p on p.id = pay.profile_id
left join memberships m on m.profile_id = pay.profile_id and m.status = 'active'
where pay.status = 'failed'
  and pay.created_at >= now() - interval '30 days'
order by pay.created_at desc;
```

---

## Dashboards overview

Drie dashboards, drie publieken:

### 1. Marlon daily (`/app/admin` — in-app)

Bron: `vw_admin_kpis` via `get_admin_kpis()` RPC.

- 4 KPI cards: actieve leden, MRR, bezetting deze week, no-show rate
- Activity feed: recente inschrijvingen, cancellations, gefaalde betalingen
- Quick access tiles: open pauze-verzoeken (N), failed payments (N), vandaag's sessies (N)
- Klikbaar naar detail schermen

### 2. Marketing (GA4 native + Looker Studio)

Geen eigen UI — GA4 rapporten.

- Acquisition: traffic per source/medium, conversion rates per lead magnet
- Engagement: pages per session, avg session duration, scroll depth
- Conversion funnels: lead → member (via UTM match in Supabase)
- Crowdfunding funnel (tot `purchase`)
- Email performance: MailerLite UTM campaigns

### 3. Business health (Metabase)

Voor jou + Marlon maandelijks.

- MRR trend laatste 12 mnd
- Membership mix (pie)
- Cohort retention (1/3/6 maand)
- Fill rate heatmap (lestype × weekdag × uur)
- Acquisition funnel → actieve conversie per source
- Top trainers (bookings, fill rate)
- Crowdfunding conversie
- Failed payments follow-up lijst
- No-show top 20 (operationeel)

---

## Implementation checklist

### Prio 1 — Deze week

- [ ] **`setUserId` helper** toevoegen aan `src/lib/analytics.ts`
- [ ] **Auth listener** updaten om `setUserId` te callen bij login/logout
- [ ] **UTM migration** — nieuwe migration voor `profiles` acquisition kolommen + trigger update
- [ ] **`captureAttribution`** helper in `src/lib/attribution.ts`
- [ ] **`Analytics.tsx`** aanpassen om `captureAttribution()` te callen bij mount
- [ ] **Lead magnet signup routes** uitbreiden om attribution door te geven naar MailerLite
- [ ] **Magic link signup** uitbreiden om attribution in `raw_user_meta_data` te zetten

### Prio 2 — Member portal events

- [ ] Alle nieuwe helpers uit sectie 2 toevoegen aan `src/lib/analytics.ts`
- [ ] `trackPortalLogin` in auth callback
- [ ] `trackBookingStart` + `trackBookingComplete` in booking modal
- [ ] `trackBookingCancel` in cancel action
- [ ] `trackWaitlistJoin` + `trackWaitlistConfirm` + `trackWaitlistExpire` in waitlist flow
- [ ] `trackRoosterFilter` op filter chips
- [ ] `trackMembershipView` op `/app/abonnement` mount
- [ ] `trackMembershipPauseRequest` op pauze submit
- [ ] `trackMembershipCancelAttempt` op opzeg knop (vóór confirm)
- [ ] `trackMembershipCancelComplete` op opzeg confirm submit
- [ ] `trackMembershipUpgrade` op upgrade submit
- [ ] `trackProfileUpdate` op profiel save (met changed fields)
- [ ] `trackHealthIntakeStart` + `trackHealthIntakeComplete`
- [ ] `trackPaymentStart` voor Mollie redirect
- [ ] `trackPaymentSuccess` + `trackPaymentFailed` op return URL
- [ ] GA4 Admin: markeer `booking_complete`, `membership_cancel_complete`, `health_intake_complete`, `payment_success` als conversies

### Prio 3 — Admin KPI view

- [ ] Migration `vw_admin_kpis` + `get_admin_kpis()` RPC + `refresh_admin_kpis()`
- [ ] Cron route `/api/cron/refresh-kpis`
- [ ] `vercel.json` crons uitbreiden
- [ ] `CRON_SECRET` env var toevoegen (Vercel)
- [ ] `/app/admin` dashboard server component gebruik RPC
- [ ] 4 KPI cards bouwen volgens C1 spec

### Prio 4 — Sentry

- [ ] `npx @sentry/wizard@latest -i nextjs` draaien
- [ ] Env vars instellen (DSN + org/project + auth token)
- [ ] `beforeSend` hook configureren (PII stripping)
- [ ] `Sentry.setUser({ id })` in auth listener
- [ ] Kritieke server actions wrappen (booking, Mollie webhook, cron)
- [ ] Alert rules in Sentry dashboard instellen

### Prio 5 — MailerLite UTM discipline

- [ ] Audit alle bestaande MailerLite templates — elke CTA heeft UTM's
- [ ] Convention documenteren in eigen runbook voor nieuwe campagnes
- [ ] UTM's toevoegen aan: welkomsmails, Mobility Reset sequence, crowdfunding updates, nieuwsbrief templates

### Prio 6 — Metabase

- [ ] Read-only DB user `metabase_read` aanmaken
- [ ] Metabase hosten (Fly.io of Railway)
- [ ] Database connectie
- [ ] 3 startende dashboards: MRR/members, Bookings/fill rate, Acquisition funnel
- [ ] Query pack uit sectie 7 erin plakken als basisquestions
- [ ] Marlon onboarden (10 min demo)

---

## Env vars — volledige lijst na implementatie

```env
# Al aanwezig
MAILERLITE_API_KEY=xxx
NEXT_PUBLIC_SANITY_PROJECT_ID=hn9lkvte
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=xxx
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
NEXT_PUBLIC_SITE_URL=https://www.themovementclub.nl
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-2VFCDM4KRZ
MOLLIE_API_KEY=xxx
RESEND_API_KEY=xxx

# Nieuw
CRON_SECRET=xxx                          # Vercel Cron authentication
NEXT_PUBLIC_SENTRY_DSN=xxx              # Sentry client
SENTRY_ORG=the-movement-club
SENTRY_PROJECT=tmc-web
SENTRY_AUTH_TOKEN=xxx                   # build-time source maps
```

---

## Gerelateerde documenten

- `CLAUDE.md` — primary project context (brand, tech, design, pages, lead funnel, high-level analytics)
- `tmc-crowdfunding-module.md` — crowdfunding module spec
- `the-movement-club-sanity-cms.md` — Sanity CMS migratie + onboarding

---

*Update dit document na elke nieuwe tracking-toevoeging. Gebruik naast CLAUDE.md als context in CC sessies die tracking, rapportage, of admin dashboard werk betreffen.*
