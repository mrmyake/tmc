-- Trainingsschema: tempo X (explosief) wordt opgeslagen als -1 zodat het
-- verschilt van 0 seconden, en de slotlijst loopt door tot G2 (14 per dag).
-- Alleen schema tmc. duplicate_training_program kopieert de kolommen 1-op-1
-- en hoeft niet te veranderen.

begin;

-- 1. Tempo-checks: -1 (explosief) is toegestaan.
alter table tmc.program_exercises
  drop constraint program_exercises_tempo_eccentric_check,
  drop constraint program_exercises_tempo_pause_bottom_check,
  drop constraint program_exercises_tempo_concentric_check,
  drop constraint program_exercises_tempo_pause_top_check;

alter table tmc.program_exercises
  add constraint program_exercises_tempo_eccentric_check
    check (tempo_eccentric >= -1),
  add constraint program_exercises_tempo_pause_bottom_check
    check (tempo_pause_bottom >= -1),
  add constraint program_exercises_tempo_concentric_check
    check (tempo_concentric >= -1),
  add constraint program_exercises_tempo_pause_top_check
    check (tempo_pause_top >= -1);

-- 2. Conversie: tot nu toe betekende 0 explosief. In excentrisch en
-- concentrisch wordt dat -1; de pauzevelden blijven 0 (geen pauze), voor
-- elke programmastatus. Idempotent: -1 is geen 0.
update tmc.program_exercises
set tempo_eccentric = case when tempo_eccentric = 0 then -1 else tempo_eccentric end,
    tempo_concentric = case when tempo_concentric = 0 then -1 else tempo_concentric end
where tempo_eccentric = 0 or tempo_concentric = 0;

-- 3. Slots A1 t/m G2.
alter table tmc.program_exercises
  drop constraint program_exercises_slot_check;
alter table tmc.program_exercises
  add constraint program_exercises_slot_check check (slot ~ '^[A-G][12]$');

commit;
