-- feat/session-overrides
--
-- Eenmalige aanpassingen op een ingeroosterde groepsles door een admin,
-- zonder het rooster-template te wijzigen: les annuleren (een les of alle
-- lessen op een datum), starttijd verschuiven binnen dezelfde Amsterdamse
-- dag, trainer vervangen. Zie spec-session-overrides.md.
--
-- 1. class_sessions krijgt occurrence_start_at: de vaste plek van de les in
--    de serie. Wordt bij insert gelijk aan start_at en verandert daarna
--    nooit meer. De materialisatie upsert voortaan op de nieuwe unieke
--    sleutel (template_id, occurrence_start_at), zodat een verschoven les
--    niet opnieuw op de oude tijd wordt aangemaakt.
-- 2. Override-kolommen: rescheduled_at/by, trainer_overridden_at/by,
--    cancelled_at/by. adminUpdateSeries slaat sessies met een override over.
-- 3. Admin-RPC's (is_admin, authenticated + service_role, geen PUBLIC/anon):
--    admin_cancel_class_session, admin_cancel_class_sessions_on_date,
--    admin_preview_day_cancellation, admin_reschedule_class_session,
--    admin_replace_session_trainer. De annuleer-kern
--    cancel_class_session_core heeft geen grants (alleen intern).
-- 4. cancel_class_booking: drop en recreate op basis van de live definitie
--    (pg_get_functiondef, 2026-09-29). Nieuw: kosteloos annuleren tot de
--    nieuwe starttijd als de boeking van voor de verschuiving is, en de
--    teruggave via apply_credit_adjustment (credits_used op 0, event).
-- 5. Testtrainer "Marlon test van der Test" op inactief (besluit Ilja).

-- ---------------------------------------------------------------------------
-- 1. occurrence_start_at en override-kolommen
-- ---------------------------------------------------------------------------

alter table tmc.class_sessions
  add column occurrence_start_at timestamptz,
  add column rescheduled_at timestamptz,
  add column rescheduled_by uuid references tmc.profiles(id) on delete set null,
  add column trainer_overridden_at timestamptz,
  add column trainer_overridden_by uuid references tmc.profiles(id) on delete set null,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references tmc.profiles(id) on delete set null;

update tmc.class_sessions set occurrence_start_at = start_at where occurrence_start_at is null;

alter table tmc.class_sessions alter column occurrence_start_at set not null;

comment on column tmc.class_sessions.occurrence_start_at is
  'Vaste plek van de les in de serie (start_at bij aanmaak). Verandert nooit, ook niet bij een verschuiving. Sleutel voor de materialisatie samen met template_id.';
comment on column tmc.class_sessions.rescheduled_at is
  'Gezet door admin_reschedule_class_session. Boekingen van voor dit moment mogen kosteloos annuleren tot de (nieuwe) start_at.';
comment on column tmc.class_sessions.trainer_overridden_at is
  'Gezet door admin_replace_session_trainer. adminUpdateSeries laat zulke sessies ongemoeid.';

-- Kolomgrants: authenticated leest class_sessions per kolom (sinds
-- 20260928090000_trainer_rls_lockdown). De ledenapp (/app/rooster,
-- /app/boekingen, cookie-client) toont "nieuwe tijd, was ..." en rekent het
-- kosteloos annuleren na een verschuiving uit, en heeft daarvoor deze twee
-- kolommen nodig. De *_by-kolommen, cancelled_at en trainer_overridden_at
-- blijven dicht: alleen admin en service role lezen die.
grant select (occurrence_start_at, rescheduled_at) on tmc.class_sessions to authenticated;

-- De oude sleutel (template_id, start_at) blijft bewust staan. Hij kan niet
-- botsen met een verschuiving: een template heeft hooguit een les per dag en
-- verschuiven kan alleen binnen dezelfde dag. En hij houdt de uitrol veilig:
-- de productiecode van voor deze PR upsert op (template_id, start_at) en
-- blijft werken tot de nieuwe deploy live is.
alter table tmc.class_sessions
  add constraint class_sessions_template_id_occurrence_key unique (template_id, occurrence_start_at);

