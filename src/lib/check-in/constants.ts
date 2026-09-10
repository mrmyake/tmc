/**
 * Lengte van de tablet-admin-PIN, vast op 6 cijfers. Vóór PR #185/#186
 * mocht dit 4-6 zijn (elke laag valideerde los `^[0-9]{4,6}$`), maar
 * auto-submit op /checkin (zonder bevestigknop) moet weten wanneer een
 * PIN compleet is — dat kan alleen bij een vaste lengte. Wijzig je dit
 * getal, werk dan ook de migratie bij die `set_admin_checkin_pin` op de
 * database valideert (supabase/migrations/20260911120000_checkin_pin_fixed_length.sql).
 */
export const CHECKIN_PIN_LENGTH = 6;
