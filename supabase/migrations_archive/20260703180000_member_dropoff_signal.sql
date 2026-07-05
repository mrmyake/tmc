-- Attendance-dropoff signal (spec-community-growth.md §2, decided).
--
-- Doel: een dagelijkse cron kan efficient de hele ledenbasis scannen op
-- "actief abonnement, geen bezoek in N dagen" zonder de per-pagina
-- app-laag-logica in members-query.ts te hergebruiken (die is bedoeld
-- voor een begrensde admin-UI-pagina, niet voor een scan over alle
-- leden per run).
--
-- Plain view, niet materialized: dit wordt 1x per dag door de cron
-- bevraagd, geen reden voor een refresh-cyclus zoals vw_admin_kpis.

create view tmc.v_member_last_attendance as
select profile_id, max(checked_in_date) as last_attended_at
from tmc.check_ins
group by profile_id;
