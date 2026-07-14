-- PT-agenda PR G: intake-beheer (afronden en annuleren), minimaal.
--
-- Een intake is een pt_session met kind='intake' en prospect-velden, zonder
-- pt_booking en zonder profile_id. cancel_pt en mark_pt_attendance hangen op
-- een boeking met een klant en werken er dus niet op. Deze migratie voegt de
-- twee ontbrekende beheer-acties toe, gespiegeld aan het klantloze
-- block-patroon uit C4 (create_pt_block/delete_pt_block):
--
-- * complete_pt_intake: status 'scheduled' -> 'completed' (waarde bestaat al
--   in pt_sessions_status_check). Geen credit, geen geld, geen conversie.
-- * cancel_pt_intake: harde delete, zoals delete_pt_block. pt_check_slot telt
--   alleen status='scheduled' mee dus de tijd komt vrij; een delete ruimt
--   bovendien de prospect-contactgegevens op van een intake die niet doorgaat.
--
-- Beide: SECURITY DEFINER, is_staff()-gate met dezelfde eigen-sessie-grens
-- als C4 (admin mag alles, een trainer alleen haar eigen sessies) en een
-- harde kind='intake'-guard zodat dit pad nooit een bookable of block raakt.

create or replace function tmc.complete_pt_intake(p_pt_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_session tmc.pt_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  if not tmc.is_staff() then
    raise exception 'Alleen voor beheer of een actieve trainer.' using errcode = '42501';
  end if;

  select s.* into v_session
  from tmc.pt_sessions s
  where s.id = p_pt_session_id
    and s.kind = 'intake'
    and (
      v_is_admin
      or exists (
        select 1 from tmc.trainers t
        where t.id = s.trainer_id
          and t.profile_id = v_uid
          and t.is_active
      )
    )
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'not_completable');
  end if;
  -- Zelfde grens als mark_pt_attendance: afronden kan pas nadat de intake
  -- begonnen is.
  if v_session.start_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'session_not_started');
  end if;

  update tmc.pt_sessions
  set status = 'completed'
  where id = v_session.id;

  return jsonb_build_object(
    'ok', true,
    'pt_session_id', v_session.id,
    'trainer_id', v_session.trainer_id,
    'start_at', v_session.start_at
  );
end;
$$;

create or replace function tmc.cancel_pt_intake(p_pt_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_session tmc.pt_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  if not tmc.is_staff() then
    raise exception 'Alleen voor beheer of een actieve trainer.' using errcode = '42501';
  end if;

  select s.* into v_session
  from tmc.pt_sessions s
  where s.id = p_pt_session_id
    and s.kind = 'intake'
    and (
      v_is_admin
      or exists (
        select 1 from tmc.trainers t
        where t.id = s.trainer_id
          and t.profile_id = v_uid
          and t.is_active
      )
    )
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
$$;

grant execute on function tmc.complete_pt_intake(uuid) to authenticated;
grant execute on function tmc.cancel_pt_intake(uuid) to authenticated;
