-- MatchHunter — Israel (Jerusalem + West Bank included)
-- Opt-in users only. No crawler / no outreach to non-registered people.
-- Run in Supabase SQL editor after creating the project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  email text,
  name text not null,
  photo text,
  gender text check (gender in ('male', 'female')),
  looking_for text check (looking_for in ('male', 'female')),
  age integer check (age between 18 and 99),
  partner_age_min integer,
  partner_age_max integer,
  region text,
  city text,
  faith text,
  open_to_other_faiths boolean default false,
  goal text,
  kids text,
  languages text[] default '{}',
  bio text,
  questionnaire jsonb default '{}'::jsonb,
  onboarding_complete boolean default false,
  membership_until timestamptz,
  chat_warnings integer default 0,
  chat_blocked boolean default false,
  account_blocked boolean default false,
  is_admin boolean default false,
  last_seen timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  score integer default 0,
  reasons text[] default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'selected_and_paid', 'partner_approved', 'declined')),
  paid_at timestamptz,
  approved_at timestamptz,
  share_email boolean not null default false,
  share_phone boolean not null default false,
  created_at timestamptz default now(),
  unique (user_id, candidate_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  amount numeric(10,2) not null,
  currency text default 'ILS',
  gateway text default 'paypal',
  payment_gateway_id text,
  status text not null check (status in ('success', 'failed', 'pending')),
  created_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  type text not null,
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.transactions enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid());

drop policy if exists "matches_select_involved" on public.matches;
create policy "matches_select_involved" on public.matches
  for select to authenticated using (user_id = auth.uid() or candidate_id = auth.uid());

drop policy if exists "matches_insert_own" on public.matches;
create policy "matches_insert_own" on public.matches
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "matches_update_involved" on public.matches;
create policy "matches_update_involved" on public.matches
  for update to authenticated using (user_id = auth.uid() or candidate_id = auth.uid());

drop policy if exists "transactions_own" on public.transactions;
create policy "transactions_own" on public.transactions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

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
create policy "notifications_own" on public.notifications
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists matches_user_idx on public.matches (user_id, status);
create index if not exists matches_candidate_idx on public.matches (candidate_id, status);
create index if not exists profiles_region_idx on public.profiles (region, gender, looking_for);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'משתמש'),
    new.raw_user_meta_data->>'phone',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
