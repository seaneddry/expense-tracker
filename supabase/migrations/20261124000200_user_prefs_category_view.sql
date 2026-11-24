-- How Home's "By category" section is drawn (Settings > Home layout).
-- 'attention' = needs-attention list with a compact "Show all" list (default),
-- 'rings' = ring tiles, 'allocation' = one bar for the whole budget. NULL = default.
alter table public.user_prefs
  add column if not exists category_view text
  check (category_view is null or category_view in ('attention', 'rings', 'allocation'));
