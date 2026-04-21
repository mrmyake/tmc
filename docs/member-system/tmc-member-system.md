# The Movement Club — Member & Booking System

## Doel

Bouw het ledensysteem en boekingssysteem voor The Movement Club, als module binnen de bestaande Next.js-applicatie op `themovementclub.nl`. Leden loggen in op `/app`, beheren hun abonnement, en boeken groepslessen, yoga, mobility, kettlebell, kids- en senior-lessen binnen de rechten van hun abbo. Marlon en haar team beheren het rooster, leden en capaciteit via een admin-cockpit op `/app/admin`.

Dit document is ontworpen om als context mee te geven aan Claude Code. Elke sectie bevat genoeg detail om direct implementeerbaar te zijn.

---

## Context

### Hergebruik van bestaande stack

- **Framework**: Next.js 14+ (App Router) — al draaiend
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Animaties**: Framer Motion
- **Hosting**: Vercel
- **CMS**: Sanity (project `hn9lkvte`, dataset `production`) — uitbreiden met nieuwe schema's
- **Database**: Supabase (zelfde project als crowdfunding) — nieuwe tabellen toevoegen
- **Auth**: Supabase Auth met magic links (passwordless)
- **Betalingen**: Mollie (al in gebruik voor crowdfunding) — nu met recurring payments
- **Email**: MailerSend + React Email (transactional). Supabase Auth emails (magic links) draaien via Supabase Auth SMTP, geconfigureerd op MailerSend SMTP-credentials zodat alle outbound op hetzelfde domein + DKIM/SPF zit.
- **Cron**: Vercel Cron Jobs
- **Taal**: Nederlands (user-facing), Engels (code/technisch)

### Bestaande Sanity schema's (niet wijzigen, alleen uitbreiden)

- `siteSettings`, `siteImages`, `openingHours`, `trainer`, `offering`, `pricingTier`, `testimonial`, `faq`, `blogPost`, `crowdfundingTier`, `crowdfundingSettings`

---

## Routes

```
/app                          — Member dashboard (auth required)
/app/rooster                  — Week-rooster met boekingsknoppen
/app/boekingen                — Eigen boekingen (komend + historie)
/app/abonnement               — Abbo-status, credits, pauze-verzoek
/app/profiel                  — Profiel, health intake, emergency contact
/app/facturen                 — Betaalhistorie

/app/admin                    — Admin cockpit (rol: admin)
/app/admin/leden              — Ledenbeheer
/app/admin/rooster            — Session editor (ad-hoc ingrepen)
/app/admin/trainers           — Trainerbeheer + urenregistratie
/app/admin/dashboard          — Revenue, bezetting, no-shows, churn

/app/trainer                  — Trainer view (rol: trainer)
/app/trainer/sessies          — Eigen sessies + aanwezigheid

/login                        — Magic link request
/auth/callback                — Supabase auth callback

/api/mollie/webhook           — Mollie subscription webhooks
/api/bookings/*               — Booking API routes (create/cancel)
/api/cron/generate-sessions   — Weekelijkse session-generatie uit templates
/api/cron/send-reminders      — 24u-herinneringen
/api/cron/waitlist-promote    — Waitlist auto-promotie bij cancellation
```

---

## Datamodel — Supabase schemas

Alle tabellen krijgen RLS (Row Level Security) zodat leden alleen hun eigen data zien, en trainers alleen hun eigen sessies.

### `profiles`

Koppelt aan `auth.users(id)`.

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  date_of_birth date,
  age_category text not null default 'adult' check (age_category in ('adult','kids','senior')),
  emergency_contact_name text,
  emergency_contact_phone text,
  health_intake_completed_at timestamptz,
  health_notes text,  -- encrypted at rest via Supabase Vault
  avatar_url text,
  role text not null default 'member' check (role in ('member','trainer','admin')),
  has_used_pt_intake_discount boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index profiles_role_idx on profiles(role);
