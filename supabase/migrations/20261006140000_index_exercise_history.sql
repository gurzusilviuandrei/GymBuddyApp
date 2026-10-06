-- Speed for the per-exercise lookups that run on every exercise of every workout:
-- "last time you lifted" (getLastLog), the personal-record check in log_workout_set /
-- update_workout_set, and the Pro progress graph. Without it these scan all of a
-- member's sets, which grows by ~30 rows per workout.
CREATE INDEX IF NOT EXISTS workout_logs_user_exercise_time_idx
  ON public.workout_logs (user_id, exercise_id, "timestamp" DESC);
