-- Zelfservice-annulering van een proefles met terugbetaling
-- (spec-community-growth.md §1 "Annulering door de studio", alinea
-- "Zelfservice"). Beleid identiek aan leden (cancel_class_booking):
-- binnen de annuleringstermijn volledige terugbetaling, na de termijn
-- annuleren zonder terugbetaling met reden 'late'. Niet blokkeren.
--
-- Wat hier verandert:
-- 1. tmc.cancel_trial_booking_core krijgt een vijfde parameter p_refund.
--    Bij false wordt geen refund-intentie gemaakt en logt het event
--    refund_skipped = 'outside_window'. Bij true is het gedrag byte voor
--    byte de live definitie (pg_get_functiondef, 2026-09-29).
-- 2. admin_cancel_trial_booking(uuid, text) en
--    system_cancel_trial_booking(uuid, text) worden herbouwd op hun live
--    definitie; de enige wijziging is p_refund = true in de aanroep van de
--    kern. Zelfde checks, zelfde events, zelfde intentie.
-- 3. Nieuwe poort tmc.visitor_cancel_trial_booking(p_token uuid), alleen
--    service_role (de annuleerpagina gebruikt de service-role client). Zoekt
--    de boeking op cancel_token, bepaalt de termijn server-side met
--    dezelfde bron, fallback en formule als cancel_class_booking
--    (booking_settings.cancellation_window_hours, fallback 6,
--    start_at - now() >= make_interval(hours => ...), dus inclusief op de
--    grens) en roept de kern aan met actor 'visitor', reden
--    'within_window' of 'late' en p_refund = within_window.
--
-- Bewust ongewijzigd: de release-trigger op trial_bookings (een
-- codeboeking krijgt haar gebruik ook na de termijn terug, besluit Ilja
-- 2026-09-29), status 'pending' blijft buiten zelfservice (de kern weigert
-- alles behalve 'paid'), tmc.payment_refunds, de refund-processor.
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Draaien met `supabase db push` na de merge; niet ervoor.

begin;

-- ---------------------------------------------------------------------------
-- 1. Poorten en oude kern weg (grants eerst, dan drop)
-- ---------------------------------------------------------------------------

revoke all on function tmc.admin_cancel_trial_booking(uuid, text) from public, anon, authenticated, service_role;
drop function if exists tmc.admin_cancel_trial_booking(uuid, text);

revoke all on function tmc.system_cancel_trial_booking(uuid, text) from public, anon, authenticated, service_role;
drop function if exists tmc.system_cancel_trial_booking(uuid, text);

revoke all on function tmc.cancel_trial_booking_core(uuid, text, text, uuid) from public, anon, authenticated, service_role;
drop function if exists tmc.cancel_trial_booking_core(uuid, text, text, uuid);

-- ---------------------------------------------------------------------------
-- 2. Kern met p_refund
-- ---------------------------------------------------------------------------

