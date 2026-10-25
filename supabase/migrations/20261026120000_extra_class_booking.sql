-- Extra les bijkopen (spec-weekcap-extra-les.md, PR B).
--
-- Een lid met een actief abonnement kan een les bijkopen als de weekcap
-- bereikt is of de les buiten het abonnement valt. De prijs is de prijs per
-- rit van de 10-rittenkaart, altijd server-side uit tmc.catalogue. De plek
-- wordt vastgehouden met een boeking in status pending_payment met een
-- houdtijd van 20 minuten; de Mollie-webhook (of de cron als vangnet) zet
-- de rij op booked of cancelled.
--
-- Inhoud, in deze volgorde:
--   1. bookings: status pending_payment, hold_expires_at, unique index.
--   2. payments.kind 'extra_class'; payment_refunds.booking_id.
--   3. tmc.extra_class_price(age_category): de ene prijsfunctie.
--   4. Tellers met pending_payment: session_occupancy, vrij_trainen_slot_peak,
--      v_session_availability, sessions_with_participants, de trigger
--      bookings_enforce_capacity en enforce_vrij_trainen_slot.
--   5. booking_gate: pending_payment in dubbelboeking en dagcap; p_paid_extra
--      (betaald pad) en twee nieuwe OUT-waarden met prijs en beschikbaarheid.
--   6. book_class_session: geeft prijs en beschikbaarheid mee bij
--      weekly_cap_reached en no_coverage.
--   7. start_extra_class_booking (authenticated): de pending rij.
--   8. request_booking_refund (intern en service_role): refund-intentie.
--   9. confirm_extra_class_booking (service_role): paid, mislukt, te laat.
--  10. cancel_class_booking: pending afbreken, refund binnen het venster.
--  11. cancel_class_session_core: refund voor betaalde extra lessen.
--  12. v_revenue_lines: extra_class naar les_tegoed.
--  13. Grants en asserties.
--
-- Schema uitsluitend tmc. Geen app-data nodig (regel 6 van de README).
-- Alle SECURITY DEFINER-functies met gewijzigde signatuur of body worden
-- gedropt en opnieuw aangemaakt, met expliciete revoke en grant.

-- ---------------------------------------------------------------------------
-- 1. bookings
-- ---------------------------------------------------------------------------

alter table tmc.bookings drop constraint bookings_status_check;
alter table tmc.bookings add constraint bookings_status_check
  check (status = any (array['booked', 'cancelled', 'waitlisted', 'pending_payment']));

alter table tmc.bookings add column hold_expires_at timestamptz;
comment on column tmc.bookings.hold_expires_at is
  'Alleen bij status pending_payment: tot wanneer de plek wordt vastgehouden voor de betaling van een extra les (spec-weekcap-extra-les.md). Daarna zet de cron de rij op cancelled; een late betaling wordt in de webhook alsnog bevestigd of terugbetaald.';

-- Een pending extra les telt als actieve rij: geen tweede rij op dezelfde
-- sessie, en de insert faalt netjes op unique_violation.
drop index tmc.bookings_profile_session_active_key;
create unique index bookings_profile_session_active_key
  on tmc.bookings (profile_id, session_id)
  where status = any (array['booked', 'waitlisted', 'pending_payment']);

create index bookings_pending_payment_idx
  on tmc.bookings (hold_expires_at)
  where status = 'pending_payment';

-- De telling per kwartier en de capaciteit lezen ook pending rijen.
drop index tmc.bookings_vrij_slot_idx;
create index bookings_vrij_slot_idx
  on tmc.bookings (session_id, slot_start_at, slot_end_at)
  where status in ('booked', 'pending_payment') and slot_start_at is not null;

-- ---------------------------------------------------------------------------
-- 2. payments en payment_refunds
-- ---------------------------------------------------------------------------

alter table tmc.payments drop constraint payments_kind_check;
alter table tmc.payments add constraint payments_kind_check
  check (kind is null or kind = any (array['order', 'recurring', 'trial_booking', 'manual', 'extra_class']));

alter table tmc.payment_refunds
  add column booking_id uuid references tmc.bookings(id) on delete set null;
create index payment_refunds_booking_id_idx on tmc.payment_refunds (booking_id);
comment on column tmc.payment_refunds.booking_id is
  'Ledenboeking waar deze terugbetaling bij hoort (extra les, spec-weekcap-extra-les.md). Null bij proeflessen; die gebruiken trial_booking_id.';

-- ---------------------------------------------------------------------------
-- 3. extra_class_price
-- ---------------------------------------------------------------------------
-- De enige plek waar de prijs van een extra les vandaan komt: gate, checkout,
-- webhook en app lezen allemaal deze functie. Rittenkaartprijs gedeeld door
-- het aantal ritten, op hele centen afgerond. Kids en senior lezen hun eigen
-- rittenkaart; staat die op is_active = false (live), dan is bijkopen voor
-- die categorie uit (geen rij).

create function tmc.extra_class_price(p_age_category text)
returns table (price_cents integer, vat_rate_bp integer, revenue_category text, catalogue_slug text)
language sql
stable
set search_path to 'tmc', 'extensions'
as $function$
  select round(c.price_cents::numeric / c.credits)::integer,
         c.vat_rate_bp,
         c.revenue_category,
         c.slug
  from tmc.catalogue c
  where c.slug = 'ten_ride_card'
          || case when p_age_category in ('kids', 'senior') then '_' || p_age_category else '' end
    and c.kind = 'product'
    and c.is_active
    and coalesce(c.credits, 0) > 0
    and c.price_cents > 0
$function$;

comment on function tmc.extra_class_price(text) is
  'Prijs van een extra les per leeftijdscategorie: price_cents / credits van de 10-rittenkaart in tmc.catalogue, afgerond op hele centen. Geen rij als de kaart voor die categorie niet actief is (bijkopen uit). Zie spec-weekcap-extra-les.md.';

