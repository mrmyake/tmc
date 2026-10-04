-- Proefles-aanvragen (terugbelkaart op /proefles): een rij per inzending,
-- zodat Marlon zonder MailerLite ziet wie zich heeft aangemeld. Schrijven
-- uitsluitend via service_role (de route /api/proefles); de admin-cockpit
-- leest en bewerkt ook via service_role. De is_admin()-policies zijn een
-- tweede slot, zoals trial_codes. Geen nieuwe functies, dus README-regel 7
-- (expliciete function-grants) is hier niet van toepassing.
--
-- Dit wordt later de "bel me liever"-tak van de proefles-keuze
-- (spec-community-growth.md par. 1). Geen koppeling met trial_bookings.
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd.

create table tmc.trial_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  preference text,
  experience text,
  message text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'booked', 'lost')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table tmc.trial_requests is
  'Terugbelaanvragen van /proefles (kaart Liever gebeld worden). Schrijven uitsluitend via service_role vanuit /api/proefles; status en notes door admins in de cockpit. Geen koppeling met trial_bookings.';
comment on column tmc.trial_requests.preference is
  'Vrije tekst uit het veld Voorkeur dag of tijd.';
comment on column tmc.trial_requests.experience is
  'Zoals het formulier het stuurt (beginner, gemiddeld, gevorderd); bewust zonder constraint, een onverwachte waarde mag de aanvraag niet laten falen.';
comment on column tmc.trial_requests.notes is
  'Interne notitie van de admin, niet zichtbaar voor de bezoeker.';

create index trial_requests_created_at_idx
  on tmc.trial_requests (created_at desc);

create trigger trial_requests_touch_updated_at
  before update on tmc.trial_requests
  for each row execute function tmc.touch_updated_at();

-- Zelfde grant-model als trial_codes: uitsluitend service_role, plus RLS
-- met admin-policies als tweede laag. Geen insert-policy: de route schrijft
-- met de service-role client.
revoke all on table tmc.trial_requests from public, anon, authenticated;
grant all on table tmc.trial_requests to service_role;

alter table tmc.trial_requests enable row level security;

create policy trial_requests_admin_select on tmc.trial_requests
  for select using (tmc.is_admin());

create policy trial_requests_admin_update on tmc.trial_requests
  for update using (tmc.is_admin()) with check (tmc.is_admin());

-- Zelfcontrole: geen enkele grant voor anon, authenticated of PUBLIC.
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'tmc' and table_name = 'trial_requests'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'trial_requests: onverwachte grant voor anon/authenticated/PUBLIC';
  end if;
end $$;
