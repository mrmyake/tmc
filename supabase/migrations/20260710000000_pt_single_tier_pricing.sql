-- PT-consolidatie: Marlon is de enige PT + prijs-updates (data-only, geen DDL)
--
--   * tmc.trainers: is_pt_available = false voor Remi, Fenna en Ilja. Marlon
--     blijft de enige bookbare PT-trainer in /app/pt (besluit vastgelegd,
--     zie CLAUDE.md). Geen upcoming pt_sessions/pt_bookings gevonden voor
--     deze drie trainers op het moment van schrijven (geverifieerd via
--     execute_sql), dus er raakt niets wees door deze flip.
--   * tmc.booking_settings (singleton): drop-in yoga/kettlebell 20 -> 17
--     euro, 10-rittenkaart 170 -> 150 euro. member_pt_discount_percent naar
--     0 voor hygiene; het ledenkorting-concept vervalt met deze PR (de
--     TS-pricing-engine en de admin-UI lezen/schrijven dit veld niet meer,
--     zie src/lib/member/pt-pricing.ts en src/app/app/admin/instellingen).
--     De kolom zelf blijft bestaan (geen DDL in deze PR).

-- ---------------------------------------------------------------------------
-- trainers: Marlon is de enige PT
-- ---------------------------------------------------------------------------

UPDATE "tmc"."trainers"
SET "is_pt_available" = false
WHERE "slug" IN ('remi', 'fenna', 'ilja-goossens');

-- ---------------------------------------------------------------------------
-- booking_settings: drop-in / rittenkaart prijzen + dode ledenkorting-veld
-- ---------------------------------------------------------------------------

UPDATE "tmc"."booking_settings"
SET
    "drop_in_yoga_cents" = 1700,
    "drop_in_kettlebell_cents" = 1700,
    "ten_ride_card_cents" = 15000,
    "member_pt_discount_percent" = 0
WHERE "id" = 'singleton';