revoke execute on function tmc.extra_class_price(text) from public, anon;
grant execute on function tmc.extra_class_price(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Tellers met pending_payment
-- ---------------------------------------------------------------------------

create or replace function tmc.session_occupancy(p_session_id uuid, p_exclude_profile uuid default null)
returns integer
language sql
stable
as $function$
  select (
    (select count(*) from tmc.bookings b
      where b.session_id = p_session_id
        and b.status in ('booked', 'pending_payment'))
    + (select count(*) from tmc.trial_bookings tb
      where tb.session_id = p_session_id
        and tb.status in ('pending', 'paid', 'attended')
        and not tb.is_test)
    + (select count(*) from tmc.guest_bookings gb
      where gb.session_id = p_session_id
        and gb.status in ('booked', 'attended'))
    -- Open promoties reserveren een plek tot de deadline. Het gepromoveerde
    -- lid zelf ziet zijn reservering niet als bezet (p_exclude_profile),
    -- zodat bevestigen via book_class_session in de gereserveerde plek past.
    + (select count(*) from tmc.waitlist_entries w
      where w.session_id = p_session_id
        and w.promoted_at is not null
        and w.confirmed_at is null
        and w.expired_at is null
        and w.confirmation_deadline > now()
        and w.profile_id is distinct from p_exclude_profile)
  )::integer
$function$;

create or replace function tmc.vrij_trainen_slot_peak(p_session_id uuid, p_start timestamptz, p_end timestamptz, p_exclude_booking_id uuid default null)
returns table (peak integer, blocked boolean)
language sql
stable
set search_path to 'tmc', 'extensions'
as $function$
  with q as (
    select gs as qs
    from generate_series(p_start, p_end - interval '15 minutes', interval '15 minutes') gs
  )
  select
    coalesce((
      select max(c.n)
      from q
      cross join lateral (
        select count(*)::integer as n
        from (
          select b.id
          from tmc.bookings b
          where b.session_id = p_session_id
            and b.status in ('booked', 'pending_payment')
            and b.slot_start_at <= q.qs
            and b.slot_end_at > q.qs
          union all
          select t.id
          from tmc.trial_bookings t
          where t.session_id = p_session_id
            and t.status in ('pending', 'paid', 'attended')
            and not t.is_test
            and t.slot_start_at <= q.qs
            and t.slot_end_at > q.qs
        ) u
        where p_exclude_booking_id is null or u.id <> p_exclude_booking_id
      ) c
    ), 0)::integer as peak,
    exists (
      select 1
      from q
      join tmc.class_sessions cs
        on cs.status = 'scheduled'
       and cs.blocks_free_training
       and cs.id <> p_session_id
       and cs.start_at < q.qs + interval '15 minutes'
       and cs.end_at > q.qs
    ) as blocked
$function$;

-- Zelfde kolommen, dus create or replace houdt de grants (SELECT voor anon,
-- authenticated en service_role).
create or replace view tmc.v_session_availability as
 select cs.id,
    cs.class_type_id,
    cs.trainer_id,
    cs.pillar,
    cs.age_category,
    cs.start_at,
    cs.end_at,
    cs.capacity,
    cs.status,
    occ.members_booked as booked_count,
        case
            when cs.capacity is null then null::bigint
            else cs.capacity - (occ.members_booked + occ.trials_taken + occ.guests_taken + occ.promotions_open)
        end as spots_available,
    ( select count(*) as count
           from tmc.waitlist_entries w
          where w.session_id = cs.id and w.confirmed_at is null and w.expired_at is null) as waitlist_count,
    occ.members_booked + occ.trials_taken + occ.guests_taken + occ.promotions_open as taken_count
   from tmc.class_sessions cs
     cross join lateral ( select ( select count(*) as count
                   from tmc.bookings b
                  where b.session_id = cs.id and b.status in ('booked', 'pending_payment')) as members_booked,
            ( select count(*) as count
                   from tmc.trial_bookings tb
                  where tb.session_id = cs.id and (tb.status = any (array['pending'::text, 'paid'::text, 'attended'::text])) and not tb.is_test) as trials_taken,
            ( select count(*) as count
                   from tmc.guest_bookings gb
                  where gb.session_id = cs.id and (gb.status = any (array['booked'::text, 'attended'::text]))) as guests_taken,
            ( select count(*) as count
                   from tmc.waitlist_entries w
                  where w.session_id = cs.id and w.promoted_at is not null and w.confirmed_at is null and w.expired_at is null and w.confirmation_deadline > now()) as promotions_open) occ
  where cs.status = 'scheduled'::text;

create or replace function tmc.sessions_with_participants(p_session_ids uuid[])
returns setof uuid
language sql
stable
set search_path to 'tmc', 'extensions'
as $function$
  select b.session_id from tmc.bookings b
  where b.session_id = any (p_session_ids) and b.status in ('booked', 'waitlisted', 'pending_payment')
  union
  select tb.session_id from tmc.trial_bookings tb
  where tb.session_id = any (p_session_ids) and tb.status in ('pending', 'paid', 'attended')
  union
  select gb.session_id from tmc.guest_bookings gb
  where gb.session_id = any (p_session_ids) and gb.status in ('booked', 'attended')
  union
  select w.session_id from tmc.waitlist_entries w
  where w.session_id = any (p_session_ids) and w.confirmed_at is null and w.expired_at is null
$function$;

-- Capaciteitstrigger: de functie blijft gelijk (drie tabellen), alleen het
-- argument voor bookings telt nu ook pending_payment.
drop trigger bookings_enforce_capacity on tmc.bookings;
create trigger bookings_enforce_capacity
  before insert or update of status, session_id on tmc.bookings
  for each row execute function tmc.enforce_session_capacity('booked,pending_payment');

-- Slotbackstop: drop en recreate (SECURITY DEFINER), pending telt mee.
drop trigger bookings_enforce_vrij_trainen_slot on tmc.bookings;
drop function tmc.enforce_vrij_trainen_slot();

create function tmc.enforce_vrij_trainen_slot()
returns trigger
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_session record;
  v_max int;
  v_peak int;
  v_blocked boolean;
begin
  -- Alleen rijen die een plek innemen (booked, pending_payment) of kunnen
  -- gaan innemen (waitlisted) hebben een geldig slot nodig.
  if new.status not in ('booked', 'waitlisted', 'pending_payment') then
    return new;
  end if;

  -- Een rij die van status, sessie en slot niet wisselt, is al gecontroleerd.
  -- waitlisted naar booked valt hier dus niet onder en wordt geteld;
  -- pending_payment naar booked ook niet opnieuw geteld (zelfde plek).
  if tg_op = 'UPDATE'
     and (old.status = new.status
          or (old.status = 'pending_payment' and new.status = 'booked'))
     and new.session_id is not distinct from old.session_id
     and new.slot_start_at is not distinct from old.slot_start_at
     and new.slot_end_at is not distinct from old.slot_end_at then
    return new;
  end if;

  -- Serialisatiepunt: dezelfde rij-lock als book_class_session en
  -- enforce_session_capacity.
  select id, pillar, start_at, end_at into v_session
  from tmc.class_sessions
  where id = new.session_id
  for update;

  if not found then
    return new;
  end if;

  if v_session.pillar <> 'vrij_trainen' then
    if new.slot_start_at is not null then
      raise exception 'slot_not_allowed' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.slot_start_at is null then
    raise exception 'slot_required' using errcode = 'P0001';
  end if;

  if new.slot_start_at < v_session.start_at or new.slot_end_at > v_session.end_at then
    raise exception 'slot_outside_session' using errcode = 'P0001';
  end if;

  -- De grens per kwartier geldt alleen voor rijen die een plek innemen.
  if new.status = 'waitlisted' then
    return new;
  end if;

  select coalesce(bs.vrij_trainen_max_concurrent, 5) into v_max
  from tmc.booking_settings bs limit 1;
  v_max := coalesce(v_max, 5);

  select p.peak, p.blocked into v_peak, v_blocked
  from tmc.vrij_trainen_slot_peak(
    new.session_id, new.slot_start_at, new.slot_end_at,
    case when tg_op = 'UPDATE' then new.id end) p;

  if v_blocked then
    raise exception 'slot_blocked' using errcode = 'P0001';
  end if;
  if v_peak >= v_max then
    raise exception 'slot_full' using errcode = 'P0001',
      hint = 'Maximaal aantal tegelijk bereikt in minstens een kwartier van dit slot.';
  end if;

  return new;
end;
$function$;

revoke execute on function tmc.enforce_vrij_trainen_slot() from public, anon, authenticated, service_role;

create trigger bookings_enforce_vrij_trainen_slot
  before insert or update of status, session_id, slot_start_at, slot_end_at on tmc.bookings
  for each row execute function tmc.enforce_vrij_trainen_slot();

-- ---------------------------------------------------------------------------
-- 5. booking_gate met betaald pad
-- ---------------------------------------------------------------------------
-- Live (pg_get_functiondef, 2026-10-26, na 20261025120000): niet SECURITY
-- DEFINER, ACL {postgres=X/postgres}. Wijzigingen ten opzichte van live:
--   a. zevende IN-parameter p_paid_extra boolean default false: het betaalde
--      pad van start_extra_class_booking. no_coverage en weekly_cap_reached
--      zijn dan geen weigering maar zetten o_paid_path; alle andere regels
--      blijven hard. Zonder actief abonnement blijft no_coverage staan.
--   b. twee nieuwe OUT-waarden o_extra_class_available en
--      o_extra_class_price_cents, gevuld bij no_coverage en
--      weekly_cap_reached (ook op het gewone pad, zodat book_class_session
--      ze kan doorgeven) en op het betaalde pad.
--   c. pending_payment telt mee als dubbelboeking en in de dagcap.
--   d. o_covering is op het betaalde pad het actieve abonnement (niet per se
--      dekkend); o_credits_used blijft 0.
-- Aanroepers lezen het record op naam; de bestaande drie geven zes
-- argumenten mee en krijgen het oude gedrag.

drop function tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean);

