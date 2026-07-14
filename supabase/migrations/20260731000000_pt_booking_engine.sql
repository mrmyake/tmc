-- PT-agenda PR C1: de boek-backend na de model-herziening naar
-- Marlon-boekt-alles (spec-pt-agenda.md, PR #99). Geen zelfbediening
-- meer: de beschikbaarheids-vensters en het leden-slots-pad uit PR A
-- vervallen; Marlon prikt vrij op elk moment, met overlap en
-- omkleedtijd als losse, overrulebare checks.
--
-- Live geverifieerd op 2026-07-14 (pg_get_functiondef, constraints,
-- information_schema):
-- - PR A-functies (admin_book_pt_for_member, cancel_pt, reschedule_pt,
--   mark_pt_attendance, apply_credit_adjustment, pt_slot_is_free,
--   pt_trainer_settings, get_pt_free_slots, book_pt_credits,
--   book_pt_pending_payment) staan live met de PR A-signatures.
-- - De catalogus heeft AL programma-rijen: program_studio_12w (240000)
--   en program_online_12w (125000), kind product, purchasable false
--   (lead-items, precies de gemandateerde bedragen). /12-weken-programma
--   leest exact deze slugs, dus display is al gelijk aan charge; deze
--   migratie hergebruikt die rijen in plaats van een tweede prijsbron
--   te maken.
-- - tmc.orders heeft al een pt_session_id-kolom en tmc.create_order
--   neemt al p_pt_session_id aan; admin_create_order en activate_order
--   kennen die kolom nog niet. Die worden hier chirurgisch uitgebreid,
--   herschapen vanaf de live definities.
-- - pt_sessions en pt_bookings zijn leeg (0 rijen).
--
-- Schema strak op tmc; public en tvmuur onaangeroerd; 20260503_gallery
-- onaangeroerd. Tijdzone advisory-lock-sleutels: Europe/Amsterdam.

begin;

-- ============================================================
-- 1. Opschonen: vensters, leden-slots-pad en zelfbedienings-RPC's weg
-- ============================================================

-- Het venstermodel vervalt: Marlon prikt vrij. get_pt_free_slots was het
-- PII-veilige leden-leespad; leden boeken niet meer, dus het vervalt.
drop function tmc.get_pt_free_slots(uuid, timestamptz, timestamptz);

-- De zelfbedienings-boek-RPC's vervallen mee: ze zijn het
-- zelfbedienings-pad zelf, en hun slot-validatie leunde op de vensters
-- die hieronder verdwijnen. Laten staan zou een kapotte maar aanroepbare
-- SECURITY DEFINER-functie voor elk ingelogd lid betekenen.
drop function tmc.book_pt_credits(uuid, timestamptz, text);
drop function tmc.book_pt_pending_payment(uuid, timestamptz, text);

-- Vervangen door tmc.pt_check_slot (overlap en omkleedtijd als twee
-- losse checks, elk apart overrulebaar).
drop function tmc.pt_slot_is_free(uuid, timestamptz, timestamptz, int, uuid);

-- Return-type wijzigt (booking_horizon_days vervalt), dus drop en
-- hercreatie verderop.
drop function tmc.pt_trainer_settings(uuid);

-- Signatures wijzigen (nieuwe parameters met defaults zouden anders een
-- tweede overload naast de oude zetten).
drop function tmc.admin_book_pt_for_member(uuid, uuid, timestamptz, text, text);
drop function tmc.reschedule_pt(uuid, timestamptz);
drop function tmc._compute_order_price(text, boolean, boolean, boolean);
drop function tmc.admin_create_order(uuid, text, boolean, boolean, boolean, boolean, integer);

drop table tmc.pt_availability_windows;
drop table tmc.pt_availability_exceptions;

-- Geen leden-horizon meer: leden boeken niet.
alter table tmc.pt_settings drop column booking_horizon_days;

-- ============================================================
-- 2. Programmamodel
-- ============================================================

create table tmc.pt_programs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references tmc.profiles(id) on delete cascade,
  catalogue_slug text not null references tmc.catalogue(slug),
  type text not null check (type in ('studio', 'online')),
  total_sessions int not null check (total_sessions > 0),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  -- Order-id van de Mollie-betaallink, of 'paid_override' (kas of pin).
  payment_ref text,
  created_at timestamptz not null default now()
);

