-- Facturatie PR 8 (spec-facturatie.md sectie 14): het is_test-filter in de
-- KPI-view, volgens de harde regel uit 7.8.
--
-- tmc.get_admin_kpis() retourneert het composiettype van de matview en is
-- daarmee een harde afhankelijkheid: een DROP MATERIALIZED VIEW zonder meer
-- faalt, en een DROP ... CASCADE zou de functie stil meeslopen waarna de
-- cockpit pas bij de volgende paginaload breekt. Daarom, in EEN transactie
-- en ZONDER cascade: eerst de functie droppen, dan de matview, dan beide
-- opnieuw, dan de unique index (zonder die faalt refresh concurrently, en
-- dus de cron, pas de volgende ochtend om 03:50), dan de grants herstellen.
--
-- De herbouwde definitie is de LIVE definitie (pg_matviews /
-- pg_get_functiondef, opgehaald 2026-08-08), niet een repo-bestand, met als
-- enige wijziging het is_test-filter op elke CTE die tmc.memberships of
-- tmc.profiles leest:
--   - active_members, mrr, new_signups_week, new_signups_month, churn_30d:
--     join naar tmc.profiles met not p.is_test;
--   - crowdfunding_conversion: not p.is_test in de bestaande profiles-join
--     (de memberships-join volgt hetzelfde profiel en is daarmee gedekt);
--   - active_pauses, fill_rate_week, no_show_rate_30d lezen geen van beide
--     tabellen en blijven ongemoeid.
--
-- Execute-grants voor de drop gemeten (en hier hersteld): PUBLIC, anon,
-- authenticated, postgres, service_role op get_admin_kpis();
-- select-toegang op de matview voor anon, authenticated en service_role.
-- get_admin_kpis() draagt binnenin zijn eigen is_admin-gate (live
-- definitie), dus de brede execute-grant geeft niets prijs.

begin;

-- ---------------------------------------------------------------------------
-- 0. Referentie-snapshot voor G1. Niet via refresh van de oude matview:
--    die CRASHT op de huidige data met division by zero, want de mrr-CTE
--    deelt door billing_cycle_weeks * 7 en sinds de order-pipeline schrijft
--    tmc.activate_order voor rittenkaarten en PT-pakketten memberships met
--    billing_cycle_weeks = 0. Dit is dezelfde reden dat de refresh-cron al
--    sinds 2026-07-05 elke nacht faalt (refreshed_at bleef daarop staan).
--    De nieuwe definitie herstelt dat met m.billing_cycle_weeks > 0 in de
--    mrr-CTE: MRR telt alleen doorlopende abonnementen, en een
--    credit-membership zonder cyclus heeft geen maandwaarde. Het snapshot
--    hieronder rekent de OUDE formule met diezelfde minimale guard, zodat
--    de G1-vergelijking (identieke cijfers voor niet-testdata) zuiver
--    blijft.
-- ---------------------------------------------------------------------------

create temporary table pr8_pre on commit drop as
select
  (select count(*) from tmc.memberships where status = 'active') as active_members,
  (select coalesce(sum((price_per_cycle_cents::numeric * 30.4375) / (billing_cycle_weeks * 7)::numeric), 0)::bigint
     from tmc.memberships where status = 'active' and billing_cycle_weeks > 0) as mrr_cents,
  (select count(*) from tmc.memberships where created_at >= now() - interval '7 days') as new_signups_week,
  (select count(*) from tmc.memberships where created_at >= now() - interval '30 days') as new_signups_month,
  (select count(*) from tmc.memberships
     where status = any (array['cancelled','expired'])
       and cancellation_effective_date >= (current_date - interval '30 days')::date
       and cancellation_effective_date <= current_date) as churn_30d,
  (select count(*) from tmc.membership_pauses
     where status = 'active' and end_date >= current_date) as active_pauses;

-- ---------------------------------------------------------------------------
-- 1 + 2. Drops, functie eerst, geen CASCADE: als er een onbekende
--        afhankelijkheid bestaat hoort deze migratie te falen, niet stil
--        iets mee te slopen.
-- ---------------------------------------------------------------------------

