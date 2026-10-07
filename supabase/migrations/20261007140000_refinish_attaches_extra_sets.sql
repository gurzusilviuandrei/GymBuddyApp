-- Audit L6. If a finish reached the server but its answer never reached the phone, the
-- phone still holds the workout. If the member then logs more sets and finishes again,
-- complete_workout used to recognise the earlier workout and return it as it was, which
-- left the new sets attached to no workout (never counted, never shown).
--
-- Now a repeated finish also takes in any of the member's own sets that belong to no
-- workout yet: they join that workout, and its totals, exercise list and end time are
-- brought up to date. The plan is not rotated a second time, and a repeat with nothing
-- new changes nothing. Everything else is exactly as in 20261006150000.

CREATE OR REPLACE FUNCTION public.complete_workout(
  p_program_type text, p_exercise_ids text[], p_log_ids uuid[], p_started_at timestamptz,
  p_split_day text DEFAULT NULL, p_auto_regulated boolean DEFAULT false,
  p_end_at_last_set boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  n_ids int := coalesce(array_length(p_log_ids, 1), 0);
  existing uuid;
  s public.workout_sessions;
  n int;
  vol numeric;
  earliest timestamptz;
  latest timestamptz;
  finish timestamptz;
  started timestamptz;
  names text[];
  due text;
  done text;
  extra int;
BEGIN
  IF p_program_type NOT IN ('premade', 'custom') THEN RAISE EXCEPTION 'Invalid program type'; END IF;
  IF p_split_day IS NOT NULL AND p_split_day NOT IN ('A', 'B', 'C') THEN RAISE EXCEPTION 'Invalid split day'; END IF;
  IF n_ids = 0 OR coalesce(array_length(p_exercise_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'No sets to save'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_log_ids) x) <> n_ids THEN RAISE EXCEPTION 'Duplicate logged sets'; END IF;

  -- Serialise finishes per member so a double tap can't record two workouts.
  PERFORM 1 FROM public.users WHERE id = uid FOR UPDATE;

  SELECT session_id INTO existing FROM public.workout_logs
  WHERE user_id = uid AND id = ANY (p_log_ids) AND session_id IS NOT NULL LIMIT 1;
  IF existing IS NOT NULL THEN
    SELECT * INTO s FROM public.workout_sessions WHERE id = existing AND user_id = uid;
    IF FOUND THEN
      -- Sets logged after the first save join the workout they belong to.
      UPDATE public.workout_logs SET session_id = s.id, auto_regulated = s.auto_regulated
      WHERE user_id = uid AND id = ANY (p_log_ids) AND session_id IS NULL;
      GET DIAGNOSTICS extra = ROW_COUNT;
      IF extra > 0 THEN
        SELECT count(*), coalesce(sum(weight_kg * reps_completed), 0), max("timestamp")
        INTO n, vol, latest
        FROM public.workout_logs WHERE user_id = uid AND session_id = s.id;

        SELECT coalesce(array_agg(coalesce(e.name, x.id) ORDER BY x.ord), '{}') INTO names
        FROM unnest(p_exercise_ids) WITH ORDINALITY AS x(id, ord)
        LEFT JOIN public.exercises e ON e.id = x.id
        WHERE EXISTS (SELECT 1 FROM public.workout_logs l WHERE l.user_id = uid AND l.session_id = s.id AND l.exercise_id = x.id);

        UPDATE public.workout_sessions
        SET total_sets = n, total_volume_kg = vol, exercise_names = names,
            completed_at = least(greatest(completed_at, latest), now())
        WHERE id = s.id AND user_id = uid
        RETURNING * INTO s;
      END IF;
      RETURN jsonb_build_object('id', s.id, 'sets', s.total_sets, 'volume', s.total_volume_kg);
    END IF;
  END IF;

  SELECT count(*), coalesce(sum(weight_kg * reps_completed), 0), min("timestamp"), max("timestamp")
  INTO n, vol, earliest, latest
  FROM public.workout_logs WHERE user_id = uid AND id = ANY (p_log_ids);
  IF n <> n_ids THEN RAISE EXCEPTION 'Could not read all logged sets'; END IF;

  -- A normal finish ends now. A forgotten workout ends at its last set.
  finish := CASE WHEN coalesce(p_end_at_last_set, false) THEN least(latest, now()) ELSE now() END;

  -- Derive the start from the sets themselves, clamped, so a skewed device clock
  -- can't stamp a session after its end or more than 12 hours before it.
  started := least(coalesce(p_started_at, earliest), earliest, finish);
  started := greatest(started, finish - interval '12 hours');

  SELECT coalesce(array_agg(coalesce(e.name, x.id) ORDER BY x.ord), '{}') INTO names
  FROM unnest(p_exercise_ids) WITH ORDINALITY AS x(id, ord)
  LEFT JOIN public.exercises e ON e.id = x.id
  WHERE EXISTS (SELECT 1 FROM public.workout_logs l WHERE l.user_id = uid AND l.id = ANY (p_log_ids) AND l.exercise_id = x.id);

  IF p_auto_regulated THEN
    UPDATE public.workout_logs SET auto_regulated = true WHERE user_id = uid AND id = ANY (p_log_ids);
  END IF;

  INSERT INTO public.workout_sessions (user_id, program_type, exercise_names, total_sets, total_volume_kg, started_at, completed_at, auto_regulated)
  VALUES (uid, p_program_type, names, n, vol, started, finish, coalesce(p_auto_regulated, false))
  RETURNING * INTO s;

  UPDATE public.workout_logs SET session_id = s.id WHERE user_id = uid AND id = ANY (p_log_ids);

  -- Rotate the pre-made split (A → B → C → A) only when the finished day is still
  -- the day due, so a finish sent from an old screen can't skip a day.
  IF p_program_type = 'premade' THEN
    SELECT next_split_day INTO due FROM public.users WHERE id = uid;
    due := coalesce(due, 'A');
    done := coalesce(p_split_day, due);
    IF done = due THEN
      UPDATE public.users
      SET next_split_day = CASE done WHEN 'A' THEN 'B' WHEN 'B' THEN 'C' ELSE 'A' END
      WHERE id = uid AND next_split_day = due;
    END IF;
  END IF;

  RETURN jsonb_build_object('id', s.id, 'sets', s.total_sets, 'volume', s.total_volume_kg);
END $$;

REVOKE ALL ON FUNCTION public.complete_workout(text, text[], uuid[], timestamptz, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_workout(text, text[], uuid[], timestamptz, text, boolean, boolean) TO authenticated;
