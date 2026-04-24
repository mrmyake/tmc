-- Materialized view voor admin-dashboard KPI's. Vervangt de 12
-- parallelle queries die /app/admin nu op elke paint doet door één
-- RPC-call. Ververst dagelijks via Vercel Cron (Hobby-constraint: geen
-- sub-daily crons).
--
-- De view pakt bewust alleen "snapshot" metrics die 24u stale mogen
-- zijn (MRR, active members, churn-week, fill-rate). Real-time
-- metrics (bookings vandaag, open pauze-verzoeken, failed payments)
-- blijven live-queries op /app/admin, aangezien de admin ze bij
-- openings-check moet kunnen vertrouwen.
--
-- Schema-references gematched op onze live tabellen:
--   bookings.session_id (niet class_session_id)
--   memberships.price_per_cycle_cents + billing_cycle_weeks (geen catalogue-FK)
--   membership_pauses.status in ('pending', 'approved', 'active', 'completed')
--   trainers.display_name (niet name)
--
-- MRR-normalisatie: price_per_cycle_cents × 30.4375 / (billing_cycle_weeks × 7)
-- = monthly-equivalent in cents. 30.4375 = gemiddeld aantal dagen/maand.

create materialized view if not exists public.vw_admin_kpis as
with
  active_members as (
    select count(*)::bigint as count
    from public.memberships
    where status = 'active'
  ),
  mrr as (
    select coalesce(
      sum(
        price_per_cycle_cents::numeric * 30.4375
          / (billing_cycle_weeks * 7)
      ),
      0
    )::bigint as cents
    from public.memberships
    where status = 'active'
  ),
  new_signups_week as (
    select count(*)::bigint as count
    from public.memberships
    where created_at >= now() - interval '7 days'
  ),
  new_signups_month as (
    select count(*)::bigint as count
    from public.memberships
    where created_at >= now() - interval '30 days'
  ),
  churn_30d as (
    select count(*)::bigint as count
    from public.memberships
    where status in ('cancelled', 'expired')
      and cancellation_effective_date >= (current_date - interval '30 days')::date
      and cancellation_effective_date <= current_date
  ),
  active_pauses as (
    select count(*)::bigint as count
    from public.membership_pauses
    where status = 'active'
      and end_date >= current_date
  ),
  fill_rate_week as (
    -- Gem. bezetting (%) voor sessies van afgelopen 7 dagen die al
    -- afgerond zijn. Excludeert vrij-trainen (capacity 99, vertekent).
    select coalesce(
      avg(
        case
          when s.capacity > 0 then (
            select count(*)::numeric
            from public.bookings b
            where b.session_id = s.id
              and b.status in ('booked', 'attended', 'no_show')
          ) / s.capacity
          else 0
        end
      ),
      0
    ) as ratio
    from public.class_sessions s
    where s.start_at >= now() - interval '7 days'
      and s.start_at < now()
      and s.pillar <> 'vrij_trainen'
  ),
  no_show_rate_30d as (
    select coalesce(
      count(*) filter (where status = 'no_show')::numeric
        / nullif(
            count(*) filter (where status in ('attended', 'no_show')),
            0
          ),
      0
    ) as ratio
    from public.bookings
    where booked_at >= now() - interval '30 days'
  ),
  crowdfunding_conversion as (
    select
      count(distinct b.email)::bigint as total_backers,
      count(distinct case when m.id is not null then b.email end)::bigint
        as converted_members
    from public.crowdfunding_backers b
    left join public.profiles p on lower(p.email) = lower(b.email)
    left join public.memberships m on m.profile_id = p.id and m.status = 'active'
    where b.payment_status = 'paid'
  )
select
  (select count from active_members)          as active_members,
  (select cents from mrr)                     as mrr_cents,
  (select count from new_signups_week)        as new_signups_week,
  (select count from new_signups_month)       as new_signups_month,
  (select count from churn_30d)               as churn_30d,
  (select count from active_pauses)           as active_pauses,
  round((select ratio from fill_rate_week) * 100, 1)
                                              as fill_rate_week_pct,
  round((select ratio from no_show_rate_30d) * 100, 1)
                                              as no_show_rate_30d_pct,
  (select total_backers from crowdfunding_conversion)
                                              as crowdfunding_total_backers,
  (select converted_members from crowdfunding_conversion)
                                              as crowdfunding_converted_members,
  now() as refreshed_at;

-- Unique index noodzakelijk voor REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- Elke refresh zal vervolgens niet-blocking zijn voor concurrent selects.
create unique index if not exists vw_admin_kpis_refresh_idx
  on public.vw_admin_kpis ((refreshed_at is not null));

-- ----------------------------------------------------------------------------
-- RPC: get_admin_kpis — admin-only access, returns de enige rij.
-- ----------------------------------------------------------------------------

create or replace function public.get_admin_kpis()
returns public.vw_admin_kpis
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.vw_admin_kpis;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  select * into result from public.vw_admin_kpis limit 1;
  return result;
end;
$$;

grant execute on function public.get_admin_kpis() to authenticated;

-- ----------------------------------------------------------------------------
-- RPC: refresh_admin_kpis — aangeroepen door de Vercel Cron route.
-- Security-definer zodat de cron via service-role kan refreshen zonder
-- expliciete rechten op de materialized view.
-- ----------------------------------------------------------------------------

create or replace function public.refresh_admin_kpis()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.vw_admin_kpis;
end;
$$;

-- ----------------------------------------------------------------------------
-- Eerste refresh zodat de view niet leeg is tot de eerste cron-tick.
-- ----------------------------------------------------------------------------

refresh materialized view public.vw_admin_kpis;
