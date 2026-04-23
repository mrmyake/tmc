-- Crowdfunding tabellen — documenteert wat er al in productie draait.
--
-- Context: de /crowdfunding module is in het begin van het project
-- gebouwd (zie cc-prompt-crowdfunding.md + tmc-crowdfunding-module.md)
-- en de tabellen zijn destijds rechtstreeks in het Supabase dashboard
-- aangemaakt, niet via een migration file. Deze migration reverse-
-- engineert die state zodat:
--   1. Lokale supabase setup + `supabase db push` reproduceerbaar is
--   2. Types/supabase.ts en de werkelijke DB in sync blijven
--
-- Idempotent: `create table if not exists`, `insert ... on conflict`,
-- `create or replace function`. Re-toepassen op een DB die deze
-- objecten al heeft is een no-op.
--
-- Kolom-types zijn afgeleid uit types/supabase.ts (generated) + hoe
-- checkout/route.ts en webhook/route.ts de kolommen lezen/schrijven.
-- De spec in tmc-crowdfunding-module.md noemde `amount INTEGER` maar
-- de live code stuurt decimal-euros via `tier.price` (bv. 50.00) en
-- gebruikt het direct in `€${amount}` interpolatie. Dus numeric(10,2).

-- ----------------------------------------------------------------------------
-- 1. crowdfunding_backers — één rij per checkout-poging, status via Mollie
-- ----------------------------------------------------------------------------

create table if not exists public.crowdfunding_backers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  tier_id text not null,
  tier_name text not null,
  amount numeric(10, 2) not null,
  name text not null,
  email text not null,
  phone text,
  mollie_payment_id text unique,
  payment_status text default 'pending'
    check (payment_status in ('pending','open','paid','failed','canceled','expired','refunded')),
  show_on_wall boolean default true
);

create index if not exists crowdfunding_backers_tier_id_idx
  on public.crowdfunding_backers(tier_id);
create index if not exists crowdfunding_backers_payment_status_idx
  on public.crowdfunding_backers(payment_status);
create index if not exists crowdfunding_backers_created_at_idx
  on public.crowdfunding_backers(created_at desc);

-- ----------------------------------------------------------------------------
-- 2. crowdfunding_stats — singleton (id=1), via webhook bijgewerkt
-- ----------------------------------------------------------------------------

create table if not exists public.crowdfunding_stats (
  id integer primary key default 1,
  total_raised numeric(12, 2) default 0,
  total_backers integer default 0,
  updated_at timestamptz default now(),
  constraint crowdfunding_stats_singleton check (id = 1)
);

-- Seed singleton row als 'ie er nog niet is
insert into public.crowdfunding_stats (id, total_raised, total_backers)
values (1, 0, 0)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. crowdfunding_tiers — inventory-counter per tier (moet matchen met Sanity)
-- ----------------------------------------------------------------------------

create table if not exists public.crowdfunding_tiers (
  id text primary key,
  slots_claimed integer default 0
);

-- De 9 tier-IDs uit tmc-crowdfunding-module.md §3. Deze IDs moeten
-- matchen met Sanity `crowdfundingTier.tierId` zodat checkout +
-- webhook de juiste counter kan bijwerken.
insert into public.crowdfunding_tiers (id, slots_claimed) values
  ('first-move',  0),
  ('flow',        0),
  ('kickstart',   0),
  ('momentum',    0),
  ('the-squad',   0),
  ('all-in',      0),
  ('power-move',  0),
  ('legacy',      0),
  ('the-original', 0)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Atomaire increments via RPC — voorkomt race conditions in de webhook
-- ----------------------------------------------------------------------------

create or replace function public.increment_cf_tier_slot(p_tier_id text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.crowdfunding_tiers (id, slots_claimed)
  values (p_tier_id, 1)
  on conflict (id)
  do update set slots_claimed = public.crowdfunding_tiers.slots_claimed + 1;
$$;

create or replace function public.increment_cf_stats(p_amount numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.crowdfunding_stats
  set total_raised  = coalesce(total_raised, 0) + p_amount,
      total_backers = coalesce(total_backers, 0) + 1,
      updated_at    = now()
  where id = 1;
$$;

-- ----------------------------------------------------------------------------
-- 5. RLS — stats + tiers zijn publiek-leesbaar (live progress bar),
--    backers alleen met service role behalve "show_on_wall = true"
-- ----------------------------------------------------------------------------

alter table public.crowdfunding_backers enable row level security;
alter table public.crowdfunding_stats   enable row level security;
alter table public.crowdfunding_tiers   enable row level security;

-- anon + authenticated mogen live-stats zien
drop policy if exists crowdfunding_stats_public_read on public.crowdfunding_stats;
create policy crowdfunding_stats_public_read on public.crowdfunding_stats
  for select using (true);

drop policy if exists crowdfunding_tiers_public_read on public.crowdfunding_tiers;
create policy crowdfunding_tiers_public_read on public.crowdfunding_tiers
  for select using (true);

-- Alleen betaalde backers op de publieke wall
drop policy if exists crowdfunding_backers_public_wall on public.crowdfunding_backers;
create policy crowdfunding_backers_public_wall on public.crowdfunding_backers
  for select using (payment_status = 'paid' and show_on_wall = true);

-- Admin (via is_admin()) mag alles zien
drop policy if exists crowdfunding_backers_admin_all on public.crowdfunding_backers;
create policy crowdfunding_backers_admin_all on public.crowdfunding_backers
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. Realtime publicatie — useCrowdfundingLive abonneert op alle drie
-- ----------------------------------------------------------------------------

-- Alleen toevoegen als de tabel nog niet in de publication zit,
-- anders geeft add een duplicate error.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crowdfunding_stats'
  ) then
    alter publication supabase_realtime add table public.crowdfunding_stats;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crowdfunding_tiers'
  ) then
    alter publication supabase_realtime add table public.crowdfunding_tiers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crowdfunding_backers'
  ) then
    alter publication supabase_realtime add table public.crowdfunding_backers;
  end if;
end$$;
