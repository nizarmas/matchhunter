-- Payment settings + wipe customer memberships (keep admin).
-- Run the ENTIRE file in SQL Editor (Ctrl+A then Run). Safe to re-run.

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  admin_email text not null
);

insert into public.app_settings (id, admin_email)
values (1, 'nizarmas@gmail.com')
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

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

grant execute on function public.is_admin() to anon, authenticated, service_role;

alter table public.profiles add column if not exists membership_until timestamptz;
alter table public.profiles add column if not exists account_blocked boolean default false;
alter table public.profiles add column if not exists is_admin boolean default false;

alter table public.app_settings add column if not exists payment_mode text not null default 'simulation';
alter table public.app_settings add column if not exists paypal_email text not null default 'nizarmas@gmail.com';
alter table public.app_settings add column if not exists paypal_client_id text not null default '';
alter table public.app_settings add column if not exists stripe_publishable_key text not null default '';

alter table public.app_settings drop constraint if exists app_settings_payment_mode_check;
alter table public.app_settings add constraint app_settings_payment_mode_check
  check (payment_mode in ('simulation', 'live'));

update public.app_settings
set
  payment_mode = coalesce(payment_mode, 'simulation'),
  paypal_email = coalesce(nullif(paypal_email, ''), 'nizarmas@gmail.com')
where id = 1;

create or replace function public.get_payment_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'mode', payment_mode,
    'paypal_email', paypal_email,
    'paypal_client_id', paypal_client_id,
    'stripe_publishable_key', stripe_publishable_key
  )
  from public.app_settings
  where id = 1;
$$;

create or replace function public.set_payment_settings(
  new_mode text,
  new_paypal_email text,
  new_paypal_client_id text,
  new_stripe_publishable_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_email text := lower(trim(coalesce(new_paypal_email, '')));
  cleaned_mode text := lower(trim(coalesce(new_mode, 'simulation')));
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if cleaned_mode not in ('simulation', 'live') then
    raise exception 'invalid_mode';
  end if;
  if cleaned_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'invalid_email';
  end if;
  update public.app_settings
  set
    payment_mode = cleaned_mode,
    paypal_email = cleaned_email,
    paypal_client_id = trim(coalesce(new_paypal_client_id, '')),
    stripe_publishable_key = trim(coalesce(new_stripe_publishable_key, ''))
  where id = 1;
end;
$$;

create or replace function public.reset_customer_memberships()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  update public.profiles set membership_until = null;
  delete from public.transactions;
  delete from public.matches;
end;
$$;

grant execute on function public.get_payment_settings() to anon, authenticated, service_role;
grant execute on function public.set_payment_settings(text, text, text, text) to authenticated, service_role;
grant execute on function public.reset_customer_memberships() to authenticated, service_role;

create or replace function public.admin_delete_customer(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if target_id is null or target_id = auth.uid() then
    raise exception 'cannot_delete_self';
  end if;
  if exists (
    select 1
    from public.profiles p, public.app_settings s
    where p.id = target_id
      and lower(coalesce(p.email, '')) = lower(s.admin_email)
  ) then
    raise exception 'cannot_delete_admin';
  end if;
  delete from public.messages
  where sender_id = target_id
     or match_id in (
       select id from public.matches where user_id = target_id or candidate_id = target_id
     );
  delete from public.notifications
  where user_id = target_id
     or match_id in (
       select id from public.matches where user_id = target_id or candidate_id = target_id
     );
  delete from public.transactions where user_id = target_id;
  delete from public.matches where user_id = target_id or candidate_id = target_id;
  delete from public.profiles where id = target_id;
  delete from auth.users where id = target_id;
end;
$$;

create or replace function public.admin_revoke_membership(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  update public.profiles set membership_until = null where id = target_id;
  delete from public.transactions where user_id = target_id;
  update public.matches
  set status = 'pending', paid_at = null, approved_at = null
  where user_id = target_id and status in ('selected_and_paid', 'partner_approved');
end;
$$;

grant execute on function public.admin_delete_customer(uuid) to authenticated, service_role;
grant execute on function public.admin_revoke_membership(uuid) to authenticated, service_role;

drop policy if exists "transactions_admin_delete" on public.transactions;
create policy "transactions_admin_delete" on public.transactions
  for delete to authenticated using (public.is_admin());

drop policy if exists "matches_admin_delete" on public.matches;
create policy "matches_admin_delete" on public.matches
  for delete to authenticated using (public.is_admin());

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles
  for delete to authenticated using (public.is_admin());

alter table public.matches add column if not exists share_email boolean not null default false;
alter table public.matches add column if not exists share_phone boolean not null default false;

-- Wipe ALL memberships, payments, and paid/approved match states.
update public.profiles set membership_until = null;
delete from public.transactions;
update public.matches
set status = 'pending', paid_at = null, approved_at = null, share_email = false, share_phone = false
where status in ('selected_and_paid', 'partner_approved');

notify pgrst, 'reload schema';
