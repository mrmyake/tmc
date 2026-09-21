-- 20260921100100_deletion_blocking_fks.sql
--
-- feat/account-deletion-schema (spec-ios-app.md workstream D.2; PR 1 uit de
-- discovery-accountverwijdering van 2026-09-21).
--
-- De discovery stelde vast dat een hard delete (auth.admin.deleteUser, via
-- de CASCADE van auth.users naar tmc.profiles) vandaag op een 23503 stukloopt
-- zodra een lid ooit iets kocht: orders.profile_id, invoices.profile_id en
-- admin_audit_log.admin_id verwijzen naar profiles zonder ON DELETE.
--
-- Wat hier verandert, en wat bewust niet:
--
-- 1. orders en invoices hebben elk TWEE profielvelden. profile_id is de
--    klant en draagt de order- en factuurhistorie (bewaarplicht 7 jaar,
--    AWR art. 52). Dat veld blijft NOT NULL en NO ACTION: de klant wordt
--    geanonimiseerd (tmc.anonymise_profile), nooit verwijderd.
--    created_by_profile_id is alleen herkomst: de admin die de order of de
--    conceptfactuur namens het lid aanmaakte. Dat veld was al nullable en
--    krijgt ON DELETE SET NULL. Twee bijwerkingen daarvan zijn hieronder
--    meegenomen: de provenance-check op orders en de onveranderlijkheids-
--    trigger op gefinaliseerde facturen zouden anders de SET NULL zelf
--    laten falen.
--
-- 2. admin_audit_log.admin_id blokkeert elke actor, inclusief het lid zelf:
--    requestAccountDeletion (src/lib/actions/profile.ts) schrijft de
--    aanvrager als admin_id. Het veld wordt NIET zomaar nullable: een
--    auditlog waarvan de actor kan verdwijnen is minder waard. Eerst komt
--    er een onveranderlijk tekstveld actor_label dat de actor vastlegt op
--    het moment van schrijven (staf: naam en rol; lid: 'lid <member_code>',
--    dus zonder persoonsgegevens die een latere anonimisering zou
--    overleven). Pas daarna gaat de FK naar ON DELETE SET NULL, zodat een
--    verdwenen verwijzing de regel leesbaar laat.
--
-- Replay: de backfill van actor_label draait over een lege tabel; geen
-- afhankelijkheid van app-data.

begin;

-- ===========================================================================
-- 1a. orders.created_by_profile_id: aanmaker, niet de klant.
-- ===========================================================================

alter table tmc.orders
  drop constraint if exists orders_created_by_profile_id_fkey;
alter table tmc.orders
  add constraint orders_created_by_profile_id_fkey
  foreign key (created_by_profile_id) references tmc.profiles(id)
  on delete set null;

-- De oude check ("created_by = 'admin'") = (created_by_profile_id is not null)
-- zou een SET NULL op een admin-order laten falen. De garantie verhuist
-- naar insert-tijd: een admin-order draagt bij aanmaak zijn aanmaker
-- (trigger), een self-order draagt er nooit een (check). Dat is dezelfde
-- regel als voorheen, alleen niet meer voor de levensduur van de rij.
alter table tmc.orders
  drop constraint if exists orders_admin_provenance_check;
alter table tmc.orders
  add constraint orders_self_no_creator_check
  check (created_by = 'admin' or created_by_profile_id is null);

create or replace function tmc.orders_require_admin_creator()
returns trigger
language plpgsql
set search_path to 'tmc', 'extensions'
as $$
begin
  if new.created_by = 'admin' and new.created_by_profile_id is null then
    raise exception 'Een admin-order draagt bij aanmaak altijd zijn aanmaker (created_by_profile_id).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_require_admin_creator on tmc.orders;
create trigger orders_require_admin_creator
  before insert on tmc.orders
  for each row execute function tmc.orders_require_admin_creator();

-- ===========================================================================
-- 1b. invoices.created_by_profile_id: aanmaker van het concept, niet de klant.
-- ===========================================================================

