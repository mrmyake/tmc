-- PT-agenda PR A: het fundament (spec-pt-agenda.md, PR #99).
-- Virtuele beschikbaarheid plus aanmaken-bij-boeken: pt_sessions bevat
-- alleen echte afspraken; vrije slots worden berekend, nooit
-- gematerialiseerd. De boek-RPC's worden herbouwd van neem-een-bestaande-
-- sessie naar maak-en-boek atomair onder een advisory lock.
--
-- Live geverifieerd op 2026-07-14 (pg_get_functiondef, pg_policies,
-- information_schema):
-- - pt_sessions en pt_bookings zijn leeg (0 rijen, nooit geseed), dus
--   constraints en kolommen kunnen vrij herschikt worden.
-- - Het intake-korting-pad (4500) bestaat in geen enkele live functie
--   meer; alleen de dode kolommen pt_bookings.is_intake_discount en
--   profiles.has_used_pt_intake_discount resteren. Die gaan hier weg.
-- - adjust_membership_credits (migratie 20260722) koppelt refund-via-
--   booking aan tmc.bookings; de geauditeerde kern wordt hier
--   bron-agnostisch gemaakt (tmc_booking of pt_booking) zonder een
--   zesde ongeauditeerd credit-pad te openen.
-- - opening_hours gebruikt weekday smallint met 0 = zondag; de
--   PT-vensters volgen dezelfde conventie.
--
-- Schema strak op tmc; public en tvmuur onaangeroerd; 20260503_gallery
-- onaangeroerd. Tijdzone voor venster-berekening: Europe/Amsterdam.

begin;

-- ============================================================
-- 1. pt_sessions: kind, prospect-velden, hold
-- ============================================================

alter table tmc.pt_sessions
  add column kind text not null default 'bookable',
  add column prospect_name text,
  add column prospect_email text,
  add column prospect_phone text,
  add column hold_expires_at timestamptz;

alter table tmc.pt_sessions
  add constraint pt_sessions_kind_check
  check (kind in ('bookable', 'intake', 'block'));

-- format is alleen betekenisvol voor boekbare sessies; intake en block
-- hebben er geen. De waardenset blijft ongewijzigd (small_group_4 blijft
-- in het schema, geparkeerd, geen boekingspad).
alter table tmc.pt_sessions alter column format drop not null;
alter table tmc.pt_sessions drop constraint pt_sessions_format_check;
alter table tmc.pt_sessions
  add constraint pt_sessions_format_check
  check (format is null or format in ('one_on_one', 'duo', 'small_group_4'));
alter table tmc.pt_sessions
  add constraint pt_sessions_kind_format_check
  check (
    (kind = 'bookable' and format is not null)
    or (kind in ('intake', 'block') and format is null)
  );

-- Prospect-PII hoort alleen bij een intake (account-loos: naam, e-mail,
-- telefoon op de sessie zelf).
alter table tmc.pt_sessions
  add constraint pt_sessions_prospect_only_intake
  check (
    kind = 'intake'
    or (prospect_name is null and prospect_email is null and prospect_phone is null)
  );

-- De slot-berekening en de boek-validatie scannen op trainer plus tijd;
-- de bestaande baseline-index pt_sessions_trainer_start_idx
-- (trainer_id, start_at) dekt dat al.

-- ============================================================
-- 2. pt_bookings: pending-status, reminder, refund-guard; dode kolom weg
-- ============================================================

alter table tmc.pt_bookings
  add column reminder_sent_at timestamptz,
  add column credits_refunded_at timestamptz;

-- credits_refunded_at is de dubbel-refund-guard van de geauditeerde
-- credit-kern voor pt_bookings, het spiegelbeeld van bookings.credits_used
-- dat op 0 gezet wordt: refund alleen als de stempel nog leeg is, stempel
-- en saldo-mutatie in dezelfde transactie.

alter table tmc.pt_bookings drop column is_intake_discount;

-- 'pending' is de hold-status van het create-on-book-betaalpad: sessie
-- plus boeking bestaan al, de Mollie-betaling nog niet. De webhook flipt
-- naar 'booked'; de cleanup-cron ruimt verlopen holds op.
alter table tmc.pt_bookings drop constraint pt_bookings_status_check;
alter table tmc.pt_bookings
  add constraint pt_bookings_status_check
  check (status in ('pending', 'booked', 'cancelled', 'attended', 'no_show'));

-- ============================================================
-- 3. profiles: dode intake-korting-vlag weg
-- ============================================================

alter table tmc.profiles drop column has_used_pt_intake_discount;

-- ============================================================
-- 4. Beschikbaarheid: vensters, uitzonderingen, instellingen
-- ============================================================

-- weekday: 0 = zondag t/m 6 = zaterdag, zelfde conventie als
-- tmc.opening_hours (live geverifieerd). Meerdere vensters per dag mogen
-- (ochtend plus avond); overlappende vensters zijn aan de UI (PR B) om
-- te voorkomen.
create table tmc.pt_availability_windows (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references tmc.trainers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint pt_availability_windows_order_check check (start_time < end_time)
);

create index pt_availability_windows_trainer_idx
  on tmc.pt_availability_windows (trainer_id, weekday);

-- free = de hele dag dicht (tijden worden genegeerd); extra = een extra
-- venster op een specifieke datum, buiten het weekpatroon om.
create table tmc.pt_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references tmc.trainers(id) on delete cascade,
  date date not null,
  type text not null check (type in ('free', 'extra')),
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  constraint pt_availability_exceptions_extra_times_check
    check (type <> 'extra' or (start_time is not null and end_time is not null and start_time < end_time))
);

