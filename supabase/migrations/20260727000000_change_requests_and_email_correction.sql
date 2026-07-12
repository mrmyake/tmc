-- Lifecycle-primitieven fase 2B: membership_change_requests (alleen-upgrade
-- op de volgende factuurdatum) en de directe e-mailcorrectie op een bestaand
-- account. Klantbeheer-workstream; fase 1 in 20260725, fase 2A in 20260726.
--
-- Beleid change-requests (hardcoded in deze laag, niet in de UI):
-- - ALLEEN-UPGRADE: de nieuwe recurring (catalogusprijs, berekend door de
--   bestaande tmc._compute_order_price) moet STRIKT hoger zijn dan de
--   huidige recurring van het membership. Downgraden bestaat niet via dit
--   pad. Geen proratie: de lopende cyclus is al betaald tegen het oude
--   bedrag; de wissel wordt effectief op de volgende factuurdatum.
-- - De commitment blijft ongemoeid (commit_months en commit_end_date
--   veranderen niet); er bestaat geen wissel naar flex binnen een
--   commitment omdat dit pad uitsluitend naar reguliere plan-rijen met
--   dezelfde commitment-structuur wisselt.
-- - Prijzen UITSLUITEND uit tmc.catalogue via _compute_order_price
--   (display-equals-charge): de RPC snapshot de uitkomst, de verwerking
--   past exact die snapshot toe en het Mollie-bedrag wordt door de TS-laag
--   op datzelfde snapshot-bedrag gezet.
-- - Verwerkingskeuze: het Mollie-subscription-bedrag wordt DIRECT bij het
--   verzoek verhoogd door de TS-laag (de eerstvolgende incasso, op de
--   volgende factuurdatum, is dan gegarandeerd het nieuwe bedrag ongeacht
--   Mollie's SEPA-aanlooptijd), en de ENTITLEMENTS wisselen pas op de
--   factuurdatum via de process-change-requests cron. Geen proratie by
--   construction: de al betaalde cyclus behoudt de oude rechten en de oude
--   prijs. De TS-laag schuift het verzoek een cyclus op wanneer de volgende
--   incasso te dichtbij is (SEPA-aanloop), zodat bedrag en rechten nooit
--   uiteenlopen.
-- - EM-prijsslot (lock_in_active) wordt geweigerd: de interactie tussen het
--   Early-Member-slot en een upgrade is een fase 2-EM-besluit; tot dan geen
--   stil verlies van het slot.
-- - Seam met de order-pijplijn: dit pad maakt GEEN order en GEEN tweede
--   membership; de existing_membership-guard in create_order /
--   admin_create_order / activate_order blijft onaangeroerd.
--
-- Beleid e-mailcorrectie:
-- - Wijzigt een login-adres. auth.users.email, auth.identities
--   (identity_data) en tmc.profiles.email gaan synchroon in EEN transactie
--   (dit function-body); profiles.email voedt de betaallink-mails.
-- - Volledige PR B-strengheid: genormaliseerd (lower/trim) zoek-eerst;
--   bestaat het adres al op een ANDER account dan hard weigeren, nooit
--   mergen of overschrijven. De unique index users_email_partial_key vangt
--   de race af (unique_violation wordt als email_exists teruggegeven).
-- - De bevestigingsstatus van het account blijft ongemoeid; OTP-login op
--   het gecorrigeerde adres convergeert (PR B-bewijs) en bevestigt bij de
--   eerste verificatie.

-- 1. De aanvraag-tabel. Snapshots zijn volledig deterministisch: de
--    verwerking leest niets meer uit de catalogus, alleen uit deze rij.
create table tmc.membership_change_requests (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references tmc.memberships(id) on delete cascade,
  profile_id uuid not null references tmc.profiles(id) on delete cascade,
  requested_by uuid,
  requested_via text not null check (requested_via in ('member', 'admin')),
  target_slug text not null,
  target_family text not null,
  target_frequency_cap integer,
  target_covered_pillars text[] not null default '{}',
  target_extended_access boolean not null default false,
  current_recurring_cents integer not null,
  new_base_price_cents integer not null,
  new_extended_access_price_cents integer not null default 0,
  new_recurring_cents integer not null,
  -- Snapshot van de subscription waarvoor het verzoek geldt; wisselt die
  -- tussen verzoek en verwerking (pauze plus hervatten mint een nieuwe),
  -- dan weigert de verwerking in plaats van een mismatch tussen bedrag en
  -- rechten te creeren.
  mollie_subscription_id text,
  pricing_snapshot jsonb not null,
  effective_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'cancelled', 'failed')),
  applied_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mcr_upgrade_only check (new_recurring_cents > current_recurring_cents)
);

