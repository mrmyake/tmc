-- Facturatie PR 2 (spec-facturatie.md sectie 14): het BTW-snapshot op de
-- betaalregel, plus de rapportagekolom op de order.
--
-- Vervolg op PR 1 (#146), dat de tarieven op tmc.catalogue zette. Deze
-- migratie geeft tmc.payments de kolommen waarin dat tarief per betaling
-- bevroren wordt, en tmc.orders de goedkope rapportagekolom naast
-- pricing_snapshot. Opnieuw puur additief: geen bestaande kolom verandert
-- van betekenis en er is geen codewijziging nodig om dit te deployen.
--
-- amount_cents blijft ongewijzigd het BRUTObedrag (sectie 2.2), zodat elke
-- bestaande query blijft werken. net en vat zijn de afgeleiden, nooit
-- andersom: vat = round(bruto * rate / (10000 + rate)), net = bruto - vat
-- (sectie 3.1). Netto eerst berekenen zou een cent verschil introduceren
-- tussen de getoonde en de geincasseerde prijs.
--
-- BUITEN SCOPE, met opzet: de prijsketen. _compute_order_price, create_order
-- en admin_create_order blijven ongewijzigd; die gaan de nieuwe kolommen pas
-- vullen in PR 3. Tot dan blijven ze NULL voor nieuwe rijen, en dat is de
-- eerlijke toestand: onbekend, niet nul.
--
-- Ook buiten scope: trial_bookings.is_test en het vullen van
-- payments.trial_booking_id. De kolom wordt hier aangemaakt omdat sectie 2.2
-- hem opsomt, maar het proefles-pad wordt pas in PR 5 aangesloten.
--
-- Backfill: 5 payments en 7 orders (sectie 3.5, sectie 10.2). Alle zeven
-- orders resolven vandaag naar een enkel tarief van 900, want sinds PR 1
-- draagt de hele catalogus negen procent. De berekening hieronder gaat daar
-- bewust NIET van uit: hij rekent per component met het eigen tarief van die
-- component en laat vat_rate_bp op NULL zodra de componenten van elkaar
-- verschillen. Dat is precies de mixed-rate-regel uit sectie 2.2, en hij
-- staat er nu in zodat een toekomstig 21-procent-product geen herschrijving
-- van deze logica vraagt.

begin;

-- ---------------------------------------------------------------------------
-- 1. tmc.payments: de snapshot- en restitutiekolommen (sectie 2.2)
-- ---------------------------------------------------------------------------

alter table tmc.payments
  add column if not exists is_test               boolean not null default false,
  add column if not exists vat_rate_bp           integer,
  add column if not exists net_amount_cents      integer,
  add column if not exists vat_amount_cents      integer,
  add column if not exists refunded_amount_cents integer not null default 0,
  add column if not exists refunded_at           timestamptz,
  add column if not exists kind                  text,
  add column if not exists trial_booking_id      uuid references tmc.trial_bookings(id);

-- ---------------------------------------------------------------------------
-- 2. tmc.orders: rapportagekolom naast pricing_snapshot (sectie 3.3)
-- ---------------------------------------------------------------------------

alter table tmc.orders
  add column if not exists vat_amount_cents integer;

-- ---------------------------------------------------------------------------
-- 3. CHECK-constraints op tmc.payments
-- ---------------------------------------------------------------------------

-- Sectie 2.2: als beide gevuld zijn moeten ze optellen tot het bruto. Een van
-- de twee mag NULL zijn (onbekend tarief), maar half ingevuld en niet
-- kloppend mag niet bestaan.
alter table tmc.payments
  add constraint payments_vat_split_check
    check (
      net_amount_cents is null
      or vat_amount_cents is null
      or net_amount_cents + vat_amount_cents = amount_cents
    );

-- De vier waarden uit sectie 2.2. Zelfde patroon als orders_kind_check en
-- payments_status_check: een opgesomde tekstkolom zonder constraint is een
-- typefout die pas in de rapportage opvalt.
alter table tmc.payments
  add constraint payments_kind_check
    check (kind is null or kind in ('order', 'recurring', 'trial_booking', 'manual'));

-- De rekenregel in sectie 7.4 gebruikt greatest(0, gecrediteerd -
-- gerestitueerd) en gaat er dus vanuit dat dit bedrag nooit negatief is.
alter table tmc.payments
  add constraint payments_refunded_amount_cents_check
    check (refunded_amount_cents >= 0);

-- ---------------------------------------------------------------------------
-- 4. Backfill tmc.orders.vat_amount_cents
--
-- Per component afrekenen en daarna optellen (sectie 3.4), elk met het eigen
-- tarief van zijn catalogusrij. Niet in een keer over first_charge_cents:
-- dat scheelt vandaag niets omdat alle tarieven gelijk zijn, maar het zou bij
-- een gemengde order een cent afwijken van wat PR 3 gaat schrijven, en dan
-- staan oude en nieuwe rijen op verschillende regels gerekend.
--
-- Een component met bedrag 0 draagt 0 bij, dus die hoeft niet apart te worden
-- uitgezonderd. Ontbreekt de catalogusrij van de basis-slug, dan blijft de
-- hele som NULL en daarmee de kolom: onbekend is het eerlijke antwoord
-- (sectie 3.5).
-- ---------------------------------------------------------------------------

update tmc.orders o
set vat_amount_cents =
      round(o.base_price_cents::numeric            * cb.vat_rate_bp / (10000 + cb.vat_rate_bp))::integer
    + round(o.extended_access_price_cents::numeric * cx.vat_rate_bp / (10000 + cx.vat_rate_bp))::integer
    + round(o.signup_fee_cents::numeric            * cf.vat_rate_bp / (10000 + cf.vat_rate_bp))::integer
from tmc.catalogue cb, tmc.catalogue cx, tmc.catalogue cf
where cb.slug = o.catalogue_slug
  and cx.slug = 'extended_access'
  and cf.slug = 'signup_fee'
  and o.vat_amount_cents is null;

-- ---------------------------------------------------------------------------
-- 5. Backfill tmc.payments
--
-- vat_rate_bp krijgt alleen een waarde als alle componenten die daadwerkelijk
-- aan het bedrag bijdragen hetzelfde tarief dragen. Verschillen ze, dan is
-- een enkel tarief op de betaalregel per definitie te grof en blijft de kolom
-- NULL (sectie 2.2); de bedragen kloppen dan nog steeds, want die zijn per
-- component gerekend.
--
-- De bedragen zelf komen uit tmc.orders zodra het betaalde bedrag gelijk is
-- aan first_charge_cents. Dat is dezelfde route die de webhook in PR 3 gaat
-- lopen (sectie 3.3: "de webhook leest orders.vat_amount_cents"), dus order
-- en payment kunnen per constructie niet uiteenlopen. Wijkt het bedrag af,
-- dan wordt er over het werkelijk betaalde bedrag gerekend met het effectieve
-- tarief.
-- ---------------------------------------------------------------------------

with component_rates as (
  select o.id as order_id,
         o.first_charge_cents,
         o.vat_amount_cents,
         array_remove(array[
           cb.vat_rate_bp,
           case when o.extended_access_price_cents > 0 then cx.vat_rate_bp end,
           case when o.signup_fee_cents            > 0 then cf.vat_rate_bp end
         ], null) as rates
  from tmc.orders o
  left join tmc.catalogue cb on cb.slug = o.catalogue_slug
  left join tmc.catalogue cx on cx.slug = 'extended_access'
  left join tmc.catalogue cf on cf.slug = 'signup_fee'
),
effective as (
  select order_id,
         first_charge_cents,
         vat_amount_cents,
         case
           when cardinality(rates) > 0
            and (select count(distinct r) from unnest(rates) r) = 1
           then rates[1]
         end as rate
  from component_rates
)
update tmc.payments p
set vat_rate_bp      = e.rate,
    vat_amount_cents = case
                         when p.amount_cents = e.first_charge_cents then e.vat_amount_cents
                         else round(p.amount_cents::numeric * e.rate / (10000 + e.rate))::integer
                       end,
    net_amount_cents = p.amount_cents - case
                         when p.amount_cents = e.first_charge_cents then e.vat_amount_cents
                         else round(p.amount_cents::numeric * e.rate / (10000 + e.rate))::integer
                       end
from effective e
where p.order_id = e.order_id
  and e.rate is not null
  and p.vat_rate_bp is null;

-- kind: afleidbaar uit wat er aan de rij hangt. Een payment met een order is
-- de order-pijplijn, een payment met alleen een subscription-id is een
-- recurring incasso. Alles wat geen van beide is blijft NULL: dat is dan
-- ofwel een proefles (PR 5) ofwel een handmatige rij, en raden hoort hier
-- niet.
update tmc.payments
set kind = 'order'
where kind is null and order_id is not null;

update tmc.payments
set kind = 'recurring'
where kind is null and order_id is null and mollie_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Kolomcommentaar
-- ---------------------------------------------------------------------------

comment on column tmc.payments.is_test is
  'Afgeleid snapshot van profiles.is_test op het moment van schrijven (voor de publieke proefles: trial_bookings.is_test, PR 5). Redundant met opzet: de omzetrapportage wil niet per rij naar profiles joinen. Zie spec-facturatie.md 6.3.';

comment on column tmc.payments.vat_rate_bp is
  'BTW-tarief in basispunten zoals het gold bij deze betaling, bevroren. NULL als het onbekend is (historische rij) of als de order meerdere tarieven mengt; in dat laatste geval kloppen vat_amount_cents en net_amount_cents nog steeds, want die zijn per component gerekend. Nooit uit de actuele catalogue lezen: dat tarief kan sinds de betaling gewijzigd zijn. Zie spec-facturatie.md 2.2 en 7.2.';

comment on column tmc.payments.net_amount_cents is
  'amount_cents minus vat_amount_cents. Bruto is leidend en netto is de afgeleide (spec-facturatie.md 3.1). NULL zolang het tarief onbekend is.';

comment on column tmc.payments.vat_amount_cents is
  'BTW-bedrag over amount_cents, per component gerekend en opgeteld (spec-facturatie.md 3.4). NULL zolang het tarief onbekend is.';

comment on column tmc.payments.refunded_amount_cents is
  'Totaal terugbetaald bedrag, uit Mollie payment.amountRefunded. In API v2 blijft payment.status op paid bij een restitutie en bestaat de waarde refunded niet; de restitutiestand woont dus hier en niet in status. Altijd de bron van de negatieve omzetregel; een creditnota draagt alleen het meerdere bij. Zie spec-facturatie.md 4.8 en 7.4.';

comment on column tmc.payments.refunded_at is
  'Tijdstip van de laatste refund-melding. Bepaalt in welke periode de negatieve omzetregel valt: de maand van de restitutie, niet die van de oorspronkelijke betaling. Zie spec-facturatie.md 7.4.';

comment on column tmc.payments.kind is
  'Herkomst van de betaling: order, recurring, trial_booking of manual. NULL waar de herkomst niet af te leiden was bij de backfill.';

comment on column tmc.payments.trial_booking_id is
  'Koppeling naar de betaalde proefles. Wordt pas gevuld in PR 5, wanneer /api/trial-bookings/webhook ook naar tmc.payments gaat schrijven; tot dan blijven betaalde proeflessen onzichtbaar in de omzet. Zie spec-facturatie.md 2.9.';

comment on column tmc.orders.vat_amount_cents is
  'BTW over first_charge_cents, per component gerekend en opgeteld. Goedkope rapportagekolom naast pricing_snapshot, dat de volledige uitsplitsing draagt. Wordt vanaf PR 3 door create_order en admin_create_order gevuld met first_charge_vat_amount_cents. Zie spec-facturatie.md 3.3.';

-- ---------------------------------------------------------------------------
-- 7. Zelfcontrole binnen dezelfde transactie
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad_split   integer;
  v_orders_null integer;
  v_pay_null    integer;
  v_pay_rows    integer;
  v_default_vat text;
begin
  -- De splitsing telt overal op tot het bruto. De constraint dekt dit al,
  -- maar deze assertie faalt met een leesbare melding in plaats van met een
  -- constraint-naam.
  select count(*) into v_bad_split
  from tmc.payments
  where net_amount_cents is not null
    and vat_amount_cents is not null
    and net_amount_cents + vat_amount_cents <> amount_cents;

  if v_bad_split > 0 then
    raise exception 'payments_vat_snapshot: % betaalregels waar net + vat niet optelt tot amount_cents', v_bad_split;
  end if;

  -- Alle bestaande rijen zijn te herleiden, want elke order verwijst naar een
  -- bestaande catalogusrij en die dragen sinds PR 1 allemaal een tarief. Een
  -- rij die toch NULL blijft is geen fout maar wel iets om te weten.
  select count(*) into v_orders_null from tmc.orders where vat_amount_cents is null;
  select count(*) into v_pay_null    from tmc.payments where vat_rate_bp is null;
  select count(*) into v_pay_rows    from tmc.payments;

  if v_orders_null > 0 then
    raise warning 'payments_vat_snapshot: % orders zonder vat_amount_cents (niet herleidbaar, blijft NULL)', v_orders_null;
  end if;

  if v_pay_null > 0 then
    raise warning 'payments_vat_snapshot: % van de % betaalregels zonder vat_rate_bp (niet herleidbaar of gemengd tarief)', v_pay_null, v_pay_rows;
  end if;

  -- Geen default op vat_rate_bp: onbekend moet onbekend blijven en mag niet
  -- stil nul of negen procent worden (sectie 10.3).
  select column_default into v_default_vat
  from information_schema.columns
  where table_schema = 'tmc' and table_name = 'payments' and column_name = 'vat_rate_bp';

  if v_default_vat is not null then
    raise exception 'payments_vat_snapshot: er staat een DEFAULT op payments.vat_rate_bp (%); onbekend moet NULL blijven', v_default_vat;
  end if;

  -- De grants uit PR 1 zijn niet per ongeluk teruggezet door het toevoegen
  -- van kolommen.
  if has_table_privilege('anon', 'tmc.payments', 'SELECT')
     or has_table_privilege('authenticated', 'tmc.payments', 'INSERT') then
    raise exception 'payments_vat_snapshot: de grant-opruiming uit PR 1 is ongedaan gemaakt';
  end if;
end $$;

commit;
