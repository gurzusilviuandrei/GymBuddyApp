ALTER TABLE public.workout_logs
  ADD COLUMN session_id uuid REFERENCES public.workout_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS workout_logs_session_id_idx ON public.workout_logs (session_id);