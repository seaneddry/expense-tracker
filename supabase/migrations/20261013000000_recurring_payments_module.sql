-- Recurring payments and subscriptions module ------------------------------------
-- Already applied to the live project. Kept here so the database can be rebuilt.
-- Fully separate from the expense log: no foreign keys to or from transactions.

-- Next due date on or after p_from. Monthly, quarterly and yearly cycles keep the anchor's
-- day of month, clamped to the end of shorter months (31st -> 28th/29th/30th).
create or replace function public.recurring_next_due(p_anchor date, p_cycle text, p_from date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  step int;
  k    int;
  d    int := extract(day from p_anchor)::int;
  base date;
  cand date;
begin
  if p_from <= p_anchor then
    return p_anchor;
  end if;

  if p_cycle = 'weekly' then
    return p_anchor + (((p_from - p_anchor) + 6) / 7) * 7;
  end if;

  step := case p_cycle when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
  k := ((extract(year from p_from)::int - extract(year from p_anchor)::int) * 12
        + extract(month from p_from)::int - extract(month from p_anchor)::int);
  k := (k / step) * step;

  loop
    base := (date_trunc('month', p_anchor) + make_interval(months => k))::date;
    cand := base + (least(d, extract(day from (base + interval '1 month - 1 day'))::int) - 1);
    exit when cand >= p_from;
    k := k + step;
  end loop;

  return cand;
end;
$$;

create table public.recurring_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null,
  kind           text not null default 'subscription' check (kind in ('subscription', 'bill', 'renewal')),
  amount         numeric(12,2) not null check (amount >= 0),
  cycle          text not null default 'monthly' check (cycle in ('weekly', 'monthly', 'quarterly', 'yearly')),
  -- A date the item is (or was) charged. The next due date rolls forward from here by itself.
  anchor_date    date not null,
  -- Free trial: the last day to cancel. The first real charge is on this date.
  trial_ends_on  date,
  -- Alert this many days before each due date. NULL means no alert.
  alert_days     int check (alert_days between 0 and 90),
  category       text,
  payment_method text,
  notes          text,
  url            text,
  status         text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  ends_on        date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (trial_ends_on is null or trial_ends_on = anchor_date)
);

create index recurring_items_user_idx on public.recurring_items (user_id, status);

create trigger recurring_items_set_updated_at
  before update on public.recurring_items
  for each row execute function public.set_updated_at();

create table public.recurring_price_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id    uuid not null references public.recurring_items (id) on delete cascade,
  old_amount numeric(12,2) not null,
  new_amount numeric(12,2) not null,
  changed_on date not null default public.kl_today(),
  created_at timestamptz not null default now()
);

create index recurring_price_history_item_idx on public.recurring_price_history (item_id, changed_on desc);

-- Every change to an item's amount is logged automatically.
create or replace function public.log_recurring_price_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.amount is distinct from old.amount then
    insert into public.recurring_price_history (user_id, item_id, old_amount, new_amount)
    values (new.user_id, new.id, old.amount, new.amount);
  end if;
  return new;
end;
$$;

create trigger recurring_items_log_price
  after update of amount on public.recurring_items
  for each row execute function public.log_recurring_price_change();

create table public.recurring_attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id      uuid not null references public.recurring_items (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  content_type text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index recurring_attachments_item_idx on public.recurring_attachments (item_id);

-- Row level security -------------------------------------------------------------
alter table public.recurring_items         enable row level security;
alter table public.recurring_price_history enable row level security;
alter table public.recurring_attachments   enable row level security;

create policy "owner access" on public.recurring_items
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.recurring_price_history
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.recurring_attachments
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.recurring_items, public.recurring_price_history, public.recurring_attachments from anon;

-- Overview: each item with its computed next due date, costs and alert state ------
create view public.recurring_overview with (security_invoker = true) as
select i.id, i.name, i.kind, i.amount, i.cycle, i.anchor_date, i.trial_ends_on, i.alert_days,
       i.category, i.payment_method, i.notes, i.url, i.status, i.ends_on, i.created_at,
       n.next_due,
       (n.next_due - public.kl_today()) as days_until,
       coalesce(i.trial_ends_on >= public.kl_today(), false) as in_trial,
       round(i.amount * y.times, 2)      as yearly_cost,
       round(i.amount * y.times / 12, 2) as monthly_cost,
       coalesce(
         i.status = 'active'
         and n.next_due is not null
         and i.alert_days is not null
         and (n.next_due - public.kl_today()) <= i.alert_days,
         false) as alert_active
from public.recurring_items i
cross join lateral (
  select case i.cycle when 'weekly' then 52 when 'monthly' then 12 when 'quarterly' then 4 else 1 end as times
) y
cross join lateral (
  select case
           when i.status <> 'active' then null
           when i.ends_on is not null and f.d > i.ends_on then null
           else f.d
         end as next_due
  from (select public.recurring_next_due(i.anchor_date, i.cycle, public.kl_today()) as d) f
) n;

revoke all on public.recurring_overview from anon;

-- Totals shown on the Subscriptions tab (items still in a free trial are not counted) ---
create or replace function public.recurring_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'monthly_commitment', coalesce(sum(monthly_cost) filter (where status = 'active' and not in_trial), 0),
    'yearly_commitment',  coalesce(sum(yearly_cost)  filter (where status = 'active' and not in_trial), 0),
    'active_count',       count(*) filter (where status = 'active'),
    'trial_count',        count(*) filter (where status = 'active' and in_trial),
    'alert_count',        count(*) filter (where alert_active)
  )
  from public.recurring_overview;
$$;

-- Every due date that falls inside a month, for the calendar ------------------------
create or replace function public.recurring_calendar(p_month date)
returns table (day date, item_id uuid, name text, amount numeric, kind text, is_trial_end boolean)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  ms date := date_trunc('month', p_month)::date;
  me date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  r  record;
  d  date;
begin
  for r in select i.* from public.recurring_items i where i.status = 'active' loop
    d := public.recurring_next_due(r.anchor_date, r.cycle, ms);
    while d <= me and (r.ends_on is null or d <= r.ends_on) loop
      return query select d, r.id, r.name, r.amount::numeric, r.kind,
                          (r.trial_ends_on is not null and d = r.trial_ends_on);
      d := public.recurring_next_due(r.anchor_date, r.cycle, d + 1);
    end loop;
  end loop;
end;
$$;

revoke execute on function public.recurring_summary(), public.recurring_calendar(date) from public, anon;
grant  execute on function public.recurring_summary(), public.recurring_calendar(date) to authenticated;

-- Private file storage for contracts and receipts ------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recurring-attachments', 'recurring-attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "recurring attachments read" on storage.objects
  for select to authenticated
  using (bucket_id = 'recurring-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recurring attachments insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recurring-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recurring attachments update" on storage.objects
  for update to authenticated
  using (bucket_id = 'recurring-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recurring attachments delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recurring-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
