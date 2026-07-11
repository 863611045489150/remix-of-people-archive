-- Convert has_role to security invoker. It still works inside RLS policies because
-- the user_roles policy lets users read their own role row.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public;

-- Keep bootstrap_first_admin as security definer and ensure only authenticated can call it.
revoke execute on function public.bootstrap_first_admin() from public;