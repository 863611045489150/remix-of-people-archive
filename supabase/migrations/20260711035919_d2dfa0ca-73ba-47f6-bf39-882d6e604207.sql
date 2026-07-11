-- Role system

create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamp with time zone not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users can read their own roles"
  on public.user_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Security-definer role check (avoids infinite recursion in RLS)

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
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

-- One-time bootstrap: first signed-in user becomes admin

create or replace function public.bootstrap_first_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
begin
  select count(*) into admin_count from public.user_roles where role = 'admin';
  if admin_count > 0 then
    return false;
  end if;
  insert into public.user_roles (user_id, role) values (auth.uid(), 'admin');
  return true;
end;
$$;

grant execute on function public.bootstrap_first_admin() to authenticated;

-- Admin write access for friends

grant insert, update, delete on public.friends to authenticated;

create policy "Admins can manage friends"
  on public.friends
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Admin write access for site settings

grant insert, update, delete on public.site_settings to authenticated;

create policy "Admins can manage site settings"
  on public.site_settings
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Storage admin policies (public read already exists)

create policy "Admins can upload friend photos"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'friend-photos' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can update friend photos"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'friend-photos' and public.has_role(auth.uid(), 'admin'))
  with check (bucket_id = 'friend-photos' and public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete friend photos"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'friend-photos' and public.has_role(auth.uid(), 'admin'));