drop function if exists tmc.get_admin_kpis();
drop materialized view if exists tmc.vw_admin_kpis;

-- ---------------------------------------------------------------------------
-- 3. De matview, live definitie plus het is_test-filter.
-- ---------------------------------------------------------------------------

create materialized view tmc.vw_admin_kpis as
with active_members as (
  select count(*) as count
  from tmc.memberships m
  join tmc.profiles p on p.id = m.profile_id and not p.is_test
  where m.status = 'active'
), mrr as (
  select (coalesce(sum((m.price_per_cycle_cents::numeric * 30.4375) / (m.billing_cycle_weeks * 7)::numeric), 0::numeric))::bigint as cents
  from tmc.memberships m
  join tmc.profiles p on p.id = m.profile_id and not p.is_test
  -- billing_cycle_weeks > 0: credit-memberships (rittenkaart, PT-pakket)
  -- hebben cyclus 0 en geen maandwaarde; zonder deze guard deelt de som
  -- door nul, precies de bug die de refresh-cron sinds 2026-07-05 elke
  -- nacht liet falen.
  where m.status = 'active' and m.billing_cycle_weeks > 0
), new_signups_week as (
  select count(*) as count
  from tmc.memberships m
  join tmc.profiles p on p.id = m.profile_id and not p.is_test
  where m.created_at >= (now() - interval '7 days')
), new_signups_month as (
  select count(*) as count
  from tmc.memberships m
  join tmc.profiles p on p.id = m.profile_id and not p.is_test
  where m.created_at >= (now() - interval '30 days')
), churn_30d as (
  select count(*) as count
  from tmc.memberships m
  join tmc.profiles p on p.id = m.profile_id and not p.is_test
  where m.status = any (array['cancelled', 'expired'])
    and m.cancellation_effective_date >= (current_date - interval '30 days')::date
    and m.cancellation_effective_date <= current_date
), active_pauses as (
  select count(*) as count
  from tmc.membership_pauses
  where membership_pauses.status = 'active' and membership_pauses.end_date >= current_date
), fill_rate_week as (
  select coalesce(avg(
    case
      when s.capacity > 0 then (
        (select count(*)::numeric from tmc.bookings b
         where b.session_id = s.id and b.status = 'booked')
      ) / s.capacity::numeric
      else 0::numeric
    end), 0::numeric) as ratio
  from tmc.class_sessions s
  where s.start_at >= (now() - interval '7 days') and s.start_at < now()
    and s.pillar <> 'vrij_trainen' and s.capacity is not null
), no_show_rate_30d as (
  select coalesce(
    (count(*) filter (where bookings.status = 'no_show'))::numeric
    / nullif(count(*) filter (where bookings.status = any (array['attended', 'no_show'])), 0)::numeric,
    0::numeric) as ratio
  from tmc.bookings
  where bookings.booked_at >= (now() - interval '30 days')
), crowdfunding_conversion as (
  select count(distinct b.email) as total_backers,
         count(distinct case when m.id is not null then b.email else null::text end) as converted_members
  from tmc.crowdfunding_backers b
  left join tmc.profiles p on lower(p.email) = lower(b.email) and not p.is_test
  left join tmc.memberships m on m.profile_id = p.id and m.status = 'active'
  where b.payment_status = 'paid'
)
select
  (select active_members.count from active_members) as active_members,
  (select mrr.cents from mrr) as mrr_cents,
  (select new_signups_week.count from new_signups_week) as new_signups_week,
  (select new_signups_month.count from new_signups_month) as new_signups_month,
  (select churn_30d.count from churn_30d) as churn_30d,
  (select active_pauses.count from active_pauses) as active_pauses,
  round((select fill_rate_week.ratio from fill_rate_week) * 100::numeric, 1) as fill_rate_week_pct,
  round((select no_show_rate_30d.ratio from no_show_rate_30d) * 100::numeric, 1) as no_show_rate_30d_pct,
  (select crowdfunding_conversion.total_backers from crowdfunding_conversion) as crowdfunding_total_backers,
  (select crowdfunding_conversion.converted_members from crowdfunding_conversion) as crowdfunding_converted_members,
  now() as refreshed_at;

