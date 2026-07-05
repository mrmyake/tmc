# Migratie-archief

Deze map bevat de historische migratiebestanden van vóór de baseline-reconciliatie van juli 2026. Ze zijn bewust uit `supabase/migrations/` gehaald en worden door de Supabase CLI niet meer als toe te passen migraties gezien.

## Waarom gearchiveerd

De migratiehistorie en de live database waren uit elkaar gelopen op drie manieren:

1. **Versie-key-paren.** Vrijwel elke migratie vanaf `event_foundation` bestond dubbel: als repo-bestand met een handgekozen timestamp, en als remote history-entry met de timestamp van het moment waarop de SQL via MCP `apply_migration` werd toegepast. Zelfde inhoud, andere sleutel; `supabase migration list --linked` zag daardoor twee disjuncte sets.
2. **Niet-replayable vroege stack.** De bestanden `20260421000000` t/m `20260502000000` zijn tegen het `public.`-schema geschreven, terwijl alle objecten live in het `tmc.`-schema staan. De live staat is correct; deze bestanden beschrijven hem niet meer en mogen nooit opnieuw afgespeeld worden.
3. **Wees op een dode branch.** `20260703120000_profiles_phone_nullable.sql` stond alleen op de ongemergde branch `fix/profile-phone-nullable` (commit a63f895), terwijl de wijziging al live was toegepast. Het bestand is hier mee-gearchiveerd zodat de definitie op main staat.

## Waar de waarheid nu staat

De volledige live staat van het `tmc`-schema is vastgelegd in de baseline-migratie in `supabase/migrations/`. Die baseline is gegenereerd vanaf de live database en per objectklasse geverifieerd tegen `pg_get_functiondef`, `pg_get_viewdef`, `pg_get_triggerdef`, `pg_policies` en `information_schema`.

Let op: dit Supabase-project wordt gedeeld met een tweede app (tvmuur; het `tvmuur`-schema plus `public.projects` en `public.project_photos`). Die objecten en de bijbehorende history-entry `20260503 gallery` horen niet bij TMC en vallen buiten de baseline en buiten dit archief.

Raadpleeg deze bestanden alleen als historische context; voor de actuele schema-definitie is de baseline leidend, en daarboven de live database zelf.
