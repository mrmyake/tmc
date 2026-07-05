-- Fase 2 — PR 1: check-in data-model + identifiers
-- Zie fase-2-discovery-report.md voor context en architectuur-keuzes.
--
-- - Geen member-data te migreren: TMC is nog niet live met echte leden.
--   Existing profiles (dummy seeds) worden backfilled met placeholder
--   phones; seed-script wordt dezelfde commit bijgewerkt.
-- - Gast-profiles: member-invited gasten blijven in guest_bookings
--   (ongewijzigd). Walk-ins via de tablet krijgen een eigen auth.user +
--   profiles-rij (server action creëert ze in PR1 applicatie-code).
-- - bookings.status enum-slim (naar booked|cancelled) komt in PR3 samen
--   met de attendance-UI refactor. Huidige check-constraint blijft.
-- - Admin PIN is gedeeld voor het team. Bcrypt via pgcrypto.

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. profiles.phone — unique, required, E.164 NL-mobiel format
-- ----------------------------------------------------------------------------

-- Backfill bestaande rijen zonder phone met unieke placeholders. Format
-- is geldige NL-mobiel: +31 + 6 (mobile prefix) + 8 cijfers =
-- +316XXXXXXXX (totaal 12 tekens incl. +). Matcht regex ^\+31[0-9]{9}$.
update public.profiles
set phone = '+316' || lpad(
  (abs(hashtext(id::text)) % 100000000)::text,
  8,
  '0'
)
where phone is null
   or length(trim(phone)) = 0
   or phone !~ '^\+31[0-9]{9}$';

-- Als de hash-based backfill toch botsingen geeft: unieke achter de hand.
update public.profiles p
set phone = '+316' || lpad(
  ((abs(hashtext(id::text || random()::text))) % 100000000)::text,
  8,
  '0'
)
from (
  select phone, count(*) as n
  from public.profiles
  group by phone
  having count(*) > 1
) dup
where p.phone = dup.phone
  and p.id <> (select min(id::text) from public.profiles p2 where p2.phone = dup.phone)::uuid;

alter table public.profiles
  alter column phone set not null;

alter table public.profiles
  add constraint profiles_phone_unique unique (phone);

alter table public.profiles
  add constraint profiles_phone_e164_nl
  check (phone ~ '^\+31[0-9]{9}$');

comment on column public.profiles.phone is
  'NL-mobiel in E.164 (+31...). Primary identifier voor tablet check-in.';

-- ----------------------------------------------------------------------------
-- 2. profiles.member_code — 6-digit unique fallback identifier
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists member_code text;

-- Backfill met gegarandeerd-unique code. Loop zolang er botsingen zijn.
-- Voor 8 dummies is dit triviaal; voor een grotere dataset nog steeds
-- O(n) met random retries.
do $$
declare
  rec record;
  candidate text;
  attempts integer;
begin
  for rec in select id from public.profiles where member_code is null loop
    attempts := 0;
    loop
      candidate := lpad((floor(random() * 1000000))::text, 6, '0');
      exit when not exists (
        select 1 from public.profiles where member_code = candidate
      );
      attempts := attempts + 1;
      if attempts > 50 then
        raise exception 'member_code collision storm on profile %', rec.id;
      end if;
    end loop;
    update public.profiles set member_code = candidate where id = rec.id;
  end loop;
end$$;

alter table public.profiles
  alter column member_code set not null;

alter table public.profiles
  add constraint profiles_member_code_unique unique (member_code);

alter table public.profiles
  add constraint profiles_member_code_format
  check (member_code ~ '^[0-9]{6}$');

comment on column public.profiles.member_code is
  'Auto-generated 6-digit unique identifier. Fallback op tablet wanneer phone niet werkt (gedeelde nummers, gasten).';

