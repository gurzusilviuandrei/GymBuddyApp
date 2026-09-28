CREATE TABLE public.user_machine_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_id text NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  seat_notch text,
  pad_notch text,
  custom_setting_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_id),
  CHECK (char_length(coalesce(seat_notch,'')) <= 8 AND char_length(coalesce(pad_notch,'')) <= 8 AND char_length(coalesce(custom_setting_notes,'')) <= 120)
);
GRANT SELECT ON public.user_machine_settings TO authenticated;
GRANT ALL ON public.user_machine_settings TO service_role;
ALTER TABLE public.user_machine_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own machine settings" ON public.user_machine_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER user_machine_settings_touch BEFORE UPDATE ON public.user_machine_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();