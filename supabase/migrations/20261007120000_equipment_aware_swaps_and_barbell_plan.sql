-- Audit M8, two parts.
--
-- 1. Swap suggestions respect the member's equipment. Before, a "Dumbbells Only"
--    member could be offered a machine or a barbell. Now: dumbbells -> dumbbell
--    exercises, barbell -> barbell exercises, full gym (or not onboarded yet) -> everything.
--    Same name and arguments as before, so existing grants and callers are unchanged.
--
-- 2. The "Barbell Only" plan had dumbbell exercises on days 2 and 3 (Dumbbell Pullover,
--    Dumbbell Bulgarian Split Squat, Incline Dumbbell Press). They are replaced with
--    barbell exercises already in the library. There is no barbell vertical pull, so the
--    pullover becomes a second row day (rows twice a week is normal for beginners).
--      day 2: Barbell RDL, Barbell Overhead Press, Barbell Bent-Over Row
--      day 3: Barbell Hip Thrust, Barbell Bench Press, Barbell Biceps Curl

CREATE OR REPLACE FUNCTION public.get_alternative_options(p_exercise_id text, p_exclude text[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur record;
  mine text;
BEGIN
  PERFORM public.require_user();
  IF NOT public.is_pro_user() THEN RAISE EXCEPTION 'PRO_REQUIRED'; END IF;
  SELECT movement_type, alternative_exercise_id INTO cur FROM public.exercises WHERE id = p_exercise_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  SELECT equipment_type INTO mine FROM public.users WHERE id = auth.uid();
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.curated DESC, t.name)
    FROM (
      SELECT id, name, instructions, setup_cue, position_cue, movement_cue, video_url, alternative_exercise_id,
             equipment_type, movement_type, (id = cur.alternative_exercise_id) AS curated
      FROM public.exercises
      WHERE movement_type = cur.movement_type AND id <> p_exercise_id AND NOT (id = ANY (coalesce(p_exclude, '{}')))
        AND (
          mine IS NULL OR mine NOT IN ('dumbbells', 'barbell')
          OR equipment_type = CASE mine WHEN 'dumbbells' THEN 'Dumbbell' ELSE 'Barbell' END
        )
      ORDER BY (id = cur.alternative_exercise_id) DESC, name
      LIMIT 4
    ) t), '[]'::jsonb);
END $$;

UPDATE public.workout_programs
SET exercise_ids_list = ARRAY['barbell-rdl', 'overhead-press', 'barbell-row']::text[]
WHERE equipment_type = 'barbell' AND day_number = 2;

UPDATE public.workout_programs
SET exercise_ids_list = ARRAY['barbell-hip-thrust', 'bench-press', 'barbell-curl']::text[]
WHERE equipment_type = 'barbell' AND day_number = 3;
