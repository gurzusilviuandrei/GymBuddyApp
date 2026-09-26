ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS equipment_type text NOT NULL DEFAULT 'Machine';
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS target text NOT NULL DEFAULT '3 Sets x 10-12 Reps';
ALTER TABLE public.exercises ADD CONSTRAINT exercises_equipment_type_check CHECK (equipment_type IN ('Barbell','Dumbbell','Machine'));