create index pt_availability_exceptions_trainer_date_idx
  on tmc.pt_availability_exceptions (trainer_id, date);

create table tmc.pt_settings (
  trainer_id uuid primary key references tmc.trainers(id) on delete cascade,
  session_duration_min int not null default 60,
  turnaround_min int not null default 15,
  booking_horizon_days int not null default 56,
  cancel_window_hours int not null default 24,
  updated_at timestamptz not null default now()
);

-- RLS: admin alles, trainer eigen rijen, leden geen directe read (vrije
-- tijd loopt uitsluitend via get_pt_free_slots).
alter table tmc.pt_availability_windows enable row level security;
alter table tmc.pt_availability_exceptions enable row level security;
alter table tmc.pt_settings enable row level security;

create policy pt_availability_windows_admin_all on tmc.pt_availability_windows
  for all using (tmc.is_admin()) with check (tmc.is_admin());
create policy pt_availability_windows_trainer_own on tmc.pt_availability_windows
  for all
  using (tmc.is_trainer() and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid()))
  with check (tmc.is_trainer() and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid()));

create policy pt_availability_exceptions_admin_all on tmc.pt_availability_exceptions
  for all using (tmc.is_admin()) with check (tmc.is_admin());
create policy pt_availability_exceptions_trainer_own on tmc.pt_availability_exceptions
  for all
  using (tmc.is_trainer() and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid()))
  with check (tmc.is_trainer() and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid()));

create policy pt_settings_admin_all on tmc.pt_settings
  for all using (tmc.is_admin()) with check (tmc.is_admin());
create policy pt_settings_trainer_own on tmc.pt_settings
  for all
  using (tmc.is_trainer() and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid()))
  with check (tmc.is_trainer() and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid()));

-- Geen grants voor anon: die heeft hier niets te zoeken.
grant select, insert, update, delete on tmc.pt_availability_windows to authenticated, service_role;
grant select, insert, update, delete on tmc.pt_availability_exceptions to authenticated, service_role;
grant select, insert, update, delete on tmc.pt_settings to authenticated, service_role;

-- ============================================================
-- 5. RLS op pt_sessions: leden lezen nooit meer direct
-- ============================================================

-- pt_sessions_authed_read liet elke ingelogde alle sessies lezen,
-- inclusief notes en (vanaf nu) prospect-PII van intakes. Weg ermee:
-- vrije tijd komt uitsluitend uit get_pt_free_slots (alleen tijden).
drop policy pt_sessions_authed_read on tmc.pt_sessions;

-- Eigen afspraak blijft leesbaar: /app/pt/bedankt en straks
-- /app/boekingen joinen de sessie via de eigen boeking. Dat is geen
-- "direct lezen" van andermans agenda; prospect-velden zijn op een
-- bookable sessie per constraint leeg.
create policy pt_sessions_member_booked_read on tmc.pt_sessions
  for select using (
    exists (
      select 1 from tmc.pt_bookings b
      where b.pt_session_id = pt_sessions.id and b.profile_id = auth.uid()
    )
  );

-- pt_sessions_trainer_own had geen with_check, waardoor een trainer een
-- sessie via UPDATE naar een andere trainer kon verhangen.
drop policy pt_sessions_trainer_own on tmc.pt_sessions;
create policy pt_sessions_trainer_own on tmc.pt_sessions
  for all
  using (tmc.is_trainer() and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid()))
  with check (tmc.is_trainer() and trainer_id in (select t.id from tmc.trainers t where t.profile_id = auth.uid()));

-- Defense-in-depth: anon had volledige table-grants op beide pt-tabellen
-- met RLS als enige barriere.
revoke all on tmc.pt_sessions from anon;
revoke all on tmc.pt_bookings from anon;

-- ============================================================
-- 6. Interne helpers: instellingen en slot-validatie
-- ============================================================

