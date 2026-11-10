-- Product toekennen zonder betaling (spec-facturatie.md 9.8): de databaseregels
-- van tmc.admin_grant_product en tmc.admin_revoke_product_grant met eigen
-- wegwerp-fixtures, alles in een transactie die aan het einde terugrolt.
-- Draaien tegen een database waar migratie 20261112090000 op staat:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-product-grants.sql
-- of in een rollback-transactie via de MCP. Elke PASS is een notice; een fout
-- stopt het script. Raakt geen bestaande rijen: profielen, facturen,
-- betalingen en memberships worden hier aangemaakt en weer weggerold. De
-- facturen komen uit de TEST-reeks; het verbruikte nummer rolt mee terug.
--
-- Gate-simulatie: de RPC's lezen auth.uid() en tmc.is_admin() (de rol uit
-- tmc.profiles). We zetten request.jwt.claims; de functies draaien als
-- eigenaar, precies zoals via PostgREST.

begin;

-- Maakt een gefinaliseerde TEST-factuur met een regel, optioneel betaald
-- (overboeking, zelfde vorm als markInvoicePaid).
create function pg_temp.mk_invoice(
  p_profile uuid, p_slug text, p_qty numeric, p_paid boolean
) returns uuid
language plpgsql
as $$
declare
  v_series uuid;
  v_inv uuid;
  v_pay uuid;
  v_res jsonb;
  v_gross integer := (15000 * p_qty)::integer;
  v_vat integer := round((15000 * p_qty) * 900 / 10900)::integer;
begin
  insert into tmc.invoice_series (code, fiscal_year, is_test, prefix)
  values ('TEST', extract(year from current_date)::integer, true, 'TEST-')
  on conflict (code, fiscal_year) do nothing;
  select id into v_series from tmc.invoice_series
  where code = 'TEST' and fiscal_year = extract(year from current_date)::integer;

  insert into tmc.invoices (series_id, fiscal_year, is_test, profile_id)
  values (v_series, extract(year from current_date)::integer, true, p_profile)
  returning id into v_inv;

  insert into tmc.invoice_lines (
    invoice_id, line_no, catalogue_slug, description, quantity,
    unit_net_cents, vat_rate_bp, net_cents, vat_cents, gross_cents, revenue_category
  ) values (
    v_inv, 1, p_slug, 'Testregel', p_qty,
    13761, 900, v_gross - v_vat, v_vat, v_gross, 'les_tegoed'
  );

  v_res := tmc.finalize_invoice(v_inv);
  if not (v_res->>'ok')::boolean then
    raise exception 'fixture: finalize_invoice gaf %', v_res;
  end if;

  if p_paid then
    insert into tmc.payments (
      mollie_payment_id, profile_id, invoice_id, amount_cents, status, method,
      description, paid_at, kind, is_test
    ) values (
      'bank:' || v_inv, p_profile, v_inv, v_gross, 'paid', 'banktransfer',
      'Testbetaling', now(), 'invoice', true
    ) returning id into v_pay;
    update tmc.invoices set payment_id = v_pay where id = v_inv;
  end if;

  return v_inv;
end;
$$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_res jsonb;
  v_m tmc.memberships%rowtype;
  v_g tmc.product_grants%rowtype;
  v_inv_paid uuid;
  v_inv_open uuid;
  v_inv_other uuid;
  v_inv_qty2 uuid;
  v_inv_noslug uuid;
  v_inv_credited uuid;
  v_inv_reversed uuid;
  v_draft uuid;
  v_credit uuid;
  v_series uuid;
  v_grant uuid;
  v_count integer;
  v_raised boolean;
