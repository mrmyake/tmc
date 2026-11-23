-- 20261123120000_akiles_webhook_events.sql
--
-- feat/akiles-pin-push (spec-akiles-access.md, sectie "Melding bij
-- pincodegebruik"). De route /api/webhooks/akiles stuurt een ntfy-push
-- zodra iemand een pincode gebruikt op de PinPad. Akiles herhaalt een
-- mislukte levering tot een uur lang, dus hetzelfde event kan meerdere
-- keren binnenkomen. Deze tabel is de dedupe-sleutel: de route doet een
-- insert op event_id met "on conflict do nothing" en alleen de aanroep die
-- de rij aanmaakt, pusht (src/lib/access/pin-webhook-core.ts).
--
-- Waarom niet tmc.events: die tabel heeft geen unieke sleutel op de
-- payload, en emitEvent slikt elke fout, dus een conflict is daar niet van
-- een storing te onderscheiden.
--
-- Alleen events die de selectie doorstaan (verb use, object.type
-- gadget_action, access_method pin) krijgen een rij. Geen naam, geen
-- profiel, geen pincode: uitsluitend het Akiles-event-id en tijdstippen.
--
-- Zelfde lijn als 20260908000000 (access_credentials) en 20260909000000
-- (akiles_oauth_token): uitsluitend service-role, RLS aan zonder policies.
--
-- Replay: geen enkele afhankelijkheid van app-data.

begin;

create table if not exists tmc.akiles_webhook_events (
  event_id text primary key,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  notified boolean not null default false
);

comment on table tmc.akiles_webhook_events is
  'Dedupe van Akiles-webhookevents voor de pincode-push (spec-akiles-access.md). Een rij per verwerkt pin-event; de primaire sleutel op het Akiles-event-id zorgt dat een herhaalde levering geen tweede push geeft. Schrijven uitsluitend via service-role (src/app/api/webhooks/akiles/route.ts); geen policies, RLS aan als slot voor niet-service-rollen.';
comment on column tmc.akiles_webhook_events.event_id is
  'Akiles event-id (evt_...).';
comment on column tmc.akiles_webhook_events.occurred_at is
  'Moment waarop de code aan de deur is gebruikt (occurred_at van het event); kan voor received_at liggen als het apparaat offline was.';
comment on column tmc.akiles_webhook_events.received_at is
  'Moment waarop de eerste levering van dit event is verwerkt.';
comment on column tmc.akiles_webhook_events.notified is
  'True zodra ntfy de push heeft geaccepteerd. False betekent: geclaimd maar niet verstuurd; er komt geen tweede poging (at-most-once).';

alter table tmc.akiles_webhook_events enable row level security;

revoke all on table tmc.akiles_webhook_events from public, anon, authenticated;
grant all on table tmc.akiles_webhook_events to service_role;

do $$
begin
  if has_table_privilege('anon', 'tmc.akiles_webhook_events', 'select')
     or has_table_privilege('authenticated', 'tmc.akiles_webhook_events', 'select')
     or has_table_privilege('anon', 'tmc.akiles_webhook_events', 'insert')
     or has_table_privilege('authenticated', 'tmc.akiles_webhook_events', 'insert') then
    raise exception 'akiles_webhook_events: anon/authenticated hebben nog rechten op de tabel';
  end if;

  if not (has_table_privilege('service_role', 'tmc.akiles_webhook_events', 'select')
          and has_table_privilege('service_role', 'tmc.akiles_webhook_events', 'insert')
          and has_table_privilege('service_role', 'tmc.akiles_webhook_events', 'update')) then
    raise exception 'akiles_webhook_events: service_role mist rechten op de tabel';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'tmc.akiles_webhook_events'::regclass) then
    raise exception 'akiles_webhook_events: RLS staat niet aan';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'tmc' and tablename = 'akiles_webhook_events'
  ) then
    raise exception 'akiles_webhook_events: er staan onverwacht policies op de tabel';
  end if;
end $$;

commit;