-- Effectieve instellingen per trainer, met defaults als er geen
-- pt_settings-rij is.
create or replace function tmc.pt_trainer_settings(p_trainer_id uuid)
returns table (
  session_duration_min int,
  turnaround_min int,
  booking_horizon_days int,
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
    coalesce(s.booking_horizon_days, 56),
    coalesce(s.cancel_window_hours, 24)
  from (select 1) as one
  left join tmc.pt_settings s on s.trainer_id = p_trainer_id;
$function$;

-- Is [p_start, p_end) een geldig vrij slot voor deze trainer?
-- Venster-regel (spec paragraaf 5, start-in-venster-semantiek): de
-- STARTtijd moet binnen een effectief venster liggen. Effectief =
-- weekpatroon plus extra-uitzonderingen, tenzij de dag dicht is (free).
-- Conflict-regel: geen overlap met een geplande sessie (een verlopen
-- hold telt als vrij), en minimaal turnaround afstand tot buursessies
-- met mensen (bookable, intake); een block is hard bezet zonder buffer.
create or replace function tmc.pt_slot_is_free(
  p_trainer_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_turnaround_min int,
  p_exclude_session uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_local timestamp := p_start at time zone 'Europe/Amsterdam';
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_in_window boolean;
begin
  if p_start is null or p_end is null or p_end <= p_start then
    return false;
  end if;

  -- Dag dicht?
  if exists (
    select 1 from tmc.pt_availability_exceptions e
    where e.trainer_id = p_trainer_id and e.date = v_date and e.type = 'free'
  ) then
    return false;
  end if;

  select exists (
    select 1 from tmc.pt_availability_windows w
    where w.trainer_id = p_trainer_id
      and w.weekday = extract(dow from v_date)::smallint
      and v_time >= w.start_time and v_time < w.end_time
    union all
    select 1 from tmc.pt_availability_exceptions e
    where e.trainer_id = p_trainer_id and e.date = v_date and e.type = 'extra'
      and v_time >= e.start_time and v_time < e.end_time
  ) into v_in_window;

  if not v_in_window then
    return false;
  end if;

  return not exists (
    select 1 from tmc.pt_sessions s
    where s.trainer_id = p_trainer_id
      and s.status = 'scheduled'
      and (s.hold_expires_at is null or s.hold_expires_at > now())
      and (p_exclude_session is null or s.id <> p_exclude_session)
      and (
        case when s.kind in ('bookable', 'intake')
          then not (
            p_start >= s.end_at + make_interval(mins => p_turnaround_min)
            or s.start_at >= p_end + make_interval(mins => p_turnaround_min)
          )
          else not (p_start >= s.end_at or s.start_at >= p_end)
        end
      )
  );
end;
$function$;

-- ============================================================
-- 7. Geauditeerde credit-kern, bron-agnostisch
-- ============================================================

-- De kern uit migratie 20260722, gegeneraliseerd: de booking-gekoppelde
-- refund werkt nu voor tmc.bookings ('tmc_booking', bestaand gedrag:
-- credits_used naar 0) en tmc.pt_bookings ('pt_booking', nieuw:
-- credits_refunded_at gestempeld). Zelfde transactionele garanties:
-- row lock op de membership, dubbel-refund onmogelijk, audit-event
-- credits.adjusted in dezelfde transactie.
--
-- GEEN auth-guard hier: dit is de interne kern. EXECUTE is ingetrokken
-- voor anon en authenticated; alleen service_role en de SECURITY
-- DEFINER-functies in dit bestand komen erbij. De publieke poort blijft
-- tmc.adjust_membership_credits (service-role only, ongewijzigd
-- contract plus een optionele p_booking_source).
create or replace function tmc.apply_credit_adjustment(
  p_membership_id uuid,
  p_delta integer,
  p_reason text,
  p_source text,
  p_actor_type text,
  p_actor_id uuid default null,
  p_booking_id uuid default null,
  p_booking_source text default 'tmc_booking'
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_membership tmc.memberships%rowtype;
  v_booking tmc.bookings%rowtype;
  v_pt_booking tmc.pt_bookings%rowtype;
  v_previous integer;
  v_new integer;
begin
  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_delta');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_reason');
  end if;
  -- 'booking' is nieuw: de debit bij het boeken van een PT-sessie loopt
  -- nu ook door deze kern in plaats van een losse inline decrement.
  if p_source is null or p_source not in ('check_in', 'refund', 'manual', 'session_cancelled', 'booking') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_source');
  end if;
  if p_actor_type is null or p_actor_type not in ('member', 'admin', 'trainer', 'system', 'tablet', 'visitor') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_actor_type');
  end if;
  if p_booking_source is null or p_booking_source not in ('tmc_booking', 'pt_booking') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_booking_source');
  end if;
  -- Een booking-ref hoort alleen bij een refund: het koppelt de teruggave
  -- aan de boeking waarvan de credits terugkomen.
  if p_booking_id is not null and p_delta <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_booking_refund');
  end if;

  -- Lock op de membership-rij: check en mutatie zijn atomair.
  select * into v_membership
  from tmc.memberships
  where id = p_membership_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_membership.plan_type not in ('ten_ride_card', 'pt_package') then
    return jsonb_build_object('ok', false, 'reason', 'not_a_credit_plan');
  end if;

  -- Debit alleen op een actief pakket; een refund mag ook op een
  -- inmiddels opgezegde of verlopen rij landen.
  if p_delta < 0 and v_membership.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'membership_not_active');
  end if;

  -- Debit alleen op een niet-verlopen kaart (expiry-afdwinging, 20260723).
  if p_delta < 0
     and v_membership.credits_expires_at is not null
     and v_membership.credits_expires_at < current_date then
    return jsonb_build_object('ok', false, 'reason', 'credits_expired');
  end if;

  -- Booking-gekoppelde refund: lock de boeking mee en maak de
  -- dubbel-refund onmogelijk binnen dezelfde transactie.
  if p_booking_id is not null and p_booking_source = 'tmc_booking' then
    select * into v_booking
    from tmc.bookings
    where id = p_booking_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
    end if;
    if coalesce(v_booking.credits_used, 0) = 0 then
      return jsonb_build_object('ok', false, 'reason', 'already_refunded');
    end if;
    if v_booking.membership_id is distinct from p_membership_id then
      return jsonb_build_object('ok', false, 'reason', 'booking_membership_mismatch');
    end if;
    if p_delta <> v_booking.credits_used then
      return jsonb_build_object('ok', false, 'reason', 'delta_mismatch');
    end if;

    update tmc.bookings
    set credits_used = 0
    where id = p_booking_id;
  elsif p_booking_id is not null and p_booking_source = 'pt_booking' then
    select * into v_pt_booking
    from tmc.pt_bookings
    where id = p_booking_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
    end if;
    if v_pt_booking.credits_used_from is null then
      return jsonb_build_object('ok', false, 'reason', 'not_a_credit_booking');
    end if;
    if v_pt_booking.credits_used_from is distinct from p_membership_id then
      return jsonb_build_object('ok', false, 'reason', 'booking_membership_mismatch');
    end if;
    if v_pt_booking.credits_refunded_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'already_refunded');
    end if;
    -- Een PT-boeking kost altijd precies 1 credit.
    if p_delta <> 1 then
      return jsonb_build_object('ok', false, 'reason', 'delta_mismatch');
    end if;

    update tmc.pt_bookings
    set credits_refunded_at = now()
    where id = p_booking_id;
  end if;

  v_previous := coalesce(v_membership.credits_remaining, 0);
  v_new := v_previous + p_delta;
  if v_new < 0 then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_credits', 'previous_balance', v_previous);
  end if;

  update tmc.memberships
  set credits_remaining = v_new
  where id = p_membership_id;

  -- Audit-event in dezelfde transactie: geen saldo-mutatie zonder spoor,
  -- geen spoor zonder mutatie.
  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'credits.adjusted',
    p_actor_type,
    p_actor_id,
    'membership',
    p_membership_id,
    jsonb_build_object(
      'profile_id', v_membership.profile_id,
      'membership_id', p_membership_id,
      'delta', p_delta,
      'previous_balance', v_previous,
      'new_balance', v_new,
      'source', p_source,
      'reason', trim(p_reason),
      'booking_id', p_booking_id,
      'booking_source', case when p_booking_id is null then null else p_booking_source end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'previous_balance', v_previous,
    'new_balance', v_new
  );
