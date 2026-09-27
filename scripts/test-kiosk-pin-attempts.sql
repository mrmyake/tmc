-- Bewijs voor tmc.register_kiosk_pin_attempt (check-in PR 2, migratie
-- 20260927120000_kiosk_pin_session.sql): vijf foute pogingen per staflid
-- per apparaat, daarna vijftien minuten blokkade; een ander staflid op
-- hetzelfde apparaat is niet geraakt.
--
-- Draaien NA de merge en na `supabase db push`, tegen live (MCP execute_sql
-- of psql), als service_role/postgres. Gebruikt een wegwerp-apparaat met
-- een vast id en twee bestaande profielen (welke dan ook: de teller hangt
-- aan (profile_id, device_id) en verifieert geen PIN). Alles in één
-- transactie die eindigt in rollback, dus er blijft niets achter.
--
-- Verwachte uitkomsten staan per stap in het commentaar.

begin;

insert into tmc.kiosk_devices (id, label)
values ('00000000-0000-4000-8000-00000000dead', 'test-pogingen (wegwerp)');

create temporary table t_ids as
select
  '00000000-0000-4000-8000-00000000dead'::uuid as device_id,
  (select id from tmc.profiles order by created_at limit 1) as p1,
  (select id from tmc.profiles order by created_at offset 1 limit 1) as p2;

-- Stap 1 t/m 5: allowed = true, fail_count 1..5.
select tmc.register_kiosk_pin_attempt(p1, device_id) as poging_1 from t_ids;
select tmc.register_kiosk_pin_attempt(p1, device_id) as poging_2 from t_ids;
select tmc.register_kiosk_pin_attempt(p1, device_id) as poging_3 from t_ids;
select tmc.register_kiosk_pin_attempt(p1, device_id) as poging_4 from t_ids;
select tmc.register_kiosk_pin_attempt(p1, device_id) as poging_5 from t_ids;

-- Verwacht: true (locked_until staat nu op now() + 15 minuten).
select a.locked_until > now() as geblokkeerd
from tmc.kiosk_pin_attempts a
join t_ids on a.profile_id = t_ids.p1 and a.device_id = t_ids.device_id;

-- Stap 6: {"allowed": false, "retry_after_seconds": <= 900}.
select tmc.register_kiosk_pin_attempt(p1, device_id) as poging_6_geblokkeerd from t_ids;

-- Ander staflid op hetzelfde apparaat: eigen teller, {"allowed": true, "fail_count": 1}.
select tmc.register_kiosk_pin_attempt(p2, device_id) as ander_staflid from t_ids;

-- Een goede PIN wist de rij (doet de app); hier nagebootst: daarna is de
-- teller weg en begint p1 weer op 1 na de blokkade.
delete from tmc.kiosk_pin_attempts where profile_id = (select p1 from t_ids);
select tmc.register_kiosk_pin_attempt(p1, device_id) as na_reset from t_ids;

rollback;