begin
  -- Fixtures --------------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
         '{"provider":"email","providers":["email"]}'::jsonb,
         json_build_object('first_name', 'Test', 'last_name', u.ln)::jsonb, now(), now()
  from (values
    (v_admin, 'grant-test-admin@test.invalid', 'Admin'),
    (v_member, 'grant-test-member@test.invalid', 'Lid'),
    (v_other, 'grant-test-other@test.invalid', 'Ander')
  ) as u(id, email, ln);
  update tmc.profiles set role = 'admin', is_test = true where id = v_admin;
  update tmc.profiles set role = 'member', is_test = true where id in (v_member, v_other);

  -- Poort: een lid mag niet toekennen of intrekken --------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_member::text, true);
  v_raised := false;
  begin
    perform tmc.admin_grant_product(v_member, 'ten_ride_card', 'mag niet');
  exception when insufficient_privilege then v_raised := true;
  end;
  assert v_raised, 'lid kon admin_grant_product aanroepen';
  v_raised := false;
  begin
    perform tmc.admin_revoke_product_grant(gen_random_uuid(), 'mag niet');
  exception when insufficient_privilege then v_raised := true;
  end;
  assert v_raised, 'lid kon admin_revoke_product_grant aanroepen';
  raise notice 'PASS 1: alleen admins';

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  -- Toekennen zonder factuur ------------------------------------------------
  v_res := tmc.admin_grant_product(v_member, 'ten_ride_card', '  cadeau van de studio  ');
  assert (v_res->>'ok')::boolean, 'rittenkaart toekennen faalde: ' || v_res::text;
  select * into v_m from tmc.memberships where id = (v_res->>'membership_id')::uuid;
  assert v_m.plan_type = 'ten_ride_card' and v_m.plan_variant = 'ten_ride_card', 'plan_type of variant fout';
  assert v_m.credits_total = 10 and v_m.credits_remaining = 10, 'credits niet uit catalogus';
  assert v_m.credits_expires_at = (current_date + interval '6 months')::date, 'geldigheid niet 6 maanden';
  assert v_m.price_per_cycle_cents = 0 and v_m.billing_cycle_weeks = 0 and v_m.commit_months = 0, 'prijs of cyclus niet 0';
  assert v_m.status = 'active' and v_m.source = 'admin_manual', 'status of source fout';
  select * into v_g from tmc.product_grants where id = (v_res->>'grant_id')::uuid;
  assert v_g.membership_id = v_m.id and v_g.profile_id = v_member, 'herkomstrij wijst verkeerd';
  assert v_g.reason = 'cadeau van de studio', 'reden niet getrimd';
  assert v_g.granted_by = v_admin and v_g.granted_via = 'admin', 'toegekend door fout';
  assert v_g.invoice_id is null and not v_g.duplicate_override, 'factuur of override fout';
  select count(*) into v_count from tmc.events
  where type = 'product.granted' and subject_id = v_m.id and actor_id = v_admin
    and payload->>'grant_id' = v_g.id::text;
  assert v_count = 1, 'event product.granted ontbreekt';
  select count(*) into v_count from tmc.orders where profile_id = v_member;
  assert v_count = 0, 'er is een order ontstaan';
  select count(*) into v_count from tmc.payments where profile_id = v_member;
  assert v_count = 0, 'er is een payments-rij ontstaan';
  raise notice 'PASS 2: rittenkaart, 10 credits, 6 maanden, geen order en geen betaling';

  v_res := tmc.admin_grant_product(v_member, 'pt_10', 'pakket');
  assert (v_res->>'ok')::boolean, 'pt_10 faalde';
  select * into v_m from tmc.memberships where id = (v_res->>'membership_id')::uuid;
  assert v_m.plan_type = 'pt_package' and v_m.plan_variant = 'pt_10' and v_m.credits_total = 10
    and v_m.credits_expires_at is null, 'pt_10 fout';
  v_res := tmc.admin_grant_product(v_member, 'duo_single', 'duo');
  select * into v_m from tmc.memberships where id = (v_res->>'membership_id')::uuid;
  assert v_m.plan_type = 'pt_package' and v_m.plan_variant = 'duo_single' and v_m.credits_total = 1
    and v_m.credits_expires_at is null, 'duo_single fout';
  raise notice 'PASS 3: PT en duo zonder vervaldatum';

  -- Weigeren ----------------------------------------------------------------
  assert tmc.admin_grant_product(v_member, 'all_inclusive_unl', 'x')->>'reason' = 'product_not_grantable', 'abonnement niet geweigerd';
  assert tmc.admin_grant_product(v_member, 'vrij_trainen_2x', 'x')->>'reason' = 'product_not_grantable', 'abonnement niet geweigerd';
  assert tmc.admin_grant_product(v_member, 'drop_in', 'x')->>'reason' = 'product_not_grantable', 'drop_in niet geweigerd';
  assert tmc.admin_grant_product(v_member, 'extended_access', 'x')->>'reason' = 'product_not_grantable', 'add-on niet geweigerd';
  assert tmc.admin_grant_product(v_member, 'signup_fee', 'x')->>'reason' = 'product_not_grantable', 'fee niet geweigerd';
  assert tmc.admin_grant_product(v_member, 'program_studio_12w', 'x')->>'reason' = 'product_not_grantable', 'programma niet geweigerd';
  update tmc.catalogue set is_active = false where slug = 'ten_ride_card_senior';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card_senior', 'x')->>'reason' = 'product_not_grantable', 'inactief product niet geweigerd';
  assert tmc.admin_grant_product(v_member, 'bestaat_niet', 'x')->>'reason' = 'product_not_found', 'onbekende slug';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', '   ')->>'reason' = 'invalid_reason', 'lege reden';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', null)->>'reason' = 'invalid_reason', 'null reden';
  assert tmc.admin_grant_product(gen_random_uuid(), 'ten_ride_card', 'x')->>'reason' = 'profile_not_found', 'onbekend profiel';
  raise notice 'PASS 4: abonnement, drop_in, add-on, fee, programma, inactief, lege reden geweigerd';

  -- Factuurcontroles ----------------------------------------------------------
  v_inv_paid := pg_temp.mk_invoice(v_member, 'ten_ride_card', 1, true);
  v_inv_open := pg_temp.mk_invoice(v_member, 'ten_ride_card', 1, false);
  v_inv_other := pg_temp.mk_invoice(v_other, 'ten_ride_card', 1, true);
  v_inv_qty2 := pg_temp.mk_invoice(v_member, 'ten_ride_card', 2.5, true);
  v_inv_noslug := pg_temp.mk_invoice(v_member, null, 1, true);
  v_inv_credited := pg_temp.mk_invoice(v_member, 'ten_ride_card', 1, true);
  v_inv_reversed := pg_temp.mk_invoice(v_member, 'ten_ride_card', 1, true);

  select series_id into v_series from tmc.invoices where id = v_inv_paid;
  insert into tmc.invoices (series_id, fiscal_year, is_test, profile_id)
  values (v_series, extract(year from current_date)::integer, true, v_member)
  returning id into v_draft;

  -- Gefinaliseerde creditnota op v_inv_credited, direct ingevoegd.
  insert into tmc.invoices (
    series_id, fiscal_year, is_test, profile_id, status, number, invoice_number,
    issued_at, bill_to_name, bill_to_email, subtotal_net_cents, vat_total_cents,
    total_gross_cents, credit_of_invoice_id
  ) values (
    v_series, extract(year from current_date)::integer, true, v_member, 'finalised', 999999,
    'TEST-GRANT-CREDIT', current_date, 'Test Lid', 'grant-test-member@test.invalid',
    -13761, -1239, -15000, v_inv_credited
  ) returning id into v_credit;

  update tmc.payments set charged_back_amount_cents = amount_cents, charged_back_at = now()
  where invoice_id = v_inv_reversed;

  assert tmc.admin_grant_product(v_member, 'ten_ride_card', 'x', gen_random_uuid())->>'reason' = 'invoice_not_found', 'onbekende factuur';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', 'x', v_inv_other)->>'reason' = 'invoice_profile_mismatch', 'factuur van een ander';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', 'x', v_draft)->>'reason' = 'invoice_not_finalised', 'conceptfactuur';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', 'x', v_inv_open)->>'reason' = 'invoice_not_paid', 'open factuur';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', 'x', v_inv_open, true)->>'reason' = 'invoice_not_paid', 'open factuur met override';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', 'x', v_credit)->>'reason' = 'invoice_is_credit_note', 'creditnota';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', 'x', v_inv_credited)->>'reason' = 'invoice_credited', 'gecrediteerde factuur';
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', 'x', v_inv_reversed)->>'reason' = 'invoice_payment_reversed', 'gestorneerde betaling';
  update tmc.profiles set is_test = false where id = v_member;
  assert tmc.admin_grant_product(v_member, 'ten_ride_card', 'x', v_inv_paid)->>'reason' = 'invoice_test_mismatch', 'testmodus wijkt af';
  update tmc.profiles set is_test = true where id = v_member;
  raise notice 'PASS 5: factuurcontroles (ander profiel, concept, open, creditnota, gecrediteerd, gestorneerd, testmodus)';

  -- Dubbele toekenning --------------------------------------------------------
  v_res := tmc.admin_grant_product(v_member, 'ten_ride_card', 'bij factuur', v_inv_paid);
  assert (v_res->>'ok')::boolean and not (v_res->>'duplicate_override')::boolean, 'eerste toekenning bij factuur: ' || v_res::text;
  v_grant := (v_res->>'grant_id')::uuid;
  select * into v_g from tmc.product_grants where id = v_grant;
  assert v_g.invoice_id = v_inv_paid, 'invoice_id niet vastgelegd';

  v_res := tmc.admin_grant_product(v_member, 'ten_ride_card', 'nog een', v_inv_paid);
  assert v_res->>'reason' = 'already_granted' and (v_res->>'granted')::int = 1 and (v_res->>'allowed')::int = 1,
    'tweede toekenning niet geweigerd: ' || v_res::text;
  -- Een ander product dat niet op de factuur staat mag een keer.
  v_res := tmc.admin_grant_product(v_member, 'pt_single', 'niet op factuur', v_inv_paid);
  assert (v_res->>'ok')::boolean, 'slug niet op factuur: eerste keer';
  assert tmc.admin_grant_product(v_member, 'pt_single', 'x', v_inv_paid)->>'reason' = 'already_granted', 'slug niet op factuur: tweede keer';

  v_res := tmc.admin_grant_product(v_member, 'ten_ride_card', 'bewust dubbel', v_inv_paid, true);
  assert (v_res->>'ok')::boolean and (v_res->>'duplicate_override')::boolean, 'override werkte niet';
  select duplicate_override into v_raised from tmc.product_grants where id = (v_res->>'grant_id')::uuid;
  assert v_raised, 'override niet vastgelegd';

  -- Aantal 2,5 op de factuur: twee toekenningen, de derde geweigerd.
  assert (tmc.admin_grant_product(v_member, 'ten_ride_card', 'q1', v_inv_qty2)->>'ok')::boolean, 'aantal 2: eerste';
  assert (tmc.admin_grant_product(v_member, 'ten_ride_card', 'q2', v_inv_qty2)->>'ok')::boolean, 'aantal 2: tweede';
  v_res := tmc.admin_grant_product(v_member, 'ten_ride_card', 'q3', v_inv_qty2);
  assert v_res->>'reason' = 'already_granted' and (v_res->>'allowed')::int = 2, 'aantal 2: derde niet geweigerd';

  -- Factuur zonder slug op de regels: een keer, daarna geweigerd.
  assert (tmc.admin_grant_product(v_member, 'duo_10', 'vrije regel', v_inv_noslug)->>'ok')::boolean, 'vrije regel: eerste';
  assert tmc.admin_grant_product(v_member, 'duo_10', 'x', v_inv_noslug)->>'reason' = 'already_granted', 'vrije regel: tweede';
  raise notice 'PASS 6: dubbele toekenning geweigerd, aantal van de regels telt, override vastgelegd';

  -- Intrekken -----------------------------------------------------------------
  assert tmc.admin_revoke_product_grant(v_grant, '  ')->>'reason' = 'invalid_reason', 'intrekken zonder reden';
  assert tmc.admin_revoke_product_grant(gen_random_uuid(), 'x')->>'reason' = 'grant_not_found', 'onbekende toekenning';
  v_res := tmc.admin_revoke_product_grant(v_grant, 'verkeerd lid');
  assert (v_res->>'ok')::boolean, 'intrekken faalde: ' || v_res::text;
  select * into v_g from tmc.product_grants where id = v_grant;
  assert v_g.revoked_at is not null and v_g.revoked_by = v_admin and v_g.revoke_reason = 'verkeerd lid', 'intrekking niet vastgelegd';
  select * into v_m from tmc.memberships where id = v_g.membership_id;
  assert v_m.status = 'cancelled' and v_m.end_date = current_date and v_m.cancellation_effective_date is null, 'membership niet geannuleerd';
  select count(*) into v_count from tmc.events where type = 'product.grant_revoked' and subject_id = v_m.id;
  assert v_count = 1, 'event product.grant_revoked ontbreekt';
  assert tmc.admin_revoke_product_grant(v_grant, 'nog eens')->>'reason' = 'already_revoked', 'dubbel intrekken';

  -- De factuur telt de ingetrokken toekenning niet meer mee: qty2 stond op
  -- 2 van 2; een intrekken en er past er weer een.
  select id into v_grant from tmc.product_grants
  where invoice_id = v_inv_qty2 and revoked_at is null order by granted_at limit 1;
  assert (tmc.admin_revoke_product_grant(v_grant, 'vrijgeven')->>'ok')::boolean, 'intrekken qty2';
  assert (tmc.admin_grant_product(v_member, 'ten_ride_card', 'opnieuw', v_inv_qty2)->>'ok')::boolean, 'factuur niet vrijgegeven na intrekken';

  -- Verbruikt tegoed: weigeren.
  select id, membership_id into v_grant, v_draft from tmc.product_grants
  where invoice_id = v_inv_noslug and revoked_at is null;
  v_res := tmc.apply_credit_adjustment(v_draft, -1, 'test verbruik', 'manual', 'admin', v_admin);
  assert (v_res->>'ok')::boolean, 'fixture: debit faalde';
  v_res := tmc.admin_revoke_product_grant(v_grant, 'te laat');
  assert v_res->>'reason' = 'credits_used' and (v_res->>'credits_remaining')::int = 9, 'verbruikte toekenning niet geweigerd: ' || v_res::text;
  v_res := tmc.apply_credit_adjustment(v_draft, 3, 'test bijschrijven', 'manual', 'admin', v_admin);
  assert tmc.admin_revoke_product_grant(v_grant, 'te veel')->>'reason' = 'credits_adjusted', 'bijgeschreven toekenning niet geweigerd';
  raise notice 'PASS 7: intrekken alleen ongebruikt, factuur weer vrij, verbruikt geweigerd';

  -- Geen directe schrijfpaden -------------------------------------------------
  -- Ook een admin kan de herkomsttabel niet direct schrijven; de kern is voor
  -- geen enkele API-rol aanroepbaar.
  set local role authenticated;
  v_raised := false;
  begin
    insert into tmc.product_grants (membership_id, profile_id, catalogue_slug, credits, reason)
    values (v_draft, v_member, 'ten_ride_card', 10, 'direct');
  exception when insufficient_privilege then v_raised := true;
  end;
  assert v_raised, 'directe insert in product_grants lukte';
  v_raised := false;
  begin
    update tmc.product_grants set reason = 'aangepast' where id = v_grant;
  exception when insufficient_privilege then v_raised := true;
  end;
  assert v_raised, 'directe update op product_grants lukte';
  -- De kern: via has_function_privilege, niet via een echte aanroep (een
  -- geweigerde SECURITY DEFINER-aanroep laat de lokale PG17 crashen, zie
  -- scripts/test-profiles-lockdown.sql).
  assert not has_function_privilege('authenticated', 'tmc._grant_product_core(uuid, text, text, uuid, boolean, text, uuid)', 'execute')
    and not has_function_privilege('anon', 'tmc._grant_product_core(uuid, text, text, uuid, boolean, text, uuid)', 'execute')
    and not has_function_privilege('service_role', 'tmc._grant_product_core(uuid, text, text, uuid, boolean, text, uuid)', 'execute'),
    'de kern is direct aanroepbaar';
  assert not has_function_privilege('anon', 'tmc.admin_grant_product(uuid, text, text, uuid, boolean)', 'execute')
    and not has_function_privilege('anon', 'tmc.admin_revoke_product_grant(uuid, text)', 'execute'),
    'anon mag een admin-wrapper uitvoeren';
  -- Admin leest via RLS; een lid ziet niets.
  select count(*) into v_count from tmc.product_grants where profile_id = v_member;
  assert v_count > 0, 'admin leest product_grants niet';
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_member::text, true);
  select count(*) into v_count from tmc.product_grants;
  assert v_count = 0, 'lid leest product_grants';
  reset role;
  raise notice 'PASS 8: geen directe schrijfpaden, admin leest, lid niet';
end;
$$;

rollback;
