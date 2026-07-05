-- Uitbreiding van de oefeningenbibliotheek (spec-trainingsprotocol.md PR 1)
-- op verzoek van Marlon: een bredere basisset dan het originele Overload-
-- voorbeeldschema. Idempotent via de bestaande lower(name)-unique
-- (exercises_name_lower_idx), dus overlappende namen worden overgeslagen
-- in plaats van dubbel aangemaakt.
--
-- Acht namen uit de aangeleverde lijst bestonden al uit de PR 1-seed
-- (Front Squat, Leg Press, Leg Curl, Dips, Standing Dumbbell Press,
-- Bent-Over Barbell Row, Seated Pulley Row, Sit-Ups) en staan daarom
-- bewust NIET in onderstaande lijst.

insert into tmc.exercises (name)
values
  ('Back Squat'),
  ('Goblet Squat'),
  ('Split Squat'),
  ('Bulgarian Split Squat'),
  ('Walking Lunge'),
  ('Reverse Lunge'),
  ('Leg Extension'),
  ('Hip Thrust'),
  ('Glute Bridge'),
  ('Calf Raise'),
  ('Deadlift'),
  ('Romanian Deadlift'),
  ('Sumo Deadlift'),
  ('Trap Bar Deadlift'),
  ('Single-Leg Romanian Deadlift'),
  ('Good Morning'),
  ('Bench Press'),
  ('Incline Bench Press'),
  ('Dumbbell Bench Press'),
  ('Incline Dumbbell Press'),
  ('Push-Up'),
  ('Cable Chest Fly'),
  ('Dumbbell Chest Fly'),
  ('Overhead Press (Barbell)'),
  ('Overhead Press (Dumbbell)'),
  ('Seated Dumbbell Press'),
  ('Arnold Press'),
  ('Push Press'),
  ('Lateral Raise'),
  ('Front Raise'),
  ('Dumbbell Row'),
  ('Pull-Up'),
  ('Chin-Up'),
  ('Lat Pulldown'),
  ('Straight-Arm Pulldown'),
  ('Barbell Curl'),
  ('Dumbbell Curl'),
  ('Hammer Curl'),
  ('Triceps Curl'),
  ('Skull Crusher'),
  ('Plank'),
  ('Side Plank'),
  ('Dead Bug'),
  ('Bird Dog'),
  ('Hanging Knee Raise'),
  ('Hanging Leg Raise'),
  ('Ab Wheel Rollout'),
  ('Russian Twist'),
  ('Cable Crunch')
on conflict ((lower(name))) do nothing;
