ALTER TABLE public.users
  ADD COLUMN subscription_tier text NOT NULL DEFAULT 'basic',
  ADD COLUMN paddle_customer_id text,
  ADD COLUMN subscription_status text,
  ADD COLUMN paddle_subscription_id text,
  ADD COLUMN subscription_environment text,
  ADD COLUMN subscription_period_end timestamptz;

CREATE OR REPLACE FUNCTION public.is_pro(_user_id uuid, _env text DEFAULT 'live')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND subscription_tier = 'pro' AND subscription_environment = _env
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_pro(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid, text) TO authenticated, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.users;