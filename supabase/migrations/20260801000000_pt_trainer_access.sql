-- PT-agenda C3: trainer-toegang op de boek-RPC's. C1/C2 leverden een de
-- facto admin-only PT-agenda op (admin_book_pt_for_member,
-- admin_plan_pt_program en get_pt_busy zijn uitsluitend tmc.is_admin()-
-- gated), waardoor een trainer zonder admin-rol er niet bij kan. Deze
-- migratie verruimt precies die gate naar admin-of-actieve-trainer; alle
-- overige logica (locks, foutcodes pt_overlap/pt_no_turnaround,
-- conflictlijst, credit-kern, lifecycle-guards) blijft byte-voor-byte de
-- live versie (geverifieerd via pg_get_functiondef op 2026-07-14).
--
-- Predicaat-keuze: trainers.is_active, NIET is_pt_available. is_active
-- bepaalt of iemand als trainer mag werken; is_pt_available bepaalt
-- alleen of leden hem als boekbare PT zien. Voor toegang tot het boek-
-- en agenda-scherm is is_active de juiste voorwaarde (de test-trainer
-- heeft is_pt_available=false en moet er wel bij kunnen). tmc.is_trainer()
-- (exacte rol-match, zonder is_active-check) blijft ongemoeid.
--
-- Overrides: p_allow_overlap/p_allow_no_turnaround werken nu ook voor een
-- actieve trainer, want die is de bediener van het boek-scherm. In
-- admin_book_pt_for_member volgt dat vanzelf uit de gate (er is geen
-- aparte override-check in de body); de enige plek waar
-- override_not_allowed bestaat is reschedule_pt, en die check gaat hier
-- consistent mee naar het staff-predicaat. De rest van reschedule_pt
-- (booking-zichtbaarheid en venster-bypass op v_is_admin) is bewust
-- ongewijzigd: dat is PR D-terrein.
--
-- Schema strak op tmc; public en tvmuur onaangeroerd; 20260503_gallery
-- onaangeroerd.

begin;

-- ============================================================
-- 1. Het staff-predicaat: admin OF actieve trainer
-- ============================================================

create or replace function tmc.is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
  select tmc.is_admin() or exists (
    select 1 from tmc.trainers t
    where t.profile_id = auth.uid() and t.is_active
  );
$function$;

-- Zelfde grant-patroon als tmc.is_admin()/tmc.is_trainer(): aanroepbaar
-- in policies en definer-functies voor elke rol.
grant execute on function tmc.is_staff() to anon, authenticated, service_role;

-- ============================================================
-- 2. admin_book_pt_for_member: gate naar staff (rest ongewijzigd)
-- ============================================================

