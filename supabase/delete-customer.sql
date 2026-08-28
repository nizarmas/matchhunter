-- Paste into SQL Editor and Run.
-- Makes admin "delete customer" also remove their chats, requests, and notifications.

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

grant execute on function public.admin_delete_customer(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