create function tmc.cancel_trial_booking_core(
  p_id uuid,
  p_reason text,
  p_actor_type text,
  p_actor_id uuid,
  p_refund boolean
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

  -- Refund-intentie, alleen bij een betaalde proefles met een betaalregel
  -- en alleen als de poort om terugbetaling vraagt (p_refund). Na de
  -- annuleringstermijn vraagt de bezoekerspoort er niet om, zoals een lid
  -- na de termijn zijn credit niet terugkrijgt.
  if v_tb.price_paid_cents > 0 and v_tb.mollie_payment_id is not null then
    if not coalesce(p_refund, false) then
      v_refund_skipped := 'outside_window';
    else
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

-- Alleen via de poorten hieronder (SECURITY DEFINER draait als eigenaar);
-- geen enkele rol mag de kern rechtstreeks aanroepen.
revoke all on function tmc.cancel_trial_booking_core(uuid, text, text, uuid, boolean) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Admin- en systeempoort, identiek op p_refund = true na
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
  return tmc.cancel_trial_booking_core(p_id, p_reason, 'admin', auth.uid(), true);
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
  return tmc.cancel_trial_booking_core(p_id, p_reason, 'system', null, true);
end;
$$;

comment on function tmc.system_cancel_trial_booking(uuid, text) is
  'Annulering zonder ingelogde admin: de trial-webhook en de expire-orders-cron gebruiken dit als een betaling binnenkomt op een sessie die al geannuleerd is. Alleen service_role.';

revoke all on function tmc.system_cancel_trial_booking(uuid, text) from public, anon, authenticated;
grant execute on function tmc.system_cancel_trial_booking(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Bezoekerspoort op cancel_token
-- ---------------------------------------------------------------------------

create function tmc.visitor_cancel_trial_booking(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_tb tmc.trial_bookings%rowtype;
  v_start_at timestamptz;
  v_cancel_hours int;
  v_within_window boolean;
  v_res jsonb;
begin
  if p_token is null then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  select * into v_tb
  from tmc.trial_bookings
  where cancel_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  -- Termijn: dezelfde bron, fallback en formule als cancel_class_booking
  -- voor leden (groepslessen; vrij trainen is geen proefles).
  select coalesce(bs.cancellation_window_hours, 6)
  into v_cancel_hours
  from tmc.booking_settings bs
  limit 1;
  if not found then
    v_cancel_hours := 6;
  end if;

  select start_at into v_start_at
  from tmc.class_sessions where id = v_tb.session_id;
  if v_start_at is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  v_within_window := v_start_at - now() >= make_interval(hours => v_cancel_hours);

  -- De kern lockt de boeking en weigert alles behalve 'paid' (pending en
  -- al geannuleerd blijven buiten zelfservice).
  v_res := tmc.cancel_trial_booking_core(
    v_tb.id,
    case when v_within_window then 'within_window' else 'late' end,
    'visitor',
    null,
    v_within_window
  );

  return v_res || jsonb_build_object(
    'within_window', v_within_window,
    'cancellation_window_hours', v_cancel_hours
  );
end;
$$;

comment on function tmc.visitor_cancel_trial_booking(uuid) is
  'Zelfservice-annulering via de annuleerlink (cancel_token). Binnen de annuleringstermijn uit booking_settings (inclusief de grens) met refund-intentie, daarna zonder, reden within_window of late zoals cancel_class_booking. Alleen service_role.';

revoke all on function tmc.visitor_cancel_trial_booking(uuid) from public, anon, authenticated;
grant execute on function tmc.visitor_cancel_trial_booking(uuid) to service_role;

comment on column tmc.trial_bookings.cancellation_reason is
  'Reden van de annulering. Door de studio (losse annulering of sessie-annulering): vrije tekst van de admin, gaat in de mail aan de bezoeker. Zelfservice via de annuleerlink: within_window of late, zoals bookings.cancellation_reason bij leden. Null bij de cron en bij annuleringen van voor 2026-09-29.';

-- ---------------------------------------------------------------------------
-- 5. Zelfcontrole binnen een savepoint
--
-- Speelt de kern na zonder app-data te eisen: ontbreekt een class_types-,
-- trainers- of profiles-rij (verse shadow-database), dan slaat de controle
-- zichzelf over met een notice (migrations/README.md, regel 6). Elke assert
-- breekt de migratie af; ROLLBACK TO SAVEPOINT ruimt alle testrijen op
-- zonder DELETE en zonder de append-only trigger op tmc.events aan te
-- raken. now() is binnen de transactie constant, dus een sessie op
-- now() + termijn ligt exact op de grens.
-- ---------------------------------------------------------------------------

savepoint trial_visitor_self_cancel_selftest;

do $$
declare
  v_ct uuid;
  v_tr uuid;
  v_pr uuid;
  v_hours int;
  v_far uuid;
  v_edge uuid;
  v_near uuid;
  v_tb uuid;
  v_tok uuid;
  v_pay uuid;
  v_code uuid;
  v_res jsonb;
  v_denied boolean := false;
begin
  select id into v_ct from tmc.class_types limit 1;
  select id into v_tr from tmc.trainers limit 1;
  select id into v_pr from tmc.profiles limit 1;
  if v_ct is null or v_tr is null or v_pr is null then
    raise notice 'trial_visitor_self_cancel: zelfcontrole overgeslagen, geen class_types/trainers/profiles-rij (lege database)';
    return;
  end if;

  select coalesce(bs.cancellation_window_hours, 6) into v_hours from tmc.booking_settings bs limit 1;
  v_hours := coalesce(v_hours, 6);

  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'yoga_mobility', 'adult', now() + interval '400 days', now() + interval '400 days 1 hour', 10, 'scheduled')
  returning id into v_far;
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'yoga_mobility', 'adult', now() + make_interval(hours => v_hours), now() + make_interval(hours => v_hours + 1), 10, 'scheduled')
  returning id into v_edge;
  insert into tmc.class_sessions (class_type_id, trainer_id, pillar, age_category, start_at, end_at, capacity, status)
  values (v_ct, v_tr, 'yoga_mobility', 'adult', now() + interval '1 hour', now() + interval '2 hours', 10, 'scheduled')
  returning id into v_near;

  -- 1. Betaald binnen de termijn: refund-intentie van het volle bedrag.
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, mollie_payment_id, status, is_test)
  values (v_far, 'Zelfcontrole Binnen', 'zc-binnen@test.invalid', '0600000000', 1700, 'tr_zc_self_binnen', 'paid', true)
  returning id, cancel_token into v_tb, v_tok;
  insert into tmc.payments (mollie_payment_id, amount_cents, status, method, kind, trial_booking_id, is_test, paid_at)
  values ('tr_zc_self_binnen', 1700, 'paid', 'ideal', 'trial_booking', v_tb, true, now())
  returning id into v_pay;
  v_res := tmc.visitor_cancel_trial_booking(v_tok);
  if not (v_res->>'ok')::boolean or not (v_res->>'within_window')::boolean
     or v_res->>'refund_id' is null or (v_res->>'refund_amount_cents')::int <> 1700 then
    raise exception 'trial_visitor_self_cancel: binnen de termijn hoort een intentie van 1700 te geven: %', v_res;
  end if;
  if (select status||'|'||cancellation_reason from tmc.trial_bookings where id = v_tb) <> 'cancelled|within_window' then
    raise exception 'trial_visitor_self_cancel: status of reden binnen de termijn klopt niet';
  end if;
  if (select actor_type from tmc.events where type = 'trial_booking.cancelled' and subject_id = v_tb) <> 'visitor' then
    raise exception 'trial_visitor_self_cancel: event hoort actor visitor te hebben';
  end if;

  -- 2. Tweede annulering met hetzelfde token: geweigerd, geen tweede intentie.
  v_res := tmc.visitor_cancel_trial_booking(v_tok);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'booking_not_open' then
    raise exception 'trial_visitor_self_cancel: tweede annulering hoort booking_not_open te geven: %', v_res;
  end if;
  if (select count(*) from tmc.payment_refunds where payment_id = v_pay) <> 1 then
    raise exception 'trial_visitor_self_cancel: meer dan een refund-rij na herhaalde annulering';
  end if;

  -- 3. Exact op de termijngrens telt als binnen de termijn.
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, mollie_payment_id, status, is_test)
  values (v_edge, 'Zelfcontrole Grens', 'zc-grens@test.invalid', '0600000000', 1700, 'tr_zc_self_grens', 'paid', true)
  returning id, cancel_token into v_tb, v_tok;
  insert into tmc.payments (mollie_payment_id, amount_cents, status, method, kind, trial_booking_id, is_test, paid_at)
  values ('tr_zc_self_grens', 1700, 'paid', 'ideal', 'trial_booking', v_tb, true, now());
  v_res := tmc.visitor_cancel_trial_booking(v_tok);
  if not (v_res->>'ok')::boolean or not (v_res->>'within_window')::boolean or v_res->>'refund_id' is null then
    raise exception 'trial_visitor_self_cancel: exact op de grens hoort binnen de termijn te vallen: %', v_res;
  end if;

  -- 4. Betaald na de termijn: annuleren slaagt, geen intentie, reden late.
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, mollie_payment_id, status, is_test)
  values (v_near, 'Zelfcontrole Laat', 'zc-laat@test.invalid', '0600000000', 1700, 'tr_zc_self_laat', 'paid', true)
  returning id, cancel_token into v_tb, v_tok;
  insert into tmc.payments (mollie_payment_id, amount_cents, status, method, kind, trial_booking_id, is_test, paid_at)
  values ('tr_zc_self_laat', 1700, 'paid', 'ideal', 'trial_booking', v_tb, true, now())
  returning id into v_pay;
  v_res := tmc.visitor_cancel_trial_booking(v_tok);
  if not (v_res->>'ok')::boolean or (v_res->>'within_window')::boolean
     or v_res->>'refund_id' is not null or v_res->>'refund_skipped' <> 'outside_window' then
    raise exception 'trial_visitor_self_cancel: na de termijn hoort annuleren zonder intentie te slagen: %', v_res;
  end if;
  if (select status||'|'||cancellation_reason from tmc.trial_bookings where id = v_tb) <> 'cancelled|late' then
    raise exception 'trial_visitor_self_cancel: status of reden na de termijn klopt niet';
  end if;
  if exists (select 1 from tmc.payment_refunds where payment_id = v_pay) then
    raise exception 'trial_visitor_self_cancel: na de termijn is toch een refund-rij gemaakt';
  end if;

  -- 5. Gratis codeboeking binnen de termijn: geen intentie, code vrij.
  insert into tmc.trial_codes (code, label, max_uses, created_by)
  values ('ZCSELFBINNEN', 'zelfcontrole zelfservice binnen', 1, v_pr)
  returning id into v_code;
  v_res := tmc.redeem_trial_code('ZCSELFBINNEN', v_far, 'Zelfcontrole Code Binnen', 'zc-code-binnen@test.invalid', '0600000000', true);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_visitor_self_cancel: inwisselen (binnen) faalde: %', v_res;
  end if;
  v_tok := (v_res->>'cancel_token')::uuid;
  v_res := tmc.visitor_cancel_trial_booking(v_tok);
  if not (v_res->>'ok')::boolean or v_res->>'refund_id' is not null or v_res->>'refund_skipped' is not null then
    raise exception 'trial_visitor_self_cancel: codeboeking binnen hoort zonder intentie te slagen: %', v_res;
  end if;
  if (select uses_count from tmc.trial_codes where id = v_code) <> 0 then
    raise exception 'trial_visitor_self_cancel: code niet vrijgegeven (binnen)';
  end if;

  -- 6. Gratis codeboeking na de termijn: code komt ook terug (besluit a).
  insert into tmc.trial_codes (code, label, max_uses, created_by)
  values ('ZCSELFLAAT', 'zelfcontrole zelfservice laat', 1, v_pr)
  returning id into v_code;
  v_res := tmc.redeem_trial_code('ZCSELFLAAT', v_near, 'Zelfcontrole Code Laat', 'zc-code-laat@test.invalid', '0600000000', true);
  if not (v_res->>'ok')::boolean then
    raise exception 'trial_visitor_self_cancel: inwisselen (laat) faalde: %', v_res;
  end if;
  v_tb := (v_res->>'trial_booking_id')::uuid;
  v_tok := (v_res->>'cancel_token')::uuid;
  v_res := tmc.visitor_cancel_trial_booking(v_tok);
  if not (v_res->>'ok')::boolean or (v_res->>'within_window')::boolean or v_res->>'refund_id' is not null then
    raise exception 'trial_visitor_self_cancel: codeboeking laat hoort zonder intentie te slagen: %', v_res;
  end if;
  if (select uses_count from tmc.trial_codes where id = v_code) <> 0
     or (select released_at from tmc.trial_code_redemptions where trial_booking_id = v_tb) is null then
    raise exception 'trial_visitor_self_cancel: code niet vrijgegeven na de termijn';
  end if;

  -- 7. Onbekend en leeg token: niets gevonden, niets geraakt.
  v_res := tmc.visitor_cancel_trial_booking(gen_random_uuid());
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'booking_not_found' then
    raise exception 'trial_visitor_self_cancel: onbekend token hoort booking_not_found te geven: %', v_res;
  end if;
  v_res := tmc.visitor_cancel_trial_booking(null);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'booking_not_found' then
    raise exception 'trial_visitor_self_cancel: leeg token hoort booking_not_found te geven: %', v_res;
  end if;

  -- 8. Pending blijft buiten zelfservice.
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, mollie_payment_id, status, is_test)
  values (v_far, 'Zelfcontrole Pending', 'zc-pending@test.invalid', '0600000000', 1700, 'tr_zc_self_pending', 'pending', true)
  returning id, cancel_token into v_tb, v_tok;
  v_res := tmc.visitor_cancel_trial_booking(v_tok);
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'booking_not_open' then
    raise exception 'trial_visitor_self_cancel: pending hoort booking_not_open te geven: %', v_res;
  end if;
  if (select status from tmc.trial_bookings where id = v_tb) <> 'pending' then
    raise exception 'trial_visitor_self_cancel: pending-boeking is geraakt';
  end if;

  -- 9. Systeempoort ongewijzigd: reden verplicht, betaald geeft intentie
  --    met actor system, ook voor een sessie binnen de termijn.
  insert into tmc.trial_bookings (session_id, name, email, phone, price_paid_cents, mollie_payment_id, status, is_test)
  values (v_near, 'Zelfcontrole Systeem', 'zc-systeem@test.invalid', '0600000000', 1700, 'tr_zc_self_systeem', 'paid', true)
  returning id into v_tb;
  insert into tmc.payments (mollie_payment_id, amount_cents, status, method, kind, trial_booking_id, is_test, paid_at)
  values ('tr_zc_self_systeem', 1700, 'paid', 'ideal', 'trial_booking', v_tb, true, now());
  v_res := tmc.system_cancel_trial_booking(v_tb, '  ');
  if (v_res->>'ok')::boolean or v_res->>'reason' <> 'reason_required' then
    raise exception 'trial_visitor_self_cancel: systeempoort hoort reason_required te geven: %', v_res;
  end if;
  v_res := tmc.system_cancel_trial_booking(v_tb, 'Zelfcontrole systeem');
  if not (v_res->>'ok')::boolean or v_res->>'refund_id' is null or (v_res->>'refund_amount_cents')::int <> 1700 then
    raise exception 'trial_visitor_self_cancel: systeempoort hoort een intentie te geven: %', v_res;
  end if;
  if (select actor_type from tmc.events where type = 'trial_booking.refund_requested' and subject_id = (v_res->>'refund_id')::uuid) <> 'system' then
    raise exception 'trial_visitor_self_cancel: refund_requested-event van de systeempoort hoort actor system te hebben';
  end if;

  -- 10. Adminpoort ongewijzigd: zonder admin-sessie geweigerd met 42501.
  begin
    perform tmc.admin_cancel_trial_booking(v_tb, 'Zelfcontrole admin');
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  if not v_denied then
    raise exception 'trial_visitor_self_cancel: adminpoort hoort zonder admin te weigeren';
  end if;
