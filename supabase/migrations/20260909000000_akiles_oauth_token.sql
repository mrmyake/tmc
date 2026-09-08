-- 20260909000000_akiles_oauth_token.sql
--
-- feat/akiles-oauth (spec-akiles-access.md). Akiles' legacy API key is per
-- 25 november 2025 gestopt en wordt niet meer uitgegeven; de enige werkende
-- weg is OAuth 2.0 authorization_code met een roterend refresh token. Deze
-- single-row tabel bewaart het huidige access token, zijn vervaltijd en het
-- meest recente refresh token. Elke verversing levert een NIEUW refresh
-- token op en het oude is daarna niet gegarandeerd bruikbaar, dus
-- verversen mag nooit gelijktijdig: refresh_claim_until is de lease die dat
-- afdwingt (een atomische conditional UPDATE vanuit src/lib/akiles.ts).
--
-- Zelfde lijn als 20260908000000 (access_credentials, access_config):
-- uitsluitend service-role, RLS aan zonder enig policy. Geen seed van
-- tokenwaarden; de rij ontstaat leeg en wordt gevuld door de eenmalige
-- autorisatie via /api/akiles/oauth/start.
--
-- Replay: geen enkele afhankelijkheid van app-data.

begin;

create table if not exists tmc.akiles_oauth_token (
  id uuid primary key,
  access_token text,
  access_token_expires_at timestamptz,
  refresh_token text,
  refresh_claim_until timestamptz,
  last_refreshed_at timestamptz,
  last_refresh_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint akiles_oauth_token_singleton
    check (id = 'a0000000-0000-4000-8000-000000000002'::uuid)
);

comment on table tmc.akiles_oauth_token is
  'Single-row OAuth-tokenopslag voor Akiles (id vast, zie AKILES_TOKEN_ID in src/lib/access/constants.ts). Gevuld door de eenmalige autorisatie (/api/akiles/oauth/callback), daarna ververst door getAccessToken() in src/lib/akiles.ts. Schrijven uitsluitend via service-role; geen policies, RLS aan als slot voor niet-service-rollen. Tokenwaarden worden nergens gelogd.';
comment on column tmc.akiles_oauth_token.access_token is
  'Huidig bearer access token (circa een uur geldig). NULL tot de eerste autorisatie.';
comment on column tmc.akiles_oauth_token.access_token_expires_at is
  'Vervalmoment van access_token; getAccessToken() ververst zodra er minder dan tien minuten resteert.';
comment on column tmc.akiles_oauth_token.refresh_token is
  'Meest recente refresh token. Roteert bij elke verversing; het vorige is daarna niet gegarandeerd bruikbaar.';
comment on column tmc.akiles_oauth_token.refresh_claim_until is
  'Lease op de verversing: gezet (nu plus 30 s) door de invocatie die de claim won. Een verlopen lease mag door de volgende invocatie worden overgenomen. NULL als er geen verversing loopt.';
comment on column tmc.akiles_oauth_token.last_refresh_error is
  'Laatste foutmelding van een mislukte verversing (zonder tokenwaarden); NULL na een geslaagde.';

insert into tmc.akiles_oauth_token (id)
values ('a0000000-0000-4000-8000-000000000002'::uuid)
on conflict (id) do nothing;

alter table tmc.akiles_oauth_token enable row level security;

revoke all on table tmc.akiles_oauth_token from public, anon, authenticated;
grant all on table tmc.akiles_oauth_token to service_role;

do $$
declare
  v_rows int;
begin
  select count(*) into v_rows from tmc.akiles_oauth_token;
  if v_rows <> 1 then
    raise exception 'akiles_oauth_token: % rijen, verwacht 1', v_rows;
  end if;

  if has_table_privilege('anon', 'tmc.akiles_oauth_token', 'select')
     or has_table_privilege('authenticated', 'tmc.akiles_oauth_token', 'select')
     or has_table_privilege('anon', 'tmc.akiles_oauth_token', 'update')
     or has_table_privilege('authenticated', 'tmc.akiles_oauth_token', 'update') then
    raise exception 'akiles_oauth_token: anon/authenticated hebben nog rechten op de tokentabel';
  end if;

  if not (has_table_privilege('service_role', 'tmc.akiles_oauth_token', 'select')
          and has_table_privilege('service_role', 'tmc.akiles_oauth_token', 'update')) then
    raise exception 'akiles_oauth_token: service_role mist rechten op de tokentabel';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'tmc' and tablename = 'akiles_oauth_token'
  ) then
    raise exception 'akiles_oauth_token: er staan onverwacht policies op de tokentabel';
  end if;
end $$;

commit;
