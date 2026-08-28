-- Paste into SQL Editor and Run.
-- Lets chat messages sync live between both phones.

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