create index profiles_age_category_idx on profiles(age_category);
```

RLS: users kunnen alleen hun eigen profiel lezen/wijzigen. Admins kunnen alles. Trainers kunnen lezen (namen/contact) van leden die in hun sessies zitten.

### `memberships`

Een lid kan meerdere memberships hebben (bijv. een kids-abbo voor een kind + eigen senior-abbo voor grootouder bij family-account). MVP: één actief abbo per profile.

```sql
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  plan_type text not null check (plan_type in (
    'vrij_trainen','yoga_mobility','kettlebell','all_inclusive',
    'kids','senior','ten_ride_card','pt_package','twelve_week_program'
  )),
  frequency_cap integer,  -- 1, 2, 3, or null for unlimited
  age_category text not null default 'adult' check (age_category in ('adult','kids','senior')),
  price_per_cycle_cents integer not null,  -- in cents, per 4-week cycle
  billing_cycle_weeks integer not null default 4,
  commit_months integer not null default 12,
  start_date date not null,
  commit_end_date date not null,  -- start_date + commit_months
  end_date date,  -- null while active
  status text not null default 'active' check (status in (
    'pending','active','paused','cancellation_requested','cancelled','expired'
  )),
  cancellation_requested_at timestamptz,
  cancellation_effective_date date,  -- after 4-week notice, respecting commit_end_date
  lock_in_active boolean default false,
  lock_in_source text,  -- e.g. 'founding_member_all_inclusive'
  lock_in_expired_at timestamptz,  -- set if member cancelled and lost lock-in
  mollie_subscription_id text unique,
  mollie_customer_id text,
  registration_fee_paid boolean default false,
  credits_remaining integer,  -- only for 10-rittenkaart and pt_package
  credits_total integer,
  credits_expires_at date,  -- for 10-rittenkaart: 4 months from purchase
  source text default 'direct' check (source in ('direct','crowdfunding','admin_manual')),
  crowdfunding_tier_id text,  -- reference to Sanity tier if from crowdfunding
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index memberships_profile_idx on memberships(profile_id);
create index memberships_status_idx on memberships(status);
create index memberships_mollie_sub_idx on memberships(mollie_subscription_id);
```

### `membership_pauses`

Max 3 maanden pauze per commit-jaar bij zwangerschap of medisch attest.

```sql
create table public.membership_pauses (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null check (reason in ('pregnancy','medical','other_approved')),
  approved_by uuid references profiles(id),
  medical_attest_url text,  -- Supabase Storage reference
  created_at timestamptz default now()
);
```

Pauze verlengt automatisch `commit_end_date` met de pauze-duur.

### `class_pillars` (seeded, read-mostly)

De vijf kernpijlers. Beheerd in Sanity als `classPillar` schema, hier gecached.

Values: `vrij_trainen`, `yoga_mobility`, `kettlebell`, `kids`, `senior`.

### `class_types`

Concrete lestypes binnen een pijler (bijv. "Vinyasa Yoga", "Kettlebell Fundamentals"). Beheerd in Sanity als `classType`, gesynchroniseerd naar Supabase voor query-performance.

```sql
create table public.class_types (
  id uuid primary key default gen_random_uuid(),
  sanity_id text unique not null,
  slug text unique not null,
  name text not null,
  pillar text not null check (pillar in ('vrij_trainen','yoga_mobility','kettlebell','kids','senior')),
  age_category text not null check (age_category in ('adult','kids','senior')),
  default_capacity integer not null,
  default_duration_minutes integer not null default 60,
  description text,
  updated_at timestamptz default now()
);
```

### `trainers`

Gelinkt aan een `profile` met `role='trainer'`.

```sql
create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references profiles(id) on delete cascade,
  sanity_id text unique,  -- reference to Sanity `trainer` document
  display_name text not null,
  bio text,
  specialties text[] default '{}',
  pt_tier text not null default 'standard' check (pt_tier in ('premium','standard')),
  hourly_rate_in_cents integer,  -- what TMC pays per hour (ZZP)
  pt_session_rate_cents integer,  -- what member pays for single 1-on-1 session
  is_pt_available boolean default true,
  is_active boolean default true,
  created_at timestamptz default now()
);
```

Marlon: `pt_tier='premium'`, `pt_session_rate_cents=9500`. Andere PT's: `pt_tier='standard'`, `pt_session_rate_cents=8000`, `hourly_rate_in_cents=4000`.

### `schedule_templates`

Wekelijks terugkerende patronen. Beheerd in Sanity, gesynchroniseerd. Cron genereert hieruit concrete `class_sessions`.

```sql
create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  sanity_id text unique,
  class_type_id uuid not null references class_types(id),
  trainer_id uuid not null references trainers(id),
  day_of_week integer not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time time not null,
  duration_minutes integer not null default 60,
  capacity integer not null,
  valid_from date not null,
  valid_until date,  -- null = indefinite
  is_active boolean default true
);
```

### `class_sessions`

De concrete geplande lessen. Gegenereerd uit templates, individueel bewerkbaar via admin-cockpit.

```sql
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid not null references class_types(id),
  trainer_id uuid not null references trainers(id),
  template_id uuid references schedule_templates(id),
  pillar text not null,
  age_category text not null check (age_category in ('adult','kids','senior')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity integer not null,
  status text not null default 'scheduled' check (status in (
    'scheduled','cancelled','completed'
  )),
  cancellation_reason text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index class_sessions_start_idx on class_sessions(start_at);
create index class_sessions_pillar_idx on class_sessions(pillar);
create index class_sessions_trainer_idx on class_sessions(trainer_id);
```

### `bookings`

```sql
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  session_id uuid not null references class_sessions(id) on delete cascade,
  membership_id uuid references memberships(id),  -- used abbo (nullable for drop-in)
  status text not null default 'booked' check (status in (
    'booked','cancelled','waitlisted','attended','no_show'
  )),
  iso_year integer not null,  -- for fair-use weekly cap
  iso_week integer not null,
  credits_used integer default 0,  -- for 10-rittenkaart bookings
  drop_in_payment_id text,  -- Mollie payment id for drop-ins
  cancellation_reason text,
  cancelled_at timestamptz,
  booked_at timestamptz default now(),
  attended_at timestamptz,
  unique(profile_id, session_id)
);

