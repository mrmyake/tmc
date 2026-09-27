-- PLACEHOLDER, WORDT NOOIT UITGEVOERD.
--
-- Dit Supabase-project wordt gedeeld met andere apps. De montagebaas-app
-- heeft op 2026-09-25 een migratie toegepast die remote in
-- supabase_migrations.schema_migrations staat als versie 20260925063427
-- (naam 0006_lead_admin_fix: grants op montagebaas-sequences en een view
-- montagebaas.lead_overzicht), zonder bestand in deze repo. De Supabase CLI
-- weigert db push zolang een remote versie lokaal ontbreekt.
--
-- Dit bestand bestaat uitsluitend om die check te passeren, precies zoals
-- 20260503_gallery.sql voor de tvmuur-app. De versie staat remote al als
-- applied geregistreerd, dus db push slaat dit bestand altijd over; de
-- inhoud wordt nooit toegepast. De echte objecten horen bij de montagebaas-
-- app en blijven volledig buiten TMC-beheer.
--
-- Niet verwijderen en niet hernoemen; zie supabase/migrations/README.md.

select 1;
