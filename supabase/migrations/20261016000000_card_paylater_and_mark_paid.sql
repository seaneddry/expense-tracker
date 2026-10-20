-- Card / PayLater reminders and "mark as paid" ----------------------------------------
-- Already applied to the live project. Kept here so the database can be rebuilt.

-- Card and PayLater bills have no fixed amount, so the amount becomes optional.
alter table public.recurring_items alter column amount drop not null;

alter table public.recurring_items drop constraint recurring_items_kind_check;
alter table public.recurring_items
  add constraint recurring_items_kind_check
  check (kind in ('subscription', 'bill', 'renewal', 'credit'));

-- The due date this item was last marked paid for. The current charge counts as paid when
-- this equals the next due date; once that date passes, the next cycle starts unpaid.
alter table public.recurring_items add column last_paid_due date;

-- Price history only makes sense when both amounts exist.
create or replace function public.log_recurring_price_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.amount is not null and old.amount is not null and new.amount is distinct from old.amount then
    insert into public.recurring_price_history (user_id, item_id, old_amount, new_amount)
    values (new.user_id, new.id, old.amount, new.amount);
  end if;
  return new;
end;
$$;

-- Overview: new columns are appended at the end. Paid items no longer raise an alert.
create or replace view public.recurring_overview with (security_invoker = true) as
select i.id, i.name, i.kind, i.amount, i.cycle, i.anchor_date, i.trial_ends_on, i.alert_days,
       i.category, i.payment_method, i.notes, i.url, i.status, i.ends_on, i.created_at,
       n.next_due,
       (n.next_due - public.kl_today()) as days_until,
       coalesce(i.trial_ends_on >= public.kl_today(), false) as in_trial,
       coalesce(round(i.amount * y.times, 2), 0)      as yearly_cost,
       coalesce(round(i.amount * y.times / 12, 2), 0) as monthly_cost,
       coalesce(
         i.status = 'active'
         and n.next_due is not null
         and i.alert_days is not null
         and (n.next_due - public.kl_today()) <= i.alert_days
         and not coalesce(i.last_paid_due = n.next_due, false),
         false) as alert_active,
       coalesce(i.last_paid_due = n.next_due, false) as paid
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

-- Card / PayLater items are reminders, not commitments, so they stay out of the totals.
create or replace function public.recurring_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'monthly_commitment', coalesce(sum(monthly_cost) filter (where status = 'active' and not in_trial and kind <> 'credit'), 0),
    'yearly_commitment',  coalesce(sum(yearly_cost)  filter (where status = 'active' and not in_trial and kind <> 'credit'), 0),
    'active_count',       count(*) filter (where status = 'active' and kind <> 'credit'),
    'trial_count',        count(*) filter (where status = 'active' and in_trial),
    'alert_count',        count(*) filter (where alert_active)
  )
  from public.recurring_overview;
$$;

-- Push alerts skip anything already marked paid for the upcoming due date.
create or replace function public.push_due_alerts()
returns table (user_id uuid, item_id uuid, name text, kind text, amount numeric,
               next_due date, days_until int, is_trial boolean)
language sql
stable
security definer
set search_path = public
as $$
  select i.user_id, i.id, i.name, i.kind, i.amount::numeric, n.d,
         (n.d - public.kl_today())::int,
         coalesce(i.trial_ends_on >= public.kl_today(), false)
  from public.recurring_items i
  cross join lateral (
    select public.recurring_next_due(i.anchor_date, i.cycle, public.kl_today()) as d
  ) n
  where i.status = 'active'
    and i.alert_days is not null
    and (i.ends_on is null or n.d <= i.ends_on)
    and (n.d - public.kl_today()) <= i.alert_days
    and not coalesce(i.last_paid_due = n.d, false)
    and not exists (select 1 from public.push_log l where l.item_id = i.id and l.due_date = n.d)
    and exists (select 1 from public.push_subscriptions s where s.user_id = i.user_id)
  order by n.d;
$$;
