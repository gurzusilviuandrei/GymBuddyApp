ALTER TABLE public.workout_sessions ADD COLUMN auto_regulated boolean NOT NULL DEFAULT false;
ALTER TABLE public.workout_logs ADD COLUMN auto_regulated boolean NOT NULL DEFAULT false;