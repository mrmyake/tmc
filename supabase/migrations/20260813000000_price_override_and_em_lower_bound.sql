-- 20260813000000_price_override_and_em_lower_bound.sql
--
-- Twee gekoppelde prijsfixes (discovery fix/price-override-and-em-lower-bound,
-- 2026-07-23):
--
-- 1. Display-equals-charge voor de 24-maands prijs. De generated column
--    price_cents_24m_computed leverde round(price_cents * factor) op volle
--    centen (bv. 10028 = EUR 100,28), terwijl formatPriceEuro overal op
--    hele euro's toont (EUR 100). De override-kolom heeft al voorrang in de
--    generation expression (coalesce(override, round(...))); die wordt hier
--    gevuld met price_cents * factor, NAAR BENEDEN afgerond op hele euro's.
--    Naar beneden is bewust: de afgeschreven prijs mag nooit hoger zijn dan
--    de getoonde prijs. Het "8% korting"-label blijft daarmee een
--    ondergrens (werkelijke korting 8,0 tot 8,9 procent), geen rekenfout.
--
-- 2. Ondergrens op de Early Member-gate. _compute_order_price gate'te
--    alleen op now() < closes_at; de openingsdatum bestond uitsluitend in
--    de UI (STUDIO_OPENING_DATE). Een directe create_order-aanroep kon dus
--    voor de opening al EM-voorwaarden vastleggen. Nieuw: opens_at op
--    tmc.early_member_pools, en de gate wordt
--    now() >= opens_at and now() < closes_at, beide uit dezelfde bron.
--    get_campaign_window() ontsluit beide grenzen voor de app;
--    get_campaign_deadline() blijft bestaan.
--
-- Terugwerkende kracht: geen. _compute_order_price wordt uitsluitend door
-- create_order aangeroepen op orderaanmaak; orders snapshotten hun prijzen
-- en activate_order herberekent niets. Alleen orders na deze migratie zien
-- de nieuwe waarden.

-- ---------------------------------------------------------------------------
-- 1a. Overrides vullen: floor naar hele euro's van price_cents * factor.
-- ---------------------------------------------------------------------------

update tmc.catalogue
set price_cents_24m_override =
  (floor(price_cents * commit_24m_discount_factor / 100) * 100)::integer
where commit_24m_discount_factor is not null;

do $$
declare
  v_updated int;
begin
  select count(*) into v_updated
  from tmc.catalogue
  where commit_24m_discount_factor is not null;

  -- Rijaantal: op 2026-07-23 exact 15 plan-rijen met een factor (5
  -- families x 3 frequenties, inclusief de inactieve kids/senior-rijen).
  -- Wijkt dit af, dan is de catalogus veranderd en moet deze migratie
  -- herbeoordeeld worden in plaats van stilletjes een andere set te raken.
  if v_updated <> 15 then
    raise exception
      'price_override: % rijen met factor, verwacht 15', v_updated;
  end if;

  -- Elke override op hele euro's, positief, en nooit hoger dan de oude
  -- computed-waarde round(price * factor).
  if exists (
    select 1 from tmc.catalogue
    where commit_24m_discount_factor is not null
      and (price_cents_24m_override is null
        or price_cents_24m_override % 100 <> 0
        or price_cents_24m_override <= 0
        or price_cents_24m_override
             > round(price_cents * commit_24m_discount_factor)::integer)
  ) then
    raise exception
      'price_override: een override is geen hele euro, niet positief, of hoger dan de oude computed-waarde';
  end if;

  -- Rijen zonder factor blijven zonder override.
  if exists (
    select 1 from tmc.catalogue
    where commit_24m_discount_factor is null
      and price_cents_24m_override is not null
  ) then
    raise exception
      'price_override: rij zonder factor heeft onverwacht een override';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1b. Vergrendeling: override en factor mogen nooit los van elkaar
--     bewegen. De override wint permanent van de factor in de generated
--     column, dus een factor- of prijswijziging zonder override-update zou
--     het kortingslabel veranderen maar niet de afgeschreven prijs, of
--     andersom. Deze CHECK maakt dat een harde schrijffout in plaats van
--     een stille drift: elke update van price_cents of factor dwingt een
--     bijpassende override af in dezelfde statement. Er is geen aparte
--     test-runner in dit repo (CI is de Vercel-build); deze constraint is
--     de sterkste en lichtste vorm, hij draait bij elke write en elke
--     db push.
-- ---------------------------------------------------------------------------

alter table tmc.catalogue
  add constraint catalogue_24m_override_matches_factor check (
    (commit_24m_discount_factor is null and price_cents_24m_override is null)
    or (
      commit_24m_discount_factor is not null
      and price_cents_24m_override is not null
      and price_cents_24m_override =
        (floor(price_cents * commit_24m_discount_factor / 100) * 100)::integer
    )
  );

