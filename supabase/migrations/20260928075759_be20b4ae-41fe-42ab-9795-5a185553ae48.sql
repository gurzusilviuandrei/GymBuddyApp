ALTER TABLE public.users ADD COLUMN IF NOT EXISTS next_split_day text NOT NULL DEFAULT 'A';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_next_split_day_check;
ALTER TABLE public.users ADD CONSTRAINT users_next_split_day_check CHECK (next_split_day IN ('A','B','C'));

INSERT INTO public.exercises (id, name, movement_type, equipment_type, target, instructions, setup_cue, position_cue, movement_cue, alternative_exercise_id) VALUES
('db-curl','Dumbbell Biceps Curl','Arms/Core','Dumbbell','3 Sets x 10-12 Reps','Curl the dumbbells up with control, then lower slowly.','Pick a pair of light dumbbells you can curl 12 times cleanly.','Stand tall, elbows pinned to your sides, palms facing forward.','Curl up without swinging, squeeze at the top, lower for 3 seconds.',NULL),
('cable-pushdown','Cable Triceps Pushdown','Arms/Core','Machine','3 Sets x 10-12 Reps','Push the cable handle down until your arms are straight.','Set the pulley to the top and attach a rope or straight bar.','Stand close, slight forward lean, elbows tucked at your ribs.','Press down until arms lock out, keep elbows still, return slowly.',NULL),
('barbell-curl','Barbell Biceps Curl','Arms/Core','Barbell','3 Sets x 10-12 Reps','Curl the barbell to your chest with control.','Load a light bar or use an EZ-bar with small plates.','Grip shoulder-width, stand tall, elbows by your sides.','Curl without leaning back, pause at the top, lower slowly.',NULL),
('cable-crunch','Kneeling Cable Crunch','Arms/Core','Machine','3 Sets x 12-15 Reps','Crunch your ribs toward your hips against the cable.','Set the pulley high with a rope attachment and a light weight.','Kneel facing the stack, rope beside your head, hips still.','Round your back to curl down using your abs, pause, rise slowly.',NULL)
ON CONFLICT (id) DO NOTHING;
UPDATE public.exercises SET alternative_exercise_id='barbell-curl' WHERE id='db-curl';
UPDATE public.exercises SET alternative_exercise_id='db-curl' WHERE id IN ('barbell-curl','cable-pushdown');
UPDATE public.exercises SET alternative_exercise_id='cable-pushdown' WHERE id='cable-crunch';

DELETE FROM public.workout_programs WHERE day_number >= 1;
INSERT INTO public.workout_programs (equipment_type, day_number, exercise_ids_list, target_sets, target_reps) VALUES
('full-gym',1,ARRAY['goblet-squat','chest-press','seated-row','back-extension'],3,10),
('full-gym',2,ARRAY['db-rdl','shoulder-press-machine','lat-pulldown','lying-leg-curl'],3,10),
('full-gym',3,ARRAY['leg-press','incline-db-press','db-curl','cable-pushdown','cable-crunch'],3,10),
('dumbbells',1,ARRAY['goblet-squat','db-bench','db-row'],3,10),
('dumbbells',2,ARRAY['db-rdl','db-shoulder-press','db-pullover'],3,10),
('dumbbells',3,ARRAY['db-split-squat','incline-db-press','db-curl'],3,10),
('barbell',1,ARRAY['back-squat','bench-press','barbell-row'],3,10),
('barbell',2,ARRAY['barbell-rdl','overhead-press','db-pullover'],3,10),
('barbell',3,ARRAY['db-split-squat','incline-db-press','barbell-curl'],3,10);