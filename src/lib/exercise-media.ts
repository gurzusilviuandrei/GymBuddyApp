// Exercise demonstration frames.
// Source: free-exercise-db (yuhonas/free-exercise-db) — public domain / unlicensed.
// Two frames per movement (start + finish) are cross-faded to form a looping demo.

import arnold_press_0 from "@/assets/exercises/arnold-press-0.webp";
import arnold_press_1 from "@/assets/exercises/arnold-press-1.webp";
import assisted_pullup_0 from "@/assets/exercises/assisted-pullup-0.webp";
import assisted_pullup_1 from "@/assets/exercises/assisted-pullup-1.webp";
import back_extension_0 from "@/assets/exercises/back-extension-0.webp";
import back_extension_1 from "@/assets/exercises/back-extension-1.webp";
import back_squat_0 from "@/assets/exercises/back-squat-0.webp";
import back_squat_1 from "@/assets/exercises/back-squat-1.webp";
import barbell_curl_0 from "@/assets/exercises/barbell-curl-0.webp";
import barbell_curl_1 from "@/assets/exercises/barbell-curl-1.webp";
import barbell_hip_thrust_0 from "@/assets/exercises/barbell-hip-thrust-0.webp";
import barbell_hip_thrust_1 from "@/assets/exercises/barbell-hip-thrust-1.webp";
import barbell_rdl_0 from "@/assets/exercises/barbell-rdl-0.webp";
import barbell_rdl_1 from "@/assets/exercises/barbell-rdl-1.webp";
import barbell_row_0 from "@/assets/exercises/barbell-row-0.webp";
import barbell_row_1 from "@/assets/exercises/barbell-row-1.webp";
import bench_press_0 from "@/assets/exercises/bench-press-0.webp";
import bench_press_1 from "@/assets/exercises/bench-press-1.webp";
import cable_crunch_0 from "@/assets/exercises/cable-crunch-0.webp";
import cable_crunch_1 from "@/assets/exercises/cable-crunch-1.webp";
import cable_pushdown_0 from "@/assets/exercises/cable-pushdown-0.webp";
import cable_pushdown_1 from "@/assets/exercises/cable-pushdown-1.webp";
import chest_press_0 from "@/assets/exercises/chest-press-0.webp";
import chest_press_1 from "@/assets/exercises/chest-press-1.webp";
import chest_supported_row_0 from "@/assets/exercises/chest-supported-row-0.webp";
import chest_supported_row_1 from "@/assets/exercises/chest-supported-row-1.webp";
import close_grip_pulldown_0 from "@/assets/exercises/close-grip-pulldown-0.webp";
import close_grip_pulldown_1 from "@/assets/exercises/close-grip-pulldown-1.webp";
import db_bench_0 from "@/assets/exercises/db-bench-0.webp";
import db_bench_1 from "@/assets/exercises/db-bench-1.webp";
import db_curl_0 from "@/assets/exercises/db-curl-0.webp";
import db_curl_1 from "@/assets/exercises/db-curl-1.webp";
import db_pullover_0 from "@/assets/exercises/db-pullover-0.webp";
import db_pullover_1 from "@/assets/exercises/db-pullover-1.webp";
import db_rdl_0 from "@/assets/exercises/db-rdl-0.webp";
import db_rdl_1 from "@/assets/exercises/db-rdl-1.webp";
import db_rear_delt_fly_0 from "@/assets/exercises/db-rear-delt-fly-0.webp";
import db_rear_delt_fly_1 from "@/assets/exercises/db-rear-delt-fly-1.webp";
import db_row_0 from "@/assets/exercises/db-row-0.webp";
import db_row_1 from "@/assets/exercises/db-row-1.webp";
import db_shoulder_press_0 from "@/assets/exercises/db-shoulder-press-0.webp";
import db_shoulder_press_1 from "@/assets/exercises/db-shoulder-press-1.webp";
import db_split_squat_0 from "@/assets/exercises/db-split-squat-0.webp";
import db_split_squat_1 from "@/assets/exercises/db-split-squat-1.webp";
import goblet_squat_0 from "@/assets/exercises/goblet-squat-0.webp";
import goblet_squat_1 from "@/assets/exercises/goblet-squat-1.webp";
import hack_squat_0 from "@/assets/exercises/hack-squat-0.webp";
import hack_squat_1 from "@/assets/exercises/hack-squat-1.webp";
import incline_db_press_0 from "@/assets/exercises/incline-db-press-0.webp";
import incline_db_press_1 from "@/assets/exercises/incline-db-press-1.webp";
import landmine_press_0 from "@/assets/exercises/landmine-press-0.webp";
import landmine_press_1 from "@/assets/exercises/landmine-press-1.webp";
import lat_pulldown_0 from "@/assets/exercises/lat-pulldown-0.webp";
import lat_pulldown_1 from "@/assets/exercises/lat-pulldown-1.webp";
import leg_press_0 from "@/assets/exercises/leg-press-0.webp";
import leg_press_1 from "@/assets/exercises/leg-press-1.webp";
import lying_leg_curl_0 from "@/assets/exercises/lying-leg-curl-0.webp";
import lying_leg_curl_1 from "@/assets/exercises/lying-leg-curl-1.webp";
import overhead_press_0 from "@/assets/exercises/overhead-press-0.webp";
import overhead_press_1 from "@/assets/exercises/overhead-press-1.webp";
import pec_fly_0 from "@/assets/exercises/pec-fly-0.webp";
import pec_fly_1 from "@/assets/exercises/pec-fly-1.webp";
import resistance_band_pull_0 from "@/assets/exercises/resistance-band-pull-0.webp";
import resistance_band_pull_1 from "@/assets/exercises/resistance-band-pull-1.webp";
import seated_row_0 from "@/assets/exercises/seated-row-0.webp";
import seated_row_1 from "@/assets/exercises/seated-row-1.webp";
import shoulder_press_machine_0 from "@/assets/exercises/shoulder-press-machine-0.webp";
import shoulder_press_machine_1 from "@/assets/exercises/shoulder-press-machine-1.webp";

