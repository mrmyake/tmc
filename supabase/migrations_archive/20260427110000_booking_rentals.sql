-- Optional rentals per booking. Prices are NOT stored here — they live
-- in booking_settings-adjacent copy and are paid at the studio. These
-- flags only exist so Marlon knows how many mats/towels to stage.
-- Only meaningful for sessions with pillar = 'yoga_mobility'.

alter table public.bookings
  add column if not exists rental_mat boolean not null default false,
  add column if not exists rental_towel boolean not null default false;

create index if not exists bookings_rental_idx
  on public.bookings(session_id)
  where rental_mat or rental_towel;
