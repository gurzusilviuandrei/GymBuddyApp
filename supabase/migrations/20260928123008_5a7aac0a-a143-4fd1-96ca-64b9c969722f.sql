DROP POLICY IF EXISTS "Exercises are public" ON public.exercises;
CREATE POLICY "Signed-in users read exercises" ON public.exercises FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.exercises FROM anon;
DROP POLICY IF EXISTS "Programs are public" ON public.workout_programs;
CREATE POLICY "Signed-in users read programs" ON public.workout_programs FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.workout_programs FROM anon;