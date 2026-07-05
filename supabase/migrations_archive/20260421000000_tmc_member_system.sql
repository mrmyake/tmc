-- ============================================================================
-- The Movement Club — Member & Booking System
-- Supabase migration: complete schema, RLS, helpers, triggers, seed data
-- ============================================================================
-- Apply via: supabase migration new tmc_member_system
--            (paste contents, then `supabase db push`)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS & HELPERS
-- ----------------------------------------------------------------------------

-- gen_random_uuid() is built-in on Postgres 13+; no extension needed.
-- We use pgcrypto for digest() if we need hashing later. Uncomment if used.
-- create extension if not exists pgcrypto;

-- Helper: touch updated_at on row update
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- ----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  date_of_birth date,
  age_category text not null default 'adult'
    check (age_category in ('adult','kids','senior')),
  emergency_contact_name text,
  emergency_contact_phone text,
  health_intake_completed_at timestamptz,
  health_notes text,
  avatar_url text,
  role text not null default 'member'
    check (role in ('member','trainer','admin')),
  has_used_pt_intake_discount boolean not null default false,
  marketing_opt_in boolean not null default false,
  locale text not null default 'nl',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);
create index profiles_age_category_idx on public.profiles(age_category);
create index profiles_email_idx on public.profiles(email);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Helper functions that depend on public.profiles (placed after table creation)
-- Helper: get current user role from profiles table
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'anon'
  );
$$;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

-- Helper: check if current user is trainer
create or replace function public.is_trainer()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_role() = 'trainer';
$$;

alter table public.profiles enable row level security;

-- Users can read their own profile
create policy profiles_self_select on public.profiles
  for select using (auth.uid() = id);

-- Users can update their own profile (not role, handled separately)
create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can do anything
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Trigger: auto-create profile row on new auth user
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- 2. TRAINERS
-- ----------------------------------------------------------------------------

create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references public.profiles(id) on delete cascade,
  sanity_id text unique,
  display_name text not null,
  slug text unique not null,
  bio text,
  specialties text[] not null default '{}',
  pillar_specialties text[] not null default '{}',
  pt_tier text not null default 'standard'
    check (pt_tier in ('premium','standard')),
  hourly_rate_in_cents integer,
  pt_session_rate_cents integer,
  is_pt_available boolean not null default true,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trainers_active_idx on public.trainers(is_active);
create index trainers_pt_tier_idx on public.trainers(pt_tier);

create trigger trainers_touch_updated_at
  before update on public.trainers
  for each row execute function public.touch_updated_at();

alter table public.trainers enable row level security;

-- Everyone can read active trainers (for rooster display, PT booking UI)
create policy trainers_public_read on public.trainers
  for select using (is_active = true);

-- Admins can manage
create policy trainers_admin_all on public.trainers
  for all using (public.is_admin()) with check (public.is_admin());

-- Trainers can read/update their own record
create policy trainers_self on public.trainers
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. CLASS PILLARS (reference table, seeded)
-- ----------------------------------------------------------------------------

create table public.class_pillars (
  code text primary key
    check (code in ('vrij_trainen','yoga_mobility','kettlebell','kids','senior')),
  name_nl text not null,
  description_nl text,
  age_category text not null
    check (age_category in ('adult','kids','senior')),
  display_order integer not null default 0
);

alter table public.class_pillars enable row level security;

-- Public read
create policy class_pillars_public_read on public.class_pillars
  for select using (true);

-- Admin write
create policy class_pillars_admin_all on public.class_pillars
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.class_pillars (code, name_nl, description_nl, age_category, display_order) values
  ('vrij_trainen',  'Vrij Trainen',    'Zelf trainen op alle equipment', 'adult',  1),
  ('yoga_mobility', 'Yoga & Mobility', 'Groepslessen yoga en mobiliteit', 'adult',  2),
  ('kettlebell',    'Kettlebell Club', 'Marlon-led kettlebell sessies',   'adult',  3),
  ('kids',          'Kids',            'Kinderen t/m 12 jaar',            'kids',   4),
  ('senior',        'Senior 65+',      'Small group circuit voor 65+',    'senior', 5)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- 4. CLASS TYPES