alter table tmc.pt_programs enable row level security;

create policy pt_programs_admin_all on tmc.pt_programs
  for all using (tmc.is_admin()) with check (tmc.is_admin());
-- Het lid ziet de eigen programma-voortgang (PR E); nooit een creditsaldo,
-- de voortgang wordt afgeleid uit bijgewoonde sessies.
create policy pt_programs_self_read on tmc.pt_programs
  for select using (profile_id = auth.uid());

grant select, insert, update, delete on tmc.pt_programs to authenticated, service_role;

-- Defensieve replay-check: de programma-rijen bestaan al in de live
-- catalogus (WS-1-seed) en /12-weken-programma toont exact deze prijzen.
do $$
begin
  if not exists (select 1 from tmc.catalogue where slug = 'program_studio_12w' and kind = 'product')
     or not exists (select 1 from tmc.catalogue where slug = 'program_online_12w' and kind = 'product') then
    raise exception 'catalogus-rijen program_studio_12w/program_online_12w ontbreken';
  end if;
end $$;

-- ============================================================
-- 3. pt_sessions: duur, mode, programma-koppeling; pt_bookings: introducee
-- ============================================================

alter table tmc.pt_sessions
  add column duration_min int,
  add column mode text,
  add column program_id uuid references tmc.pt_programs(id);

update tmc.pt_sessions
set duration_min = greatest(1, round(extract(epoch from end_at - start_at) / 60)::int)
where duration_min is null;

alter table tmc.pt_sessions alter column duration_min set not null;
alter table tmc.pt_sessions
  add constraint pt_sessions_duration_check check (duration_min > 0),
  add constraint pt_sessions_duration_matches_check
    check (end_at = start_at + make_interval(mins => duration_min)),
  add constraint pt_sessions_mode_check check (mode is null or mode in ('studio', 'online'));

-- Duo blijft een (1) pt_booking; de introducee is een naam op de boeking,
-- geen tweede account of boeking.
alter table tmc.pt_bookings add column introducee_name text;

-- ============================================================
-- 4. Instellingen-helper en de gesplitste slot-check
-- ============================================================

create or replace function tmc.pt_trainer_settings(p_trainer_id uuid)
returns table (
  session_duration_min int,
  turnaround_min int,
  cancel_window_hours int
)
language sql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
  select
    coalesce(s.session_duration_min, 60),
    coalesce(s.turnaround_min, 15),
    coalesce(s.cancel_window_hours, 24)
  from (select 1) as one
  left join tmc.pt_settings s on s.trainer_id = p_trainer_id;
$function$;

-- Twee losse checks met twee losse uitkomsten:
-- - 'overlap': het interval snijdt een geplande sessie (elke kind; een
--   verlopen hold telt als vrij).
-- - 'no_turnaround': geen overlap, maar minder dan turnaround_min
--   afstand tot een buursessie met mensen (bookable, intake). Een block
--   is hard bezet zonder buffer, dus die doet alleen mee in 'overlap'.
-- De caller kan elk van beide checks apart uitzetten (de admin-overrides
-- p_allow_overlap en p_allow_no_turnaround); de check-volgorde is
-- overlap eerst, dus bij beide overtredingen wint 'overlap'.
create or replace function tmc.pt_check_slot(
  p_trainer_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_turnaround_min int,
  p_exclude_session uuid default null,
  p_check_overlap boolean default true,
  p_check_turnaround boolean default true
)
returns text
language plpgsql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
begin
  if p_start is null or p_end is null or p_end <= p_start then
    return 'overlap';
  end if;

  if p_check_overlap and exists (
    select 1 from tmc.pt_sessions s
    where s.trainer_id = p_trainer_id
      and s.status = 'scheduled'
      and (s.hold_expires_at is null or s.hold_expires_at > now())
      and (p_exclude_session is null or s.id <> p_exclude_session)
      and s.start_at < p_end and p_start < s.end_at
  ) then
    return 'overlap';
  end if;

  if p_check_turnaround and exists (
    select 1 from tmc.pt_sessions s
    where s.trainer_id = p_trainer_id
      and s.status = 'scheduled'
      and s.kind in ('bookable', 'intake')
      and (s.hold_expires_at is null or s.hold_expires_at > now())
      and (p_exclude_session is null or s.id <> p_exclude_session)
      and not (s.start_at < p_end and p_start < s.end_at)
      and (
        (s.end_at <= p_start and p_start - s.end_at < make_interval(mins => p_turnaround_min))
        or (p_end <= s.start_at and s.start_at - p_end < make_interval(mins => p_turnaround_min))
      )
  ) then
    return 'no_turnaround';
  end if;

  return null;