-- Vulling bij insert en onveranderlijkheid bij update. De materialisatie
-- geeft occurrence_start_at expliciet mee; dit is de vangrail voor
-- adminCreateSession en elke andere insert. BEFORE-triggers draaien voor de
-- ON CONFLICT-arbitrage, dus ook een upsert zonder de kolom botst correct.
create function tmc.class_sessions_occurrence_guard()
returns trigger
language plpgsql
set search_path to 'tmc', 'extensions'
as $$
begin
  if tg_op = 'INSERT' then
    new.occurrence_start_at := coalesce(new.occurrence_start_at, new.start_at);
  elsif new.occurrence_start_at is distinct from old.occurrence_start_at then
    raise exception 'class_sessions.occurrence_start_at is onveranderlijk' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function tmc.class_sessions_occurrence_guard() from public, anon, authenticated;

create trigger class_sessions_occurrence_guard
  before insert or update of occurrence_start_at on tmc.class_sessions
  for each row execute function tmc.class_sessions_occurrence_guard();

-- ---------------------------------------------------------------------------
-- 2. Annuleer-kern (geen grants; alleen aangeroepen door de admin-poorten)
-- ---------------------------------------------------------------------------

create function tmc.cancel_class_session_core(p_session_id uuid, p_reason text, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_session tmc.class_sessions%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_booking record;
  v_guest record;
  v_refund jsonb;
  v_bookings jsonb := '[]'::jsonb;
  v_waitlist jsonb := '[]'::jsonb;
  v_guests jsonb := '[]'::jsonb;
  v_refunded boolean;
begin
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_reason');
  end if;

  -- Lock op de sessie: serialiseert met book_class_session en
  -- book_guest_session (die dezelfde rij locken), dus er kan tijdens de
  -- annulering geen boeking tussendoor glippen.
  select * into v_session from tmc.class_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'already_cancelled');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'not_scheduled');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_started');
  end if;

  -- Ledenboekingen: tegoed terug via de gedeelde kern (lockt membership en
  -- boeking, zet credits_used op 0, schrijft credits.adjusted). Een
  -- weigering breekt de hele annulering af: liever een foutmelding dan een
  -- geannuleerde les met een lid dat zijn rit kwijt is. Abonnementsquotum
  -- komt vanzelf terug: de weekcap telt alleen status 'booked'.
  for v_booking in
    select id, profile_id, membership_id, credits_used
    from tmc.bookings
    where session_id = p_session_id and status = 'booked'
    order by booked_at
    for update
  loop
    v_refunded := false;
    if v_booking.membership_id is not null and coalesce(v_booking.credits_used, 0) > 0 then
      v_refund := tmc.apply_credit_adjustment(
        v_booking.membership_id, v_booking.credits_used,
        'Sessie geannuleerd: ' || v_reason, 'session_cancelled', 'admin',
        p_actor_id, v_booking.id, 'tmc_booking');
      if not coalesce((v_refund ->> 'ok')::boolean, false) then
        raise exception 'Teruggave voor boeking % mislukte: %', v_booking.id, v_refund ->> 'reason'
          using errcode = 'P0001';
      end if;
      v_refunded := true;
    end if;

    update tmc.bookings
    set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'session_cancelled'
    where id = v_booking.id;

    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values ('booking.cancelled', 'admin', p_actor_id, 'booking', v_booking.id,
      jsonb_build_object('profile_id', v_booking.profile_id, 'session_id', p_session_id,
        'reason', 'session_cancelled', 'credits_refunded', v_refunded));

    v_bookings := v_bookings || jsonb_build_object(
      'booking_id', v_booking.id, 'profile_id', v_booking.profile_id,
      'credits_refunded', v_refunded);
  end loop;

  -- Wachtlijst: open plekken vervallen (zelfde definitie van "open" als de
  -- waitlist-promote cron en splitFutureSessionsByBookings).
  with expired as (
    update tmc.waitlist_entries
    set expired_at = now()
    where session_id = p_session_id and confirmed_at is null and expired_at is null
    returning id, profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('waitlist_entry_id', id, 'profile_id', profile_id)), '[]'::jsonb)
  into v_waitlist from expired;

  -- Gastboekingen: op cancelled, gastpas terug. Let op de lock-volgorde:
  -- book_guest_session lockt pas en dan sessie, wij sessie en dan pas. Boekt
  -- een lid op precies hetzelfde moment een gast voor deze les met een pas
  -- die hier ook terugkomt, dan detecteert Postgres de deadlock en breekt
  -- een van beide af (foutmelding, geen halve staat). Bewust geaccepteerd:
  -- zeldzaam en veilig.
  for v_guest in
    select gb.id, gb.guest_pass_id, gb.booked_by, gb.guest_name, gb.guest_email
    from tmc.guest_bookings gb
    where gb.session_id = p_session_id and gb.status = 'booked'
    order by gb.booked_at
    for update
  loop
    update tmc.guest_bookings
    set status = 'cancelled', cancelled_at = now()
    where id = v_guest.id;

    update tmc.guest_passes
    set passes_used = passes_used - 1
    where id = v_guest.guest_pass_id and passes_used > 0;

    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values ('guest.cancelled', 'admin', p_actor_id, 'guest_booking', v_guest.id,
      jsonb_build_object('profile_id', v_guest.booked_by, 'guest_pass_id', v_guest.guest_pass_id,
        'session_id', p_session_id, 'reason', 'session_cancelled', 'pass_restored', found));

    v_guests := v_guests || jsonb_build_object(
      'guest_booking_id', v_guest.id, 'booked_by', v_guest.booked_by,
      'guest_name', v_guest.guest_name, 'guest_email', v_guest.guest_email);
  end loop;

  update tmc.class_sessions
  set status = 'cancelled', cancellation_reason = v_reason,
      cancelled_at = now(), cancelled_by = p_actor_id
  where id = p_session_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values ('session.cancelled', 'admin', p_actor_id, 'session', p_session_id,
    jsonb_build_object('session_id', p_session_id, 'reason', v_reason,
      'start_at', v_session.start_at,
      'affected_booking_count', jsonb_array_length(v_bookings),
      'waitlist_expired_count', jsonb_array_length(v_waitlist),
      'guest_bookings_cancelled', jsonb_array_length(v_guests)));

  return jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'start_at', v_session.start_at,
    'end_at', v_session.end_at,
    'bookings', v_bookings,
    'waitlist', v_waitlist,
    'guests', v_guests);
