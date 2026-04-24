-- PR3d — No-show release setting.
--
-- `no_show_release_minutes` dicteert hoe ver voor start een booked-maar-
-- niet-ingecheckte reservering wordt losgelaten zodat de plek terug
-- beschikbaar komt voor de wachtlijst. Default 10 min is een compromis
-- tussen "last-minute check-in werkt nog" en "waitlist-promote heeft
-- genoeg runway om iemand op te roepen".

alter table public.booking_settings
  add column if not exists no_show_release_minutes integer not null default 10;

comment on column public.booking_settings.no_show_release_minutes is
  'Minuten voor sessie-start waarop /api/cron/release-no-shows booked-zonder-check-in bookings cancelled + vrijgeeft voor waitlist.';
