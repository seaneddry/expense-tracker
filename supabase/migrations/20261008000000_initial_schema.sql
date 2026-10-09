-- Expense Tracker: initial schema ------------------------------------------------
-- Already applied to the live project. Kept here so the database can be rebuilt.

-- Helpers -----------------------------------------------------------------------
create or replace function public.kl_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tables ------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occurred_on  date not null,
  description  text not null,
  category_id  uuid not null references public.categories (id) on delete restrict,
  amount       numeric(12,2) not null,
  needs_review boolean not null default false,
  source_key   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_category_idx  on public.transactions (category_id);
create unique index transactions_source_key_uq
  on public.transactions (user_id, source_key) where source_key is not null;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- A budget row applies from effective_from onward until a newer row replaces it.
create table public.budgets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id    uuid not null references public.categories (id) on delete cascade,
  effective_from date not null,
  amount         numeric(12,2) not null check (amount >= 0),
  unique (category_id, effective_from)
);

create table public.income (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_from date not null,
  amount         numeric(12,2) not null check (amount >= 0),
  unique (user_id, effective_from)
);

-- Row level security: every row belongs to its owner ------------------------------
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;
alter table public.income       enable row level security;

create policy "owner access" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.budgets
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.income
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.categories, public.transactions, public.budgets, public.income from anon;

-- Views -------------------------------------------------------------------------
create view public.monthly_totals with (security_invoker = true) as
select date_trunc('month', occurred_on)::date as month,
       sum(amount)  as total,
       count(*)     as transactions
from public.transactions
group by 1;

-- Most recent category and amount used for each description (powers autocomplete).
create view public.description_suggestions with (security_invoker = true) as
select distinct on (lower(description))
       description,
       category_id,
       amount      as last_amount,
       occurred_on as last_used,
       count(*) over (partition by lower(description)) as uses
from public.transactions
order by lower(description), occurred_on desc, created_at desc;

revoke all on public.monthly_totals, public.description_suggestions from anon;

