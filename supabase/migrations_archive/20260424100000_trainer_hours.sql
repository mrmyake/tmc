-- Urenregistratie voor trainers + employment-tier kolom op trainers.
-- Gebruikt op /app/admin/trainers (C6) en later /app/trainer/uren.

alter table public.trainers
  add column if not exists employment_tier text
    not null default 'trainer'
    check (employment_tier in ('head_trainer','trainer','intern'));

-- Eerdere migratie-poging kan een oude trainer_hours hebben achtergelaten —
-- tabel is per definitie nog leeg, dus drop-and-recreate is veilig. Fresh
-- installs raken het gewoon niet.
drop table if exists public.trainer_hours cascade;

create table public.trainer_hours (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  work_date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  notes text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  submitted_at timestamptz not null default now()
);

create index if not exists trainer_hours_trainer_date_idx
  on public.trainer_hours(trainer_id, work_date desc);
create index if not exists trainer_hours_status_idx on public.trainer_hours(status);

alter table public.trainer_hours enable row level security;

drop policy if exists trainer_hours_admin_all on public.trainer_hours;
create policy trainer_hours_admin_all on public.trainer_hours
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists trainer_hours_self_read on public.trainer_hours;
create policy trainer_hours_self_read on public.trainer_hours
  for select using (
    public.is_trainer()
    and trainer_id in (
      select id from public.trainers where profile_id = auth.uid()
    )
  );

drop policy if exists trainer_hours_self_insert on public.trainer_hours;
create policy trainer_hours_self_insert on public.trainer_hours
  for insert with check (
    public.is_trainer()
    and trainer_id in (
      select id from public.trainers where profile_id = auth.uid()
    )
    and status = 'pending'
  );
