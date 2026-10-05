-- Standalone API: replaces the TanStack server functions so the app can talk to
-- Supabase directly. Reads go through RLS; every write runs here as the signed-in
-- user (auth.uid()) and never trusts a user id sent by the client.

-- ── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.require_user() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000'; END IF;
  RETURN uid;
END $$;

-- Pro is a single server-side flag; only trusted billing code may set it.
CREATE OR REPLACE FUNCTION public.is_pro_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND subscription_tier = 'pro');
$$;

-- ── Profile ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_user_row() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  r public.users;
BEGIN
  BEGIN
    INSERT INTO public.users (id) VALUES (uid) ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN foreign_key_violation THEN
    -- The login was deleted but this device still holds its old session.
    RETURN jsonb_build_object('userId', uid, 'accountMissing', true, 'onboarded', false,
      'fullName', null, 'frequency', null, 'goal', null, 'equipment', null);
  END;
  SELECT * INTO r FROM public.users WHERE id = uid;
  RETURN jsonb_build_object(
    'userId', uid,
    'accountMissing', false,
    'onboarded', r.equipment_type IS NOT NULL,
    'fullName', r.full_name,
    'frequency', CASE r.weekly_goal_days WHEN 2 THEN '2-days' WHEN 3 THEN '3-days' WHEN 4 THEN '4-plus' END,
    'goal', r.primary_goal,
    'equipment', r.equipment_type);
END $$;

CREATE OR REPLACE FUNCTION public.create_user_profile(
  p_full_name text, p_age int, p_frequency text, p_primary_goal text, p_equipment_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  days int := CASE p_frequency WHEN '2-days' THEN 2 WHEN '3-days' THEN 3 WHEN '4-plus' THEN 4 END;
BEGIN
  IF days IS NULL THEN RAISE EXCEPTION 'Invalid training frequency'; END IF;
  -- Name, age, goal and equipment are range-checked by the table constraints.
  INSERT INTO public.users (id, full_name, age, weekly_goal_days, primary_goal, equipment_type)
  VALUES (uid, btrim(p_full_name), p_age, days, p_primary_goal, p_equipment_type)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name, age = EXCLUDED.age, weekly_goal_days = EXCLUDED.weekly_goal_days,
    primary_goal = EXCLUDED.primary_goal, equipment_type = EXCLUDED.equipment_type;
  RETURN uid;
END $$;

CREATE OR REPLACE FUNCTION public.save_custom_routine(p_exercise_ids text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  n int := coalesce(array_length(p_exercise_ids, 1), 0);
BEGIN
  IF NOT public.is_pro_user() THEN RAISE EXCEPTION 'PRO_REQUIRED'; END IF;
  IF n = 0 THEN RAISE EXCEPTION 'Pick at least one exercise'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_exercise_ids) x) <> n THEN RAISE EXCEPTION 'Pick different exercises'; END IF;
  IF (SELECT count(*) FROM public.exercises WHERE id = ANY (p_exercise_ids)) <> n THEN RAISE EXCEPTION 'Unknown exercise'; END IF;
  UPDATE public.users SET is_custom = true, custom_exercise_ids = p_exercise_ids WHERE id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Could not save routine'; END IF;
END $$;

-- ── Sets ────────────────────────────────────────────────────────────────────

