-- Run once in SQL Editor on the existing MatchHunter project.
alter table public.profiles add column if not exists membership_until timestamptz;
alter table public.transactions alter column match_id drop not null;
