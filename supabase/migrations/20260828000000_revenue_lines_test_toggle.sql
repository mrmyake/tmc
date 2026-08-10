-- Facturatie/omzetrapportage, PR 9c (spec-facturatie.md sectie 7, 11.6).
--
-- tmc.v_revenue_lines (PR 7, #153) filtert vandaag hard op `is_test = false`
-- in de WHERE-clausule. 9c vraagt een expliciete admin-toggle op het scherm
-- (7.2 zegt niets over een toggle, maar de PR-opdracht voor 9c wel: default
-- false, aanzetbaar). Een hardgecodeerd filter in de view laat geen ruimte
-- voor die keuze op het scherm, dus de view geeft `is_test` nu als kolom
-- mee en de rapportagequery filtert er zelf op -- zelfde patroon als
-- `payments`/`invoices` elders in deze spec, waar is_test altijd een
-- zichtbare kolom is en nooit een onzichtbare aanname in een view.
--
-- Tegelijk twee kolommen toegevoegd die 7.4's crediteringslogica nodig
-- heeft maar die de oorspronkelijke view niet blootgaf:
-- `credited_vat_cents` en `credited_net_cents`, dezelfde lateral-join-vorm
-- als het bestaande `credited_gross_cents`. Nodig omdat 9c per periode ook
-- de BTW/netto-kant van een creditnota moet tonen, niet alleen het bruto
-- dat de view al had. Zonder deze kolommen zou de rapportagequery zelf een
-- tweede keer naar `tmc.invoices` moeten joinen om aan dezelfde bevroren
-- bedragen te komen -- exact het soort duplicatie die deze view juist
-- voorkomt voor de bruto-kant.
--
-- CREATE OR REPLACE VIEW behoudt de bestaande OID en dus de bestaande
-- grants (postgres, service_role); geen aparte GRANT-regel nodig, met een
-- zelfcontrole die dat bevestigt in plaats van het aan te nemen.
--
-- Geen andere database-objecten hangen van deze view af (geverifieerd via
-- pg_depend vóór deze migratie); CREATE OR REPLACE i.p.v. DROP is hier dus
-- zowel de veiligere als de enige nodige vorm.

begin;

create or replace view tmc.v_revenue_lines as
select
  date_trunc('month', p.paid_at)::date as period_month,
  p.paid_at,
  p.refunded_at,
  p.id as payment_id,
  p.profile_id,
  case
    when p.kind = 'trial_booking' then 'proefles'
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
    else round(p.refunded_amount_cents::numeric * p.vat_rate_bp / (10000 + p.vat_rate_bp))::integer
  end as refunded_vat_cents,
  case
    when p.vat_rate_bp is null then null::integer
    when p.refunded_amount_cents = 0 then 0
    when p.refunded_amount_cents = p.amount_cents then p.refunded_amount_cents - p.vat_amount_cents
    else p.refunded_amount_cents - round(p.refunded_amount_cents::numeric * p.vat_rate_bp / (10000 + p.vat_rate_bp))::integer
  end as refunded_net_cents,
  cr.credited_gross_cents,
  greatest(0::bigint, cr.credited_gross_cents - p.refunded_amount_cents) as credit_excess_cents,
  cr.last_credit_issued_at,
  p.kind,
  -- Nieuw t.o.v. de PR 7-versie: alleen toevoegen aan het EIND van de
  -- kolomlijst. CREATE OR REPLACE VIEW staat geen wijziging van bestaande
  -- kolomposities toe (SQLSTATE 42P16, live tegengekomen bij het schrijven
  -- van deze migratie toen credited_vat_cents/credited_net_cents nog
  -- tussen credited_gross_cents en credit_excess_cents stonden).
  cr.credited_vat_cents,
  cr.credited_net_cents,
  p.is_test
from tmc.payments p
left join tmc.orders o on o.id = p.order_id
left join tmc.catalogue cat_o on cat_o.slug = o.catalogue_slug
left join tmc.memberships m on m.id = p.membership_id
left join tmc.catalogue cat_m on cat_m.slug = m.plan_variant
cross join lateral (
  select
    coalesce(-sum(c.total_gross_cents), 0::bigint) as credited_gross_cents,
    coalesce(-sum(c.vat_total_cents), 0::bigint) as credited_vat_cents,
    coalesce(-sum(c.subtotal_net_cents), 0::bigint) as credited_net_cents,
    max(c.issued_at) as last_credit_issued_at
  from tmc.invoices c
  join tmc.invoices i on i.id = c.credit_of_invoice_id
  where i.payment_id = p.id and c.status = 'finalised'
) cr
where p.status = 'paid';

do $$
declare
  v_cols text[];
  v_has_where_is_test boolean;
begin
  select array_agg(attname order by attnum) into v_cols
  from pg_attribute
  where attrelid = 'tmc.v_revenue_lines'::regclass and attnum > 0 and not attisdropped;

  if not (v_cols @> array['is_test', 'credited_vat_cents', 'credited_net_cents']) then
    raise exception 'revenue_lines_test_toggle: verwachte kolommen ontbreken: %', v_cols;
  end if;

  -- De hardgecodeerde is_test=false-uitsluiting moet weg zijn uit de
  -- viewdefinitie zelf; de rapportagequery filtert voortaan zelf.
  select pg_get_viewdef('tmc.v_revenue_lines'::regclass, true) not like '%is_test = false%'
    into v_has_where_is_test;
  if not v_has_where_is_test then
    raise exception 'revenue_lines_test_toggle: is_test-filter zit nog hardgecodeerd in de view';
  end if;

  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'tmc' and table_name = 'v_revenue_lines'
      and grantee = 'service_role' and privilege_type = 'SELECT'
  ) then
    raise exception 'revenue_lines_test_toggle: service_role SELECT-grant is verdwenen';
  end if;
end $$;

commit;