comment on table tmc.membership_change_requests is
  'Alleen-upgrade wijzigingsverzoeken op een lopend membership, effectief op de volgende factuurdatum, geen proratie. Schrijven uitsluitend via de definer-RPCs (request/cancel/process); authenticated heeft alleen SELECT, DB-afgedwongen zoals tmc.orders.';

create unique index mcr_one_pending_per_membership
  on tmc.membership_change_requests (membership_id) where status = 'pending';
create index mcr_due
  on tmc.membership_change_requests (effective_date) where status = 'pending';

create trigger mcr_touch_updated_at
  before update on tmc.membership_change_requests
  for each row execute function tmc.touch_updated_at();

alter table tmc.membership_change_requests enable row level security;

create policy mcr_admin_all on tmc.membership_change_requests
  for all using (tmc.is_admin()) with check (tmc.is_admin());
create policy mcr_self_read on tmc.membership_change_requests
  for select using (profile_id = auth.uid());

revoke all on tmc.membership_change_requests from public, anon;
grant select on tmc.membership_change_requests to authenticated;
grant all on tmc.membership_change_requests to service_role;

-- 2. Verzoek indienen: eigenaar OF admin. De TS-laag levert de volgende
--    factuurdatum aan (Mollie nextPaymentDate, met de SEPA-aanloop-guard)
--    en verhoogt NA deze RPC het Mollie-bedrag naar new_recurring_cents.
create or replace function tmc.request_membership_change(
  p_membership_id uuid,
  p_target_slug text,
  p_extended_access boolean,
  p_effective_date date
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_m tmc.memberships%rowtype;
  v_pending tmc.membership_change_requests%rowtype;
  v_pricing jsonb;
  v_current integer;
  v_new integer;
  v_ext_flag boolean;
  v_via text;
  v_req_id uuid;
begin
  -- Eigenaar of admin; voor ieder ander is het verzoek onvindbaar.
  select m.* into v_m
  from tmc.memberships m
  where m.id = p_membership_id
    and (tmc.is_admin() or m.profile_id = auth.uid())
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_found');
  end if;

  if v_m.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_changeable',
      'status', v_m.status);
  end if;
  if coalesce(v_m.billing_cycle_weeks, 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_changeable_plan');
  end if;
  if v_m.pause_effective_date is not null then
    return jsonb_build_object('ok', false, 'reason', 'not_changeable_paused');
  end if;
  if v_m.lock_in_active then
    -- EM-prijsslot: upgrade-interactie is een fase 2-EM-besluit.
    return jsonb_build_object('ok', false, 'reason', 'lock_in_active');
  end if;
  if p_effective_date is null or p_effective_date <= current_date then
    return jsonb_build_object('ok', false, 'reason', 'invalid_effective_date');
  end if;

  -- Idempotent: hetzelfde openstaande verzoek is een no-op; een ander
  -- doel vereist eerst annuleren (nooit twee bedragswijzigingen tegelijk).
  select r.* into v_pending
  from tmc.membership_change_requests r
  where r.membership_id = p_membership_id and r.status = 'pending'
  for update;
  if found then
    if v_pending.target_slug = p_target_slug
       and v_pending.target_extended_access = coalesce(p_extended_access, false) then
      return jsonb_build_object('ok', true, 'already_pending', true,
        'request_id', v_pending.id,
        'effective_date', v_pending.effective_date,
        'new_recurring_cents', v_pending.new_recurring_cents);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'pending_exists',
      'request_id', v_pending.id);
  end if;

  -- Prijs en structuur UITSLUITEND uit de catalogus, via dezelfde functie
  -- als de order-pijplijn (display-equals-charge). Early Member nooit via
  -- dit pad; de 24m-korting volgt de bestaande commitment van het lid.
  v_pricing := tmc._compute_order_price(
    p_target_slug, coalesce(p_extended_access, false),
    v_m.commit_months = 24, false);
  if not (v_pricing->>'ok')::boolean then
    return jsonb_build_object('ok', false,
      'reason', v_pricing->>'reason');
  end if;
  if v_pricing->>'kind' <> 'subscription' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_plan');
  end if;
  if v_pricing->>'age_category' <> v_m.age_category then
    return jsonb_build_object('ok', false, 'reason', 'age_mismatch');
  end if;

  v_ext_flag := (v_pricing->>'extended_access')::boolean;
  if p_target_slug = v_m.plan_variant and v_ext_flag = v_m.extended_access then
    return jsonb_build_object('ok', false, 'reason', 'no_change');
  end if;

  v_current := v_m.price_per_cycle_cents + v_m.extended_access_price_cents;
  v_new := (v_pricing->>'recurring_cents')::integer;
  if v_new <= v_current then
    -- Downgraden bestaat niet via dit pad (beleid).
    return jsonb_build_object('ok', false, 'reason', 'not_an_upgrade',
      'current_recurring_cents', v_current, 'new_recurring_cents', v_new);
  end if;

  v_via := case when tmc.is_admin() then 'admin' else 'member' end;

  insert into tmc.membership_change_requests (
    membership_id, profile_id, requested_by, requested_via,
    target_slug, target_family, target_frequency_cap, target_covered_pillars,
    target_extended_access, current_recurring_cents,
    new_base_price_cents, new_extended_access_price_cents, new_recurring_cents,
    mollie_subscription_id, pricing_snapshot, effective_date
  ) values (
    p_membership_id, v_m.profile_id, auth.uid(), v_via,
    p_target_slug, v_pricing->>'family',
    nullif(v_pricing->>'frequency_cap', '')::integer,
    coalesce((select array_agg(x) from jsonb_array_elements_text(v_pricing->'covered_pillars') as t(x)), '{}'),
    v_ext_flag, v_current,
    (v_pricing->>'base_price_cents')::integer,
    (v_pricing->>'extended_access_price_cents')::integer,
    v_new,
    v_m.mollie_subscription_id, v_pricing, p_effective_date
  )
  returning id into v_req_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'membership.change_requested', v_via, auth.uid(), 'membership', p_membership_id,
    jsonb_build_object(
      'profile_id', v_m.profile_id,
      'request_id', v_req_id,
      'from_slug', v_m.plan_variant,
      'target_slug', p_target_slug,
      'current_recurring_cents', v_current,
      'new_recurring_cents', v_new,
      'effective_date', p_effective_date
    )
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', v_req_id,
    'effective_date', p_effective_date,
    'current_recurring_cents', v_current,
    'new_recurring_cents', v_new,
    'mollie_subscription_id', v_m.mollie_subscription_id,
    'mollie_customer_id', v_m.mollie_customer_id
  );
