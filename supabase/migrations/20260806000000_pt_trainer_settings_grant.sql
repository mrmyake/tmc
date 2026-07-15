-- PT-agenda PR E2, bijvangst: execute-grant op tmc.pt_trainer_settings.
--
-- 20260729 deed "revoke execute ... from public" op deze helper (samen
-- met apply_credit_adjustment en pt_slot_is_free, die terecht intern
-- blijven), maar er is daarna nooit een grant bijgekomen. Daardoor
-- faalt elke PostgREST-rpc-aanroep stil: de trainer-agenda (PR J,
-- src/app/app/trainer/agenda/page.tsx) en het nieuwe E2-overzicht
-- vallen dan altijd terug op de 24-uurs default, ook wanneer een
-- trainer een afwijkend cancel_window_hours heeft. Live geverifieerd op
-- 2026-07-15: information_schema.routine_privileges toont uitsluitend
-- postgres/EXECUTE.
--
-- De functie geeft alleen effectieve instellingen per trainer terug
-- (duur, buffer, horizon, annuleringsvenster), geen PII en geen
-- agenda-data; een brede lees-grant is veilig en nodig omdat zowel de
-- service-role-client (admin-pagina's) als de RLS-client (trainer-
-- schermen) hem aanroepen.

grant execute on function tmc.pt_trainer_settings(uuid) to authenticated, service_role;