-- Dashboard functions (RLS applies: security invoker) ----------------------------
create or replace function public.category_breakdown(p_month date)
returns table (category_id uuid, name text, amount numeric, budget numeric, remaining numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with m as (select date_trunc('month', p_month)::date as s)
  select c.id,
         c.name,
         coalesce(t.amt, 0),
         coalesce(b.amount, 0),
         coalesce(b.amount, 0) - coalesce(t.amt, 0)
  from public.categories c
  cross join m
  left join lateral (
    select sum(x.amount) as amt
    from public.transactions x
    where x.category_id = c.id
      and x.occurred_on >= m.s
      and x.occurred_on < (m.s + interval '1 month')
  ) t on true
  left join lateral (
    select bb.amount
    from public.budgets bb
    where bb.category_id = c.id and bb.effective_from <= m.s
    order by bb.effective_from desc
    limit 1
  ) b on true
  where c.is_active or coalesce(t.amt, 0) > 0
  order by c.sort_order, c.name;
$$;

create or replace function public.daily_totals(p_month date)
returns table (day date, amount numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select d::date as day, coalesce(sum(t.amount), 0) as amount
  from generate_series(
         date_trunc('month', p_month)::date,
         (date_trunc('month', p_month) + interval '1 month - 1 day')::date,
         interval '1 day') d
  left join public.transactions t on t.occurred_on = d::date
  group by d
  order by d;
$$;

create or replace function public.dashboard_kpis(p_month date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  m_start       date := date_trunc('month', p_month)::date;
  m_end         date := (date_trunc('month', p_month) + interval '1 month')::date;
  dim           int  := (m_end - m_start);
  today         date := public.kl_today();
  elapsed       int  := greatest(0, least(dim, (today - m_start) + 1));
  spent         numeric;
  prev_spent    numeric;
  year_spent    numeric;
  all_time      numeric;
  cnt           int;
  total_budget  numeric;
  income_amt    numeric;
  weekday_total numeric;
  weekend_total numeric;
  big_desc      text;
  big_amt       numeric;
  big_date      date;
  top_name      text;
  top_amt       numeric;
  top3          numeric;
  no_spend      int;
  avg3          numeric;
  avg_day       numeric;
  expected      numeric;
begin
  select coalesce(sum(amount), 0), count(*)
    into spent, cnt
    from transactions
   where occurred_on >= m_start and occurred_on < m_end;

  select coalesce(sum(amount), 0) into prev_spent
    from transactions
   where occurred_on >= (m_start - interval '1 month') and occurred_on < m_start;

  select coalesce(sum(amount), 0) into year_spent
    from transactions
   where occurred_on >= date_trunc('year', m_start)::date
     and occurred_on <  (date_trunc('year', m_start) + interval '1 year')::date;

  select coalesce(sum(amount), 0) into all_time from transactions;

  select coalesce(sum(b.amount), 0) into total_budget
    from categories c
    cross join lateral (
      select bb.amount from budgets bb
       where bb.category_id = c.id and bb.effective_from <= m_start
       order by bb.effective_from desc limit 1
    ) b
   where c.is_active;

  select amount into income_amt
    from income
   where effective_from <= m_start
   order by effective_from desc
   limit 1;
  income_amt := coalesce(income_amt, 0);

  select coalesce(sum(amount) filter (where extract(isodow from occurred_on) <= 5), 0),
         coalesce(sum(amount) filter (where extract(isodow from occurred_on) >= 6), 0)
    into weekday_total, weekend_total
    from transactions
   where occurred_on >= m_start and occurred_on < m_end;

  select description, amount, occurred_on
    into big_desc, big_amt, big_date
    from transactions
   where occurred_on >= m_start and occurred_on < m_end
   order by amount desc, occurred_on desc
   limit 1;

  select c.name, sum(t.amount)
    into top_name, top_amt
    from transactions t
    join categories c on c.id = t.category_id
   where t.occurred_on >= m_start and t.occurred_on < m_end
   group by c.name
   order by sum(t.amount) desc
   limit 1;

  select coalesce(sum(s.amt), 0) into top3
    from (
      select sum(t.amount) as amt
        from transactions t
       where t.occurred_on >= m_start and t.occurred_on < m_end
       group by t.category_id
       order by sum(t.amount) desc
       limit 3
    ) s;

  select count(*) into no_spend
    from generate_series(m_start, m_start + (elapsed - 1), interval '1 day') d
   where elapsed > 0
     and not exists (select 1 from transactions t where t.occurred_on = d::date);

  select coalesce(sum(amount), 0) / 3 into avg3
    from transactions
   where occurred_on >= (m_start - interval '3 months') and occurred_on < m_start;

  avg_day  := case when elapsed > 0 then spent / elapsed else 0 end;
  expected := total_budget / dim * elapsed;

  return jsonb_build_object(
    'month',                 m_start,
    'days_in_month',         dim,
    'days_elapsed',          elapsed,
    'spent',                 spent,
    'year_spent',            year_spent,
    'all_time_spent',        all_time,
    'vs_last_month',         spent - prev_spent,
    'transaction_count',     cnt,
    'biggest_category',      case when top_name is null then null
                                  else jsonb_build_object('name', top_name, 'amount', top_amt) end,
    'biggest_transaction',   case when big_desc is null then null
                                  else jsonb_build_object('description', big_desc, 'amount', big_amt, 'occurred_on', big_date) end,
    'biggest_transaction_pct', case when spent > 0 then coalesce(big_amt, 0) / spent else 0 end,
    'avg_per_day',           avg_day,
    'projected_month_end',   avg_day * dim,
    'total_budget',          total_budget,
    'expected_by_today',     expected,
    'burn_rate',             case when expected > 0 then spent / expected else 0 end,
    'weekday_total',         weekday_total,
    'weekend_total',         weekend_total,
    'income',                income_amt,
    'savings',               income_amt - spent,
    'savings_rate',          case when income_amt > 0 then (income_amt - spent) / income_amt else 0 end,
    'income_cover_months',   case when avg3 > 0 then income_amt / avg3 else 0 end,
    'top3_pct',              case when spent > 0 then top3 / spent else 0 end,
    'no_spend_days',         no_spend
  );
end;
$$;

revoke execute on function public.category_breakdown(date), public.daily_totals(date),
                           public.dashboard_kpis(date) from public, anon;
grant  execute on function public.category_breakdown(date), public.daily_totals(date),
                           public.dashboard_kpis(date) to authenticated;

-- First-login seed: default categories, budgets and income -----------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, sort_order)
  select new.id, v.name, v.ord
  from (values
    ('Bills', 1), ('Education', 2), ('Entertainment', 3), ('Food', 4),
    ('Healthcare', 5), ('Investment', 6), ('Others', 7), ('Parking & Tolls', 8),
    ('Petrol', 9), ('Shopping', 10), ('Sports', 11), ('Transport', 12), ('Vehicle', 13)
  ) as v(name, ord);

  insert into public.budgets (user_id, category_id, effective_from, amount)
  select new.id, c.id, date '2023-01-01', v.amount
  from public.categories c
  join (values
    ('Bills', 1200), ('Education', 0), ('Entertainment', 100), ('Food', 550),
    ('Healthcare', 0), ('Investment', 0), ('Others', 0), ('Parking & Tolls', 90),
    ('Petrol', 280), ('Shopping', 200), ('Sports', 180), ('Transport', 0), ('Vehicle', 100)
  ) as v(name, amount) on v.name = c.name
  where c.user_id = new.id;

  insert into public.income (user_id, effective_from, amount)
  values (new.id, date '2023-01-01', 5200);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
