-- PR4 — Event foundation.
--
-- Append-only domein-event log. Elke betekenisvolle gebeurtenis wordt additief
-- vastgelegd zodat een latere daily briefing of agent kan aanhaken zonder de
-- bestaande mutations te herschrijven. Puur fundament: niets in de UI of de
-- business-logica verandert hierdoor.
--
-- Toegang:
--   * schrijven  : alleen via de service-role (geen insert-policy; service-role
--                  bypasst RLS). emitEvent() is de enige schrijver.
--   * lezen      : alleen admins (select-policy).
--   * update/delete: voor IEDEREEN geblokkeerd via trigger. RLS alleen volstaat
--                  niet omdat de service-role RLS omzeilt; de trigger dicht dat
--                  gat en maakt de tabel echt immutable.
--
-- LET OP (schema): de data leeft in het `tmc`-schema van het geconsolideerde
-- Supabase-project. Alles hier is expliciet `tmc.`-gekwalificeerd. De
-- historische migraties schreven `public.` (van voor de schema-consolidatie);
-- voor een nieuwe tabel zou `public.` in het verkeerde schema landen.
--
-- actor_id en subject_id zijn BEWUST kale uuids zonder foreign key: een
-- append-only log bewaart een historische referentie naar wie/wat, niet een
-- levende relatie. Een FK met `on delete set null` zou bovendien de append-only
-- update-trigger triggeren bij profiel-verwijdering en die delete blokkeren.

create table if not exists tmc.events (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  actor_type   text not null
    check (actor_type in ('member', 'admin', 'trainer', 'system', 'tablet')),
  actor_id     uuid,
  subject_type text,
  subject_id   uuid,
  created_at   timestamptz not null default now()
);

comment on table tmc.events is
  'Append-only domein-event log (PR4). Schrijven uitsluitend via service-role, lezen alleen admin, update/delete geblokkeerd via trigger. actor_id/subject_id zijn FK-loze historische referenties.';
comment on column tmc.events.type is
  'Event-naam in dot-notatie, bv. booking.created, payment.failed.';
comment on column tmc.events.payload is
  'Minimale payload: id''s, enums en timestamps. Geen PII. Voor payment.* events staat de Mollie payment-id op payload.dedupe_key voor dedupe-bij-lezen.';

create index if not exists events_type_created_idx
  on tmc.events (type, created_at desc);
create index if not exists events_subject_idx
  on tmc.events (subject_type, subject_id);
create index if not exists events_actor_idx
  on tmc.events (actor_id);
create index if not exists events_created_idx
  on tmc.events (created_at desc);

-- GIN op payload zodat containment-filters op afgesproken sleutels goedkoop
-- zijn, m.n. "alles van dit lid" (payload @> '{"profile_id": "..."}') en
-- "alles op deze sessie" (payload @> '{"session_id": "..."}'). Elke event die
-- een lid of sessie betreft zet die sleutels consistent in de payload.
create index if not exists events_payload_gin
  on tmc.events using gin (payload jsonb_path_ops);

-- Append-only guard: blokkeer UPDATE en DELETE voor iedereen, ook service-role.
create or replace function tmc.events_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'tmc.events is append-only: % is niet toegestaan', tg_op;
end;
$$;

drop trigger if exists events_no_update_delete on tmc.events;
create trigger events_no_update_delete
  before update or delete on tmc.events
  for each row execute function tmc.events_block_mutation();

-- RLS: geen insert/update/delete-policy (service-role schrijft, bypasst RLS).
-- Lezen alleen voor ingelogde admins.
alter table tmc.events enable row level security;

drop policy if exists events_admin_select on tmc.events;
create policy events_admin_select on tmc.events
  for select
  to authenticated
  using (
    exists (
      select 1
      from tmc.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
