-- Budget pace based on spending habits + fixed bills ----------------------------------
-- Home's "Budget pace" used to split the monthly budget evenly across the days. Now:
--   * Fixed bills (recurring items with "Count in budget pace" on, e.g. Car loan) count in
--     full on their due date, or as soon as they are logged if paid early.
--   * The rest of the budget follows your usual spending pattern over the month, learned
--     from the last 3 months (needs at least 2 months of history, else the even split).
-- Burn rate and Projected month end use the same pace. Nothing else changes.
-- The recurring payments module only gains an opt-in switch; its own behaviour is unchanged.

alter table public.recurring_items
  add column if not exists count_in_pace boolean not null default false;

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
  -- Budget pace (habits + fixed bills)
  fixed_names     text[];
  fixed_labels    text[];
  fixed_allowed   numeric := 0;   -- fixed bills that count by today (due already, or paid early)
  fixed_month     numeric := 0;   -- fixed bills for the whole month (scheduled, or what was paid if more)
  fixed_spent     numeric := 0;   -- fixed bills already logged this month
  variable_budget numeric;
  variable_spent  numeric;
  hist_months     int := 0;
  share           numeric;        -- share of a normal month's other spending done by today
  pace_mode       text;
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

  -- Fixed bills: recurring items switched to "Count in budget pace". An expense counts as
  -- that bill when its description matches the item name (ignoring case and spaces).
  select coalesce(array_agg(lower(btrim(i.name))), '{}'), coalesce(array_agg(i.name order by i.name), '{}')
    into fixed_names, fixed_labels
    from recurring_items i
   where i.count_in_pace and i.status = 'active' and i.amount is not null and i.kind <> 'credit';

  if cardinality(fixed_names) > 0 then
    with sched as (
      select lower(btrim(c.name)) as nm,
             sum(c.amount) as total,
             coalesce(sum(c.amount) filter (where c.day <= today), 0) as due_now
        from recurring_calendar(m_start) c
       where lower(btrim(c.name)) = any (fixed_names) and c.amount is not null
       group by 1
    ), paid as (
      select lower(btrim(t.description)) as nm, sum(t.amount) as amt
        from transactions t
       where t.occurred_on >= m_start and t.occurred_on < m_end
         and lower(btrim(t.description)) = any (fixed_names)
       group by 1
    )
    select coalesce(sum(greatest(coalesce(s.due_now, 0), coalesce(p.amt, 0))), 0),
           coalesce(sum(greatest(coalesce(s.total, 0),   coalesce(p.amt, 0))), 0),
           coalesce(sum(coalesce(p.amt, 0)), 0)
      into fixed_allowed, fixed_month, fixed_spent
      from unnest(fixed_names) as n(nm)
      left join sched s on s.nm = n.nm
      left join paid  p on p.nm = n.nm;
  end if;

  -- Everything else follows your usual pattern: on average over the last 3 months, what share
  -- of a month's other spending was done by this day of the month. Needs 2 months of history.
  select count(*), avg(least(greatest(pm.upto / pm.total, 0), 1))
    into hist_months, share
    from (
      select sum(t.amount) as total,
             coalesce(sum(t.amount) filter (where extract(day from t.occurred_on) <= elapsed), 0) as upto
        from transactions t
       where t.occurred_on >= (m_start - interval '3 months') and t.occurred_on < m_start
         and not (lower(btrim(t.description)) = any (fixed_names))
       group by date_trunc('month', t.occurred_on)
      having sum(t.amount) > 0
    ) pm;

  if hist_months >= 2 then
    pace_mode := 'habits';
  else
    pace_mode := 'even';
    share := elapsed::numeric / dim;
  end if;
  if elapsed >= dim then share := 1; end if;
  if elapsed <= 0 then share := 0; end if;

  variable_budget := greatest(total_budget - fixed_month, 0);
  variable_spent  := spent - fixed_spent;
  expected := fixed_allowed + variable_budget * share;

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
    'projected_month_end',   fixed_month + case when share > 0 then variable_spent / share else 0 end,
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
    'no_spend_days',         no_spend,
    'pace_mode',             pace_mode,
    'pace_fixed_by_today',   fixed_allowed,
    'pace_fixed_items',      to_jsonb(fixed_labels)
  );
end;
$$;
