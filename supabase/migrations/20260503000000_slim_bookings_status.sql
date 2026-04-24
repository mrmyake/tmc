-- PR3e — Slim bookings.status to {booked, cancelled, waitlisted}.
--
-- Attendance and no-show zijn geen status-waarden meer, maar afgeleid:
--   * attended = er bestaat een check_ins row voor deze booking
--                (profile_id + session_id match), en/of booking_id is gezet
--   * no_show  = bookings.no_show_at is gezet (admin-actie of cron)
--
-- Migratie-stappen hieronder zijn defensief voor bestaande data, maar
-- productie heeft op dit moment geen members dus in de praktijk is dit
-- een schema-only change.

-- 1) Nieuwe kolom: expliciete marker voor no-show die status niet raakt.
alter table public.bookings
  add column if not exists no_show_at timestamptz null;

comment on column public.bookings.no_show_at is
  'Admin of cron markeerde booking als no-show; status blijft booked. Aanwezigheid is een check_ins-row.';

-- 2) Backfill: bestaande attended-rows krijgen een check_ins entry zodat
--    de afgeleide display-status dezelfde visuele output oplevert.
--    admin_web + attended_at als checked_in_at; access_type heuristisch.
insert into public.check_ins
  (profile_id, session_id, booking_id, check_in_method, access_type, pillar, checked_in_at, checked_in_by)
select
  b.profile_id,
  b.session_id,
  b.id,
  'admin_web',
  case when b.membership_id is not null then 'membership' else 'drop_in' end,
  b.pillar,
  coalesce(b.attended_at, s.start_at),
  null
from public.bookings b
join public.class_sessions s on s.id = b.session_id
where b.status = 'attended'
on conflict do nothing;

-- 3) Backfill: bestaande no_show-rows krijgen no_show_at. We houden de
--    attended_at als besttime-beschikbare timestamp (dat was de marker
--    die markAttendance zette) of anders now().
update public.bookings
set no_show_at = coalesce(attended_at, now())
where status = 'no_show' and no_show_at is null;

-- 4) Collaps naar de slim-set. attended → booked (presence ligt nu op
--    check_ins), no_show → booked (presence ligt nu op no_show_at).
update public.bookings
set status = 'booked'
where status in ('attended', 'no_show');

-- 5) Nieuwe check-constraint.
alter table public.bookings
  drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('booked','cancelled','waitlisted'));
