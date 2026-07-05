# Migratie-werkwijze

Sinds de baseline-reconciliatie van juli 2026 geldt:

1. **Elke nieuwe migratie is een repo-bestand** in deze map, met de gebruikelijke naam `<YYYYMMDDHHMMSS>_<beschrijving>.sql`.
2. **Toepassen gaat via `supabase db push`.** De history is sinds de baseline in sync, dus push werkt weer betrouwbaar en registreert de juiste versie-key.
3. **MCP `apply_migration` alleen als nood-fallback.** Wie hem toch gebruikt, herstelt direct daarna de boekhouding: markeer de repo-versie als applied met `supabase migration repair --status applied <repo-versie>` en verwijder de MCP-timestamp met `supabase migration repair --status reverted <mcp-versie>`. Zo ontstaan er geen dubbele versie-keys meer (de drift-klasse die de reconciliatie nodig maakte).
4. **Altijd gescoped op schema `tmc`.** Dit project wordt gedeeld met een tweede app (tvmuur); gebruik bij `db diff` en `db dump` altijd `--schema tmc` en laat de history-entry `20260503` (gallery, van die andere app) met rust.
5. **`20260503_gallery.sql` is een placeholder.** De CLI eist dat elke remote history-versie een lokaal bestand heeft; de gallery-entry hoort bij de tvmuur-app en heeft geen echte TMC-migratie. Het bestand wordt nooit uitgevoerd (de versie staat remote al als applied) en mag niet verwijderd of hernoemd worden, anders weigert `db push`.

De pre-baseline bestanden staan ter referentie in `supabase/migrations_archive/`; zie de README daar voor de achtergrond.
