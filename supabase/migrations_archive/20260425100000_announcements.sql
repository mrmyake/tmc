-- Admin-publiceerde aankondigingen, per doelgroep scoped.
-- Gebruikt op D1 trainer dashboard en (later) member dashboard.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  audience text not null default 'trainers'
    check (audience in ('all','trainers','members')),
  author_id uuid not null references public.profiles(id),
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcements_published_idx
  on public.announcements(audience, published_at desc)
  where published_at is not null;
create index announcements_active_idx
  on public.announcements(published_at, expires_at)
  where published_at is not null;

create trigger announcements_touch_updated_at
  before update on public.announcements
  for each row execute function public.touch_updated_at();

alter table public.announcements enable row level security;

-- Admin: volledige CRUD.
create policy announcements_admin_all on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());

-- Gepubliceerd, niet-verlopen, voor juiste audience.
-- 'members' betekent "role=member" — trainers zien die niet.
-- 'trainers' betekent trainers (inclusief admin-met-trainer-rol).
-- 'all' = iedereen ingelogd.
create policy announcements_audience_read on public.announcements
  for select using (
    published_at is not null
    and published_at <= now()
    and (expires_at is null or expires_at > now())
    and (
      audience = 'all'
      or (audience = 'trainers' and public.is_trainer())
      or (audience = 'members' and public.current_user_role() = 'member')
    )
  );
