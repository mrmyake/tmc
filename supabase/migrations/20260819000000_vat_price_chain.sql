-- Facturatie PR 3 (spec-facturatie.md sectie 14): de BTW-keys in de
-- prijsketen.
--
-- Vervolg op PR 1 (#146, tarieven op tmc.catalogue) en PR 2 (#148,
-- snapshotkolommen op tmc.payments en tmc.orders). Dit is de eerste PR die
-- de prijsketen zelf raakt: _compute_order_price krijgt de BTW-keys uit
-- sectie 3.2, create_order en admin_create_order schrijven
-- orders.vat_amount_cents en geven profiles.is_test terug.
--
-- De drie functies zijn integraal geherdefinieerd op basis van hun LIVE
-- definitie (pg_get_functiondef, 2026-08-07), niet op basis van een
-- repo-bestand. Alles wat niet expliciet nieuw is, is byte-voor-byte de
-- bestaande logica.
--
-- Rekenregel (sectie 3.1, bruto leidend):
--   vat = round(gross::numeric * rate_bp / (10000 + rate_bp))
--   net = gross - vat
-- Per component gerekend en daarna opgeteld, nooit over het totaal
-- (sectie 3.4). De ::numeric-cast voor de deling maakt de uitkomst
-- bit-voor-bit gelijk aan de PR 2-backfill (20260818000000, regels
-- 102-104); round(numeric) is half away from zero.
--
-- extended_access_vat_rate_bp is NULL (niet 0) zodra er geen betaalde
-- add-on is: zowel bij "geen add-on" als bij extended_access_mode =
-- 'included' (waar v_ext nooit geresolved wordt en v_ext_price 0 is). Het
-- onderscheid "geen add-on" versus "add-on van nul euro" blijft daarmee
-- bestaan (sectie 3.2).
--
-- Waiver-punt (admin_create_order): de bestaande waiver-tak zet v_fee_cents
-- zelf op 0 voordat er iets gerekend wordt. De BTW over de fee wordt daarom
-- over v_fee_cents gerekend, een enkele bron; bij een waiver geeft
-- round(0 * rate / ...) vanzelf 0. Geen aparte tak, geen case. Gevolg:
-- orders.vat_amount_cents bevat de BTW over wat werkelijk geincasseerd
-- wordt, niet first_charge_vat_amount_cents uit v_pricing (dat de
-- ongewaivde fee bevat). Sectie 3.3 van de spec is hierop bijgewerkt in
-- dezelfde PR.
--
-- is_test wordt alleen TERUGGEGEVEN in het jsonb-resultaat zodat app-code
-- in PR 4 de Mollie-modus kan kiezen. Er wordt hier nergens op gehandeld;
-- mollie.ts, de webhook en het proefles-pad zijn onaangeroerd.
--
-- Plus een kleine schema-aanvulling: de bovengrens
-- payments_refunded_lte_amount_check. Kanttekening daarbij (sectie 7.4):
-- Mollie's amountRefunded kan bij enkele betaalmethodes die wij niet
-- gebruiken boven het betaalde bedrag uitkomen (vergoeding van
-- retourkosten). Komt dat ooit binnen, dan is de faalmodus dat de
-- webhook-upsert op deze constraint stukloopt; de afhandeling daarvan is
-- een voorwaarde bij PR 4.

begin;

-- ---------------------------------------------------------------------------
-- 0. Guard: geen bestaande rij schendt de nieuwe bovengrens
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from tmc.payments
  where refunded_amount_cents > amount_cents;

  if v_bad > 0 then
    raise exception 'vat_price_chain: % betaalregels met refunded_amount_cents > amount_cents; eerst opschonen', v_bad;
  end if;
end $$;

alter table tmc.payments
  add constraint payments_refunded_lte_amount_check
    check (refunded_amount_cents <= amount_cents);