export type ExerciseFrames = readonly [string, string];

export const EXERCISE_FRAMES: Record<string, ExerciseFrames> = {
  "arnold-press": [arnold_press_0, arnold_press_1],
  "assisted-pullup": [assisted_pullup_0, assisted_pullup_1],
  "back-extension": [back_extension_0, back_extension_1],
  "back-squat": [back_squat_0, back_squat_1],
  "barbell-curl": [barbell_curl_0, barbell_curl_1],
  "barbell-hip-thrust": [barbell_hip_thrust_0, barbell_hip_thrust_1],
  "barbell-rdl": [barbell_rdl_0, barbell_rdl_1],
  "barbell-row": [barbell_row_0, barbell_row_1],
  "bench-press": [bench_press_0, bench_press_1],
  "cable-crunch": [cable_crunch_0, cable_crunch_1],
  "cable-pushdown": [cable_pushdown_0, cable_pushdown_1],
  "chest-press": [chest_press_0, chest_press_1],
  "chest-supported-row": [chest_supported_row_0, chest_supported_row_1],
  "close-grip-pulldown": [close_grip_pulldown_0, close_grip_pulldown_1],
  "db-bench": [db_bench_0, db_bench_1],
  "db-curl": [db_curl_0, db_curl_1],
  "db-pullover": [db_pullover_0, db_pullover_1],
  "db-rdl": [db_rdl_0, db_rdl_1],
  "db-rear-delt-fly": [db_rear_delt_fly_0, db_rear_delt_fly_1],
  "db-row": [db_row_0, db_row_1],
  "db-shoulder-press": [db_shoulder_press_0, db_shoulder_press_1],
  "db-split-squat": [db_split_squat_0, db_split_squat_1],
  "goblet-squat": [goblet_squat_0, goblet_squat_1],
  "hack-squat": [hack_squat_0, hack_squat_1],
  "incline-db-press": [incline_db_press_0, incline_db_press_1],
  "landmine-press": [landmine_press_0, landmine_press_1],
  "lat-pulldown": [lat_pulldown_0, lat_pulldown_1],
  "leg-press": [leg_press_0, leg_press_1],
  "lying-leg-curl": [lying_leg_curl_0, lying_leg_curl_1],
  "overhead-press": [overhead_press_0, overhead_press_1],
  "pec-fly": [pec_fly_0, pec_fly_1],
  "resistance-band-pull": [resistance_band_pull_0, resistance_band_pull_1],
  "seated-row": [seated_row_0, seated_row_1],
  "shoulder-press-machine": [shoulder_press_machine_0, shoulder_press_machine_1],
};

export const DEMO_ATTRIBUTION = "Demonstrations: free-exercise-db (open source)";

export function getExerciseFrames(exerciseId: string | undefined | null): ExerciseFrames | null {
  if (!exerciseId) return null;
  return EXERCISE_FRAMES[exerciseId] ?? null;
}
