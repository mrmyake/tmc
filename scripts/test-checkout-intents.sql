-- Tests voor feat/checkout-intents-db (migratie
-- 20261002090000_checkout_intents.sql).
--
-- Draaien als postgres tegen een LOKALE of branch-database waarop de
-- migratieketen is afgespeeld (supabase db start in de worktree), niet tegen
-- productie. Eigen wegwerp-fixtures, alles in een transactie die eindigt in
-- ROLLBACK.
--
-- Uitvoeren:
--   docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < scripts/test-checkout-intents.sql
-- Verwacht: alleen PASS-notices en aan het eind "ALLE TESTS GESLAAGD".
--
-- Dekt: RLS en grants (anon, authenticated, auth.uid()-guard), create met
-- catalogusprijs, mark pending, convert (nieuw profiel, idempotent,
-- activate_order sluit aan, bestaand account -> failed existing_account,
-- failed-na-paid opnieuw converteren, telefoon-botsing, order_conflict,
-- verlopen intent gehonoreerd, invalid_status, payment mismatch), fail,
-- status-lookup (vier sleutels, not_found na 7 dagen), consume (verlopen,
-- gebruikt, eenmalig), rotate, auth_user_id_for_email, testmodus is_test.

\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------------------
-- Fixtures (als postgres). De auth-trigger maakt de profielen.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('c1000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'ci-' || n || '@test.invalid', '{"provider":"email","providers":["email"]}',
       case
         when n = 1 then '{"first_name":"Bestaand","last_name":"Lid","phone":"+31611111111"}'::jsonb
         when n = 2 then '{"first_name":"Ander","last_name":"Nummer","phone":"+31622222222"}'::jsonb
         else '{}'::jsonb
       end,
       now(), now()
from unnest(array[1, 2, 11, 12, 13, 14, 15]) as n;
-- c1..01: bestaand account met telefoon (existing_account-pad)
-- c1..02: eigenaar van +31622222222 (telefoon-botsing)
-- c1..11 t/m c1..15: "nieuwe" profielen (lege naam, zoals createUser oplevert)

update tmc.profiles set street_address = 'Oud 1', postal_code = '1111 AA', city = 'Oudstad'
where id = 'c1000000-0000-4000-8000-000000000001';

create or replace function pg_temp.p(n int) returns uuid language sql as $$
  select ('c1000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

create or replace function pg_temp.als(p_role text, p_sub uuid default null) returns void language plpgsql as $$
begin
  execute format('set role %I', p_role);
  perform set_config('request.jwt.claims',
    case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', p_role)::text end, true);
end $$;

create or replace function pg_temp.verwacht(p_label text, r jsonb, p_ok boolean, p_reason text default null) returns void language plpgsql as $$
begin
  if coalesce((r ->> 'ok')::boolean, false) <> p_ok
     or (p_reason is not null and r ->> 'reason' is distinct from p_reason) then
    raise exception 'FAIL %: kreeg %', p_label, r;
  end if;
  raise notice 'PASS %', p_label;
end $$;

-- Voert p_sql uit als p_role en eist sqlstate p_state.
create or replace function pg_temp.verwacht_fout(p_label text, p_role text, p_sql text, p_state text, p_sub uuid default null) returns void language plpgsql as $$
declare v_state text;
begin
  begin
    perform pg_temp.als(p_role, p_sub);
    execute p_sql;
    reset role;
    raise exception 'FAIL %: geen fout, verwachtte %', p_label, p_state;
  exception
    when others then
      v_state := sqlstate;
      reset role;
      if v_state <> p_state then
        raise exception 'FAIL %: sqlstate % (verwacht %): %', p_label, v_state, p_state, sqlerrm;
      end if;
  end;
  raise notice 'PASS %', p_label;
end $$;

create or replace function pg_temp.maak(p_email text, p_phone text, p_mode text default 'test', p_slug text default 'groepslessen_2x', p_em boolean default true) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.als('service_role');
  r := tmc.create_checkout_intent(p_mode, p_slug, false, false, p_em, p_email, 'Nieuw', 'Lid', p_phone,
    'Industrieweg 14P', '1231 MX', 'Loosdrecht',
    '{"acquisition_source":"test","signup_path":"/abonnement"}'::jsonb, 'GA1.1.1', '123', 'web');
  reset role;
  return r;
end $$;

create or replace function pg_temp.pending(p_intent uuid, p_payment text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.als('service_role');
  r := tmc.mark_checkout_intent_pending(p_intent, p_payment, 'cst_test_' || p_payment);
  reset role;
  return r;
end $$;

create or replace function pg_temp.convert(p_intent uuid, p_profile uuid, p_payment text, p_created boolean) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.als('service_role');
  r := tmc.convert_checkout_intent(p_intent, p_profile, p_payment, now(), p_created);
  reset role;
  return r;
end $$;

create or replace function pg_temp.status(p_token text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.als('service_role');
  r := tmc.checkout_intent_status(p_token);
  reset role;
  return r;
end $$;

create or replace function pg_temp.consume(p_token text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.als('service_role');
  r := tmc.consume_checkout_login_token(p_token);
  reset role;
  return r;
end $$;

create temp table t (k text primary key, v text);
-- De helpers lezen t ook onder set role service_role.
grant select, insert, update on t to public;
create or replace function pg_temp.zet(k text, v text) returns void language sql as $$
  insert into t values (k, v) on conflict (k) do update set v = excluded.v
$$;
create or replace function pg_temp.krijg(k text) returns text language sql as $$ select v from t where t.k = krijg.k $$;

-- ---------------------------------------------------------------------------
-- 1. RLS en grants
-- ---------------------------------------------------------------------------
select pg_temp.verwacht_fout('1a anon leest tabel niet', 'anon', 'select count(*) from tmc.checkout_intents', '42501');
select pg_temp.verwacht_fout('1b authenticated leest tabel niet', 'authenticated', 'select count(*) from tmc.checkout_intents', '42501', pg_temp.p(1));
select pg_temp.verwacht_fout('1c authenticated schrijft tabel niet', 'authenticated',
  $$insert into tmc.checkout_intents (mode, kind, catalogue_slug, pricing_snapshot, first_charge_cents, status_token_hash, status) values ('test','product','x','{}',0,'h','cancelled')$$,
  '42501', pg_temp.p(1));
select pg_temp.verwacht_fout('1d anon mag create niet uitvoeren', 'anon',
  $$select tmc.create_checkout_intent('test','groepslessen_2x',false,false,true,'a@b.nl','A','B','+31612345678','S 1','1234 AB','C')$$, '42501');
select pg_temp.verwacht_fout('1e authenticated mag status-lookup niet uitvoeren', 'authenticated',
  $$select tmc.checkout_intent_status(repeat('a', 64))$$, '42501', pg_temp.p(1));
select pg_temp.verwacht_fout('1f authenticated mag consume niet uitvoeren', 'authenticated',
  $$select tmc.consume_checkout_login_token(repeat('a', 64))$$, '42501', pg_temp.p(1));
-- service_role met een user-JWT (auth.uid() niet null) wordt door de guard geweigerd.
select pg_temp.verwacht_fout('1g guard: service_role met auth.uid() geweigerd', 'service_role',
  $$select tmc.checkout_intent_status(repeat('a', 64))$$, '42501', pg_temp.p(1));
select pg_temp.verwacht_fout('1h guard: convert met auth.uid() geweigerd', 'service_role',
  $$select tmc.convert_checkout_intent(gen_random_uuid(), gen_random_uuid(), 'tr_x', now(), true)$$, '42501', pg_temp.p(1));

-- ---------------------------------------------------------------------------
-- 2. create_checkout_intent: prijs uit de catalogus, tokens als hash
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; v_expect jsonb; v_row tmc.checkout_intents%rowtype;
begin
  r := pg_temp.maak('  Nieuw.Lid@Voorbeeld.NL ', '+31633333331');
  perform pg_temp.verwacht('2a create Early Member', r, true);
  v_expect := tmc._compute_order_price('groepslessen_2x', false, false, true);
  if (r ->> 'first_charge_cents')::int <> (v_expect ->> 'first_charge_cents')::int
     or (r ->> 'recurring_cents')::int <> (v_expect ->> 'recurring_cents')::int
     or (r ->> 'early_member')::boolean <> (v_expect ->> 'em_active')::boolean
     or (r ->> 'first_charge_cents')::int <= 0 then
    raise exception 'FAIL 2b: prijs wijkt af van _compute_order_price: % versus %', r, v_expect;
  end if;
  raise notice 'PASS 2b prijs gelijk aan _compute_order_price (% cent)', r ->> 'first_charge_cents';
  if length(r ->> 'status_token') <> 64 or (r ->> 'status_token') !~ '^[0-9a-f]{64}$' then
    raise exception 'FAIL 2c: status_token geen 64 hex, kreeg %', r ->> 'status_token';
  end if;
  select * into v_row from tmc.checkout_intents where id = (r ->> 'intent_id')::uuid;
  if v_row.status <> 'draft' or v_row.email <> 'nieuw.lid@voorbeeld.nl' or v_row.kind <> 'subscription'
     or v_row.status_token_hash = (r ->> 'status_token')
     or v_row.status_token_hash <> encode(extensions.digest((r ->> 'status_token')::text, 'sha256'), 'hex')
     or v_row.pricing_snapshot ->> 'first_charge_cents' is null
     or v_row.acquisition_source <> 'test' or v_row.ga_client_id <> 'GA1.1.1' then
    raise exception 'FAIL 2d: rij niet zoals verwacht: status % email % hash-ok %', v_row.status, v_row.email, v_row.status_token_hash <> (r ->> 'status_token');
  end if;
  raise notice 'PASS 2d rij: draft, e-mail lowercase, alleen sha256 van het token opgeslagen';
  perform pg_temp.zet('i1', r ->> 'intent_id');
  perform pg_temp.zet('t1', r ->> 'status_token');

  r := pg_temp.maak('x@voorbeeld.nl', '+31633333332', 'test', 'bestaat_niet');
  perform pg_temp.verwacht('2e onbekende slug', r, false, 'catalogue_row_not_found');
  r := pg_temp.maak('x@voorbeeld.nl', '0612345678');
  perform pg_temp.verwacht('2f telefoon niet E.164', r, false, 'invalid_input');
  if r ->> 'constraint' <> 'checkout_intents_phone_e164' then
    raise exception 'FAIL 2f: verwachtte constraint phone_e164, kreeg %', r;
  end if;
  r := pg_temp.maak('x@voorbeeld.nl', '+31633333333', 'staging');
  perform pg_temp.verwacht('2g ongeldige modus', r, false, 'invalid_mode');
  r := pg_temp.maak('x@voorbeeld.nl', '+31633333334', 'live', 'groepslessen_2x', false);
  perform pg_temp.verwacht('2h create zonder Early Member (live)', r, true);
  v_expect := tmc._compute_order_price('groepslessen_2x', false, false, false);
  if (r ->> 'first_charge_cents')::int <> (v_expect ->> 'first_charge_cents')::int or (r ->> 'early_member')::boolean then
    raise exception 'FAIL 2i: reguliere prijs wijkt af: % versus %', r, v_expect;
  end if;
  raise notice 'PASS 2i reguliere prijs met inschrijfkosten (% cent)', r ->> 'first_charge_cents';
  perform pg_temp.zet('i_live', r ->> 'intent_id');
end $$;

-- ---------------------------------------------------------------------------
-- 3. mark_checkout_intent_pending en status-lookup vóór betaling
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; i uuid := pg_temp.krijg('i1')::uuid;
begin
  r := pg_temp.status(pg_temp.krijg('t1'));
  if r ->> 'status' <> 'draft' or (r ->> 'paid')::boolean or r ->> 'email' <> 'nieuw.lid@voorbeeld.nl' then
    raise exception 'FAIL 3a: lookup draft gaf %', r;
  end if;
  raise notice 'PASS 3a lookup op draft: status, paid false, e-mail';
  r := pg_temp.pending(i, 'tr_test_1');
  perform pg_temp.verwacht('3b draft naar pending', r, true);
  r := pg_temp.pending(i, 'tr_test_1');
  perform pg_temp.verwacht('3c nogmaals dezelfde betaling: already_pending', r, true);
  if not (r ->> 'already_pending')::boolean then raise exception 'FAIL 3c: %', r; end if;
  r := pg_temp.pending(i, 'tr_test_other');
  perform pg_temp.verwacht('3d andere betaling op pending geweigerd', r, false, 'invalid_status');
  r := pg_temp.status(pg_temp.krijg('t1'));
  if r ->> 'status' <> 'pending' or (r ->> 'paid')::boolean then
    raise exception 'FAIL 3e: lookup pending gaf %', r;
  end if;
  raise notice 'PASS 3e lookup op pending';
end $$;

-- ---------------------------------------------------------------------------
-- 4. convert: nieuw profiel, idempotent, activate_order sluit aan
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; r2 jsonb; i uuid := pg_temp.krijg('i1')::uuid; v_order tmc.orders%rowtype;
  v_prof tmc.profiles%rowtype; v_int tmc.checkout_intents%rowtype; v_pay tmc.payments%rowtype; v_cnt int;
begin
  r := pg_temp.convert(i, pg_temp.p(11), 'tr_test_1', true);
  perform pg_temp.verwacht('4a convert nieuw profiel', r, true);
  if (r ->> 'already_converted')::boolean or (r ->> 'phone_skipped')::boolean or (r ->> 'from_failed')::boolean
     or length(r ->> 'login_token') <> 64 or not (r ->> 'is_test')::boolean then
    raise exception 'FAIL 4a: resultaat %', r;
  end if;
  perform pg_temp.zet('login1', r ->> 'login_token');
  perform pg_temp.zet('order1', r ->> 'order_id');

  select * into v_order from tmc.orders where id = (r ->> 'order_id')::uuid;
  if v_order.status <> 'pending' or v_order.profile_id <> pg_temp.p(11) or v_order.mollie_payment_id <> 'tr_test_1'
     or v_order.created_by <> 'self' or v_order.kind <> 'subscription' or not v_order.early_member
     or v_order.signup_fee_waiver <> 'early_member' or v_order.mollie_customer_id <> 'cst_test_tr_test_1'
     or v_order.ga_client_id <> 'GA1.1.1' or v_order.recurring_cents is null then
    raise exception 'FAIL 4b: order %', to_jsonb(v_order);
  end if;
  select * into v_int from tmc.checkout_intents where id = i;
  if v_order.first_charge_cents <> (v_int.pricing_snapshot ->> 'first_charge_cents')::int
     or v_order.vat_amount_cents <> (v_int.pricing_snapshot ->> 'first_charge_vat_amount_cents')::int then
    raise exception 'FAIL 4b: orderbedrag wijkt af van het snapshot';
  end if;
  raise notice 'PASS 4b order pending uit het snapshot, Early Member bevroren';

  select * into v_pay from tmc.payments where mollie_payment_id = 'tr_test_1';
  if v_pay.order_id <> v_order.id or v_pay.profile_id <> pg_temp.p(11) or not v_pay.is_test or v_pay.kind <> 'order' then
    raise exception 'FAIL 4c: payments-rij %', to_jsonb(v_pay);
  end if;
  raise notice 'PASS 4c payments-spiegelrij gekoppeld aan order en profiel';

  select * into v_prof from tmc.profiles where id = pg_temp.p(11);
  if v_prof.first_name <> 'Nieuw' or v_prof.last_name <> 'Lid' or v_prof.phone <> '+31633333331'
     or v_prof.street_address <> 'Industrieweg 14P' or v_prof.postal_code <> '1231 MX' or v_prof.city <> 'Loosdrecht'
     or v_prof.mollie_customer_id <> 'cst_test_tr_test_1' or not v_prof.is_test
     or v_prof.acquisition_source <> 'test' or v_prof.signup_path <> '/abonnement' then
    raise exception 'FAIL 4d: profiel %', to_jsonb(v_prof);
  end if;
  raise notice 'PASS 4d profiel gevuld, is_test true (testmodus), mollie_customer_id gezet';

  if v_int.status <> 'converted' or v_int.email is not null or v_int.first_name is not null or v_int.phone is not null
     or v_int.street_address is not null or v_int.city is not null or v_int.login_token_hash is null
     or v_int.login_token_hash = pg_temp.krijg('login1') or v_int.login_token_used_at is not null
     or v_int.conversion_error is not null or v_int.paid_but_failed or v_int.profile_id <> pg_temp.p(11) then
    raise exception 'FAIL 4e: intent na conversie %', to_jsonb(v_int);
  end if;
  raise notice 'PASS 4e intent converted, PII gewist, inlogtoken alleen als hash';

  r2 := pg_temp.convert(i, pg_temp.p(11), 'tr_test_1', true);
  perform pg_temp.verwacht('4f tweede convert', r2, true);
  if not (r2 ->> 'already_converted')::boolean or r2 ->> 'order_id' <> r ->> 'order_id' or r2 ? 'login_token' then
    raise exception 'FAIL 4f: tweede convert gaf %', r2;
  end if;
  select count(*) into v_cnt from tmc.orders where profile_id = pg_temp.p(11);
  if v_cnt <> 1 then raise exception 'FAIL 4f: % orders in plaats van 1', v_cnt; end if;
  raise notice 'PASS 4f idempotent: bestaand resultaat, geen tweede order, geen nieuw token';

  -- De bestaande keten: activate_order op de geconverteerde order.
  r2 := tmc.activate_order(v_order.id, 'tr_test_1');
  perform pg_temp.verwacht('4g activate_order op de geconverteerde order', r2, true);
  if (r2 ->> 'already_activated')::boolean or not (r2 ->> 'needs_subscription')::boolean
     or r2 ->> 'mollie_customer_id' <> 'cst_test_tr_test_1' then
    raise exception 'FAIL 4g: %', r2;
  end if;
  select count(*) into v_cnt from tmc.memberships where profile_id = pg_temp.p(11) and status = 'active' and source = 'early_member';
  if v_cnt <> 1 then raise exception 'FAIL 4h: verwacht 1 actief early_member-lidmaatschap, kreeg %', v_cnt; end if;
  raise notice 'PASS 4h lidmaatschap actief met source early_member';
end $$;

-- ---------------------------------------------------------------------------
-- 5. status-lookup na conversie: precies vier sleutels, e-mail uit profiles
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := pg_temp.status(pg_temp.krijg('t1'));
  if r ->> 'status' <> 'converted' or not (r ->> 'paid')::boolean or (r ->> 'paid_but_failed')::boolean
     or r ->> 'email' <> 'ci-11@test.invalid' then
    raise exception 'FAIL 5a: lookup na conversie gaf %', r;
  end if;
  if (select count(*) from jsonb_object_keys(r)) <> 4
     or not (r ?& array['status', 'paid', 'paid_but_failed', 'email']) then
    raise exception 'FAIL 5b: lookup lekt andere sleutels: %', r;
  end if;
  raise notice 'PASS 5a/5b lookup: converted, paid, e-mail uit profiel, exact vier sleutels';
  r := pg_temp.status(repeat('0', 64));
  if r ->> 'status' <> 'not_found' or (select count(*) from jsonb_object_keys(r)) <> 1 then
    raise exception 'FAIL 5c: onbekend token gaf %', r;
  end if;
  r := pg_temp.status('kort');
  if r ->> 'status' <> 'not_found' then raise exception 'FAIL 5c: verkeerde lengte gaf %', r; end if;
  raise notice 'PASS 5c onbekend token en verkeerde lengte: not_found';
end $$;

-- ---------------------------------------------------------------------------
-- 6. consume en rotate
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; i uuid := pg_temp.krijg('i1')::uuid; v_old text := pg_temp.krijg('login1'); v_new text;
begin
  r := pg_temp.consume(repeat('f', 64));
  perform pg_temp.verwacht('6a onbekend inlogtoken', r, false, 'not_found');
  r := pg_temp.consume(v_old);
  perform pg_temp.verwacht('6b geldig inlogtoken eenmaal', r, true);
  if r ->> 'profile_id' <> pg_temp.p(11)::text or r ->> 'email' <> 'ci-11@test.invalid' then
    raise exception 'FAIL 6b: %', r;
  end if;
  r := pg_temp.consume(v_old);
  perform pg_temp.verwacht('6c tweede keer: used', r, false, 'used');

  perform pg_temp.als('service_role');
  r := tmc.rotate_checkout_login_token(i);
  reset role;
  perform pg_temp.verwacht('6d rotate op converted', r, true);
  v_new := r ->> 'login_token';
  if v_new = v_old or length(v_new) <> 64 then raise exception 'FAIL 6d: %', r; end if;
  r := pg_temp.consume(v_old);
  perform pg_temp.verwacht('6e oud token na rotate: not_found', r, false, 'not_found');
  -- Verlopen: als postgres de expiry terugzetten.
  update tmc.checkout_intents set login_token_expires_at = now() - interval '1 minute' where id = i;
  r := pg_temp.consume(v_new);
  perform pg_temp.verwacht('6f verlopen token: expired', r, false, 'expired');
  perform pg_temp.als('service_role');
  r := tmc.rotate_checkout_login_token(i);
  reset role;
  v_new := r ->> 'login_token';
  r := pg_temp.consume(v_new);
  perform pg_temp.verwacht('6g na tweede rotate weer geldig', r, true);
  perform pg_temp.als('service_role');
  r := tmc.rotate_checkout_login_token(pg_temp.krijg('i_live')::uuid);
  reset role;
  perform pg_temp.verwacht('6h rotate op niet-converted geweigerd', r, false, 'invalid_status');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Bestaand account (wijziging B) en failed-na-paid opnieuw (wijziging A)
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; i uuid; t text; v_int tmc.checkout_intents%rowtype; v_prof tmc.profiles%rowtype; v_cnt int;
begin
  r := pg_temp.maak('ci-1@test.invalid', '+31644444441');
  i := (r ->> 'intent_id')::uuid; t := r ->> 'status_token';
  perform pg_temp.pending(i, 'tr_test_2');
  r := pg_temp.convert(i, pg_temp.p(1), 'tr_test_2', false);
  perform pg_temp.verwacht('7a bestaand account: existing_account', r, false, 'existing_account');
  select * into v_int from tmc.checkout_intents where id = i;
  if v_int.status <> 'failed' or v_int.conversion_error <> 'existing_account' or v_int.paid_at is null
     or not v_int.paid_but_failed or v_int.email is null or v_int.phone is null then
    raise exception 'FAIL 7b: intent %', to_jsonb(v_int);
  end if;
  raise notice 'PASS 7b intent failed na paid, PII blijft staan voor de staf';
  select * into v_prof from tmc.profiles where id = pg_temp.p(1);
  select count(*) into v_cnt from tmc.orders where profile_id = pg_temp.p(1);
  if v_prof.first_name <> 'Bestaand' or v_prof.street_address <> 'Oud 1' or v_prof.mollie_customer_id is not null or v_cnt <> 0 then
    raise exception 'FAIL 7c: bestaand profiel of orders aangeraakt: % orders, %', v_cnt, to_jsonb(v_prof);
  end if;
  raise notice 'PASS 7c bestaand profiel en orders onaangeraakt';
  r := pg_temp.status(t);
  if r ->> 'status' <> 'failed' or not (r ->> 'paid')::boolean or not (r ->> 'paid_but_failed')::boolean
     or r ->> 'email' <> 'ci-1@test.invalid' then
    raise exception 'FAIL 7d: lookup gaf %', r;
  end if;
  raise notice 'PASS 7d lookup: failed, paid, paid_but_failed (scherm 7)';

  -- Herhaalde webhook nadat de staf een nieuw profiel heeft gemaakt: failed
  -- na paid mag opnieuw converteren.
  r := pg_temp.convert(i, pg_temp.p(12), 'tr_test_2', true);
  perform pg_temp.verwacht('7e failed-na-paid opnieuw converteren', r, true);
  if not (r ->> 'from_failed')::boolean or (r ->> 'already_converted')::boolean then
    raise exception 'FAIL 7e: %', r;
  end if;
  select * into v_int from tmc.checkout_intents where id = i;
  if v_int.status <> 'converted' or v_int.conversion_error is not null or v_int.paid_but_failed or v_int.email is not null then
    raise exception 'FAIL 7f: intent na herconversie %', to_jsonb(v_int);
  end if;
  raise notice 'PASS 7f conversion_error leeg, converted, PII gewist';

  -- failed zonder paid blijft invalid_status.
  r := pg_temp.maak('zonderpaid@voorbeeld.nl', '+31644444442');
  i := (r ->> 'intent_id')::uuid;
  perform pg_temp.pending(i, 'tr_test_3');
  perform pg_temp.als('service_role');
  r := tmc.fail_checkout_intent(i, 'createuser_failed', null);
  reset role;
  perform pg_temp.verwacht('7g fail zonder paid_at', r, true);
  if (r ->> 'paid_but_failed')::boolean then raise exception 'FAIL 7g: paid_but_failed hoort false: %', r; end if;
  r := pg_temp.convert(i, pg_temp.p(13), 'tr_test_3', true);
  perform pg_temp.verwacht('7h convert op failed zonder paid: invalid_status', r, false, 'invalid_status');
end $$;

-- ---------------------------------------------------------------------------
-- 8. fail_checkout_intent
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; i uuid;
begin
  r := pg_temp.maak('fail@voorbeeld.nl', '+31655555551');
  i := (r ->> 'intent_id')::uuid;
  perform pg_temp.pending(i, 'tr_test_4');
  perform pg_temp.als('service_role');
  r := tmc.fail_checkout_intent(i, 'Bad Code!', now());
  perform pg_temp.verwacht('8a foutcode buiten [a-z0-9_] geweigerd', r, false, 'invalid_error_code');
  r := tmc.fail_checkout_intent(i, 'createuser_failed', now());
  perform pg_temp.verwacht('8b fail met paid_at', r, true);
  if not (r ->> 'paid_but_failed')::boolean then raise exception 'FAIL 8b: %', r; end if;
  r := tmc.fail_checkout_intent(pg_temp.krijg('i1')::uuid, 'x_code', null);
  perform pg_temp.verwacht('8c fail op converted geweigerd', r, false, 'already_converted');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Telefoon-botsing bij een nieuw profiel
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; i uuid; v_prof tmc.profiles%rowtype;
begin
  r := pg_temp.maak('botsing@voorbeeld.nl', '+31622222222');
  i := (r ->> 'intent_id')::uuid;
  perform pg_temp.pending(i, 'tr_test_5');
  r := pg_temp.convert(i, pg_temp.p(13), 'tr_test_5', true);
  perform pg_temp.verwacht('9a convert met bezet telefoonnummer slaagt', r, true);
  if not (r ->> 'phone_skipped')::boolean then raise exception 'FAIL 9a: phone_skipped ontbreekt: %', r; end if;
  select * into v_prof from tmc.profiles where id = pg_temp.p(13);
  if v_prof.phone is not null or v_prof.first_name <> 'Nieuw' or v_prof.city <> 'Loosdrecht' then
    raise exception 'FAIL 9b: profiel %', to_jsonb(v_prof);
  end if;
  if (select phone from tmc.profiles where id = pg_temp.p(2)) <> '+31622222222' then
    raise exception 'FAIL 9b: nummer van de eigenaar aangeraakt';
  end if;
  raise notice 'PASS 9b nummer overgeslagen, rest gevuld, eigenaar onaangeraakt';
end $$;

-- ---------------------------------------------------------------------------
-- 10. order_conflict, verlopen intent gehonoreerd, invalid_status, mismatch
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; i uuid; v_int tmc.checkout_intents%rowtype;
begin
  -- Profiel 14 heeft al een open abonnementsorder (oud pad): unieke index.
  insert into tmc.orders (profile_id, kind, catalogue_slug, base_price_cents, first_charge_cents, recurring_cents,
    billing_cycle_weeks, commit_months, pricing_snapshot, created_by, status, expires_at)
  values (pg_temp.p(14), 'subscription', 'groepslessen_2x', 7900, 7900, 7900, 4, 12, '{}', 'self', 'draft', now() + interval '1 day');
  r := pg_temp.maak('conflict@voorbeeld.nl', '+31666666661');
  i := (r ->> 'intent_id')::uuid;
  perform pg_temp.pending(i, 'tr_test_6');
  r := pg_temp.convert(i, pg_temp.p(14), 'tr_test_6', true);
  perform pg_temp.verwacht('10a open order van profiel: order_conflict', r, false, 'order_conflict');
  select * into v_int from tmc.checkout_intents where id = i;
  if v_int.status <> 'failed' or v_int.conversion_error <> 'order_conflict' or not v_int.paid_but_failed then
    raise exception 'FAIL 10a: intent %', to_jsonb(v_int);
  end if;
  if (select count(*) from tmc.orders where profile_id = pg_temp.p(14)) <> 1 then
    raise exception 'FAIL 10a: er is toch een tweede order';
  end if;
  raise notice 'PASS 10a intent failed met order_conflict, geen tweede order';

  -- Verlopen intent met late betaling wordt gehonoreerd (zoals activate_order).
  r := pg_temp.maak('laat@voorbeeld.nl', '+31666666662');
  i := (r ->> 'intent_id')::uuid;
  perform pg_temp.pending(i, 'tr_test_7');
  update tmc.checkout_intents set status = 'expired' where id = i;
  r := pg_temp.convert(i, pg_temp.p(15), 'tr_test_7', true);
  perform pg_temp.verwacht('10b verlopen intent met late betaling geconverteerd', r, true);

  -- Draft (nog geen betaling) kan niet converteren; verkeerde betaling ook niet.
  r := pg_temp.maak('draft@voorbeeld.nl', '+31666666663');
  i := (r ->> 'intent_id')::uuid;
  r := pg_temp.convert(i, pg_temp.p(15), 'tr_geen', true);
  perform pg_temp.verwacht('10c draft converteren: invalid_status', r, false, 'invalid_status');
  perform pg_temp.pending(i, 'tr_test_8');
  r := pg_temp.convert(i, pg_temp.p(15), 'tr_anders', true);
  perform pg_temp.verwacht('10d andere betaling: payment_intent_mismatch', r, false, 'payment_intent_mismatch');
  r := pg_temp.convert(gen_random_uuid(), pg_temp.p(15), 'tr_x', true);
  perform pg_temp.verwacht('10e onbekende intent', r, false, 'intent_not_found');
end $$;

-- ---------------------------------------------------------------------------
-- 11. Lookup na 7 dagen: not_found (wijziging D)
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := pg_temp.status(pg_temp.krijg('t1'));
  if r ->> 'status' <> 'converted' then raise exception 'FAIL 11a: %', r; end if;
  update tmc.checkout_intents set created_at = now() - interval '8 days' where id = pg_temp.krijg('i1')::uuid;
  r := pg_temp.status(pg_temp.krijg('t1'));
  if r ->> 'status' <> 'not_found' or (select count(*) from jsonb_object_keys(r)) <> 1 then
    raise exception 'FAIL 11b: lookup ouder dan 7 dagen gaf %', r;
  end if;
  raise notice 'PASS 11b lookup ouder dan 7 dagen: not_found zonder andere sleutels';
end $$;

-- ---------------------------------------------------------------------------
-- 12. auth_user_id_for_email
-- ---------------------------------------------------------------------------
do $$
declare v uuid;
begin
  perform pg_temp.als('service_role');
  v := tmc.auth_user_id_for_email('  CI-1@Test.Invalid ');
  if v is distinct from pg_temp.p(1) then raise exception 'FAIL 12a: kreeg %', v; end if;
  v := tmc.auth_user_id_for_email('niemand@test.invalid');
  if v is not null then raise exception 'FAIL 12b: kreeg %', v; end if;
  reset role;
  raise notice 'PASS 12 auth_user_id_for_email: hoofdletters en witruimte genegeerd, onbekend null';
end $$;

-- ---------------------------------------------------------------------------
-- 13. Constraints op de tabel zelf (als postgres)
-- ---------------------------------------------------------------------------
select pg_temp.verwacht_fout('13a pending zonder betaling geweigerd', 'postgres',
  $$update tmc.checkout_intents set status = 'pending' where id = '$$ || pg_temp.krijg('i_live') || $$'$$, '23514');
select pg_temp.verwacht_fout('13b converted zonder profiel geweigerd', 'postgres',
  $$update tmc.checkout_intents set status = 'converted' where id = '$$ || pg_temp.krijg('i_live') || $$'$$, '23514');
select pg_temp.verwacht_fout('13c failed zonder foutcode geweigerd', 'postgres',
  $$update tmc.checkout_intents set status = 'failed' where id = '$$ || pg_temp.krijg('i_live') || $$'$$, '23514');
select pg_temp.verwacht_fout('13d e-mail met hoofdletters geweigerd', 'postgres',
  $$update tmc.checkout_intents set email = 'Hoofd@letter.nl' where id = '$$ || pg_temp.krijg('i_live') || $$'$$, '23514');
select pg_temp.verwacht_fout('13e PII wissen op draft geweigerd', 'postgres',
  $$update tmc.checkout_intents set phone = null where id = '$$ || pg_temp.krijg('i_live') || $$'$$, '23514');

do $$ begin raise notice 'ALLE TESTS GESLAAGD'; end $$;

rollback;