create function tmc.booking_gate(
  p_uid uuid,
  p_session_id uuid,
  p_slot_start_at timestamptz,
  p_slot_minutes integer,
  p_for_waitlist boolean,
  p_walk_in boolean default false,
  p_paid_extra boolean default false,
  out o_reason text,
  out o_capacity_full boolean,
  out o_can_join_waitlist boolean,
  out o_session tmc.class_sessions,
  out o_session_date date,
  out o_iso_week integer,
  out o_iso_year integer,
  out o_is_vrij boolean,
  out o_slot_start timestamptz,
  out o_slot_end timestamptz,
  out o_covering tmc.memberships,
  out o_credits_used integer,
  out o_paid_path boolean,
  out o_extra_class_available boolean,
  out o_extra_class_price_cents integer
)
returns record
language plpgsql
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_profile_age text;
  v_settings record;
  v_same_day_count int;
  v_week_count int;
  v_capped text[];
  v_strikes record;
  v_effective_start timestamptz;
  v_peak int;
  v_blocked boolean;
  v_subscription tmc.memberships%rowtype;
  v_price integer;
begin
  o_reason := null;
  o_capacity_full := false;
  o_can_join_waitlist := false;
  o_credits_used := 0;
  o_paid_path := false;
  o_extra_class_available := false;
  o_extra_class_price_cents := null;

  -- Lock op de sessie-rij: serialiseert capaciteits- en slotchecks en pint
  -- de status/start_at vast voor de duur van deze transactie.
  select * into o_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    o_reason := 'session_not_found';
    return;
  end if;

  select age_category into v_profile_age
  from tmc.profiles where id = p_uid;
  if v_profile_age is null then
    o_reason := 'profile_not_found';
    return;
  end if;

  select
    coalesce(bs.booking_window_days, 14)        as booking_window_days,
    coalesce(bs.fair_use_daily_max, 2)          as fair_use_daily_max,
    coalesce(bs.no_show_strike_threshold, 3)    as no_show_strike_threshold,
    coalesce(bs.no_show_block_days, 7)          as no_show_block_days,
    coalesce(bs.vrij_trainen_max_concurrent, 5) as vrij_trainen_max_concurrent
  into v_settings
  from tmc.booking_settings bs
  limit 1;
  if not found then
    select 14 as booking_window_days,
           2 as fair_use_daily_max,
           3 as no_show_strike_threshold,
           7 as no_show_block_days,
           5 as vrij_trainen_max_concurrent
    into v_settings;
  end if;

  -- Zelfde datum/week-berekening als de TS-laag (die op Vercel in UTC draait).
  o_session_date := (o_session.start_at at time zone 'utc')::date;
  o_iso_week := extract(week from o_session_date)::int;
  o_iso_year := extract(isoyear from o_session_date)::int;

  -- Slot: verplicht op vrij trainen, verboden op andere pillars.
  o_is_vrij := o_session.pillar = 'vrij_trainen';
  if o_is_vrij then
    if p_slot_start_at is null or p_slot_minutes is null then
      o_reason := 'slot_required';
      return;
    end if;
    if p_slot_minutes not in (30, 45, 60, 75, 90)
       or mod(extract(epoch from p_slot_start_at), 900) <> 0 then
      o_reason := 'slot_invalid';
      return;
    end if;
    o_slot_start := p_slot_start_at;
    o_slot_end := p_slot_start_at + make_interval(mins => p_slot_minutes);
    if o_slot_start < o_session.start_at or o_slot_end > o_session.end_at then
      o_reason := 'slot_outside_session';
      return;
    end if;
  elsif p_slot_start_at is not null or p_slot_minutes is not null then
    o_reason := 'slot_not_allowed';
    return;
  end if;

  -- Vrij trainen rekent venster en verleden vanaf het slot, niet vanaf de
  -- dagsessie (anders is om 07:00 de hele dag dicht).
  v_effective_start := coalesce(o_slot_start, o_session.start_at);

  -- Checks in dezelfde volgorde als canBook() (src/lib/member/can-book.ts).
  if v_profile_age <> o_session.age_category then
    o_reason := 'age_mismatch';
    return;
  end if;

  if v_effective_start > now() + make_interval(days => v_settings.booking_window_days) then
    o_reason := 'booking_window_closed';
    return;
  end if;

  if o_session.status <> 'scheduled' then
    o_reason := 'session_not_scheduled';
    return;
  end if;

  -- Walk-in (b): de les mag al begonnen zijn; het venster bewaakt
  -- book_walk_in zelf.
  if not p_walk_in and v_effective_start <= now() then
    o_reason := 'session_in_past';
    return;
  end if;

  -- Dubbelboeking: expliciete check; de partiele unique index
  -- bookings_profile_session_active_key vangt de race af. Een pending extra
  -- les telt als actieve rij.
  if exists (
    select 1 from tmc.bookings
    where profile_id = p_uid and session_id = p_session_id
      and status in ('booked', 'waitlisted', 'pending_payment')
  ) then
    o_reason := 'already_booked';
    return;
  end if;

  -- Capaciteit, geteld onder de sessie-lock, inclusief open promoties van
  -- anderen; de eigen open promotie telt niet als bezet. NULL betekent
  -- onbeperkt (ook vrij trainen: daar geldt de slotgrens hieronder).
  -- Walk-in (c): komt er als extra plek bij, geen telling en geen wachtlijst.
  if not p_walk_in
     and o_session.capacity is not null
     and tmc.session_occupancy(p_session_id, p_uid) >= o_session.capacity then
    o_capacity_full := true;
    -- Wie al een open entry heeft (wachtend of gepromoveerd) kan niet
    -- nogmaals inschrijven; de app biedt dan geen wachtlijstknop.
    o_can_join_waitlist := not exists (
      select 1 from tmc.waitlist_entries w
      where w.profile_id = p_uid and w.session_id = p_session_id
        and w.confirmed_at is null and w.expired_at is null
    );
    if not p_for_waitlist then
      o_reason := 'capacity_full';
      return;
    end if;
  end if;

  -- Slotgrens vrij trainen, onder dezelfde sessie-lock. Geen wachtlijst.
  if o_is_vrij then
    select p.peak, p.blocked into v_peak, v_blocked
    from tmc.vrij_trainen_slot_peak(p_session_id, o_slot_start, o_slot_end) p;
    if v_blocked then
      o_reason := 'slot_blocked';
      return;
    end if;
    if v_peak >= v_settings.vrij_trainen_max_concurrent then
      o_reason := 'slot_full';
      return;
    end if;
  end if;

  -- Strike-blokkade. Walk-in (d): overgeslagen, wie in de zaal staat houdt
  -- geen plek vast.
  if not p_walk_in then
    select strike_count, last_strike_at into v_strikes
    from tmc.v_active_strikes where profile_id = p_uid;
    if found
      and v_strikes.strike_count >= v_settings.no_show_strike_threshold
      and v_strikes.last_strike_at
          + make_interval(days => v_settings.no_show_block_days) > now()
    then
      o_reason := 'strike_blocked';
      return;
    end if;
  end if;

  -- Daily fair-use cap. Vrij trainen telt niet mee en wordt er ook niet door
  -- geweigerd (besluit 4); een per dag volgt al uit sessie plus unique index.
  -- Een pending extra les telt mee: die wordt straks een boeking.
  if not o_is_vrij then
    select count(*) into v_same_day_count
    from tmc.bookings
    where profile_id = p_uid and status in ('booked', 'pending_payment')
      and session_date = o_session_date
      and pillar <> 'vrij_trainen';
    if v_same_day_count >= v_settings.fair_use_daily_max then
      o_reason := 'daily_cap_reached';
      return;
    end if;
  end if;

  -- Actief abonnement, los van dekking: de voorwaarde om een extra les te
  -- mogen bijkopen (spec-weekcap-extra-les.md, besluit 3). Zelfde status-,
  -- effective-date- en pauzeregels als de dekking hieronder; rittenkaarten
  -- en PT-pakketten tellen niet als abonnement.
  select m.* into v_subscription
  from tmc.memberships m
  where m.profile_id = p_uid
    and m.plan_type not in ('ten_ride_card', 'pt_package')
    and (
      m.status = 'active'
      or (m.status = 'cancellation_requested'
          and m.cancellation_effective_date is not null
          and m.cancellation_effective_date >= o_session_date)
    )
    and (m.pause_effective_date is null
         or o_session_date < m.pause_effective_date)
  order by m.start_date desc
  limit 1;

  if found then
    select e.price_cents into v_price from tmc.extra_class_price(v_profile_age) e;
    if v_price is not null then
      o_extra_class_available := true;
      o_extra_class_price_cents := v_price;
    end if;
  end if;

  -- Dekking: eerst een dekkend abonnement zonder credits, anders een
  -- ten-rittenkaart met credits. De membership-rij wordt gelockt zodat de
  -- credit-decrement niet kan racen. Een opgezegd lid
  -- (cancellation_requested) houdt dekking t/m de effective date.
  -- Rittenkaart moet op het boekmoment geldig zijn: credits_expires_at
  -- null of >= current_date (expiry-afdwinging, 20260723).
  -- Pauzevenster (lifecycle-primitieven, 20260725): een geplande of lopende
  -- pauze dekt geen sessies op of na de pauze-ingangsdatum.
  select m.* into o_covering
  from tmc.memberships m
  where m.profile_id = p_uid
    and (
      m.status = 'active'
      or (m.status = 'cancellation_requested'
          and m.cancellation_effective_date is not null
          and m.cancellation_effective_date >= o_session_date)
    )
    and (m.pause_effective_date is null
         or o_session_date < m.pause_effective_date)
    and tmc.plan_covers(m.plan_type, o_session.pillar)
    and (m.plan_type <> 'ten_ride_card'
         or (coalesce(m.credits_remaining, 0) > 0
             and (m.credits_expires_at is null or m.credits_expires_at >= current_date)))
  order by (m.plan_type = 'ten_ride_card') asc, m.start_date desc
  limit 1
  for update of m;

  if not found then
    -- Betaald pad: geen dekking maar wel een actief abonnement en een prijs.
    if p_paid_extra and o_extra_class_available then
      o_covering := v_subscription;
      o_paid_path := true;
      return;
    end if;
    o_reason := 'no_coverage';
    return;
  end if;

  -- Weekcap, hard en per abonnement (spec-weekcap-extra-les.md). Telt de
  -- eigen boekingen in de ISO-week van de sessie over de capped pillars van
  -- de dekkende membership: bij een groepsabonnement en bij All Access zijn
  -- dat yoga_mobility en kettlebell samen, bij Vrij Trainen 2x/3x vrij
  -- trainen zelf. Een sessie buiten de capped pillars (vrij trainen bij All
  -- Access) heeft geen cap. Bijgekochte extra lessen (drop_in_payment_id)
  -- tellen niet mee. Geen check-ins: die hangen aan dezelfde boeking en
  -- zouden dubbel tellen. Walk-in (e): de staf beslist, geen cap.
  -- Rittenkaarten en onbeperkte abonnementen hebben frequency_cap null.
  if o_covering.frequency_cap is not null and not p_walk_in then
    v_capped := tmc.capped_pillars(o_covering.covered_pillars);
    -- Vangnet voor een membership zonder covered_pillars maar met een cap
    -- (hoort niet voor te komen): dan geldt de cap op de pillar zelf.
    if coalesce(cardinality(v_capped), 0) = 0 then
      v_capped := array[o_session.pillar];
    end if;
    if o_session.pillar = any (v_capped) then
      select count(*) into v_week_count
      from tmc.bookings
      where profile_id = p_uid and status = 'booked'
        and pillar = any (v_capped)
        and iso_week = o_iso_week and iso_year = o_iso_year
        and drop_in_payment_id is null;
      if v_week_count >= o_covering.frequency_cap then
        -- Betaald pad: de cap is bereikt, de extra les wordt bijgekocht.
        if p_paid_extra and o_extra_class_available then
          o_paid_path := true;
          return;
        end if;
        o_reason := 'weekly_cap_reached';
        return;
      end if;
    end if;
  end if;

  -- Op het betaalde pad zonder noodzaak (dekking en cap in orde): geen
  -- betaling nodig, de aanroeper stuurt het lid naar de gewone boeking.
  if p_paid_extra then
    o_reason := 'extra_class_not_needed';
    return;
  end if;

  if o_covering.plan_type = 'ten_ride_card' then
    o_credits_used := 1;
  end if;

  return;
