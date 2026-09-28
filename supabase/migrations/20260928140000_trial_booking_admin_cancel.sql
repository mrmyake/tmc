-- Annulering van proeflessen door de studio (spec-community-growth.md §1
-- "Proefcodes", subsectie "Annulering door de studio"; spec-facturatie.md
-- 4.7 en 7.4 voor de restitutie).
--
-- Wat hier verandert:
-- 1. tmc.payment_refunds: een rij per terugbetalingsintentie, aangemaakt in
--    dezelfde transactie als de annulering (status 'requested'), daarna
--    door de app-laag bij Mollie ingediend en bijgewerkt naar de Mollie-
--    status of 'failed' met last_error. Een refund die nooit bij Mollie is
--    aangekomen blijft zichtbaar als 'requested' en is via dezelfde
--    retry-knop op te pakken. Per betaling hooguit een rij in een actieve
--    status (partiele unieke index): nooit dubbel terugbetalen.
-- 2. trial_bookings.cancellation_reason: de reden gaat in de rij en in de
--    mail aan de bezoeker.
-- 3. Een kern tmc.cancel_trial_booking_core (geen grants, alleen via de
--    twee SECURITY DEFINER-poorten) die annuleren, reden, refund-intentie
--    en events in een transactie doet. admin_cancel_trial_booking(uuid,
--    text) voor de admin (is_admin), system_cancel_trial_booking(uuid,
--    text) voor de service-role (webhook-bijvangst: betaling komt binnen op
--    een al geannuleerde sessie). De oude admin_cancel_trial_booking(uuid)
--    wordt gedropt op basis van de live definitie (pg_get_functiondef,
--    2026-09-28) en herbouwd met de reden als verplichte parameter.
--
-- Het restbedrag wordt uitsluitend server-side berekend uit de payments-rij:
-- amount_cents minus wat al terug is (het hoogste van refunded_amount_cents,
-- gevuld door de webhook uit Mollie's amountRefunded, en de som van eigen
-- rijen met status 'refunded') minus wat nog onderweg is (actieve rijen).
--
-- Bewust ongewijzigd: de release-trigger op trial_bookings (die vangt elke
-- annulering, ook deze), de expire-orders-cron, v_revenue_lines en het
-- omzetrapport (die lezen refunded_amount_cents al af; alleen de schrijver
-- ontbrak en die komt in de trial-webhook, TS). Schema tmc only; public en
-- tvmuur onaangeroerd; 20260503 placeholder onaangeroerd. Draaien met
-- `supabase db push` na de merge; niet ervoor.

begin;

-- ---------------------------------------------------------------------------
-- 1. Oude poort weg (grants eerst, dan drop)
-- ---------------------------------------------------------------------------

revoke all on function tmc.admin_cancel_trial_booking(uuid) from public, anon, authenticated, service_role;
drop function if exists tmc.admin_cancel_trial_booking(uuid);

-- ---------------------------------------------------------------------------
-- 2. trial_bookings.cancellation_reason
-- ---------------------------------------------------------------------------

alter table tmc.trial_bookings
  add column if not exists cancellation_reason text;

comment on column tmc.trial_bookings.cancellation_reason is
  'Reden bij annulering door de studio (losse annulering of sessie-annulering). Gaat in de mail aan de bezoeker. Null bij zelfservice-annulering en bij de cron.';

-- ---------------------------------------------------------------------------
-- 3. payment_refunds
-- ---------------------------------------------------------------------------

create table tmc.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references tmc.payments(id) on delete cascade,
  trial_booking_id uuid references tmc.trial_bookings(id) on delete set null,
  mollie_refund_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'requested'
    check (status in ('requested', 'queued', 'pending', 'processing', 'refunded', 'failed', 'canceled')),
  requested_by uuid references tmc.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table tmc.payment_refunds is
  'Terugbetalingsintenties en hun Mollie-status. requested = aangemaakt in de annuleringstransactie, nog niet bij Mollie; queued/pending/processing/refunded/canceled = Mollie-status; failed = indienen mislukt, zie last_error, opnieuw te proberen. Per betaling hooguit een actieve rij.';

-- Nooit dubbel terugbetalen: hooguit een actieve intentie per betaling.
create unique index payment_refunds_one_active_per_payment_idx
  on tmc.payment_refunds (payment_id)
  where status in ('requested', 'queued', 'pending', 'processing');
create index payment_refunds_payment_id_idx on tmc.payment_refunds (payment_id);
create index payment_refunds_trial_booking_id_idx on tmc.payment_refunds (trial_booking_id);