-- ----------------------------------------------------------------------------

create table public.class_types (
  id uuid primary key default gen_random_uuid(),
  sanity_id text unique,
  slug text unique not null,
  name text not null,
  pillar text not null references public.class_pillars(code),
  age_category text not null
    check (age_category in ('adult','kids','senior')),
  default_capacity integer not null,
  default_duration_minutes integer not null default 60,
  description text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index class_types_pillar_idx on public.class_types(pillar);
create index class_types_active_idx on public.class_types(is_active);

create trigger class_types_touch_updated_at
  before update on public.class_types
  for each row execute function public.touch_updated_at();

alter table public.class_types enable row level security;

create policy class_types_public_read on public.class_types
  for select using (is_active = true);

create policy class_types_admin_all on public.class_types
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. SCHEDULE TEMPLATES
-- ----------------------------------------------------------------------------

create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  sanity_id text unique,
  name text,
  class_type_id uuid not null references public.class_types(id),
  trainer_id uuid not null references public.trainers(id),
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes integer not null default 60,
  capacity integer not null,
  valid_from date not null,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index schedule_templates_active_idx on public.schedule_templates(is_active);

create trigger schedule_templates_touch_updated_at
  before update on public.schedule_templates
  for each row execute function public.touch_updated_at();

alter table public.schedule_templates enable row level security;

create policy schedule_templates_public_read on public.schedule_templates
  for select using (is_active = true);

create policy schedule_templates_admin_all on public.schedule_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. CLASS SESSIONS
-- ----------------------------------------------------------------------------

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid not null references public.class_types(id),
  trainer_id uuid not null references public.trainers(id),
  template_id uuid references public.schedule_templates(id) on delete set null,
  pillar text not null references public.class_pillars(code),
  age_category text not null
    check (age_category in ('adult','kids','senior')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  status text not null default 'scheduled'
    check (status in ('scheduled','cancelled','completed')),
  cancellation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, start_at)
);

create index class_sessions_start_idx on public.class_sessions(start_at);
create index class_sessions_pillar_idx on public.class_sessions(pillar);
create index class_sessions_trainer_idx on public.class_sessions(trainer_id);
create index class_sessions_age_idx on public.class_sessions(age_category);
create index class_sessions_status_idx on public.class_sessions(status);

create trigger class_sessions_touch_updated_at
  before update on public.class_sessions
  for each row execute function public.touch_updated_at();

alter table public.class_sessions enable row level security;

-- All authenticated users see all sessions (rooster is public for members)
create policy class_sessions_authed_read on public.class_sessions
  for select using (auth.role() = 'authenticated');

-- Admin writes all
create policy class_sessions_admin_all on public.class_sessions
  for all using (public.is_admin()) with check (public.is_admin());

