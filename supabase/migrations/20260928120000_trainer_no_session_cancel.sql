-- 20260928120000_trainer_no_session_cancel.sql
--
-- fix/trainer-no-session-cancel (discovery en akkoord 2026-09-28). Trainers
-- kunnen zelf geen PT-sessie of intake meer annuleren; alleen een admin kan
-- dat, en de database dwingt het af. Groepslessen (class_sessions) waren al
-- admin-only: geen RPC muteert die status, alle annuleerpaden lopen via
-- service role achter requireAdmin, en authenticated heeft sinds
-- fix/trainer-rls-lockdown (20260928090000) geen UPDATE of DELETE meer.
--
-- Uitgangssituatie (live, pg_get_functiondef en proacl 2026-09-28):
--   * cancel_pt: lid zelf, admin, of de PT-trainer van de sessie
--     (C4-trainer-tak in de boekingselectie plus v_is_own_trainer).
--     Grants: postgres, authenticated, service_role. Geen PUBLIC, geen anon.
--   * resolve_pt_cancellation: admin of de PT-trainer van de sessie
--     (goedkeuren roept intern cancel_pt aan). Grants: postgres,
--     authenticated, service_role. Geen PUBLIC, geen anon.
--   * cancel_pt_intake: admin of PT-trainer (is_pt_trainer_for plus
--     eigen-sessie-subquery), harde delete. Grants: PUBLIC, postgres,
--     authenticated. Geen service_role.
--   * complete_pt_intake: grants PUBLIC, postgres, authenticated.
--   * create_pt_block en delete_pt_block: grants PUBLIC, postgres,
--     authenticated, service_role.
--   * tmc.pt_bookings: authenticated heeft tabelbrede SELECT, INSERT, UPDATE
--     en DELETE; er is geen policy die een niet-admin laat schrijven, dus
--     RLS blokkeerde het al. Dode grant.
--
-- Besluit Ilja:
--   1. cancel_pt: alleen het lid zelf en admins. Een trainer, of een andere
--      ingelogde gebruiker die niet de eigenaar en geen admin is, krijgt een
--      expliciete weigering met reason admin_only, geen stille not_found.
--      Gedrag voor lid en admin ongewijzigd: restitutie, statusovergangen,
--      returnwaarde.
--   2. resolve_pt_cancellation: alleen admin; een niet-admin krijgt admin_only.
--   3. cancel_pt_intake: alleen admin; een niet-admin krijgt admin_only.
--   4. delete_pt_block: logica ongewijzigd. Een trainer mag de eigen
--      geblokkeerde tijd blijven verwijderen (geen les, raakt geen lid).
--   5. cancel_pt_intake, complete_pt_intake, create_pt_block, delete_pt_block:
--      eerst expliciet GRANT EXECUTE aan authenticated, daarna REVOKE van
--      PUBLIC en anon (vervolgpunt uit PR #223). In de codebase roept geen
--      enkel pad deze functies als anon aan (alleen via de ingelogde
--      user-client in src/lib/trainer/pt-agenda-actions.ts).
--   6. cancel_pt en resolve_pt_cancellation: grants hersteld zoals live
--      (authenticated en service_role), expliciet zonder PUBLIC en anon.
--   7. tmc.pt_bookings: INSERT, UPDATE en DELETE voor authenticated
--      ingetrokken; SELECT blijft. Alle writes lopen via RPC of service role
--      (Mollie-webhook, reminder-cron, account-deletion; gecontroleerd).
--   8. Assertieblok onderaan leest alleen catalogi.
--
-- De drie gewijzigde functies worden gedropt en opnieuw aangemaakt (geen
-- CREATE OR REPLACE), zodat een nieuwe functie de default-EXECUTE voor
-- PUBLIC krijgt en die hieronder bewust weer wordt ingetrokken. supabase db
-- push voert dit bestand in een transactie uit; geen enkele stap hangt af
-- van applicatiedata.

-- ---------------------------------------------------------------------------
-- 1. cancel_pt: lid zelf of admin
-- ---------------------------------------------------------------------------
drop function tmc.cancel_pt(uuid, boolean);

create function tmc.cancel_pt(p_pt_booking_id uuid, p_with_restitution boolean default null)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
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

  select b.* into v_booking
  from tmc.pt_bookings b
  where b.id = p_pt_booking_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- fix/trainer-no-session-cancel: annuleren is voor het lid zelf of een
  -- admin. De C4-trainer-tak is weg; een trainer (of wie dan ook die niet
  -- de eigenaar is) krijgt een expliciete weigering, geen stille not_found.
  if not v_is_admin and v_booking.profile_id <> v_uid then
    return jsonb_build_object('ok', false, 'reason', 'admin_only');
  end if;

  if v_booking.status not in ('pending', 'booked') then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  end if;

  select s.* into v_session
  from tmc.pt_sessions s
  where s.id = v_booking.pt_session_id
  for update;

  -- J: de expliciete restitutie-keuze is admin-only. Een lid dat de
  -- parameter meestuurt wordt geweigerd in plaats van stil op het venster
  -- teruggeworpen.
  if p_with_restitution is not null and not v_is_admin then
    return jsonb_build_object('ok', false, 'reason', 'restitution_not_allowed');
  end if;

  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  select s.cancel_window_hours into v_cancel
  from tmc.pt_trainer_settings(v_session.trainer_id) s;

  v_within := v_session.start_at - now() >= make_interval(hours => v_cancel);

  -- J: het venster levert alleen nog de default; een expliciete
  -- admin-keuze wint.
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
revoke execute on function tmc.cancel_pt(uuid, boolean) from anon;
grant execute on function tmc.cancel_pt(uuid, boolean) to authenticated;
grant execute on function tmc.cancel_pt(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 2. resolve_pt_cancellation: alleen admin
-- ---------------------------------------------------------------------------
drop function tmc.resolve_pt_cancellation(uuid, boolean, boolean, text);

create function tmc.resolve_pt_cancellation(p_request_id uuid, p_approve boolean, p_with_restitution boolean default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_req tmc.pt_cancellation_requests%rowtype;
  v_booking tmc.pt_bookings%rowtype;
  v_session tmc.pt_sessions%rowtype;
  v_with boolean;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 2000), '');
  v_cancel jsonb;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- fix/trainer-no-session-cancel: een verzoek afhandelen (goedkeuren is
  -- annuleren) is admin-only. Vooraf, zodat een niet-admin niets over het
  -- verzoek te weten komt.
  if not v_is_admin then
    return jsonb_build_object('ok', false, 'reason', 'admin_only');
  end if;

  select r.* into v_req
  from tmc.pt_cancellation_requests r
  where r.id = p_request_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select b.* into v_booking
  from tmc.pt_bookings b
  where b.id = v_req.pt_booking_id
  for update;

  select s.* into v_session
  from tmc.pt_sessions s
  where s.id = v_booking.pt_session_id;

  -- Idempotent: een al opgeloste aanvraag opnieuw resolven weigert
  -- netjes, met de bestaande uitkomst erbij.
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_resolved',
      'status', v_req.status);
  end if;

  if p_approve then
    v_with := case
      when v_booking.credits_used_from is null then false
      else p_with_restitution
    end;
    if v_with is null then
      return jsonb_build_object('ok', false, 'reason', 'restitution_required');
    end if;

    v_cancel := tmc.cancel_pt(v_req.pt_booking_id, v_with);
    if not coalesce((v_cancel ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false,
        'reason', coalesce(v_cancel ->> 'reason', 'cancel_failed'));
    end if;

    update tmc.pt_cancellation_requests
    set status = 'approved',
        with_restitution = v_with,
        resolution_note = v_note,
        resolved_by = v_uid,
        resolved_at = now()
    where id = v_req.id;

    return jsonb_build_object(
      'ok', true,
      'outcome', 'approved',
      'with_restitution', v_with,
      'credits_refunded', coalesce((v_cancel ->> 'credits_refunded')::boolean, false),
      'within_window', (v_cancel ->> 'within_window')::boolean,
      'request_id', v_req.id,
      'pt_booking_id', v_req.pt_booking_id,
      'pt_session_id', v_session.id,
      'trainer_id', v_session.trainer_id,
      'start_at', v_session.start_at,
      'format', v_session.format,
      'profile_id', v_req.profile_id
    );
  end if;

  -- Afwijzen: sessie en boeking blijven ongemoeid.
  update tmc.pt_cancellation_requests
  set status = 'rejected',
      resolution_note = v_note,
      resolved_by = v_uid,
      resolved_at = now()
  where id = v_req.id;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'rejected',
    'request_id', v_req.id,
    'pt_booking_id', v_req.pt_booking_id,
    'pt_session_id', v_session.id,
    'trainer_id', v_session.trainer_id,
    'start_at', v_session.start_at,
    'format', v_session.format,
    'profile_id', v_req.profile_id
  );
