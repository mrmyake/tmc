-- Attributie voor de intake-aanvraag van het 12 weken programma
-- (spec-marketing-attribution.md, feat/programma-ads-landing).
--
-- De intake slaat zelf geen rij op in Supabase (MailerLite plus ntfy), dus er
-- is geen brontabel. De route genereert een willekeurige uuid als source_id;
-- die is alleen een idempotentiesleutel voor de unieke index op
-- (source_type, source_id), geen verwijzing naar een andere tabel.
--
-- Wijziging: de CHECK op source_type accepteert naast trial_booking en
-- trial_request ook programma_intake. Verder niets: kolommen, index, grants
-- en RLS blijven ongewijzigd.
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Draaien met `supabase db push` na merge van de PR.

alter table tmc.lead_attributions
  drop constraint if exists lead_attributions_source_type_check;

alter table tmc.lead_attributions
  add constraint lead_attributions_source_type_check
  check (source_type in ('trial_booking', 'trial_request', 'programma_intake'));

comment on column tmc.lead_attributions.source_type is
  'trial_booking (tmc.trial_bookings, alle drie de boekingspaden), trial_request (tmc.trial_requests, het terugbelformulier) of programma_intake (intake 12 weken programma; geen brontabel, source_id is een willekeurige uuid als idempotentiesleutel). Geen FK.';
