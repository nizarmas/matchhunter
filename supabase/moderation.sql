alter table public.profiles add column if not exists chat_warnings integer default 0;
alter table public.profiles add column if not exists chat_blocked boolean default false;