alter table tmc.invoices
  drop constraint if exists invoices_created_by_profile_id_fkey;
alter table tmc.invoices
  add constraint invoices_created_by_profile_id_fkey
  foreign key (created_by_profile_id) references tmc.profiles(id)
  on delete set null;

-- invoices_finalised_immutable (20260821000000_invoice_schema.sql) vergelijkt
-- op een gefinaliseerde rij de hele rij, op pdf_path, pdf_generated_at en
-- updated_at na. Een SET NULL op de aanmaker zou daar afketsen. De aanmaker
-- is herkomst, geen factuurinhoud (bill_to_*, bedragen, nummer, datum
-- blijven onveranderlijk): uitsluitend de wijziging van waarde naar null
-- wordt toegestaan. Definitie hieronder is de live definitie
-- (pg_get_functiondef, 2026-09-21) plus dat ene blok.
create or replace function tmc.invoices_finalised_immutable()
returns trigger
language plpgsql
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_old tmc.invoices := old;
  v_new tmc.invoices := new;
begin
  if old.status = 'draft' then
    return new;
  end if;

  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'pdf_path is write-once.' using errcode = 'P0001';
  end if;

  v_new.pdf_path := v_old.pdf_path;
  v_new.pdf_generated_at := v_old.pdf_generated_at;
  v_new.updated_at := v_old.updated_at;

  -- Aanmaker mag wegvallen (ON DELETE SET NULL), nooit veranderen.
  if new.created_by_profile_id is null then
    v_new.created_by_profile_id := v_old.created_by_profile_id;
  end if;

  if v_new is distinct from v_old then
    raise exception 'Gefinaliseerde factuur is onveranderlijk.' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

-- ===========================================================================
-- 2. admin_audit_log: actor als tekst vastleggen, daarna de FK versoepelen.
-- ===========================================================================

alter table tmc.admin_audit_log
  add column if not exists actor_label text;

comment on column tmc.admin_audit_log.actor_label is
  'Actor op het moment van schrijven, onveranderlijk. Staf: "Voornaam Achternaam (rol)". Lid (self-service): "lid <member_code>", bewust zonder naam of e-mail zodat anonimisering van het lid deze regel niet raakt. Blijft leesbaar als admin_id door SET NULL wegvalt.';

create or replace function tmc.audit_actor_label(p_profile_id uuid)
returns text
language sql
stable
set search_path to 'tmc', 'extensions'
as $$
  select case
    when p.role in ('admin', 'trainer')
      then trim(p.first_name || ' ' || p.last_name) || ' (' || p.role || ')'
    else 'lid ' || p.member_code
  end
  from tmc.profiles p
  where p.id = p_profile_id;
$$;

-- Backfill bestaande regels (lege tabel bij replay: no-op).
update tmc.admin_audit_log
set actor_label = coalesce(tmc.audit_actor_label(admin_id), 'onbekend (' || admin_id::text || ')')
where actor_label is null;

alter table tmc.admin_audit_log
  alter column actor_label set not null;

-- Bij insert invullen als de caller het weglaat; bij update nooit wijzigen.
create or replace function tmc.audit_actor_label_guard()
returns trigger
language plpgsql
set search_path to 'tmc', 'extensions'
as $$
begin
  if tg_op = 'INSERT' then
    if new.actor_label is null or btrim(new.actor_label) = '' then
      new.actor_label := coalesce(
        tmc.audit_actor_label(new.admin_id),
        'onbekend (' || coalesce(new.admin_id::text, 'geen id') || ')'
      );
    end if;
    return new;
  end if;

  if new.actor_label is distinct from old.actor_label then
    raise exception 'admin_audit_log.actor_label is onveranderlijk.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists admin_audit_log_actor_label_guard on tmc.admin_audit_log;
create trigger admin_audit_log_actor_label_guard
  before insert or update on tmc.admin_audit_log
  for each row execute function tmc.audit_actor_label_guard();