create index bookings_profile_week_idx on bookings(profile_id, iso_year, iso_week);
create index bookings_session_status_idx on bookings(session_id, status);
```

### `waitlist_entries`

```sql
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  session_id uuid not null references class_sessions(id) on delete cascade,
  position integer not null,
  promoted_at timestamptz,
  confirmation_deadline timestamptz,  -- 30 min after promotion
  confirmed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz default now(),
  unique(profile_id, session_id)
);
```

### `no_show_strikes`

Voor fair-use bij onbeperkte abo's.

```sql
create table public.no_show_strikes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  booking_id uuid not null references bookings(id),
  occurred_at timestamptz not null,
  expires_at timestamptz not null  -- 30 days after occurrence
);

create index strikes_profile_expires_idx on no_show_strikes(profile_id, expires_at);
```

### `pt_sessions`

Personal training sessions, buiten het reguliere group-class rooster.

```sql
create table public.pt_sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainers(id),
  format text not null check (format in ('one_on_one','duo','small_group_4')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity integer not null,  -- 1, 2, or 4
  status text not null default 'scheduled',
  notes text
);

create table public.pt_bookings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  pt_session_id uuid not null references pt_sessions(id),
  price_paid_cents integer not null,
  credits_used_from uuid references memberships(id),  -- if from pt_package
  is_intake_discount boolean default false,
  mollie_payment_id text,
  status text not null default 'booked',
  booked_at timestamptz default now()
);
```

### `trainer_hours`

Urenregistratie voor ZZP-trainers (yoga/mobility docenten + standaard PT's).

```sql
create table public.trainer_hours (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainers(id),
  session_id uuid references class_sessions(id),
  pt_session_id uuid references pt_sessions(id),
  hours_worked numeric(4,2) not null,
  hourly_rate_cents integer not null,
  total_cents integer generated always as (
    round(hours_worked * hourly_rate_cents)::integer
  ) stored,
  month integer not null,
  year integer not null,
  invoiced boolean default false,
  created_at timestamptz default now()
);
```

### `admin_audit_log`

Voor gevoelige acties: credit-correcties, lock-in overrides, handmatige cancellations.

```sql
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id),
  action text not null,
  target_type text not null,  -- 'membership','booking','profile', etc.
  target_id uuid not null,
  details jsonb,
  created_at timestamptz default now()
);
```

---

## Sanity schema-extensies

Toevoegen aan `sanity/schemas/`:

### `classPillar.ts`

Singleton-achtig (max 5 documents, vast). Enum: `vrij_trainen`, `yoga_mobility`, `kettlebell`, `kids`, `senior`. Per pijler: display name (NL), omschrijving, icoon, hero-image, default capacity.

### `classType.ts`

- `name` (string, NL)
- `slug` (slug)
- `pillar` (reference naar classPillar)
- `ageCategory` (string, select: adult/kids/senior)
- `defaultCapacity` (number)
- `defaultDurationMinutes` (number, default 60)
- `description` (portable text)
- `heroImage` (image)

### `scheduleTemplate.ts`

- `name` (string, voor admin-context: "Maandag 07:00 Kettlebell")
- `classType` (reference)
- `trainer` (reference naar bestaand `trainer` schema)
- `dayOfWeek` (number 0-6 met dropdown)
- `startTime` (string HH:MM)
- `durationMinutes` (number)
- `capacity` (number)
- `validFrom`, `validUntil` (date)
- `isActive` (boolean)

### `membershipPlan.ts`

Voor marketing- en aanmeldpagina's. De "catalogus".

- `name` (string)
- `planType` (select: matches Supabase plan_type enum)
- `frequencyCap` (number of null)
- `ageCategory` (adult/kids/senior)
- `pricePerCycleCents` (number)
- `billingCycleWeeks` (number, default 4)
- `commitMonths` (number, default 12)
- `includes` (array of strings — "2× per week Yoga", "Vrij trainen op alle equipment", etc.)
- `highlighted` (boolean — voor "Populair" badge)
- `order` (number)
- `isActive` (boolean)

### `bookingSettings.ts` (singleton)

- `cancellationWindowHours` (number, default 6)
- `bookingWindowDays` (number, default 14)
- `fairUseDailyMax` (number, default 2)
- `waitlistConfirmationMinutes` (number, default 30)
- `noShowStrikeWindowDays` (number, default 30)
- `noShowStrikeThreshold` (number, default 3)
- `noShowBlockDays` (number, default 7)
- `registrationFeeCents` (number, default 3900)

---

## Rechten-engine

Kern van het systeem. Deze functie bepaalt of een lid een sessie mag boeken.

### `canBook(profile, session, now)`

Return: `{ allowed: boolean, reason?: string, priceToPayCents?: number, creditFromMembership?: uuid }`

Stappen, in volgorde:

1. **Age category match**: `profile.age_category === session.age_category`. Zo niet: reject ("Deze les is niet voor jouw leeftijdscategorie").

2. **Booking window**: `session.start_at <= now + bookingWindowDays`. Zo niet: reject ("Nog niet open voor boeking").

3. **Session status**: `session.status === 'scheduled'` en `session.start_at > now`. Anders: reject.

4. **Capacity check**: `count(bookings where session_id=session.id and status='booked') < session.capacity`. Zo niet: return `{ allowed: false, reason: 'full', canJoinWaitlist: true }`.

5. **No-show block check**: als lid ≥ `noShowStrikeThreshold` strikes heeft in de laatste `noShowStrikeWindowDays`, reject met "Boekingsblokkade tot [datum]".

6. **Membership check** — zoek actieve memberships voor profile:
   - Als lid een `active` membership heeft waarvan `plan_type` dekt `session.pillar` (zie dekking-matrix onder):
     - Check frequency cap: tel bookings in dezelfde ISO-week voor diezelfde pijler. Als `>= frequency_cap`: reject "Je weekcap is bereikt".
     - Check fair-use daily max: tel bookings op zelfde dag. Als `>= fairUseDailyMax`: reject.
     - Als pass: `allowed=true, priceToPayCents=0, creditFromMembership=membership.id`.
   - Als lid een `ten_ride_card` heeft met credits en de pijler is `yoga_mobility` of `kettlebell` (afhankelijk van het type ritten): reject of accept op basis van credit-match.
   - Als geen dekkend abbo: return `{ allowed: true, priceToPayCents: dropInPrice(session.pillar), requiresPayment: true }`.

### Dekking-matrix (implementeer als lookup)

```typescript
const PLAN_COVERAGE: Record<PlanType, Pillar[]> = {
  vrij_trainen: ['vrij_trainen'],
  yoga_mobility: ['yoga_mobility'],
  kettlebell: ['kettlebell'],
  all_inclusive: ['vrij_trainen','yoga_mobility','kettlebell'],
  kids: ['kids'],
  senior: ['senior'],
  ten_ride_card: ['yoga_mobility','kettlebell'],  // configureerbaar per kaart
  pt_package: [],  // PT only, not group classes
  twelve_week_program: ['vrij_trainen','yoga_mobility','kettlebell'],
};
```

### Drop-in prijzen per pijler

```typescript
const DROP_IN_PRICES_CENTS: Record<Pillar, number> = {
  vrij_trainen: 0,  // vrij trainen is niet als drop-in beschikbaar
  yoga_mobility: 2000,
  kettlebell: 2000,
  kids: 1300,
  senior: 1300,
};
```

---

## Pricing engine

### `calculatePTPrice(trainer, format, isStripCard, stripSize, memberHasActiveSub, isIntakeSession)`

```typescript
function calculatePTPrice(params) {
  const { trainer, format, stripSize, memberHasActiveSub, isIntakeSession } = params;

  // Base prices
  const PRICES = {
    premium: {
      one_on_one: { single: 9500, ten: 85000, twenty: 160000 },
      duo_total: { single: 12000, ten: 110000, twenty: 200000 },
      small_group_4_total: { single: 14000, ten: 130000, twenty: 240000 },
    },
    standard: {
      one_on_one: { single: 8000, ten: 72000, twenty: 135000 },
      duo_total: { single: 10000, ten: 90000, twenty: 170000 },
      small_group_4_total: { single: 12000, ten: 110000, twenty: 200000 },
    },
  };

  // Intake: first 1-on-1 with standard trainer, 50% off
  if (isIntakeSession && trainer.pt_tier === 'standard' && format === 'one_on_one') {
    return 4500;  // €45
  }

  const tier = trainer.pt_tier;
  const size = stripSize ? (stripSize === 20 ? 'twenty' : 'ten') : 'single';
  let price = PRICES[tier][format][size];

  // 10% member discount on PT strip cards (not single sessions)
  if (stripSize && memberHasActiveSub) {
    price = Math.round(price * 0.9);
  }

  return price;
}
```

### Lock-in logica

Bij Founding Members uit de crowdfunding: `lock_in_active=true, lock_in_price_cents=11900` (voor €119/4 wk). Dit tarief wordt gehandhaafd zolang het abbo `active` of `paused` is. Bij `status='cancelled'` of `'expired'`:

1. `lock_in_expired_at = now()`
2. `lock_in_active = false`
3. Als lid later terugkomt en nieuw abbo afsluit, geldt het reguliere tarief.

---

## Booking-regels (configureerbaar via `bookingSettings` in Sanity)

| Regel | Default | Toelichting |
|---|---|---|
| Cancellation window | 6 uur | Binnen window: kosteloos. Daarna: no-show strike of credit verloren |
| Booking window | 14 dagen vooruit | Past bij 4-wekelijkse roosters |
| Waitlist confirmation | 30 min | Na auto-promotie uit waitlist |
| Fair-use daily max | 2 lessen | Voorkomt capacity-hoarding |
| No-show strikes | 3 in 30 dagen = 7 dagen block | Alleen voor onbeperkte abo's |
| Inschrijfkosten | €39 | Eenmalig bij nieuwe inschrijving |

---

## Session-generatie (cron)

### `/api/cron/generate-sessions`

Draait elke **maandag 03:00 UTC**. Genereert 4 weken aan sessies vooruit op basis van actieve `schedule_templates`.

```typescript
// Pseudo-code
async function generateSessions() {
  const today = new Date();
  const horizonEnd = addWeeks(today, 4);

  const templates = await supabase
    .from('schedule_templates')
    .select('*')
    .eq('is_active', true)
    .or(`valid_until.is.null,valid_until.gte.${today.toISOString()}`);

  for (const template of templates) {
    const dates = getWeekdayOccurrences(
      template.day_of_week,
      today,
      horizonEnd
    );

    for (const date of dates) {
      const startAt = combineDateTime(date, template.start_time);
      const endAt = addMinutes(startAt, template.duration_minutes);

      // Skip if session already exists (upsert on template_id + start_at)
      await supabase.from('class_sessions').upsert({
        class_type_id: template.class_type_id,
        trainer_id: template.trainer_id,
        template_id: template.id,
        pillar: (await getClassType(template.class_type_id)).pillar,
        age_category: (await getClassType(template.class_type_id)).age_category,
        start_at: startAt,
        end_at: endAt,
        capacity: template.capacity,
      }, { onConflict: 'template_id,start_at', ignoreDuplicates: true });
    }
  }
}
```

Handmatige wijzigingen aan een specifieke session in de admin-cockpit overschrijven het template voor die ene datum — de `upsert` respecteert bestaande rijen.

### `/api/cron/send-reminders`

Elke **dag 09:00 UTC**: stuur 24u-herinnering naar iedereen met `booking.status='booked'` voor sessies die over 24-36 uur starten.

### `/api/cron/waitlist-promote`

Elke **10 minuten**: promoot eerste waitlist entry voor sessies waar een cancellation is gekomen. Zet `promoted_at`, `confirmation_deadline = now + 30 min`. Stuur mail. Na deadline zonder bevestiging: `expired_at` zetten, volgende promoten.

### `/api/cron/expire-strikes`

Dagelijks: `delete from no_show_strikes where expires_at < now()`.

---

## Mollie-integratie

### Subscriptions op 4-weekse cycli

Mollie ondersteunt `interval: "28 days"`. Bij nieuwe aanmelding:

1. Maak customer aan via Mollie Customer API
2. Maak first payment met `sequenceType: first` voor inschrijfkosten + eerste 4 weken
3. Bij succesvolle betaling: webhook zet `memberships.status='active'`, maak Mollie subscription met `interval: "28 days"`, `amount: price_per_cycle`, `startDate: vandaag + 28 dagen`
4. Elke subsequent payment: webhook registreert in `payments` tabel en houdt `memberships.status='active'` aan

### `/api/mollie/webhook`

Verifieer payload via Mollie API (nooit vertrouwen op webhook body). Handle:

- `payment.paid` voor `sequenceType: first` → activate membership
- `payment.paid` voor recurring → log payment, extend membership
- `payment.failed` of `payment.expired` → mark `status='payment_failed'`, notify admin + member
- `subscription.canceled` → zet `status='cancelled'`, `end_date=now`, evalueer lock-in verval

### Opzegging via app

Lid klikt "Abbo opzeggen" in `/app/abonnement`:

1. Check of binnen `commit_end_date`. Zo ja: tonen "Je abbo loopt tot [datum], opzegging mogelijk vanaf [commit_end - 4 weken]". Enige uitzonderingen: pauze-verzoek of wettelijke herroeping (14 dagen).
2. Zo nee: `cancellation_requested_at = now`, `cancellation_effective_date = max(commit_end_date, now + 28 dagen)`, `status='cancellation_requested'`.
3. Mollie subscription cancel call (via Mollie cancel endpoint) scheduled voor effective date — of direct als geen verdere incasso's meer nodig.
4. Confirm mail naar lid.

---

## Crowdfunding → Membership migratie

Script `/api/admin/migrate-crowdfunding-backers` (admin only, one-shot bij gym-opening).

Voor elke `crowdfunding_backer` in Supabase:

1. Check of `profiles` record al bestaat (email match). Zo nee: maak aan via Supabase Admin API met magic link invite.
2. Map tier → membership plan:

```typescript
const TIER_TO_MEMBERSHIP = {
  'first-move': null,  // Founders Wall only, no membership
  'flow': {
    plan_type: 'ten_ride_card',
    credits_total: 10,
    credits_expires_at_months: 4,
    price_per_cycle_cents: 0,  // already paid
  },
  'kickstart': {
    plan_type: 'all_inclusive',
    frequency_cap: null,
    duration_weeks: 4,
    price_per_cycle_cents: 0,
  },
  'momentum': {
    plan_type: 'all_inclusive',
    frequency_cap: null,
    duration_weeks: 12,
    price_per_cycle_cents: 0,
  },
  'squad': {  // 4 memberships, each 4 weeks
    plan_type: 'all_inclusive',
    multi_member: 4,
    duration_weeks: 4,
  },
  'all-in': {
    plan_type: 'all_inclusive',
    duration_weeks: 52,
    price_per_cycle_cents: 0,
  },
  'power-move': {
    plan_type: 'twelve_week_program',
    duration_weeks: 12,
    pt_credits: 24,
  },
  'legacy': {
    plan_type: 'all_inclusive',
    duration_weeks: null,  // lifetime
    lock_in_active: true,
    lock_in_source: 'legacy_lifetime',
    lock_in_price_cents: 0,
  },
  'the-original': {
    plan_type: 'all_inclusive',
    duration_weeks: null,
    lock_in_active: true,
    lock_in_source: 'the_original_lifetime',
    lock_in_price_cents: 0,
    additional_benefits: ['marlon_guaranteed_pt','private_monthly_session','locker'],
  },
  // Founding Member lock-in perks (separate from CF tiers):
  'founding_member_lock_in': {
    plan_type: 'all_inclusive',
    lock_in_active: true,
    lock_in_source: 'founding_member_all_inclusive',
    lock_in_price_cents: 11900,  // €119/4wk
  },
};
```

3. Insert `memberships` row met `source='crowdfunding'`, `start_date=gym_opening_date`, etc.
4. Stuur welkomst-email met magic link.

---

## Member UI — key screens

### `/app` Dashboard

Widgets:
- **Abbo-card**: plan naam, frequency cap, volgende incasso-datum, credits (als van toepassing), "Beheer abbo" link
- **Deze week**: eigen geboekte lessen (komend), met cancel-knop indien binnen window
- **Rooster-preview**: volgende 3 dagen, quick-book knoppen
- **Health intake prompt**: als `health_intake_completed_at` null, banner om dit te voltooien

### `/app/rooster`

Week-view kalender (shadcn/ui), met filter op pijler en trainer. Per session-tegel: naam lestype, trainer-avatar, starttijd, "X van Y plekken". Klik → bottom sheet met details + "Boek".

Mobile: dag-voor-dag swipe view.

Bij boek-knop drukken:
- Roep `canBook()` aan server-side
- Als `allowed && priceToPayCents === 0`: direct boeken, optimistic UI update, success toast
- Als `allowed && requiresPayment`: open Mollie inline checkout voor drop-in
- Als `!allowed && canJoinWaitlist`: vraag "Op wachtlijst?"
- Anders: tonen reject reason

### `/app/boekingen`

Tabs: "Komend" en "Historie". Per boeking: datum, les, trainer, status. Historie met aanwezigheids-status zichtbaar.

### `/app/abonnement`

- Huidige abbo + status + volgende incasso
- Credit-saldo (als 10-rittenkaart of PT-pakket)
- **Pauze aanvragen** button → formulier met reden (dropdown: zwangerschap/medisch), uploaden attest, start-/einddatum. Naar admin queue.
- **Opzeggen** button → toont commit-einddatum + effectieve opzegdatum, bevestigingsflow met 14-daagse herroepingsuitleg indien nog in bedenktermijn.
- **Tier upgraden/downgraden** — prorated, of per volgende cyclus (business keuze: per volgende cyclus voor MVP).

### `/app/profiel`

- Persoonsgegevens (edit inline)
- Emergency contact
- Health intake (verplicht vóór eerste boeking). Vragen: blessures, medicatie, zwangerschap, doelen, ervaring. Opgeslagen encrypted.
- Avatar upload (Supabase Storage)

---

## Admin-cockpit UI — key screens

### `/app/admin/dashboard`

KPI's bovenaan:
- Actieve leden (per plan_type)
- MRR (maandelijkse recurring revenue, geprorated uit 4-weekse billing)
- Churn laatste 30 dagen
- Bezetting deze week (bookings / capacity)
- No-show rate deze week

Onder: recent activity feed (nieuwe aanmeldingen, opzeggingen, gefaalde betalingen).

### `/app/admin/rooster`

Week-overzicht, drag-to-edit:
- Klik op sessie → sidepanel met: trainer-swap, capacity-aanpassing, individuele cancel, notes
- "Nieuwe sessie" button → form, buiten template om
- "Bulk cancel" — bijv. alle sessies in een week (vakantie)

### `/app/admin/leden`

Tabel met filters: abbo-type, status, leeftijd-categorie, lock-in, no-show count. Per rij klikbaar naar detail:

- Volledig profiel + health intake
- Abbo-historie (alle memberships ooit)
- Booking-historie
- Payment-historie (uit Mollie)
- **Admin actions**: credit toevoegen/aftrekken (reden verplicht, gelogd in audit_log), abbo pauzeren, lock-in override, handmatige opzegging, factuur opnieuw versturen

### `/app/admin/trainers`

Per trainer: aantal gegeven sessies deze maand, ureninvoer, openstaande uitbetaling. Knop "Genereer factuur" → exporteert PDF met regelwerk.

### `/app/trainer/sessies`

Alleen eigen sessies zichtbaar. Deelnemerslijst per sessie met aanwezigheids-checkboxen. Trigger bij afvinken:
- `attended` → `booking.status='attended', attended_at=now`
- Niet afgevinkt na sessie-einde + 2 uur → auto `no_show`, strike-teller omhoog

---

## Email-templates (MailerSend + React Email)

### Stack

- `mailersend` Node SDK voor transactional send
- `@react-email/components` + `@react-email/render` voor templates

Install:

```bash
npm install mailersend @react-email/components @react-email/render
```

### Sender utility

`src/lib/email.ts` — één generieke `send()` functie die een React Email component naar HTML rendert en via de MailerSend SDK verstuurt. Leest `MAILERSEND_API_KEY`, `MAILERSEND_FROM_EMAIL`, `MAILERSEND_FROM_NAME` uit env. Interface globaal:

```typescript
send({ to, subject, react }): Promise<void>
```

Alle transactional mails in de rest van de app gaan via deze helper — geen directe SDK-aanroepen elders.

### Supabase Auth SMTP

Authenticatie-mails (magic link + password recovery) gaan via Supabase Auth zelf, geconfigureerd op **MailerSend SMTP** (Supabase dashboard → Auth → Email → Custom SMTP). Zo houden we alle outbound op één domein en consistent op DKIM/SPF.

### Templates

Alle 13 als React Email componenten in `src/emails/`:

- `welcome_magic_link.tsx` — nieuwe registratie of CF-migratie
- `booking_confirmation.tsx` — direct na boeking
- `booking_reminder_24h.tsx` — 24u voor sessie
- `booking_cancelled.tsx` — door lid geannuleerd
- `waitlist_promoted.tsx` — "Je bent gepromoveerd, bevestig binnen 30 min"
- `waitlist_expired.tsx` — niet bevestigd, volgende in rij
- `payment_failed.tsx` — Mollie incasso gefaald, retry info
- `membership_cancelled.tsx` — bevestiging opzegging + einddatum
- `membership_paused.tsx` — pauze actief
- `pause_rejected.tsx` — aanvraag afgewezen (optioneel)
- `no_show_warning.tsx` — na 2e strike
- `no_show_block.tsx` — na 3e strike, 7 dagen block
- `session_cancelled_by_admin.tsx` — les geannuleerd, plek teruggezet

---

## Analytics events (GA4)

Hergebruik `src/lib/analytics.ts` uit bestaande implementatie. Nieuwe events:

```typescript
trackEvent('membership_signup_started', { plan_type, age_category });
trackEvent('membership_signup_completed', { plan_type, value_cents, lock_in });
trackEvent('booking_created', { pillar, class_type_slug, is_drop_in });
trackEvent('booking_cancelled', { pillar, within_window, hours_before });
trackEvent('waitlist_joined', { pillar });
trackEvent('waitlist_promoted_confirmed', { pillar });
trackEvent('pt_booking_created', { pt_tier, format, price_cents });
trackEvent('membership_cancellation_requested', { plan_type, months_active });
trackEvent('membership_paused', { reason });
```

---

## MVP scope — wat in v1

Alles hieronder moet werken op dag van gym-opening:

- [x] Supabase Auth + magic link login
- [x] Registratie-flow met health intake
- [x] Catalogus van memberships (zonder Kids/Senior in MVP — zie V2)
- [x] Mollie 4-weekse subscriptions met SEPA
- [x] Inschrijfkosten €39 bij nieuw abbo
- [x] Rooster-view (week)
- [x] Boeken + annuleren voor adult pillars (vrij_trainen, yoga_mobility, kettlebell, all_inclusive)
- [x] 10-rittenkaart aankoop + credit-tracking
- [x] PT-booking flow (1-op-1, duo, small group 4)
- [x] Dekking-engine (canBook) met frequency caps en fair-use
- [x] Waitlist met auto-promotie
- [x] No-show strikes
- [x] Session-generatie cron uit templates
- [x] Crowdfunding → membership migratie
- [x] Admin cockpit: ledenbeheer, rooster-editor, dashboard
- [x] Trainer view met aanwezigheids-check
- [x] Email transactioneel (via MailerSend)
- [x] Pauze-aanvraag flow

## V2 (3-6 maanden na opening)

- Kids- en Senior-programma's (eigen rooster, abbo's, UI-flow)
- 12-weken programma als guided journey in-app (content library, progress tracking)
- Online programma toegang (video library met auth-check)
- Family accounts (1 betalende ouder, meerdere profielen onder)
- QR-code check-in bij deur (Supabase RLS + device tablet)
- Push notifications (PWA)
- Referral kortingen
- Geavanceerde admin analytics (cohort retention, LTV per acquisition channel)

## V3

- Native app (Expo, React Native) — herbruik bestaande API
- Direct PT-slot booking in trainer-agenda (iCal sync)
- Integratie met wearables (optional, Apple Health / Google Fit)
- Multi-location support (als TMC 2 gyms krijgt)

---

## Environment variables

Toevoegen aan `.env.local` (verder op `.env.example`):

```bash
# Mollie — al aanwezig van crowdfunding, hergebruiken
MOLLIE_API_KEY=live_xxx
MOLLIE_WEBHOOK_SECRET=xxx

