-- PT-agenda PR J: expliciete restitutie-keuze bij annuleren door staf.
--
-- cancel_pt leidde credit-terug-of-forfeit tot nu toe puur af uit het
-- annuleringsvenster (cancel_window_hours uit pt_trainer_settings):
-- binnen het venster refund, buiten het venster forfeit. Deze migratie
-- maakt dat besluit expliciet: de nieuwe parameter p_with_restitution
-- bepaalt of er een credit teruggaat. Het venster is daarmee alleen nog
-- de DEFAULT-voorselectie in de UI, niet meer de autoriteit in de RPC.
--
-- Compatibiliteit: p_with_restitution default null = het oude gedrag
-- (het venster beslist). De bestaande lid-aanroep (cancelPtBooking
-- zonder parameter) verandert dus niet van uitkomst. Een expliciete
-- waarde is staff-only (admin of de eigen-sessie-trainer uit C4); een
-- lid dat de parameter meestuurt krijgt 'restitution_not_allowed' in
-- plaats van een stille venster-fallback; anders zou een lid buiten
-- het venster zichzelf een refund kunnen geven.
--
-- De refund loopt onveranderd door de geauditeerde kern
-- (apply_credit_adjustment) met de credits_refunded_at
-- dubbel-refund-guard, terug naar credits_used_from, dus altijd het
-- juiste credit-type (een duo-boeking is gedebiteerd van het
-- duo-tegoed en krijgt daar ook zijn credit terug). Zonder restitutie:
-- geen mutatie, pure forfeit. Alle overige logica (zichtbaarheids-
-- gates uit C4, foutcodes, status-updates, return-shape) blijft
-- byte-voor-byte gelijk aan de live definitie; alleen het
-- restitutie-besluit en het audit-reason-label zijn geraakt, plus een
-- nieuw return-veld restitution_explicit voor het event-spoor.
--
-- De oude signatuur cancel_pt(uuid) wordt gedropt: een overload naast
-- de nieuwe zou de PostgREST-rpc-resolutie ambigu maken.

drop function if exists tmc.cancel_pt(uuid);

create or replace function tmc.cancel_pt(
  p_pt_booking_id uuid,
  p_with_restitution boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_is_own_trainer boolean := false;
  v_booking tmc.pt_bookings%rowtype;
  v_session tmc.pt_sessions%rowtype;
  v_cancel int;
  v_within boolean;
  v_restitution boolean;
  v_refunded boolean := false;
  v_adjust jsonb;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- C4: naast de klant zelf en een admin mag ook de actieve trainer van
  -- de sessie de boeking zien en annuleren (eigen agenda, niet die van
  -- een andere trainer).
  select b.* into v_booking
  from tmc.pt_bookings b
  where b.id = p_pt_booking_id
    and (
      b.profile_id = v_uid
      or v_is_admin
      or exists (
        select 1
        from tmc.pt_sessions s
        join tmc.trainers t on t.id = s.trainer_id
        where s.id = b.pt_session_id
          and t.profile_id = v_uid
          and t.is_active
      )
    )
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_booking.status not in ('pending', 'booked') then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  end if;

  select s.* into v_session
  from tmc.pt_sessions s
  where s.id = v_booking.pt_session_id
  for update;

  v_is_own_trainer := exists (
    select 1 from tmc.trainers t
    where t.id = v_session.trainer_id
      and t.profile_id = v_uid
      and t.is_active
  );

  -- J: de expliciete restitutie-keuze is staff-only (admin of de
  -- eigen-sessie-trainer). Een lid dat de parameter meestuurt wordt
  -- geweigerd in plaats van stil op het venster teruggeworpen.
  if p_with_restitution is not null
     and not (v_is_admin or v_is_own_trainer) then
    return jsonb_build_object('ok', false, 'reason', 'restitution_not_allowed');
  end if;

  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  select s.cancel_window_hours into v_cancel
  from tmc.pt_trainer_settings(v_session.trainer_id) s;

  v_within := v_session.start_at - now() >= make_interval(hours => v_cancel);

  -- J: het venster levert alleen nog de default; een expliciete
  -- staff-keuze wint.
  v_restitution := coalesce(p_with_restitution, v_within);

  if v_restitution and v_booking.status = 'booked' and v_booking.credits_used_from is not null then
    v_adjust := tmc.apply_credit_adjustment(
      v_booking.credits_used_from, 1,
      case
        when p_with_restitution is not null then 'PT-annulering, restitutie gekozen door staf'
        else 'PT-annulering binnen venster'
      end,
      'refund',
      case
        when v_is_admin and v_uid <> v_booking.profile_id then 'admin'
        when v_is_own_trainer and v_uid <> v_booking.profile_id then 'trainer'
        else 'member'
      end,
      v_uid, v_booking.id, 'pt_booking'
    );
    if not coalesce((v_adjust ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'reason', coalesce(v_adjust ->> 'reason', 'refund_failed'));
    end if;
    v_refunded := true;
  end if;

  update tmc.pt_bookings
  set status = 'cancelled', cancelled_at = now()
  where id = v_booking.id;

  update tmc.pt_sessions
  set status = 'cancelled'
  where id = v_session.id;

  return jsonb_build_object(
    'ok', true,
    'within_window', v_within,
    'credits_refunded', v_refunded,
    'restitution_explicit', p_with_restitution is not null,
    'start_at', v_session.start_at,
    'trainer_id', v_session.trainer_id,
    'pt_session_id', v_session.id,
    'format', v_session.format,
    'profile_id', v_booking.profile_id
  );
end;
$function$;

revoke execute on function tmc.cancel_pt(uuid, boolean) from public;
grant execute on function tmc.cancel_pt(uuid, boolean) to authenticated, service_role;
