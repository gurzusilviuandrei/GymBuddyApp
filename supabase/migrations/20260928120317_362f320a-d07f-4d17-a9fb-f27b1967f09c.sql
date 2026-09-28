CREATE OR REPLACE FUNCTION public.is_pro(_user_id uuid, _env text DEFAULT 'live')
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND subscription_tier = 'pro' AND subscription_environment = _env
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_pro(uuid, text) FROM PUBLIC, anon;