# Supabase — al aanwezig
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx  # for admin operations

# Sanity — al aanwezig
NEXT_PUBLIC_SANITY_PROJECT_ID=hn9lkvte
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_READ_TOKEN=xxx

# MailerSend — nieuw (transactional send via SDK)
MAILERSEND_API_KEY=mlsn_xxx
MAILERSEND_FROM_EMAIL=noreply@themovementclub.nl
MAILERSEND_FROM_NAME=The Movement Club
# Supabase Auth SMTP — zelfde MailerSend account, SMTP-credentials in Supabase dashboard

# Cron auth
CRON_SECRET=xxx  # for Vercel Cron header verification

# App
NEXT_PUBLIC_APP_URL=https://themovementclub.nl
GYM_OPENING_DATE=2026-XX-XX  # config for CF migration
```

---

## Acceptance criteria (MVP)

Het systeem is MVP-klaar als:

1. Een bestaande crowdfunding-backer ontvangt na migratie-run een magic link email, logt in, en ziet zijn juiste tier-membership actief.
2. Een nieuwe bezoeker kan zich registreren, een abbo kiezen, SEPA-machtiging geven, en zijn eerste les boeken — allemaal zonder handmatige admin-intervention.
3. Een lid met "Yoga 2×/wk" kan geen derde yogales boeken in dezelfde ISO-week; krijgt duidelijke fout.
4. Een lid dat binnen 6 uur voor een les annuleert krijgt een no-show strike genoteerd.
5. Een volle les toont automatisch de waitlist-optie; na cancellation binnen 6u wordt de eerste in rij gepromoveerd en heeft 30 minuten om te bevestigen.
6. Marlon kan in de admin-cockpit de week-sessies bekijken, een trainer swappen, en capacity aanpassen — zonder het template te breken.
7. Een trainer kan na een les de aanwezigheid afvinken; niet-afgevinkte leden krijgen 2 uur later automatisch een `no_show` status.
8. Een lid kan een pauze aanvragen met medisch attest upload; admin keurt goed, `commit_end_date` wordt verlengd met de pauze-duur.
9. Mollie incasso faalt → lid krijgt email, admin ziet notificatie, abbo blijft active voor retry-window (3 dagen), daarna `payment_failed`.
10. Een Founding Member die opzegt krijgt `lock_in_expired_at` gezet; bij heraanmelding is het reguliere tarief van toepassing.

---

## Bouw-volgorde (suggestie voor CC)

1. Supabase migrations — alle tabellen + RLS policies
2. Sanity schema-extensies + seed data (class pillars, basic class types, membership plans)
3. Auth-flow (magic link, callback, protected routes middleware)
4. Profiel + health intake
5. Membership signup flow + Mollie 4-week subscription
6. Rechten-engine (`canBook`) + unit tests
7. Rooster-view + booking flow
8. Waitlist + auto-promotie cron
9. PT-booking flow (incl. pricing engine)
10. Admin-cockpit (leden, rooster editor, dashboard)
11. Trainer view met aanwezigheids-check
12. Email-templates
13. Session-generatie cron + herinneringen cron
14. Crowdfunding migratie-script
15. No-show strike systeem
16. Pauze-aanvraag flow
17. Analytics events
18. End-to-end tests voor de 10 acceptance criteria

---

*Versie 1.0 — 20 april 2026*
*Context-input: tmc-tarieven-marlon.docx (versie 2.1), bestaande website codebase, Sanity project hn9lkvte, crowdfunding module spec*