-- Nu pas: de verwijzing mag wegvallen, de tekst blijft.
alter table tmc.admin_audit_log
  alter column admin_id drop not null;
alter table tmc.admin_audit_log
  drop constraint if exists admin_audit_log_admin_id_fkey;
alter table tmc.admin_audit_log
  add constraint admin_audit_log_admin_id_fkey
  foreign key (admin_id) references tmc.profiles(id)
  on delete set null;

-- ===========================================================================
-- Zelfcontrole (geen app-data nodig)
-- ===========================================================================

do $$
declare
  v_deltype char;
begin
  select confdeltype into v_deltype from pg_constraint
    where conrelid = 'tmc.orders'::regclass and conname = 'orders_created_by_profile_id_fkey';
  if v_deltype is distinct from 'n' then
    raise exception 'orders.created_by_profile_id: verwacht ON DELETE SET NULL';
  end if;

  select confdeltype into v_deltype from pg_constraint
    where conrelid = 'tmc.orders'::regclass and conname = 'orders_profile_id_fkey';
  if v_deltype is distinct from 'a' then
    raise exception 'orders.profile_id: hoort NO ACTION te blijven (klant, factuurhistorie)';
  end if;

  if exists (select 1 from pg_constraint
      where conrelid = 'tmc.orders'::regclass and conname = 'orders_admin_provenance_check') then
    raise exception 'orders: oude provenance-check staat er nog';
  end if;
  if not exists (select 1 from pg_trigger
      where tgrelid = 'tmc.orders'::regclass and tgname = 'orders_require_admin_creator') then
    raise exception 'orders: insert-trigger orders_require_admin_creator ontbreekt';
  end if;

  select confdeltype into v_deltype from pg_constraint
    where conrelid = 'tmc.invoices'::regclass and conname = 'invoices_created_by_profile_id_fkey';
  if v_deltype is distinct from 'n' then
    raise exception 'invoices.created_by_profile_id: verwacht ON DELETE SET NULL';
  end if;

  select confdeltype into v_deltype from pg_constraint
    where conrelid = 'tmc.invoices'::regclass and conname = 'invoices_profile_id_fkey';
  if v_deltype is distinct from 'a' then
    raise exception 'invoices.profile_id: hoort NO ACTION te blijven (klant, bewaarplicht)';
  end if;

  if (select is_nullable from information_schema.columns
      where table_schema = 'tmc' and table_name = 'invoices' and column_name = 'profile_id') <> 'NO' then
    raise exception 'invoices.profile_id: hoort NOT NULL te blijven';
  end if;

  if (select is_nullable from information_schema.columns
      where table_schema = 'tmc' and table_name = 'admin_audit_log' and column_name = 'actor_label') <> 'NO' then
    raise exception 'admin_audit_log.actor_label: hoort NOT NULL te zijn';
  end if;
  if (select is_nullable from information_schema.columns
      where table_schema = 'tmc' and table_name = 'admin_audit_log' and column_name = 'admin_id') <> 'YES' then
    raise exception 'admin_audit_log.admin_id: hoort nullable te zijn';
  end if;

  select confdeltype into v_deltype from pg_constraint
    where conrelid = 'tmc.admin_audit_log'::regclass and conname = 'admin_audit_log_admin_id_fkey';
  if v_deltype is distinct from 'n' then
    raise exception 'admin_audit_log.admin_id: verwacht ON DELETE SET NULL';
  end if;

  if not exists (select 1 from pg_trigger
      where tgrelid = 'tmc.admin_audit_log'::regclass and tgname = 'admin_audit_log_actor_label_guard') then
    raise exception 'admin_audit_log: trigger actor_label_guard ontbreekt';
  end if;

  if exists (select 1 from tmc.admin_audit_log where actor_label is null) then
    raise exception 'admin_audit_log: backfill van actor_label onvolledig';
  end if;
end $$;

commit;
