-- Add address columns to profiles for member registration + admin contact.
-- Nullable on purpose: existing members have no address yet; the app gates
-- on "address complete" at registration (checkout) rather than at DB level.

alter table public.profiles
  add column if not exists street_address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text not null default 'NL';

-- Basic index — admin lookups by city are common enough and cheap.
create index if not exists profiles_city_idx on public.profiles(city);