comment on column tmc.catalogue.price_cents_24m_override is
  'Definitieve 24-maands prijs in centen, hele euro''s, naar beneden '
  'afgerond vanaf price_cents * commit_24m_discount_factor. Heeft via '
  'coalesce() in price_cents_24m_computed VOORRANG op de factor-berekening. '
  'Altijd samen bijwerken met price_cents en commit_24m_discount_factor; '
  'de CHECK-constraint catalogue_24m_override_matches_factor dwingt dat af.';

comment on column tmc.catalogue.commit_24m_discount_factor is
  'Voedt sinds 20260813 alleen nog het kortingspercentage-label in de UI '
  '(commit24mDiscountPercent) en de formule voor price_cents_24m_override; '
  'de afgeschreven prijs komt uit de override. Nooit los wijzigen: de '
  'CHECK-constraint catalogue_24m_override_matches_factor eist dat de '
  'override gelijk blijft aan floor(price_cents * factor) op hele euro''s.';

-- ---------------------------------------------------------------------------
-- 2a. opens_at op early_member_pools.
-- ---------------------------------------------------------------------------

alter table tmc.early_member_pools add column opens_at timestamptz;

update tmc.early_member_pools
set opens_at = timestamptz '2026-08-15 00:00:00+02';

alter table tmc.early_member_pools alter column opens_at set not null;

comment on column tmc.early_member_pools.opens_at is
  'Ondergrens van het EM-venster: EM-voorwaarden gelden pas vanaf dit '
  'moment (studio-opening). Samen met closes_at de enige bron van waarheid '
  'voor de campagnedatums; STUDIO_OPENING_DATE in src/lib/constants.ts is '
  'sinds 20260813 alleen nog een outage-fallback.';

do $$
begin
  if exists (
    select 1 from tmc.early_member_pools
    where opens_at >= closes_at
  ) then
    raise exception 'em_lower_bound: opens_at ligt niet voor closes_at';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2b. get_campaign_window(): beide grenzen uit een aanroep. Zelfde
--     aggregatie-semantiek als get_campaign_deadline (max over de pools,
--     min voor de opening), die functie blijft ongewijzigd bestaan.
-- ---------------------------------------------------------------------------

create or replace function tmc.get_campaign_window()
returns jsonb
language sql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
  select jsonb_build_object(
    'opens_at', min(opens_at),
    'closes_at', max(closes_at)
  )
  from tmc.early_member_pools;
$function$;

comment on function tmc.get_campaign_window() is
  'Campagnevenster (opens_at, closes_at) uit tmc.early_member_pools. '
  'Bron van waarheid voor zowel de UI-fase (campaign.ts) als de '
  'server-gate in _compute_order_price.';

-- ---------------------------------------------------------------------------
-- 2c. _compute_order_price: EM-gate krijgt de ondergrens. Signatuur
--     ongewijzigd, dus CREATE OR REPLACE behoudt de ACL's; grants worden
--     hieronder expliciet hersteld en geasserteerd (patroon 20260810).
--     Enige inhoudelijke wijziging t.o.v. de live definitie (opgehaald met
--     pg_get_functiondef op 2026-07-23): v_opens erbij en
--     v_phase_open := now() >= v_opens and now() < v_deadline.
-- ---------------------------------------------------------------------------

create or replace function tmc._compute_order_price(
  p_slug text,
  p_extended_access boolean,
  p_commit_24m boolean,
  p_early_member boolean,
  p_admin_context boolean default false
)
returns jsonb
language plpgsql
stable
security definer
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
      'early_member_price_lock', v_lock
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
      'early_member_price_lock', false
    );
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Grants: expliciet herstellen op de bedoelde staat (patroon 20260810).
-- _compute_order_price is intern (alleen via de SECURITY DEFINER-callers
-- create_order / admin_create_order); get_campaign_window spiegelt
-- get_campaign_deadline (publieke leesfunctie, ook voor anon).
-- ---------------------------------------------------------------------------

revoke execute on function tmc._compute_order_price(text, boolean, boolean, boolean, boolean)
  from public, anon, authenticated, service_role;

revoke execute on function tmc.get_campaign_window() from public;
grant execute on function tmc.get_campaign_window() to anon, authenticated, service_role;

do $$
begin
  if not (
        not has_function_privilege('anon', 'tmc._compute_order_price(text, boolean, boolean, boolean, boolean)', 'execute')
    and not has_function_privilege('authenticated', 'tmc._compute_order_price(text, boolean, boolean, boolean, boolean)', 'execute')
    and not has_function_privilege('service_role', 'tmc._compute_order_price(text, boolean, boolean, boolean, boolean)', 'execute')
    and     has_function_privilege('anon', 'tmc.get_campaign_window()', 'execute')
    and     has_function_privilege('authenticated', 'tmc.get_campaign_window()', 'execute')
    and     has_function_privilege('service_role', 'tmc.get_campaign_window()', 'execute')
    and     has_function_privilege('anon', 'tmc.get_campaign_deadline()', 'execute')
  ) then
    raise exception
      'price_override_and_em_lower_bound: EXECUTE-grants staan niet zoals bedoeld';
  end if;
end $$;