end;
$function$;

-- Interne functies: geen enkele client-rol mag ze direct aanroepen.
-- Revoke van PUBLIC haalt de default-grant weg; SECURITY DEFINER-functies
-- in dit bestand draaien als owner en mogen er dus nog steeds bij.
revoke execute on function tmc.apply_credit_adjustment(uuid, integer, text, text, text, uuid, uuid, text) from public;
revoke execute on function tmc.pt_trainer_settings(uuid) from public;
revoke execute on function tmc.pt_slot_is_free(uuid, timestamptz, timestamptz, int, uuid) from public;

-- De publieke poort: zelfde service-role-only guard als voorheen, nu een
-- dunne wrapper om de kern. De extra parameter heeft een default, dus
-- alle bestaande TS-call-sites (named args via PostgREST) blijven werken.
drop function tmc.adjust_membership_credits(uuid, integer, text, text, text, uuid, uuid);
create function tmc.adjust_membership_credits(
  p_membership_id uuid,
  p_delta integer,
  p_reason text,
  p_source text,
  p_actor_type text,
  p_actor_id uuid default null,
  p_booking_id uuid default null,
  p_booking_source text default 'tmc_booking'
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
begin
  -- Service-role only, zelfde guard als tmc.activate_order: de TS-laag
  -- (requireAdmin/requireStaff/kiosk-PIN) is de autorisatiepoort.
  if auth.uid() is not null then
    raise exception 'adjust_membership_credits is service-role only.' using errcode = '42501';
  end if;

  return tmc.apply_credit_adjustment(
    p_membership_id, p_delta, p_reason, p_source, p_actor_type,
    p_actor_id, p_booking_id, p_booking_source
  );
end;
$function$;

-- ============================================================
-- 8. get_pt_free_slots: vrije starttijden, nooit sessierijen
-- ============================================================

-- Retourneert UITSLUITEND vrije starttijden (trainer, start, duur).
-- Nooit sessierijen, notes, prospect-data of wie geboekt heeft: dit is
-- het enige leden-leespad op de PT-agenda.
--
-- Cadans (spec paragraaf 5): opties per sessieduur (60 min) vanaf de
-- vensterstart; na een buurboeking is de eerstvolgende optie
-- buur-einde plus omkleedtijd, daarna weer de 60-min-cadans. Zo ontstaat
-- op een volle dag vanzelf de 75-min-cadans. Een verlopen hold telt als
-- vrij. Alleen toekomst; leden zien maximaal booking_horizon_days
-- vooruit, admins onbeperkt.
create or replace function tmc.get_pt_free_slots(
  p_trainer_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  trainer_id uuid,
  start_at timestamptz,
  duration_min int
)
language plpgsql
stable
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_dur int;
  v_ta int;
  v_horizon int;
  v_cancel int;
  v_from timestamptz;
  v_to timestamptz;
  v_day date;
  v_end_day date;
  r_window record;
  v_c timestamptz;
  v_w_end timestamptz;
  v_busy_end timestamptz;
  v_busy_kind text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Alleen een boekbare trainer heeft leden-facing slots; admins mogen
  -- ook de agenda van een niet-boekbare trainer bekijken (PR D).
  if not tmc.is_admin() and not exists (
    select 1 from tmc.trainers t
    where t.id = p_trainer_id and t.is_active and t.is_pt_available
  ) then
    return;
  end if;

  select s.session_duration_min, s.turnaround_min, s.booking_horizon_days, s.cancel_window_hours
  into v_dur, v_ta, v_horizon, v_cancel
  from tmc.pt_trainer_settings(p_trainer_id) s;

  v_from := greatest(coalesce(p_from, now()), now());
  v_to := coalesce(p_to, now() + make_interval(days => v_horizon));
  if not tmc.is_admin() then
    v_to := least(v_to, now() + make_interval(days => v_horizon));
  end if;
  if v_to <= v_from then
    return;
  end if;

  v_day := (v_from at time zone 'Europe/Amsterdam')::date;
  v_end_day := (v_to at time zone 'Europe/Amsterdam')::date;

  while v_day <= v_end_day loop
    -- Dag dicht: geen slots, ook niet uit extra-vensters.
    if not exists (
      select 1 from tmc.pt_availability_exceptions e
      where e.trainer_id = p_trainer_id and e.date = v_day and e.type = 'free'
    ) then
      for r_window in
        select w.start_time, w.end_time
        from tmc.pt_availability_windows w
        where w.trainer_id = p_trainer_id
          and w.weekday = extract(dow from v_day)::smallint
        union all
        select e.start_time, e.end_time
        from tmc.pt_availability_exceptions e
        where e.trainer_id = p_trainer_id and e.date = v_day and e.type = 'extra'
        order by start_time
      loop
        v_c := (v_day + r_window.start_time) at time zone 'Europe/Amsterdam';
        v_w_end := (v_day + r_window.end_time) at time zone 'Europe/Amsterdam';

        -- Start-in-venster-semantiek (spec paragraaf 5): de starttijd
        -- moet binnen het venster liggen.
        while v_c < v_w_end and v_c < v_to loop
          select s.end_at, s.kind
          into v_busy_end, v_busy_kind
          from tmc.pt_sessions s
          where s.trainer_id = p_trainer_id
            and s.status = 'scheduled'
            and (s.hold_expires_at is null or s.hold_expires_at > now())
            and (
              case when s.kind in ('bookable', 'intake')
                then not (
                  v_c >= s.end_at + make_interval(mins => v_ta)
                  or s.start_at >= v_c + make_interval(mins => v_dur) + make_interval(mins => v_ta)
                )
                else not (v_c >= s.end_at or s.start_at >= v_c + make_interval(mins => v_dur))
              end
            )
          order by s.start_at
          limit 1;

          if found then
            -- Spring voorbij de bezette sessie; omkleedtijd alleen
            -- tegen sessies met mensen, niet tegen een block.
            v_c := v_busy_end + case
              when v_busy_kind in ('bookable', 'intake') then make_interval(mins => v_ta)
              else interval '0 minutes'
            end;
            continue;
          end if;

          if v_c >= v_from then
            trainer_id := p_trainer_id;
            start_at := v_c;
            duration_min := v_dur;
            return next;
          end if;

          v_c := v_c + make_interval(mins => v_dur);
        end loop;
      end loop;
    end if;

    v_day := v_day + 1;
  end loop;
end;
$function$;

-- Revoke van PUBLIC en daarna expliciet granten: anon valt af,
-- authenticated (leden, admins) en service_role blijven.
revoke execute on function tmc.get_pt_free_slots(uuid, timestamptz, timestamptz) from public;
grant execute on function tmc.get_pt_free_slots(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ============================================================
-- 9. Boek-RPC's: create-and-book
-- ============================================================

-- De oude neem-een-bestaande-sessie-varianten vervallen; er is geen data
-- en geen externe afnemer (live geverifieerd: 0 rijen, alleen de eigen
-- app als caller).
drop function tmc.book_pt_credits(uuid);
drop function tmc.book_pt_pending_payment(uuid);

-- Self-service met credits: valideer venster plus vrij onder een
-- advisory lock op trainer plus dag, debiteer via de geauditeerde kern,
-- en maak sessie plus boeking in dezelfde transactie.
create function tmc.book_pt_credits(
  p_trainer_id uuid,
  p_start_at timestamptz,
  p_format text default 'one_on_one'
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_dur int;
  v_ta int;
  v_horizon int;
  v_cancel int;
  v_end timestamptz;
  v_membership tmc.memberships%rowtype;
  v_session_id uuid;
  v_booking_id uuid;
  v_adjust jsonb;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  -- Alleen formats met een credit-product; small_group_4 heeft geen
  -- rittenkaart en valt buiten dit pad.
  if p_format is null or p_format not in ('one_on_one', 'duo') then
    return jsonb_build_object('ok', false, 'reason', 'format_not_supported');
  end if;
  if p_start_at is null or p_start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;
  if not exists (
    select 1 from tmc.trainers t
    where t.id = p_trainer_id and t.is_active and t.is_pt_available
  ) then
    return jsonb_build_object('ok', false, 'reason', 'trainer_unavailable');
  end if;

  select s.session_duration_min, s.turnaround_min, s.booking_horizon_days, s.cancel_window_hours
  into v_dur, v_ta, v_horizon, v_cancel
  from tmc.pt_trainer_settings(p_trainer_id) s;

  -- Boekhorizon voor leden (8 weken default).
  if p_start_at > now() + make_interval(days => v_horizon) then
    return jsonb_build_object('ok', false, 'reason', 'outside_horizon');
  end if;

  v_end := p_start_at + make_interval(mins => v_dur);

  -- Advisory lock per trainer plus lokale dag: serialiseert alle
  -- slot-creatie zodat check en insert atomair zijn.
  perform pg_advisory_xact_lock(hashtextextended(
    'pt_slot:' || p_trainer_id::text || ':'
      || to_char(p_start_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    0
  ));

  if not tmc.pt_slot_is_free(p_trainer_id, p_start_at, v_end, v_ta, null) then
    return jsonb_build_object('ok', false, 'reason', 'slot_unavailable');
  end if;

  -- Credit-bucket op format: een duo-rittenkaart (plan_variant duo_*)
  -- betaalt geen 1-op-1-sessie en omgekeerd. Legacy rijen zonder
  -- plan_variant tellen als 1-op-1. Zelfde selectie als de oude functie
  -- (live geverifieerd), inclusief expiry-check op het boekmoment.
  select m.* into v_membership
  from tmc.memberships m
  where m.profile_id = v_uid
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

  -- Debit door de geauditeerde kern: lock, saldo-guard en
  -- credits.adjusted-event in dezelfde transactie.
  v_adjust := tmc.apply_credit_adjustment(
    v_membership.id, -1, 'PT-boeking (self-service)', 'booking',
    'member', v_uid, null, 'tmc_booking'
  );
  if not coalesce((v_adjust ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_adjust ->> 'reason', 'credit_debit_failed'));
  end if;

  insert into tmc.pt_sessions (trainer_id, kind, format, start_at, end_at, capacity, status)
  values (p_trainer_id, 'bookable', p_format, p_start_at, v_end, 1, 'scheduled')
  returning id into v_session_id;

  insert into tmc.pt_bookings (profile_id, pt_session_id, price_paid_cents, credits_used_from, status)
  values (v_uid, v_session_id, 0, v_membership.id, 'booked')
  returning id into v_booking_id;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'pt_session_id', v_session_id,
    'membership_id', v_membership.id,
    'start_at', p_start_at,
    'end_at', v_end
  );
end;
$function$;

-- Self-service met Mollie-betaling: zelfde validatie plus lock, maar de
-- sessie krijgt een hold van 20 minuten en de boeking start als
-- 'pending'. De webhook flipt naar 'booked' en wist de hold; de
-- cleanup-cron ruimt verlopen holds op. De Mollie-payment zelf wordt in
-- de TS-laag aangemaakt (bestaand patroon, metadata type 'pt_booking').
create function tmc.book_pt_pending_payment(
  p_trainer_id uuid,
  p_start_at timestamptz,
  p_format text default 'one_on_one'
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_dur int;
  v_ta int;
  v_horizon int;
  v_cancel int;
  v_end timestamptz;
  v_price_cents int;
  v_trainer_name text;
  v_session_id uuid;
  v_booking_id uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;
  if p_format is null or p_format not in ('one_on_one', 'duo') then
    return jsonb_build_object('ok', false, 'reason', 'format_not_supported');
  end if;
  if p_start_at is null or p_start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Lifecycle-guard (spec regel 12): nieuwe boekingen alleen met een
  -- actief lidmaatschap of tegoed; reeds geboekte sessies blijven bij
  -- pauze of opzegging gewoon staan (de credit is al verbruikt).
  if not exists (
    select 1 from tmc.memberships m
    where m.profile_id = v_uid and m.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_active_membership');
  end if;

  select t.display_name into v_trainer_name
  from tmc.trainers t
  where t.id = p_trainer_id and t.is_active and t.is_pt_available;
  if v_trainer_name is null then
    return jsonb_build_object('ok', false, 'reason', 'trainer_unavailable');
  end if;

  select s.session_duration_min, s.turnaround_min, s.booking_horizon_days, s.cancel_window_hours
  into v_dur, v_ta, v_horizon, v_cancel
  from tmc.pt_trainer_settings(p_trainer_id) s;

  if p_start_at > now() + make_interval(days => v_horizon) then
    return jsonb_build_object('ok', false, 'reason', 'outside_horizon');
  end if;

  -- PT is flat: prijs uit de catalogus, per format.
  select c.price_cents into v_price_cents
  from tmc.catalogue c
  where c.slug = case p_format when 'duo' then 'duo_single' else 'pt_single' end
    and c.kind = 'product';
  if v_price_cents is null then
    raise exception 'PT-prijs ontbreekt in tmc.catalogue.' using errcode = 'P0001';
  end if;

  v_end := p_start_at + make_interval(mins => v_dur);

  perform pg_advisory_xact_lock(hashtextextended(
    'pt_slot:' || p_trainer_id::text || ':'
      || to_char(p_start_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    0
  ));

  if not tmc.pt_slot_is_free(p_trainer_id, p_start_at, v_end, v_ta, null) then
    return jsonb_build_object('ok', false, 'reason', 'slot_unavailable');
  end if;

  insert into tmc.pt_sessions (trainer_id, kind, format, start_at, end_at, capacity, status, hold_expires_at)
  values (p_trainer_id, 'bookable', p_format, p_start_at, v_end, 1, 'scheduled', now() + interval '20 minutes')
  returning id into v_session_id;

  insert into tmc.pt_bookings (profile_id, pt_session_id, price_paid_cents, status)
  values (v_uid, v_session_id, v_price_cents, 'pending')
  returning id into v_booking_id;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'pt_session_id', v_session_id,
    'price_cents', v_price_cents,
    'trainer_name', v_trainer_name,
    'start_at', p_start_at,
    'end_at', v_end
  );
end;
$function$;

-- Admin boekt voor een klant (losse sessie; programma en recurring komen
-- in PR C). Elk vrij slot, geen boekhorizon. Betaalwijzen:
-- - 'credits': debiteert het passende pakket van de klant via de kern.
-- - 'already_paid': kas of pin in de studio; boeking staat direct vast.
-- - 'payment_link': boeking staat vast, de Mollie-betaallink wordt in
--   PR C via de bestaande order-pipeline aan de klant gestuurd
--   (mollie_payment_id blijft hier leeg). Geen hold: de afspraak is
--   door Marlon bevestigd, geen zelfbedienings-checkout.
create function tmc.admin_book_pt_for_member(
  p_profile_id uuid,
  p_trainer_id uuid,
  p_start_at timestamptz,
  p_format text default 'one_on_one',
  p_payment_mode text default 'credits'
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_dur int;
  v_ta int;
  v_horizon int;
  v_cancel int;
  v_end timestamptz;
  v_membership tmc.memberships%rowtype;
  v_price_cents int := 0;
  v_credits_from uuid := null;
  v_session_id uuid;
  v_booking_id uuid;
  v_adjust jsonb;
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
  if p_start_at is null or p_start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;
  if not exists (select 1 from tmc.profiles p where p.id = p_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;
  -- Admin mag ook op een niet-leden-facing trainer boeken (is_pt_available
  -- false, zoals de test-trainer), maar niet op een inactieve.
  if not exists (
    select 1 from tmc.trainers t where t.id = p_trainer_id and t.is_active
  ) then
    return jsonb_build_object('ok', false, 'reason', 'trainer_unavailable');
  end if;

  select s.session_duration_min, s.turnaround_min, s.booking_horizon_days, s.cancel_window_hours
  into v_dur, v_ta, v_horizon, v_cancel
  from tmc.pt_trainer_settings(p_trainer_id) s;

  v_end := p_start_at + make_interval(mins => v_dur);

  perform pg_advisory_xact_lock(hashtextextended(
    'pt_slot:' || p_trainer_id::text || ':'
      || to_char(p_start_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    0
  ));

  if not tmc.pt_slot_is_free(p_trainer_id, p_start_at, v_end, v_ta, null) then
    return jsonb_build_object('ok', false, 'reason', 'slot_unavailable');
  end if;

  if p_payment_mode = 'credits' then
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

    v_adjust := tmc.apply_credit_adjustment(
      v_membership.id, -1, 'PT-boeking (door admin)', 'booking',
      'admin', v_uid, null, 'tmc_booking'
    );
    if not coalesce((v_adjust ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'reason', coalesce(v_adjust ->> 'reason', 'credit_debit_failed'));
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

  insert into tmc.pt_sessions (trainer_id, kind, format, start_at, end_at, capacity, status)
  values (p_trainer_id, 'bookable', p_format, p_start_at, v_end, 1, 'scheduled')
  returning id into v_session_id;

  insert into tmc.pt_bookings (profile_id, pt_session_id, price_paid_cents, credits_used_from, status)
  values (p_profile_id, v_session_id, v_price_cents, v_credits_from, 'booked')
  returning id into v_booking_id;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'pt_session_id', v_session_id,
    'payment_mode', p_payment_mode,
    'price_cents', v_price_cents,
    'start_at', p_start_at,
    'end_at', v_end
  );
end;
$function$;

-- ============================================================
-- 10. cancel_pt, reschedule_pt, mark_pt_attendance
-- ============================================================

-- Annuleren (patroon cancel_class_booking): lock op de boeking, venster
-- uit pt_settings, refund door de geauditeerde kern (nooit inline).
-- Binnen venster: credit terug. Buiten venster: forfeit, geen mutatie.
-- De sessie wordt vrijgegeven (status 'cancelled'), niet hard-deleted:
-- boekingshistorie en payment-referenties blijven intact; hard-delete is
-- er alleen voor verlopen pending-holds (cleanup-cron).
create function tmc.cancel_pt(p_pt_booking_id uuid)
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

  -- Refund alleen binnen het venster, alleen op een bevestigde
  -- credit-boeking, en altijd door de kern (lock, dubbel-refund-guard,
  -- audit-event). Buiten het venster: forfeit, geen mutatie.
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

  -- Slot vrijgeven: alleen 'scheduled' telt als bezet in de
  -- slot-berekening.
  update tmc.pt_sessions
  set status = 'cancelled'
  where id = v_session.id;

  return jsonb_build_object(
    'ok', true,
    'within_window', v_within,
    'credits_refunded', v_refunded,
    'start_at', v_session.start_at
  );
end;
$function$;

-- Verzetten als eersteklas actie: geen annuleren-plus-opnieuw, de credit
-- blijft onaangeroerd en de sessie verhuist. Lid: alleen binnen het
-- cancel-venster van de oorspronkelijke start en binnen de horizon.
-- Admin: altijd. Het nieuwe slot wordt onder dezelfde advisory lock
-- gevalideerd, met de eigen sessie uitgesloten van de conflict-check.
create function tmc.reschedule_pt(p_pt_booking_id uuid, p_new_start_at timestamptz)
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
  v_horizon int;
  v_cancel int;
  v_dur interval;
  v_new_end timestamptz;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
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

  select s.turnaround_min, s.booking_horizon_days, s.cancel_window_hours
  into v_ta, v_horizon, v_cancel
  from tmc.pt_trainer_settings(v_session.trainer_id) s;

  if not v_is_admin then
    if v_session.start_at - now() < make_interval(hours => v_cancel) then
      return jsonb_build_object('ok', false, 'reason', 'outside_window');
    end if;
    if p_new_start_at > now() + make_interval(days => v_horizon) then
      return jsonb_build_object('ok', false, 'reason', 'outside_horizon');
    end if;
  end if;

  -- Duur van de bestaande sessie behouden.
  v_dur := v_session.end_at - v_session.start_at;
  v_new_end := p_new_start_at + v_dur;

  perform pg_advisory_xact_lock(hashtextextended(
    'pt_slot:' || v_session.trainer_id::text || ':'
      || to_char(p_new_start_at at time zone 'Europe/Amsterdam', 'YYYY-MM-DD'),
    0
  ));

  if not tmc.pt_slot_is_free(v_session.trainer_id, p_new_start_at, v_new_end, v_ta, v_session.id) then
    return jsonb_build_object('ok', false, 'reason', 'slot_unavailable');
  end if;

  update tmc.pt_sessions
  set start_at = p_new_start_at, end_at = v_new_end
  where id = v_session.id;

  -- De herinnering hoort bij het nieuwe moment.
  update tmc.pt_bookings
  set reminder_sent_at = null
  where id = v_booking.id;

  return jsonb_build_object(
    'ok', true,
    'old_start_at', v_session.start_at,
    'new_start_at', p_new_start_at,
    'new_end_at', v_new_end
  );
end;
$function$;

-- Aanwezigheid: admin markeert attended of no_show op de boeking, vanaf
-- de starttijd van de sessie. Geen automatische credit-mutatie: no-show
-- is default forfeit (de credit is al verbruikt bij het boeken); een
-- correctie loopt apart via adjust_membership_credits met
-- p_booking_source 'pt_booking' (geauditeerd, dubbel-refund-proof).
create function tmc.mark_pt_attendance(p_pt_booking_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_booking tmc.pt_bookings%rowtype;
  v_start timestamptz;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('attended', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;

  select b.* into v_booking
  from tmc.pt_bookings b
  where b.id = p_pt_booking_id
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

-- Zelfde patroon: anon valt af, authenticated en service_role expliciet.
revoke execute on function tmc.book_pt_credits(uuid, timestamptz, text) from public;
revoke execute on function tmc.book_pt_pending_payment(uuid, timestamptz, text) from public;
revoke execute on function tmc.admin_book_pt_for_member(uuid, uuid, timestamptz, text, text) from public;
revoke execute on function tmc.cancel_pt(uuid) from public;
revoke execute on function tmc.reschedule_pt(uuid, timestamptz) from public;
revoke execute on function tmc.mark_pt_attendance(uuid, text) from public;
grant execute on function tmc.book_pt_credits(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function tmc.book_pt_pending_payment(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function tmc.admin_book_pt_for_member(uuid, uuid, timestamptz, text, text) to authenticated, service_role;
grant execute on function tmc.cancel_pt(uuid) to authenticated, service_role;
grant execute on function tmc.reschedule_pt(uuid, timestamptz) to authenticated, service_role;
grant execute on function tmc.mark_pt_attendance(uuid, text) to authenticated, service_role;

-- ============================================================
-- 11. Datafix (expliciet en omkeerbaar)
-- ============================================================

-- De boekbare Marlon-trainers-rij (is_pt_available true, pt_tier
-- premium) hing aan het testaccount marlon@trainers.test; het echte
-- productie-admin-account marlon@ptloosdrecht.nl had geen trainers-rij.
-- Trainer-notificaties (PR C) lopen via trainers.profile_id naar
-- profiles.email en moeten naar haar echte inbox.
-- Omkeerbaar met dezelfde update, met de twee e-mailadressen gewisseld.
update tmc.trainers t
set profile_id = p_real.id
from tmc.profiles p_real, tmc.profiles p_test
where p_real.email = 'marlon@ptloosdrecht.nl'
  and p_test.email = 'marlon@trainers.test'
  and t.profile_id = p_test.id;

-- Test-trainers-rij voor Ilja: is_pt_available false, dus leden zien hem
-- nooit als boekbare PT; admin-geboekte testsessies en test-notificaties
-- gaan naar me@ilja.com. VERWIJDERBAAR BIJ OPLEVERING:
--   delete from tmc.trainers where slug = 'ilja-test-pt';
insert into tmc.trainers (profile_id, display_name, slug, is_active, is_pt_available, pt_tier)
select p.id, 'Ilja (test)', 'ilja-test-pt', true, false, 'standard'
from tmc.profiles p
where p.email = 'me@ilja.com'
  and not exists (select 1 from tmc.trainers t where t.profile_id = p.id);

commit;
