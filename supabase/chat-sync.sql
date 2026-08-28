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

drop function if exists public.send_chat_message(uuid, text);
drop function if exists public.send_chat_message(uuid, text, uuid);

create or replace function public.send_chat_message(p_match_id uuid, p_body text, p_id uuid default null)
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
  if not found
     or (m.user_id is distinct from auth.uid() and m.candidate_id is distinct from auth.uid())
     or m.status not in ('selected_and_paid', 'partner_approved') then
    select * into m
    from public.matches
    where (user_id = auth.uid() or candidate_id = auth.uid())
      and status in ('selected_and_paid', 'partner_approved')
      and (
        id = p_match_id
        or exists (
          select 1 from public.matches src
          where src.id = p_match_id
            and (
              (src.user_id = matches.user_id and src.candidate_id = matches.candidate_id)
              or (src.user_id = matches.candidate_id and src.candidate_id = matches.user_id)
            )
        )
      )
    order by case when status = 'partner_approved' then 0 else 1 end, created_at desc
    limit 1;
  end if;
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
    where id = m.id;
    m.status := 'partner_approved';
  end if;

  if p_id is not null then
    select id into msg_id from public.messages where id = p_id;
    if found then
      return msg_id;
    end if;
  end if;

  select id into msg_id
  from public.messages
  where sender_id = auth.uid()
    and body = trimmed
    and created_at > now() - interval '2 minutes'
    and match_id in (
      select id from public.matches
      where (user_id = m.user_id and candidate_id = m.candidate_id)
         or (user_id = m.candidate_id and candidate_id = m.user_id)
    )
  order by created_at desc
  limit 1;
  if found then
    return msg_id;
  end if;

  msg_id := coalesce(p_id, gen_random_uuid());
  insert into public.messages (id, match_id, sender_id, body)
  values (msg_id, m.id, auth.uid(), trimmed)
  on conflict (id) do nothing;

  other := case when m.user_id = auth.uid() then m.candidate_id else m.user_id end;
  insert into public.notifications (user_id, match_id, type, body, read)
  values (other, m.id, 'message', left(trimmed, 80), false);

  return msg_id;
end;
$$;

revoke all on function public.send_chat_message(uuid, text, uuid) from public;
grant execute on function public.send_chat_message(uuid, text, uuid) to authenticated;

-- Chat is live-only: leaving the app deletes the thread for both people.
create or replace function public.wipe_my_chat_messages()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  delete from public.messages
  where match_id in (
    select id from public.matches
    where user_id = auth.uid() or candidate_id = auth.uid()
  );

  delete from public.notifications
  where type = 'message'
    and match_id in (
      select id from public.matches
      where user_id = auth.uid() or candidate_id = auth.uid()
    );
end;
$$;

revoke all on function public.wipe_my_chat_messages() from public;
grant execute on function public.wipe_my_chat_messages() to authenticated;

create or replace function public.respond_to_match(
  p_match_id uuid,
  p_approve boolean,
  p_share_email boolean default false,
  p_share_phone boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches;
  actor_name text;
begin
  select * into m from public.matches where id = p_match_id;
  if not found then
    raise exception 'no_match';
  end if;
  if m.user_id is distinct from auth.uid() and m.candidate_id is distinct from auth.uid() then
    raise exception 'not_involved';
  end if;

  select name into actor_name from public.profiles where id = auth.uid();
  actor_name := coalesce(actor_name, '');

  if p_approve then
    update public.matches
    set
      status = 'partner_approved',
      approved_at = coalesce(approved_at, now()),
      share_email = case when candidate_id = auth.uid() then p_share_email else share_email end,
      share_phone = case when candidate_id = auth.uid() then p_share_phone else share_phone end
    where id = m.id
       or (
         (user_id = m.user_id and candidate_id = m.candidate_id)
         or (user_id = m.candidate_id and candidate_id = m.user_id)
       );
    if m.user_id is distinct from auth.uid() then
      insert into public.notifications (user_id, match_id, type, body, read)
      values (m.user_id, m.id, 'approved', actor_name, false);
    end if;
    if m.candidate_id is distinct from auth.uid() then
      insert into public.notifications (user_id, match_id, type, body, read)
      values (m.candidate_id, m.id, 'approved', actor_name, false);
    end if;
  else
    update public.matches
    set status = 'declined'
    where id = m.id;
    if m.user_id is distinct from auth.uid() then
      insert into public.notifications (user_id, match_id, type, body, read)
      values (m.user_id, m.id, 'declined', actor_name, false);
    end if;
  end if;

  return m.id;
end;
$$;

revoke all on function public.respond_to_match(uuid, boolean, boolean, boolean) from public;
grant execute on function public.respond_to_match(uuid, boolean, boolean, boolean) to authenticated;

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

do $$
begin
  execute 'alter publication supabase_realtime add table public.notifications';
exception
  when duplicate_object then null;
end $$;

alter table public.messages replica identity full;
alter table public.notifications replica identity full;
alter table public.matches replica identity full;
alter table public.profiles replica identity full;

notify pgrst, 'reload schema';
