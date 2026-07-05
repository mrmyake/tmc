-- Onbeperkte capaciteit voor kettlebell-lessen, end-to-end.
-- Besluit: kettlebell is de enige les met onbeperkte capaciteit, getoond als
-- absolute aantallen en uitgesloten van bezettings-KPI's.
-- NULL in capacity betekent onbeperkt. De booking-RPC slaat bij NULL de
-- capaciteitscheck en het waitlist-pad over; alle overige checks blijven
-- ongewijzigd. Gebaseerd op de live definities (pg_get_functiondef /
-- pg_get_viewdef / pg_matviews) van 2026-07-05.

-- 1. Capaciteitskolommen nullable maken. NULL betekent onbeperkt.

alter table tmc.class_sessions alter column capacity drop not null;
alter table tmc.schedule_templates alter column capacity drop not null;

comment on column tmc.class_sessions.capacity is
  'Maximaal aantal boekingen. NULL betekent onbeperkt (alleen kettlebell).';
comment on column tmc.schedule_templates.capacity is
  'Capaciteit voor gematerialiseerde sessies. NULL betekent onbeperkt (alleen kettlebell).';

-- 2. Data: kettlebell-lestypes, actieve templates en toekomstige scheduled
--    sessies naar onbeperkt. Bestaande boekingen blijven onaangeroerd; er
--    staan geen waitlist-entries op kettlebell-sessies (live geverifieerd).

update tmc.class_types
set default_capacity = null
where pillar = 'kettlebell';

update tmc.schedule_templates t
set capacity = null
from tmc.class_types ct
where ct.id = t.class_type_id
  and ct.pillar = 'kettlebell';

update tmc.class_sessions
set capacity = null
where pillar = 'kettlebell'
  and start_at > now()
  and status = 'scheduled';

-- 3. book_class_session: identiek aan de live definitie, met als enige
--    logica-wijziging dat de capaciteitstelling en de capacity_full-uitkomst
--    (het waitlist-pad) worden overgeslagen wanneer capacity NULL is.

