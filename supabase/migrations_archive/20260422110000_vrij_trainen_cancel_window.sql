-- Vrij-trainen (open studio) heeft een veel soepeler cancel-venster dan
-- reguliere groepslessen. Standaard groepsles = 6 uur; vrij trainen = 5 min.
-- Aparte kolom zodat admin dit later in het dashboard kan tunen zonder code.

alter table public.booking_settings
  add column if not exists vrij_trainen_cancel_window_minutes integer
    not null default 5;
