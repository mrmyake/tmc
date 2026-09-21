-- 20260921100000_account_deletions.sql
--
-- feat/account-deletion-schema (spec-ios-app.md workstream D.2; PR 1 uit de
-- discovery-accountverwijdering van 2026-09-21). Alleen schema: de tabel die
-- een verwijderverzoek draagt van aanvraag tot purge. Geen flow, geen UI,
-- geen orchestratie; die komen in latere PR's.
--
-- Een rij per verwijderverzoek. De rij is de werklijst voor een cron die
-- stap voor stap de externe systemen bijwerkt (Mollie, Akiles, MailerLite,
-- push) en daarna het profiel anonimiseert (tmc.anonymise_profile). Omdat
-- die anonimisering de externe ids uit profiles wist en de FK-cascade de
-- rijen in access_credentials en access_device_tokens meeneemt bij een hard
-- delete, staan de ids hier als snapshot, genomen bij de aanvraag. Een stap
-- die later faalt kan zo altijd herkanst worden.
--
-- Stappen (sleutels in step_status en last_error, vastgelegd in PR 2):
--   freeze, mollie_subscription, akiles, mailerlite, push, profile,
--   confirmation_mail, mollie_customer.
--
-- RLS: self-read (het lid ziet de status van zijn eigen verzoek), admin-all
-- via tmc.is_admin(), schrijven uitsluitend via service-role. Elke stap
-- heeft een externe aanroep als bijwerking; een rij die een lid of admin
-- rechtstreeks zou invoegen of wijzigen zet niets in gang. Zelfde slot als
-- access_device_tokens: authenticated krijgt alleen select, dus ook de
-- admin-policy geeft in de praktijk alleen leesrecht.
--
-- Replay: geen afhankelijkheid van app-data. De FK naar profiles en de
-- trigger-functie tmc.touch_updated_at bestaan sinds de baseline.

begin;

create table if not exists tmc.account_deletions (
  id uuid primary key default gen_random_uuid(),

  -- Het profiel. SET NULL, niet CASCADE en niet NO ACTION: de rij moet de
  -- profielrij overleven (bewaartermijn van de Mollie-customer, bewijs van
  -- afhandeling richting AP) en mag een hard delete niet blokkeren.
  -- member_code is de pseudonieme sleutel die na anonimisering nog werkt.
  profile_id uuid references tmc.profiles(id) on delete set null,
  member_code text not null,

  status text not null default 'requested',
  requested_via text not null,
  reason text,
  is_test boolean not null default false,

  requested_at timestamptz not null default now(),
  purge_after timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,

  -- Snapshot bij aanvraag: externe ids die na anonimisering nergens meer
  -- te herleiden zijn, en het adres voor de afsluitmail.
  email_at_request text not null,
  akiles_member_id text,
  mollie_customer_id text,
  mollie_subscription_ids text[] not null default '{}',
  mailerlite_subscriber_id text,

  -- Voortgang en laatste fout per stap, sleutel = stapnaam.
  step_status jsonb not null default '{}'::jsonb,
  last_error jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_attempt_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint account_deletions_status_check
    check (status in ('requested', 'in_progress', 'blocked', 'completed', 'cancelled')),
  constraint account_deletions_requested_via_check
    check (requested_via in ('member_app', 'admin')),
  constraint account_deletions_terminal_check check (
    (status = 'completed') = (completed_at is not null)
    and (status = 'cancelled') = (cancelled_at is not null)
  ),
  constraint account_deletions_member_code_format
    check (member_code ~ '^[0-9]{6}$')
);

comment on table tmc.account_deletions is
  'Een rij per verwijderverzoek (Apple 5.1.1(v), AVG art. 17). Werklijst voor de purge-cron; snapshot van externe ids omdat anonimisering die uit profiles haalt. Schrijven alleen via service-role.';
comment on column tmc.account_deletions.profile_id is
  'SET NULL bij hard delete: de rij overleeft het profiel. Zoek daarna op member_code.';
comment on column tmc.account_deletions.status is
  'requested: aangevraagd, nog niets extern gedaan. in_progress: cron is bezig. blocked: een veiligheidspoort (open order, actieve toegang, lopend abonnement) houdt de purge tegen; mens nodig. completed / cancelled: eindtoestand.';