end;
$function$;

revoke execute on function tmc.pt_trainer_settings(uuid) from public;
revoke execute on function tmc.pt_check_slot(uuid, timestamptz, timestamptz, int, uuid, boolean, boolean) from public;

-- ============================================================
-- 5. admin_book_pt_for_member: vrije duur, overrides, introducee, recurring
-- ============================================================

-- Marlon boekt alles. Losse sessie of wekelijkse reeks (p_repeat_weeks),
-- vrije duur (p_duration_min, default de 60 uit pt_settings), duo met
-- introducee-naam, en twee onafhankelijke tijd-overrides met elk een
-- eigen foutcode: p_allow_overlap (pt_overlap) en p_allow_no_turnaround
-- (pt_no_turnaround). De overrides raken UITSLUITEND de tijdchecks;
-- credits en betaalmodus gelden onverkort.
--
-- Betaling: 'credits' (debit per sessie via de geauditeerde kern),
-- 'already_paid' (kas of pin), of 'payment_link' (order plus Mollie-link
-- in de TS-laag; in C1 alleen voor een losse sessie, niet voor een
-- reeks). Per-4-weken-achteraf is fase 2 en bestaat hier bewust niet.
create function tmc.admin_book_pt_for_member(
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
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
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
-- 6. admin_plan_pt_program: het volledige programma in een transactie
-- ============================================================

-- Studio: 24 sessies, 2x per week (twee wekelijkse ankers), 60 min,
-- mode studio. Online: 12 sessies, 1x per week, 30 min, mode online,
-- plus een fysieke beginmeting van 60 min mode studio die onderdeel is
-- van het programma (program_id gezet, geen aparte kosten) en niet
-- meetelt in de 12. Alles zit in de programmaprijs; geen creditverbruik.
-- Voortgang wordt afgeleid (bijgewoonde sessies met de programma-mode),
-- nooit als creditsaldo getoond.
--
-- Geen overrides hier: bij conflicten komt de volledige lijst terug
-- (reason pt_slot_conflicts) zodat Marlon de ankers verschuift.
create function tmc.admin_plan_pt_program(
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
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
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
-- 7. cancel_pt en reschedule_pt: hercreatie op het nieuwe model
-- ============================================================

-- Ongewijzigde kern uit PR A (lock, venster uit pt_settings, refund
-- uitsluitend door de geauditeerde kern, sessie vrijgeven i.p.v.
-- hard-delete), plus: trainer_id en format in het resultaat zodat de
-- TS-laag de trainer-notificatie kan sturen bij een lid-geinitieerde
-- annulering.
create or replace function tmc.cancel_pt(p_pt_booking_id uuid)
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
  v_refunded boolean := false;
  v_adjust jsonb;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select b.* into v_booking
  from tmc.pt_bookings b
  where b.id = p_pt_booking_id
    and (b.profile_id = v_uid or v_is_admin)
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

  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  select s.cancel_window_hours into v_cancel
  from tmc.pt_trainer_settings(v_session.trainer_id) s;

  v_within := v_session.start_at - now() >= make_interval(hours => v_cancel);

  if v_within and v_booking.status = 'booked' and v_booking.credits_used_from is not null then
    v_adjust := tmc.apply_credit_adjustment(
      v_booking.credits_used_from, 1, 'PT-annulering binnen venster', 'refund',
      case when v_is_admin and v_uid <> v_booking.profile_id then 'admin' else 'member' end,
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
$function$;

-- Eersteklas verzetten, nu met dezelfde twee tijd-overrides als het
-- boeken. De overrides zijn admin-only: een lid dat ze meestuurt krijgt
-- override_not_allowed. Lid: alleen binnen het cancel-venster van de
-- oorspronkelijke start. Admin: altijd. Duur blijft behouden
-- (duration_min van de sessie), de herinnering wordt gereset.
create function tmc.reschedule_pt(
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
  if not v_is_admin and (p_allow_overlap or p_allow_no_turnaround) then
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

-- ============================================================
-- 8. get_pt_busy: minimale gaten-helper voor de boek-UI (admin-only)
-- ============================================================

-- Bezette intervallen inclusief de omkleedtijd-buffer, zonder namen,
-- notes of prospect-data. De agenda zelf (PR D) leest pt_sessions
-- direct via de bestaande trainer- en admin-RLS; dit is alleen de
-- compacte vorm voor het Boek-voor-klant-scherm (PR C2).
create function tmc.get_pt_busy(
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
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
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
-- 9. Order-pipeline: programma's en sessie-gekoppelde orders
-- ============================================================

-- Hercreatie vanaf de live definitie met een (1) toevoeging:
-- p_admin_context. De programma-rijen zijn purchasable=false
-- (lead-items, niet zelf te kopen); alleen de admin-orderweg mag ze
-- verkopen. Alle overige logica is byte-voor-byte de live versie.
create function tmc._compute_order_price(
  p_slug text,
  p_extended_access boolean,
  p_commit_24m boolean,
  p_early_member boolean,
  p_admin_context boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_row tmc.catalogue%rowtype;
  v_ext tmc.catalogue%rowtype;
  v_fee tmc.catalogue%rowtype;
  v_deadline timestamptz;
  v_phase_open boolean;
  v_em_active boolean;
  v_kind text;
  v_base_price integer;
  v_commit_months integer;
  v_ext_price integer := 0;
  v_ext_flag boolean := false;
  v_fee_cents integer := 0;
  v_fee_waiver text := null;
  v_lock boolean := false;
  v_recurring integer;
  v_first_charge integer;
begin
  select * into v_row from tmc.catalogue where slug = p_slug and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'catalogue_row_not_found');
  end if;

  -- De 12-weken-programma's zijn bewust purchasable=false (geen
  -- zelfbediening); via de admin-context zijn ze wel als order te
  -- verkopen. De prijs blijft uit dezelfde catalogus-rij komen die
  -- /12-weken-programma toont: display is gelijk aan charge.
  if not v_row.purchasable
     and not (p_admin_context and v_row.slug in ('program_studio_12w', 'program_online_12w')) then
    return jsonb_build_object('ok', false, 'reason', 'not_purchasable');
  end if;

  if v_row.kind not in ('plan', 'product') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  end if;

  v_kind := case when v_row.kind = 'plan' then 'subscription' else 'product' end;

  -- Campaign phase, read fresh in this transaction (never the ISR-cached
  -- value). Condition 1: p_early_member is intent only. It becomes
  -- authoritative (v_em_active) only when the row is EM-eligible AND the
  -- phase is open right now; otherwise it is silently ignored -- never an
  -- error, never a price lever on its own.
  v_deadline := tmc.get_campaign_deadline();
  v_phase_open := v_deadline is not null and now() < v_deadline;
  v_em_active := p_early_member and v_row.early_member_eligible and v_phase_open;

  if v_kind = 'subscription' then
    if v_em_active and p_commit_24m then
      return jsonb_build_object('ok', false, 'reason', 'em_and_24m_exclusive');
    end if;
    if p_commit_24m and v_row.price_cents_24m_computed is null then
      return jsonb_build_object('ok', false, 'reason', 'commit_24m_not_offered');
    end if;

    if p_extended_access then
      if v_row.extended_access_mode = 'addon' then
        select * into v_ext from tmc.catalogue where slug = 'extended_access' and kind = 'addon' and is_active = true;
        if not found then
          raise exception 'extended_access catalogue row missing' using errcode = 'P0001';
        end if;
        v_ext_price := v_ext.price_cents;
        v_ext_flag := true;
      elsif v_row.extended_access_mode = 'included' then
        v_ext_price := 0;
        v_ext_flag := true;
      else
        return jsonb_build_object('ok', false, 'reason', 'extended_access_not_available');
      end if;
    elsif v_row.extended_access_mode = 'included' then
      v_ext_flag := true;
      v_ext_price := 0;
    end if;

    if v_em_active then
      v_base_price := coalesce(v_row.early_member_price_cents, v_row.price_cents);
      v_commit_months := coalesce(v_row.early_member_commit_months, 0);
      v_lock := v_row.early_member_price_lock;
    elsif p_commit_24m then
      v_base_price := v_row.price_cents_24m_computed;
      v_commit_months := 24;
      v_lock := false;
    else
      v_base_price := v_row.price_cents;
      v_commit_months := v_row.commit_months;
      v_lock := false;
    end if;

    select * into v_fee from tmc.catalogue where slug = 'signup_fee' and kind = 'fee' and is_active = true;
    if not found then
      raise exception 'signup_fee catalogue row missing' using errcode = 'P0001';
    end if;
    if v_em_active then
      v_fee_cents := coalesce(v_fee.early_member_price_cents, 0);
      v_fee_waiver := 'early_member';
    else
      v_fee_cents := v_fee.price_cents;
    end if;

    v_recurring := v_base_price + v_ext_price;
    v_first_charge := v_recurring + v_fee_cents;

    return jsonb_build_object(
      'ok', true,
      'kind', v_kind,
      'family', v_row.family,
      'frequency_cap', v_row.frequency_cap,
      'age_category', v_row.age_category,
      'covered_pillars', to_jsonb(v_row.covered_pillars),
      'catalogue', to_jsonb(v_row),
      'deadline', v_deadline,
      'phase_open', v_phase_open,
      'em_active', v_em_active,
      'commit_24m_requested', p_commit_24m,
      'base_price_cents', v_base_price,
      'extended_access', v_ext_flag,
      'extended_access_price_cents', v_ext_price,
      'signup_fee_cents', v_fee_cents,
      'signup_fee_waiver', v_fee_waiver,
      'first_charge_cents', v_first_charge,
      'recurring_cents', v_recurring,
      'billing_cycle_weeks', v_row.billing_cycle_weeks,
      'commit_months', v_commit_months,
      'early_member_price_lock', v_lock
    );
  else
    if p_extended_access or p_commit_24m or p_early_member then
      return jsonb_build_object('ok', false, 'reason', 'invalid_product_options');
    end if;

    -- Whitelist van online verkoopbare producten. Alles wat hier niet in
    -- staat (drop_in*, toekomstige lead-items) kan geen order worden;
    -- activate_order heeft dezelfde set als defensieve tweede laag.
    -- De 12-weken-programma's mogen uitsluitend via de admin-context.
    if not (v_row.slug like 'ten_ride_card%'
            or v_row.slug in ('pt_single', 'pt_10', 'duo_single', 'duo_10')
            or (p_admin_context and v_row.slug in ('program_studio_12w', 'program_online_12w'))) then
      return jsonb_build_object('ok', false, 'reason', 'product_not_supported');
    end if;

    return jsonb_build_object(
      'ok', true,
      'kind', v_kind,
      'family', v_row.family,
      'age_category', v_row.age_category,
      'credits', v_row.credits,
      'validity_months', v_row.validity_months,
      'catalogue', to_jsonb(v_row),
      'deadline', v_deadline,
      'phase_open', v_phase_open,
      'em_active', false,
      'commit_24m_requested', false,
      'base_price_cents', v_row.price_cents,
      'extended_access', false,
      'extended_access_price_cents', 0,
      'signup_fee_cents', 0,
      'signup_fee_waiver', null,
      'first_charge_cents', v_row.price_cents,
      'recurring_cents', null,
      'billing_cycle_weeks', null,
      'commit_months', null,
      'early_member_price_lock', false
    );
  end if;
end;
$function$;

-- Hercreatie vanaf de live definitie met twee toevoegingen:
-- p_pt_session_id (koppelt een betaallink-order aan een al geboekte
-- PT-sessie zodat activate_order er geen credit-membership van maakt) en
-- p_admin_context := true richting _compute_order_price (programma's).
-- Alle overige logica is byte-voor-byte de live versie.
create function tmc.admin_create_order(
  p_profile_id uuid,
  p_slug text,
  p_extended_access boolean default false,
  p_commit_24m boolean default false,
  p_early_member boolean default false,
  p_waive_signup_fee boolean default false,
  p_expires_in_days integer default 7,
  p_pt_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_admin_uid uuid := auth.uid();
  v_pricing jsonb;
  v_existing_id uuid;
  v_order tmc.orders%rowtype;
  v_fee_cents integer;
  v_fee_waiver text;
  v_first_charge integer;
  v_expires_days integer;
begin
  -- DB-level gate. The calling server action additionally runs
  -- requireAdmin() in TS before this is ever invoked (defense in depth,
  -- same layering as tmc.reserve_early_member_slot).
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  if p_profile_id is null then
    raise exception 'p_profile_id is verplicht.' using errcode = '22004';
  end if;

  if not exists (select 1 from tmc.profiles where id = p_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  if p_pt_session_id is not null
     and not exists (select 1 from tmc.pt_sessions where id = p_pt_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'pt_session_not_found');
  end if;

  -- Same helper as create_order: admin cannot reach a different price than
  -- self-service for the same selection.
  v_pricing := tmc._compute_order_price(p_slug, p_extended_access, p_commit_24m, p_early_member, true);
  if not (v_pricing->>'ok')::boolean then
    return v_pricing;
  end if;

  if v_pricing->>'kind' = 'subscription' then
    select id into v_existing_id
    from tmc.memberships
    where profile_id = p_profile_id
      and status in ('pending', 'active', 'paused', 'cancellation_requested')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_membership');
    end if;

    select id into v_existing_id
    from tmc.orders
    where profile_id = p_profile_id and kind = 'subscription' and status in ('draft', 'pending')
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'reason', 'existing_open_order', 'order_id', v_existing_id);
    end if;
  end if;

  -- Overstap waiver: manual, admin-only. The Early Member waiver (already
  -- zero in v_pricing when em_active) always wins; overstap only applies
  -- when EM did not already zero the fee -- an order never carries two
  -- waiver reasons.
  v_fee_cents := (v_pricing->>'signup_fee_cents')::integer;
  v_fee_waiver := v_pricing->>'signup_fee_waiver';
  if p_waive_signup_fee and v_fee_waiver is null then
    v_fee_cents := 0;
    v_fee_waiver := 'overstap';
  end if;

  v_first_charge := (v_pricing->>'base_price_cents')::integer
    + (v_pricing->>'extended_access_price_cents')::integer
    + v_fee_cents;

  -- Payment links live longer than an inline checkout; clamp to a sane
  -- range regardless of what the caller passes.
  v_expires_days := greatest(1, least(14, coalesce(p_expires_in_days, 7)));

  insert into tmc.orders (
    profile_id, kind, catalogue_slug, extended_access, commit_months, early_member,
    pt_session_id,
    base_price_cents, extended_access_price_cents, signup_fee_cents,
    first_charge_cents, recurring_cents, billing_cycle_weeks,
    early_member_price_lock, signup_fee_waiver,
    pricing_snapshot, created_by, created_by_profile_id, status, expires_at
  ) values (
    p_profile_id,
    v_pricing->>'kind',
    p_slug,
    (v_pricing->>'extended_access')::boolean,
    (v_pricing->>'commit_months')::integer,
    (v_pricing->>'em_active')::boolean,
    p_pt_session_id,
    (v_pricing->>'base_price_cents')::integer,
    (v_pricing->>'extended_access_price_cents')::integer,
    v_fee_cents,
    v_first_charge,
    (v_pricing->>'recurring_cents')::integer,
    (v_pricing->>'billing_cycle_weeks')::integer,
    (v_pricing->>'early_member_price_lock')::boolean,
    v_fee_waiver,
    v_pricing || jsonb_build_object('waive_signup_fee_requested', p_waive_signup_fee),
    'admin', v_admin_uid, 'draft', now() + make_interval(days => v_expires_days)
  )
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'token', v_order.token,
    'first_charge_cents', v_order.first_charge_cents,
    'recurring_cents', v_order.recurring_cents,
    'signup_fee_cents', v_order.signup_fee_cents,
    'extended_access_price_cents', v_order.extended_access_price_cents,
    'commit_months', v_order.commit_months,
    'early_member', v_order.early_member,
    'expires_at', v_order.expires_at
  );
end;
$function$;

-- Hercreatie vanaf de live definitie met een (1) nieuwe tak: een
-- PT-order (pt_session_id gezet, of een programma-slug) activeert
-- ZONDER membership. Het geld betaalt een al geboekte sessie of een
-- programma; er mag nooit een credit-rij uit ontstaan. Alle overige
-- logica (subscription-tak, product-whitelist, betaling-wint-van-
-- annuleren, idempotentie onder de rijlock) is byte-voor-byte de live
-- versie.
create or replace function tmc.activate_order(p_order_id uuid, p_mollie_payment_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_order tmc.orders%rowtype;
  v_payment_linked boolean;
  v_existing_id uuid;
  v_membership_id uuid;
  v_source text;
  v_plan_type text;
  v_credits integer;
  v_validity_months integer;
  v_age_category text;
  v_is_pt_order boolean;
  v_now timestamptz := now();
  v_today date := current_date;
begin
  if auth.uid() is not null then
    raise exception 'activate_order is service-role only.' using errcode = '42501';
  end if;

  select * into v_order from tmc.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  v_is_pt_order := v_order.pt_session_id is not null
    or v_order.catalogue_slug in ('program_studio_12w', 'program_online_12w');

  v_payment_linked := v_order.mollie_payment_id = p_mollie_payment_id
    or exists (
      select 1 from tmc.payments
      where order_id = v_order.id and mollie_payment_id = p_mollie_payment_id
    );
  if not v_payment_linked then
    return jsonb_build_object('ok', false, 'reason', 'payment_order_mismatch');
  end if;

  if v_order.status = 'activated' then
    return jsonb_build_object(
      'ok', true,
      'already_activated', true,
      'needs_subscription', v_order.kind = 'subscription'
        and v_order.membership_id is not null
        and not exists (
          select 1 from tmc.memberships
          where id = v_order.membership_id and mollie_subscription_id is not null
        ),
      'membership_id', v_order.membership_id,
      'recurring_cents', v_order.recurring_cents,
      'billing_cycle_weeks', v_order.billing_cycle_weeks,
      'mollie_customer_id', v_order.mollie_customer_id,
      'pt_order', v_is_pt_order
    );
  end if;

  -- PR 2: 'cancelled' wordt gehonoreerd zoals 'expired' (betaling wint van
  -- annuleren, zelfde patroon als de late betaling). 'draft' blijft bewust
  -- geweigerd: een payment ontstaat pas na markOrderPending.
  if v_order.status not in ('pending', 'expired', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_order.status);
  end if;

  if v_order.kind = 'subscription' then
    select id into v_existing_id
    from tmc.memberships
    where profile_id = v_order.profile_id
      and status in ('pending', 'active', 'paused', 'cancellation_requested')
    limit 1;
    if found then
      -- Condition 2: money in, no second mandate. blocked_reason is the
      -- persistent "why" marker (new); the caller (webhook) alerts on the
      -- returned reason the moment this happens.
      update tmc.orders
      set status = 'paid', paid_at = v_now, blocked_reason = 'duplicate_membership'
      where id = v_order.id;
      return jsonb_build_object('ok', false, 'reason', 'blocked_duplicate_membership', 'existing_membership_id', v_existing_id);
    end if;

    v_source := case
      when v_order.early_member then 'early_member'
      when v_order.created_by = 'admin' then 'admin_manual'
      else 'direct'
    end;

    insert into tmc.memberships (
      profile_id, plan_type, plan_variant, frequency_cap, age_category,
      price_per_cycle_cents, billing_cycle_weeks, commit_months,
      start_date, status, mollie_customer_id, covered_pillars, source,
      extended_access, extended_access_price_cents, registration_fee_paid,
      lock_in_active, lock_in_source, lock_in_price_cents
    )
    select
      v_order.profile_id, c.family, c.slug, c.frequency_cap, c.age_category,
      v_order.base_price_cents, v_order.billing_cycle_weeks, v_order.commit_months,
      v_today, 'active', v_order.mollie_customer_id, c.covered_pillars, v_source,
      v_order.extended_access, v_order.extended_access_price_cents, true,
      v_order.early_member_price_lock,
      case when v_order.early_member_price_lock then 'early_member' else null end,
      case when v_order.early_member_price_lock
        then v_order.base_price_cents + v_order.extended_access_price_cents
        else null end
    from tmc.catalogue c
    where c.slug = v_order.catalogue_slug
    returning id into v_membership_id;
  elsif v_is_pt_order then
    -- PT-agenda C1: het geld betaalt een al geboekte PT-sessie of een
    -- 12-weken-programma. Geen membership, geen credits; de sessie(s)
    -- en het pt_programs-record bestaan al (payment_ref = deze order).
    v_membership_id := null;
  else
    -- Expliciete slug-naar-plan_type-mapping, zelfde whitelist als
    -- _compute_order_price. De else-tak is de defensieve paid-block:
    -- geld is binnen (webhook-context) maar er mag geen verkeerd
    -- geclassificeerde credit-rij ontstaan. Zelfde patroon als
    -- duplicate_membership hierboven; de webhook alert op de reason.
    v_plan_type := case
      when v_order.catalogue_slug like 'ten_ride_card%' then 'ten_ride_card'
      when v_order.catalogue_slug in ('pt_single', 'pt_10', 'duo_single', 'duo_10') then 'pt_package'
      else null
    end;
    if v_plan_type is null then
      update tmc.orders
      set status = 'paid', paid_at = v_now, blocked_reason = 'product_not_supported'
      where id = v_order.id;
      return jsonb_build_object('ok', false, 'reason', 'blocked_product_not_supported');
    end if;

    select credits, validity_months, age_category into v_credits, v_validity_months, v_age_category
    from tmc.catalogue where slug = v_order.catalogue_slug;

    insert into tmc.memberships (
      profile_id, plan_type, plan_variant, age_category,
      price_per_cycle_cents, billing_cycle_weeks, commit_months,
      start_date, status, source,
      credits_total, credits_remaining, credits_expires_at,
      registration_fee_paid
    ) values (
      v_order.profile_id,
      v_plan_type,
      v_order.catalogue_slug,
      v_age_category,
      v_order.base_price_cents, 0, 0,
      v_today, 'active',
      case when v_order.created_by = 'admin' then 'admin_manual' else 'direct' end,
      coalesce(v_credits, 1), coalesce(v_credits, 1),
      case when v_validity_months is not null then v_today + make_interval(months => v_validity_months) else null end,
      true
    )
    returning id into v_membership_id;
  end if;

  update tmc.orders
  set status = 'activated', paid_at = coalesce(paid_at, v_now), activated_at = v_now,
      membership_id = v_membership_id
  where id = v_order.id;

  -- PR 2: late_payment dekt nu ook de gehonoreerde betaling op een
  -- geannuleerde order; cancelled_at blijft staan als audit-spoor.
  return jsonb_build_object(
    'ok', true,
    'already_activated', false,
    'needs_subscription', v_order.kind = 'subscription',
    'membership_id', v_membership_id,
    'recurring_cents', v_order.recurring_cents,
    'billing_cycle_weeks', v_order.billing_cycle_weeks,
    'mollie_customer_id', v_order.mollie_customer_id,
    'late_payment', v_order.status in ('expired', 'cancelled'),
    'pt_order', v_is_pt_order
  );
end;
$function$;

-- ============================================================
-- 10. Grants
-- ============================================================

revoke execute on function tmc.admin_book_pt_for_member(uuid, uuid, timestamptz, text, text, int, text, boolean, boolean, int) from public;
revoke execute on function tmc.admin_plan_pt_program(uuid, uuid, text, timestamptz, timestamptz, timestamptz, text) from public;
revoke execute on function tmc.reschedule_pt(uuid, timestamptz, boolean, boolean) from public;
revoke execute on function tmc.get_pt_busy(uuid, timestamptz, timestamptz) from public;
revoke execute on function tmc._compute_order_price(text, boolean, boolean, boolean, boolean) from public;
revoke execute on function tmc.admin_create_order(uuid, text, boolean, boolean, boolean, boolean, integer, uuid) from public;

grant execute on function tmc.admin_book_pt_for_member(uuid, uuid, timestamptz, text, text, int, text, boolean, boolean, int) to authenticated, service_role;
grant execute on function tmc.admin_plan_pt_program(uuid, uuid, text, timestamptz, timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function tmc.reschedule_pt(uuid, timestamptz, boolean, boolean) to authenticated, service_role;
grant execute on function tmc.get_pt_busy(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function tmc.admin_create_order(uuid, text, boolean, boolean, boolean, boolean, integer, uuid) to authenticated, service_role;

commit;