comment on column tmc.payments.refunded_amount_cents is
  'Totaal terugbetaald bedrag, uit Mollie payment.amountRefunded. In API v2 blijft payment.status op paid bij een restitutie en bestaat de waarde refunded niet; de restitutiestand woont dus hier en niet in status. Altijd de bron van de negatieve omzetregel; een creditnota draagt alleen het meerdere bij. Begrensd op [0, amount_cents]; Mollie kan bij enkele methodes die TMC niet gebruikt een hoger amountRefunded sturen (retourkosten-vergoeding), en dan weigert de constraint de upsert. Afhandeling daarvan hoort bij de webhook (PR 4). Zie spec-facturatie.md 4.8 en 7.4.';

-- ---------------------------------------------------------------------------
-- 1. _compute_order_price: de BTW-keys (sectie 3.2)
--
-- Integrale herdefinitie van de live functie. Nieuw ten opzichte van de
-- live definitie: de declaraties v_base_vat/v_ext_vat/v_fee_vat, de drie
-- berekeningen in de subscription-tak, en de vat/revenue-keys in beide
-- returns. Al het overige is ongewijzigd overgenomen.
-- ---------------------------------------------------------------------------

create or replace function tmc._compute_order_price(p_slug text, p_extended_access boolean, p_commit_24m boolean, p_early_member boolean, p_admin_context boolean default false)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_row tmc.catalogue%rowtype;
  v_ext tmc.catalogue%rowtype;
  v_fee tmc.catalogue%rowtype;
  v_deadline timestamptz;
  v_opens timestamptz;
  v_phase_open boolean;
  v_em_active boolean;
  v_kind text;
  v_base_price integer;
  v_commit_months integer;
  v_ext_price integer := 0;
  v_ext_flag boolean := false;
  v_fee_cents integer := 0;
  v_fee_waiver text := null;
  v_lock boolean := false;
  v_recurring integer;
  v_first_charge integer;
  -- PR 3: BTW per component, bruto leidend (spec-facturatie.md 3.1/3.4).
  v_base_vat integer;
  v_ext_vat integer;
  v_fee_vat integer;
