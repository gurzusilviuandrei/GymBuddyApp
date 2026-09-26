CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 60),
  age int NOT NULL CHECK (age BETWEEN 10 AND 100),
  weekly_goal_days int NOT NULL CHECK (weekly_goal_days BETWEEN 1 AND 7),
  primary_goal text NOT NULL CHECK (primary_goal IN ('lose-weight','gain-muscle','sports-performance')),
  equipment_type text NOT NULL CHECK (equipment_type IN ('full-gym','dumbbells','barbell')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.exercises (
  id text PRIMARY KEY,
  name text NOT NULL,
  movement_type text NOT NULL,
  video_url text,
  instructions text NOT NULL DEFAULT '',
  alternative_exercise_id text REFERENCES public.exercises(id)
);
GRANT SELECT ON public.exercises TO anon, authenticated;
GRANT ALL ON public.exercises TO service_role;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Exercises are public" ON public.exercises FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.workout_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_type text NOT NULL CHECK (equipment_type IN ('full-gym','dumbbells','barbell')),
  day_number int NOT NULL CHECK (day_number >= 1),
  exercise_ids_list text[] NOT NULL,
  UNIQUE (equipment_type, day_number)
);
GRANT SELECT ON public.workout_programs TO anon, authenticated;
GRANT ALL ON public.workout_programs TO service_role;
ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Programs are public" ON public.workout_programs FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_id text NOT NULL REFERENCES public.exercises(id),
  weight_kg numeric(6,2) NOT NULL CHECK (weight_kg >= 0 AND weight_kg <= 1000),
  reps_completed int NOT NULL CHECK (reps_completed BETWEEN 1 AND 100),
  set_number int NOT NULL CHECK (set_number BETWEEN 1 AND 50),
  "timestamp" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workout_logs_user_idx ON public.workout_logs (user_id, "timestamp" DESC);
GRANT ALL ON public.workout_logs TO service_role;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.exercises (id, name, movement_type, instructions) VALUES
('goblet-squat','Goblet Squat','Squat','Hold a dumbbell at your chest, sit hips back and down, drive up through your heels.'),
('back-squat','Barbell Back Squat','Squat','Bar on upper back, brace, squat to parallel, stand tall.'),
('leg-press','Leg Press','Squat','Feet shoulder-width on the platform, lower under control, press without locking knees.'),
('db-rdl','Dumbbell Romanian Deadlift','Hinge','Soft knees, push hips back keeping dumbbells close, squeeze glutes to stand.'),
('barbell-rdl','Barbell Romanian Deadlift','Hinge','Hinge at the hips with a flat back, bar close to legs, return by driving hips forward.'),
('db-bench','Dumbbell Bench Press','Horizontal Press','Lie flat, press dumbbells up over your chest, lower to chest level.'),
('bench-press','Barbell Bench Press','Horizontal Press','Grip slightly wider than shoulders, lower to mid-chest, press up.'),
('chest-press','Machine Chest Press','Horizontal Press','Adjust seat so handles are at chest height, press forward, return slowly.'),
('db-row','One-Arm Dumbbell Row','Horizontal Pull','Hand on bench, pull dumbbell to your hip, lower with control.'),
('barbell-row','Barbell Bent-Over Row','Horizontal Pull','Hinge forward, pull bar to lower ribs, lower under control.'),
('seated-row','Seated Cable Row','Horizontal Pull','Sit tall, pull handle to your stomach, squeeze shoulder blades.'),
('db-shoulder-press','Dumbbell Shoulder Press','Vertical Press','Press dumbbells overhead from shoulder height, avoid arching.'),
('overhead-press','Barbell Overhead Press','Vertical Press','Bar at collarbone, brace, press overhead, head through at the top.'),
('shoulder-press-machine','Machine Shoulder Press','Vertical Press','Handles at shoulder height, press up, lower slowly.'),
('db-pullover','Dumbbell Pullover','Vertical Pull','Lie on bench, lower dumbbell behind head with slightly bent arms, pull back over chest.'),
('lat-pulldown','Lat Pulldown','Vertical Pull','Grip wider than shoulders, pull bar to upper chest, control it back up.'),
('assisted-pullup','Assisted Pull-Up','Vertical Pull','Kneel on the pad, pull chin over the bar, lower fully.');

UPDATE public.exercises SET alternative_exercise_id = CASE id
  WHEN 'leg-press' THEN 'goblet-squat' WHEN 'back-squat' THEN 'goblet-squat' WHEN 'goblet-squat' THEN 'leg-press'
  WHEN 'barbell-rdl' THEN 'db-rdl' WHEN 'db-rdl' THEN 'barbell-rdl'
  WHEN 'chest-press' THEN 'db-bench' WHEN 'bench-press' THEN 'db-bench' WHEN 'db-bench' THEN 'chest-press'
  WHEN 'seated-row' THEN 'db-row' WHEN 'barbell-row' THEN 'db-row' WHEN 'db-row' THEN 'seated-row'
  WHEN 'shoulder-press-machine' THEN 'db-shoulder-press' WHEN 'overhead-press' THEN 'db-shoulder-press' WHEN 'db-shoulder-press' THEN 'shoulder-press-machine'
  WHEN 'lat-pulldown' THEN 'assisted-pullup' WHEN 'assisted-pullup' THEN 'lat-pulldown' WHEN 'db-pullover' THEN 'lat-pulldown'
END;

INSERT INTO public.workout_programs (equipment_type, day_number, exercise_ids_list) VALUES
('full-gym',1,ARRAY['leg-press','db-rdl','chest-press','seated-row','shoulder-press-machine','lat-pulldown']),
('full-gym',2,ARRAY['goblet-squat','barbell-rdl','db-bench','db-row','db-shoulder-press','assisted-pullup']),
('dumbbells',1,ARRAY['goblet-squat','db-rdl','db-bench','db-row','db-shoulder-press','db-pullover']),
('dumbbells',2,ARRAY['goblet-squat','db-rdl','db-bench','db-row','db-shoulder-press','db-pullover']),
('barbell',1,ARRAY['back-squat','barbell-rdl','bench-press','barbell-row','overhead-press','db-pullover']),
('barbell',2,ARRAY['back-squat','barbell-rdl','bench-press','barbell-row','overhead-press','db-pullover']);