-- Trainers can update their own sessions (notes, cancellation)
create policy class_sessions_trainer_own_update on public.class_sessions
  for update using (
    public.is_trainer()
    and trainer_id in (select id from public.trainers where profile_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 7. MEMBERSHIPS
-- ----------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan_type text not null check (plan_type in (
    'vrij_trainen','yoga_mobility','kettlebell','all_inclusive',
    'kids','senior','ten_ride_card','pt_package','twelve_week_program'
  )),
  plan_variant text, -- e.g. "yoga_mobility_2x" or "all_inclusive_unlimited"
  frequency_cap integer, -- 1, 2, 3, or null for unlimited
  age_category text not null default 'adult'
    check (age_category in ('adult','kids','senior')),
  price_per_cycle_cents integer not null,
  billing_cycle_weeks integer not null default 4,
  commit_months integer not null default 12,
  start_date date not null,
  commit_end_date date not null,
  end_date date,
  status text not null default 'pending' check (status in (
    'pending','active','paused','cancellation_requested','cancelled',
    'expired','payment_failed'
  )),
  cancellation_requested_at timestamptz,
  cancellation_effective_date date,
  lock_in_active boolean not null default false,
  lock_in_source text,
  lock_in_price_cents integer,
  lock_in_expired_at timestamptz,
  mollie_customer_id text,
  mollie_subscription_id text unique,
  registration_fee_paid boolean not null default false,
  credits_remaining integer,
  credits_total integer,
  credits_expires_at date,
  covered_pillars text[] not null default '{}', -- cached from plan_type mapping
  source text not null default 'direct'
    check (source in ('direct','crowdfunding','admin_manual')),
  crowdfunding_tier_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memberships_profile_idx on public.memberships(profile_id);
create index memberships_status_idx on public.memberships(status);
create index memberships_plan_type_idx on public.memberships(plan_type);
create index memberships_mollie_sub_idx on public.memberships(mollie_subscription_id);
create index memberships_active_profile_idx on public.memberships(profile_id)
  where status in ('active','paused');

create trigger memberships_touch_updated_at
  before update on public.memberships
  for each row execute function public.touch_updated_at();

-- Trigger: set commit_end_date = start_date + commit_months on insert if not set
create or replace function public.set_commit_end_date()
returns trigger
language plpgsql
as $$
begin
  if new.commit_end_date is null then
    new.commit_end_date = new.start_date + (new.commit_months || ' months')::interval;
  end if;
  return new;
end;
$$;

create trigger memberships_set_commit_end
  before insert on public.memberships
  for each row execute function public.set_commit_end_date();

alter table public.memberships enable row level security;

create policy memberships_self_read on public.memberships
  for select using (profile_id = auth.uid());

create policy memberships_admin_all on public.memberships
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. MEMBERSHIP PAUSES
-- ----------------------------------------------------------------------------

create table public.membership_pauses (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  reason text not null check (reason in ('pregnancy','medical','other_approved')),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','active','completed')),
  requested_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  medical_attest_url text,
  notes text,
  created_at timestamptz not null default now()
);

create index pauses_membership_idx on public.membership_pauses(membership_id);
create index pauses_status_idx on public.membership_pauses(status);

alter table public.membership_pauses enable row level security;

create policy pauses_self_read on public.membership_pauses
  for select using (
    membership_id in (select id from public.memberships where profile_id = auth.uid())
  );

create policy pauses_self_insert on public.membership_pauses
  for insert with check (
    membership_id in (select id from public.memberships where profile_id = auth.uid())
  );

create policy pauses_admin_all on public.membership_pauses
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. BOOKINGS
-- ----------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  membership_id uuid references public.memberships(id) on delete set null,
  status text not null default 'booked' check (status in (
    'booked','cancelled','waitlisted','attended','no_show'
  )),
  iso_year integer not null,
  iso_week integer not null,
  session_date date not null,
  pillar text not null,
  credits_used integer not null default 0,
  drop_in_payment_id text,
  drop_in_price_cents integer not null default 0,
  cancellation_reason text,
  cancelled_at timestamptz,
  booked_at timestamptz not null default now(),
  attended_at timestamptz,
  unique(profile_id, session_id)
);

create index bookings_profile_week_idx on public.bookings(profile_id, iso_year, iso_week);
create index bookings_profile_date_idx on public.bookings(profile_id, session_date);
create index bookings_session_status_idx on public.bookings(session_id, status);
create index bookings_profile_pillar_week_idx
  on public.bookings(profile_id, pillar, iso_year, iso_week)
  where status = 'booked';

alter table public.bookings enable row level security;

create policy bookings_self_read on public.bookings
  for select using (profile_id = auth.uid());

create policy bookings_self_insert on public.bookings
  for insert with check (profile_id = auth.uid());

create policy bookings_self_cancel on public.bookings
  for update using (profile_id = auth.uid() and status = 'booked')
  with check (status in ('cancelled','booked'));

create policy bookings_admin_all on public.bookings
  for all using (public.is_admin()) with check (public.is_admin());

-- Trainers can read + update attendance for their own sessions
create policy bookings_trainer_read on public.bookings
  for select using (
    public.is_trainer()
    and session_id in (
      select cs.id from public.class_sessions cs
      join public.trainers t on t.id = cs.trainer_id
      where t.profile_id = auth.uid()
    )
  );

create policy bookings_trainer_attendance on public.bookings
  for update using (
    public.is_trainer()
    and session_id in (
      select cs.id from public.class_sessions cs
      join public.trainers t on t.id = cs.trainer_id
      where t.profile_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 10. WAITLIST
-- ----------------------------------------------------------------------------

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  position integer not null,
  promoted_at timestamptz,
  confirmation_deadline timestamptz,
  confirmed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  unique(profile_id, session_id)
);

create index waitlist_session_position_idx on public.waitlist_entries(session_id, position);
create index waitlist_pending_promotion_idx on public.waitlist_entries(promoted_at)
  where confirmed_at is null and expired_at is null;

alter table public.waitlist_entries enable row level security;

create policy waitlist_self_all on public.waitlist_entries
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy waitlist_admin_all on public.waitlist_entries
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 11. NO-SHOW STRIKES
-- ----------------------------------------------------------------------------

create table public.no_show_strikes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index strikes_profile_expires_idx on public.no_show_strikes(profile_id, expires_at);

alter table public.no_show_strikes enable row level security;

create policy strikes_self_read on public.no_show_strikes
  for select using (profile_id = auth.uid());

create policy strikes_admin_all on public.no_show_strikes
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 12. PT SESSIONS & BOOKINGS
-- ----------------------------------------------------------------------------

create table public.pt_sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id),
  format text not null check (format in ('one_on_one','duo','small_group_4')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 4),
  status text not null default 'scheduled'
    check (status in ('scheduled','cancelled','completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pt_sessions_trainer_start_idx on public.pt_sessions(trainer_id, start_at);

create trigger pt_sessions_touch_updated_at
  before update on public.pt_sessions
  for each row execute function public.touch_updated_at();

alter table public.pt_sessions enable row level security;

create policy pt_sessions_authed_read on public.pt_sessions
  for select using (auth.role() = 'authenticated');

create policy pt_sessions_admin_all on public.pt_sessions
  for all using (public.is_admin()) with check (public.is_admin());

create policy pt_sessions_trainer_own on public.pt_sessions
  for all using (
    public.is_trainer()
    and trainer_id in (select id from public.trainers where profile_id = auth.uid())
  );

create table public.pt_bookings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pt_session_id uuid not null references public.pt_sessions(id) on delete cascade,
  price_paid_cents integer not null,
  credits_used_from uuid references public.memberships(id),
  is_intake_discount boolean not null default false,
  mollie_payment_id text,
  status text not null default 'booked'
    check (status in ('booked','cancelled','attended','no_show')),
  cancelled_at timestamptz,
  booked_at timestamptz not null default now(),
  unique(profile_id, pt_session_id)
);

create index pt_bookings_profile_idx on public.pt_bookings(profile_id);
create index pt_bookings_session_idx on public.pt_bookings(pt_session_id);

alter table public.pt_bookings enable row level security;

create policy pt_bookings_self_all on public.pt_bookings
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy pt_bookings_admin_all on public.pt_bookings
  for all using (public.is_admin()) with check (public.is_admin());

create policy pt_bookings_trainer_read on public.pt_bookings
  for select using (
    public.is_trainer()
    and pt_session_id in (
      select ps.id from public.pt_sessions ps
      join public.trainers t on t.id = ps.trainer_id
      where t.profile_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 13. TRAINER HOURS (ZZP registration)
-- ----------------------------------------------------------------------------

create table public.trainer_hours (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id),
  session_id uuid references public.class_sessions(id) on delete set null,
  pt_session_id uuid references public.pt_sessions(id) on delete set null,
  hours_worked numeric(4,2) not null check (hours_worked > 0),
  hourly_rate_cents integer not null,
  total_cents integer generated always as (
    (hours_worked * hourly_rate_cents)::integer
  ) stored,
  month integer not null check (month between 1 and 12),
  year integer not null,
  invoiced boolean not null default false,
  invoice_reference text,
  notes text,
  created_at timestamptz not null default now()
);

create index trainer_hours_trainer_period_idx on public.trainer_hours(trainer_id, year, month);
create index trainer_hours_invoiced_idx on public.trainer_hours(invoiced);

alter table public.trainer_hours enable row level security;

create policy trainer_hours_self_read on public.trainer_hours
  for select using (
    trainer_id in (select id from public.trainers where profile_id = auth.uid())
  );

create policy trainer_hours_admin_all on public.trainer_hours
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 14. PAYMENTS LOG
-- ----------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  membership_id uuid references public.memberships(id) on delete set null,
  pt_booking_id uuid references public.pt_bookings(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  mollie_payment_id text unique not null,
  mollie_subscription_id text,
  amount_cents integer not null,
  status text not null check (status in (
    'open','pending','authorized','paid','canceled','expired','failed','refunded'
  )),
  method text,
  description text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index payments_profile_idx on public.payments(profile_id);
create index payments_membership_idx on public.payments(membership_id);
create index payments_status_idx on public.payments(status);

alter table public.payments enable row level security;

create policy payments_self_read on public.payments
  for select using (profile_id = auth.uid());

create policy payments_admin_all on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 15. ADMIN AUDIT LOG
-- ----------------------------------------------------------------------------

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index audit_target_idx on public.admin_audit_log(target_type, target_id);
create index audit_admin_idx on public.admin_audit_log(admin_id);

alter table public.admin_audit_log enable row level security;

create policy audit_admin_all on public.admin_audit_log
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 16. MEMBERSHIP PLAN CATALOGUE (seed)
-- ----------------------------------------------------------------------------

create table public.membership_plan_catalogue (
  id uuid primary key default gen_random_uuid(),
  sanity_id text unique,
  plan_type text not null,
  plan_variant text unique not null,
  display_name text not null,
  frequency_cap integer,
  age_category text not null
    check (age_category in ('adult','kids','senior')),
  price_per_cycle_cents integer not null,
  billing_cycle_weeks integer not null default 4,
  commit_months integer not null default 12,
  covered_pillars text[] not null default '{}',
  includes text[] not null default '{}',
  is_highlighted boolean not null default false,
  display_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger catalogue_touch_updated_at
  before update on public.membership_plan_catalogue
  for each row execute function public.touch_updated_at();

alter table public.membership_plan_catalogue enable row level security;

create policy catalogue_public_read on public.membership_plan_catalogue
  for select using (is_active = true);

create policy catalogue_admin_all on public.membership_plan_catalogue
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed all 16 variants from tarievendoc (prices in cents per 4-week cycle)
insert into public.membership_plan_catalogue
  (plan_variant, plan_type, display_name, frequency_cap, age_category,
   price_per_cycle_cents, covered_pillars, includes, display_order)
values
  -- Vrij Trainen
  ('vrij_trainen_2x',  'vrij_trainen', 'Vrij Trainen 2×/wk',  2,    'adult',
   4900,  array['vrij_trainen'], array['2× per week vrij trainen','Toegang tot alle equipment'], 10),
  ('vrij_trainen_3x',  'vrij_trainen', 'Vrij Trainen 3×/wk',  3,    'adult',
   5900,  array['vrij_trainen'], array['3× per week vrij trainen','Toegang tot alle equipment'], 11),
  ('vrij_trainen_unl', 'vrij_trainen', 'Vrij Trainen Onbeperkt', null, 'adult',
   6900,  array['vrij_trainen'], array['Onbeperkt vrij trainen','Toegang tot alle equipment'], 12),

  -- Yoga & Mobility
  ('yoga_mobility_1x',  'yoga_mobility', 'Yoga & Mobility 1×/wk',  1,    'adult',
   4900,  array['yoga_mobility'], array['1× per week yoga of mobility'], 20),
  ('yoga_mobility_2x',  'yoga_mobility', 'Yoga & Mobility 2×/wk',  2,    'adult',
   7900,  array['yoga_mobility'], array['2× per week yoga of mobility'], 21),
  ('yoga_mobility_3x',  'yoga_mobility', 'Yoga & Mobility 3×/wk',  3,    'adult',
   9900,  array['yoga_mobility'], array['3× per week yoga of mobility'], 22),
  ('yoga_mobility_unl', 'yoga_mobility', 'Yoga & Mobility Onbeperkt', null, 'adult',
   11900, array['yoga_mobility'], array['Onbeperkt yoga en mobility'], 23),

  -- Kettlebell Club
  ('kettlebell_1x', 'kettlebell', 'Kettlebell Club 1×/wk', 1, 'adult',
   5900,  array['kettlebell'], array['1× per week Kettlebell Club'], 30),
  ('kettlebell_2x', 'kettlebell', 'Kettlebell Club 2×/wk', 2, 'adult',
   9900,  array['kettlebell'], array['2× per week Kettlebell Club'], 31),
  ('kettlebell_3x', 'kettlebell', 'Kettlebell Club 3×/wk', 3, 'adult',
   11900, array['kettlebell'], array['3× per week Kettlebell Club','Maximum aanbod'], 32),

  -- All Inclusive
  ('all_inclusive_3x',  'all_inclusive', 'All Inclusive 3×/wk',  3,    'adult',
   12900, array['vrij_trainen','yoga_mobility','kettlebell'],
   array['3× per week toegang tot alle lessen','Vrij trainen inbegrepen'], 40),
  ('all_inclusive_unl', 'all_inclusive', 'All Inclusive Onbeperkt', null, 'adult',
   14900, array['vrij_trainen','yoga_mobility','kettlebell'],
   array['Onbeperkt alle lessen','Vrij trainen inbegrepen','Yoga, mobility, kettlebell'], 41),

  -- Kids
  ('kids_1x',  'kids', 'Kids 1×/wk',         1,    'kids',
   4500,  array['kids'], array['1× per week kids-les'], 50),
  ('kids_2x',  'kids', 'Kids 2×/wk',         2,    'kids',
   7500,  array['kids'], array['2× per week kids-les'], 51),
  ('kids_unl', 'kids', 'Kids Onbeperkt (4×)', null, 'kids',
   9500,  array['kids'], array['Onbeperkt kids-lessen (max 4×/wk)'], 52),

  -- Senior
  ('senior_1x',  'senior', 'Senior 1×/wk',         1,    'senior',
   4500,  array['senior'], array['1× per week senior circuit'], 60),
  ('senior_2x',  'senior', 'Senior 2×/wk',         2,    'senior',
   7500,  array['senior'], array['2× per week senior circuit'], 61),
  ('senior_unl', 'senior', 'Senior Onbeperkt (5×)', null, 'senior',
   9900,  array['senior'], array['Onbeperkt senior circuit (max 5×/wk)'], 62)
on conflict (plan_variant) do nothing;

-- ----------------------------------------------------------------------------
-- 17. BOOKING SETTINGS (singleton)
-- ----------------------------------------------------------------------------

create table public.booking_settings (
  id text primary key default 'singleton' check (id = 'singleton'),
  cancellation_window_hours integer not null default 6,
  booking_window_days integer not null default 14,
  waitlist_confirmation_minutes integer not null default 30,
  fair_use_daily_max integer not null default 2,
  no_show_strike_window_days integer not null default 30,
  no_show_strike_threshold integer not null default 3,
  no_show_block_days integer not null default 7,
  registration_fee_cents integer not null default 3900,
  drop_in_yoga_cents integer not null default 2000,
  drop_in_kettlebell_cents integer not null default 2000,
  drop_in_kids_cents integer not null default 1300,
  drop_in_senior_cents integer not null default 1300,
  ten_ride_card_cents integer not null default 17000,
  ten_ride_card_crowdfunding_cents integer not null default 15000,
  ten_ride_card_validity_months integer not null default 4,
  kids_ten_ride_card_cents integer not null default 11000,
  senior_ten_ride_card_cents integer not null default 11000,
  pt_intake_discount_cents integer not null default 4500,
  member_pt_discount_percent integer not null default 10,
  updated_at timestamptz not null default now()
);

insert into public.booking_settings (id) values ('singleton')
on conflict (id) do nothing;

create trigger booking_settings_touch
  before update on public.booking_settings
  for each row execute function public.touch_updated_at();

alter table public.booking_settings enable row level security;

create policy booking_settings_public_read on public.booking_settings
  for select using (true);

create policy booking_settings_admin_all on public.booking_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 18. STORAGE BUCKETS
-- ----------------------------------------------------------------------------

-- Run these in Supabase Dashboard or via SQL; they are idempotent.
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('medical-attestations', 'medical-attestations', false)
on conflict (id) do nothing;

-- Avatars: users can upload their own
create policy "avatars_self_upload" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_self_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Medical attestations: private, user upload, admin read
create policy "medical_self_upload" on storage.objects
  for insert with check (
    bucket_id = 'medical-attestations'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "medical_self_read" on storage.objects
  for select using (
    bucket_id = 'medical-attestations'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "medical_admin_read" on storage.objects
  for select using (
    bucket_id = 'medical-attestations'
    and public.is_admin()
  );

-- ----------------------------------------------------------------------------
-- 19. USEFUL VIEWS
-- ----------------------------------------------------------------------------

-- Active membership per profile (max 1 in MVP, but supports future multi)
create or replace view public.v_active_memberships as
select m.*
from public.memberships m
where m.status in ('active','paused')
  and (m.end_date is null or m.end_date >= current_date);

-- Session availability (for rooster UI)
create or replace view public.v_session_availability as
select
  cs.id,
  cs.class_type_id,
  cs.trainer_id,
  cs.pillar,
  cs.age_category,
  cs.start_at,
  cs.end_at,
  cs.capacity,
  cs.status,
  count(b.id) filter (where b.status = 'booked') as booked_count,
  cs.capacity - count(b.id) filter (where b.status = 'booked') as spots_available,
  count(w.id) filter (
    where w.confirmed_at is null and w.expired_at is null
  ) as waitlist_count
from public.class_sessions cs
left join public.bookings b on b.session_id = cs.id
left join public.waitlist_entries w on w.session_id = cs.id
where cs.status = 'scheduled'
group by cs.id;

-- Member booking count per ISO week and pillar (for fair-use cap check)
create or replace view public.v_weekly_bookings as
select
  profile_id,
  pillar,
  iso_year,
  iso_week,
  count(*) as booking_count
from public.bookings
where status = 'booked'
group by profile_id, pillar, iso_year, iso_week;

-- Active no-show strikes per profile
create or replace view public.v_active_strikes as
select
  profile_id,
  count(*) as strike_count,
  max(occurred_at) as last_strike_at,
  min(expires_at) as earliest_expiry
from public.no_show_strikes
where expires_at > now()
group by profile_id;

-- ----------------------------------------------------------------------------
-- 20. BUSINESS LOGIC FUNCTIONS
-- ----------------------------------------------------------------------------

-- Extend commit_end_date when a pause is approved
create or replace function public.apply_pause_to_commit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pause_days integer;
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    pause_days := (new.end_date - new.start_date);
    update public.memberships
    set commit_end_date = commit_end_date + (pause_days || ' days')::interval
    where id = new.membership_id;
  end if;
  return new;
end;
$$;

create trigger pauses_extend_commit
  after update on public.membership_pauses
  for each row execute function public.apply_pause_to_commit();

-- Expire lock-in when membership is cancelled
create or replace function public.expire_lock_in_on_cancel()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if new.lock_in_active then
      new.lock_in_active := false;
      new.lock_in_expired_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger memberships_expire_lock_in
  before update on public.memberships
  for each row execute function public.expire_lock_in_on_cancel();

-- Clean up expired strikes (callable from cron)
create or replace function public.cleanup_expired_strikes()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  delete from public.no_show_strikes where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 21. CROSS-TABLE POLICIES (deferred — require all tables to exist)
-- ----------------------------------------------------------------------------

-- Trainers can read profiles of members who booked their sessions (implemented
-- via a view in application layer to keep RLS simple; or via function below)
create policy profiles_trainer_read_relevant on public.profiles
  for select using (
    public.is_trainer()
    and exists (
      select 1 from public.bookings b
      join public.class_sessions cs on cs.id = b.session_id
      join public.trainers t on t.id = cs.trainer_id
      where b.profile_id = public.profiles.id
        and t.profile_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- END OF MIGRATION
-- ----------------------------------------------------------------------------
