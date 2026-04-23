-- Guest passes: members can bring a guest to a session a few times per
-- billing cycle, free of charge. Allocation per cycle is based on plan
-- (computed in TypeScript via src/lib/member/guest-pass-allocation.ts
-- because the rules mix plan_type + frequency_cap). The tables below
-- only record which passes exist and which have been used.

create table public.guest_passes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  membership_id uuid references public.memberships(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  passes_allocated integer not null check (passes_allocated >= 0),
  passes_used integer not null default 0 check (passes_used >= 0),
  created_at timestamptz not null default now(),
  constraint guest_passes_used_lte_allocated
    check (passes_used <= passes_allocated)
);

-- One row per member per period. Makes lazy allocation idempotent.
create unique index guest_passes_member_period_idx
  on public.guest_passes(profile_id, period_start);

create index guest_passes_active_idx
  on public.guest_passes(profile_id, period_end desc);

alter table public.guest_passes enable row level security;

create policy guest_passes_self_read on public.guest_passes
  for select using (profile_id = auth.uid());

create policy guest_passes_admin_all on public.guest_passes
  for all using (public.is_admin()) with check (public.is_admin());

-- --------------------------------------------------------------------------

create table public.guest_bookings (
  id uuid primary key default gen_random_uuid(),
  guest_pass_id uuid not null
    references public.guest_passes(id) on delete cascade,
  session_id uuid not null
    references public.class_sessions(id) on delete cascade,
  booked_by uuid not null references public.profiles(id) on delete cascade,
  guest_name text not null check (length(trim(guest_name)) > 0),
  guest_email text not null check (length(trim(guest_email)) > 0),
  status text not null default 'booked'
    check (status in ('booked','cancelled','attended','no_show')),
  reminder_sent boolean not null default false,
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index guest_bookings_email_idx on public.guest_bookings(guest_email);
create index guest_bookings_booked_by_idx on public.guest_bookings(booked_by);
create index guest_bookings_session_idx on public.guest_bookings(session_id);

-- Prevents the same guest from being added twice to the same session
-- by the same member.
create unique index guest_bookings_unique_per_session
  on public.guest_bookings(session_id, guest_email)
  where status in ('booked','attended');

alter table public.guest_bookings enable row level security;

create policy guest_bookings_self_read on public.guest_bookings
  for select using (booked_by = auth.uid());

create policy guest_bookings_self_insert on public.guest_bookings
  for insert with check (booked_by = auth.uid());

create policy guest_bookings_self_cancel on public.guest_bookings
  for update using (booked_by = auth.uid() and status = 'booked')
  with check (status in ('cancelled','booked'));

create policy guest_bookings_admin_all on public.guest_bookings
  for all using (public.is_admin()) with check (public.is_admin());

create policy guest_bookings_trainer_read on public.guest_bookings
  for select using (
    public.is_trainer()
    and session_id in (
      select cs.id from public.class_sessions cs
      join public.trainers t on t.id = cs.trainer_id
      where t.profile_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- Helper: remaining passes for the current active period of a member.
-- Looks at the most recent `guest_passes` row whose period window covers
-- `current_date`. Returns 0 if no row exists (caller should create one).

create or replace function public.get_remaining_guest_passes(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, passes_allocated - passes_used)
  from public.guest_passes
  where profile_id = p_profile_id
    and period_start <= current_date
    and period_end > current_date
  order by period_start desc
  limit 1;
$$;