end;
$$;

-- 3. Verzoek annuleren (eigenaar of admin), alleen zolang het pending is.
--    De TS-laag zet daarna het Mollie-bedrag terug naar de huidige
--    recurring (restore_recurring_cents).
create or replace function tmc.cancel_membership_change_request(
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_r tmc.membership_change_requests%rowtype;
  v_m tmc.memberships%rowtype;
begin
  select r.* into v_r
  from tmc.membership_change_requests r
  where r.id = p_request_id
    and (tmc.is_admin() or r.profile_id = auth.uid())
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'request_not_found');
  end if;

  if v_r.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'already_cancelled', true);
  end if;
  if v_r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable',
      'status', v_r.status);
  end if;

  select m.* into v_m from tmc.memberships m where m.id = v_r.membership_id for update;

  update tmc.membership_change_requests
  set status = 'cancelled'
  where id = p_request_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'membership.change_cancelled',
    case when tmc.is_admin() then 'admin' else 'member' end,
    auth.uid(), 'membership', v_r.membership_id,
    jsonb_build_object('profile_id', v_r.profile_id, 'request_id', v_r.id,
      'target_slug', v_r.target_slug)
  );

  return jsonb_build_object(
    'ok', true,
    'membership_id', v_r.membership_id,
    'mollie_customer_id', v_m.mollie_customer_id,
    'mollie_subscription_id', v_m.mollie_subscription_id,
    'restore_recurring_cents', v_m.price_per_cycle_cents + v_m.extended_access_price_cents
  );
end;
$$;

-- 4. Verwerking op de factuurdatum, aangeroepen door de
--    process-change-requests cron (service-role; ACL-afgedwongen). Past
--    uitsluitend de snapshot toe; commitment blijft ongemoeid. Weigert
--    defensief wanneer het membership niet meer actief is of de
--    subscription intussen gewisseld is (dan is het Mollie-bedrag niet
--    meer het verzoek-bedrag).
create or replace function tmc.process_due_membership_change_requests()
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  r tmc.membership_change_requests%rowtype;
  v_m tmc.memberships%rowtype;
  v_fail text;
  v_applied uuid[] := '{}';
  v_failed jsonb := '[]'::jsonb;
