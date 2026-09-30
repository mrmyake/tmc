-- feat/checkout-intents-lifecycle-rpcs (PR 1b van "checkout: betalen voor account")
--
-- Aanvulling op 20261002090000_checkout_intents.sql. Besluit Ilja
-- (2026-09-30): app-code doet geen directe service-role-updates op
-- tmc.checkout_intents; elke lifecycle-write loopt via een RPC. PR 1 dekte
-- create, mark pending, convert, fail, status-lookup, consume en rotate.
-- Hier komen de vier resterende schrijfpaden bij, plus twee leespaden die de
-- app anders alleen met een eigen hash-berekening of een tabel-scan kon doen:
--
-- - replace_checkout_intent_payment: "Opnieuw proberen" op de bedankpagina.
--   Compare-and-swap op de betaling: alleen bij status pending of cancelled,
--   niet verlopen, en alleen als de oude betaling overeenkomt (twee
--   gelijktijdige retries zien dezelfde oude id; de tweede krijgt
--   payment_mismatch of already). cancelled gaat terug naar pending.
-- - cancel_checkout_intent: webhook met canceled, failed of expired op de
--   betaling. Alleen als de betaling overeenkomt en status pending is;
--   idempotent op cancelled en expired.
-- - expire_checkout_intents: dagelijkse cron; draft en pending voorbij
--   expires_at naar expired.
-- - wipe_stale_checkout_intent_pii: dagelijkse cron; PII op null (rij blijft)
--   voor expired, cancelled en failed ouder dan 30 dagen (besluit 3).
-- - list_stale_pending_checkout_intents: uurlijkse reconciliatie tegen
--   Mollie; alleen id, mode en mollie_payment_id.
-- - checkout_intent_for_retry: de retry-action kent alleen het status-token
--   uit de URL; deze lookup geeft wat de retry nodig heeft en niets meer
--   (geen PII, geen inlogtoken).
--
-- Zelfde regels als PR 1: SECURITY DEFINER, search_path tmc en extensions,
-- auth.uid() geweigerd, EXECUTE alleen voor service_role (README regel 7),
-- geen PII in foutcodes. Bestaande functies en de tabel ongewijzigd.
--
-- Tests: scripts/test-checkout-intents.sql, secties 14 tot en met 19.

-- ---------------------------------------------------------------------------
-- 1. replace_checkout_intent_payment
-- ---------------------------------------------------------------------------