end;
$$;

revoke execute on function tmc.cancel_class_session_core(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin-poorten
-- ---------------------------------------------------------------------------

create function tmc.admin_cancel_class_session(p_session_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;
  return tmc.cancel_class_session_core(p_session_id, p_reason, auth.uid());
end;
$$;

revoke execute on function tmc.admin_cancel_class_session(uuid, text) from public, anon;
grant execute on function tmc.admin_cancel_class_session(uuid, text) to authenticated, service_role;

-- Alle nog niet begonnen, geplande lessen op een Amsterdamse datum. Elke les
-- loopt door dezelfde kern; alles in een transactie, dus een mislukte
-- teruggave draait de hele dag terug.
create function tmc.admin_cancel_class_sessions_on_date(p_date date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_id uuid;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;
  if p_date is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_date');
  end if;
  if trim(coalesce(p_reason, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_reason');
  end if;

  for v_id in
    select id from tmc.class_sessions
    where status = 'scheduled'
      and (start_at at time zone 'Europe/Amsterdam')::date = p_date
      and start_at > now()
    order by start_at
  loop
    v_result := tmc.cancel_class_session_core(v_id, p_reason, auth.uid());
    -- Tussen de select en de lock kan een les net begonnen of al
    -- geannuleerd zijn; die slaan we over in plaats van alles af te breken.
    if coalesce((v_result ->> 'ok')::boolean, false) then
      v_results := v_results || v_result;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'date', p_date, 'sessions', v_results);
end;
$$;

revoke execute on function tmc.admin_cancel_class_sessions_on_date(date, text) from public, anon;
grant execute on function tmc.admin_cancel_class_sessions_on_date(date, text) to authenticated, service_role;

-- Alleen-lezen voorbeeld voor het bevestigscherm van "hele dag annuleren".
-- Zelfde selectie als admin_cancel_class_sessions_on_date.
create function tmc.admin_preview_day_cancellation(p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_out jsonb;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  with s as (
    select cs.id, cs.start_at, ct.name as class_name
    from tmc.class_sessions cs
    left join tmc.class_types ct on ct.id = cs.class_type_id
    where cs.status = 'scheduled'
      and (cs.start_at at time zone 'Europe/Amsterdam')::date = p_date
      and cs.start_at > now()
  )
  select jsonb_build_object(
    'ok', true,
    'date', p_date,
    'session_count', (select count(*) from s),
    'booking_count', (select count(*) from tmc.bookings b join s on s.id = b.session_id where b.status = 'booked'),
    'waitlist_count', (select count(*) from tmc.waitlist_entries w join s on s.id = w.session_id
                       where w.confirmed_at is null and w.expired_at is null),
    'guest_count', (select count(*) from tmc.guest_bookings g join s on s.id = g.session_id where g.status = 'booked'),
    'trial_count', (select count(*) from tmc.trial_bookings t join s on s.id = t.session_id
                    where t.status in ('pending', 'paid')),
    'started_or_past_count', (
      select count(*) from tmc.class_sessions cs
      where cs.status = 'scheduled'
        and (cs.start_at at time zone 'Europe/Amsterdam')::date = p_date
        and cs.start_at <= now()),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'start_at', start_at, 'class_name', class_name)
                                            order by start_at) from s), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function tmc.admin_preview_day_cancellation(date) from public, anon;
grant execute on function tmc.admin_preview_day_cancellation(date) to authenticated, service_role;

-- Starttijd verschuiven binnen dezelfde Amsterdamse dag. Boekingen blijven
-- staan; hun session_date/iso_week/iso_year worden herberekend met dezelfde
-- (UTC-)formule als book_class_session, zodat caps en de herinneringscron
-- blijven kloppen.
create function tmc.admin_reschedule_class_session(
  p_session_id uuid,
  p_new_start_at timestamptz,
  p_duration_min integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_session tmc.class_sessions%rowtype;
  v_duration int;
  v_new_end timestamptz;
  v_new_date date;
  v_bookings jsonb;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;
  if p_new_start_at is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_start');
  end if;

  select * into v_session from tmc.class_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'not_scheduled');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_started');
  end if;
  if exists (select 1 from tmc.check_ins where session_id = p_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'has_check_ins');
  end if;
  if p_new_start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'new_start_in_past');
  end if;
  if (p_new_start_at at time zone 'Europe/Amsterdam')::date
     <> (v_session.start_at at time zone 'Europe/Amsterdam')::date then
    return jsonb_build_object('ok', false, 'reason', 'different_day');
  end if;

  v_duration := coalesce(
    p_duration_min,
    round(extract(epoch from (v_session.end_at - v_session.start_at)) / 60)::int);
  if v_duration is null or v_duration < 5 or v_duration > 600 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_duration');
  end if;
  v_new_end := p_new_start_at + make_interval(mins => v_duration);

  if p_new_start_at = v_session.start_at and v_new_end = v_session.end_at then
    return jsonb_build_object('ok', false, 'reason', 'no_change');
  end if;

  update tmc.class_sessions
  set start_at = p_new_start_at, end_at = v_new_end,
      rescheduled_at = now(), rescheduled_by = v_uid
  where id = p_session_id;

  v_new_date := (p_new_start_at at time zone 'utc')::date;

  -- Herinnering: al verstuurd met de oude tijd en de nieuwe start valt nog
  -- buiten het herinneringsvenster (21 tot 25 uur)? Dan stempel wissen, zodat
  -- de cron later een herinnering met de juiste tijd stuurt. Valt de nieuwe
  -- start binnen 25 uur, dan dekt de wijzigingsmail het en krijgt het lid
  -- geen tweede mail direct erachteraan.
  with upd as (
    update tmc.bookings
    set session_date = v_new_date,
        iso_week = extract(week from v_new_date)::int,
        iso_year = extract(isoyear from v_new_date)::int,
        reminder_sent_at = case
          when reminder_sent_at is not null and p_new_start_at - now() > interval '25 hours' then null
          else reminder_sent_at end
    where session_id = p_session_id
    returning id, profile_id, status
  )
  select coalesce(jsonb_agg(jsonb_build_object('booking_id', id, 'profile_id', profile_id))
                  filter (where status = 'booked'), '[]'::jsonb)
  into v_bookings from upd;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values ('session.rescheduled', 'admin', v_uid, 'session', p_session_id,
    jsonb_build_object('session_id', p_session_id,
      'old_start_at', v_session.start_at, 'old_end_at', v_session.end_at,
      'new_start_at', p_new_start_at, 'new_end_at', v_new_end,
      'occurrence_start_at', v_session.occurrence_start_at,
      'affected_booking_count', jsonb_array_length(v_bookings)));

  return jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'old_start_at', v_session.start_at, 'old_end_at', v_session.end_at,
    'new_start_at', p_new_start_at, 'new_end_at', v_new_end,
    'bookings', v_bookings);
end;
$$;

revoke execute on function tmc.admin_reschedule_class_session(uuid, timestamptz, integer) from public, anon;
grant execute on function tmc.admin_reschedule_class_session(uuid, timestamptz, integer) to authenticated, service_role;

-- Trainer vervangen. Elke actieve trainer is toegestaan (besluit Ilja); de
-- pijler-match en of de UI-waarschuwing is overschreven gaan mee in het event.
create function tmc.admin_replace_session_trainer(
  p_session_id uuid,
  p_trainer_id uuid,
  p_pillar_warning_overridden boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_session tmc.class_sessions%rowtype;
  v_trainer tmc.trainers%rowtype;
  v_pillar_match boolean;
begin
  if not tmc.is_admin() then
    raise exception 'Alleen voor admins.' using errcode = '42501';
  end if;

  select * into v_session from tmc.class_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'not_scheduled');
  end if;
  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_started');
  end if;

  select * into v_trainer from tmc.trainers where id = p_trainer_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'trainer_not_found');
  end if;
  if not v_trainer.is_active then
    return jsonb_build_object('ok', false, 'reason', 'trainer_inactive');
  end if;
  if v_session.trainer_id = p_trainer_id then
    return jsonb_build_object('ok', false, 'reason', 'no_change');
  end if;

  v_pillar_match := v_session.pillar = any (coalesce(v_trainer.pillar_specialties, '{}'::text[]));

  update tmc.class_sessions
  set trainer_id = p_trainer_id, trainer_overridden_at = now(), trainer_overridden_by = v_uid
  where id = p_session_id;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values ('session.trainer_replaced', 'admin', v_uid, 'session', p_session_id,
    jsonb_build_object('session_id', p_session_id,
      'old_trainer_id', v_session.trainer_id, 'new_trainer_id', p_trainer_id,
      'pillar', v_session.pillar, 'pillar_match', v_pillar_match,
      'pillar_warning_overridden', (not v_pillar_match) and coalesce(p_pillar_warning_overridden, false)));

  return jsonb_build_object('ok', true, 'session_id', p_session_id,
    'old_trainer_id', v_session.trainer_id, 'new_trainer_id', p_trainer_id,
    'pillar_match', v_pillar_match);