-- Idempotent: a retried set with the same client key updates its one row.
CREATE OR REPLACE FUNCTION public.log_workout_set(
  p_exercise_id text, p_weight_kg numeric, p_reps_completed int, p_set_number int, p_client_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  prev numeric;
  pr boolean;
  saved public.workout_logs;
BEGIN
  IF p_client_key IS NOT NULL AND char_length(p_client_key) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid client key';
  END IF;
  -- All-time peak for this exercise, ignoring this same set on retries.
  SELECT max(weight_kg) INTO prev FROM public.workout_logs
  WHERE user_id = uid AND exercise_id = p_exercise_id
    AND (p_client_key IS NULL OR client_key IS DISTINCT FROM p_client_key);
  pr := prev IS NOT NULL AND p_weight_kg > prev;

  IF p_client_key IS NOT NULL THEN
    INSERT INTO public.workout_logs (user_id, exercise_id, weight_kg, reps_completed, set_number, client_key, is_personal_record)
    VALUES (uid, p_exercise_id, p_weight_kg, p_reps_completed, p_set_number, p_client_key, pr)
    ON CONFLICT (user_id, client_key) DO UPDATE SET
      exercise_id = EXCLUDED.exercise_id, weight_kg = EXCLUDED.weight_kg, reps_completed = EXCLUDED.reps_completed,
      set_number = EXCLUDED.set_number, is_personal_record = EXCLUDED.is_personal_record
    RETURNING * INTO saved;
  ELSE
    INSERT INTO public.workout_logs (user_id, exercise_id, weight_kg, reps_completed, set_number, is_personal_record)
    VALUES (uid, p_exercise_id, p_weight_kg, p_reps_completed, p_set_number, pr)
    RETURNING * INTO saved;
  END IF;
  RETURN jsonb_build_object('id', saved.id, 'set_number', saved.set_number, 'is_personal_record', saved.is_personal_record);
END $$;

CREATE OR REPLACE FUNCTION public.update_workout_set(p_id uuid, p_weight_kg numeric, p_reps_completed int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  ex text;
  best numeric;
  pr boolean;
BEGIN
  SELECT exercise_id INTO ex FROM public.workout_logs WHERE id = p_id AND user_id = uid;
  IF ex IS NULL THEN RAISE EXCEPTION 'That set no longer exists'; END IF;
  -- A correction can create or undo an all-time record, so re-judge it.
  SELECT max(weight_kg) INTO best FROM public.workout_logs WHERE user_id = uid AND exercise_id = ex AND id <> p_id;
  pr := best IS NOT NULL AND p_weight_kg > best;
  UPDATE public.workout_logs SET weight_kg = p_weight_kg, reps_completed = p_reps_completed, is_personal_record = pr
  WHERE id = p_id AND user_id = uid;
  RETURN jsonb_build_object('ok', true, 'is_personal_record', pr, 'exercise_id', ex);
END $$;

CREATE OR REPLACE FUNCTION public.delete_workout_set(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.workout_logs WHERE id = p_id AND user_id = public.require_user();
END $$;

CREATE OR REPLACE FUNCTION public.save_machine_setting(
  p_exercise_id text, p_seat_notch text, p_pad_notch text, p_custom_setting_notes text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Lengths are enforced by the table constraint.
  INSERT INTO public.user_machine_settings (user_id, exercise_id, seat_notch, pad_notch, custom_setting_notes)
  VALUES (public.require_user(), p_exercise_id, nullif(btrim(p_seat_notch), ''), nullif(btrim(p_pad_notch), ''),
          nullif(btrim(p_custom_setting_notes), ''))
  ON CONFLICT (user_id, exercise_id) DO UPDATE SET
    seat_notch = EXCLUDED.seat_notch, pad_notch = EXCLUDED.pad_notch, custom_setting_notes = EXCLUDED.custom_setting_notes;
END $$;

-- ── Workouts ────────────────────────────────────────────────────────────────

-- Records a finished workout from this session's own log IDs. Idempotent: a
-- resubmitted finish returns the same workout instead of saving a second one.
CREATE OR REPLACE FUNCTION public.complete_workout(
  p_program_type text, p_exercise_ids text[], p_log_ids uuid[], p_started_at timestamptz,
  p_split_day text DEFAULT NULL, p_auto_regulated boolean DEFAULT false
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
  started timestamptz;
  names text[];
  due text;
  done text;
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
      RETURN jsonb_build_object('id', s.id, 'sets', s.total_sets, 'volume', s.total_volume_kg);
    END IF;
  END IF;

  SELECT count(*), coalesce(sum(weight_kg * reps_completed), 0), min("timestamp")
  INTO n, vol, earliest
  FROM public.workout_logs WHERE user_id = uid AND id = ANY (p_log_ids);
  IF n <> n_ids THEN RAISE EXCEPTION 'Could not read all logged sets'; END IF;

  -- Derive the start from the sets themselves, clamped, so a skewed device clock
  -- can't stamp a session in the future or far in the past.
  started := least(coalesce(p_started_at, earliest), earliest, now());
  started := greatest(started, now() - interval '12 hours');

  SELECT coalesce(array_agg(coalesce(e.name, x.id) ORDER BY x.ord), '{}') INTO names
  FROM unnest(p_exercise_ids) WITH ORDINALITY AS x(id, ord)
  LEFT JOIN public.exercises e ON e.id = x.id
  WHERE EXISTS (SELECT 1 FROM public.workout_logs l WHERE l.user_id = uid AND l.id = ANY (p_log_ids) AND l.exercise_id = x.id);

  IF p_auto_regulated THEN
    UPDATE public.workout_logs SET auto_regulated = true WHERE user_id = uid AND id = ANY (p_log_ids);
  END IF;

  INSERT INTO public.workout_sessions (user_id, program_type, exercise_names, total_sets, total_volume_kg, started_at, auto_regulated)
  VALUES (uid, p_program_type, names, n, vol, started, coalesce(p_auto_regulated, false))
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

CREATE OR REPLACE FUNCTION public.delete_workout_session(p_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  s public.workout_sessions;
  n int;
BEGIN
  SELECT * INTO s FROM public.workout_sessions WHERE id = p_session_id AND user_id = uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('deleted', false); END IF;
  DELETE FROM public.workout_logs WHERE user_id = uid AND session_id = s.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    -- Legacy session without linkage: only unlinked sets inside its window.
    DELETE FROM public.workout_logs
    WHERE user_id = uid AND session_id IS NULL AND "timestamp" BETWEEN s.started_at AND s.completed_at;
  END IF;
  DELETE FROM public.workout_sessions WHERE id = s.id AND user_id = uid;
  RETURN jsonb_build_object('deleted', true);
END $$;

-- ── Pro reads ───────────────────────────────────────────────────────────────

-- Up to 4 alternatives sharing the movement pattern; the curated one comes first.
CREATE OR REPLACE FUNCTION public.get_alternative_options(p_exercise_id text, p_exclude text[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur record;
BEGIN
  PERFORM public.require_user();
  IF NOT public.is_pro_user() THEN RAISE EXCEPTION 'PRO_REQUIRED'; END IF;
  SELECT movement_type, alternative_exercise_id INTO cur FROM public.exercises WHERE id = p_exercise_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.curated DESC, t.name)
    FROM (
      SELECT id, name, instructions, setup_cue, position_cue, movement_cue, video_url, alternative_exercise_id,
             equipment_type, movement_type, (id = cur.alternative_exercise_id) AS curated
      FROM public.exercises
      WHERE movement_type = cur.movement_type AND id <> p_exercise_id AND NOT (id = ANY (coalesce(p_exclude, '{}')))
      ORDER BY (id = cur.alternative_exercise_id) DESC, name
      LIMIT 4
    ) t), '[]'::jsonb);
END $$;

-- Best estimated 1RM (Epley) per local training day over the last 8 weeks.
CREATE OR REPLACE FUNCTION public.get_exercise_progress(p_exercise_id text, p_tz_offset int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
BEGIN
  IF NOT public.is_pro_user() THEN RAISE EXCEPTION 'PRO_REQUIRED'; END IF;
  IF p_tz_offset NOT BETWEEN -840 AND 840 THEN RAISE EXCEPTION 'Invalid timezone'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('date', d, 'e1rm', e1rm, 'weight', w, 'reps', r) ORDER BY d)
    FROM (
      SELECT DISTINCT ON (d) d, e1rm, w, r
      FROM (
        SELECT weight_kg AS w, reps_completed AS r, "timestamp" AS ts,
               round(weight_kg * (1 + reps_completed / 30.0) * 10) / 10 AS e1rm,
               to_char(("timestamp" - make_interval(mins => p_tz_offset)) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d
        FROM public.workout_logs
        WHERE user_id = uid AND exercise_id = p_exercise_id AND "timestamp" >= now() - interval '56 days'
        ORDER BY "timestamp"
        LIMIT 2000
      ) rows
      ORDER BY d, e1rm DESC, ts
    ) best), '[]'::jsonb);
END $$;

-- ── Account ─────────────────────────────────────────────────────────────────

-- Permanent deletion after re-checking the member's password.
CREATE OR REPLACE FUNCTION public.delete_account(p_password text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  uid uuid := public.require_user();
  hash text;
BEGIN
  SELECT encrypted_password INTO hash FROM auth.users WHERE id = uid;
  IF hash IS NULL OR hash = '' OR p_password IS NULL OR extensions.crypt(p_password, hash) <> hash THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'invalid_password');
  END IF;
  DELETE FROM public.workout_sessions WHERE user_id = uid;
  DELETE FROM public.workout_logs WHERE user_id = uid;
  DELETE FROM public.user_machine_settings WHERE user_id = uid;
  DELETE FROM public.users WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
  RETURN jsonb_build_object('deleted', true, 'reason', null);
END $$;

-- ── Access ──────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.require_user()',
    'public.is_pro_user()',
    'public.ensure_user_row()',
    'public.create_user_profile(text, int, text, text, text)',
    'public.save_custom_routine(text[])',
    'public.log_workout_set(text, numeric, int, int, text)',
    'public.update_workout_set(uuid, numeric, int)',
    'public.delete_workout_set(uuid)',
    'public.save_machine_setting(text, text, text, text)',
    'public.complete_workout(text, text[], uuid[], timestamptz, text, boolean)',
    'public.delete_workout_session(uuid)',
    'public.get_alternative_options(text, text[])',
    'public.get_exercise_progress(text, int)',
    'public.delete_account(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
