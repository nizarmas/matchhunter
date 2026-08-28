-- Paste this entire file into SQL Editor and Run.
-- Clears memberships, payments, and ALL match cards.

alter table public.profiles add column if not exists membership_until timestamptz;

update public.profiles set membership_until = null;

delete from public.transactions;

delete from public.matches;
