-- Explicitly remove anon execute; authenticated keep it for the bootstrap flow.
revoke execute on function public.bootstrap_first_admin() from anon;
revoke execute on function public.has_role(uuid, public.app_role) from anon;

grant execute on function public.bootstrap_first_admin() to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;