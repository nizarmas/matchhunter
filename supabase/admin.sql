-- Admin security: one admin email, decided on the server (not in the app bundle).
-- Re-run safely. Does not reset admin_email if you already changed it.

alter table public.profiles add column if not exists account_blocked boolean default false;
alter table public.profiles add column if not exists is_admin boolean default false;

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  admin_email text not null
);

insert into public.app_settings (id, admin_email)
values (1, 'nizarmas@gmail.com')
on conflict (id) do nothing;

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(coalesce(
    (select email from auth.users where id = auth.uid()),
    auth.jwt() ->> 'email',
    ''
  )) = lower((select admin_email from public.app_settings where id = 1));
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin();
$$;

create or replace function public.set_admin_email(new_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := lower(trim(coalesce(new_email, '')));
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if cleaned !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'invalid_email';
  end if;
  if not exists (
    select 1 from public.profiles
    where lower(email) = cleaned
      and coalesce(account_blocked, false) = false
  ) then
    raise exception 'email_not_registered';
  end if;
  update public.app_settings set admin_email = cleaned where id = 1;
  update public.profiles set is_admin = (lower(email) = cleaned);
end;
$$;

revoke all on function public.set_admin_email(text) from public, anon;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_current_user_admin() to anon, authenticated, service_role;
grant execute on function public.set_admin_email(text) to authenticated, service_role;

notify pgrst, 'reload schema';

update public.profiles
set is_admin = (
  lower(email) = lower((select admin_email from public.app_settings where id = 1))
);

drop policy if exists "transactions_admin_select" on public.transactions;
create policy "transactions_admin_select" on public.transactions
  for select to authenticated using (public.is_admin());

drop policy if exists "transactions_admin_insert" on public.transactions;
create policy "transactions_admin_insert" on public.transactions
  for insert to authenticated with check (public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update to authenticated using (public.is_admin());

drop policy if exists "notifications_admin_insert" on public.notifications;
create policy "notifications_admin_insert" on public.notifications
  for insert to authenticated with check (public.is_admin());

drop policy if exists "matches_admin_select" on public.matches;
create policy "matches_admin_select" on public.matches
  for select to authenticated using (public.is_admin());
,gkv t, vt,r