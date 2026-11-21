-- Attributie van de kennismaking hormoonprofiel (spec-hormoonprofiel.md,
-- fix/hormoonprofiel-attributie).
--
-- /api/leads/hormoonprofiel schreef zijn attributierij met source_type
-- 'programma_intake', waardoor kennismakingen van hormoonprofiel in de
-- attributie-export als leads van het 12 weken programma verschenen en de
-- conversiedata van die campagne konden vervuilen. Een eigen brontype houdt ze
-- uit elkaar. source_id blijft het id van de tmc.programma_intakes-rij (de
-- kennismaking gebruikt die tabel als opslag, signup_path '/hormoonprofiel').
--
-- Wijziging: de CHECK op source_type accepteert naast trial_booking,
-- trial_request en programma_intake ook hormoonprofiel_kennismaking, en de
-- kolomcomment wordt bijgewerkt. Verder niets: kolommen, index, grants en RLS
-- blijven ongewijzigd. Geen backfill: er bestaan geen rijen die hierbij horen
-- (op 2026-11-21 stond er geen enkele programma_intake-rij in de tabel).
--
-- Schema tmc only; public en tvmuur onaangeroerd; 20260503 placeholder
-- onaangeroerd. Draaien na merge van de PR, zie de PR-tekst.

begin;

alter table tmc.lead_attributions
  drop constraint if exists lead_attributions_source_type_check;

alter table tmc.lead_attributions
  add constraint lead_attributions_source_type_check
  check (source_type in (
    'trial_booking',
    'trial_request',
    'programma_intake',
    'hormoonprofiel_kennismaking'
  ));

comment on column tmc.lead_attributions.source_type is
  'trial_booking (tmc.trial_bookings, alle drie de boekingspaden), trial_request (tmc.trial_requests, het terugbelformulier), programma_intake (intake 12 weken programma; source_id is het id van de tmc.programma_intakes-rij) of hormoonprofiel_kennismaking (kennismaking hormoonprofiel; zelfde opslag in tmc.programma_intakes met signup_path /hormoonprofiel, source_id is het id van die rij). Geen FK.';

commit;
