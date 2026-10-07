-- Beta testers get Pro. The official version is free for everyone until billing exists, so
-- Pro must be something the owner grants on purpose, never something members can ask for.
--
-- How it works: the owner puts a tester's email on public.beta_testers (in the Supabase SQL
-- Editor). The next time that member opens the app, ensure_user_row() marks their account
-- Pro with subscription_status = 'beta'. If the email is later removed from the list, the next
-- app start puts the account back on the free tier, so ending the beta is one line:
--     delete from public.beta_testers;
-- Pro granted any other way (the owner's own account, future store billing) has a different
-- status and is never touched by this.
--
--   add a tester:     insert into public.beta_testers (email, note) values ('maria@example.com', 'Maria');
--   remove a tester:  delete from public.beta_testers where email = 'maria@example.com';
--   see the list:     select * from public.beta_testers;
--
-- Members can neither read nor change the list (no grants, row-level security on, no policy).

CREATE TABLE IF NOT EXISTS public.beta_testers (
  email text PRIMARY KEY CHECK (position('@' IN email) > 1),
  note text,
  added_at timestamptz NOT NULL DEFAULT now()
);

-- Emails are compared in lower case, so store them that way whatever was typed.
CREATE OR REPLACE FUNCTION public.normalize_beta_email() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS beta_testers_normalize ON public.beta_testers;
CREATE TRIGGER beta_testers_normalize BEFORE INSERT OR UPDATE ON public.beta_testers
  FOR EACH ROW EXECUTE FUNCTION public.normalize_beta_email();

ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_testers FROM PUBLIC, anon, authenticated;

-- Same as before, plus: a member on the list becomes Pro ('beta'); a 'beta' member who is no
-- longer on the list goes back to free.
CREATE OR REPLACE FUNCTION public.ensure_user_row() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := public.require_user();
  r public.users;
  listed boolean;
BEGIN
  BEGIN
    INSERT INTO public.users (id) VALUES (uid) ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN foreign_key_violation THEN
    -- The login was deleted but this device still holds its old session.
    RETURN jsonb_build_object('userId', uid, 'accountMissing', true, 'onboarded', false,
      'fullName', null, 'frequency', null, 'goal', null, 'equipment', null);
  END;

  SELECT EXISTS (
    SELECT 1 FROM public.beta_testers b JOIN auth.users a ON lower(a.email) = b.email WHERE a.id = uid
  ) INTO listed;
  IF listed THEN
    UPDATE public.users SET subscription_tier = 'pro', subscription_status = 'beta'
    WHERE id = uid AND subscription_tier <> 'pro';
  ELSE
    UPDATE public.users SET subscription_tier = 'basic', subscription_status = NULL
    WHERE id = uid AND subscription_tier = 'pro' AND subscription_status = 'beta';
  END IF;

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
