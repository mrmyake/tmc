-- Product toekennen zonder betaling (spec-facturatie.md 9.8, gate "Product
-- toekennen zonder betaling").
--
--   1. tmc.product_grants: de herkomst van een toegekend product (wie, waarom,
--      welke factuur). RLS: admin leest, niemand schrijft; schrijven kan alleen
--      via de functies hieronder. invoice_id landt hier, niet op tmc.invoices.
--   2. tmc._grant_product_core: de kern, zonder grants. Maakt een creditrij in
--      tmc.memberships (zelfde vorm als tmc.activate_order voor een
--      credit-product, maar zonder order, zonder payment en met prijs 0), de
--      herkomstrij en het event product.granted, in een transactie.
--   3. tmc.admin_grant_product: dunne admin-wrapper (tmc.is_admin()).
--      Automatisch toekennen bij betaling wordt later een tweede wrapper rond
--      dezelfde kern (actor 'system'); daar is nu niets voor gebouwd.
--   4. tmc.admin_revoke_product_grant: een ongebruikte toekenning intrekken.
--
-- Geen wijziging aan bestaande functies, views, tmc.invoices of
-- tmc.memberships (source 'admin_manual' bestaat al). Geen omzet: er ontstaat
-- geen order en geen payments-rij, tmc.v_revenue_lines blijft ongemoeid.

begin;

-- ---------------------------------------------------------------------------
-- 1. product_grants
-- ---------------------------------------------------------------------------

create table tmc.product_grants (
  id                 uuid primary key default gen_random_uuid(),
  membership_id      uuid not null unique references tmc.memberships(id) on delete cascade,
  profile_id         uuid not null references tmc.profiles(id) on delete cascade,
  catalogue_slug     text not null,
  credits            integer not null check (credits > 0),
  expires_at         date,
  reason             text not null check (length(trim(reason)) > 0),
  invoice_id         uuid references tmc.invoices(id),
  duplicate_override boolean not null default false,
  granted_via        text not null default 'admin'
                       check (granted_via in ('admin', 'system')),
  granted_by         uuid references tmc.profiles(id) on delete set null,
  granted_at         timestamptz not null default now(),
  revoked_at         timestamptz,
  revoked_by         uuid references tmc.profiles(id) on delete set null,
  revoke_reason      text,
  constraint product_grants_revoke_consistent
    check ((revoked_at is null) = (revoke_reason is null))
);

create index product_grants_profile_idx on tmc.product_grants (profile_id);
create index product_grants_invoice_idx on tmc.product_grants (invoice_id)
  where invoice_id is not null;

alter table tmc.product_grants enable row level security;

create policy product_grants_admin_read on tmc.product_grants
  for select using (tmc.is_admin());

-- Niemand schrijft direct: geen insert-, update- of delete-recht voor welke
-- API-rol dan ook, ook service_role niet. De functies draaien als eigenaar.
revoke all on tmc.product_grants from public, anon, authenticated, service_role;
grant select on tmc.product_grants to authenticated, service_role;

comment on table tmc.product_grants is
  'Herkomst van een zonder betaling toegekend product: toegekend door, reden en optioneel de betaalde factuur waar het bij hoort. Een rij per toegekende creditrij in tmc.memberships. Schrijven alleen via tmc.admin_grant_product en tmc.admin_revoke_product_grant. Zie spec-facturatie.md 9.8.';
comment on column tmc.product_grants.invoice_id is
  'Optioneel: de betaalde factuur waar deze toekenning bij hoort. Een gekoppelde toekenning betekent altijd een betaalde, niet gecrediteerde factuur van hetzelfde profiel op het moment van toekennen.';
comment on column tmc.product_grants.duplicate_override is
  'Waar als deze toekenning boven het toegestane aantal voor factuur en slug uitkwam en bewust is doorgezet (p_allow_duplicate).';

-- ---------------------------------------------------------------------------
-- 2. De kern
-- ---------------------------------------------------------------------------

create function tmc._grant_product_core(
  p_profile_id      uuid,
  p_slug            text,
  p_reason          text,
  p_invoice_id      uuid,
  p_allow_duplicate boolean,
  p_actor_type      text,
  p_actor_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_is_test       boolean;
  v_cat           tmc.catalogue%rowtype;
  v_plan_type     text;
  v_inv           tmc.invoices%rowtype;
  v_pay           tmc.payments%rowtype;
  v_line_count    integer;
  v_allowed       integer;
  v_granted       integer;
  v_override      boolean := false;
  v_expires       date;
  v_membership_id uuid;
  v_grant_id      uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_reason');
  end if;
  if p_actor_type is null or p_actor_type not in ('admin', 'system') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_actor_type');
  end if;

  select is_test into v_is_test from tmc.profiles where id = p_profile_id;
  if v_is_test is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  -- Poort: alleen losse producten met tegoed. Geen abonnementen (die geven
  -- deurtoegang en lopen via incasso), geen add-ons, fees of programma's.
  -- De slug-whitelist is dezelfde als in tmc.activate_order; drop_in* heeft
  -- geen plan_type en valt er dus buiten.
  select * into v_cat from tmc.catalogue where slug = p_slug;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'product_not_found');
  end if;
  v_plan_type := case
    when v_cat.slug like 'ten_ride_card%' then 'ten_ride_card'
    when v_cat.slug in ('pt_single', 'pt_10', 'duo_single', 'duo_10') then 'pt_package'
    else null
  end;
  if v_cat.kind <> 'product'
     or v_cat.credits is null or v_cat.credits <= 0
     or v_cat.billing_cycle_weeks is not null
     or not v_cat.is_active
     or v_plan_type is null then
    return jsonb_build_object('ok', false, 'reason', 'product_not_grantable');
  end if;

  if p_invoice_id is not null then
    -- Rijlock op de factuur: de telling hieronder en de insert zijn daarmee
    -- atomair voor twee gelijktijdige toekenningen op dezelfde factuur.
    select * into v_inv from tmc.invoices where id = p_invoice_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
    end if;
    if v_inv.profile_id <> p_profile_id then
      return jsonb_build_object('ok', false, 'reason', 'invoice_profile_mismatch');
    end if;
    if v_inv.status <> 'finalised' then
      return jsonb_build_object('ok', false, 'reason', 'invoice_not_finalised');
    end if;
    if v_inv.credit_of_invoice_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'invoice_is_credit_note');
    end if;
    if exists (
      select 1 from tmc.invoices c
      where c.credit_of_invoice_id = v_inv.id and c.status = 'finalised'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'invoice_credited');
    end if;
    if v_inv.is_test <> v_is_test then
      return jsonb_build_object('ok', false, 'reason', 'invoice_test_mismatch');
    end if;
    -- Een open factuur wordt geweigerd, zonder override: een gekoppelde
    -- toekenning betekent altijd een betaalde factuur.
    if v_inv.payment_id is null then
      return jsonb_build_object('ok', false, 'reason', 'invoice_not_paid');
    end if;
    select * into v_pay from tmc.payments where id = v_inv.payment_id;
    if not found or v_pay.status <> 'paid' then
      return jsonb_build_object('ok', false, 'reason', 'invoice_not_paid');
    end if;
    if coalesce(v_pay.charged_back_amount_cents, 0) > 0
       or coalesce(v_pay.refunded_amount_cents, 0) > 0 then
      return jsonb_build_object('ok', false, 'reason', 'invoice_payment_reversed');
    end if;

    -- Toegestaan aantal: de som van quantity van de regels met deze slug,
    -- naar beneden afgerond; 1 als de slug niet op de factuur staat.
    select count(*), coalesce(floor(sum(l.quantity)), 0)::integer
      into v_line_count, v_allowed
    from tmc.invoice_lines l
    where l.invoice_id = v_inv.id and l.catalogue_slug = p_slug;
    if v_line_count = 0 then
      v_allowed := 1;
    end if;

    select count(*) into v_granted
    from tmc.product_grants g
    where g.invoice_id = v_inv.id
      and g.catalogue_slug = p_slug
      and g.revoked_at is null;

    if v_granted >= v_allowed then
      if not coalesce(p_allow_duplicate, false) then
        return jsonb_build_object(
          'ok', false, 'reason', 'already_granted',
          'granted', v_granted, 'allowed', v_allowed
        );
      end if;
      v_override := true;
    end if;
  end if;

  -- Geldigheid en aantal credits komen altijd uit de catalogus.
  v_expires := case
    when v_cat.validity_months is not null
      then (current_date + make_interval(months => v_cat.validity_months))::date
    else null
  end;

  -- Zelfde vorm als de credit-tak van tmc.activate_order, met prijs 0: er is
  -- geen geld aan deze rij verbonden (de omzet staat op de factuur).
  insert into tmc.memberships (
    profile_id, plan_type, plan_variant, age_category,
    price_per_cycle_cents, billing_cycle_weeks, commit_months,
    start_date, status, source,
    credits_total, credits_remaining, credits_expires_at
  ) values (
    p_profile_id, v_plan_type, v_cat.slug, v_cat.age_category,
    0, 0, 0,
    current_date, 'active', 'admin_manual',
    v_cat.credits, v_cat.credits, v_expires
  )
  returning id into v_membership_id;

  insert into tmc.product_grants (
    membership_id, profile_id, catalogue_slug, credits, expires_at, reason,
    invoice_id, duplicate_override, granted_via, granted_by
  ) values (
    v_membership_id, p_profile_id, v_cat.slug, v_cat.credits, v_expires, trim(p_reason),
    p_invoice_id, v_override, p_actor_type, p_actor_id
  )
  returning id into v_grant_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'product.granted', p_actor_type, p_actor_id, 'membership', v_membership_id,
    jsonb_build_object(
      'profile_id', p_profile_id,
      'membership_id', v_membership_id,
      'grant_id', v_grant_id,
      'catalogue_slug', v_cat.slug,
      'credits', v_cat.credits,
      'expires_at', v_expires,
      'reason', trim(p_reason),
      'invoice_id', p_invoice_id,
      'duplicate_override', v_override
    )
  );

  return jsonb_build_object(
    'ok', true,
    'grant_id', v_grant_id,
    'membership_id', v_membership_id,
    'catalogue_slug', v_cat.slug,
    'credits', v_cat.credits,
    'expires_at', v_expires,
    'duplicate_override', v_override,
    'is_test', v_is_test
  );
