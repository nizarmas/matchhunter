-- Paste this entire file into SQL Editor and Run.
-- Contact sharing on request approval: email / phone / chat-only.

alter table public.matches add column if not exists share_email boolean not null default false;
alter table public.matches add column if not exists share_phone boolean not null default false;
