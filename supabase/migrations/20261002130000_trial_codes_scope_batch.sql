-- Proefcodes met scope en batch (spec-community-growth.md §1 "Proefcodes",
-- PR 1 van twee; PR 2 brengt vrij trainen via een code).
--
-- Terug uit v1, bovenop het v2-model:
-- - trial_codes.scope: yoga_mobility, kettlebell, group (alle groepslessen,
--   het gedrag van v2) of vrij_trainen. Bestaande codes krijgen via de
--   kolomdefault 'group' en gedragen zich dus identiek.
-- - trial_codes.batch_id: alleen gezet voor codes uit een batch; bestaande
--   codes blijven null (geen batch-aanduiding).
-- - create_trial_code krijgt p_scope; nieuw is create_trial_codes_batch
--   (1 tot 50 codes, atomair, een event per batch).
-- - redeem_trial_code controleert de scope onder de sessielock
--   (scope_mismatch). Scope vrij_trainen wordt in deze PR geweigerd met
--   scope_not_available; de slotlogica komt in PR 2.
--
-- Ontwerpbesluiten:
-- - Alleen de scope en de batch veranderen; soort (max_uses), intrekken,
--   annuleren-geeft-gebruik-terug, een boeking per les per e-mail, de
--   misbruikmelding en de IP-teller blijven zoals in v2.
-- - De oude signaturen create_trial_code(text, text, integer) en
--   redeem_trial_code(..., boolean) verdwijnen; de redeem-signatuur blijft
--   gelijk (scope komt uit de coderij, nooit uit een parameter), dus die
--   wordt alleen vervangen.
-- - Alfabet is het live v2-alfabet ABCDEFGHJKMNPQRSTUVWXYZ23456789.
--
-- Functies zijn gedropt en herbouwd op de live definities
-- (pg_get_functiondef, 2026-09-30), met expliciete grant-restore en
-- asserts aan het slot. Schema tmc only; public en tvmuur onaangeroerd;
-- 20260503 placeholder onaangeroerd. Draaien met `supabase db push` na de
-- merge; niet ervoor.

begin;

-- ---------------------------------------------------------------------------
-- 1. Functies die veranderen weg (grants eerst, dan drop)
-- ---------------------------------------------------------------------------

revoke all on function tmc.create_trial_code(text, text, integer) from public, anon, authenticated, service_role;
drop function tmc.create_trial_code(text, text, integer);

revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean) from public, anon, authenticated, service_role;
drop function tmc.redeem_trial_code(text, uuid, text, text, text, boolean);

-- ---------------------------------------------------------------------------
-- 2. Kolommen
-- ---------------------------------------------------------------------------

alter table tmc.trial_codes
  add column scope text not null default 'group',
  add column batch_id uuid;

alter table tmc.trial_codes
  add constraint trial_codes_scope_check
  check (scope in ('yoga_mobility', 'kettlebell', 'group', 'vrij_trainen'));

create index trial_codes_batch_id_idx on tmc.trial_codes (batch_id) where batch_id is not null;

comment on column tmc.trial_codes.scope is
  'Waarvoor de code geldt: yoga_mobility, kettlebell, group (alle groepslessen, dus elke pillar behalve vrij_trainen) of vrij_trainen. Wordt bij het inwisselen opnieuw gecontroleerd in redeem_trial_code.';
comment on column tmc.trial_codes.batch_id is
  'Een uuid per create_trial_codes_batch-aanroep; null voor losse codes en voor codes van voor de batch-terugkeer. Basis voor "Batch van N" in de admin.';

-- ---------------------------------------------------------------------------
-- 3. create_trial_code (admin), nu met scope
-- ---------------------------------------------------------------------------