begin
  select * into v_row from tmc.catalogue where slug = p_slug and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'catalogue_row_not_found');
  end if;

  -- De 12-weken-programma's zijn bewust purchasable=false (geen
  -- zelfbediening); via de admin-context zijn ze wel als order te
  -- verkopen. De prijs blijft uit dezelfde catalogus-rij komen die
  -- /12-weken-programma toont: display is gelijk aan charge.
  if not v_row.purchasable
     and not (p_admin_context and v_row.slug in ('program_studio_12w', 'program_online_12w')) then
    return jsonb_build_object('ok', false, 'reason', 'not_purchasable');
  end if;

  if v_row.kind not in ('plan', 'product') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  end if;

  v_kind := case when v_row.kind = 'plan' then 'subscription' else 'product' end;

  -- Campaign phase, read fresh in this transaction (never the ISR-cached
  -- value). Condition 1: p_early_member is intent only. It becomes
  -- authoritative (v_em_active) only when the row is EM-eligible AND the
  -- phase is open right now; otherwise it is silently ignored -- never an
  -- error, never a price lever on its own.
  -- Sinds 20260813 heeft de fase ook een ondergrens: EM-voorwaarden gelden
  -- pas vanaf opens_at (studio-opening), niet al vanaf het bestaan van de
  -- campagne-rij. Beide grenzen komen uit tmc.early_member_pools.
  v_deadline := tmc.get_campaign_deadline();
  select min(opens_at) into v_opens from tmc.early_member_pools;
  v_phase_open := v_deadline is not null
    and v_opens is not null
    and now() >= v_opens
    and now() < v_deadline;
  v_em_active := p_early_member and v_row.early_member_eligible and v_phase_open;

  if v_kind = 'subscription' then
    if v_em_active and p_commit_24m then
      return jsonb_build_object('ok', false, 'reason', 'em_and_24m_exclusive');
    end if;
    if p_commit_24m and v_row.price_cents_24m_computed is null then
      return jsonb_build_object('ok', false, 'reason', 'commit_24m_not_offered');
    end if;

    if p_extended_access then
      if v_row.extended_access_mode = 'addon' then
        select * into v_ext from tmc.catalogue where slug = 'extended_access' and kind = 'addon' and is_active = true;
        if not found then
          raise exception 'extended_access catalogue row missing' using errcode = 'P0001';
        end if;
        v_ext_price := v_ext.price_cents;
        v_ext_flag := true;
      elsif v_row.extended_access_mode = 'included' then
        v_ext_price := 0;
        v_ext_flag := true;
      else
        return jsonb_build_object('ok', false, 'reason', 'extended_access_not_available');
      end if;
    elsif v_row.extended_access_mode = 'included' then
      v_ext_flag := true;
      v_ext_price := 0;
    end if;

    if v_em_active then
      v_base_price := coalesce(v_row.early_member_price_cents, v_row.price_cents);
      v_commit_months := coalesce(v_row.early_member_commit_months, 0);
      v_lock := v_row.early_member_price_lock;
    elsif p_commit_24m then
      v_base_price := v_row.price_cents_24m_computed;
      v_commit_months := 24;
      v_lock := false;
    else
      v_base_price := v_row.price_cents;
      v_commit_months := v_row.commit_months;
      v_lock := false;
    end if;

    select * into v_fee from tmc.catalogue where slug = 'signup_fee' and kind = 'fee' and is_active = true;
    if not found then
      raise exception 'signup_fee catalogue row missing' using errcode = 'P0001';
    end if;
    if v_em_active then
      v_fee_cents := coalesce(v_fee.early_member_price_cents, 0);
      v_fee_waiver := 'early_member';
    else
      v_fee_cents := v_fee.price_cents;
    end if;

    v_recurring := v_base_price + v_ext_price;
    v_first_charge := v_recurring + v_fee_cents;

    -- PR 3: BTW per component met het tarief van de eigen catalogusrij,
    -- daarna optellen (3.4). Nooit in een keer over het totaal: dat wijkt
    -- bij gemengde tarieven een cent af en dan rekenen order en backfill
    -- (20260818000000) op verschillende regels. ::numeric voor de deling,
    -- anders is het integer-deling.
    -- v_ext is alleen geresolved in de addon-tak; bij 'included' en bij
    -- "geen add-on" is v_ext_price 0 en het tarief NULL, niet 0. Dat
    -- onderscheid ("geen add-on" versus "add-on van nul euro") is bewust.
    v_base_vat := round(v_base_price::numeric * v_row.vat_rate_bp / (10000 + v_row.vat_rate_bp))::integer;
    v_ext_vat := case when v_ext_price > 0
      then round(v_ext_price::numeric * v_ext.vat_rate_bp / (10000 + v_ext.vat_rate_bp))::integer
      else 0 end;
    v_fee_vat := round(v_fee_cents::numeric * v_fee.vat_rate_bp / (10000 + v_fee.vat_rate_bp))::integer;

    return jsonb_build_object(
      'ok', true,
      'kind', v_kind,
      'family', v_row.family,
      'frequency_cap', v_row.frequency_cap,
      'age_category', v_row.age_category,
      'covered_pillars', to_jsonb(v_row.covered_pillars),
      'catalogue', to_jsonb(v_row),
      'deadline', v_deadline,
      'phase_open', v_phase_open,
      'em_active', v_em_active,
      'commit_24m_requested', p_commit_24m,
      'base_price_cents', v_base_price,
      'extended_access', v_ext_flag,
      'extended_access_price_cents', v_ext_price,
      'signup_fee_cents', v_fee_cents,
      'signup_fee_waiver', v_fee_waiver,
      'first_charge_cents', v_first_charge,
      'recurring_cents', v_recurring,
      'billing_cycle_weeks', v_row.billing_cycle_weeks,
      'commit_months', v_commit_months,
      'early_member_price_lock', v_lock,
      -- PR 3: de negen BTW-keys (spec-facturatie.md 3.2). Drie tarieven
      -- afzonderlijk, ook nu ze dezelfde waarde dragen: de componenten
      -- komen uit drie catalogusrijen die los van elkaar kunnen wijzigen.
      'vat_rate_bp', v_row.vat_rate_bp,
      'vat_amount_cents', v_base_vat,
      'extended_access_vat_rate_bp', case when v_ext_price > 0 then v_ext.vat_rate_bp end,
      'extended_access_vat_amount_cents', v_ext_vat,
      'signup_fee_vat_rate_bp', v_fee.vat_rate_bp,
      'signup_fee_vat_amount_cents', v_fee_vat,
      'first_charge_vat_amount_cents', v_base_vat + v_ext_vat + v_fee_vat,
      'recurring_vat_amount_cents', v_base_vat + v_ext_vat,
      'revenue_category', v_row.revenue_category
    );
  else
    if p_extended_access or p_commit_24m or p_early_member then
      return jsonb_build_object('ok', false, 'reason', 'invalid_product_options');
    end if;

    -- Whitelist van online verkoopbare producten. Alles wat hier niet in
    -- staat (drop_in*, toekomstige lead-items) kan geen order worden;
    -- activate_order heeft dezelfde set als defensieve tweede laag.
    -- De 12-weken-programma's mogen uitsluitend via de admin-context.
    if not (v_row.slug like 'ten_ride_card%'
            or v_row.slug in ('pt_single', 'pt_10', 'duo_single', 'duo_10')
            or (p_admin_context and v_row.slug in ('program_studio_12w', 'program_online_12w'))) then
      return jsonb_build_object('ok', false, 'reason', 'product_not_supported');
    end if;

    -- PR 3: een product heeft een enkel component.
    v_base_vat := round(v_row.price_cents::numeric * v_row.vat_rate_bp / (10000 + v_row.vat_rate_bp))::integer;

    return jsonb_build_object(
      'ok', true,
      'kind', v_kind,
      'family', v_row.family,
      'age_category', v_row.age_category,
      'credits', v_row.credits,
      'validity_months', v_row.validity_months,
      'catalogue', to_jsonb(v_row),
      'deadline', v_deadline,
      'phase_open', v_phase_open,
      'em_active', false,
      'commit_24m_requested', false,
      'base_price_cents', v_row.price_cents,
      'extended_access', false,
      'extended_access_price_cents', 0,
      'signup_fee_cents', 0,
      'signup_fee_waiver', null,
      'first_charge_cents', v_row.price_cents,
      'recurring_cents', null,
      'billing_cycle_weeks', null,
      'commit_months', null,
      'early_member_price_lock', false,
      -- PR 3: de vier BTW-keys van de product-tak (spec-facturatie.md 3.2).
      'vat_rate_bp', v_row.vat_rate_bp,
      'vat_amount_cents', v_base_vat,
      'first_charge_vat_amount_cents', v_base_vat,
      'revenue_category', v_row.revenue_category
    );
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. create_order: vat_amount_cents schrijven, is_test teruggeven
--
-- Integrale herdefinitie van de live functie. Nieuw: v_is_test-declaratie
-- plus lees, vat_amount_cents in de insert, en de is_test-key in de return.
-- ---------------------------------------------------------------------------

