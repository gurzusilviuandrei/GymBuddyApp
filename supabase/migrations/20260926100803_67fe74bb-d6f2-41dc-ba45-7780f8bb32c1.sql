INSERT INTO public.exercises (id, name, movement_type, instructions, alternative_exercise_id) VALUES
('resistance-band-pull','Resistance Band Pull','vertical-pull','Anchor the band overhead, pull elbows down to your ribs, squeeze your lats, return slowly.',NULL)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, movement_type=EXCLUDED.movement_type, instructions=EXCLUDED.instructions;
UPDATE public.exercises SET alternative_exercise_id='leg-press' WHERE id='goblet-squat';
UPDATE public.exercises SET alternative_exercise_id='goblet-squat' WHERE id='leg-press';
UPDATE public.exercises SET alternative_exercise_id='chest-press' WHERE id='db-bench';
UPDATE public.exercises SET alternative_exercise_id='db-bench' WHERE id='chest-press';
UPDATE public.exercises SET alternative_exercise_id='seated-row' WHERE id='db-row';
UPDATE public.exercises SET alternative_exercise_id='db-row' WHERE id='seated-row';
UPDATE public.exercises SET alternative_exercise_id='resistance-band-pull' WHERE id='lat-pulldown';
UPDATE public.exercises SET alternative_exercise_id='lat-pulldown' WHERE id='resistance-band-pull';
UPDATE public.exercises SET name='Dumbbell Bench Press' WHERE id='db-bench';
UPDATE public.exercises SET name='Chest Press Machine' WHERE id='chest-press';
UPDATE public.exercises SET name='Dumbbell Row' WHERE id='db-row';
UPDATE public.exercises SET name='Seated Cable Row' WHERE id='seated-row';
UPDATE public.workout_programs SET exercise_ids_list=ARRAY['leg-press','chest-press','seated-row','lat-pulldown','db-rdl','shoulder-press-machine'] WHERE equipment_type='full-gym' AND day_number=1;
UPDATE public.workout_programs SET exercise_ids_list=ARRAY['goblet-squat','db-bench','db-row','resistance-band-pull','db-rdl','db-shoulder-press'] WHERE equipment_type='dumbbells' AND day_number=1;