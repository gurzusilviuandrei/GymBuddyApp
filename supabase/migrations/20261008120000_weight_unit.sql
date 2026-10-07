-- Pounds as well as kilograms. Weights stay stored in kilograms everywhere (sets, volumes,
-- history); this only records which unit a member wants to SEE and TYPE, so it follows them
-- to a new phone. The app converts at the edges.
--
-- Backwards compatible on purpose (the official and beta apps share this database): the new
-- argument is optional. An app that doesn't send it creates members on kilograms and leaves a
-- member's existing choice untouched.
--
-- Adding an argument creates a second overload that PostgREST could not choose between, so the
-- old signatures are dropped first. ensure_user_row is deliberately NOT changed here (the app
-- reads the unit straight from the member's own row), so this migration cannot disturb
-- anything that function does.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS weight_unit text NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb'));

DROP FUNCTION IF EXISTS public.create_user_profile(text, int, text, text, text);

CREATE OR REPLACE FUNCTION public.create_user_profile(
  p_full_name text, p_age int, p_frequency text, p_primary_goal text, p_equipment_type text,
  p_weight_unit text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  days int := CASE p_frequency WHEN '2-days' THEN 2 WHEN '3-days' THEN 3 WHEN '4-plus' THEN 4 END;
BEGIN
  IF days IS NULL THEN RAISE EXCEPTION 'Invalid training frequency'; END IF;
  IF p_weight_unit IS NOT NULL AND p_weight_unit NOT IN ('kg', 'lb') THEN RAISE EXCEPTION 'Invalid weight unit'; END IF;
  -- Name, age, goal and equipment are range-checked by the table constraints.
  INSERT INTO public.users (id, full_name, age, weekly_goal_days, primary_goal, equipment_type, weight_unit)
  VALUES (uid, btrim(p_full_name), p_age, days, p_primary_goal, p_equipment_type, coalesce(p_weight_unit, 'kg'))
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name, age = EXCLUDED.age, weekly_goal_days = EXCLUDED.weekly_goal_days,
    primary_goal = EXCLUDED.primary_goal, equipment_type = EXCLUDED.equipment_type,
    weight_unit = coalesce(p_weight_unit, public.users.weight_unit);
  RETURN uid;
END $$;

DROP FUNCTION IF EXISTS public.update_training_profile(text, int, text, text, text);

CREATE OR REPLACE FUNCTION public.update_training_profile(
  p_full_name text, p_age int, p_frequency text, p_primary_goal text, p_equipment_type text,
  p_weight_unit text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  days int := CASE p_frequency WHEN '2-days' THEN 2 WHEN '3-days' THEN 3 WHEN '4-plus' THEN 4 END;
  old_equipment text;
  restarted boolean;
  unit text;
BEGIN
  IF days IS NULL THEN RAISE EXCEPTION 'Invalid training frequency'; END IF;
  IF p_weight_unit IS NOT NULL AND p_weight_unit NOT IN ('kg', 'lb') THEN RAISE EXCEPTION 'Invalid weight unit'; END IF;

  -- Lock the row so a finish in progress and this edit can't interleave.
  SELECT equipment_type INTO old_equipment FROM public.users WHERE id = uid FOR UPDATE;
  IF NOT FOUND OR old_equipment IS NULL THEN RAISE EXCEPTION 'Finish setting up your profile first'; END IF;

  restarted := old_equipment IS DISTINCT FROM p_equipment_type;

  UPDATE public.users
  SET full_name = btrim(p_full_name),
      age = p_age,
      weekly_goal_days = days,
      primary_goal = p_primary_goal,
      equipment_type = p_equipment_type,
      weight_unit = coalesce(p_weight_unit, weight_unit),
      next_split_day = CASE WHEN restarted THEN 'A' ELSE next_split_day END
  WHERE id = uid
  RETURNING weight_unit INTO unit;

  RETURN jsonb_build_object('equipment', p_equipment_type, 'restarted', restarted, 'weightUnit', unit);
END $$;

REVOKE ALL ON FUNCTION public.create_user_profile(text, int, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_user_profile(text, int, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_training_profile(text, int, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_training_profile(text, int, text, text, text, text) TO authenticated;