revoke all on table tmc.payment_refunds from public, anon, authenticated;
grant all on table tmc.payment_refunds to service_role;
alter table tmc.payment_refunds enable row level security;
create policy payment_refunds_admin_all on tmc.payment_refunds
  for all using (tmc.is_admin()) with check (tmc.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Kern: annuleren plus refund-intentie in een transactie
-- ---------------------------------------------------------------------------

create function tmc.cancel_trial_booking_core(
  p_id uuid,
  p_reason text,
  p_actor_type text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  v_tb tmc.trial_bookings%rowtype;
  v_pay tmc.payments%rowtype;
  v_remaining integer := 0;
  v_refund_id uuid;
  v_refund_amount integer;
  v_refund_skipped text;
begin
  -- Verwachte weigeringen als jsonb-reason, geen exceptions
  -- (conventie book_class_session).
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'reason', 'reason_required');
  end if;

  select * into v_tb
  from tmc.trial_bookings
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;
  -- Alleen 'paid' is annuleerbaar. Een 'pending' rij hoort bij een lopende
  -- Mollie-betaling; die laat de expire-orders-cron met Mollie
  -- reconcilieren, anders kan een bezoeker betalen voor een plek die al
  -- weg is. Komt zo'n betaling toch binnen op een geannuleerde sessie, dan
  -- vangt de webhook dat via system_cancel_trial_booking.
  if v_tb.status <> 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_open');
  end if;

  update tmc.trial_bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = v_reason
  where id = p_id;

  -- Refund-intentie, alleen bij een betaalde proefles met een betaalregel.
  if v_tb.price_paid_cents > 0 and v_tb.mollie_payment_id is not null then
    select * into v_pay
    from tmc.payments
    where mollie_payment_id = v_tb.mollie_payment_id
    for update;

    if not found then
      v_refund_skipped := 'payment_missing';
    elsif v_pay.status <> 'paid' then
      v_refund_skipped := 'payment_not_paid';
    else
      v_remaining := v_pay.amount_cents
        - greatest(
            v_pay.refunded_amount_cents,
            coalesce((select sum(r.amount_cents) from tmc.payment_refunds r
                      where r.payment_id = v_pay.id and r.status = 'refunded'), 0)
          )
        - coalesce((select sum(r.amount_cents) from tmc.payment_refunds r
                    where r.payment_id = v_pay.id
                      and r.status in ('requested', 'queued', 'pending', 'processing')), 0);

      if v_remaining <= 0 then
        v_refund_skipped := 'nothing_left';
      else
        -- Partiele unieke index als arbiter: bestaat er al een actieve
        -- intentie, dan geen tweede (v_refund_id blijft null).
        insert into tmc.payment_refunds (payment_id, trial_booking_id, amount_cents, status, requested_by)
        values (v_pay.id, p_id, v_remaining, 'requested', p_actor_id)
        on conflict (payment_id) where status in ('requested', 'queued', 'pending', 'processing') do nothing
        returning id into v_refund_id;

        if v_refund_id is null then
          v_refund_skipped := 'refund_already_active';
        else
          v_refund_amount := v_remaining;
          insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
          values (
            'trial_booking.refund_requested', p_actor_type, p_actor_id, 'payment_refund', v_refund_id,
            jsonb_build_object(
              'payment_id', v_pay.id,
              'trial_booking_id', p_id,
              'amount_cents', v_remaining,
              'is_test', v_pay.is_test
            )
          );
        end if;
      end if;
    end if;
  end if;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'trial_booking.cancelled', p_actor_type, p_actor_id, 'trial_booking', p_id,
    jsonb_build_object(
      'session_id', v_tb.session_id,
      'trial_code_id', v_tb.trial_code_id,
      'via', p_actor_type,
      'reason', v_reason,
      'refund_id', v_refund_id,
      'refund_skipped', v_refund_skipped
    )
  );

  return jsonb_build_object(
    'ok', true,
    'trial_booking_id', p_id,
    'session_id', v_tb.session_id,
    'trial_code_id', v_tb.trial_code_id,
    'price_paid_cents', v_tb.price_paid_cents,
    'is_test', v_tb.is_test,
    'refund_id', v_refund_id,
    'refund_amount_cents', v_refund_amount,
    'refund_skipped', v_refund_skipped
  );
end;
$$;

