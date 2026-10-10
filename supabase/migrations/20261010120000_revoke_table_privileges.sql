-- Security review finding M1 (2026-10-10): signed-out visitors (anon) and members
-- (authenticated) still held Supabase's default table privileges, including TRUNCATE, which
-- ignores row-level security: one statement could empty a table for everyone. The app never
-- needs them: members only read their own rows (RLS), and every write goes through the
-- SECURITY DEFINER functions, which run as the table owner and are not affected by this.

-- Signed-out visitors: nothing on any table.
REVOKE ALL ON TABLE
  public.users, public.exercises, public.workout_programs,
  public.workout_logs, public.workout_sessions, public.user_machine_settings
FROM anon;

-- Members: reading only (row-level security still limits it to their own rows).
REVOKE ALL ON TABLE
  public.users, public.exercises, public.workout_programs,
  public.workout_logs, public.workout_sessions, public.user_machine_settings
FROM authenticated;
GRANT SELECT ON TABLE
  public.users, public.exercises, public.workout_programs,
  public.workout_logs, public.workout_sessions, public.user_machine_settings
TO authenticated;

-- Tables created later (by the role running migrations) no longer get these grants
-- automatically; a new table must grant exactly what it needs.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
