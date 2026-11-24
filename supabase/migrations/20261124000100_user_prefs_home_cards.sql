-- Per-user app preferences ------------------------------------------------------------
-- First use: which Home cards are shown, and in what order (Settings > Home cards).
-- home_cards is an ordered list like [{"id":"avg_day","visible":true}, ...].
-- NULL means the default layout. New cards added in later versions show up at the end.

create table if not exists public.user_prefs (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  home_cards jsonb,
  updated_at timestamptz not null default now()
);

create trigger user_prefs_set_updated_at
  before update on public.user_prefs
  for each row execute function public.set_updated_at();

alter table public.user_prefs enable row level security;

create policy "owner access" on public.user_prefs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.user_prefs from anon;
grant select, insert, update, delete on public.user_prefs to authenticated;