-- Update de new-user trigger zodat elke nieuwe profile meteen een
-- member_code krijgt. phone komt via raw_user_meta_data (admin-api +
-- signup-form), value wordt check-constraint-gecheckt.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempts integer := 0;
begin
  loop
    v_code := lpad((floor(random() * 1000000))::text, 6, '0');
    exit when not exists (
      select 1 from public.profiles where member_code = v_code
    );
    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      raise exception 'member_code collision storm';
    end if;
  end loop;

  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    member_code,
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
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '+3160' || lpad(
      (abs(hashtext(new.id::text)) % 100000000)::text,
      8,
      '0'
    )),
    v_code,
    new.raw_user_meta_data->>'acquisition_source',
    new.raw_user_meta_data->>'acquisition_medium',
    new.raw_user_meta_data->>'acquisition_campaign',
    new.raw_user_meta_data->>'acquisition_content',
    new.raw_user_meta_data->>'signup_path',
    nullif(new.raw_user_meta_data->>'first_touch_at', '')::timestamptz
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. check_ins — source of truth voor aanwezigheid
-- ----------------------------------------------------------------------------

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.class_sessions(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  -- Gegenereerde UTC-datum voor de per-dag unique-constraint op
  -- vrij-trainen check-ins. Postgres' `::date` cast op timestamptz is
  -- niet IMMUTABLE (afhankelijk van session-tz), maar een generated
  -- kolom die fresh berekent-en-opslaat is wél indexeerbaar.
  checked_in_date date generated always as (
    (checked_in_at at time zone 'UTC')::date
  ) stored,
  -- NULL = self check-in (auth.uid() == profile_id impliciet); anders
  -- de admin/trainer die iemand anders heeft ingecheckt.
  checked_in_by uuid references public.profiles(id) on delete set null,
  check_in_method text not null check (check_in_method in (
    'self_tablet',   -- lid tikte eigen identifier op studio-tablet
    'admin_tablet',  -- Marlon/team checkte iemand in via admin-modus
    'admin_web'      -- fallback: admin-UI op eigen laptop (tablet offline)
  )),
  access_type text not null check (access_type in (
    'membership',
    'guest_pass',
    'credit',
    'drop_in',
    'trial',
    'comp'
  )),
  pillar text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index check_ins_profile_idx
  on public.check_ins(profile_id, checked_in_at desc);
create index check_ins_session_idx on public.check_ins(session_id);
create index check_ins_pillar_idx
  on public.check_ins(pillar, checked_in_at desc);
-- Voorkom dubbele check-in per lid per sessie.
create unique index check_ins_unique_per_session
  on public.check_ins(session_id, profile_id)
  where session_id is not null;
-- Voor vrij-trainen (session_id null): max één check-in per dag per
-- pillar per persoon. Gebruikt de gegenereerde checked_in_date kolom
-- zodat de index IMMUTABLE-safe is.
create unique index check_ins_unique_per_day
  on public.check_ins(profile_id, checked_in_date, pillar)
  where session_id is null;

alter table public.check_ins enable row level security;

-- Leden zien eigen check-ins
create policy check_ins_self_read on public.check_ins
  for select using (profile_id = auth.uid());

-- Admin zien alles + kunnen undo/corrigeren
create policy check_ins_admin_all on public.check_ins
  for all using (public.is_admin()) with check (public.is_admin());

-- Trainers zien check-ins voor hun eigen sessies
create policy check_ins_trainer_read on public.check_ins
  for select using (
    public.is_trainer()
    and session_id in (
      select cs.id from public.class_sessions cs
      join public.trainers t on t.id = cs.trainer_id
      where t.profile_id = auth.uid()
    )
  );

-- Inserts + updates gaan via server actions (service-role) — geen
-- direct client-write policies nodig. Dit houdt tablet-kiosk secure:
-- zelf de anon-key hebben geeft geen insert-rechten.

-- ----------------------------------------------------------------------------
-- 4. booking_settings uitbreiden — check-in knoppen + pin
-- ----------------------------------------------------------------------------

alter table public.booking_settings
  add column if not exists check_in_enabled boolean not null default true,
  add column if not exists check_in_pillars text[] not null default
    array['yoga_mobility','kettlebell','vrij_trainen']::text[],
  add column if not exists check_in_required_for_cap boolean not null default true,
  add column if not exists no_show_release_minutes integer not null default 10,
  -- Bcrypt-hash van team-gedeelde admin PIN. Null = geen PIN gezet,
  -- tablet admin-modus dan niet bereikbaar tot Marlon 'em instelt.
  add column if not exists admin_checkin_pin_hash text;

comment on column public.booking_settings.check_in_pillars is
  'Pillars waarop check-in-based cap-telling actief is. Niet-genoemde pillars blijven op booking-based cap.';
comment on column public.booking_settings.admin_checkin_pin_hash is
  'Bcrypt hash van gedeelde team-PIN voor tablet admin-modus. NULL = admin-modus geblokkeerd.';

-- ----------------------------------------------------------------------------
-- 5. RPC: set_admin_checkin_pin — hash een klar-PIN via pgcrypto.
-- Wordt door admin-UI aangeroepen; direct schrijven op het hash-veld
-- kan ook via RLS maar dan is de hash-keten niet afgedwongen.
-- ----------------------------------------------------------------------------

create or replace function public.set_admin_checkin_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN moet 4-6 cijfers zijn';
  end if;
  update public.booking_settings
  set admin_checkin_pin_hash = crypt(p_pin, gen_salt('bf'))
  where id = 'singleton';
end;
$$;

-- RPC: verify_admin_checkin_pin — gebruikt door tablet om admin-modus
-- te ontgrendelen. Geeft alleen boolean terug, lekt geen hash.
create or replace function public.verify_admin_checkin_pin(p_pin text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  stored_hash text;
begin
  select admin_checkin_pin_hash into stored_hash
  from public.booking_settings where id = 'singleton';
  if stored_hash is null then
    return false;
  end if;
  return stored_hash = crypt(p_pin, stored_hash);
end;
$$;

grant execute on function public.set_admin_checkin_pin(text) to authenticated;
grant execute on function public.verify_admin_checkin_pin(text) to anon, authenticated;
