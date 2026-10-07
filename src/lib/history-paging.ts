// History shows the newest workouts first, 100 at a time. "Show older workouts" asks for
// 100 more. The server answers at most 1,000 rows per request, so the list stops there
// (at three workouts a week that is about six years).

export const HISTORY_PAGE = 100;
export const HISTORY_MAX = 1000;

/** Whether older workouts may exist: the last request came back full and is below the cap. */
export function canShowOlder(loaded: number, limit: number): boolean {
  return loaded >= limit && limit < HISTORY_MAX;
}

/** The limit to ask for after "Show older workouts", never past the cap. */
export function nextHistoryLimit(limit: number): number {
  return Math.min(limit + HISTORY_PAGE, HISTORY_MAX);
}
