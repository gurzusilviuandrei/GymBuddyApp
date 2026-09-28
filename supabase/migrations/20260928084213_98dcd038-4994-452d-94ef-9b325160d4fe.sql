ALTER TABLE public.workout_logs ADD COLUMN client_key text;
CREATE UNIQUE INDEX workout_logs_user_client_key_uniq ON public.workout_logs (user_id, client_key);