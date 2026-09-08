-- 20260908000000_akiles_access.sql
--
-- feat/akiles-access-backend (spec-akiles-access.md, PR 1 van 2). Twee
-- tabellen voor de koppeling met Akiles, beide uitsluitend voor de
-- service-role: RLS aan zonder enig policy, grants voor anon en
-- authenticated ingetrokken (patroon 20260815000000, checkin_pin_attempts).
--
--   1. tmc.access_credentials: per profiel de Akiles-ids (member, pin,
--      magic link), de toegekende groep, de einddatum die in Akiles staat
--      en de laatste syncstatus. De PIN en de magic link zelf worden NOOIT
--      opgeslagen; onthullen loopt on demand via de Akiles-API
--      (src/lib/access/reveal.ts).
--   2. tmc.access_config: single-row met vaste uuid, hier geseed. Bevat de
--      noodrem (lockdown) en de ids van de schedules en member groups die
--      de sync in Akiles provisiont. Admin leest via het bestaande
--      service-role-adminpad; de vlag zelf wordt via een server action gezet.
--
-- Replay: geen enkele afhankelijkheid van app-data. De seed van access_config
-- is een vaste rij met on conflict do nothing; de FK naar profiles is de
-- enige externe verwijzing en die tabel bestaat sinds de baseline.

begin;

-- ===========================================================================
-- 1. access_credentials
-- ===========================================================================

create table if not exists tmc.access_credentials (
  profile_id uuid primary key references tmc.profiles(id) on delete cascade,
  akiles_member_id text,
  akiles_pin_id text,
  akiles_magic_link_id text,
  access_group text,
  access_ends_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_credentials_group_check
    check (access_group is null or access_group in ('standard', 'extended', 'staff'))
);

comment on table tmc.access_credentials is
  'Koppeling profiel <-> Akiles-member (spec-akiles-access.md). Alleen ids: de PIN en de magic link staan uitsluitend bij Akiles en worden on demand onthuld. Schrijven uitsluitend via service-role (src/lib/access/sync.ts); geen policies, RLS aan als slot voor niet-service-rollen.';
comment on column tmc.access_credentials.akiles_member_id is
  'Akiles member-id. Blijft staan na opzegging (spoor); bij heraanmelding krijgt dezelfde member een nieuwe PIN.';
comment on column tmc.access_credentials.akiles_pin_id is
  'Id van de actieve Akiles-PIN. NULL zodra de toegang is ingetrokken (PIN verwijderd in Akiles).';
comment on column tmc.access_credentials.akiles_magic_link_id is
  'Id van de Akiles magic link (Wallet-pas). Blijft staan; toegang wordt via member.ends_at en de PIN geregeld.';
comment on column tmc.access_credentials.access_group is
  'Toegekende Akiles-groep: standard (openingstijden), extended (06:00-23:00) of staff (24 uur). NULL als de toegang uit staat.';
comment on column tmc.access_credentials.access_ends_at is
  'Waarde van member.ends_at zoals laatst naar Akiles geschreven. Harde datum (opzegging, pauze) of het rollende venster van zeven dagen; in het verleden betekent ingetrokken.';
comment on column tmc.access_credentials.last_error is
  'Laatste syncfout voor dit profiel; NULL na een geslaagde run. Gevuld door de cron sync-akiles-access.';

alter table tmc.access_credentials enable row level security;

revoke all on table tmc.access_credentials from public, anon, authenticated;
grant all on table tmc.access_credentials to service_role;

-- ===========================================================================
-- 2. access_config (single-row)
-- ===========================================================================

create table if not exists tmc.access_config (
  id uuid primary key,
  lockdown boolean not null default false,
  schedule_standard_id text,
  schedule_extended_id text,
  schedule_closed_id text,
  schedule_staff_id text,
  group_standard_id text,
  group_extended_id text,
  group_staff_id text,
  updated_at timestamptz not null default now(),
  constraint access_config_singleton
    check (id = 'a0000000-0000-4000-8000-000000000001'::uuid)
);

comment on table tmc.access_config is
  'Single-row configuratie van de Akiles-koppeling (id vast, zie ACCESS_CONFIG_ID in src/lib/access/constants.ts). lockdown = noodrem: beide ledengroepen wijzen naar het gesloten schedule, staf houdt toegang. De id-kolommen worden door de sync gevuld en bijgehouden. Schrijven uitsluitend via service-role; geen policies.';
comment on column tmc.access_config.lockdown is
  'Noodrem. True: beide ledengroepen in Akiles wijzen naar het gesloten schedule. Gezet via setAccessLockdown (server action, admin-only); de nachtelijke sync leest dezelfde vlag.';
comment on column tmc.access_config.schedule_standard_id is
  'Akiles schedule-id, gegenereerd uit tmc.opening_hours en elke run bijgepatcht.';
comment on column tmc.access_config.schedule_extended_id is
  'Akiles schedule-id voor verlengde toegang (venster in src/lib/access/constants.ts, alle zeven dagen).';
comment on column tmc.access_config.schedule_closed_id is
  'Akiles schedule-id zonder enige range; doel van de noodrem.';
comment on column tmc.access_config.schedule_staff_id is
  'Akiles schedule-id voor staf: 24 uur, alle zeven dagen.';

insert into tmc.access_config (id)
values ('a0000000-0000-4000-8000-000000000001'::uuid)
on conflict (id) do nothing;

alter table tmc.access_config enable row level security;

revoke all on table tmc.access_config from public, anon, authenticated;
grant all on table tmc.access_config to service_role;

-- ===========================================================================
-- 3. Zelfcontrole (geen app-data nodig)
-- ===========================================================================

do $$
declare
  v_rows int;
begin
  select count(*) into v_rows from tmc.access_config;
  if v_rows <> 1 then
    raise exception 'akiles_access: access_config bevat % rijen, verwacht 1', v_rows;
  end if;

  if has_table_privilege('anon', 'tmc.access_credentials', 'select')
     or has_table_privilege('authenticated', 'tmc.access_credentials', 'select')
     or has_table_privilege('anon', 'tmc.access_config', 'select')
     or has_table_privilege('authenticated', 'tmc.access_config', 'select') then
    raise exception 'akiles_access: anon/authenticated hebben nog leesrechten op de toegangstabellen';
  end if;

  if not (has_table_privilege('service_role', 'tmc.access_credentials', 'insert')
          and has_table_privilege('service_role', 'tmc.access_credentials', 'update')
          and has_table_privilege('service_role', 'tmc.access_config', 'update')) then
    raise exception 'akiles_access: service_role mist schrijfrechten op de toegangstabellen';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'tmc' and tablename in ('access_credentials', 'access_config')
  ) then
    raise exception 'akiles_access: er staan onverwacht policies op de toegangstabellen';
  end if;
end $$;

commit;
