-- Remove public/anonymous execute on the role-check functions.
-- Authenticated users still need these, so we keep that grant.
revoke execute on function public.has_role(uuid, public.app_role) from public;
revoke execute on function public.bootstrap_first_admin() from public;

-- Re-confirm authenticated execute (preserved by CREATE OR REPLACE, but explicit is safer)
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.bootstrap_first_admin() to authenticated;