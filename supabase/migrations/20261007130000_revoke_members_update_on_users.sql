-- Audit L5 (hardening). Members could only read their profile row, but they still held
-- an UPDATE grant on the table (from an early migration). Row-level security already
-- stopped any update, since there is no UPDATE policy, but a policy added by mistake
-- later would have opened it. Every write goes through the database functions, which
-- run with the owner's rights, so nothing in the app changes.
REVOKE UPDATE ON public.users FROM authenticated;
