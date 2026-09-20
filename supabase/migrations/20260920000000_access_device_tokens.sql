-- 20260920000000_access_device_tokens.sql
--
-- feat/akiles-device-tokens (spec-akiles-access.md, workstream E1 uit
-- spec-ios-app.md en discovery-akiles-app-toegang.md sectie 5). Per-device
-- member tokens van Akiles voor de ledenapp, naast het bestaande PIN- en
-- magic-link-model dat ongewijzigd blijft.
--
-- Een rij per uitgegeven Akiles member token (object member_token, prefix
-- mt_). Alleen het Akiles-id van het token staat hier; de tokenwaarde zelf
-- gaat een keer naar het toestel en wordt nergens opgeslagen of gelogd,
-- zelfde discipline als de PIN en de magic link in access_credentials.
--
-- RLS: self-read (het ledenscherm toont de eigen toestellen), admin-all
-- (tmc.is_admin(), voor het latere admintabblad Toegang), en schrijven
-- uitsluitend via service-role. Dat laatste is bewust anders dan
-- device_push_tokens (self-insert/self-delete): elke schrijfactie op deze
-- tabel heeft een Akiles-call als bijwerking (aanmaken of verwijderen bij
-- Akiles), en een rij die een lid zelf zou invoegen of wissen verandert
-- niets bij Akiles. De grants zijn het slot: authenticated krijgt alleen
-- select, dus ook de admin-policy geeft in de praktijk alleen leesrecht.
--
-- De FK-cascade op profiles is bewust GEEN intrekmechanisme: een gewiste
-- rij trekt niets in bij Akiles. deleteMember roept daarom eerst de sync
-- aan (die de tokens bij Akiles verwijdert) en pas daarna de hard-delete.
--
-- Replay: geen enkele afhankelijkheid van app-data. De FK naar profiles en
-- de trigger-functie tmc.touch_updated_at bestaan sinds de baseline.

begin;

create table if not exists tmc.access_device_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references tmc.profiles(id) on delete cascade,
  akiles_member_id text not null,
  akiles_token_id text not null,
  platform text not null,
  device_label text,
  issued_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoke_requested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_device_tokens_token_key unique (akiles_token_id),
  constraint access_device_tokens_platform_check
    check (platform in ('ios', 'android'))
);

comment on table tmc.access_device_tokens is
  'Per-device Akiles member tokens voor de ledenapp (spec-akiles-access.md, E1). Alleen het Akiles-token-id: de tokenwaarde gaat een keer naar het toestel en wordt nergens opgeslagen. Schrijven uitsluitend via service-role (src/lib/access/device-tokens.ts en de sync); self-read en admin-all zijn leesrechten. De FK-cascade trekt niets in bij Akiles.';
comment on column tmc.access_device_tokens.akiles_member_id is
  'Akiles member-id waaronder het token is aangemaakt. Na heraanmelding kan access_credentials een nieuwe member hebben; tokens van een oude member zijn dan per definitie dood.';
comment on column tmc.access_device_tokens.akiles_token_id is
  'Id van het Akiles member_token (mt_...). Nooit de tokenwaarde.';
comment on column tmc.access_device_tokens.device_label is
  'Vrij label uit de app (model plus OS-versie) voor herkenning op het ledenscherm. Geen toestel-identifier van Apple of Google.';
comment on column tmc.access_device_tokens.last_seen_at is
  'Laatste moment waarop het toestel zich bij ons meldde; bij uitgifte gelijk aan issued_at. Het ledenscherm (E3) werkt dit bij bij app-open.';
comment on column tmc.access_device_tokens.revoked_at is
  'Gezet zodra het token bij Akiles verwijderd is (of daar al weg was). NULL betekent: token geldig zolang de member toegang heeft.';
comment on column tmc.access_device_tokens.revoke_requested_at is
  'Gezet als de intrekking is aangevraagd (logout, intrekking) maar de Akiles-call faalde. De nachtelijke sync probeert het opnieuw tot revoked_at gevuld is.';
comment on column tmc.access_device_tokens.last_error is
  'Laatste Akiles-fout bij intrekken; NULL na een geslaagde poging.';

create index if not exists access_device_tokens_profile_idx
  on tmc.access_device_tokens (profile_id);

-- Partiele index voor de nachtelijke retry: alleen rijen die nog open staan.
create index if not exists access_device_tokens_pending_revoke_idx
  on tmc.access_device_tokens (revoke_requested_at)
  where revoked_at is null and revoke_requested_at is not null;

drop trigger if exists access_device_tokens_touch_updated_at on tmc.access_device_tokens;
create trigger access_device_tokens_touch_updated_at
  before update on tmc.access_device_tokens
  for each row execute function tmc.touch_updated_at();

alter table tmc.access_device_tokens enable row level security;

drop policy if exists access_device_tokens_self_read on tmc.access_device_tokens;
create policy access_device_tokens_self_read
  on tmc.access_device_tokens
  for select
  using (profile_id = auth.uid());

drop policy if exists access_device_tokens_admin_all on tmc.access_device_tokens;
create policy access_device_tokens_admin_all
  on tmc.access_device_tokens
  using (tmc.is_admin())
  with check (tmc.is_admin());

revoke all on table tmc.access_device_tokens from public, anon, authenticated;
grant select on table tmc.access_device_tokens to authenticated;
grant all on table tmc.access_device_tokens to service_role;

-- ===========================================================================
-- Zelfcontrole (geen app-data nodig)
-- ===========================================================================

do $$
begin
  if not has_table_privilege('authenticated', 'tmc.access_device_tokens', 'select') then
    raise exception 'access_device_tokens: authenticated mist select (self-read via RLS werkt dan niet)';
  end if;

  if has_table_privilege('anon', 'tmc.access_device_tokens', 'select')
     or has_table_privilege('authenticated', 'tmc.access_device_tokens', 'insert')
     or has_table_privilege('authenticated', 'tmc.access_device_tokens', 'update')
     or has_table_privilege('authenticated', 'tmc.access_device_tokens', 'delete') then
    raise exception 'access_device_tokens: anon of authenticated heeft rechten die de service-role-only schrijfregel breken';
  end if;

  if not (has_table_privilege('service_role', 'tmc.access_device_tokens', 'insert')
          and has_table_privilege('service_role', 'tmc.access_device_tokens', 'update')
          and has_table_privilege('service_role', 'tmc.access_device_tokens', 'delete')) then
    raise exception 'access_device_tokens: service_role mist schrijfrechten';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'tmc' and tablename = 'access_device_tokens'
        and policyname in ('access_device_tokens_self_read', 'access_device_tokens_admin_all')) <> 2 then
    raise exception 'access_device_tokens: verwacht precies de policies self_read en admin_all';
  end if;
end $$;

commit;
