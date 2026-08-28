-- Paste this entire file into SQL Editor and Run.
-- Online presence: who is currently in the app.

alter table public.profiles add column if not exists last_seen timestamptz;
