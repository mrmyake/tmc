-- PT-agenda C4: beheer-acties voor trainers + blok-RPC's.
--
-- C3 verruimde alleen de drie BOEK-RPC's naar tmc.is_staff(); de drie
-- beheer-RPC's bleven trainer-blocked: mark_pt_attendance was hard
-- tmc.is_admin()-gated (42501 voor een trainer), en cancel_pt/
-- reschedule_pt gate'en boeking-zichtbaarheid op
-- `profile_id = auth.uid() OR is_admin()` (not_found voor een trainer op
-- andermans boeking). Deze migratie verruimt die drie naar de EIGEN-
-- SESSIE-TRAINER: een actieve trainer mag de boekingen op sessies van
-- haar eigen trainers-rij beheren, niet die van een andere trainer. De
-- credit-kern, forfeit-versus-refund-logica, foutcodes en audit blijven
-- byte-voor-byte ongemoeid; alleen de toegangs- en zichtbaarheidsgates
-- veranderen. Ene bewuste uitzondering: de audit-actor in cancel_pt
-- benoemt de nieuwe toegangsgroep als 'trainer' (bestaande waarde in het
-- actor-domein van apply_credit_adjustment) zodat een trainer-refund
-- niet als 'member' in het spoor belandt; de bestaande member- en
-- admin-paden labelen exact zoals voorheen.
--
-- De venster-bypass in reschedule_pt blijft BEWUST op is_admin(): een
-- trainer verzet binnen het cancel-venster met de normale uitkomst en
-- valt buiten het venster op de forfeit-regel, alleen een admin mag het
-- venster passeren.
--
-- Nieuw: create_pt_block / delete_pt_block. Een blok (kind='block') is
-- ad-hoc geblokkeerde tijd zonder klant en zonder credit; zelfde
-- advisory-lock en pt_check_slot overlap-/omkleedtijd-checks als de
-- boek-RPC's, met dezelfde twee overrides (p_allow_overlap,
-- p_allow_no_turnaround) zodat een blok bewust geforceerd kan worden.
-- Een blok heeft nooit een boeking, dus verwijderen is een harde delete.

-- ---------------------------------------------------------------------
-- 1. mark_pt_attendance: van is_admin() naar staff + eigen-sessie-grens.
--    De grens zit in de booking-select: een trainer ziet alleen
--    boekingen op sessies van haar eigen actieve trainers-rij (anders
--    not_found), een admin alles. Rest van de body ongewijzigd
--    (20260729-versie).
-- ---------------------------------------------------------------------

