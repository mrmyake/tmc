-- Online betalen bij een handmatige factuur (spec-facturatie.md 4.9, 7.4, 9.7).
--
--   1. tmc.payments.invoice_id plus kind 'invoice' en een partiele unieke
--      index: hoogstens een betaalde factuurbetaling per factuur.
--   2. tmc.invoice_pay_tokens: stabiele, nooit verlopende token per factuur
--      voor /factuur/betalen/<token>; alleen service_role.
--   3. tmc.invoices_finalised_immutable: payment_id mag eenmalig van null naar
--      een waarde (write-once, net als pdf_path), en alleen naar een BETAALDE
--      factuurbetaling (kind 'invoice', status 'paid') van deze factuur: de
--      database dwingt zelf af dat alleen geld dat echt binnen is gekoppeld
--      wordt. Live definitie als basis.
--   4. tmc.v_revenue_lines: een UNION ALL-tak voor kind 'invoice' die per
--      factuurregel een rij geeft (bruto, BTW, netto en categorie per regel).
--      De eerste tak slaat kind 'invoice' over. Live definitie als basis.
--
-- Geen wijziging aan tmc.finalize_invoice. Geen kolommen op tmc.invoices: de
-- betaalstatus is afgeleid (gekoppelde betaling met status paid). Een latere
-- productkoppeling kan op invoice_id van de toekenning leggen, zonder nieuwe
-- migratie op invoices.

begin;

-- ---------------------------------------------------------------------------
-- 1. payments.invoice_id, kind 'invoice', een betaling per factuur
-- ---------------------------------------------------------------------------

alter table tmc.payments
  add column invoice_id uuid references tmc.invoices(id);

create index payments_invoice_id_idx on tmc.payments (invoice_id)
  where invoice_id is not null;

alter table tmc.payments drop constraint payments_kind_check;
alter table tmc.payments
  add constraint payments_kind_check
    check (kind is null or kind = any (array[
      'order'::text, 'recurring'::text, 'trial_booking'::text,
      'manual'::text, 'extra_class'::text, 'invoice'::text
    ]));

-- Achtervang voor de compare-and-swap op invoices.payment_id: nooit twee
-- betaalde factuurbetalingen aan dezelfde factuur. Een dubbele online
-- betaling wordt losgekoppeld (invoice_id null) en terugbetaald.
create unique index payments_one_paid_per_invoice
  on tmc.payments (invoice_id)
  where invoice_id is not null and kind = 'invoice' and status = 'paid';

comment on column tmc.payments.invoice_id is
  'Alleen bij kind = ''invoice'': de factuur die deze betaling (poging) betreft. Een dubbele betaling na een al betaalde factuur wordt losgekoppeld (null). Zie spec-facturatie.md 9.7.';

-- ---------------------------------------------------------------------------
-- 2. invoice_pay_tokens
-- ---------------------------------------------------------------------------

