-- 20260906000000_decouple_studio_open_from_em_deadline.sql
--
-- Fix/campagne-fasering (discovery-early-member fase 1, 2026-09-06):
-- STUDIO_OPENING_DATE (de "is de studio open"-vraag) en de Early Member
-- deadline (de "loopt de actie nog"-vraag) waren via tmc.early_member_pools
-- (opens_at / closes_at) tot één campagnevenster samengesmolten. Dat maakte
-- het onmogelijk om de EM-actie te laten lopen terwijl de studio nog niet
-- open is (nieuwe openingsdatum 2026-09-15 ligt na vandaag), want opens_at
-- was zowel de studio-openingsdatum ALS de server-side EM-ondergrens in
-- _compute_order_price (zie spec-membership-flow.md:120: "opens_at is de
-- facto de Early Member-killswitch").
--
-- Deze migratie:
-- 1. Verzet closes_at naar de nieuwe EM-deadline (EARLY_MEMBER_DEADLINE in
--    src/lib/campaign.ts, 2026-11-01T00:00:00+01:00 -- wintertijd, na de
--    laatste-zondag-van-oktober DST-omslag).
-- 2. Verwijdert de opens_at-ondergrens uit _compute_order_price. EM is
--    voortaan per direct actief zodra p_early_member=true en de rij
--    early_member_eligible is, tot en met closes_at. Geen aparte
--    EM-startdatum: "EARLY_MEMBER_START = direct actief" heeft dus geen
--    eigen kolom nodig.
-- 3. Laat early_member_pools.opens_at ONGEBRUIKT staan (kolom blijft
--    bestaan, geen lezer meer in de prijsfunctie). STUDIO_OPENING_DATE
--    wordt voortaan uitsluitend een TS-constante (src/lib/constants.ts),
--    puur voor de "is de studio open"-copy, zonder DB-afhankelijkheid.
--
-- Terugwerkende kracht: geen. Zelfde als 20260813: _compute_order_price
-- wordt alleen bij orderaanmaak aangeroepen, bestaande orders snapshotten
-- hun prijzen.

-- ---------------------------------------------------------------------------
-- 1. closes_at op beide pools gelijk aan EARLY_MEMBER_DEADLINE.
-- ---------------------------------------------------------------------------

update tmc.early_member_pools
set closes_at = timestamptz '2026-11-01 00:00:00+01';

do $$
declare
  v_wrong int;
begin
  select count(*) into v_wrong
  from tmc.early_member_pools
  where closes_at <> timestamptz '2026-11-01 00:00:00+01';

  if v_wrong <> 0 then
    raise exception
      'em_deadline: % rij(en) hebben niet de verwachte closes_at', v_wrong;
  end if;
end $$;

comment on column tmc.early_member_pools.opens_at is
  'ONGEBRUIKT sinds 20260906: was de facto zowel studio-openingsdatum als '
  'EM-ondergrens in _compute_order_price, wat de EM-actie blokkeerde totdat '
  'de studio open was. De ondergrens is uit _compute_order_price verwijderd '
  '(EM is per direct actief tot closes_at); STUDIO_OPENING_DATE in '
  'src/lib/constants.ts is de nieuwe, losstaande bron voor de '
  '"is de studio open"-vraag en heeft geen DB-kolom. Kolom blijft bestaan '
  'i.p.v. drop, geen lezer meer.';

comment on column tmc.early_member_pools.closes_at is
  'Enige overgebleven grens uit deze tabel: de Early Member-deadline. '
  'Zelfde instant als EARLY_MEMBER_DEADLINE in src/lib/campaign.ts. Bron '
  'van waarheid voor zowel de UI (via get_campaign_window()) als de '
  'server-gate in _compute_order_price (tmc.get_campaign_deadline()).';

comment on function tmc.get_campaign_window() is
  'closes_at uit tmc.early_member_pools, ontsloten voor de UI (campaign.ts). '
  'Retourneert ook opens_at voor achterwaartse compatibiliteit van de '
  'RPC-vorm, maar sinds 20260906 leest geen enkele caller (UI noch '
  '_compute_order_price) dat veld nog.';

-- ---------------------------------------------------------------------------
-- 2. _compute_order_price: EM-ondergrens (v_opens) vervalt. Enige
--    inhoudelijke wijziging t.o.v. de live definitie (pg_get_functiondef,
--    2026-09-06): v_opens-declaratie, de min(opens_at)-select en de
--    ondergrens-voorwaarde zijn weg uit v_phase_open. Verder ongewijzigd,
--    inclusief de BTW-velden uit 20260819.
-- ---------------------------------------------------------------------------

create or replace function tmc._compute_order_price(p_slug text, p_extended_access boolean, p_commit_24m boolean, p_early_member boolean, p_admin_context boolean DEFAULT false)
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
  -- Sinds 20260906 is de ondergrens (was: opens_at / studio-opening)
  -- verwijderd. EM is per direct actief zodra early_member_eligible en
  -- vóór closes_at, ongeacht of de studio al open is (fix/campagne-fasering:
  -- de twee toestanden zijn onafhankelijk combineerbaar).
  v_deadline := tmc.get_campaign_deadline();
  v_phase_open := v_deadline is not null and now() < v_deadline;
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
-- Grants: signatuur ongewijzigd (patroon 20260813). _compute_order_price
-- blijft intern-only; hier alleen defensief geasserteerd, geen her-grant
-- nodig omdat CREATE OR REPLACE de ACL's van een ongewijzigde signatuur
-- laat staan.
-- ---------------------------------------------------------------------------

do $$
begin
  if (
        has_function_privilege('anon', 'tmc._compute_order_price(text, boolean, boolean, boolean, boolean)', 'execute')
     or has_function_privilege('authenticated', 'tmc._compute_order_price(text, boolean, boolean, boolean, boolean)', 'execute')
     or has_function_privilege('service_role', 'tmc._compute_order_price(text, boolean, boolean, boolean, boolean)', 'execute')
  ) then
    raise exception
      'decouple_studio_open_from_em_deadline: _compute_order_price is onbedoeld extern uitvoerbaar';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Test: een order gedateerd na de deadline krijgt de reguliere prijs, geen
-- EM-prijs, ongeacht p_early_member=true. Draait binnen een sub-transactie
-- (savepoint via de EXCEPTION-clause) die closes_at tijdelijk naar het
-- verleden zet en altijd terugdraait, zodat de zojuist gezette
-- EARLY_MEMBER_DEADLINE (stap 1) nooit blijvend wordt overschreven. Er is
-- geen aparte test-runner in dit repo (CI is de Vercel-build); dit is de
-- gebruikelijke vorm hier (patroon 20260813, 24m-override-asserties).
-- ---------------------------------------------------------------------------

do $$
declare
  v_result jsonb;
  v_regular_price integer;
begin
  begin
    update tmc.early_member_pools set closes_at = now() - interval '1 day';

    select price_cents into v_regular_price
    from tmc.catalogue where slug = 'all_inclusive_unl' and is_active = true;

    v_result := tmc._compute_order_price('all_inclusive_unl', false, false, true, false);

    if (v_result->>'em_active')::boolean is distinct from false then
      raise exception
        'em_after_deadline test failed: em_active=% (verwacht false) voor een order na de deadline',
        v_result->>'em_active';
    end if;

    if (v_result->>'base_price_cents')::integer is distinct from v_regular_price then
      raise exception
        'em_after_deadline test failed: base_price_cents=% (verwacht reguliere prijs %)',
        v_result->>'base_price_cents', v_regular_price;
    end if;

    raise exception using message = '__em_after_deadline_test_rollback__';
  exception when others then
    if sqlerrm <> '__em_after_deadline_test_rollback__' then
      raise;
    end if;
    -- Test geslaagd: rolt de tijdelijke closes_at-wijziging terug binnen
    -- deze sub-transactie, de echte EARLY_MEMBER_DEADLINE (stap 1) blijft
    -- staan.
  end;
end $$;

-- Na de test-rollback: bevestig dat de echte deadline (stap 1) nog staat.
do $$
begin
  if exists (
    select 1 from tmc.early_member_pools
    where closes_at <> timestamptz '2026-11-01 00:00:00+01'
  ) then
    raise exception
      'em_deadline: closes_at is na de test-rollback niet meer de verwachte EARLY_MEMBER_DEADLINE';
  end if;
end $$;