comment on column tmc.account_deletions.purge_after is
  'Vroegste moment van de profielstap. Bij een lopend abonnement: na de laatste factuur, omdat finalize_invoice de NAW uit profiles leest.';
comment on column tmc.account_deletions.email_at_request is
  'Adres voor de afsluitmail; na anonimisering staat het nergens anders meer. Wissen zodra die mail is verstuurd (stap confirmation_mail).';
comment on column tmc.account_deletions.mollie_customer_id is
  'Blijft staan tot de retentietermijn (13 maanden na de laatste incasso, SEPA-rulebook) is verstreken; dan customers.delete bij Mollie en dit veld leeg.';
comment on column tmc.account_deletions.mollie_subscription_ids is
  'Alle subscription-ids van de memberships van dit profiel op het moment van aanvraag; meestal een, kan meer zijn.';
comment on column tmc.account_deletions.step_status is
  'jsonb: stapnaam -> pending | done | failed | skipped. Sleutels zie header.';
comment on column tmc.account_deletions.last_error is
  'jsonb: stapnaam -> laatste foutmelding (tekst). Leeg na een geslaagde herkansing van die stap.';

-- Hooguit een open verzoek per profiel.
create unique index if not exists account_deletions_open_per_profile
  on tmc.account_deletions (profile_id)
  where status in ('requested', 'in_progress', 'blocked');

-- Werklijst voor de cron.
create index if not exists account_deletions_due_idx
  on tmc.account_deletions (purge_after)
  where status in ('requested', 'in_progress', 'blocked');

create index if not exists account_deletions_member_code_idx
  on tmc.account_deletions (member_code);

drop trigger if exists account_deletions_touch_updated_at on tmc.account_deletions;
create trigger account_deletions_touch_updated_at
  before update on tmc.account_deletions
  for each row execute function tmc.touch_updated_at();

alter table tmc.account_deletions enable row level security;

drop policy if exists account_deletions_self_read on tmc.account_deletions;
create policy account_deletions_self_read
  on tmc.account_deletions
  for select
  using (profile_id = auth.uid());

drop policy if exists account_deletions_admin_all on tmc.account_deletions;
create policy account_deletions_admin_all
  on tmc.account_deletions
  using (tmc.is_admin())
  with check (tmc.is_admin());

revoke all on table tmc.account_deletions from public, anon, authenticated;
grant select on table tmc.account_deletions to authenticated;
grant all on table tmc.account_deletions to service_role;

-- ===========================================================================
-- Zelfcontrole (geen app-data nodig)
-- ===========================================================================

do $$
begin
  if not has_table_privilege('authenticated', 'tmc.account_deletions', 'select') then
    raise exception 'account_deletions: authenticated mist select (self-read via RLS werkt dan niet)';
  end if;

  if has_table_privilege('anon', 'tmc.account_deletions', 'select')
     or has_table_privilege('authenticated', 'tmc.account_deletions', 'insert')
     or has_table_privilege('authenticated', 'tmc.account_deletions', 'update')
     or has_table_privilege('authenticated', 'tmc.account_deletions', 'delete') then
    raise exception 'account_deletions: anon of authenticated heeft rechten die de service-role-only schrijfregel breken';
  end if;

  if not (has_table_privilege('service_role', 'tmc.account_deletions', 'insert')
          and has_table_privilege('service_role', 'tmc.account_deletions', 'update')
          and has_table_privilege('service_role', 'tmc.account_deletions', 'delete')) then
    raise exception 'account_deletions: service_role mist schrijfrechten';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'tmc' and tablename = 'account_deletions'
        and policyname in ('account_deletions_self_read', 'account_deletions_admin_all')) <> 2 then
    raise exception 'account_deletions: verwacht precies de policies self_read en admin_all';
  end if;

  if (select confdeltype from pg_constraint
      where conrelid = 'tmc.account_deletions'::regclass
        and conname = 'account_deletions_profile_id_fkey') is distinct from 'n' then
    raise exception 'account_deletions: profile_id hoort ON DELETE SET NULL te zijn';
  end if;

  if not exists (select 1 from pg_indexes
      where schemaname = 'tmc' and tablename = 'account_deletions'
        and indexname = 'account_deletions_open_per_profile') then
    raise exception 'account_deletions: partiele unique index op open verzoeken ontbreekt';
  end if;
end $$;

commit;
