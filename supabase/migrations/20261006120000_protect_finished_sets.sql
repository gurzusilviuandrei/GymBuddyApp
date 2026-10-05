-- Single-set deletion is only for the workout in progress (a mistaken set, or an
-- abandoned workout). Sets that already belong to a finished workout can only go
-- with that workout (delete_workout_session), so a stale or abandoned copy of a
-- workout on the phone can never strip sets out of the history.
CREATE OR REPLACE FUNCTION public.delete_workout_set(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.workout_logs
  WHERE id = p_id AND user_id = public.require_user() AND session_id IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.delete_workout_set(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_workout_set(uuid) TO authenticated;