end;
$function$;

comment on function tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean, boolean) is
  'Gedeelde poort voor book_class_session, join_waitlist, book_walk_in en start_extra_class_booking. Weekcap hard per abonnement over tmc.capped_pillars; met p_paid_extra worden no_coverage en weekly_cap_reached het betaalde pad (o_paid_path). Geeft prijs en beschikbaarheid van een extra les mee. Alleen postgres mag uitvoeren.';

revoke execute on function tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean, boolean)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. book_class_session: prijs en beschikbaarheid bij een weigering
-- ---------------------------------------------------------------------------
-- Live body (2026-10-26) met als enige wijziging de twee extra velden in de
-- jsonb bij weekly_cap_reached en no_coverage.

drop function tmc.book_class_session(uuid, timestamptz, integer);

create function tmc.book_class_session(
  p_session_id uuid,
  p_slot_start_at timestamptz default null,
  p_slot_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  g record;
  v_session tmc.class_sessions%rowtype;
  v_covering tmc.memberships%rowtype;
  v_booking_id uuid;
  v_waitlist_confirmed int := 0;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select * into g
  from tmc.booking_gate(v_uid, p_session_id, p_slot_start_at, p_slot_minutes, false);

  if g.o_reason is not null then
    if g.o_reason = 'capacity_full' then
      return jsonb_build_object(
        'ok', false, 'reason', 'capacity_full',
        'can_join_waitlist', g.o_can_join_waitlist);
    end if;
    if g.o_reason in ('weekly_cap_reached', 'no_coverage') then
      -- Extra les bijkopen (spec-weekcap-extra-les.md): de app toont de knop
      -- alleen met deze twee velden, de prijs komt nooit van de client.
      return jsonb_build_object(
        'ok', false, 'reason', g.o_reason,
        'extra_class_available', g.o_extra_class_available,
        'extra_class_price_cents', g.o_extra_class_price_cents);
    end if;
    return jsonb_build_object('ok', false, 'reason', g.o_reason);
  end if;

  v_session := g.o_session;
  v_covering := g.o_covering;

  begin
    insert into tmc.bookings (
      profile_id, session_id, session_date, pillar, iso_week, iso_year,
      membership_id, credits_used, status,
      slot_start_at, slot_end_at
    ) values (
      v_uid, p_session_id, g.o_session_date, v_session.pillar, g.o_iso_week, g.o_iso_year,
      v_covering.id, g.o_credits_used, 'booked',
      g.o_slot_start, g.o_slot_end
    )
    returning id into v_booking_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'already_booked');
    when raise_exception then
      -- Slot-backstop (bookings_enforce_vrij_trainen_slot). Onder de
      -- sessie-lock hierboven niet bereikbaar, maar een weigering blijft
      -- een nette reason in plaats van een exception.
      if sqlerrm in ('slot_full', 'slot_blocked') then
        return jsonb_build_object('ok', false, 'reason', sqlerrm);
      end if;
      raise;
  end;

  if g.o_credits_used > 0 then
    -- Rij is in booking_gate gelockt; de guard houdt credits >= 0.
    update tmc.memberships
    set credits_remaining = credits_remaining - g.o_credits_used
    where id = v_covering.id
      and coalesce(credits_remaining, 0) >= g.o_credits_used;
    if not found then
      raise exception 'Geen credits meer beschikbaar.' using errcode = 'P0001';
    end if;
  end if;

  -- Waitlist-resolutie (20260814): een geslaagde boeking lost de eigen
  -- open wachtlijst-entry voor deze sessie op, in dezelfde transactie als
  -- de insert. Ook een gepromoveerde entry: dat is het bevestigen.
  update tmc.waitlist_entries
  set confirmed_at = now()
  where session_id = p_session_id
    and profile_id = v_uid
    and confirmed_at is null
    and expired_at is null;
  get diagnostics v_waitlist_confirmed = row_count;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'membership_id', v_covering.id,
    'credits_used', g.o_credits_used,
    'pillar', v_session.pillar,
    'session_date', g.o_session_date,
    'slot_start_at', g.o_slot_start,
    'slot_end_at', g.o_slot_end,
    'waitlist_confirmed', v_waitlist_confirmed > 0
  );