-- Alleen via de twee poorten hieronder (SECURITY DEFINER draait als
-- eigenaar); geen enkele rol mag de kern rechtstreeks aanroepen.
revoke all on function tmc.cancel_trial_booking_core(uuid, text, text, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Poort admin (is_admin) en poort systeem (service_role)
-- ---------------------------------------------------------------------------

create function tmc.admin_cancel_trial_booking(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor beheer.' using errcode = '42501';
  end if;
  return tmc.cancel_trial_booking_core(p_id, p_reason, 'admin', auth.uid());
end;
$$;

revoke all on function tmc.admin_cancel_trial_booking(uuid, text) from public, anon;
grant execute on function tmc.admin_cancel_trial_booking(uuid, text) to authenticated, service_role;

create function tmc.system_cancel_trial_booking(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
begin
  return tmc.cancel_trial_booking_core(p_id, p_reason, 'system', null);
end;
$$;

comment on function tmc.system_cancel_trial_booking(uuid, text) is
  'Annulering zonder ingelogde admin: de trial-webhook en de expire-orders-cron gebruiken dit als een betaling binnenkomt op een sessie die al geannuleerd is. Alleen service_role.';

revoke all on function tmc.system_cancel_trial_booking(uuid, text) from public, anon, authenticated;
grant execute on function tmc.system_cancel_trial_booking(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Zelfcontrole binnen een savepoint
--
-- Speelt de kern na zonder app-data te eisen: ontbreekt een class_types-,
-- trainers- of profiles-rij (verse shadow-database), dan slaat de controle
-- zichzelf over met een notice (migrations/README.md, regel 6). Elke assert
-- breekt de migratie af; ROLLBACK TO SAVEPOINT ruimt alle testrijen op
-- zonder DELETE en zonder de append-only trigger op tmc.events aan te
-- raken. SAVEPOINT kan niet binnen een DO-blok, vandaar de framing.
-- ---------------------------------------------------------------------------

savepoint trial_booking_admin_cancel_selftest;

do $$
declare
  v_ct uuid;
  v_tr uuid;
  v_pr uuid;
  v_sid uuid;
  v_pay uuid;
  v_tb_paid uuid;
  v_tb_free uuid;
  v_code uuid;
  v_res jsonb;
  v_refund uuid;
  v_dup_blocked boolean := false;
begin
  select id into v_ct from tmc.class_types limit 1;
  select id into v_tr from tmc.trainers limit 1;
  select id into v_pr from tmc.profiles limit 1;
  if v_ct is null or v_tr is null or v_pr is null then
    raise notice 'trial_booking_admin_cancel: zelfcontrole overgeslagen, geen class_types/trainers/profiles-rij (lege database)';
    return;
  end if;

  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'yoga_mobility', 'adult', now() + interval '400 days', now() + interval '400 days 1 hour', 4, 'scheduled')
  returning id into v_sid;

  -- Betaalde proefles met betaalregel (zoals de webhook die spiegelt).
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, mollie_payment_id, status, is_test)
  values (v_sid, 'Zelfcontrole Betaald', 'zelfcontrole-betaald@test.invalid', '0600000000', 1700, 'tr_zelfcontrole_refund', 'paid', true)
  returning id into v_tb_paid;
  insert into tmc.payments (mollie_payment_id, amount_cents, status, method, kind, trial_booking_id, is_test, paid_at)
  values ('tr_zelfcontrole_refund', 1700, 'paid', 'ideal', 'trial_booking', v_tb_paid, true, now())
  returning id into v_pay;

  -- Reden verplicht.
  v_res := tmc.cancel_trial_booking_core(v_tb_paid, '  ', 'admin', v_pr);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'reason_required' then
    raise exception 'trial_booking_admin_cancel: lege reden hoort reason_required te geven: %', v_res;
  end if;
  if (select status from tmc.trial_bookings where id = v_tb_paid) <> 'paid' then
    raise exception 'trial_booking_admin_cancel: weigering mag de boeking niet raken';
  end if;

  -- Annuleren betaald: boeking cancelled, reden opgeslagen, refund-rij requested.
  v_res := tmc.cancel_trial_booking_core(v_tb_paid, 'Zelfcontrole', 'admin', v_pr);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_booking_admin_cancel: annuleren betaald faalde: %', v_res;
  end if;
  v_refund := (v_res->>'refund_id')::uuid;
  if v_refund is null or (v_res->>'refund_amount_cents')::int <> 1700 then
    raise exception 'trial_booking_admin_cancel: refund-intentie ontbreekt of verkeerd bedrag: %', v_res;
  end if;
  if (select status||'|'||coalesce(cancellation_reason,'') from tmc.trial_bookings where id = v_tb_paid) <> 'cancelled|Zelfcontrole' then
    raise exception 'trial_booking_admin_cancel: status of reden niet opgeslagen';
  end if;
  if (select status||'|'||amount_cents||'|'||payment_id::text from tmc.payment_refunds where id = v_refund) <> 'requested|1700|'||v_pay::text then
    raise exception 'trial_booking_admin_cancel: refund-rij niet zoals verwacht';
  end if;

  -- Tweede actieve refund-rij voor dezelfde betaling wordt geweigerd.
  begin
    insert into tmc.payment_refunds (payment_id, trial_booking_id, amount_cents, status)
    values (v_pay, v_tb_paid, 100, 'pending');
  exception
    when unique_violation then
      v_dup_blocked := true;
  end;
  if not v_dup_blocked then
    raise exception 'trial_booking_admin_cancel: tweede actieve refund-rij had moeten weigeren';
  end if;

  -- Nogmaals annuleren: al geannuleerd, geen tweede intentie.
  v_res := tmc.cancel_trial_booking_core(v_tb_paid, 'Nogmaals', 'admin', v_pr);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'booking_not_open' then
    raise exception 'trial_booking_admin_cancel: tweede annulering hoort booking_not_open te geven: %', v_res;
  end if;
  if (select count(*) from tmc.payment_refunds where payment_id = v_pay) <> 1 then
    raise exception 'trial_booking_admin_cancel: meer dan een refund-rij';
  end if;

  -- Gratis codeboeking: geen refund-rij, code komt vrij via de trigger.
  insert into tmc.trial_codes (code, label, max_uses, created_by)
  values ('ZELFCONTROLECANCEL', 'zelfcontrole annulering', 1, v_pr)
  returning id into v_code;
  v_res := tmc.redeem_trial_code('ZELFCONTROLECANCEL', v_sid, 'Zelfcontrole Gratis', 'zelfcontrole-gratis@test.invalid', '0600000000', true);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_booking_admin_cancel: inwisselen voor de zelfcontrole faalde: %', v_res;
  end if;
  v_tb_free := (v_res->>'trial_booking_id')::uuid;
  v_res := tmc.cancel_trial_booking_core(v_tb_free, 'Zelfcontrole gratis', 'system', null);
  if not (v_res->>'ok')::boolean or v_res->>'refund_id' is not null then
    raise exception 'trial_booking_admin_cancel: gratis annulering hoort zonder refund te slagen: %', v_res;
  end if;
  if (select uses_count from tmc.trial_codes where id = v_code) <> 0 then
    raise exception 'trial_booking_admin_cancel: code niet vrijgegeven na annulering';
  end if;
  if (select released_at from tmc.trial_code_redemptions where trial_booking_id = v_tb_free) is null then
    raise exception 'trial_booking_admin_cancel: released_at niet gezet';
  end if;
  if (select count(*) from tmc.payment_refunds where trial_booking_id = v_tb_free) <> 0 then
    raise exception 'trial_booking_admin_cancel: gratis boeking heeft een refund-rij';
  end if;
end $$;

rollback to savepoint trial_booking_admin_cancel_selftest;
release savepoint trial_booking_admin_cancel_selftest;

-- ---------------------------------------------------------------------------
-- 7. Grants asserteren (buiten het savepoint, aan het slot van de transactie)
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
begin
  v_fn := 'tmc.admin_cancel_trial_booking(uuid, text)';
  if has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'trial_booking_admin_cancel: grants op % kloppen niet', v_fn;
  end if;

  v_fn := 'tmc.system_cancel_trial_booking(uuid, text)';
  if has_function_privilege('anon', v_fn, 'execute')
     or has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'trial_booking_admin_cancel: grants op % kloppen niet', v_fn;
  end if;

  v_fn := 'tmc.cancel_trial_booking_core(uuid, text, text, uuid)';
  if has_function_privilege('anon', v_fn, 'execute')
     or has_function_privilege('authenticated', v_fn, 'execute')
     or has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'trial_booking_admin_cancel: de kern mag door geen enkele rol aanroepbaar zijn';
  end if;

  if has_table_privilege('anon', 'tmc.payment_refunds', 'select')
     or has_table_privilege('authenticated', 'tmc.payment_refunds', 'select')
     or has_table_privilege('authenticated', 'tmc.payment_refunds', 'insert')
     or not has_table_privilege('service_role', 'tmc.payment_refunds', 'insert') then
    raise exception 'trial_booking_admin_cancel: grants op tmc.payment_refunds kloppen niet';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tmc' and p.proname = 'admin_cancel_trial_booking'
      and pg_get_function_identity_arguments(p.oid) = 'p_id uuid'
  ) then
    raise exception 'trial_booking_admin_cancel: de oude poort admin_cancel_trial_booking(uuid) bestaat nog';
  end if;
end $$;

commit;
