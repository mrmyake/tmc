-- Chargeback-spiegel op de betaalregel (spec-facturatie.md 4.7 en 4.8,
-- branch fix/mollie-chargeback-handling).
--
-- Een storno (SEPA-chargeback) laat in Mollie API v2 de payment-status
-- ongemoeid: de payment blijft 'paid' en alleen amountChargedBack wordt
-- gevuld, precies zoals amountRefunded bij een restitutie. Daarom geen
-- statuswaarde 'charged_back' in payments_status_check maar twee kolommen
-- naast refunded_amount_cents en refunded_at:
--
--   * v_revenue_lines en de factuurketen hangen aan status = 'paid'; een
--     statuswissel zou de brutoregel en de creditnota-koppeling laten
--     verdwijnen;
--   * een chargeback kan door de bank worden teruggedraaid (reversedAt bij
--     Mollie), dus het is geen eindstatus; het bedrag loopt dan terug naar 0.
--
-- Puur additief: geen functie, trigger of view wijzigt, en er is geen
-- codewijziging nodig om dit te deployen. De webhooks gaan de kolommen
-- vullen uit payment.amountChargedBack; tot die code live is blijft alles
-- op 0 en null, de eerlijke toestand (geen storno bekend).
--
-- BUITEN SCOPE, met opzet: het aftrekken van chargebacks in v_revenue_lines
-- en het omzetrapport (7.4), en een teller op het admin-dashboard.

alter table tmc.payments
  add column if not exists charged_back_amount_cents integer not null default 0,
  add column if not exists charged_back_at timestamptz;

alter table tmc.payments
  drop constraint if exists payments_charged_back_amount_cents_check,
  drop constraint if exists payments_charged_back_lte_amount_check;

alter table tmc.payments
  add constraint payments_charged_back_amount_cents_check
    check (charged_back_amount_cents >= 0),
  add constraint payments_charged_back_lte_amount_check
    check (charged_back_amount_cents <= amount_cents);

comment on column tmc.payments.charged_back_amount_cents is
  'Spiegel van Mollie payment.amountChargedBack in centen; 0 als er geen (actieve) chargeback is. status blijft paid, zie spec-facturatie.md 4.8.';
comment on column tmc.payments.charged_back_at is
  'Moment waarop de spiegel voor het laatst een gewijzigd chargeback-bedrag zag (ook bij een reversal naar 0).';
