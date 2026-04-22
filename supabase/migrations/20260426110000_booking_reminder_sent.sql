-- Markeer wanneer de 24u-reminder mail verstuurd is zodat de cron niet
-- dubbel fired.

alter table public.bookings
  add column if not exists reminder_sent_at timestamptz;

create index if not exists bookings_reminder_idx
  on public.bookings(reminder_sent_at)
  where reminder_sent_at is null and status = 'booked';