create function tmc.create_trial_code(
  p_code text,
  p_label text,
  p_max_uses integer,
  p_scope text default 'group'
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  -- Zonder 0, O, 1, I en L: voorleesbaar en overtypbaar.
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_uid uuid := auth.uid();
  v_label text := trim(coalesce(p_label, ''));
  v_scope text := coalesce(p_scope, 'group');
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_generated boolean := false;
  v_attempts int := 0;
  v_row tmc.trial_codes%rowtype;
  j int;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;

  -- Verwachte weigeringen als jsonb-reason, geen exceptions
  -- (conventie book_class_session).
  if v_label = '' then
    return jsonb_build_object('ok', false, 'reason', 'label_required');
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    return jsonb_build_object('ok', false, 'reason', 'max_uses_invalid');
  end if;
  if v_scope not in ('yoga_mobility', 'kettlebell', 'group', 'vrij_trainen') then
    return jsonb_build_object('ok', false, 'reason', 'scope_invalid');
  end if;

  if v_code = '' then
    v_generated := true;
    loop
      v_code := '';
      for j in 1..8 loop
        v_code := v_code || substr(c_alphabet, 1 + floor(random() * length(c_alphabet))::int, 1);
      end loop;
      exit when not exists (select 1 from tmc.trial_codes where code = v_code);
      v_attempts := v_attempts + 1;
      if v_attempts > 50 then
        raise exception 'trial_code collision storm';
      end if;
    end loop;
  else
    if v_code !~ '^[A-Z0-9]{4,32}$' then
      return jsonb_build_object('ok', false, 'reason', 'code_invalid');
    end if;
    if exists (select 1 from tmc.trial_codes where code = v_code) then
      return jsonb_build_object('ok', false, 'reason', 'code_exists');
    end if;
  end if;

  insert into tmc.trial_codes (code, label, max_uses, scope, created_by)
  values (v_code, v_label, p_max_uses, v_scope, v_uid)
  returning * into v_row;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.created', 'admin', v_uid, 'trial_code', v_row.id,
    jsonb_build_object(
      'code_id', v_row.id,
      'max_uses', p_max_uses,
      'scope', v_scope,
      'generated', v_generated
    )
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'code', v_row.code,
    'label', v_row.label,
    'max_uses', v_row.max_uses,
    'scope', v_row.scope,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function tmc.create_trial_code(text, text, integer, text) from public, anon;
grant execute on function tmc.create_trial_code(text, text, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. create_trial_codes_batch (admin): 1 tot 50 codes, atomair, een event
-- ---------------------------------------------------------------------------

create function tmc.create_trial_codes_batch(
  p_count integer,
  p_label text,
  p_max_uses integer,
  p_scope text
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_uid uuid := auth.uid();
  v_label text := trim(coalesce(p_label, ''));
  v_scope text := coalesce(p_scope, 'group');
  v_batch uuid := gen_random_uuid();
  v_code text;
  v_attempts int;
  v_inserted uuid;
  i int;
  j int;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;

  -- Alles valideren vóór de eerste insert; de hele batch is een
  -- transactie: alle codes of geen.
  if p_count is null or p_count < 1 or p_count > 50 then
    return jsonb_build_object('ok', false, 'reason', 'count_invalid');
  end if;
  if v_label = '' then
    return jsonb_build_object('ok', false, 'reason', 'label_required');
  end if;
  if p_max_uses is not null and p_max_uses < 1 then
    return jsonb_build_object('ok', false, 'reason', 'max_uses_invalid');
  end if;
  if v_scope not in ('yoga_mobility', 'kettlebell', 'group', 'vrij_trainen') then
    return jsonb_build_object('ok', false, 'reason', 'scope_invalid');
  end if;

  for i in 1..p_count loop
    -- Botsingsconventie: loop met teller, harde grens 50 pogingen per code.
    -- on conflict do nothing vangt ook een gelijktijdige batch op die
    -- dezelfde code net eerder commit.
    v_attempts := 0;
    loop
      v_code := '';
      for j in 1..8 loop
        v_code := v_code || substr(c_alphabet, 1 + floor(random() * length(c_alphabet))::int, 1);
      end loop;
      insert into tmc.trial_codes (code, label, max_uses, scope, batch_id, created_by)
      values (v_code, v_label, p_max_uses, v_scope, v_batch, v_uid)
      on conflict (code) do nothing
      returning id into v_inserted;
      exit when v_inserted is not null;
      v_attempts := v_attempts + 1;
      if v_attempts > 50 then
        raise exception 'trial_code collision storm';
      end if;
    end loop;
  end loop;

  -- Een event per batch, niet per code.
  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.batch_created', 'admin', v_uid, 'trial_code_batch', v_batch,
    jsonb_build_object(
      'batch_id', v_batch,
      'count', p_count,
      'max_uses', p_max_uses,
      'scope', v_scope
    )
  );

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch,
    'codes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'code', t.code,
        'label', t.label,
        'max_uses', t.max_uses,
        'scope', t.scope,
        'created_at', t.created_at
      ) order by t.code), '[]'::jsonb)
      from tmc.trial_codes t
      where t.batch_id = v_batch
    )
  );
