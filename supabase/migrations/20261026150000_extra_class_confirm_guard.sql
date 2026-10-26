-- Fix na de rooktest van PR #318 (spec-weekcap-extra-les.md, ledger PR #319).
--
-- tmc.confirm_extra_class_booking bevestigde elke geannuleerde rij opnieuw
-- zodra Mollie 'paid' meldde, ook een boeking die het lid zelf binnen het
-- venster had geannuleerd en waarvoor al een refund liep. Mollie stuurt de
-- betaalwebhook namelijk opnieuw bij elke wijziging aan de betaling (zoals
-- het aanmaken of uitvoeren van een refund), en de betaalstatus blijft dan
-- 'paid'. Op productie kwam zo een geannuleerde en terugbetaalde extra les
-- als 'confirmed_late' terug in de agenda.
--
-- Nieuwe regel voor status cancelled bij uitkomst paid:
--   1. Er bestaat een refund-intentie voor de boeking: niets doen (ignored).
--      Het geldbesluit is al genomen door cancel_class_booking,
--      cancel_class_session_core of een eerdere te late betaling.
--   2. De rij was nog pending en is afgebroken (payment_canceled) of de les
--      is geannuleerd (session_cancelled): het geld moet terug
--      (refund_needed), zoals de toelichting in cancel_class_session_core al
--      beloofde.
--   3. Elke andere reden dan payment_expired (within_window, rescheduled,
--      late): de boeking was bevestigd en daarna geannuleerd; het geldbesluit
--      hoort bij die annulering. Niets doen (ignored).
--   4. payment_expired: de houdtijd is verlopen en de betaling komt alsnog
--      binnen. Ongewijzigd: alsnog bevestigen als de gate het toelaat, anders
--      refund_needed (regel van Ilja, 2026-10-26).
--
-- Verder ongewijzigd: pending, booked en de niet-betaalde uitkomsten.
-- SECURITY DEFINER: droppen en herbouwen met expliciete grant-restore
-- (alleen service_role, README regel 7).

drop function tmc.confirm_extra_class_booking(uuid, text, text);

