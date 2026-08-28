-- Paste this entire file into SQL Editor and Run.
-- Fixes chat between two members + live sync.

alter table public.matches add column if not exists share_email boolean not null default false;
alter table public.matches add column if not exists share_phone boolean not null default false;

drop policy if exists "messages_on_approved_match" on public.messages;
create policy "messages_on_approved_match" on public.messages
  for select to authenticated using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.status in ('selected_and_paid', 'partner_approved')
        and (m.user_id = auth.uid() or m.candidate_id = auth.uid())
    )
  );

drop policy if exists "messages_insert_approved" on public.messages;
create policy "messages_insert_approved" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.status in ('selected_and_paid', 'partner_approved')
        and (m.user_id = auth.uid() or m.candidate_id = auth.uid())
    )
  );

drop policy if exists "notifications_own" on public.notifications;
drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
drop policy if exists "notifications_insert_related" on public.notifications;

create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid());

create policy "notifications_insert_related" on public.notifications
  for insert to authenticated with check (
    user_id = auth.uid()
    or (
      match_id is not null
      and exists (
        select 1 from public.matches m
        where m.id = match_id
          and (m.user_id = auth.uid() or m.candidate_id = auth.uid())
          and (m.user_id = notifications.user_id or m.candidate_id = notifications.user_id)
      )
    )
  );

create or replace function public.send_chat_message(p_match_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
  other uuid;
  msg_id uuid;
  trimmed text;
begin
  trimmed := trim(coalesce(p_body, ''));
  if trimmed = '' then
    raise exception 'empty';
  end if;

  select * into m from public.matches where id = p_match_id;
  if not found then
    raise exception 'no_match';
  end if;
  if m.user_id is distinct from auth.uid() and m.candidate_id is distinct from auth.uid() then
    raise exception 'not_involved';
  end if;
  if m.status not in ('selected_and_paid', 'partner_approved') then
    raise exception 'not_open';
  end if;

  if m.status = 'selected_and_paid' then
    update public.matches
    set status = 'partner_approved', approved_at = coalesce(approved_at, now())
    where id = p_match_id;
  end if;

  msg_id := gen_random_uuid();
  insert into public.messages (id, match_id, sender_id, body)
  values (msg_id, p_match_id, auth.uid(), trimmed);

  other := case when m.user_id = auth.uid() then m.candidate_id else m.user_id end;
  insert into public.notifications (user_id, match_id, type, body, read)
  values (other, p_match_id, 'message', left(trimmed, 80), false);

  return msg_id;
end;
$$;

revoke all on function public.send_chat_message(uuid, text) from public;
grant execute on function public.send_chat_message(uuid, text) to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.messages';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.matches';
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
