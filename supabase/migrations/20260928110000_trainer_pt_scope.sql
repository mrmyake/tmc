-- 20260928110000_trainer_pt_scope.sql
--
-- fix/trainer-pt-scope (discovery en akkoord 2026-09-27). PT-functies alleen
-- voor PT-trainers en admin; een trainer zonder PT (alleen yoga/mobility
-- en/of kettlebell) komt nergens meer bij PT.
--
-- Uitgangssituatie (live, pg_get_functiondef 2026-09-27): tien PT-RPC's en
-- de policy pcr_trainer_read gebruiken tmc.is_staff() als gate. Die helper
-- kent geen PT-begrip (admin, of rol trainer met een actieve trainers-rij)
-- en controleert niet voor welke trainer_id iemand handelt. Gevolg: elke
-- actieve trainer kon boeken en programma's plannen op de agenda van een
-- collega (admin_book_pt_for_member, admin_plan_pt_program) en de bezette
-- tijden van elke collega opvragen (get_pt_busy). De overige RPC's
-- beperkten zich al tot de eigen sessie of eigen agenda, maar niet tot
-- PT-trainers.
--
-- Besluit Ilja:
--   * Een PT-trainer (actieve eigen trainers-rij met is_pt_available = true)
--     mag PT boeken, plannen, verzetten, blokkeren, intakes doen en
--     aanwezigheid registreren, uitsluitend voor de eigen trainer_id.
--   * Een trainer zonder PT kan geen enkele PT-RPC met succes aanroepen.
--   * Admin mag alles, voor elke trainer.
--
-- Wat deze migratie doet:
--   1. Nieuwe helper tmc.is_pt_trainer_for(p_trainer_id uuid default null):
--      admin, of rol trainer met een actieve eigen trainers-rij met
--      is_pt_available, en als p_trainer_id meekomt moet dat die eigen rij
--      zijn. Zonder argument: "heeft een eigen PT-rij".
--   2. admin_book_pt_for_member, admin_plan_pt_program, get_pt_busy: gate
--      wordt is_pt_trainer_for(p_trainer_id).
--   3. create_pt_block, delete_pt_block, complete_pt_intake,
--      cancel_pt_intake, mark_pt_attendance: gate wordt is_pt_trainer_for();
--      de eigen-sessie-subquery eist ook is_pt_available.
--   4. reschedule_pt en cancel_pt (gedeeld met leden): de trainer-tak in de
--      boekingselectie en v_is_own_trainer eisen is_pt_available; in
--      reschedule_pt worden de tijd-overrides gegate op is_pt_trainer_for()
--      in plaats van is_staff().
--   5. resolve_pt_cancellation: v_is_own_trainer eist is_pt_available.
--   6. Policy pcr_trainer_read: is_staff() wordt is_pt_trainer_for(). De
--      PT-voorwaarde zit in de helper (SECURITY DEFINER), niet in de
--      subquery: een policy-subquery wordt gepland met de rechten van de
--      aanvrager en authenticated heeft sinds fix/trainer-rls-lockdown geen
--      SELECT op trainers.is_pt_available (lokaal gereproduceerd: "permission
--      denied for table trainers" op elke lezing van de tabel). De subquery
--      houdt alleen profile_id en is_active, die wel gegrant zijn.
--
-- Bewust ongewijzigd:
--   * tmc.is_staff() zelf. De TS-spiegel requireTrainerOrAdmin blijft de gate
--     voor check-in, kiosk en room-control; na deze migratie roept geen
--     PT-RPC is_staff() meer aan (assertie onderaan).
--   * De bestaande EXECUTE-grants: alle functies houden authenticated en
--     (waar aanwezig) service_role. cancel_pt_intake, complete_pt_intake,
--     create_pt_block en delete_pt_block hebben daarnaast EXECUTE voor
--     PUBLIC (historisch, default-grant bij create function). Dat blijft zo
--     (besluit Ilja, keuze 6) en staat als vervolgpunt in PR-body en ledger.
--   * pt_sessions_trainer_own_read en pt_bookings_trainer_read (leespolicies
--     op eigen rijen zonder PT-voorwaarde): een trainer zonder PT heeft die
--     rijen niet zodra de schrijfpaden dicht zijn.
--   * tmc.pt_trainer_settings, tmc.pt_check_slot en tmc.apply_credit_adjustment.
--
-- CREATE OR REPLACE behoudt de ACL van een bestaande functie; de grants
-- worden hieronder toch per functie expliciet herhaald (grant-restore),
-- zodat de bedoelde ACL in het bestand staat en niet van de live toestand
-- afhangt. supabase db push voert dit bestand in een transactie uit.
-- Geen enkele stap hangt af van applicatiedata; het assertieblok leest
-- alleen catalogi.

-- ---------------------------------------------------------------------------
-- 1. Helper
-- ---------------------------------------------------------------------------
create or replace function tmc.is_pt_trainer_for(p_trainer_id uuid default null)
 returns boolean
 language sql
 stable security definer
 set search_path to 'tmc', 'extensions'
as $function$
  select tmc.is_admin() or (
    tmc.current_user_role() = 'trainer'
    and exists (
      select 1 from tmc.trainers t
      where t.profile_id = auth.uid()
        and t.is_active
        and t.is_pt_available
        and (p_trainer_id is null or t.id = p_trainer_id)
    )
  );
$function$;

comment on function tmc.is_pt_trainer_for(uuid) is
  'Admin, of rol trainer met een actieve eigen trainers-rij met is_pt_available; met p_trainer_id alleen als dat de eigen rij is. Gate voor de PT-RPC''s (fix/trainer-pt-scope).';

-- Zelfde grants als tmc.is_staff(): wordt in een policy geevalueerd.
grant execute on function tmc.is_pt_trainer_for(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. RPC's met p_trainer_id: alleen de eigen trainer_id (of admin)
-- ---------------------------------------------------------------------------

-- Live definitie 2026-09-27; alleen de gate (is_staff -> is_pt_trainer_for(p_trainer_id)) wijzigt.
CREATE OR REPLACE FUNCTION tmc.admin_book_pt_for_member(p_profile_id uuid, p_trainer_id uuid, p_start_at timestamp with time zone, p_format text DEFAULT 'one_on_one'::text, p_payment_mode text DEFAULT 'credits'::text, p_duration_min integer DEFAULT NULL::integer, p_introducee_name text DEFAULT NULL::text, p_allow_overlap boolean DEFAULT false, p_allow_no_turnaround boolean DEFAULT false, p_repeat_weeks integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
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
  -- fix/trainer-pt-scope: admin, of een PT-trainer uitsluitend op de eigen
  -- trainer_id; de overrides hieronder volgen dezelfde gate (geen aparte
  -- override-check in deze functie).
  if not tmc.is_pt_trainer_for(p_trainer_id) then
    raise exception 'Alleen voor beheer of de eigen PT-agenda.' using errcode = '42501';
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

grant execute on function tmc.admin_book_pt_for_member(uuid, uuid, timestamptz, text, text, integer, text, boolean, boolean, integer) to authenticated, service_role;

-- Live definitie 2026-09-27; alleen de gate wijzigt.
CREATE OR REPLACE FUNCTION tmc.admin_plan_pt_program(p_profile_id uuid, p_trainer_id uuid, p_type text, p_start_at timestamp with time zone, p_second_start_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_intake_start_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_payment_mode text DEFAULT 'payment_link'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
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
  -- fix/trainer-pt-scope: admin, of een PT-trainer op de eigen trainer_id.
  if not tmc.is_pt_trainer_for(p_trainer_id) then
    raise exception 'Alleen voor beheer of de eigen PT-agenda.' using errcode = '42501';
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

grant execute on function tmc.admin_plan_pt_program(uuid, uuid, text, timestamptz, timestamptz, timestamptz, text) to authenticated, service_role;

-- Live definitie 2026-09-27; alleen de gate wijzigt.
CREATE OR REPLACE FUNCTION tmc.get_pt_busy(p_trainer_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(pt_session_id uuid, kind text, start_at timestamp with time zone, end_at timestamp with time zone, blocked_from timestamp with time zone, blocked_until timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_ta int;
begin
  -- fix/trainer-pt-scope: admin, of een PT-trainer op de eigen trainer_id.
  -- Geeft alleen tijden terug, nooit prospect-data of wie geboekt heeft.
  if not tmc.is_pt_trainer_for(p_trainer_id) then
    raise exception 'Alleen voor beheer of de eigen PT-agenda.' using errcode = '42501';
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

grant execute on function tmc.get_pt_busy(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. RPC's op een sessie of blok: eigen PT-agenda (of admin)
-- ---------------------------------------------------------------------------

-- Live definitie 2026-09-27; alleen de gate wijzigt (de not_own_agenda-check
-- bestond al). PUBLIC-grant historisch aanwezig en bewust ongewijzigd.
CREATE OR REPLACE FUNCTION tmc.create_pt_block(p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_trainer_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_allow_overlap boolean DEFAULT false, p_allow_no_turnaround boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
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
  -- fix/trainer-pt-scope: admin of PT-trainer.
  if not tmc.is_pt_trainer_for() then
    raise exception 'Alleen voor beheer of een PT-trainer.' using errcode = '42501';
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
$function$;

grant execute on function tmc.create_pt_block(timestamptz, timestamptz, uuid, text, boolean, boolean) to authenticated, service_role;

-- Live definitie 2026-09-27; gate plus is_pt_available in de eigen-sessie-subquery.
CREATE OR REPLACE FUNCTION tmc.delete_pt_block(p_pt_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_session tmc.pt_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  -- fix/trainer-pt-scope: admin of PT-trainer.
  if not tmc.is_pt_trainer_for() then
    raise exception 'Alleen voor beheer of een PT-trainer.' using errcode = '42501';
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
          and t.is_pt_available
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
$function$;

grant execute on function tmc.delete_pt_block(uuid) to authenticated, service_role;

-- Live definitie 2026-09-27; gate plus is_pt_available in de eigen-sessie-subquery.
CREATE OR REPLACE FUNCTION tmc.complete_pt_intake(p_pt_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_session tmc.pt_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  -- fix/trainer-pt-scope: admin of PT-trainer.
  if not tmc.is_pt_trainer_for() then
    raise exception 'Alleen voor beheer of een PT-trainer.' using errcode = '42501';
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
          and t.is_pt_available
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
$function$;

grant execute on function tmc.complete_pt_intake(uuid) to authenticated;

-- Live definitie 2026-09-27; gate plus is_pt_available in de eigen-sessie-subquery.
CREATE OR REPLACE FUNCTION tmc.cancel_pt_intake(p_pt_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_session tmc.pt_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  -- fix/trainer-pt-scope: admin of PT-trainer.
  if not tmc.is_pt_trainer_for() then
    raise exception 'Alleen voor beheer of een PT-trainer.' using errcode = '42501';
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
          and t.is_pt_available
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
$function$;

grant execute on function tmc.cancel_pt_intake(uuid) to authenticated;

-- Live definitie 2026-09-27; gate plus is_pt_available in de eigen-sessie-subquery.
CREATE OR REPLACE FUNCTION tmc.mark_pt_attendance(p_pt_booking_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_booking tmc.pt_bookings%rowtype;
  v_start timestamptz;
begin
  -- fix/trainer-pt-scope: admin of PT-trainer; eigen-sessie-grens in de
  -- select hieronder.
  if not tmc.is_pt_trainer_for() then
    raise exception 'Alleen voor beheer of een PT-trainer.' using errcode = '42501';
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
          and t.is_pt_available
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
$function$;

grant execute on function tmc.mark_pt_attendance(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Gedeelde RPC's (lid en staf): trainer-tak alleen voor PT-trainers
-- ---------------------------------------------------------------------------

-- Live definitie 2026-09-27; v_is_staff (overrides) wordt is_pt_trainer_for(),
-- de trainer-tak in de boekingselectie eist is_pt_available.
CREATE OR REPLACE FUNCTION tmc.reschedule_pt(p_pt_booking_id uuid, p_new_start_at timestamp with time zone, p_allow_overlap boolean DEFAULT false, p_allow_no_turnaround boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_is_pt_staff boolean := tmc.is_pt_trainer_for();
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
  -- C3: de tijd-overrides zijn voor staf, niet voor leden. Sinds
  -- fix/trainer-pt-scope is dat admin of een PT-trainer; de selectie
  -- hieronder beperkt een trainer tot boekingen op de eigen sessies. De
  -- venster-bypass blijft admin-only.
  if not v_is_pt_staff and (p_allow_overlap or p_allow_no_turnaround) then
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
          and t.is_pt_available
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
$function$;

grant execute on function tmc.reschedule_pt(uuid, timestamptz, boolean, boolean) to authenticated, service_role;

-- Live definitie 2026-09-27; de trainer-tak in de boekingselectie en
-- v_is_own_trainer eisen is_pt_available.
CREATE OR REPLACE FUNCTION tmc.cancel_pt(p_pt_booking_id uuid, p_with_restitution boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
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

  -- C4: naast de klant zelf en een admin mag ook de actieve PT-trainer van
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
          and t.is_pt_available
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
      and t.is_pt_available
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

grant execute on function tmc.cancel_pt(uuid, boolean) to authenticated, service_role;

-- Live definitie 2026-09-27; v_is_own_trainer eist is_pt_available.
CREATE OR REPLACE FUNCTION tmc.resolve_pt_cancellation(p_request_id uuid, p_approve boolean, p_with_restitution boolean DEFAULT NULL::boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tmc', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := tmc.is_admin();
  v_is_own_trainer boolean := false;
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

  v_is_own_trainer := exists (
    select 1 from tmc.trainers t
    where t.id = v_session.trainer_id
      and t.profile_id = v_uid
      and t.is_active
      and t.is_pt_available
  );

  -- C4-eigen-sessie-grens: alleen admin of de PT-trainer van de sessie;
  -- ieder ander krijgt not_found, zoals in cancel_pt.
  if not (v_is_admin or v_is_own_trainer) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

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

grant execute on function tmc.resolve_pt_cancellation(uuid, boolean, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Policy pcr_trainer_read
-- ---------------------------------------------------------------------------
-- Live definitie 2026-09-27:
--   tmc.is_staff() and pt_booking_id in (
--     select b.id from tmc.pt_bookings b
--     join tmc.pt_sessions s on s.id = b.pt_session_id
--     join tmc.trainers t on t.id = s.trainer_id
--     where t.profile_id = auth.uid() and t.is_active)
-- De PT-voorwaarde komt uit is_pt_trainer_for() (eigen actieve rij met
-- is_pt_available); de subquery beperkt tot boekingen op sessies van die
-- eigen rij en raakt alleen kolommen die authenticated mag lezen
-- (profile_id, is_active). Geen is_pt_available in de subquery, zie kop.
drop policy if exists pcr_trainer_read on tmc.pt_cancellation_requests;
create policy pcr_trainer_read on tmc.pt_cancellation_requests
  for select
  using (
    tmc.is_pt_trainer_for()
    and pt_booking_id in (
      select b.id
      from tmc.pt_bookings b
      join tmc.pt_sessions s on s.id = b.pt_session_id
      join tmc.trainers t on t.id = s.trainer_id
      where t.profile_id = auth.uid()
        and t.is_active
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Asserties (alleen catalogi, geen applicatiedata)
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_name text;
  v_qual text;
  v_pt_rpcs text[] := array[
    'tmc.admin_book_pt_for_member(uuid, uuid, timestamptz, text, text, integer, text, boolean, boolean, integer)',
    'tmc.admin_plan_pt_program(uuid, uuid, text, timestamptz, timestamptz, timestamptz, text)',
    'tmc.get_pt_busy(uuid, timestamptz, timestamptz)',
    'tmc.create_pt_block(timestamptz, timestamptz, uuid, text, boolean, boolean)',
    'tmc.delete_pt_block(uuid)',
    'tmc.complete_pt_intake(uuid)',
    'tmc.cancel_pt_intake(uuid)',
    'tmc.mark_pt_attendance(uuid, text)',
    'tmc.reschedule_pt(uuid, timestamptz, boolean, boolean)',
    'tmc.cancel_pt(uuid, boolean)',
    'tmc.resolve_pt_cancellation(uuid, boolean, boolean, text)'
  ];
  v_service_role_rpcs text[] := array[
    'tmc.admin_book_pt_for_member(uuid, uuid, timestamptz, text, text, integer, text, boolean, boolean, integer)',
    'tmc.admin_plan_pt_program(uuid, uuid, text, timestamptz, timestamptz, timestamptz, text)',
    'tmc.get_pt_busy(uuid, timestamptz, timestamptz)',
    'tmc.create_pt_block(timestamptz, timestamptz, uuid, text, boolean, boolean)',
    'tmc.delete_pt_block(uuid)',
    'tmc.mark_pt_attendance(uuid, text)',
    'tmc.reschedule_pt(uuid, timestamptz, boolean, boolean)',
    'tmc.cancel_pt(uuid, boolean)',
    'tmc.resolve_pt_cancellation(uuid, boolean, boolean, text)'
  ];
  v_pt_available_rpcs text[] := array[
    'tmc.delete_pt_block(uuid)',
    'tmc.complete_pt_intake(uuid)',
    'tmc.cancel_pt_intake(uuid)',
    'tmc.mark_pt_attendance(uuid, text)',
    'tmc.reschedule_pt(uuid, timestamptz, boolean, boolean)',
    'tmc.cancel_pt(uuid, boolean)',
    'tmc.resolve_pt_cancellation(uuid, boolean, boolean, text)'
  ];
begin
  -- De helper bestaat, is SECURITY DEFINER en eist is_pt_available.
  select pg_get_functiondef('tmc.is_pt_trainer_for(uuid)'::regprocedure) into v_def;
  if v_def not ilike '%security definer%' or v_def not like '%t.is_pt_available%'
     or v_def not like '%p_trainer_id is null or t.id = p_trainer_id%' then
    raise exception 'trainer_pt_scope: tmc.is_pt_trainer_for(uuid) heeft niet de verwachte definitie';
  end if;
  if not (has_function_privilege('authenticated', 'tmc.is_pt_trainer_for(uuid)', 'execute')
      and has_function_privilege('anon', 'tmc.is_pt_trainer_for(uuid)', 'execute')
      and has_function_privilege('service_role', 'tmc.is_pt_trainer_for(uuid)', 'execute')) then
    raise exception 'trainer_pt_scope: EXECUTE-grants op is_pt_trainer_for ontbreken';
  end if;

  -- Geen PT-RPC roept nog is_staff() aan; elke PT-RPC gebruikt de nieuwe helper.
  foreach v_name in array v_pt_rpcs loop
    select pg_get_functiondef(v_name::regprocedure) into v_def;
    if v_def like '%is_staff()%' then
      raise exception 'trainer_pt_scope: % roept nog tmc.is_staff() aan', v_name;
    end if;
    if v_name not in ('tmc.cancel_pt(uuid, boolean)', 'tmc.resolve_pt_cancellation(uuid, boolean, boolean, text)')
       and v_def not like '%is_pt_trainer_for(%' then
      raise exception 'trainer_pt_scope: % gebruikt is_pt_trainer_for niet', v_name;
    end if;
    if v_def not ilike '%security definer%' then
      raise exception 'trainer_pt_scope: % is geen SECURITY DEFINER meer', v_name;
    end if;
    if not has_function_privilege('authenticated', v_name, 'execute') then
      raise exception 'trainer_pt_scope: authenticated mist EXECUTE op %', v_name;
    end if;
  end loop;
  foreach v_name in array v_service_role_rpcs loop
    if not has_function_privilege('service_role', v_name, 'execute') then
      raise exception 'trainer_pt_scope: service_role mist EXECUTE op %', v_name;
    end if;
  end loop;
  foreach v_name in array v_pt_available_rpcs loop
    select pg_get_functiondef(v_name::regprocedure) into v_def;
    if v_def not like '%and t.is_pt_available%' then
      raise exception 'trainer_pt_scope: % eist is_pt_available niet in de eigen-sessie-subquery', v_name;
    end if;
  end loop;

  -- is_staff() zelf is ongewijzigd (rol trainer plus actieve rij, of admin).
  select pg_get_functiondef('tmc.is_staff()'::regprocedure) into v_def;
  if v_def not like '%current_user_role() = ''trainer''%' or v_def like '%is_pt_available%' then
    raise exception 'trainer_pt_scope: tmc.is_staff() is onbedoeld gewijzigd';
  end if;

  -- Policy pcr_trainer_read: SELECT, nieuwe helper, geen is_staff en geen
  -- directe is_pt_available-verwijzing (niet gegrant aan authenticated).
  select p.qual into v_qual
  from pg_policies p
  where p.schemaname = 'tmc' and p.tablename = 'pt_cancellation_requests'
    and p.policyname = 'pcr_trainer_read' and p.cmd = 'SELECT';
  if v_qual is null then
    raise exception 'trainer_pt_scope: policy pcr_trainer_read ontbreekt of is geen SELECT-policy';
  end if;
  if v_qual like '%is_staff()%' or v_qual not like '%is_pt_trainer_for()%' or v_qual like '%is_pt_available%' then
    raise exception 'trainer_pt_scope: policy pcr_trainer_read heeft niet de verwachte voorwaarde';
  end if;
  -- De overige policies op de tabel staan er nog.
  perform 1 from pg_policies where schemaname = 'tmc' and tablename = 'pt_cancellation_requests' and policyname = 'pcr_admin_all';
  if not found then
    raise exception 'trainer_pt_scope: policy pcr_admin_all is verdwenen';
  end if;
  perform 1 from pg_policies where schemaname = 'tmc' and tablename = 'pt_cancellation_requests' and policyname = 'pcr_self_read';
  if not found then
    raise exception 'trainer_pt_scope: policy pcr_self_read is verdwenen';
  end if;
end $$;
