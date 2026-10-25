-- Harde weekcap per abonnement (spec-weekcap-extra-les.md, PR A).
--
-- Aanleiding: tmc.booking_gate telde de weekcap alleen voor pillars buiten
-- booking_settings.check_in_pillars, en live staan alle drie de pillars in
-- die lijst. De cap bestond dus alleen als zachte melding in de app. Daarnaast
-- telde de gate per pillar, waardoor Groepslessen 2x in de praktijk 2 yoga
-- plus 2 kettlebell zou betekenen zodra de cap hard werd.
--
-- Inhoud, in deze volgorde:
--   1. tmc.capped_pillars(text[]): welke pillars onder de cap van een
--      membership vallen, afgeleid uit memberships.covered_pillars. Bevat de
--      dekking een groepspillar (yoga_mobility of kettlebell), dan zijn alleen
--      de groepspillars capped en valt vrij_trainen buiten de cap (All Access:
--      vrij trainen onbeperkt, groepslessen samen geteld). Anders zijn alle
--      gedekte pillars capped (Vrij Trainen 2x/3x houdt zijn cap).
--   2. tmc.booking_gate: drop en recreate op basis van de live definitie
--      (pg_get_functiondef, 2026-10-25), signatuur en OUT-parameters identiek,
--      zodat book_class_session, join_waitlist en book_walk_in ongewijzigd
--      blijven. Wijzigingen ten opzichte van live, letterlijk:
--        a. de weekcap is hard voor elke pillar, check_in_pillars speelt geen
--           rol meer (de settings-kolommen worden niet meer gelezen);
--        b. de telling loopt over de capped pillars van de dekkende membership
--           in plaats van over de pillar van de sessie;
--        c. een sessie in een niet-capped pillar (vrij trainen bij All Access)
--           doet geen cap-check;
--        d. bijgekochte extra lessen (bookings.drop_in_payment_id gevuld, PR B)
--           tellen niet mee;
--        e. met p_walk_in wordt de cap overgeslagen (besluit Ilja 2026-10-25:
--           na lesstart kan het lid niet zelf boeken, de staf beslist).
--      Alles daarbuiten (slotregels, leeftijd, venster, status, verleden,
--      dubbelboeking, capaciteit, slotgrens, strikes, dagcap, dekking,
--      rittenkaart) is ongewijzigd. Het p_for_waitlist-pad loopt door dezelfde
--      cap-check, dus inschrijven op en bevestigen van een wachtlijstplek boven
--      de cap wordt geweigerd.
--   3. Grants en asserties.
--
-- Schema uitsluitend tmc. Geen app-data nodig (regel 6 van de README).

-- ---------------------------------------------------------------------------
-- 1. capped_pillars
-- ---------------------------------------------------------------------------

create function tmc.capped_pillars(p_covered text[])
returns text[]
language sql
immutable
as $function$
  select case
    when p_covered is null then '{}'::text[]
    when p_covered && array['yoga_mobility', 'kettlebell']
      then array(
        select p from unnest(p_covered) as p
        where p in ('yoga_mobility', 'kettlebell')
        order by p)
    else p_covered
  end;
$function$;

comment on function tmc.capped_pillars(text[]) is
  'Pillars die onder de weekcap van een membership vallen, afgeleid uit covered_pillars (spec-weekcap-extra-les.md). Met een groepspillar erin: alleen de groepspillars, samen geteld; vrij_trainen valt dan buiten de cap. Anders alle gedekte pillars. TS-spiegel: cappedPillars() in src/lib/member/plan-coverage.ts.';