create or replace function tmc.admin_book_pt_for_member(
  p_profile_id uuid,
  p_trainer_id uuid,
  p_start_at timestamptz,
  p_format text default 'one_on_one',
  p_payment_mode text default 'credits',
  p_duration_min int default null,
  p_introducee_name text default null,
  p_allow_overlap boolean default false,
  p_allow_no_turnaround boolean default false,
  p_repeat_weeks int default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_default_dur int;
  v_ta int;
  v_cancel int;
  v_dur int;
  v_membership tmc.memberships%rowtype;
  v_price_cents int := 0;
  v_credits_from uuid := null;
  v_occ_start timestamptz;
  v_occ_end timestamptz;
  v_conflict text;
  v_session_id uuid;
  v_booking_id uuid;
  v_adjust jsonb;
  v_bookings jsonb := '[]'::jsonb;
  i int;
begin
  -- C3: admin of actieve trainer; de overrides hieronder volgen dezelfde
  -- gate (geen aparte override-check in deze functie).
  if not tmc.is_staff() then
    raise exception 'Alleen voor beheer of een actieve trainer.' using errcode = '42501';
  end if;
  if p_format is null or p_format not in ('one_on_one', 'duo') then
    return jsonb_build_object('ok', false, 'reason', 'format_not_supported');
  end if;
  if p_payment_mode is null or p_payment_mode not in ('credits', 'payment_link', 'already_paid') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_payment_mode');
  end if;
  if p_repeat_weeks is null or p_repeat_weeks < 1 or p_repeat_weeks > 26 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_repeat');
  end if;
  -- Een betaallink dekt precies een sessie; een reeks via links is
  -- fase 2-terrein (of: per sessie een losse boeking maken).
  if p_payment_mode = 'payment_link' and p_repeat_weeks > 1 then
    return jsonb_build_object('ok', false, 'reason', 'payment_link_single_only');
  end if;
  if p_start_at is null or p_start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;
  if not exists (select 1 from tmc.profiles p where p.id = p_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;
  -- Admin mag ook op een niet-leden-facing trainer boeken
  -- (is_pt_available false, zoals de test-trainer), niet op een inactieve.
  if not exists (
    select 1 from tmc.trainers t where t.id = p_trainer_id and t.is_active
  ) then
    return jsonb_build_object('ok', false, 'reason', 'trainer_unavailable');
  end if;

  select s.session_duration_min, s.turnaround_min, s.cancel_window_hours
  into v_default_dur, v_ta, v_cancel
  from tmc.pt_trainer_settings(p_trainer_id) s;

  v_dur := coalesce(p_duration_min, v_default_dur);
  if v_dur < 1 or v_dur > 480 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_duration');
  end if;

  -- Eerst ALLE momenten valideren onder hun dag-locks, dan pas inserten:
  -- een plpgsql-return na een insert rolt niets terug, dus er mag voor
  -- de eerste insert geen faalpad meer over zijn. Wekelijkse herhalingen
  -- op dezelfde tijd kunnen elkaar niet raken (7 dagen afstand), dus een
  -- onderlinge check is niet nodig.
  for i in 0..(p_repeat_weeks - 1) loop
    v_occ_start := p_start_at + make_interval(weeks => i);
    v_occ_end := v_occ_start + make_interval(mins => v_dur);
    perform pg_advisory_xact_lock(hashtextextended(
      'pt_slot:' || p_trainer_id::text || ':'
        || to_char(v_occ_start at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
      0
    ));
    v_conflict := tmc.pt_check_slot(
      p_trainer_id, v_occ_start, v_occ_end, v_ta, null,
      not p_allow_overlap, not p_allow_no_turnaround
    );
    if v_conflict = 'overlap' then
      return jsonb_build_object('ok', false, 'reason', 'pt_overlap', 'conflict_at', v_occ_start);
    end if;
    if v_conflict = 'no_turnaround' then
      return jsonb_build_object('ok', false, 'reason', 'pt_no_turnaround', 'conflict_at', v_occ_start);
    end if;
  end loop;

  if p_payment_mode = 'credits' then
    -- Credit-bucket op format: duo verbruikt een duo-rittenkaart
    -- (plan_variant duo_*), 1-op-1 een gewone PT-kaart. Zelfde selectie
    -- als PR A, met een saldo-check voor de hele reeks; de rij is
    -- gelockt dus de per-sessie-debits hieronder kunnen niet meer racen.
    select m.* into v_membership
    from tmc.memberships m
    where m.profile_id = p_profile_id
      and m.status = 'active'
      and m.plan_type = 'pt_package'
      and coalesce(m.credits_remaining, 0) > 0
      and (m.credits_expires_at is null or m.credits_expires_at >= current_date)
      and (
        (p_format = 'duo' and m.plan_variant like 'duo%')
        or (p_format = 'one_on_one'
            and (m.plan_variant is null or m.plan_variant not like 'duo%'))
      )
    order by m.start_date desc
    limit 1
    for update of m;

    if v_membership.id is null then
      return jsonb_build_object('ok', false, 'reason', 'no_credits');
    end if;
    if coalesce(v_membership.credits_remaining, 0) < p_repeat_weeks then
      return jsonb_build_object(
        'ok', false, 'reason', 'no_credits',
        'credits_needed', p_repeat_weeks,
        'credits_available', coalesce(v_membership.credits_remaining, 0)
      );
    end if;
    v_credits_from := v_membership.id;
    v_price_cents := 0;
  else
    select c.price_cents into v_price_cents
    from tmc.catalogue c
    where c.slug = case p_format when 'duo' then 'duo_single' else 'pt_single' end
      and c.kind = 'product';
    if v_price_cents is null then
      raise exception 'PT-prijs ontbreekt in tmc.catalogue.' using errcode = 'P0001';
    end if;
  end if;

  for i in 0..(p_repeat_weeks - 1) loop
    v_occ_start := p_start_at + make_interval(weeks => i);
    v_occ_end := v_occ_start + make_interval(mins => v_dur);

    insert into tmc.pt_sessions (trainer_id, kind, format, start_at, end_at, duration_min, mode, capacity, status)
    values (p_trainer_id, 'bookable', p_format, v_occ_start, v_occ_end, v_dur, 'studio', 1, 'scheduled')
    returning id into v_session_id;

    insert into tmc.pt_bookings (profile_id, pt_session_id, price_paid_cents, credits_used_from, introducee_name, status)
    values (p_profile_id, v_session_id, v_price_cents, v_credits_from, p_introducee_name, 'booked')
    returning id into v_booking_id;

    if p_payment_mode = 'credits' then
      -- Debit per sessie door de geauditeerde kern: een event per credit.
      -- Onbereikbaar-falen (saldo is gelockt en vooraf gecheckt) escaleert
      -- als exception zodat de hele reeks terugrolt.
      v_adjust := tmc.apply_credit_adjustment(
        v_credits_from, -1, 'PT-boeking (door admin)', 'booking',
        'admin', v_uid, null, 'tmc_booking'
      );
      if not coalesce((v_adjust ->> 'ok')::boolean, false) then
        raise exception 'Credit-debit faalde onverwacht: %', v_adjust ->> 'reason' using errcode = 'P0001';
      end if;
    end if;

    v_bookings := v_bookings || jsonb_build_object(
      'booking_id', v_booking_id,
      'pt_session_id', v_session_id,
      'start_at', v_occ_start,
      'end_at', v_occ_end
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'bookings', v_bookings,
    'payment_mode', p_payment_mode,
    'price_cents_per_session', v_price_cents,
    'membership_id', v_credits_from,
    'format', p_format,
    'duration_min', v_dur
  );
end;
$function$;

-- ============================================================
-- 3. admin_plan_pt_program: gate naar staff (rest ongewijzigd)
-- ============================================================

create or replace function tmc.admin_plan_pt_program(
  p_profile_id uuid,
  p_trainer_id uuid,
  p_type text,
  p_start_at timestamptz,
  p_second_start_at timestamptz default null,
  p_intake_start_at timestamptz default null,
  p_payment_mode text default 'payment_link'
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ta int;
  v_slug text;
  v_total int;
  c_start timestamptz[] := '{}';
  c_dur int[] := '{}';
  c_mode text[] := '{}';
  v_conflicts jsonb := '[]'::jsonb;
  v_conflict text;
  v_program_id uuid;
  v_session_id uuid;
  v_booking_id uuid;
  v_sessions jsonb := '[]'::jsonb;
  w int;
  i int;
  j int;
  v_gap interval;
begin
  -- C3: admin of actieve trainer.
  if not tmc.is_staff() then
    raise exception 'Alleen voor beheer of een actieve trainer.' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('studio', 'online') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_program_type');
  end if;
  if p_payment_mode is null or p_payment_mode not in ('payment_link', 'already_paid') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_payment_mode');
  end if;
  if p_start_at is null or p_start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;
  if not exists (select 1 from tmc.profiles p where p.id = p_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;
  if not exists (
    select 1 from tmc.trainers t where t.id = p_trainer_id and t.is_active
  ) then
    return jsonb_build_object('ok', false, 'reason', 'trainer_unavailable');
  end if;

  select s.turnaround_min into v_ta
  from tmc.pt_trainer_settings(p_trainer_id) s;

  if p_type = 'studio' then
    if p_second_start_at is null then
      return jsonb_build_object('ok', false, 'reason', 'second_slot_required');
    end if;
    if p_second_start_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'session_in_past');
    end if;
    v_slug := 'program_studio_12w';
    v_total := 24;
    for w in 0..11 loop
      c_start := c_start || (p_start_at + make_interval(weeks => w));
      c_dur := c_dur || 60;
      c_mode := c_mode || 'studio'::text;
      c_start := c_start || (p_second_start_at + make_interval(weeks => w));
      c_dur := c_dur || 60;
      c_mode := c_mode || 'studio'::text;
    end loop;
  else
    if p_intake_start_at is null then
      return jsonb_build_object('ok', false, 'reason', 'intake_required');
    end if;
    if p_intake_start_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'session_in_past');
    end if;
    v_slug := 'program_online_12w';
    v_total := 12;
    -- De beginmeting: fysiek, 60 min, telt niet mee in de 12
    -- (herkenbaar aan mode 'studio' binnen een online programma).
    c_start := c_start || p_intake_start_at;
    c_dur := c_dur || 60;
    c_mode := c_mode || 'studio'::text;
    for w in 0..11 loop
      c_start := c_start || (p_start_at + make_interval(weeks => w));
      c_dur := c_dur || 30;
      c_mode := c_mode || 'online'::text;
    end loop;
  end if;

  -- Alle momenten valideren onder hun dag-locks tegen de bestaande
  -- agenda, plus onderling (kandidaten zitten nog niet in de tabel).
  for i in 1..array_length(c_start, 1) loop
    perform pg_advisory_xact_lock(hashtextextended(
      'pt_slot:' || p_trainer_id::text || ':'
        || to_char(c_start[i] at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
      0
    ));
    v_conflict := tmc.pt_check_slot(
      p_trainer_id, c_start[i], c_start[i] + make_interval(mins => c_dur[i]),
      v_ta, null, true, true
    );
    if v_conflict is not null then
      v_conflicts := v_conflicts || jsonb_build_object(
        'start_at', c_start[i],
        'reason', case v_conflict when 'overlap' then 'pt_overlap' else 'pt_no_turnaround' end
      );
    end if;
    for j in 1..(i - 1) loop
      if c_start[j] < c_start[i] + make_interval(mins => c_dur[i])
         and c_start[i] < c_start[j] + make_interval(mins => c_dur[j]) then
        v_conflicts := v_conflicts || jsonb_build_object('start_at', c_start[i], 'reason', 'pt_overlap');
      else
        v_gap := case
          when c_start[j] >= c_start[i] + make_interval(mins => c_dur[i])
            then c_start[j] - (c_start[i] + make_interval(mins => c_dur[i]))
          else c_start[i] - (c_start[j] + make_interval(mins => c_dur[j]))
        end;
        if v_gap < make_interval(mins => v_ta) then
          v_conflicts := v_conflicts || jsonb_build_object('start_at', c_start[i], 'reason', 'pt_no_turnaround');
        end if;
      end if;
    end loop;
  end loop;

  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'pt_slot_conflicts', 'conflicts', v_conflicts);
  end if;

  insert into tmc.pt_programs (profile_id, catalogue_slug, type, total_sessions, status, payment_ref)
  values (
    p_profile_id, v_slug, p_type, v_total, 'active',
    case when p_payment_mode = 'already_paid' then 'paid_override' else null end
  )
  returning id into v_program_id;

  for i in 1..array_length(c_start, 1) loop
    insert into tmc.pt_sessions (trainer_id, kind, format, start_at, end_at, duration_min, mode, capacity, status, program_id)
    values (
      p_trainer_id, 'bookable', 'one_on_one', c_start[i],
      c_start[i] + make_interval(mins => c_dur[i]), c_dur[i], c_mode[i], 1, 'scheduled', v_program_id
    )
    returning id into v_session_id;

    insert into tmc.pt_bookings (profile_id, pt_session_id, price_paid_cents, status)
    values (p_profile_id, v_session_id, 0, 'booked')
    returning id into v_booking_id;

    v_sessions := v_sessions || jsonb_build_object(
      'booking_id', v_booking_id,
      'pt_session_id', v_session_id,
      'start_at', c_start[i],
      'duration_min', c_dur[i],
      'mode', c_mode[i]
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'program_id', v_program_id,
    'catalogue_slug', v_slug,
    'type', p_type,
    'total_sessions', v_total,
    'payment_mode', p_payment_mode,
    'sessions', v_sessions
  );
end;
$function$;

-- ============================================================
-- 4. get_pt_busy: gate naar staff (rest ongewijzigd)
-- ============================================================

create or replace function tmc.get_pt_busy(
  p_trainer_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  pt_session_id uuid,
  kind text,
  start_at timestamptz,
  end_at timestamptz,
  blocked_from timestamptz,
  blocked_until timestamptz
)
language plpgsql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_ta int;
begin
  -- C3: admin of actieve trainer. Geeft alleen tijden terug, nooit
  -- prospect-data of wie geboekt heeft.
  if not tmc.is_staff() then
    raise exception 'Alleen voor beheer of een actieve trainer.' using errcode = '42501';
  end if;

  select s.turnaround_min into v_ta
  from tmc.pt_trainer_settings(p_trainer_id) s;

  return query
  select
    s.id,
    s.kind,
    s.start_at,
    s.end_at,
    s.start_at - case when s.kind in ('bookable', 'intake') then make_interval(mins => v_ta) else interval '0' end,
    s.end_at + case when s.kind in ('bookable', 'intake') then make_interval(mins => v_ta) else interval '0' end
  from tmc.pt_sessions s
  where s.trainer_id = p_trainer_id
    and s.status = 'scheduled'
    and (s.hold_expires_at is null or s.hold_expires_at > now())
    and s.end_at > p_from
    and s.start_at < p_to
  order by s.start_at;
end;
$function$;

-- ============================================================
-- 5. reschedule_pt: alleen de override-check naar staff
-- ============================================================

create or replace function tmc.reschedule_pt(
  p_pt_booking_id uuid,
  p_new_start_at timestamptz,
  p_allow_overlap boolean default false,
  p_allow_no_turnaround boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
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
  -- C3: de tijd-overrides zijn voor staff (admin of actieve trainer), niet
  -- voor leden. Booking-zichtbaarheid en de venster-bypass hieronder
  -- blijven bewust op v_is_admin (trainer-brede reschedule is PR D).
  if not v_is_staff and (p_allow_overlap or p_allow_no_turnaround) then
    return jsonb_build_object('ok', false, 'reason', 'override_not_allowed');
  end if;
  if p_new_start_at is null or p_new_start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'new_start_in_past');
  end if;

  select b.* into v_booking
  from tmc.pt_bookings b
  where b.id = p_pt_booking_id
    and (b.profile_id = v_uid or v_is_admin)
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
$function$;

commit;