create table tmc.invoice_pay_tokens (
  invoice_id uuid primary key references tmc.invoices(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table tmc.invoice_pay_tokens enable row level security;
revoke all on tmc.invoice_pay_tokens from public, anon, authenticated;
grant select, insert on tmc.invoice_pay_tokens to service_role;

comment on table tmc.invoice_pay_tokens is
  'Stabiele betaaltoken per factuur voor /factuur/betalen/<token>. Wordt aangemaakt voor de PDF wordt gegenereerd (de PDF is write-once) en verloopt nooit. Alleen service_role; de pagina is de enige poort. Zie spec-facturatie.md 9.7.';

-- ---------------------------------------------------------------------------
-- 3. invoices_finalised_immutable: payment_id write-once
-- ---------------------------------------------------------------------------

create or replace function tmc.invoices_finalised_immutable()
returns trigger
language plpgsql
set search_path to 'tmc', 'extensions'
as $function$
declare
  v_old tmc.invoices := old;
  v_new tmc.invoices := new;
begin
  if old.status = 'draft' then
    return new;
  end if;

  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'pdf_path is write-once.' using errcode = 'P0001';
  end if;

  -- payment_id: eenmalig van null naar een waarde, alleen naar een betaalde
  -- factuurbetaling van deze factuur (kind 'invoice', status 'paid'), nooit op
  -- een creditnota. De betaalregel moet dus eerst op paid staan en dan pas
  -- gekoppeld worden. Daarna onveranderlijk (valt hieronder door de gewone
  -- vergelijking).
  if old.payment_id is null and new.payment_id is not null then
    if old.credit_of_invoice_id is not null
       or not exists (
         select 1 from tmc.payments p
         where p.id = new.payment_id
           and p.invoice_id = old.id
           and p.kind = 'invoice'
           and p.status = 'paid'
       ) then
      raise exception 'payment_id mag alleen naar een betaalde factuurbetaling van deze factuur.'
        using errcode = 'P0001';
    end if;
    v_new.payment_id := v_old.payment_id;
  end if;

  v_new.pdf_path := v_old.pdf_path;
  v_new.pdf_generated_at := v_old.pdf_generated_at;
  v_new.updated_at := v_old.updated_at;

  -- Aanmaker mag wegvallen (ON DELETE SET NULL), nooit veranderen.
  if new.created_by_profile_id is null then
    v_new.created_by_profile_id := v_old.created_by_profile_id;
  end if;

  if v_new is distinct from v_old then
    raise exception 'Gefinaliseerde factuur is onveranderlijk.' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. v_revenue_lines: tak voor kind 'invoice'
-- ---------------------------------------------------------------------------

drop view tmc.v_revenue_lines;

create view tmc.v_revenue_lines as
 SELECT date_trunc('month'::text, p.paid_at)::date AS period_month,
    p.paid_at,
    p.refunded_at,
    p.id AS payment_id,
    p.profile_id,
        CASE
            WHEN p.kind = 'trial_booking'::text THEN 'proefles'::text
            WHEN p.kind = 'extra_class'::text THEN 'les_tegoed'::text
            ELSE COALESCE(cat_o.revenue_category, cat_m.revenue_category)
        END AS revenue_category,
    p.vat_rate_bp,
    p.amount_cents AS gross_cents,
    p.vat_amount_cents AS vat_cents,
    p.net_amount_cents AS net_cents,
    p.refunded_amount_cents AS refunded_cents,
        CASE
            WHEN p.vat_rate_bp IS NULL THEN NULL::integer
            WHEN p.refunded_amount_cents = 0 THEN 0
            WHEN p.refunded_amount_cents = p.amount_cents THEN p.vat_amount_cents
            ELSE round(p.refunded_amount_cents::numeric * p.vat_rate_bp::numeric / (10000 + p.vat_rate_bp)::numeric)::integer
        END AS refunded_vat_cents,
        CASE
            WHEN p.vat_rate_bp IS NULL THEN NULL::integer
            WHEN p.refunded_amount_cents = 0 THEN 0
            WHEN p.refunded_amount_cents = p.amount_cents THEN p.refunded_amount_cents - p.vat_amount_cents
            ELSE p.refunded_amount_cents - round(p.refunded_amount_cents::numeric * p.vat_rate_bp::numeric / (10000 + p.vat_rate_bp)::numeric)::integer
        END AS refunded_net_cents,
    cr.credited_gross_cents,
    GREATEST(0::bigint, cr.credited_gross_cents - p.refunded_amount_cents) AS credit_excess_cents,
    cr.last_credit_issued_at,
    p.kind,
    cr.credited_vat_cents,
    cr.credited_net_cents,
    p.is_test
   FROM tmc.payments p
     LEFT JOIN tmc.orders o ON o.id = p.order_id
     LEFT JOIN tmc.catalogue cat_o ON cat_o.slug = o.catalogue_slug
     LEFT JOIN tmc.memberships m ON m.id = p.membership_id
     LEFT JOIN tmc.catalogue cat_m ON cat_m.slug = m.plan_variant
     CROSS JOIN LATERAL ( SELECT COALESCE(- sum(c.total_gross_cents), 0::bigint) AS credited_gross_cents,
            COALESCE(- sum(c.vat_total_cents), 0::bigint) AS credited_vat_cents,
            COALESCE(- sum(c.subtotal_net_cents), 0::bigint) AS credited_net_cents,
            max(c.issued_at) AS last_credit_issued_at
           FROM tmc.invoices c
             JOIN tmc.invoices i ON i.id = c.credit_of_invoice_id
          WHERE i.payment_id = p.id AND c.status = 'finalised'::text) cr
  WHERE p.status = 'paid'::text AND p.kind IS DISTINCT FROM 'invoice'::text
UNION ALL
 -- Betaalde factuurbetalingen: een rij per factuurregel, exact (bruto, BTW,
 -- netto en categorie per regel). Alleen de gekoppelde betaling telt
 -- (i.payment_id = p.id); een losgekoppelde dubbele betaling valt er buiten.
 -- Creditnota's worden per regel gematcht op regelnummer (creditnota's
 -- spiegelen de regels van het origineel). Terugbetalingen van een
 -- factuurbetaling lopen via een creditnota, niet via refunded_*: die
 -- kolommen staan hier op 0.
 SELECT date_trunc('month'::text, p.paid_at)::date AS period_month,
    p.paid_at,
    p.refunded_at,
    p.id AS payment_id,
    p.profile_id,
    l.revenue_category,
    l.vat_rate_bp,
    l.gross_cents,
    l.vat_cents,
    l.net_cents,
    0 AS refunded_cents,
    0 AS refunded_vat_cents,
    0 AS refunded_net_cents,
    cr.credited_gross_cents,
    GREATEST(0::bigint, cr.credited_gross_cents) AS credit_excess_cents,
    cr.last_credit_issued_at,
    p.kind,
    cr.credited_vat_cents,
    cr.credited_net_cents,
    p.is_test
   FROM tmc.payments p
     JOIN tmc.invoices i ON i.id = p.invoice_id AND i.payment_id = p.id
     JOIN tmc.invoice_lines l ON l.invoice_id = i.id
     CROSS JOIN LATERAL ( SELECT COALESCE(- sum(cl.gross_cents), 0::bigint) AS credited_gross_cents,
            COALESCE(- sum(cl.vat_cents), 0::bigint) AS credited_vat_cents,
            COALESCE(- sum(cl.net_cents), 0::bigint) AS credited_net_cents,
            max(c.issued_at) AS last_credit_issued_at
           FROM tmc.invoices c
             JOIN tmc.invoice_lines cl ON cl.invoice_id = c.id
          WHERE c.credit_of_invoice_id = i.id AND c.status = 'finalised'::text
            AND cl.line_no = l.line_no) cr
  WHERE p.status = 'paid'::text AND p.kind = 'invoice'::text;

revoke all on tmc.v_revenue_lines from public, anon, authenticated;
grant select on tmc.v_revenue_lines to service_role;

comment on view tmc.v_revenue_lines is
  'De omzetregels (spec-facturatie.md 7.2, 7.4). Een rij per betaalde payment, behalve kind ''invoice'': daar een rij per factuurregel van de gekoppelde factuur (9.7). Leest dwars door RLS; SELECT alleen voor service_role.';

commit;