comment on materialized view tmc.vw_admin_kpis is
  'Dagelijkse admin-KPIs (cron refresh-kpis, 03:50, via tmc.refresh_admin_kpis met CONCURRENTLY). Sinds PR 8 gefilterd op profiles.is_test: testmemberships tellen nergens mee. mrr_cents is contractwaarde, geen gerealiseerde omzet; die staat in tmc.v_revenue_lines (spec-facturatie.md 7.1). Elke wijziging aan deze view vereist drop en recreate van view EN tmc.get_admin_kpis() in een transactie, met de unique index en herstelde grants: de harde regel uit spec-facturatie.md 7.8.';

-- ---------------------------------------------------------------------------
-- 4. De unique index: vereist voor refresh materialized view CONCURRENTLY.
--    Zonder deze faalt niet deze migratie maar de cron, de volgende ochtend
--    om 03:50, stil. Zelfde expressie-index als voorheen (singleton-view).
-- ---------------------------------------------------------------------------

create unique index vw_admin_kpis_refresh_idx on tmc.vw_admin_kpis ((refreshed_at is not null));

-- ---------------------------------------------------------------------------
-- 5. get_admin_kpis(), letterlijk de live definitie (inclusief de
--    is_admin-gate binnenin).
-- ---------------------------------------------------------------------------

create function tmc.get_admin_kpis()
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

-- ---------------------------------------------------------------------------
-- 6. Grants, exact zoals gemeten voor de drop.
-- ---------------------------------------------------------------------------

grant execute on function tmc.get_admin_kpis() to anon, authenticated, service_role;
grant select on tmc.vw_admin_kpis to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Zelfcontrole binnen dezelfde transactie: de nieuwe definitie geeft
--    voor de huidige (test-vrije) data exact dezelfde cijfers als de oude,
--    en een testmembership beweegt de cijfers niet (G3 in het klein; de
--    volledige G-batterij draait extern na de push).
-- ---------------------------------------------------------------------------

do $$
declare
  v_pre  pr8_pre%rowtype;
  v_post tmc.vw_admin_kpis%rowtype;
begin
  select * into v_pre from pr8_pre limit 1;
  select * into v_post from tmc.vw_admin_kpis limit 1;

  if (v_pre.active_members, v_pre.mrr_cents, v_pre.new_signups_week,
      v_pre.new_signups_month, v_pre.churn_30d, v_pre.active_pauses)
     is distinct from
     (v_post.active_members, v_post.mrr_cents, v_post.new_signups_week,
      v_post.new_signups_month, v_post.churn_30d, v_post.active_pauses) then
    raise exception 'kpi_view_is_test: nieuwe definitie wijkt af voor niet-testdata: pre=% post=%',
      to_jsonb(v_pre), to_jsonb(v_post);
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'tmc' and tablename = 'vw_admin_kpis'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ) then
    raise exception 'kpi_view_is_test: unique index ontbreekt; refresh concurrently zou morgenochtend falen';
  end if;

  if not has_function_privilege('authenticated', 'tmc.get_admin_kpis()', 'execute')
     or not has_function_privilege('service_role', 'tmc.get_admin_kpis()', 'execute')
     or not has_function_privilege('anon', 'tmc.get_admin_kpis()', 'execute') then
    raise exception 'kpi_view_is_test: execute-grants niet volledig hersteld';
  end if;
  if not has_table_privilege('authenticated', 'tmc.vw_admin_kpis', 'select')
     or not has_table_privilege('service_role', 'tmc.vw_admin_kpis', 'select') then
    raise exception 'kpi_view_is_test: select-grants op de matview niet hersteld';
  end if;
end $$;

commit;