begin
  for r in
    select * from tmc.membership_change_requests
    where status = 'pending' and effective_date <= current_date
    for update skip locked
  loop
    v_fail := null;
    select m.* into v_m from tmc.memberships m where m.id = r.membership_id for update;
    if not found then
      v_fail := 'membership_missing';
    elsif v_m.status <> 'active' then
      v_fail := 'membership_not_active';
    elsif r.mollie_subscription_id is distinct from v_m.mollie_subscription_id then
      v_fail := 'subscription_changed';
    end if;

    if v_fail is not null then
      update tmc.membership_change_requests
      set status = 'failed', failure_reason = v_fail
      where id = r.id;
      v_failed := v_failed || jsonb_build_object('request_id', r.id,
        'membership_id', r.membership_id, 'reason', v_fail);
      continue;
    end if;

    update tmc.memberships
    set plan_type = r.target_family,
        plan_variant = r.target_slug,
        frequency_cap = r.target_frequency_cap,
        covered_pillars = r.target_covered_pillars,
        price_per_cycle_cents = r.new_base_price_cents,
        extended_access = r.target_extended_access,
        extended_access_price_cents = r.new_extended_access_price_cents
    where id = r.membership_id;

    update tmc.membership_change_requests
    set status = 'applied', applied_at = now()
    where id = r.id;

    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values (
      'membership.changed', 'system', null, 'membership', r.membership_id,
      jsonb_build_object(
        'profile_id', r.profile_id,
        'request_id', r.id,
        'target_slug', r.target_slug,
        'new_recurring_cents', r.new_recurring_cents,
        'effective_date', r.effective_date
      )
    );

    v_applied := v_applied || r.id;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'applied', coalesce(array_length(v_applied, 1), 0),
    'applied_ids', to_jsonb(v_applied),
    'failed', v_failed
  );
end;
$$;

-- 5. Directe e-mailcorrectie op een bestaand account. Drie stores synchroon
--    in deze ene transactie; PR B-strengheid.
create or replace function tmc.admin_correct_customer_email(
  p_profile_id uuid,
  p_new_email text
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_user auth.users%rowtype;
  v_new text;
  v_old text;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  -- Zelfde normalisatie als de unique sleutel users_email_partial_key
  -- (GoTrue slaat adressen lowercase op).
  v_new := lower(trim(coalesce(p_new_email, '')));
  if v_new !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  select u.* into v_user from auth.users u where u.id = p_profile_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'user_not_found');
  end if;
  if v_user.is_sso_user then
    return jsonb_build_object('ok', false, 'reason', 'sso_user');
  end if;

  v_old := lower(coalesce(v_user.email, ''));
  if v_old = v_new then
    return jsonb_build_object('ok', true, 'already_current', true,
      'email', v_new);
  end if;

  -- Zoek-eerst: bestaat het adres al op een ANDER account, dan hard
  -- weigeren; nooit mergen of overschrijven.
  if exists (
    select 1 from auth.users u
    where lower(u.email) = v_new and u.id <> p_profile_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'email_exists');
  end if;

  begin
    update auth.users
    set email = v_new, updated_at = now()
    where id = p_profile_id;
  exception when unique_violation then
    -- Race met een gelijktijdige aanmaak: zelfde uitkomst als zoek-eerst.
    return jsonb_build_object('ok', false, 'reason', 'email_exists');
  end;

  -- De e-mail-identity volgt: identities.email is GENERATED uit
  -- identity_data, dus alleen identity_data wordt bijgewerkt.
  update auth.identities
  set identity_data = identity_data || jsonb_build_object('email', v_new),
      updated_at = now()
  where user_id = p_profile_id and provider = 'email';

  -- De kopie die betaallink-mails en admin-zoek gebruiken.
  update tmc.profiles
  set email = v_new, updated_at = now()
  where id = p_profile_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'member.email_changed', 'admin', auth.uid(), 'profile', p_profile_id,
    jsonb_build_object('old_email', v_old, 'new_email', v_new)
  );

  return jsonb_build_object('ok', true, 'old_email', v_old, 'new_email', v_new);
end;
$$;

-- 6. ACL: request en cancel voor authenticated (eigenaar-check zit in de
--    functie) plus service_role; verwerking uitsluitend service_role;
--    e-mailcorrectie gespiegeld aan de andere admin-RPC's.
revoke all on function tmc.request_membership_change(uuid, text, boolean, date) from public, anon;
grant execute on function tmc.request_membership_change(uuid, text, boolean, date) to authenticated, service_role;

revoke all on function tmc.cancel_membership_change_request(uuid) from public, anon;
grant execute on function tmc.cancel_membership_change_request(uuid) to authenticated, service_role;

revoke all on function tmc.process_due_membership_change_requests() from public, anon, authenticated;
grant execute on function tmc.process_due_membership_change_requests() to service_role;

revoke all on function tmc.admin_correct_customer_email(uuid, text) from public, anon;
grant execute on function tmc.admin_correct_customer_email(uuid, text) to authenticated, service_role;