end;
$function$;

revoke all on function tmc._grant_product_core(uuid, text, text, uuid, boolean, text, uuid)
  from public, anon, authenticated, service_role;

comment on function tmc._grant_product_core(uuid, text, text, uuid, boolean, text, uuid) is
  'Kern van product toekennen zonder betaling. Geen grants: alleen aanroepbaar via een wrapper (nu tmc.admin_grant_product). Zie spec-facturatie.md 9.8.';

-- ---------------------------------------------------------------------------
-- 3. De admin-wrapper
-- ---------------------------------------------------------------------------

create function tmc.admin_grant_product(
  p_profile_id      uuid,
  p_slug            text,
  p_reason          text,
  p_invoice_id      uuid default null,
  p_allow_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
begin
  -- DB-poort; requireAdmin() in de server action is de tweede laag.
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  return tmc._grant_product_core(
    p_profile_id, p_slug, p_reason, p_invoice_id, p_allow_duplicate,
    'admin', auth.uid()
  );
end;
$function$;

revoke all on function tmc.admin_grant_product(uuid, text, text, uuid, boolean)
  from public, anon;
grant execute on function tmc.admin_grant_product(uuid, text, text, uuid, boolean)
  to authenticated, service_role;

comment on function tmc.admin_grant_product(uuid, text, text, uuid, boolean) is
  'Kent een los catalogusproduct met tegoed toe aan een lid, zonder order en zonder betaling, optioneel gekoppeld aan een betaalde factuur. Alleen admins. Zie spec-facturatie.md 9.8.';

-- ---------------------------------------------------------------------------
-- 4. Intrekken
-- ---------------------------------------------------------------------------

create function tmc.admin_revoke_product_grant(
  p_grant_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_grant      tmc.product_grants%rowtype;
  v_membership tmc.memberships%rowtype;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_reason');
  end if;

  select * into v_grant from tmc.product_grants where id = p_grant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'grant_not_found');
  end if;
  if v_grant.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_revoked');
  end if;

  select * into v_membership
  from tmc.memberships where id = v_grant.membership_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_found');
  end if;
  if v_membership.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_active');
  end if;

  -- Alleen een ongebruikte toekenning: het saldo is nog exact wat er is
  -- toegekend. Is er verbruikt (of handmatig bijgeschreven), dan is
  -- "Credits aanpassen" het pad.
  if coalesce(v_membership.credits_remaining, 0) < coalesce(v_membership.credits_total, 0) then
    return jsonb_build_object(
      'ok', false, 'reason', 'credits_used',
      'credits_remaining', v_membership.credits_remaining,
      'credits_total', v_membership.credits_total
    );
  end if;
  if coalesce(v_membership.credits_remaining, 0) > coalesce(v_membership.credits_total, 0) then
    return jsonb_build_object(
      'ok', false, 'reason', 'credits_adjusted',
      'credits_remaining', v_membership.credits_remaining,
      'credits_total', v_membership.credits_total
    );
  end if;

  -- cancellation_effective_date blijft leeg: een ingetrokken toekenning is
  -- geen opzegging en telt niet als churn in tmc.vw_admin_kpis.
  update tmc.memberships
  set status = 'cancelled', end_date = current_date
  where id = v_membership.id;

  update tmc.product_grants
  set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = trim(p_reason)
  where id = v_grant.id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'product.grant_revoked', 'admin', auth.uid(), 'membership', v_membership.id,
    jsonb_build_object(
      'profile_id', v_grant.profile_id,
      'membership_id', v_membership.id,
      'grant_id', v_grant.id,
      'catalogue_slug', v_grant.catalogue_slug,
      'invoice_id', v_grant.invoice_id,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'grant_id', v_grant.id,
    'membership_id', v_membership.id,
    'invoice_id', v_grant.invoice_id
  );
end;
$function$;

revoke all on function tmc.admin_revoke_product_grant(uuid, text)
  from public, anon;
grant execute on function tmc.admin_revoke_product_grant(uuid, text)
  to authenticated, service_role;

comment on function tmc.admin_revoke_product_grant(uuid, text) is
  'Trekt een ongebruikte producttoekenning in: membership naar cancelled, herkomstrij gemarkeerd, de factuur telt de toekenning niet meer mee. Weigert zodra er tegoed verbruikt is. Alleen admins. Zie spec-facturatie.md 9.8.';

-- ---------------------------------------------------------------------------
-- 5. Zelfcontrole (geen app-data nodig)
-- ---------------------------------------------------------------------------

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'tmc.product_grants'::regclass) then
    raise exception 'RLS staat niet aan op tmc.product_grants.';
  end if;
  if has_table_privilege('authenticated', 'tmc.product_grants', 'insert')
     or has_table_privilege('authenticated', 'tmc.product_grants', 'update')
     or has_table_privilege('authenticated', 'tmc.product_grants', 'delete')
     or has_table_privilege('anon', 'tmc.product_grants', 'select')
     or has_table_privilege('service_role', 'tmc.product_grants', 'insert') then
    raise exception 'tmc.product_grants heeft een schrijfrecht of anon-leesrecht dat er niet hoort.';
  end if;
  if has_function_privilege('anon', 'tmc.admin_grant_product(uuid, text, text, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'tmc.admin_revoke_product_grant(uuid, text)', 'execute')
     or has_function_privilege('anon', 'tmc._grant_product_core(uuid, text, text, uuid, boolean, text, uuid)', 'execute')
     or has_function_privilege('authenticated', 'tmc._grant_product_core(uuid, text, text, uuid, boolean, text, uuid)', 'execute')
     or has_function_privilege('service_role', 'tmc._grant_product_core(uuid, text, text, uuid, boolean, text, uuid)', 'execute') then
    raise exception 'Een toekenningsfunctie is uitvoerbaar voor een rol die dat niet mag.';
  end if;
  if not has_function_privilege('authenticated', 'tmc.admin_grant_product(uuid, text, text, uuid, boolean)', 'execute')
     or not has_function_privilege('authenticated', 'tmc.admin_revoke_product_grant(uuid, text)', 'execute') then
    raise exception 'authenticated mist EXECUTE op een admin-wrapper.';
  end if;
end;
$$;

commit;
