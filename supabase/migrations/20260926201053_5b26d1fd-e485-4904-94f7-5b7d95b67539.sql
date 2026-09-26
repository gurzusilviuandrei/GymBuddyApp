CREATE TABLE public.workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  program_type text NOT NULL CHECK (program_type IN ('premade','custom')),
  exercise_names text[] NOT NULL DEFAULT '{}',
  total_sets integer NOT NULL DEFAULT 0,
  total_volume_kg numeric NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workout_sessions TO authenticated;
GRANT ALL ON public.workout_sessions TO service_role;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sessions" ON public.workout_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX workout_sessions_user_completed_idx ON public.workout_sessions (user_id, completed_at DESC);