end;
$$;

revoke all on function tmc.create_trial_codes_batch(integer, text, integer, text) from public, anon;
grant execute on function tmc.create_trial_codes_batch(integer, text, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. redeem_trial_code (publiek via de service-role client), met scopecheck
-- ---------------------------------------------------------------------------

create function tmc.redeem_trial_code(
  p_code text,
  p_session_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_is_test boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_code_norm text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
  v_tc tmc.trial_codes%rowtype;
  v_session tmc.class_sessions%rowtype;
  v_trial_id uuid;
  v_cancel_token uuid;
  v_redemption_id uuid;
  v_prior_free int;
begin
  if v_code_norm = '' or v_name = '' or v_email = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;

  -- Lock de code-rij: serialiseert gelijktijdig inwisselen, zodat
  -- uses_count nooit boven max_uses uitkomt.
  select * into v_tc
  from tmc.trial_codes
  where code = v_code_norm
  for update;

  -- Bestaat niet, ingetrokken en op krijgen dezelfde reason: de bezoeker
  -- mag niet kunnen afleiden welke codes bestaan.
  if not found
     or v_tc.revoked_at is not null
     or (v_tc.max_uses is not null and v_tc.uses_count >= v_tc.max_uses) then
    return jsonb_build_object('ok', false, 'reason', 'code_invalid');
  end if;

  -- Vrij trainen via een code komt in PR 2 (slot, aanwezigheidsvenster en
  -- maximum van 5). Tot dan een duidelijke weigering, geen stille mislukking.
  if v_tc.scope = 'vrij_trainen' then
    return jsonb_build_object('ok', false, 'reason', 'scope_not_available');
  end if;

  -- Lock de sessie-rij: pint status en capaciteit vast, zelfde patroon als
  -- book_class_session.
  select * into v_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;
  -- Alleen lessen die ook betaald als proefles boekbaar zijn (alles
  -- behalve vrij trainen, zie dropInSlugForPillar in trial-booking.ts).
  if v_session.pillar = 'vrij_trainen' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_trial_eligible');
  end if;

  -- Scope, onder de sessielock. group = elke les die als proefles
  -- boekbaar is (het v2-gedrag); yoga_mobility en kettlebell zijn per
  -- pillar. De lijst in de UI is nooit de controle.
  if v_tc.scope in ('yoga_mobility', 'kettlebell') and v_session.pillar <> v_tc.scope then
    return jsonb_build_object('ok', false, 'reason', 'scope_mismatch');
  end if;

  -- Een e-mailadres kan per les maar een keer geboekt staan, betaald of
  -- gratis. Aparte reason: dit mag de bezoeker wel te horen krijgen.
  if exists (
    select 1 from tmc.trial_bookings tb
    where tb.session_id = p_session_id
      and lower(trim(tb.email)) = v_email
      and tb.status in ('pending', 'paid', 'attended')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'email_already_booked');
  end if;

  -- Capaciteit onder de sessie-lock via tmc.session_occupancy(): dezelfde
  -- som als v_session_availability en de andere schrijf-gates.
  -- capacity null = onbeperkt: nooit vol.
  if v_session.capacity is not null
     and tmc.session_occupancy(p_session_id) >= v_session.capacity then
    return jsonb_build_object('ok', false, 'reason', 'capacity_full');
  end if;

  -- Gratis en direct definitief: status 'paid', prijs 0, geen Mollie.
  -- is_test is een snapshot van de deployment-modus, zoals bij een
  -- betaalde proefles (trialBookingMode()).
  insert into tmc.trial_bookings (
    session_id, name, email, phone,
    price_paid_cents, mollie_payment_id, status, trial_code_id, is_test
  ) values (
    p_session_id, v_name, v_email, v_phone,
    0, null, 'paid', v_tc.id, coalesce(p_is_test, false)
  )
  returning id, cancel_token into v_trial_id, v_cancel_token;

  insert into tmc.trial_code_redemptions (code_id, trial_booking_id, session_id, email_normalized)
  values (v_tc.id, v_trial_id, p_session_id, v_email)
  returning id into v_redemption_id;

  update tmc.trial_codes
  set uses_count = uses_count + 1
  where id = v_tc.id;

  -- Eerdere gratis proeflessen van dit adres, via welke code dan ook,
  -- inclusief geannuleerde (released_at gezet). Basis voor de
  -- misbruikmelding in de app-laag; de boeking gaat gewoon door.
  select count(*) into v_prior_free
  from tmc.trial_code_redemptions r
  where r.email_normalized = v_email
    and r.id <> v_redemption_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_code.redeemed', 'visitor', null, 'trial_code', v_tc.id,
    jsonb_build_object(
      'code_id', v_tc.id,
      'trial_booking_id', v_trial_id,
      'session_id', p_session_id,
      'pillar', v_session.pillar,
      'scope', v_tc.scope,
      'uses_count', v_tc.uses_count + 1,
      'max_uses', v_tc.max_uses,
      'prior_free_count', v_prior_free
    )
  );

  return jsonb_build_object(
    'ok', true,
    'trial_booking_id', v_trial_id,
    'cancel_token', v_cancel_token,
    'code_id', v_tc.id,
    'code', v_tc.code,
    'session_id', p_session_id,
    'session_start_at', v_session.start_at,
    'prior_free_count', v_prior_free
  );
end;
$$;

-- Publiek betekent hier: via de service-role client in de TS-laag, achter
-- register_trial_code_attempt. Niet rechtstreeks door anon/authenticated.
revoke all on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function tmc.redeem_trial_code(text, uuid, text, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Zelfcontrole binnen een savepoint
--
-- Speelt de scopecheck van redeem_trial_code na zonder app-data te eisen:
-- is er geen class_types-, trainers- of profiles-rij (verse shadow-
-- database), dan slaat de controle zichzelf over met een notice
-- (migrations/README.md, regel 6). De admin-RPC's (create_trial_code,
-- create_trial_codes_batch) eisen auth.uid() en zijn hier niet te testen
-- zonder claims te vervalsen; die zijn lokaal gecontroleerd. Na de laatste
-- assert rolt ROLLBACK TO SAVEPOINT alle testrijen terug, zonder DELETE, zodat
-- de append-only trigger op tmc.events ongemoeid blijft.
-- ---------------------------------------------------------------------------

savepoint trial_codes_scope_selftest;

do $$
declare
  v_ct uuid;
  v_tr uuid;
  v_pr uuid;
  v_yoga uuid;
  v_kb uuid;
  v_res jsonb;
begin
  select id into v_ct from tmc.class_types limit 1;
  select id into v_tr from tmc.trainers limit 1;
  select id into v_pr from tmc.profiles limit 1;
  if v_ct is null or v_tr is null or v_pr is null then
    raise notice 'trial_codes_scope_batch: zelfcontrole overgeslagen, geen class_types/trainers/profiles-rij (lege database)';
    return;
  end if;

  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'yoga_mobility', 'adult', now() + interval '400 days', now() + interval '400 days 1 hour', null, 'scheduled')
  returning id into v_yoga;
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'kettlebell', 'adult', now() + interval '401 days', now() + interval '401 days 1 hour', null, 'scheduled')
  returning id into v_kb;

  -- Default: een code zonder expliciete scope is group.
  insert into tmc.trial_codes (code, label, max_uses, created_by)
  values ('SCOPECONTROLE0', 'zelfcontrole default', null, v_pr);
  if (select scope from tmc.trial_codes where code = 'SCOPECONTROLE0') <> 'group' then
    raise exception 'trial_codes_scope_batch: default scope hoort group te zijn';
  end if;

  insert into tmc.trial_codes (code, label, max_uses, scope, created_by)
  values ('SCOPECONTROLE1', 'zelfcontrole yoga', null, 'yoga_mobility', v_pr),
         ('SCOPECONTROLE2', 'zelfcontrole kettlebell', null, 'kettlebell', v_pr),
         ('SCOPECONTROLE3', 'zelfcontrole vrij trainen', null, 'vrij_trainen', v_pr);

  -- Yoga-code: yogales ja, kettlebell nee (scope_mismatch).
  v_res := tmc.redeem_trial_code('SCOPECONTROLE1', v_kb, 'Scope Controle', 'scope1@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'scope_mismatch' then
    raise exception 'trial_codes_scope_batch: yoga-code op kettlebell hoort scope_mismatch te geven: %', v_res;
  end if;
  v_res := tmc.redeem_trial_code('SCOPECONTROLE1', v_yoga, 'Scope Controle', 'scope1@test.invalid', '0600000000', true);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_codes_scope_batch: yoga-code op yoga hoort te werken: %', v_res;
  end if;

  -- Kettlebell-code: andersom.
  v_res := tmc.redeem_trial_code('SCOPECONTROLE2', v_yoga, 'Scope Controle', 'scope2@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'scope_mismatch' then
    raise exception 'trial_codes_scope_batch: kettlebell-code op yoga hoort scope_mismatch te geven: %', v_res;
  end if;
  v_res := tmc.redeem_trial_code('SCOPECONTROLE2', v_kb, 'Scope Controle', 'scope2@test.invalid', '0600000000', true);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_codes_scope_batch: kettlebell-code op kettlebell hoort te werken: %', v_res;
  end if;

  -- Group: beide.
  v_res := tmc.redeem_trial_code('SCOPECONTROLE0', v_yoga, 'Scope Controle', 'scope0@test.invalid', '0600000000', true);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_codes_scope_batch: group-code op yoga hoort te werken: %', v_res;
  end if;
  v_res := tmc.redeem_trial_code('SCOPECONTROLE0', v_kb, 'Scope Controle', 'scope0@test.invalid', '0600000000', true);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_codes_scope_batch: group-code op kettlebell hoort te werken: %', v_res;
  end if;

  -- Vrij trainen is in deze PR niet inwisselbaar.
  v_res := tmc.redeem_trial_code('SCOPECONTROLE3', v_yoga, 'Scope Controle', 'scope3@test.invalid', '0600000000', true);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'scope_not_available' then
    raise exception 'trial_codes_scope_batch: vrij-trainen-code hoort scope_not_available te geven: %', v_res;
  end if;
end $$;

rollback to savepoint trial_codes_scope_selftest;
release savepoint trial_codes_scope_selftest;

-- ---------------------------------------------------------------------------
-- 7. Grants en definities asserteren (buiten het savepoint)
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_admin_fns text[] := array[
    'tmc.create_trial_code(text, text, integer, text)',
    'tmc.create_trial_codes_batch(integer, text, integer, text)'
  ];
begin
  foreach v_fn in array v_admin_fns loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'trial_codes_scope_batch: % mag niet voor anon', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'trial_codes_scope_batch: % moet voor authenticated en service_role', v_fn;
    end if;
  end loop;

  v_fn := 'tmc.redeem_trial_code(text, uuid, text, text, text, boolean)';
  if has_function_privilege('anon', v_fn, 'execute')
     or has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'trial_codes_scope_batch: % mag niet voor anon/authenticated', v_fn;
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'trial_codes_scope_batch: % moet voor service_role', v_fn;
  end if;

  -- Alle drie blijven SECURITY DEFINER met vaste search_path.
  if exists (
    select 1 from pg_proc p
    where p.oid in (
      'tmc.create_trial_code(text, text, integer, text)'::regprocedure,
      'tmc.create_trial_codes_batch(integer, text, integer, text)'::regprocedure,
      'tmc.redeem_trial_code(text, uuid, text, text, text, boolean)'::regprocedure
    )
    and (not p.prosecdef or p.proconfig is null)
  ) then
    raise exception 'trial_codes_scope_batch: functie zonder SECURITY DEFINER of vaste search_path';
  end if;

  -- De oude signatuur is weg.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tmc' and p.proname = 'create_trial_code'
      and pg_get_function_identity_arguments(p.oid) = 'p_code text, p_label text, p_max_uses integer'
  ) then
    raise exception 'trial_codes_scope_batch: oude create_trial_code-signatuur bestaat nog';
  end if;

  if (select column_default from information_schema.columns
      where table_schema = 'tmc' and table_name = 'trial_codes' and column_name = 'scope')
     is distinct from '''group''::text' then
    raise exception 'trial_codes_scope_batch: scope heeft niet de default group';
  end if;
end $$;

commit;
