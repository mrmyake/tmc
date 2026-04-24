-- Acquisition attribution op profiles — eerste-touch wint.
-- Wordt gevuld bij signup vanuit client-side UTM state (sessionStorage
-- via src/lib/utm.ts), doorgegeven via `raw_user_meta_data` in
-- supabase.auth.signInWithOtp() opties. De trigger
-- handle_new_auth_user kopieert ze dan naar de profiles-rij.
--
-- First-touch discipline: als een user later terugkomt via een andere
-- campagne behouden we de originele source (trigger doet ON CONFLICT
-- DO NOTHING — bestaande profiles worden nooit overschreven).

alter table public.profiles
  add column if not exists acquisition_source text,
  add column if not exists acquisition_medium text,
  add column if not exists acquisition_campaign text,
  add column if not exists acquisition_content text,
  add column if not exists signup_path text,
  add column if not exists first_touch_at timestamptz;

create index if not exists profiles_acquisition_source_idx
  on public.profiles(acquisition_source);
create index if not exists profiles_acquisition_campaign_idx
  on public.profiles(acquisition_campaign);
create index if not exists profiles_signup_path_idx
  on public.profiles(signup_path);

comment on column public.profiles.acquisition_source is
  'utm_source bij signup (instagram, google, mailerlite, direct, etc.)';
comment on column public.profiles.acquisition_medium is
  'utm_medium (social, cpc, email, referral, organic)';
comment on column public.profiles.acquisition_campaign is
  'utm_campaign (crowdfunding_launch, mobility_reset, welcome, etc.)';
comment on column public.profiles.acquisition_content is
  'utm_content — variant/placement binnen campagne';
comment on column public.profiles.signup_path is
  'Route waar de gebruiker inschreef (/proefles, /mobility-check, /login, ...)';
comment on column public.profiles.first_touch_at is
  'ISO timestamp van eerste pageview in de sessie waarin inschrijving plaatsvond';

-- ----------------------------------------------------------------------------
-- Update handle_new_auth_user zodat 'ie acquisition-velden uit
-- raw_user_meta_data kopieert. Vorige versie zette alleen first_name
-- en last_name.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
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
