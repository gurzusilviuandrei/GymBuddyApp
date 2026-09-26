ALTER TABLE public.workout_programs
  ADD COLUMN IF NOT EXISTS target_sets integer NOT NULL DEFAULT 3 CHECK (target_sets BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS target_reps integer NOT NULL DEFAULT 10 CHECK (target_reps BETWEEN 1 AND 100);