create function tmc.replace_checkout_intent_payment(
  p_intent_id uuid,
  p_old_payment_id text,
  p_new_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_row tmc.checkout_intents%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'replace_checkout_intent_payment is service-role only.' using errcode = '42501';
  end if;
  if p_new_payment_id is null or btrim(p_new_payment_id) = '' then
    return jsonb_build_object('ok', false, 'reason', 'payment_id_required');
  end if;

  select * into v_row from tmc.checkout_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'intent_not_found');
  end if;
  -- Idempotent: dezelfde vervanging nog eens.
  if v_row.status = 'pending' and v_row.mollie_payment_id = p_new_payment_id then
    return jsonb_build_object('ok', true, 'already_replaced', true);
  end if;
  if v_row.status not in ('pending', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_row.status);
  end if;
  if v_row.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_row.mollie_payment_id is distinct from p_old_payment_id then
    return jsonb_build_object('ok', false, 'reason', 'payment_mismatch');
  end if;

  begin
    update tmc.checkout_intents
    set status = 'pending', mollie_payment_id = p_new_payment_id
    where id = p_intent_id;
  exception
    when unique_violation then
      -- checkout_intents_mollie_payment_id_key: de nieuwe betaling hangt al
      -- aan een andere intent.
      return jsonb_build_object('ok', false, 'reason', 'payment_in_use');
  end;

  return jsonb_build_object('ok', true, 'already_replaced', false, 'previous_status', v_row.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. cancel_checkout_intent
-- ---------------------------------------------------------------------------

create function tmc.cancel_checkout_intent(
  p_intent_id uuid,
  p_mollie_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_row tmc.checkout_intents%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'cancel_checkout_intent is service-role only.' using errcode = '42501';
  end if;

  select * into v_row from tmc.checkout_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'intent_not_found');
  end if;
  if v_row.mollie_payment_id is distinct from p_mollie_payment_id then
    return jsonb_build_object('ok', false, 'reason', 'payment_mismatch');
  end if;
  -- Idempotent: al geannuleerd, of intussen verlopen door de cron.
  if v_row.status in ('cancelled', 'expired') then
    return jsonb_build_object('ok', true, 'already_cancelled', true, 'status', v_row.status);
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_row.status);
  end if;

  update tmc.checkout_intents set status = 'cancelled' where id = p_intent_id;
  return jsonb_build_object('ok', true, 'already_cancelled', false, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. expire_checkout_intents
-- ---------------------------------------------------------------------------

create function tmc.expire_checkout_intents()
returns integer
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null then
    raise exception 'expire_checkout_intents is service-role only.' using errcode = '42501';
  end if;

  update tmc.checkout_intents
  set status = 'expired'
  where status in ('draft', 'pending')
    and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. wipe_stale_checkout_intent_pii
-- ---------------------------------------------------------------------------

create function tmc.wipe_stale_checkout_intent_pii(
  p_older_than interval default interval '30 days'
)
returns integer
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null then
    raise exception 'wipe_stale_checkout_intent_pii is service-role only.' using errcode = '42501';
  end if;
  if p_older_than is null or p_older_than < interval '1 day' then
    raise exception 'wipe_stale_checkout_intent_pii: p_older_than is minimaal 1 dag.' using errcode = '22023';
  end if;

  -- Rij blijft (telling en betaalspoor), alleen de persoonsgegevens gaan
  -- weg. checkout_intents_pii_required geldt alleen voor draft en pending.
  update tmc.checkout_intents
  set email = null, first_name = null, last_name = null, phone = null,
      street_address = null, postal_code = null, city = null
  where status in ('expired', 'cancelled', 'failed')
    and created_at < now() - p_older_than
    and (email is not null or first_name is not null or last_name is not null or phone is not null
         or street_address is not null or postal_code is not null or city is not null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. list_stale_pending_checkout_intents (uurlijkse reconciliatie)
-- ---------------------------------------------------------------------------

create function tmc.list_stale_pending_checkout_intents(
  p_older_than interval default interval '2 hours',
  p_limit integer default 100
)
returns table (id uuid, mode text, mollie_payment_id text)
language plpgsql
security definer
stable
set search_path to 'tmc', 'extensions'
as $$
begin
  if auth.uid() is not null then
    raise exception 'list_stale_pending_checkout_intents is service-role only.' using errcode = '42501';
  end if;
  -- updated_at, niet created_at: een vervangen betaling (retry) begint de
  -- wachttijd opnieuw.
  return query
    select i.id, i.mode, i.mollie_payment_id
    from tmc.checkout_intents i
    where i.status = 'pending'
      and i.mollie_payment_id is not null
      and i.updated_at < now() - coalesce(p_older_than, interval '2 hours')
    order by i.updated_at
    limit greatest(coalesce(p_limit, 100), 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. checkout_intent_for_retry (status-token, geen PII, geen inlogtoken)
-- ---------------------------------------------------------------------------

create function tmc.checkout_intent_for_retry(p_status_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_row tmc.checkout_intents%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'checkout_intent_for_retry is service-role only.' using errcode = '42501';
  end if;
  if p_status_token is null or length(p_status_token) <> 64 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_row
  from tmc.checkout_intents
  where status_token_hash = tmc._checkout_token_hash(p_status_token)
    and created_at > now() - interval '7 days';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'intent_id', v_row.id,
    'status', v_row.status,
    'mode', v_row.mode,
    'kind', v_row.kind,
    'catalogue_slug', v_row.catalogue_slug,
    'first_charge_cents', v_row.first_charge_cents,
    'mollie_customer_id', v_row.mollie_customer_id,
    'mollie_payment_id', v_row.mollie_payment_id,
    'return_target', v_row.return_target,
    'expires_at', v_row.expires_at,
    'expired', v_row.expires_at < now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants: alleen service_role
-- ---------------------------------------------------------------------------

revoke execute on function tmc.replace_checkout_intent_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function tmc.replace_checkout_intent_payment(uuid, text, text) to service_role;

revoke execute on function tmc.cancel_checkout_intent(uuid, text) from public, anon, authenticated;
grant execute on function tmc.cancel_checkout_intent(uuid, text) to service_role;

revoke execute on function tmc.expire_checkout_intents() from public, anon, authenticated;
grant execute on function tmc.expire_checkout_intents() to service_role;

revoke execute on function tmc.wipe_stale_checkout_intent_pii(interval) from public, anon, authenticated;
grant execute on function tmc.wipe_stale_checkout_intent_pii(interval) to service_role;

revoke execute on function tmc.list_stale_pending_checkout_intents(interval, integer) from public, anon, authenticated;
grant execute on function tmc.list_stale_pending_checkout_intents(interval, integer) to service_role;

revoke execute on function tmc.checkout_intent_for_retry(text) from public, anon, authenticated;
grant execute on function tmc.checkout_intent_for_retry(text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Zelfcontrole
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_fns text[] := array[
    'tmc.replace_checkout_intent_payment(uuid, text, text)',
    'tmc.cancel_checkout_intent(uuid, text)',
    'tmc.expire_checkout_intents()',
    'tmc.wipe_stale_checkout_intent_pii(interval)',
    'tmc.list_stale_pending_checkout_intents(interval, integer)',
    'tmc.checkout_intent_for_retry(text)'
  ];
begin
  foreach v_fn in array v_fns loop
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '%: anon of authenticated mag uitvoeren', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '%: service_role mag niet uitvoeren', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid = v_fn::regprocedure and p.prosecdef
        and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
    ) then
      raise exception '%: geen SECURITY DEFINER met expliciete search_path', v_fn;
    end if;
  end loop;
end $$;
