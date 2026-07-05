-- Fase 2 (Capacitor-app) — device-tokens voor native push-notificaties.
-- Losstaand van MailerLite/MailerSend (die blijven puur e-mail); dit is
-- het nieuwe kanaal voor de native iOS/Android-app via Firebase Cloud
-- Messaging (zie PR3/PR4-beschrijving).
--
-- Eén profile kan meerdere tokens hebben (meerdere devices). `token` is
-- uniek: een device-token identificeert één specifieke app-installatie,
-- dus een upsert-op-token-conflict (insert ... on conflict (token) do
-- update) is het juiste patroon bij token-rotatie/herinstallatie — geen
-- losse self-update-policy nodig buiten die upsert-flow.
--
-- RLS is hier bewust een gewone self-scoped policy-set, niet een RPC
-- zoals bij bookings/memberships: er zit geen business-invariant te
-- beschermen (geen prijs, geen capaciteit, geen credits) — alleen
-- eigenaarschap. Server-side verzenden (PR4) loopt via de service-role
-- admin-client en omzeilt RLS sowieso, zoals de rest van dit schema.
create table tmc.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references tmc.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index device_push_tokens_profile_idx on tmc.device_push_tokens(profile_id);

create trigger device_push_tokens_touch_updated_at
  before update on tmc.device_push_tokens
  for each row execute function tmc.touch_updated_at();

alter table tmc.device_push_tokens enable row level security;

create policy device_push_tokens_self_read on tmc.device_push_tokens
  for select using (profile_id = auth.uid());

create policy device_push_tokens_self_insert on tmc.device_push_tokens
  for insert with check (profile_id = auth.uid());

create policy device_push_tokens_self_update on tmc.device_push_tokens
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Self-delete: het token verwijderen hoort bij "uitloggen op dit device"
-- (geen ongewenste pushes meer naar een uitgelogde sessie).
create policy device_push_tokens_self_delete on tmc.device_push_tokens
  for delete using (profile_id = auth.uid());

create policy device_push_tokens_admin_all on tmc.device_push_tokens
  for all using (tmc.is_admin()) with check (tmc.is_admin());

-- Expliciete grants — bevestigd tijdens toepassen dat een nieuwe tabel in
-- dit schema GEEN automatische grant naar authenticated krijgt (in
-- tegenstelling tot de brede default EXECUTE-grant op nieuwe functies,
-- zie eerdere migraties). Zonder deze grants blokkeert Postgres alle
-- toegang vóórdat RLS-policies zelfs geëvalueerd worden. Alleen
-- authenticated — anon heeft nooit een reden om devicetokens te
-- registreren.
grant select, insert, update, delete on tmc.device_push_tokens to authenticated;