end;
$function$;

revoke execute on function tmc.book_class_session(uuid, timestamptz, integer) from public, anon, service_role;
grant execute on function tmc.book_class_session(uuid, timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. start_extra_class_booking
-- ---------------------------------------------------------------------------
-- Maakt de pending rij voor een extra les. Alle gate-regels gelden, behalve
-- dekking en weekcap (het betaalde pad). De rij houdt de plek 20 minuten
-- vast (hold_expires_at); de server action koppelt daarna het Mollie
-- payment-id. membership_id blijft leeg: een betaalde les hangt niet aan
-- het abonnement (geen opschoning bij opzeggen of pauzeren, access_type
-- drop_in in de aanwezigheidskern). Een eigen verlopen pending rij op
-- dezelfde sessie wordt eerst gesloten, zodat een tweede poging niet op
-- already_booked strandt.

create function tmc.start_extra_class_booking(
  p_session_id uuid,
  p_slot_start_at timestamptz default null,
  p_slot_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  g record;
  v_session tmc.class_sessions%rowtype;
  v_booking_id uuid;
  v_hold timestamptz;
  v_is_test boolean;
  v_price_cents integer;
  v_vat_rate_bp integer;
  v_revenue_category text;
  v_catalogue_slug text;
  v_age text;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Eigen verlopen pending rij op deze sessie: sluiten (de cron zou dat
  -- binnen vijf minuten ook doen). Een late betaling daarop handelt de
  -- webhook af.
  update tmc.bookings
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'payment_expired'
  where profile_id = v_uid and session_id = p_session_id
    and status = 'pending_payment' and hold_expires_at < now();

  select * into g
  from tmc.booking_gate(v_uid, p_session_id, p_slot_start_at, p_slot_minutes, false, false, true);

  if g.o_reason is not null then
    if g.o_reason = 'capacity_full' then
      return jsonb_build_object(
        'ok', false, 'reason', 'capacity_full',
        'can_join_waitlist', g.o_can_join_waitlist);
    end if;
    return jsonb_build_object('ok', false, 'reason', g.o_reason);
  end if;

  if not g.o_paid_path then
    -- Hoort niet voor te komen: de gate geeft extra_class_not_needed.
    return jsonb_build_object('ok', false, 'reason', 'extra_class_not_needed');
  end if;

  v_session := g.o_session;
  select is_test, age_category into v_is_test, v_age from tmc.profiles where id = v_uid;
  select e.price_cents, e.vat_rate_bp, e.revenue_category, e.catalogue_slug
  into v_price_cents, v_vat_rate_bp, v_revenue_category, v_catalogue_slug
  from tmc.extra_class_price(v_age) e;
  if v_price_cents is null then
    return jsonb_build_object('ok', false, 'reason', 'extra_class_unavailable');
  end if;

  v_hold := now() + interval '20 minutes';

  begin
    insert into tmc.bookings (
      profile_id, session_id, session_date, pillar, iso_week, iso_year,
      membership_id, credits_used, status,
      slot_start_at, slot_end_at,
      drop_in_price_cents, hold_expires_at
    ) values (
      v_uid, p_session_id, g.o_session_date, v_session.pillar, g.o_iso_week, g.o_iso_year,
      null, 0, 'pending_payment',
      g.o_slot_start, g.o_slot_end,
      v_price_cents, v_hold
    )
    returning id into v_booking_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'already_booked');
    when raise_exception then
      if sqlerrm in ('slot_full', 'slot_blocked', 'session_capacity_exceeded') then
        return jsonb_build_object('ok', false,
          'reason', case when sqlerrm = 'session_capacity_exceeded' then 'capacity_full' else sqlerrm end);
      end if;
      raise;
  end;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'booking.extra_class_started', 'member', v_uid, 'booking', v_booking_id,
    jsonb_build_object(
      'profile_id', v_uid,
      'session_id', p_session_id,
      'subscription_membership_id', (g.o_covering).id,
      'pillar', v_session.pillar,
      'session_date', g.o_session_date,
      'price_cents', v_price_cents,
      'hold_expires_at', v_hold,
      'is_test', coalesce(v_is_test, false)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'price_cents', v_price_cents,
    'vat_rate_bp', v_vat_rate_bp,
    'revenue_category', v_revenue_category,
    'catalogue_slug', v_catalogue_slug,
    'hold_expires_at', v_hold,
    'pillar', v_session.pillar,
    'session_date', g.o_session_date,
    'slot_start_at', g.o_slot_start,
    'slot_end_at', g.o_slot_end,
    'is_test', coalesce(v_is_test, false)
  );
end;
$function$;

revoke execute on function tmc.start_extra_class_booking(uuid, timestamptz, integer) from public, anon, service_role;
grant execute on function tmc.start_extra_class_booking(uuid, timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. request_booking_refund
-- ---------------------------------------------------------------------------
-- Refund-intentie voor een betaalde extra les, naar het model van
-- cancel_trial_booking_core: alleen op een betaalde betaalregel, het
-- resterende bedrag, de partiele unique index als arbiter. De TS-kant dient
-- de intentie in bij Mollie via processPaymentRefund. Wordt aangeroepen
-- vanuit cancel_class_booking en cancel_class_session_core (als postgres)
-- en vanuit de webhook (service_role) bij een te late betaling.

create function tmc.request_booking_refund(
  p_booking_id uuid,
  p_reason text,
  p_actor_type text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_booking tmc.bookings%rowtype;
  v_pay tmc.payments%rowtype;
  v_remaining integer := 0;
  v_refund_id uuid;
begin
  select * into v_booking from tmc.bookings where id = p_booking_id;
  if not found then
    return jsonb_build_object('ok', false, 'skipped', 'booking_not_found');
  end if;
  if v_booking.drop_in_payment_id is null then
    return jsonb_build_object('ok', false, 'skipped', 'not_paid_booking');
  end if;

  select * into v_pay
  from tmc.payments
  where mollie_payment_id = v_booking.drop_in_payment_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'skipped', 'payment_missing');
  end if;
  if v_pay.status <> 'paid' then
    return jsonb_build_object('ok', false, 'skipped', 'payment_not_paid');
  end if;

  v_remaining := v_pay.amount_cents
    - greatest(
        v_pay.refunded_amount_cents,
        coalesce((select sum(r.amount_cents) from tmc.payment_refunds r
                  where r.payment_id = v_pay.id and r.status = 'refunded'), 0)
      )
    - coalesce((select sum(r.amount_cents) from tmc.payment_refunds r
                where r.payment_id = v_pay.id
                  and r.status in ('requested', 'queued', 'pending', 'processing')), 0);
  if v_remaining <= 0 then
    return jsonb_build_object('ok', false, 'skipped', 'nothing_left');
  end if;

  insert into tmc.payment_refunds (payment_id, booking_id, amount_cents, status, requested_by)
  values (v_pay.id, p_booking_id, v_remaining, 'requested', p_actor_id)
  on conflict (payment_id) where status in ('requested', 'queued', 'pending', 'processing') do nothing
  returning id into v_refund_id;

  if v_refund_id is null then
    return jsonb_build_object('ok', false, 'skipped', 'refund_already_active');
  end if;

  insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
  values (
    'booking.refund_requested', p_actor_type, p_actor_id, 'payment_refund', v_refund_id,
    jsonb_build_object(
      'payment_id', v_pay.id,
      'booking_id', p_booking_id,
      'profile_id', v_booking.profile_id,
      'amount_cents', v_remaining,
      'reason', p_reason,
      'is_test', v_pay.is_test
    )
  );

  return jsonb_build_object('ok', true, 'refund_id', v_refund_id, 'amount_cents', v_remaining);
end;
$function$;

revoke execute on function tmc.request_booking_refund(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function tmc.request_booking_refund(uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. confirm_extra_class_booking
-- ---------------------------------------------------------------------------
-- Uitkomst van de betaling, uit de webhook of de cron. Idempotent: elke
-- overgang alleen vanuit de juiste status, een herhaling geeft dezelfde
-- uitkomst zonder bijwerkingen.
--   paid op pending_payment:  booked (bevestigd).
--   paid op cancelled (hold verlopen of afgebroken): te laat. Past het lid
--     nog binnen de regels en is er plek (booking_gate met het betaalde pad,
--     onder de sessie-lock), dan alsnog booked; anders refund_needed, en de
--     webhook maakt de refund-intentie.
--   paid op booked: already_confirmed.
--   failed, expired of canceled op pending_payment: cancelled (released).
--   failed, expired of canceled op booked of cancelled: ignored.

create function tmc.confirm_extra_class_booking(
  p_booking_id uuid,
  p_mollie_payment_id text,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_booking tmc.bookings%rowtype;
  g record;
  v_minutes int;
  v_waitlist_confirmed int := 0;
begin
  if auth.uid() is not null then
    raise exception 'confirm_extra_class_booking is service-role only.' using errcode = '42501';
  end if;
  if p_outcome not in ('paid', 'failed', 'expired', 'canceled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_outcome');
  end if;

  select * into v_booking from tmc.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;
  if v_booking.drop_in_payment_id is distinct from p_mollie_payment_id then
    return jsonb_build_object('ok', false, 'reason', 'payment_mismatch');
  end if;

  if p_outcome <> 'paid' then
    if v_booking.status = 'pending_payment' then
      update tmc.bookings
      set status = 'cancelled', cancelled_at = now(),
          cancellation_reason = 'payment_' || p_outcome,
          hold_expires_at = null
      where id = p_booking_id;
      return jsonb_build_object('ok', true, 'result', 'released',
        'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
    end if;
    return jsonb_build_object('ok', true, 'result', 'ignored', 'status', v_booking.status);
  end if;

  -- paid
  if v_booking.status = 'booked' then
    return jsonb_build_object('ok', true, 'result', 'already_confirmed',
      'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
  end if;

  if v_booking.status = 'cancelled' then
    -- Te late betaling: alleen alsnog bevestigen als de gate het nu nog
    -- toelaat. De eigen geannuleerde rij telt niet als dubbelboeking.
    if v_booking.pillar = 'vrij_trainen' then
      v_minutes := extract(epoch from (v_booking.slot_end_at - v_booking.slot_start_at))::int / 60;
    end if;
    select * into g
    from tmc.booking_gate(v_booking.profile_id, v_booking.session_id,
                          v_booking.slot_start_at, v_minutes, false, false, true);
    if g.o_reason is not null and g.o_reason <> 'extra_class_not_needed' then
      return jsonb_build_object('ok', true, 'result', 'refund_needed', 'reason', g.o_reason,
        'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
    end if;
  elsif v_booking.status <> 'pending_payment' then
    return jsonb_build_object('ok', true, 'result', 'ignored', 'status', v_booking.status);
  end if;

  begin
    update tmc.bookings
    set status = 'booked', hold_expires_at = null,
        cancelled_at = null, cancellation_reason = null
    where id = p_booking_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', true, 'result', 'refund_needed', 'reason', 'already_booked',
        'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
    when raise_exception then
      if sqlerrm in ('slot_full', 'slot_blocked', 'session_capacity_exceeded') then
        return jsonb_build_object('ok', true, 'result', 'refund_needed', 'reason', sqlerrm,
          'profile_id', v_booking.profile_id, 'session_id', v_booking.session_id);
      end if;
      raise;
  end;

  update tmc.waitlist_entries
  set confirmed_at = now()
  where session_id = v_booking.session_id
    and profile_id = v_booking.profile_id
    and confirmed_at is null
    and expired_at is null;
  get diagnostics v_waitlist_confirmed = row_count;

  return jsonb_build_object(
    'ok', true,
    'result', case when v_booking.status = 'cancelled' then 'confirmed_late' else 'confirmed' end,
    'profile_id', v_booking.profile_id,
    'session_id', v_booking.session_id,
    'pillar', v_booking.pillar,
    'slot_start_at', v_booking.slot_start_at,
    'slot_end_at', v_booking.slot_end_at,
    'waitlist_confirmed', v_waitlist_confirmed > 0
  );
end;
$function$;

revoke execute on function tmc.confirm_extra_class_booking(uuid, text, text) from public, anon, authenticated;
grant execute on function tmc.confirm_extra_class_booking(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. cancel_class_booking: pending afbreken en refund binnen het venster
-- ---------------------------------------------------------------------------
-- Live body (2026-10-26) plus: (a) een eigen pending_payment-rij mag worden
-- afgebroken (cancelled, payment_canceled, geen refund); (b) een betaalde
-- extra les binnen het venster of kosteloos na een verschuiving krijgt een
-- refund-intentie (request_booking_refund); daarbuiten geen refund
-- (besluit Ilja en Marlon 2026-10-25).

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
  v_money jsonb;
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

  -- Pending extra les: afbreken, geen geld onderweg dat terug moet.
  if v_booking.status = 'pending_payment' then
    update tmc.bookings
    set status = 'cancelled', cancelled_at = now(),
        cancellation_reason = 'payment_canceled', hold_expires_at = null
    where id = p_booking_id;
    return jsonb_build_object(
      'ok', true,
      'session_id', v_booking.session_id,
      'pillar', v_booking.pillar,
      'aborted_pending', true,
      'within_window', true,
      'free_after_reschedule', false,
      'credits_refunded', false
    );
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

  -- Vrij trainen: het eigen slot is de starttijd, niet de dagsessie.
  v_start_at := coalesce(v_booking.slot_start_at, v_start_at);

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

  -- Betaalde extra les: terugbetaling binnen het venster of na een
  -- verschuiving; daarbuiten vervalt het bedrag (zoals de proefles).
  if (v_within_window or v_free_after_reschedule)
     and v_booking.drop_in_payment_id is not null then
    v_money := tmc.request_booking_refund(
      p_booking_id,
      case when v_within_window then 'Annulering binnen de termijn'
           else 'Annulering na verschuiving van de les' end,
      'member', v_uid);
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_booking.session_id,
    'pillar', v_booking.pillar,
    'within_window', v_within_window or v_free_after_reschedule,
    'free_after_reschedule', v_free_after_reschedule and not v_within_window,
    'credits_refunded', v_credits_refunded,
    'paid_extra_class', v_booking.drop_in_payment_id is not null,
    'refund_id', v_money ->> 'refund_id',
    'refund_amount_cents', (v_money ->> 'amount_cents')::integer,
    'refund_skipped', v_money ->> 'skipped'
  );
end;
$function$;

revoke execute on function tmc.cancel_class_booking(uuid) from public, anon, service_role;
grant execute on function tmc.cancel_class_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. cancel_class_session_core: betaalde extra lessen terugbetalen
-- ---------------------------------------------------------------------------
-- Live body (2026-10-26) plus: (a) betaalde extra lessen krijgen een
-- refund-intentie, de refund_id gaat mee in 'bookings' zodat de admin-
-- actie hem bij Mollie indient; (b) pending extra lessen worden
-- geannuleerd met reden session_cancelled (een late betaling treft dan
-- refund_needed in de webhook).

drop function tmc.cancel_class_session_core(uuid, text, uuid);

create function tmc.cancel_class_session_core(p_session_id uuid, p_reason text, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_session tmc.class_sessions%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_booking record;
  v_guest record;
  v_refund jsonb;
  v_money jsonb;
  v_bookings jsonb := '[]'::jsonb;
  v_waitlist jsonb := '[]'::jsonb;
  v_guests jsonb := '[]'::jsonb;
  v_refunded boolean;
  v_pending_cancelled int := 0;
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
    select id, profile_id, membership_id, credits_used, drop_in_payment_id
    from tmc.bookings
    where session_id = p_session_id and status = 'booked'
    order by booked_at
    for update
  loop
    v_refunded := false;
    v_money := null;
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

    -- Betaalde extra les: altijd terug, de studio annuleert.
    if v_booking.drop_in_payment_id is not null then
      v_money := tmc.request_booking_refund(
        v_booking.id, 'Sessie geannuleerd: ' || v_reason, 'admin', p_actor_id);
    end if;

    insert into tmc.events (type, actor_type, actor_id, subject_type, subject_id, payload)
    values ('booking.cancelled', 'admin', p_actor_id, 'booking', v_booking.id,
      jsonb_build_object('profile_id', v_booking.profile_id, 'session_id', p_session_id,
        'reason', 'session_cancelled', 'credits_refunded', v_refunded,
        'refund_id', v_money ->> 'refund_id'));

    v_bookings := v_bookings || jsonb_build_object(
      'booking_id', v_booking.id, 'profile_id', v_booking.profile_id,
      'credits_refunded', v_refunded,
      'refund_id', v_money ->> 'refund_id',
      'refund_amount_cents', (v_money ->> 'amount_cents')::integer);
  end loop;

  -- Pending extra lessen: de plek vervalt met de les. Een betaling die nog
  -- binnenkomt treft in de webhook een geannuleerde sessie en wordt
  -- terugbetaald (refund_needed).
  update tmc.bookings
  set status = 'cancelled', cancelled_at = now(),
      cancellation_reason = 'session_cancelled', hold_expires_at = null
  where session_id = p_session_id and status = 'pending_payment';
  get diagnostics v_pending_cancelled = row_count;

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
      'pending_extra_class_cancelled', v_pending_cancelled,
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
$function$;

-- Live ACL: geen enkele app-rol (de kern wordt aangeroepen door de
-- SECURITY DEFINER-wrappers van de admin-acties). Zo houden.
revoke execute on function tmc.cancel_class_session_core(uuid, text, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. v_revenue_lines: extra_class naar les_tegoed
-- ---------------------------------------------------------------------------
-- Zelfde kolommen, create or replace houdt de grants. De betaalregel van een
-- extra les heeft geen order en geen membership (besluit: anders landt hij
-- als abonnementsomzet); de categorie staat vast per kind, zoals bij de
-- proefles (spec-facturatie.md, besluitenlog 30).

create or replace view tmc.v_revenue_lines as
 select date_trunc('month'::text, p.paid_at)::date as period_month,
    p.paid_at,
    p.refunded_at,
    p.id as payment_id,
    p.profile_id,
        case
            when p.kind = 'trial_booking'::text then 'proefles'::text
            when p.kind = 'extra_class'::text then 'les_tegoed'::text
            else coalesce(cat_o.revenue_category, cat_m.revenue_category)
        end as revenue_category,
    p.vat_rate_bp,
    p.amount_cents as gross_cents,
    p.vat_amount_cents as vat_cents,
    p.net_amount_cents as net_cents,
    p.refunded_amount_cents as refunded_cents,
        case
            when p.vat_rate_bp is null then null::integer
            when p.refunded_amount_cents = 0 then 0
            when p.refunded_amount_cents = p.amount_cents then p.vat_amount_cents
            else round(p.refunded_amount_cents::numeric * p.vat_rate_bp::numeric / (10000 + p.vat_rate_bp)::numeric)::integer
        end as refunded_vat_cents,
        case
            when p.vat_rate_bp is null then null::integer
            when p.refunded_amount_cents = 0 then 0
            when p.refunded_amount_cents = p.amount_cents then p.refunded_amount_cents - p.vat_amount_cents
            else p.refunded_amount_cents - round(p.refunded_amount_cents::numeric * p.vat_rate_bp::numeric / (10000 + p.vat_rate_bp)::numeric)::integer
        end as refunded_net_cents,
    cr.credited_gross_cents,
    greatest(0::bigint, cr.credited_gross_cents - p.refunded_amount_cents) as credit_excess_cents,
    cr.last_credit_issued_at,
    p.kind,
    cr.credited_vat_cents,
    cr.credited_net_cents,
    p.is_test
   from tmc.payments p
     left join tmc.orders o on o.id = p.order_id
     left join tmc.catalogue cat_o on cat_o.slug = o.catalogue_slug
     left join tmc.memberships m on m.id = p.membership_id
     left join tmc.catalogue cat_m on cat_m.slug = m.plan_variant
     cross join lateral ( select coalesce(- sum(c.total_gross_cents), 0::bigint) as credited_gross_cents,
            coalesce(- sum(c.vat_total_cents), 0::bigint) as credited_vat_cents,
            coalesce(- sum(c.subtotal_net_cents), 0::bigint) as credited_net_cents,
            max(c.issued_at) as last_credit_issued_at
           from tmc.invoices c
             join tmc.invoices i on i.id = c.credit_of_invoice_id
          where i.payment_id = p.id and c.status = 'finalised'::text) cr
  where p.status = 'paid'::text;

-- ---------------------------------------------------------------------------
-- 13. Asserties
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text;
  v_count int;
  v_price int;
begin
  -- Status, kolom, index.
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_status_check' and conrelid = 'tmc.bookings'::regclass
      and pg_get_constraintdef(oid) like '%pending_payment%') then
    raise exception 'bookings_status_check kent pending_payment niet';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'tmc' and indexname = 'bookings_profile_session_active_key'
      and indexdef like '%pending_payment%') then
    raise exception 'bookings_profile_session_active_key telt pending_payment niet';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_kind_check' and conrelid = 'tmc.payments'::regclass
      and pg_get_constraintdef(oid) like '%extra_class%') then
    raise exception 'payments_kind_check kent extra_class niet';
  end if;

  -- Prijsfunctie op de live catalogus (alleen als de rij bestaat; op een
  -- lege shadow-database slaat de controle over, regel 6 van de README).
  if exists (select 1 from tmc.catalogue where slug = 'ten_ride_card' and is_active) then
    select price_cents into v_price from tmc.extra_class_price('adult');
    if v_price is null or v_price <= 0 then
      raise exception 'extra_class_price(adult) geeft geen prijs';
    end if;
  else
    raise notice 'extra_class_price niet gecontroleerd: geen actieve ten_ride_card';
  end if;

  -- Trigger op bookings telt pending_payment.
  select count(*) into v_count
  from pg_trigger t
  where t.tgrelid = 'tmc.bookings'::regclass and t.tgname = 'bookings_enforce_capacity'
    and encode(t.tgargs, 'escape') like '%pending_payment%';
  if v_count <> 1 then
    raise exception 'bookings_enforce_capacity telt pending_payment niet';
  end if;
  select count(*) into v_count
  from pg_trigger
  where tgfoid = 'tmc.enforce_session_capacity'::regproc and not tgisinternal;
  if v_count <> 3 then
    raise exception 'enforce_session_capacity heeft % triggers, verwacht 3', v_count;
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'bookings_enforce_vrij_trainen_slot' and tgrelid = 'tmc.bookings'::regclass) then
    raise exception 'bookings_enforce_vrij_trainen_slot ontbreekt';
  end if;

  -- Interne functies: geen app-rol.
  foreach v_name in array array[
    'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean, boolean)',
    'tmc.enforce_vrij_trainen_slot()',
    'tmc.capped_pillars(text[])'
  ] loop
    if has_function_privilege('anon', v_name, 'execute')
       or has_function_privilege('authenticated', v_name, 'execute')
       or has_function_privilege('service_role', v_name, 'execute') then
      raise exception '% is uitvoerbaar voor een app-rol', v_name;
    end if;
  end loop;
  if to_regprocedure('tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)') is not null then
    raise exception 'oude booking_gate bestaat nog';
  end if;

  -- Leden-RPC's: authenticated wel, anon en service_role niet.
  foreach v_name in array array[
    'tmc.book_class_session(uuid, timestamptz, integer)',
    'tmc.start_extra_class_booking(uuid, timestamptz, integer)',
    'tmc.cancel_class_booking(uuid)',
    'tmc.join_waitlist(uuid)',
    'tmc.book_walk_in(uuid, uuid)'
  ] loop
    if has_function_privilege('anon', v_name, 'execute') then
      raise exception '% is uitvoerbaar voor anon', v_name;
    end if;
    if not has_function_privilege('authenticated', v_name, 'execute') then
      raise exception '% is niet uitvoerbaar voor authenticated', v_name;
    end if;
  end loop;

  -- Kern zonder app-rol, zoals live.
  v_name := 'tmc.cancel_class_session_core(uuid, text, uuid)';
  if has_function_privilege('anon', v_name, 'execute')
     or has_function_privilege('authenticated', v_name, 'execute')
     or has_function_privilege('service_role', v_name, 'execute') then
    raise exception 'cancel_class_session_core is uitvoerbaar voor een app-rol';
  end if;

  -- Systeem-RPC's: alleen service_role.
  foreach v_name in array array[
    'tmc.confirm_extra_class_booking(uuid, text, text)',
    'tmc.request_booking_refund(uuid, text, text, uuid)'
  ] loop
    if has_function_privilege('anon', v_name, 'execute')
       or has_function_privilege('authenticated', v_name, 'execute') then
      raise exception '% is uitvoerbaar voor anon of authenticated', v_name;
    end if;
    if not has_function_privilege('service_role', v_name, 'execute') then
      raise exception '% is niet uitvoerbaar voor service_role', v_name;
    end if;
  end loop;

  -- Prijsfunctie: authenticated en service_role, niet anon.
  v_name := 'tmc.extra_class_price(text)';
  if has_function_privilege('anon', v_name, 'execute')
     or not has_function_privilege('authenticated', v_name, 'execute')
     or not has_function_privilege('service_role', v_name, 'execute') then
    raise exception 'extra_class_price heeft de verkeerde rechten';
  end if;

  -- RLS-les PR #179: een lid kan geen pending of betaalde boeking inserten
  -- of zijn eigen rij op booked zetten. Geen INSERT of UPDATE op bookings
  -- voor anon of authenticated (tabel noch kolom), en geen schrijfpolicy
  -- buiten admin.
  select count(*) into v_count
  from information_schema.table_privileges
  where table_schema = 'tmc' and table_name in ('bookings', 'payments', 'payment_refunds')
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if v_count <> 0 then
    raise exception 'anon of authenticated kan bookings, payments of payment_refunds schrijven';
  end if;
  select count(*) into v_count
  from information_schema.column_privileges
  where table_schema = 'tmc' and table_name in ('bookings', 'payments', 'payment_refunds')
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE');
  if v_count <> 0 then
    raise exception 'anon of authenticated heeft kolomrechten om bookings, payments of payment_refunds te schrijven';
  end if;
  select count(*) into v_count
  from pg_policies
  where schemaname = 'tmc' and tablename = 'bookings'
    and cmd in ('INSERT', 'UPDATE', 'ALL')
    and policyname <> 'bookings_admin_all';
  if v_count <> 0 then
    raise exception 'bookings heeft een schrijfpolicy buiten bookings_admin_all';
  end if;

  -- Omzetview kent extra_class.
  if pg_get_viewdef('tmc.v_revenue_lines'::regclass) not ilike '%extra_class%' then
    raise exception 'v_revenue_lines kent extra_class niet';
  end if;
end;
$$;
