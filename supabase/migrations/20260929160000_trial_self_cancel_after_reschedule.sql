-- feat/reschedule-notify-trial-guest
--
-- Proefles-bezoekers krijgen bij een eenmalige verschuiving van hun les een
-- mail (spec-session-overrides.md) met de toezegging dat zij tot de nieuwe
-- starttijd kosteloos kunnen annuleren. Deze migratie maakt die toezegging
-- waar in de zelfservice-annulering, met dezelfde regel als
-- cancel_class_booking voor leden (20260929130000):
--   kosteloos als trial_bookings.booked_at < class_sessions.rescheduled_at
--   en now() < class_sessions.start_at.
-- Reden 'rescheduled'. Een betaalde proefles krijgt de refund-intentie via
-- cancel_trial_booking_core (Mollie-refund daarna via het bestaande
-- TS-pad processPaymentRefund); een codeboeking (bedrag 0) wordt kosteloos
-- geannuleerd zonder refund, zoals nu al binnen de termijn.
--
-- Drop en recreate op basis van de live definitie (pg_get_functiondef,
-- 2026-09-29). Live rechten voor de wijziging: postgres en service_role
-- (geen PUBLIC, anon of authenticated). Die worden expliciet hersteld. Let
-- op: sinds 20260929150000 trekt de event trigger
-- tmc_new_function_default_privileges bij de nieuwe CREATE FUNCTION al
-- PUBLIC en anon in; de REVOKE en GRANT hieronder maken het resultaat
-- expliciet en onafhankelijk van die trigger.

drop function tmc.visitor_cancel_trial_booking(uuid);

create function tmc.visitor_cancel_trial_booking(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_tb tmc.trial_bookings%rowtype;
  v_start_at timestamptz;
  v_rescheduled_at timestamptz;
  v_cancel_hours int;
  v_within_window boolean;
  v_free_after_reschedule boolean;
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

  select start_at, rescheduled_at into v_start_at, v_rescheduled_at
  from tmc.class_sessions where id = v_tb.session_id;
  if v_start_at is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  v_within_window := v_start_at - now() >= make_interval(hours => v_cancel_hours);

  -- Verschoven les (session-overrides): wie boekte voor de verschuiving mag
  -- tot de nieuwe starttijd kosteloos annuleren, zoals leden.
  v_free_after_reschedule := v_rescheduled_at is not null
    and v_tb.booked_at < v_rescheduled_at
    and now() < v_start_at;

  -- De kern lockt de boeking en weigert alles behalve 'paid' (pending en
  -- al geannuleerd blijven buiten zelfservice).
  v_res := tmc.cancel_trial_booking_core(
    v_tb.id,
    case
      when v_within_window then 'within_window'
      when v_free_after_reschedule then 'rescheduled'
      else 'late'
    end,
    'visitor',
    null,
    v_within_window or v_free_after_reschedule
  );

  return v_res || jsonb_build_object(
    'within_window', v_within_window or v_free_after_reschedule,
    'free_after_reschedule', v_free_after_reschedule and not v_within_window,
    'cancellation_window_hours', v_cancel_hours
  );
end;
$function$;

revoke execute on function tmc.visitor_cancel_trial_booking(uuid) from public, anon, authenticated;
grant execute on function tmc.visitor_cancel_trial_booking(uuid) to service_role;

-- Zelfcontrole: exact de live rechten van voor de wijziging.
do $$
begin
  if has_function_privilege('anon', 'tmc.visitor_cancel_trial_booking(uuid)', 'execute') then
    raise exception 'trial_self_cancel_after_reschedule: anon heeft EXECUTE';
  end if;
  if has_function_privilege('authenticated', 'tmc.visitor_cancel_trial_booking(uuid)', 'execute') then
    raise exception 'trial_self_cancel_after_reschedule: authenticated heeft EXECUTE';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
             where p.oid = 'tmc.visitor_cancel_trial_booking(uuid)'::regprocedure
               and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'trial_self_cancel_after_reschedule: PUBLIC heeft EXECUTE';
  end if;
  if not has_function_privilege('service_role', 'tmc.visitor_cancel_trial_booking(uuid)', 'execute') then
    raise exception 'trial_self_cancel_after_reschedule: service_role mist EXECUTE';
  end if;
end $$;