create or replace function tmc.book_class_session(p_session_id uuid, p_rental_mat boolean default false, p_rental_towel boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_session tmc.class_sessions%rowtype;
  v_profile_age text;
  v_settings record;
  v_session_date date;
  v_iso_week int;
  v_iso_year int;
  v_booked_count int;
  v_same_day_count int;
  v_pillar_week_count int;
  v_strikes record;
  v_check_in_for_pillar boolean;
  v_covering tmc.memberships%rowtype;
  v_credits_used int := 0;
  v_rental_mat boolean;
  v_rental_towel boolean;
  v_booking_id uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  -- Lock op de sessie-rij: serialiseert capaciteits-checks en pint de
  -- status/start_at vast voor de duur van deze transactie (edge-cases 2 en 5).
  select * into v_session
  from tmc.class_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  select age_category into v_profile_age
  from tmc.profiles where id = v_uid;
  if v_profile_age is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  select
    coalesce(bs.booking_window_days, 14)        as booking_window_days,
    coalesce(bs.fair_use_daily_max, 2)          as fair_use_daily_max,
    coalesce(bs.no_show_strike_threshold, 3)    as no_show_strike_threshold,
    coalesce(bs.no_show_block_days, 7)          as no_show_block_days,
    coalesce(bs.check_in_enabled, true)         as check_in_enabled,
    coalesce(bs.check_in_pillars,
      array['yoga_mobility','kettlebell','vrij_trainen']) as check_in_pillars
  into v_settings
  from tmc.booking_settings bs
  limit 1;
  if not found then
    select 14 as booking_window_days,
           2 as fair_use_daily_max,
           3 as no_show_strike_threshold,
           7 as no_show_block_days,
           true as check_in_enabled,
           array['yoga_mobility','kettlebell','vrij_trainen'] as check_in_pillars
    into v_settings;
  end if;

  -- Zelfde datum/week-berekening als de TS-laag (die op Vercel in UTC draait).
  v_session_date := (v_session.start_at at time zone 'utc')::date;
  v_iso_week := extract(week from v_session_date)::int;
  v_iso_year := extract(isoyear from v_session_date)::int;

  -- Checks in dezelfde volgorde als canBook() (src/lib/member/can-book.ts).
  if v_profile_age <> v_session.age_category then
    return jsonb_build_object('ok', false, 'reason', 'age_mismatch');
  end if;

  if v_session.start_at > now() + make_interval(days => v_settings.booking_window_days) then
    return jsonb_build_object('ok', false, 'reason', 'booking_window_closed');
  end if;

  if v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'reason', 'session_not_scheduled');
  end if;

  if v_session.start_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_in_past');
  end if;

  -- Dubbelboeking (edge-case 1): expliciete check; de unique constraint
  -- (profile_id, session_id) vangt de race af.
  if exists (
    select 1 from tmc.bookings
    where profile_id = v_uid and session_id = p_session_id
      and status in ('booked', 'waitlisted')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end if;

  -- Capaciteit, geteld onder de sessie-lock (edge-case 2). NULL betekent
  -- onbeperkt (alleen kettlebell): de telling en de capacity_full-uitkomst
  -- met het waitlist-pad worden dan volledig overgeslagen; een onbeperkte
  -- sessie is nooit vol.
  if v_session.capacity is not null then
    select count(*) into v_booked_count
    from tmc.bookings
    where session_id = p_session_id and status = 'booked';

    if v_booked_count >= v_session.capacity then
      return jsonb_build_object(
        'ok', false, 'reason', 'capacity_full', 'can_join_waitlist', true);
    end if;
  end if;

  -- Strike-blokkade.
  select strike_count, last_strike_at into v_strikes
  from tmc.v_active_strikes where profile_id = v_uid;
  if found
    and v_strikes.strike_count >= v_settings.no_show_strike_threshold
    and v_strikes.last_strike_at
        + make_interval(days => v_settings.no_show_block_days) > now()
  then
    return jsonb_build_object('ok', false, 'reason', 'strike_blocked');
  end if;

  -- Daily fair-use cap.
  select count(*) into v_same_day_count
  from tmc.bookings
  where profile_id = v_uid and status = 'booked'
    and session_date = v_session_date;
  if v_same_day_count >= v_settings.fair_use_daily_max then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap_reached');
  end if;

  -- Dekking: eerst een dekkend abonnement zonder credits, anders een
  -- ten-rittenkaart met credits. De membership-rij wordt gelockt zodat de
  -- credit-decrement niet kan racen (edge-cases 3 en 4). Een opgezegd lid
  -- (cancellation_requested) houdt dekking t/m de effective date.
  select m.* into v_covering
  from tmc.memberships m
  where m.profile_id = v_uid
    and (
      m.status = 'active'
      or (m.status = 'cancellation_requested'
          and m.cancellation_effective_date is not null
          and m.cancellation_effective_date >= v_session_date)
    )
    and tmc.plan_covers(m.plan_type, v_session.pillar)
    and (m.plan_type <> 'ten_ride_card' or coalesce(m.credits_remaining, 0) > 0)
  order by (m.plan_type = 'ten_ride_card') asc, m.start_date desc
  limit 1
  for update of m;

  if v_covering.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_coverage');
  end if;

  -- Weekly cap: alleen de harde variant (besluit #1, optie B), pillars
  -- zonder check-in. Voor check-in-pillars is de combined-cap een TS-nudge.
  v_check_in_for_pillar := v_settings.check_in_enabled
    and v_session.pillar = any (v_settings.check_in_pillars);

  if v_covering.frequency_cap is not null and not v_check_in_for_pillar then
    select count(*) into v_pillar_week_count
    from tmc.bookings
    where profile_id = v_uid and status = 'booked'
      and pillar = v_session.pillar
      and iso_week = v_iso_week and iso_year = v_iso_year;
    if v_pillar_week_count >= v_covering.frequency_cap then
      return jsonb_build_object('ok', false, 'reason', 'weekly_cap_reached');
    end if;
  end if;

  if v_covering.plan_type = 'ten_ride_card' then
    v_credits_used := 1;
  end if;

  -- Rentals alleen op yoga_mobility; overige pillars stil negeren (spec).
  v_rental_mat := v_session.pillar = 'yoga_mobility' and coalesce(p_rental_mat, false);
  v_rental_towel := v_session.pillar = 'yoga_mobility' and coalesce(p_rental_towel, false);

  begin
    insert into tmc.bookings (
      profile_id, session_id, session_date, pillar, iso_week, iso_year,
      membership_id, credits_used, status, rental_mat, rental_towel
    ) values (
      v_uid, p_session_id, v_session_date, v_session.pillar, v_iso_week, v_iso_year,
      v_covering.id, v_credits_used, 'booked', v_rental_mat, v_rental_towel
    )
    returning id into v_booking_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_booked');
  end;

  if v_credits_used > 0 then
    -- Rij is hierboven gelockt; de guard houdt credits >= 0 (edge-case 3).
    update tmc.memberships
    set credits_remaining = credits_remaining - v_credits_used
    where id = v_covering.id
      and coalesce(credits_remaining, 0) >= v_credits_used;
    if not found then
      raise exception 'Geen credits meer beschikbaar.' using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'membership_id', v_covering.id,
    'credits_used', v_credits_used,
    'pillar', v_session.pillar,
    'session_date', v_session_date
  );
end;
$function$;

-- 4. v_session_availability: expliciete NULL-case. Bij onbeperkte capaciteit
--    is spots_available NULL (consumers tonen dan absolute aantallen); de
--    eindige gevallen veranderen niet.

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
    count(b.id) filter (where b.status = 'booked'::text) as booked_count,
    case
      when cs.capacity is null then null
      else cs.capacity
        - count(b.id) filter (where b.status = 'booked'::text)
        - count(tb.id) filter (where tb.status = any (array['pending'::text, 'paid'::text, 'attended'::text]))
    end as spots_available,
    count(w.id) filter (where w.confirmed_at is null and w.expired_at is null) as waitlist_count
   from tmc.class_sessions cs
     left join tmc.bookings b on b.session_id = cs.id
     left join tmc.waitlist_entries w on w.session_id = cs.id
     left join tmc.trial_bookings tb on tb.session_id = cs.id
  where cs.status = 'scheduled'::text
  group by cs.id;

-- 5. vw_admin_kpis: fill_rate_week sluit onbeperkte sessies uit
--    (capacity is not null) en de inerte filtertakken op de bookingstatussen
--    attended/no_show zijn opgeruimd (de live check-constraint staat alleen
--    booked/cancelled/waitlisted toe, dus het filter was effectief alleen
--    booked). De no_show_rate_30d-CTE blijft bewust letterlijk ongemoeid;
--    zie de losse bevinding daarover. Materialized view kan niet via
--    create or replace; drop en recreate met dezelfde unieke index (vereist
--    voor refresh concurrently) en dezelfde grants. get_admin_kpis
--    retourneert het rowtype van de matview en moet daarom mee in de
--    drop-en-recreate; de definitie hieronder is letterlijk de live versie.

drop function tmc.get_admin_kpis();
drop materialized view tmc.vw_admin_kpis;

create materialized view tmc.vw_admin_kpis as
 with active_members as (
         select count(*) as count
           from tmc.memberships
          where (memberships.status = 'active'::text)
        ), mrr as (
         select (coalesce(sum((((memberships.price_per_cycle_cents)::numeric * 30.4375) / ((memberships.billing_cycle_weeks * 7))::numeric)), (0)::numeric))::bigint as cents
           from tmc.memberships
          where (memberships.status = 'active'::text)
        ), new_signups_week as (
         select count(*) as count
           from tmc.memberships
          where (memberships.created_at >= (now() - '7 days'::interval))
        ), new_signups_month as (
         select count(*) as count
           from tmc.memberships
          where (memberships.created_at >= (now() - '30 days'::interval))
        ), churn_30d as (
         select count(*) as count
           from tmc.memberships
          where ((memberships.status = any (array['cancelled'::text, 'expired'::text])) and (memberships.cancellation_effective_date >= ((current_date - '30 days'::interval))::date) and (memberships.cancellation_effective_date <= current_date))
        ), active_pauses as (
         select count(*) as count
           from tmc.membership_pauses
          where ((membership_pauses.status = 'active'::text) and (membership_pauses.end_date >= current_date))
        ), fill_rate_week as (
         select coalesce(avg(
                case
                    when (s.capacity > 0) then (( select (count(*))::numeric as count
                       from tmc.bookings b
                      where ((b.session_id = s.id) and (b.status = 'booked'::text))) / (s.capacity)::numeric)
                    else (0)::numeric
                end), (0)::numeric) as ratio
           from tmc.class_sessions s
          where ((s.start_at >= (now() - '7 days'::interval)) and (s.start_at < now()) and (s.pillar <> 'vrij_trainen'::text) and (s.capacity is not null))
        ), no_show_rate_30d as (
         select coalesce(((count(*) filter (where (bookings.status = 'no_show'::text)))::numeric / (nullif(count(*) filter (where (bookings.status = any (array['attended'::text, 'no_show'::text]))), 0))::numeric), (0)::numeric) as ratio
           from tmc.bookings
          where (bookings.booked_at >= (now() - '30 days'::interval))
        ), crowdfunding_conversion as (
         select count(distinct b.email) as total_backers,
            count(distinct
                case
                    when (m.id is not null) then b.email
                    else null::text
                end) as converted_members
           from ((tmc.crowdfunding_backers b
             left join tmc.profiles p on ((lower(p.email) = lower(b.email))))
             left join tmc.memberships m on (((m.profile_id = p.id) and (m.status = 'active'::text))))
          where (b.payment_status = 'paid'::text)
        )
 select ( select active_members.count
           from active_members) as active_members,
    ( select mrr.cents
           from mrr) as mrr_cents,
    ( select new_signups_week.count
           from new_signups_week) as new_signups_week,
    ( select new_signups_month.count
           from new_signups_month) as new_signups_month,
    ( select churn_30d.count
           from churn_30d) as churn_30d,
    ( select active_pauses.count
           from active_pauses) as active_pauses,
    round((( select fill_rate_week.ratio
           from fill_rate_week) * (100)::numeric), 1) as fill_rate_week_pct,
    round((( select no_show_rate_30d.ratio
           from no_show_rate_30d) * (100)::numeric), 1) as no_show_rate_30d_pct,
    ( select crowdfunding_conversion.total_backers
           from crowdfunding_conversion) as crowdfunding_total_backers,
    ( select crowdfunding_conversion.converted_members
           from crowdfunding_conversion) as crowdfunding_converted_members,
    now() as refreshed_at;

create unique index vw_admin_kpis_refresh_idx
  on tmc.vw_admin_kpis using btree (((refreshed_at is not null)));

grant select, insert, update, delete on tmc.vw_admin_kpis to anon;
grant select, insert, update, delete on tmc.vw_admin_kpis to authenticated;
grant all on tmc.vw_admin_kpis to service_role;

create or replace function tmc.get_admin_kpis()
returns tmc.vw_admin_kpis
language plpgsql
security definer
set search_path to 'tmc', 'extensions'
as $function$
declare
  result tmc.vw_admin_kpis;
begin
  if not tmc.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  select * into result from tmc.vw_admin_kpis limit 1;
  return result;
end;
$function$;

grant execute on function tmc.get_admin_kpis() to anon;
grant execute on function tmc.get_admin_kpis() to authenticated;
grant execute on function tmc.get_admin_kpis() to service_role;