-- Interne helper: alleen de eigenaar (postgres) roept hem aan, vanuit
-- booking_gate. Expliciet dicht, ook al doet de event trigger dat al.
revoke execute on function tmc.capped_pillars(text[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. booking_gate met harde weekcap per abonnement
-- ---------------------------------------------------------------------------
-- Live (pg_get_functiondef, 2026-10-25): niet SECURITY DEFINER, search_path
-- tmc, extensions, ACL {postgres=X/postgres}. plpgsql-aanroepers binden op
-- naam bij uitvoering, dus drop en recreate raakt ze niet.

drop function tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean);

create function tmc.booking_gate(
  p_uid uuid,
  p_session_id uuid,
  p_slot_start_at timestamptz,
  p_slot_minutes integer,
  p_for_waitlist boolean,
  p_walk_in boolean default false,
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
  out o_credits_used integer
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
begin
  o_reason := null;
  o_capacity_full := false;
  o_can_join_waitlist := false;
  o_credits_used := 0;

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
  -- bookings_profile_session_active_key vangt de race af.
  if exists (
    select 1 from tmc.bookings
    where profile_id = p_uid and session_id = p_session_id
      and status in ('booked', 'waitlisted')
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
  if not o_is_vrij then
    select count(*) into v_same_day_count
    from tmc.bookings
    where profile_id = p_uid and status = 'booked'
      and session_date = o_session_date
      and pillar <> 'vrij_trainen';
    if v_same_day_count >= v_settings.fair_use_daily_max then
      o_reason := 'daily_cap_reached';
      return;
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
    o_reason := 'no_coverage';
    return;
  end if;

  -- Weekcap, hard en per abonnement (spec-weekcap-extra-les.md). Telt de
  -- eigen boekingen in de ISO-week van de sessie over de capped pillars van
  -- de dekkende membership: bij een groepsabonnement en bij All Access zijn
  -- dat yoga_mobility en kettlebell samen, bij Vrij Trainen 2x/3x vrij
  -- trainen zelf. Een sessie buiten de capped pillars (vrij trainen bij All
  -- Access) heeft geen cap. Bijgekochte extra lessen (drop_in_payment_id,
  -- PR B) tellen niet mee. Geen check-ins: die hangen aan dezelfde boeking
  -- en zouden dubbel tellen. Walk-in (e): de staf beslist, geen cap.
  -- Rittenkaarten en onbeperkte abonnementen hebben frequency_cap null.
  if o_covering.frequency_cap is not null and not p_walk_in then
    v_capped := tmc.capped_pillars(o_covering.covered_pillars);
    -- Vangnet voor een membership zonder covered_pillars maar met een cap
    -- (hoort niet voor te komen): dan geldt de cap op de pillar zelf, het
    -- gedrag van voor deze migratie.
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
        o_reason := 'weekly_cap_reached';
        return;
      end if;
    end if;
  end if;

  if o_covering.plan_type = 'ten_ride_card' then
    o_credits_used := 1;
  end if;

  return;
end;
$function$;

comment on function tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean) is
  'Gedeelde poort voor book_class_session, join_waitlist en book_walk_in. Sinds 20261025120000 is de weekcap hard voor elke pillar en telt hij per abonnement over tmc.capped_pillars(covered_pillars); walk-ins slaan de cap over. Alleen postgres mag uitvoeren.';

-- Live ACL was {postgres=X/postgres}: geen app-rol mag de poort direct
-- aanroepen. De drie RPC's zijn SECURITY DEFINER (eigenaar postgres).
revoke execute on function tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Asserties: afleiding, signatuur, grants, aanroepers
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text;
  v_count int;
begin
  -- capped_pillars: de vier vormen die live voorkomen plus de randen.
  if tmc.capped_pillars(array['vrij_trainen', 'yoga_mobility', 'kettlebell'])
     <> array['kettlebell', 'yoga_mobility'] then
    raise exception 'capped_pillars: All Access hoort alleen de groepspillars te cappen';
  end if;
  if tmc.capped_pillars(array['yoga_mobility', 'kettlebell'])
     <> array['kettlebell', 'yoga_mobility'] then
    raise exception 'capped_pillars: groepslessen hoort beide groepspillars te cappen';
  end if;
  if tmc.capped_pillars(array['vrij_trainen']) <> array['vrij_trainen'] then
    raise exception 'capped_pillars: vrij trainen hoort zijn eigen cap te houden';
  end if;
  if tmc.capped_pillars(array['kids']) <> array['kids'] then
    raise exception 'capped_pillars: kids hoort ongewijzigd te blijven';
  end if;
  if tmc.capped_pillars('{}'::text[]) <> '{}'::text[]
     or tmc.capped_pillars(null) <> '{}'::text[] then
    raise exception 'capped_pillars: leeg of null hoort leeg te geven';
  end if;

  -- booking_gate: zes IN-parameters, geen SECURITY DEFINER, alleen postgres.
  v_name := 'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)';
  if to_regprocedure(v_name) is null then
    raise exception 'booking_gate ontbreekt';
  end if;
  if (select prosecdef from pg_proc where oid = to_regprocedure(v_name)) then
    raise exception 'booking_gate hoort geen SECURITY DEFINER te zijn';
  end if;
  foreach v_name in array array[
    'tmc.booking_gate(uuid, uuid, timestamptz, integer, boolean, boolean)',
    'tmc.capped_pillars(text[])'
  ] loop
    if has_function_privilege('anon', v_name, 'execute')
       or has_function_privilege('authenticated', v_name, 'execute')
       or has_function_privilege('service_role', v_name, 'execute') then
      raise exception '% is uitvoerbaar voor een app-rol', v_name;
    end if;
  end loop;

  -- De drie aanroepers bestaan nog met hun grants (ongewijzigd door deze
  -- migratie, maar ze binden op naam en moeten de nieuwe poort vinden).
  foreach v_name in array array[
    'tmc.book_class_session(uuid, timestamptz, integer)',
    'tmc.join_waitlist(uuid)',
    'tmc.book_walk_in(uuid, uuid)'
  ] loop
    if to_regprocedure(v_name) is null then
      raise exception '% ontbreekt', v_name;
    end if;
    if not has_function_privilege('authenticated', v_name, 'execute') then
      raise exception '% is niet uitvoerbaar voor authenticated', v_name;
    end if;
    if has_function_privilege('anon', v_name, 'execute') then
      raise exception '% is uitvoerbaar voor anon', v_name;
    end if;
  end loop;

  -- De telling leunt op drop_in_payment_id (bestaat sinds de baseline).
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'tmc' and table_name = 'bookings'
    and column_name = 'drop_in_payment_id';
  if v_count <> 1 then
    raise exception 'bookings.drop_in_payment_id ontbreekt';
  end if;
end;
$$;
