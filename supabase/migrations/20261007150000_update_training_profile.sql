-- Edit training profile: a member can change their name, age, training days, goal and
-- equipment after onboarding. Before this, someone who picked "Dumbbells Only" stayed on
-- that plan for good.
--
-- Same checks as create_user_profile (the table constraints range-check name, age, goal and
-- equipment). Changing the equipment restarts the pre-made rotation at Day A, because the
-- exercises change; every other edit leaves the rotation where it is. The custom routine and
-- Pro status are never touched. The caller is always the signed-in member (no user id argument).
CREATE OR REPLACE FUNCTION public.update_training_profile(
  p_full_name text, p_age int, p_frequency text, p_primary_goal text, p_equipment_type text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  days int := CASE p_frequency WHEN '2-days' THEN 2 WHEN '3-days' THEN 3 WHEN '4-plus' THEN 4 END;
  old_equipment text;
  restarted boolean;
BEGIN
  IF days IS NULL THEN RAISE EXCEPTION 'Invalid training frequency'; END IF;

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
      next_split_day = CASE WHEN restarted THEN 'A' ELSE next_split_day END
  WHERE id = uid;

  RETURN jsonb_build_object('equipment', p_equipment_type, 'restarted', restarted);
END $$;

REVOKE ALL ON FUNCTION public.update_training_profile(text, int, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_training_profile(text, int, text, text, text) TO authenticated;
