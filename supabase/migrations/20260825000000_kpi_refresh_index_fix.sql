-- Facturatie PR 8, tweede bestand: de unique index op tmc.vw_admin_kpis
-- moet een KOLOM-index zijn, geen expressie-index.
--
-- 20260824000000 nam de bestaande index letterlijk over:
--   create unique index ... on tmc.vw_admin_kpis ((refreshed_at is not null))
-- Maar REFRESH MATERIALIZED VIEW CONCURRENTLY weigert expressie-indexen
-- (SQLSTATE 55000: "Create a unique index with no WHERE clause on one or
-- more columns"). De G2-verificatie na de push legde dat bloot, en daarmee
-- iets groters: die expressie-index stond er al sinds de view bestond, dus
-- tmc.refresh_admin_kpis() (CONCURRENTLY) heeft vermoedelijk NOOIT
-- succesvol gedraaid. De refreshed_at van 2026-07-05 was de initiele
-- populate bij het aanmaken van de view, niet een geslaagde cron-run. De
-- cron faalde dus dubbel: eerst structureel op deze index, en sinds de
-- eerste credit-membership bovendien op de division by zero die
-- 20260824000000 herstelde.
--
-- refreshed_at is als kolom uniek per constructie: de view is een
-- singleton (een rij, now() bij elke refresh).

begin;

drop index if exists tmc.vw_admin_kpis_refresh_idx;
create unique index vw_admin_kpis_refresh_idx on tmc.vw_admin_kpis (refreshed_at);

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'tmc' and tablename = 'vw_admin_kpis'
      and indexdef = 'CREATE UNIQUE INDEX vw_admin_kpis_refresh_idx ON tmc.vw_admin_kpis USING btree (refreshed_at)'
  ) then
    raise exception 'kpi_refresh_index_fix: kolom-index niet aangemaakt zoals bedoeld';
  end if;
end $$;

commit;

-- Buiten de transactie (CONCURRENTLY mag niet in een transactieblok): de
-- daadwerkelijke G2-proef. Faalt deze, dan faalt de hele push en is dat
-- zichtbaar, precies zoals 7.8 wil.
refresh materialized view concurrently tmc.vw_admin_kpis;