end $$;

rollback to savepoint trial_visitor_self_cancel_selftest;
release savepoint trial_visitor_self_cancel_selftest;

-- ---------------------------------------------------------------------------
-- 6. Grants asserteren (buiten het savepoint, aan het slot van de transactie)
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
begin
  v_fn := 'tmc.cancel_trial_booking_core(uuid, text, text, uuid, boolean)';
  if has_function_privilege('anon', v_fn, 'execute')
     or has_function_privilege('authenticated', v_fn, 'execute')
     or has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'trial_visitor_self_cancel: de kern mag door geen enkele rol aanroepbaar zijn';
  end if;

  v_fn := 'tmc.admin_cancel_trial_booking(uuid, text)';
  if has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'trial_visitor_self_cancel: grants op % kloppen niet', v_fn;
  end if;

  foreach v_fn in array array['tmc.system_cancel_trial_booking(uuid, text)', 'tmc.visitor_cancel_trial_booking(uuid)'] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'trial_visitor_self_cancel: grants op % kloppen niet', v_fn;
    end if;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tmc' and p.proname = 'cancel_trial_booking_core'
      and pg_get_function_identity_arguments(p.oid) = 'p_id uuid, p_reason text, p_actor_type text, p_actor_id uuid'
  ) then
    raise exception 'trial_visitor_self_cancel: de oude kern met vier parameters bestaat nog';
  end if;
end $$;

commit;