create function tmc.confirm_extra_class_booking(
  p_booking_id uuid,
  p_mollie_payment_id text,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_booking tmc.bookings%rowtype;
  g record;
  v_minutes int;
  v_waitlist_confirmed int := 0;
begin
  if auth.uid() is not null then
    raise exception 'confirm_extra_class_booking is service-role only.' using errcode = '42501';
  end if;
  if p_outcome not in ('paid', 'failed', 'expired', 'canceled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_outcome');
  end if;

  select * into v_booking from tmc.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;
  if v_booking.drop_in_payment_id is distinct from p_mollie_payment_id then
    return jsonb_build_object('ok', false, 'reason', 'payment_mismatch');
  end if;

  if p_outcome <> 'paid' then
    if v_booking.status = 'pending_payment' then
      update tmc.bookings
      set status = 'cancelled', cancelled_at = now(),
          cancellation_reason = 'payment_' || p_outcome,
          hold_expires_at = null
      where id = p_booking_id;
      return jsonb_build_object('ok', true, 'result', 'released',
        'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
    end if;
    return jsonb_build_object('ok', true, 'result', 'ignored', 'status', v_booking.status);
  end if;

  -- paid
  if v_booking.status = 'booked' then
    return jsonb_build_object('ok', true, 'result', 'already_confirmed',
      'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
  end if;

  if v_booking.status = 'cancelled' then
    -- Het geld is al onderweg terug: lid of studio annuleerde, of een
    -- eerdere te late betaling is al afgehandeld. Een herhaalde webhook
    -- (Mollie meldt zich ook bij een refund, met status paid) doet niets.
    if exists (select 1 from tmc.payment_refunds r where r.booking_id = p_booking_id) then
      return jsonb_build_object('ok', true, 'result', 'ignored', 'status', 'cancelled',
        'reason', 'refund_exists', 'cancellation_reason', v_booking.cancellation_reason);
    end if;

    -- Pending afgebroken of les geannuleerd voordat het geld er was: terug.
    if v_booking.cancellation_reason in ('payment_canceled', 'session_cancelled') then
      return jsonb_build_object('ok', true, 'result', 'refund_needed',
        'reason', v_booking.cancellation_reason,
        'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
    end if;

    -- Bevestigd en daarna geannuleerd (within_window, rescheduled, late):
    -- het geldbesluit hoort bij die annulering, de rij blijft geannuleerd.
    if v_booking.cancellation_reason is distinct from 'payment_expired' then
      return jsonb_build_object('ok', true, 'result', 'ignored', 'status', 'cancelled',
        'reason', 'cancelled_after_confirmation',
        'cancellation_reason', v_booking.cancellation_reason);
    end if;

    -- Te late betaling na de houdtijd: alleen alsnog bevestigen als de gate
    -- het nu nog toelaat. De eigen geannuleerde rij telt niet als
    -- dubbelboeking.
    if v_booking.pillar = 'vrij_trainen' then
      v_minutes := extract(epoch from (v_booking.slot_end_at - v_booking.slot_start_at))::int / 60;
    end if;
    select * into g
    from tmc.booking_gate(v_booking.profile_id, v_booking.session_id,
                          v_booking.slot_start_at, v_minutes, false, false, true);
    if g.o_reason is not null and g.o_reason <> 'extra_class_not_needed' then
      return jsonb_build_object('ok', true, 'result', 'refund_needed', 'reason', g.o_reason,
        'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
    end if;
  elsif v_booking.status <> 'pending_payment' then
    return jsonb_build_object('ok', true, 'result', 'ignored', 'status', v_booking.status);
  end if;

  begin
    update tmc.bookings
    set status = 'booked', hold_expires_at = null,
        cancelled_at = null, cancellation_reason = null
    where id = p_booking_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', true, 'result', 'refund_needed', 'reason', 'already_booked',
        'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
    when raise_exception then
      if sqlerrm in ('slot_full', 'slot_blocked', 'session_capacity_exceeded') then
        return jsonb_build_object('ok', true, 'result', 'refund_needed', 'reason', sqlerrm,
          'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
      end if;
      raise;
  end;

  update tmc.waitlist_entries
  set confirmed_at = now()
  where session_id = v_booking.session_id
    and profile_id = v_booking.profile_id
    and confirmed_at is null
    and expired_at is null;
  get diagnostics v_waitlist_confirmed = row_count;

  return jsonb_build_object(
    'ok', true,
    'result', case when v_booking.status = 'cancelled' then 'confirmed_late' else 'confirmed' end,
    'profile_id', v_booking.profile_id,
    'session_id', v_booking.session_id,
    'pillar', v_booking.pillar,
    'slot_start_at', v_booking.slot_start_at,
    'slot_end_at', v_booking.slot_end_at,
    'waitlist_confirmed', v_waitlist_confirmed > 0
  );
end;
$function$;

revoke execute on function tmc.confirm_extra_class_booking(uuid, text, text) from public, anon, authenticated;
grant execute on function tmc.confirm_extra_class_booking(uuid, text, text) to service_role;

do $$
declare
  v_name text := 'tmc.confirm_extra_class_booking(uuid, text, text)';
begin
  if to_regprocedure(v_name) is null then
    raise exception 'confirm_extra_class_booking ontbreekt';
  end if;
  if has_function_privilege('anon', v_name, 'execute')
     or has_function_privilege('authenticated', v_name, 'execute') then
    raise exception 'confirm_extra_class_booking is uitvoerbaar voor anon of authenticated';
  end if;
  if not has_function_privilege('service_role', v_name, 'execute') then
    raise exception 'confirm_extra_class_booking is niet uitvoerbaar voor service_role';
  end if;
  if pg_get_functiondef(to_regprocedure(v_name)) not like '%refund_exists%' then
    raise exception 'confirm_extra_class_booking mist de refund-guard';
  end if;
end;
$$;