end;
$function$;

revoke execute on function tmc.resolve_pt_cancellation(uuid, boolean, boolean, text) from public;
revoke execute on function tmc.resolve_pt_cancellation(uuid, boolean, boolean, text) from anon;
grant execute on function tmc.resolve_pt_cancellation(uuid, boolean, boolean, text) to authenticated;
grant execute on function tmc.resolve_pt_cancellation(uuid, boolean, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. cancel_pt_intake: alleen admin
-- ---------------------------------------------------------------------------
drop function tmc.cancel_pt_intake(uuid);

create function tmc.cancel_pt_intake(p_pt_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_session tmc.pt_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  -- fix/trainer-no-session-cancel: een intake annuleren is admin-only. Een
  -- trainer krijgt een expliciete weigering in plaats van not_found.
  if not v_is_admin then
    return jsonb_build_object('ok', false, 'reason', 'admin_only');
  end if;

  select s.* into v_session
  from tmc.pt_sessions s
  where s.id = p_pt_session_id
    and s.kind = 'intake'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- Een afgeronde intake is historie en gaat niet meer weg; geen boeking en
  -- geen betaling, dus verder niets terug te draaien.
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  end if;

  delete from tmc.pt_sessions where id = v_session.id;

  return jsonb_build_object(
    'ok', true,
    'pt_session_id', v_session.id,
    'trainer_id', v_session.trainer_id,
    'start_at', v_session.start_at,
    'end_at', v_session.end_at
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4 en 5. Grants op de vier PT-RPC's met een historische PUBLIC-grant:
-- eerst authenticated expliciet, daarna PUBLIC en anon weg. De logica van
-- delete_pt_block, complete_pt_intake en create_pt_block blijft ongewijzigd.
-- ---------------------------------------------------------------------------
grant execute on function tmc.cancel_pt_intake(uuid) to authenticated;
grant execute on function tmc.complete_pt_intake(uuid) to authenticated;
grant execute on function tmc.create_pt_block(timestamptz, timestamptz, uuid, text, boolean, boolean) to authenticated;
grant execute on function tmc.delete_pt_block(uuid) to authenticated;

revoke execute on function tmc.cancel_pt_intake(uuid) from public;
revoke execute on function tmc.cancel_pt_intake(uuid) from anon;
revoke execute on function tmc.complete_pt_intake(uuid) from public;
revoke execute on function tmc.complete_pt_intake(uuid) from anon;
revoke execute on function tmc.create_pt_block(timestamptz, timestamptz, uuid, text, boolean, boolean) from public;
revoke execute on function tmc.create_pt_block(timestamptz, timestamptz, uuid, text, boolean, boolean) from anon;
revoke execute on function tmc.delete_pt_block(uuid) from public;
revoke execute on function tmc.delete_pt_block(uuid) from anon;

-- ---------------------------------------------------------------------------
-- 7. pt_bookings: dode schrijf-grants voor authenticated weg. SELECT blijft
-- (self_read, trainer_read en admin_all bepalen wat zichtbaar is).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on table tmc.pt_bookings from authenticated;
revoke insert, update, delete on table tmc.pt_bookings from anon;

-- ---------------------------------------------------------------------------
-- 8. Asserties (alleen catalogi). Faalt de migratie hier, dan rolt alles terug.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_name text;
  v_admin_only_rpcs text[] := array[
    'tmc.cancel_pt(uuid, boolean)',
    'tmc.resolve_pt_cancellation(uuid, boolean, boolean, text)',
    'tmc.cancel_pt_intake(uuid)'
  ];
  v_closed_rpcs text[] := array[
    'tmc.cancel_pt(uuid, boolean)',
    'tmc.resolve_pt_cancellation(uuid, boolean, boolean, text)',
    'tmc.cancel_pt_intake(uuid)',
    'tmc.complete_pt_intake(uuid)',
    'tmc.create_pt_block(timestamptz, timestamptz, uuid, text, boolean, boolean)',
    'tmc.delete_pt_block(uuid)'
  ];
  v_service_role_rpcs text[] := array[
    'tmc.cancel_pt(uuid, boolean)',
    'tmc.resolve_pt_cancellation(uuid, boolean, boolean, text)',
    'tmc.create_pt_block(timestamptz, timestamptz, uuid, text, boolean, boolean)',
    'tmc.delete_pt_block(uuid)'
  ];
begin
  -- De drie annuleer-RPC's zijn SECURITY DEFINER, kennen admin_only en
  -- hebben geen trainer-tak meer.
  foreach v_name in array v_admin_only_rpcs loop
    select pg_get_functiondef(v_name::regprocedure) into v_def;
    if v_def not ilike '%security definer%' then
      raise exception 'trainer_no_session_cancel: % is geen SECURITY DEFINER', v_name;
    end if;
    if v_def not like '%admin_only%' then
      raise exception 'trainer_no_session_cancel: % kent reason admin_only niet', v_name;
    end if;
    if v_def like '%is_pt_available%' or v_def like '%is_pt_trainer_for%' or v_def like '%v_is_own_trainer%' then
      raise exception 'trainer_no_session_cancel: % heeft nog een trainer-tak', v_name;
    end if;
  end loop;

  -- delete_pt_block is inhoudelijk ongewijzigd: nog steeds de eigen PT-trainer.
  select pg_get_functiondef('tmc.delete_pt_block(uuid)'::regprocedure) into v_def;
  if v_def not like '%is_pt_trainer_for()%' or v_def not like '%and t.is_pt_available%' then
    raise exception 'trainer_no_session_cancel: delete_pt_block is onbedoeld gewijzigd';
  end if;

  -- Grants: authenticated ja, PUBLIC en anon nee.
  foreach v_name in array v_closed_rpcs loop
    if not has_function_privilege('authenticated', v_name, 'execute') then
      raise exception 'trainer_no_session_cancel: authenticated mist EXECUTE op %', v_name;
    end if;
    if has_function_privilege('anon', v_name, 'execute') then
      raise exception 'trainer_no_session_cancel: anon heeft EXECUTE op %', v_name;
    end if;
    if exists (
      select 1 from pg_proc p
      where p.oid = v_name::regprocedure
        and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    ) then
      raise exception 'trainer_no_session_cancel: PUBLIC heeft EXECUTE op %', v_name;
    end if;
  end loop;
  foreach v_name in array v_service_role_rpcs loop
    if not has_function_privilege('service_role', v_name, 'execute') then
      raise exception 'trainer_no_session_cancel: service_role mist EXECUTE op %', v_name;
    end if;
  end loop;

  -- pt_bookings: authenticated alleen SELECT, anon niets.
  if not has_table_privilege('authenticated', 'tmc.pt_bookings', 'select') then
    raise exception 'trainer_no_session_cancel: authenticated mist SELECT op pt_bookings';
  end if;
  if has_table_privilege('authenticated', 'tmc.pt_bookings', 'insert')
     or has_table_privilege('authenticated', 'tmc.pt_bookings', 'update')
     or has_table_privilege('authenticated', 'tmc.pt_bookings', 'delete') then
    raise exception 'trainer_no_session_cancel: authenticated kan nog schrijven op pt_bookings';
  end if;
  if has_table_privilege('anon', 'tmc.pt_bookings', 'select')
     or has_table_privilege('anon', 'tmc.pt_bookings', 'insert')
     or has_table_privilege('anon', 'tmc.pt_bookings', 'update')
     or has_table_privilege('anon', 'tmc.pt_bookings', 'delete') then
    raise exception 'trainer_no_session_cancel: anon heeft rechten op pt_bookings';
  end if;
  if not has_table_privilege('service_role', 'tmc.pt_bookings', 'update') then
    raise exception 'trainer_no_session_cancel: service_role mist UPDATE op pt_bookings';
  end if;
end $$;
