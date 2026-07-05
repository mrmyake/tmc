-- Admin-only notes per lid. Append-only: admin ziet alle notes, lid ziet niks.
-- Gebruikt op /app/admin/leden/[id] (C5).

create table public.member_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index member_notes_profile_idx
  on public.member_notes(profile_id, created_at desc);

alter table public.member_notes enable row level security;

-- Alleen admins. Geen lid-read policy (notes zijn intern).
create policy member_notes_admin_all on public.member_notes
  for all using (public.is_admin()) with check (public.is_admin());