create or replace function tmc.mark_pt_attendance(p_pt_booking_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = tmc, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_booking tmc.pt_bookings%rowtype;
  v_start timestamptz;
begin
  -- C4: staff i.p.v. admin; eigen-sessie-grens in de select hieronder.
  if not tmc.is_staff() then
    raise exception 'Alleen voor beheer of een actieve trainer.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('attended', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;

  select b.* into v_booking
  from tmc.pt_bookings b
  where b.id = p_pt_booking_id
    and (
      v_is_admin
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
  -- Corrigeren tussen attended en no_show mag; een geannuleerde of nog
  -- niet betaalde boeking heeft geen aanwezigheid.
  if v_booking.status not in ('booked', 'attended', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'not_markable');
  end if;

  select s.start_at into v_start
  from tmc.pt_sessions s
  where s.id = v_booking.pt_session_id;

  if v_start > now() then
    return jsonb_build_object('ok', false, 'reason', 'session_not_started');
  end if;

  update tmc.pt_bookings
  set status = p_status
  where id = v_booking.id;

  return jsonb_build_object(
    'ok', true,
    'previous_status', v_booking.status,
    'status', p_status
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 2. cancel_pt: zichtbaarheid verruimd met de eigen-sessie-trainer.
--    Forfeit-versus-refund (venster-check), foutcodes en de credit-kern
--    identiek aan de 20260731-versie; de audit-actor kent de nieuwe
--    toegangsgroep als 'trainer' (zie header).
-- ---------------------------------------------------------------------

create or replace function tmc.cancel_pt(p_pt_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tmc, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_is_own_trainer boolean := false;
  v_booking tmc.pt_bookings%rowtype;
  v_session tmc.pt_sessions%rowtype;
  v_cancel int;
  v_within boolean;
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

  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  select s.cancel_window_hours into v_cancel
  from tmc.pt_trainer_settings(v_session.trainer_id) s;

  v_within := v_session.start_at - now() >= make_interval(hours => v_cancel);

  if v_within and v_booking.status = 'booked' and v_booking.credits_used_from is not null then
    v_adjust := tmc.apply_credit_adjustment(
      v_booking.credits_used_from, 1, 'PT-annulering binnen venster', 'refund',
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
    'start_at', v_session.start_at,
    'trainer_id', v_session.trainer_id,
    'pt_session_id', v_session.id,
    'format', v_session.format,
    'profile_id', v_booking.profile_id
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. reschedule_pt: zichtbaarheid verruimd met de eigen-sessie-trainer.
--    De venster-bypass blijft BEWUST op v_is_admin: een trainer valt
--    binnen het venster op de normale uitkomst en daarbuiten op
--    'outside_window', zoals een lid. Overrides blijven staff-gated
--    (C3). Rest identiek aan de 20260801-versie.
-- ---------------------------------------------------------------------

create or replace function tmc.reschedule_pt(
  p_pt_booking_id uuid,
  p_new_start_at timestamptz,
  p_allow_overlap boolean default false,
  p_allow_no_turnaround boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = tmc, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_is_staff boolean := tmc.is_staff();
  v_booking tmc.pt_bookings%rowtype;
  v_session tmc.pt_sessions%rowtype;
  v_ta int;
  v_cancel int;
  v_new_end timestamptz;
  v_conflict text;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  -- C3: de tijd-overrides zijn voor staff (admin of actieve trainer),
  -- niet voor leden. C4 verruimde de boeking-zichtbaarheid hieronder
  -- naar de eigen-sessie-trainer; de venster-bypass blijft admin-only.
  if not v_is_staff and (p_allow_overlap or p_allow_no_turnaround) then
    return jsonb_build_object('ok', false, 'reason', 'override_not_allowed');
  end if;
  if p_new_start_at is null or p_new_start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'new_start_in_past');
  end if;

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
  if v_booking.status <> 'booked' then
    return jsonb_build_object('ok', false, 'reason', 'not_reschedulable');
  end if;

  select s.* into v_session
  from tmc.pt_sessions s
  where s.id = v_booking.pt_session_id
  for update;

  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  select s.turnaround_min, s.cancel_window_hours
  into v_ta, v_cancel
  from tmc.pt_trainer_settings(v_session.trainer_id) s;

  if not v_is_admin
     and v_session.start_at - now() < make_interval(hours => v_cancel) then
    return jsonb_build_object('ok', false, 'reason', 'outside_window');
  end if;

  v_new_end := p_new_start_at + make_interval(mins => v_session.duration_min);

  perform pg_advisory_xact_lock(hashtextextended(
    'pt_slot:' || v_session.trainer_id::text || ':'
      || to_char(p_new_start_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    0
  ));

  v_conflict := tmc.pt_check_slot(
    v_session.trainer_id, p_new_start_at, v_new_end, v_ta, v_session.id,
    not p_allow_overlap, not p_allow_no_turnaround
  );
  if v_conflict = 'overlap' then
    return jsonb_build_object('ok', false, 'reason', 'pt_overlap', 'conflict_at', p_new_start_at);
  end if;
  if v_conflict = 'no_turnaround' then
    return jsonb_build_object('ok', false, 'reason', 'pt_no_turnaround', 'conflict_at', p_new_start_at);
  end if;

  update tmc.pt_sessions
  set start_at = p_new_start_at, end_at = v_new_end
  where id = v_session.id;

  update tmc.pt_bookings
  set reminder_sent_at = null
  where id = v_booking.id;

  return jsonb_build_object(
    'ok', true,
    'old_start_at', v_session.start_at,
    'new_start_at', p_new_start_at,
    'new_end_at', v_new_end,
    'trainer_id', v_session.trainer_id,
    'pt_session_id', v_session.id,
    'format', v_session.format,
    'profile_id', v_booking.profile_id
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. create_pt_block: ad-hoc tijd blokkeren (kind='block', geen klant,
--    geen credit). Trainer blokkeert de eigen agenda (p_trainer_id mag
--    leeg), admin kiest een trainer. Zelfde dag-advisory-lock en
--    pt_check_slot-checks als boeken/verzetten, met dezelfde twee
--    overrides. Een blok over middernacht neemt beide dag-locks
--    (chronologische volgorde, dus deadlock-vrij).
-- ---------------------------------------------------------------------

create or replace function tmc.create_pt_block(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_trainer_id uuid default null,
  p_note text default null,
  p_allow_overlap boolean default false,
  p_allow_no_turnaround boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = tmc, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_own_trainer_id uuid;
  v_trainer_id uuid;
  v_dur numeric;
  v_ta int;
  v_conflict text;
  v_session_id uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  if not tmc.is_staff() then
    raise exception 'Alleen voor beheer of een actieve trainer.' using errcode = '42501';
  end if;

  select t.id into v_own_trainer_id
  from tmc.trainers t
  where t.profile_id = v_uid and t.is_active;

  v_trainer_id := coalesce(p_trainer_id, v_own_trainer_id);
  if v_trainer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'trainer_required');
  end if;
  if not v_is_admin and v_trainer_id <> v_own_trainer_id then
    return jsonb_build_object('ok', false, 'reason', 'not_own_agenda');
  end if;
  if not exists (
    select 1 from tmc.trainers t where t.id = v_trainer_id and t.is_active
  ) then
    return jsonb_build_object('ok', false, 'reason', 'trainer_unavailable');
  end if;

  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    return jsonb_build_object('ok', false, 'reason', 'invalid_range');
  end if;
  -- Een blok dat al helemaal voorbij is heeft geen effect; een blok dat
  -- "nu" ingaat wel (blokkeert alleen toekomstige boekingen), dus we
  -- eisen alleen dat het einde in de toekomst ligt.
  if p_end_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'block_in_past');
  end if;

  -- duration_min is integer en pt_sessions eist end = start + duration.
  v_dur := extract(epoch from (p_end_at - p_start_at)) / 60;
  if v_dur <> floor(v_dur) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_range');
  end if;
  if v_dur < 1 or v_dur > 1440 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_duration');
  end if;

  select s.turnaround_min into v_ta
  from tmc.pt_trainer_settings(v_trainer_id) s;

  perform pg_advisory_xact_lock(hashtextextended(
    'pt_slot:' || v_trainer_id::text || ':'
      || to_char(p_start_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    0
  ));
  if to_char(p_end_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD')
     <> to_char(p_start_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD') then
    perform pg_advisory_xact_lock(hashtextextended(
      'pt_slot:' || v_trainer_id::text || ':'
        || to_char(p_end_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
      0
    ));
  end if;

  v_conflict := tmc.pt_check_slot(
    v_trainer_id, p_start_at, p_end_at, v_ta, null,
    not p_allow_overlap, not p_allow_no_turnaround
  );
  if v_conflict = 'overlap' then
    return jsonb_build_object('ok', false, 'reason', 'pt_overlap', 'conflict_at', p_start_at);
  end if;
  if v_conflict = 'no_turnaround' then
    return jsonb_build_object('ok', false, 'reason', 'pt_no_turnaround', 'conflict_at', p_start_at);
  end if;

  insert into tmc.pt_sessions
    (trainer_id, kind, format, start_at, end_at, duration_min, mode, capacity, status, notes)
  values
    (v_trainer_id, 'block', null, p_start_at, p_end_at, v_dur::int, null, 1, 'scheduled', nullif(trim(p_note), ''))
  returning id into v_session_id;

  return jsonb_build_object(
    'ok', true,
    'pt_session_id', v_session_id,
    'trainer_id', v_trainer_id,
    'start_at', p_start_at,
    'end_at', p_end_at
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. delete_pt_block: een blok weer weghalen. Alleen kind='block' (een
--    sessie met klant gaat via cancel_pt); een blok heeft nooit een
--    boeking, dus een harde delete is veilig. Zelfde eigen-agenda-grens
--    als hierboven.
-- ---------------------------------------------------------------------

create or replace function tmc.delete_pt_block(p_pt_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tmc, extensions
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
    and s.kind = 'block'
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

-- Zelfde grant-patroon als de bestaande PT-RPC's; de drie herschapen
-- functies behouden hun bestaande grants (create or replace).
grant execute on function tmc.create_pt_block(timestamptz, timestamptz, uuid, text, boolean, boolean) to authenticated, service_role;
grant execute on function tmc.delete_pt_block(uuid) to authenticated, service_role;
