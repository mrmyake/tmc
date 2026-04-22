-- Trainer-opt-in om de volledige intake-blessuretekst te zien in D2.
-- Default false. Admin toggelt per trainer via C6 drawer.

alter table public.trainers
  add column if not exists has_health_access boolean not null default false;