end;
$$;

revoke execute on function tmc.admin_replace_session_trainer(uuid, uuid, boolean) from public, anon;
grant execute on function tmc.admin_replace_session_trainer(uuid, uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. cancel_class_booking: recreate op basis van de live definitie
-- ---------------------------------------------------------------------------
-- Live grants voor de wijziging: postgres, authenticated (geen anon, geen
-- PUBLIC, geen service_role). Die worden exact hersteld.
-- Wijzigingen ten opzichte van live:
--   a. Kosteloos annuleren na een verschuiving: boeking van voor
--      rescheduled_at en de (nieuwe) start is nog niet bereikt. Reden
--      'rescheduled' als het normale venster al dicht was.
--   b. Teruggave via apply_credit_adjustment in plaats van een losse update:
--      credits_used gaat op 0 en er komt een credits.adjusted-event.

drop function tmc.cancel_class_booking(uuid);

create function tmc.cancel_class_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_booking tmc.bookings%rowtype;
  v_start_at timestamptz;
  v_rescheduled_at timestamptz;
  v_within_window boolean;
  v_free_after_reschedule boolean;
  v_credits_refunded boolean := false;
  v_cancel_hours int;
  v_vrij_minutes int;
  v_refund jsonb;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Lock op de eigen boeking: twee gelijktijdige cancels kunnen niet allebei
  -- de refund-tak inlopen.
  select * into v_booking
  from tmc.bookings
  where id = p_booking_id and profile_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_booking.status <> 'booked' then
    return jsonb_build_object('ok', false, 'reason', 'not_booked');
  end if;

  select coalesce(bs.cancellation_window_hours, 6),
         coalesce(bs.vrij_trainen_cancel_window_minutes, 5)
  into v_cancel_hours, v_vrij_minutes
  from tmc.booking_settings bs
  limit 1;
  if not found then
    v_cancel_hours := 6;
    v_vrij_minutes := 5;
  end if;

  select start_at, rescheduled_at into v_start_at, v_rescheduled_at
  from tmc.class_sessions where id = v_booking.session_id;
  if v_start_at is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  -- Vrij trainen heeft een veel soepeler venster dan groepslessen.
  if v_booking.pillar = 'vrij_trainen' then
    v_within_window := v_start_at - now() >= make_interval(mins => v_vrij_minutes);
  else
    v_within_window := v_start_at - now() >= make_interval(hours => v_cancel_hours);
  end if;

  -- Verschoven les (session-overrides): wie boekte voor de verschuiving mag
  -- tot de nieuwe starttijd kosteloos annuleren.
  v_free_after_reschedule := v_rescheduled_at is not null
    and v_booking.booked_at < v_rescheduled_at
    and now() < v_start_at;

  update tmc.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = case
        when v_within_window then 'within_window'
        when v_free_after_reschedule then 'rescheduled'
        else 'late' end
  where id = p_booking_id;

  if (v_within_window or v_free_after_reschedule)
     and v_booking.credits_used > 0 and v_booking.membership_id is not null then
    -- Via de gedeelde kern: lockt membership en boeking, zet credits_used op
    -- 0 en schrijft credits.adjusted in dezelfde transactie.
    v_refund := tmc.apply_credit_adjustment(
      v_booking.membership_id, v_booking.credits_used,
      case when v_within_window then 'Annulering binnen de termijn'
           else 'Annulering na verschuiving van de les' end,
      'refund', 'member', v_uid, p_booking_id, 'tmc_booking');
    v_credits_refunded := coalesce((v_refund ->> 'ok')::boolean, false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_booking.session_id,
    'pillar', v_booking.pillar,
    'within_window', v_within_window or v_free_after_reschedule,
    'free_after_reschedule', v_free_after_reschedule and not v_within_window,
    'credits_refunded', v_credits_refunded
  );
end;
$function$;

revoke execute on function tmc.cancel_class_booking(uuid) from public, anon;
grant execute on function tmc.cancel_class_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Testtrainer op inactief (voorwaardelijk: geen effect op een lege db)
-- ---------------------------------------------------------------------------

update tmc.trainers
set is_active = false
where id = '65d75ff8-d5ea-41d6-8637-11ac0ac3ed0c'
  and display_name = 'Marlon test van der Test'
  and is_active;

-- ---------------------------------------------------------------------------
-- Zelfcontrole
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text;
  v_admin_rpcs text[] := array[
    'tmc.admin_cancel_class_session(uuid, text)',
    'tmc.admin_cancel_class_sessions_on_date(date, text)',
    'tmc.admin_preview_day_cancellation(date)',
    'tmc.admin_reschedule_class_session(uuid, timestamptz, integer)',
    'tmc.admin_replace_session_trainer(uuid, uuid, boolean)'
  ];
  v_internal text[] := array[
    'tmc.cancel_class_session_core(uuid, text, uuid)',
    'tmc.class_sessions_occurrence_guard()'
  ];
begin
  foreach v_name in array v_admin_rpcs || v_internal || array['tmc.cancel_class_booking(uuid)'] loop
    if has_function_privilege('anon', v_name, 'execute') then
      raise exception 'session_overrides: anon heeft EXECUTE op %', v_name;
    end if;
    if exists (select 1 from pg_proc p where p.oid = v_name::regprocedure
               and exists (select 1 from aclexplode(p.proacl) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')) then
      raise exception 'session_overrides: PUBLIC heeft EXECUTE op %', v_name;
    end if;
  end loop;
  foreach v_name in array v_admin_rpcs loop
    if not has_function_privilege('authenticated', v_name, 'execute')
       or not has_function_privilege('service_role', v_name, 'execute') then
      raise exception 'session_overrides: authenticated of service_role mist EXECUTE op %', v_name;
    end if;
  end loop;
  foreach v_name in array v_internal loop
    if has_function_privilege('authenticated', v_name, 'execute') then
      raise exception 'session_overrides: authenticated heeft EXECUTE op %', v_name;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'tmc.cancel_class_booking(uuid)', 'execute') then
    raise exception 'session_overrides: authenticated mist EXECUTE op cancel_class_booking';
  end if;
  if not has_column_privilege('authenticated', 'tmc.class_sessions', 'occurrence_start_at', 'select')
     or not has_column_privilege('authenticated', 'tmc.class_sessions', 'rescheduled_at', 'select') then
    raise exception 'session_overrides: authenticated mist SELECT op de nieuwe class_sessions-kolommen';
  end if;
  if has_column_privilege('authenticated', 'tmc.class_sessions', 'rescheduled_by', 'select')
     or has_column_privilege('authenticated', 'tmc.class_sessions', 'cancelled_by', 'select')
     or has_column_privilege('authenticated', 'tmc.class_sessions', 'trainer_overridden_by', 'select') then
    raise exception 'session_overrides: authenticated leest een *_by-kolom op class_sessions';
  end if;
  if exists (select 1 from tmc.class_sessions where occurrence_start_at is null) then
    raise exception 'session_overrides: occurrence_start_at niet overal gevuld';
  end if;
end $$;