create or replace function tmc.create_order(p_slug text, p_extended_access boolean default false, p_commit_24m boolean default false, p_early_member boolean default false, p_class_session_id uuid default null::uuid, p_pt_session_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pricing jsonb;
  v_existing_id uuid;
  v_order tmc.orders%rowtype;
  v_is_test boolean;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- PR 3: de testmodus leeft op het profiel (spec-facturatie.md 6.1/6.3).
  -- Hier alleen gelezen en teruggegeven; de Mollie-key-keuze op basis
  -- hiervan is PR 4.
  select is_test into v_is_test from tmc.profiles where id = v_uid;
  if v_is_test is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  v_pricing := tmc._compute_order_price(p_slug, p_extended_access, p_commit_24m, p_early_member);
  if not (v_pricing->>'ok')::boolean then
    return v_pricing;
  end if;

  if v_pricing->>'kind' = 'subscription' then
    select id into v_existing_id
    from tmc.memberships
    where profile_id = v_uid
      and status in ('pending', 'active', 'paused', 'cancellation_requested')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_membership');
    end if;

    -- Explicit, friendly guard; the partial unique index is the race backstop.
    select id into v_existing_id
    from tmc.orders
    where profile_id = v_uid and kind = 'subscription' and status in ('draft', 'pending')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_open_order', 'order_id', v_existing_id);
    end if;
  end if;

  insert into tmc.orders (
    profile_id, kind, catalogue_slug, extended_access, commit_months, early_member,
    class_session_id, pt_session_id,
    base_price_cents, extended_access_price_cents, signup_fee_cents, first_charge_cents,
    recurring_cents, billing_cycle_weeks, early_member_price_lock, signup_fee_waiver,
    vat_amount_cents,
    pricing_snapshot, created_by, status, expires_at
  ) values (
    v_uid,
    v_pricing->>'kind',
    p_slug,
    (v_pricing->>'extended_access')::boolean,
    (v_pricing->>'commit_months')::integer,
    (v_pricing->>'em_active')::boolean,
    p_class_session_id, p_pt_session_id,
    (v_pricing->>'base_price_cents')::integer,
    (v_pricing->>'extended_access_price_cents')::integer,
    (v_pricing->>'signup_fee_cents')::integer,
    (v_pricing->>'first_charge_cents')::integer,
    (v_pricing->>'recurring_cents')::integer,
    (v_pricing->>'billing_cycle_weeks')::integer,
    (v_pricing->>'early_member_price_lock')::boolean,
    v_pricing->>'signup_fee_waiver',
    -- PR 3: hier is geen waiver, dus het snapshot-bedrag IS het
    -- geincasseerde bedrag (spec-facturatie.md 3.3).
    (v_pricing->>'first_charge_vat_amount_cents')::integer,
    v_pricing, 'self', 'draft', now() + interval '24 hours'
  )
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'token', v_order.token,
    'first_charge_cents', v_order.first_charge_cents,
    'recurring_cents', v_order.recurring_cents,
    'signup_fee_cents', v_order.signup_fee_cents,
    'extended_access_price_cents', v_order.extended_access_price_cents,
    'commit_months', v_order.commit_months,
    'early_member', v_order.early_member,
    'expires_at', v_order.expires_at,
    'is_test', v_is_test
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. admin_create_order: idem, met de waiver-correcte BTW
--
-- Integrale herdefinitie van de live functie. Nieuw: v_is_test en
-- v_order_vat, vat_amount_cents in de insert, is_test in de return. De
-- BTW over de fee rekent over v_fee_cents, de enkele bron die de bestaande
-- waiver-tak al op 0 zet; bij een waiver is de fee-BTW dus vanzelf 0 en
-- bevat vat_amount_cents de BTW over wat werkelijk geincasseerd wordt
-- (spec-facturatie.md 3.3, bijgewerkt in deze PR).
-- ---------------------------------------------------------------------------

create or replace function tmc.admin_create_order(p_profile_id uuid, p_slug text, p_extended_access boolean default false, p_commit_24m boolean default false, p_early_member boolean default false, p_waive_signup_fee boolean default false, p_expires_in_days integer default 7, p_pt_session_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'tmc', 'extensions'
as $function$
declare
  v_admin_uid uuid := auth.uid();
  v_pricing jsonb;
  v_existing_id uuid;
  v_order tmc.orders%rowtype;
  v_fee_cents integer;
  v_fee_waiver text;
  v_first_charge integer;
  v_expires_days integer;
  v_is_test boolean;
  v_order_vat integer;
begin
  -- DB-level gate. The calling server action additionally runs
  -- requireAdmin() in TS before this is ever invoked (defense in depth,
  -- same layering as tmc.reserve_early_member_slot).
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  if p_profile_id is null then
    raise exception 'p_profile_id is verplicht.' using errcode = '22004';
  end if;

  -- PR 3: testmodus van de KOPER, niet van de admin (spec 6.1/6.3).
  select is_test into v_is_test from tmc.profiles where id = p_profile_id;
  if v_is_test is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  if p_pt_session_id is not null
     and not exists (select 1 from tmc.pt_sessions where id = p_pt_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'pt_session_not_found');
  end if;

  -- Same helper as create_order: admin cannot reach a different price than
  -- self-service for the same selection.
  v_pricing := tmc._compute_order_price(p_slug, p_extended_access, p_commit_24m, p_early_member, true);
  if not (v_pricing->>'ok')::boolean then
    return v_pricing;
  end if;

  if v_pricing->>'kind' = 'subscription' then
    select id into v_existing_id
    from tmc.memberships
    where profile_id = p_profile_id
      and status in ('pending', 'active', 'paused', 'cancellation_requested')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_membership');
    end if;

    select id into v_existing_id
    from tmc.orders
    where profile_id = p_profile_id and kind = 'subscription' and status in ('draft', 'pending')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_open_order', 'order_id', v_existing_id);
    end if;
  end if;

  -- Overstap waiver: manual, admin-only. The Early Member waiver (already
  -- zero in v_pricing when em_active) always wins; overstap only applies
  -- when EM did not already zero the fee -- an order never carries two
  -- waiver reasons.
  v_fee_cents := (v_pricing->>'signup_fee_cents')::integer;
  v_fee_waiver := v_pricing->>'signup_fee_waiver';
  if p_waive_signup_fee and v_fee_waiver is null then
    v_fee_cents := 0;
    v_fee_waiver := 'overstap';
  end if;

  v_first_charge := (v_pricing->>'base_price_cents')::integer
    + (v_pricing->>'extended_access_price_cents')::integer
    + v_fee_cents;

  -- PR 3: BTW over wat werkelijk geincasseerd wordt. v_fee_cents is de
  -- enkele bron (hierboven al 0 gezet bij een waiver), dus geen case:
  -- round(0 * rate / ...) is vanzelf 0. Voor een product is er geen
  -- recurring-key en geen fee; daar is het snapshot-bedrag het bedrag.
  if v_pricing->>'kind' = 'subscription' then
    v_order_vat := (v_pricing->>'recurring_vat_amount_cents')::integer
      + round(v_fee_cents::numeric * (v_pricing->>'signup_fee_vat_rate_bp')::integer
              / (10000 + (v_pricing->>'signup_fee_vat_rate_bp')::integer))::integer;
  else
    v_order_vat := (v_pricing->>'first_charge_vat_amount_cents')::integer;
  end if;

  -- Payment links live longer than an inline checkout; clamp to a sane
  -- range regardless of what the caller passes.
  v_expires_days := greatest(1, least(14, coalesce(p_expires_in_days, 7)));

  insert into tmc.orders (
    profile_id, kind, catalogue_slug, extended_access, commit_months, early_member,
    pt_session_id,
    base_price_cents, extended_access_price_cents, signup_fee_cents,
    first_charge_cents, recurring_cents, billing_cycle_weeks,
    early_member_price_lock, signup_fee_waiver,
    vat_amount_cents,
    pricing_snapshot, created_by, created_by_profile_id, status, expires_at
  ) values (
    p_profile_id,
    v_pricing->>'kind',
    p_slug,
    (v_pricing->>'extended_access')::boolean,
    (v_pricing->>'commit_months')::integer,
    (v_pricing->>'em_active')::boolean,
    p_pt_session_id,
    (v_pricing->>'base_price_cents')::integer,
    (v_pricing->>'extended_access_price_cents')::integer,
    v_fee_cents,
    v_first_charge,
    (v_pricing->>'recurring_cents')::integer,
    (v_pricing->>'billing_cycle_weeks')::integer,
    (v_pricing->>'early_member_price_lock')::boolean,
    v_fee_waiver,
    v_order_vat,
    v_pricing || jsonb_build_object('waive_signup_fee_requested', p_waive_signup_fee),
    'admin', v_admin_uid, 'draft', now() + make_interval(days => v_expires_days)
  )
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'token', v_order.token,
    'first_charge_cents', v_order.first_charge_cents,
    'recurring_cents', v_order.recurring_cents,
    'signup_fee_cents', v_order.signup_fee_cents,
    'extended_access_price_cents', v_order.extended_access_price_cents,
    'commit_months', v_order.commit_months,
    'early_member', v_order.early_member,
    'expires_at', v_order.expires_at,
    'is_test', v_is_test
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Zelfcontrole binnen dezelfde transactie
--
-- De pricing-functie is STABLE, dus dit schrijft niets. De verwachte
-- getallen zijn de PR 2-backfillwaarden (20260818000000): 727 voor 8800
-- (4900 basis + 3900 fee), 784 voor 9500, 1239 voor 15000.
-- Buiten het campagnevenster is v_fee_cents het volle inschrijfgeld; de
-- vergelijking hieronder rekent daarom zelf mee met de actuele
-- catalogusprijzen in plaats van constanten te hardcoden.
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
  v_expect integer;
begin
  -- Abonnement met inschrijfgeld (geen add-on): componenten en som.
  v := tmc._compute_order_price('vrij_trainen_2x', false, false, false);
  if not (v->>'ok')::boolean then
    raise exception 'vat_price_chain: vrij_trainen_2x weigert: %', v->>'reason';
  end if;
  if (v->>'first_charge_vat_amount_cents')::integer
     <> (v->>'vat_amount_cents')::integer
      + (v->>'extended_access_vat_amount_cents')::integer
      + (v->>'signup_fee_vat_amount_cents')::integer then
    raise exception 'vat_price_chain: first_charge_vat is niet de som van de componenten';
  end if;
  if (v->>'recurring_vat_amount_cents')::integer
     <> (v->>'vat_amount_cents')::integer + (v->>'extended_access_vat_amount_cents')::integer then
    raise exception 'vat_price_chain: recurring_vat is niet base + add-on';
  end if;
  -- Zelfde regel als de PR 2-backfill, per component.
  select round(4900::numeric * 900 / 10900)::integer + round(3900::numeric * 900 / 10900)::integer into v_expect;
  if (v->>'signup_fee_cents')::integer = 3900
     and (v->>'first_charge_vat_amount_cents')::integer <> v_expect then
    raise exception 'vat_price_chain: vrij_trainen_2x + fee geeft % ipv %',
      v->>'first_charge_vat_amount_cents', v_expect;
  end if;
  -- Geen add-on: tarief NULL, bedrag 0.
  if v->'extended_access_vat_rate_bp' is distinct from 'null'::jsonb
     or (v->>'extended_access_vat_amount_cents')::integer <> 0 then
    raise exception 'vat_price_chain: zonder add-on hoort ext-tarief NULL en ext-BTW 0 te zijn';
  end if;

  -- Abonnement MET add-on: drie componenten, tarief add-on gevuld.
  v := tmc._compute_order_price('vrij_trainen_2x', true, false, false);
  if not (v->>'ok')::boolean then
    raise exception 'vat_price_chain: vrij_trainen_2x + add-on weigert: %', v->>'reason';
  end if;
  if (v->'extended_access_vat_rate_bp')::text = 'null' then
    raise exception 'vat_price_chain: betaalde add-on hoort een tarief te dragen';
  end if;
  if (v->>'first_charge_vat_amount_cents')::integer
     <> (v->>'vat_amount_cents')::integer
      + (v->>'extended_access_vat_amount_cents')::integer
      + (v->>'signup_fee_vat_amount_cents')::integer then
    raise exception 'vat_price_chain: som klopt niet met add-on';
  end if;

  -- All Access Onbeperkt: extended_access_mode = 'included', dus add-on
  -- van nul euro: bedrag 0 en tarief NULL, niet 0.
  v := tmc._compute_order_price('all_inclusive_unl', true, false, false);
  if not (v->>'ok')::boolean then
    raise exception 'vat_price_chain: all_inclusive_unl weigert: %', v->>'reason';
  end if;
  if (v->>'extended_access_price_cents')::integer <> 0
     or v->'extended_access_vat_rate_bp' is distinct from 'null'::jsonb then
    raise exception 'vat_price_chain: included-add-on hoort prijs 0 en tarief NULL te dragen';
  end if;

  -- Product-tak: de PR 2-backfillwaarden exact.
  v := tmc._compute_order_price('ten_ride_card', false, false, false);
  if (v->>'first_charge_vat_amount_cents')::integer <> 1239 then
    raise exception 'vat_price_chain: ten_ride_card geeft % ipv 1239', v->>'first_charge_vat_amount_cents';
  end if;
  v := tmc._compute_order_price('pt_single', false, false, false);
  if (v->>'first_charge_vat_amount_cents')::integer <> 784 then
    raise exception 'vat_price_chain: pt_single geeft % ipv 784', v->>'first_charge_vat_amount_cents';
  end if;
  if v->>'revenue_category' <> 'personal_training' then
    raise exception 'vat_price_chain: pt_single hoort personal_training te zijn';
  end if;
end $$;

commit;
