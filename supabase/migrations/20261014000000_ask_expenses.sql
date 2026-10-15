-- Ask about your spending: read-only helpers ----------------------------------------
-- Used by the ask-expenses Edge Function. Both functions are SECURITY INVOKER, so
-- row level security applies: they can only ever see the signed-in user's own rows.
-- Amounts are positive spending in RM, as everywhere else in this app.

-- Total spent between two dates (inclusive), optionally for some categories and
-- optionally grouped. Without grouping it also returns the latest matching rows.
create or replace function public.ask_sum_spending(
  p_from       date,
  p_to         date,
  p_categories text[] default null,
  p_group_by   text   default 'none'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_cats   uuid[];
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range';
  end if;
  if p_to - p_from > 3660 then
    raise exception 'Date range is too long (10 years at most)';
  end if;
  if p_group_by not in ('none', 'category', 'month', 'day') then
    raise exception 'group_by must be none, category, month or day';
  end if;

  -- Names are matched case-insensitively. If names were given but none exist, v_cats is
  -- an empty array (zero rows), which is different from "no filter" (null).
  if p_categories is not null and cardinality(p_categories) > 0 then
    select coalesce(array_agg(c.id), '{}'::uuid[])
      into v_cats
      from public.categories c
     where lower(c.name) in (select lower(x) from unnest(p_categories) x);
  end if;

  select jsonb_build_object(
           'from', p_from,
           'to', p_to,
           'categories_matched',
             (select coalesce(jsonb_agg(c.name order by c.name), '[]'::jsonb)
                from public.categories c
               where v_cats is not null and c.id = any (v_cats)),
           'total', coalesce(sum(t.amount), 0),
           'count', count(*)
         )
    into v_result
    from public.transactions t
   where t.occurred_on between p_from and p_to
     and (v_cats is null or t.category_id = any (v_cats));

  if p_group_by = 'category' then
    v_result := v_result || jsonb_build_object('groups', (
      select coalesce(jsonb_agg(jsonb_build_object('label', x.name, 'amount', x.amt, 'count', x.n)
                                order by x.amt desc, x.name), '[]'::jsonb)
        from (
          select c.name, sum(t.amount) as amt, count(*) as n
            from public.transactions t
            join public.categories c on c.id = t.category_id
           where t.occurred_on between p_from and p_to
             and (v_cats is null or t.category_id = any (v_cats))
           group by c.name
        ) x
    ));
  elsif p_group_by in ('month', 'day') then
    v_result := v_result || jsonb_build_object('groups', (
      select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'amount', x.amt, 'count', x.n)
                                order by x.label), '[]'::jsonb)
        from (
          select to_char(t.occurred_on, case when p_group_by = 'month' then 'YYYY-MM' else 'YYYY-MM-DD' end) as label,
                 sum(t.amount) as amt,
                 count(*) as n
            from public.transactions t
           where t.occurred_on between p_from and p_to
             and (v_cats is null or t.category_id = any (v_cats))
           group by 1
           order by 1
           limit 120
        ) x
    ));
  else
    v_result := v_result || jsonb_build_object('recent', (
      select coalesce(jsonb_agg(jsonb_build_object('date', s.occurred_on, 'description', s.description,
                                                   'category', s.cname, 'amount', s.amount)
                                order by s.occurred_on desc, s.created_at desc), '[]'::jsonb)
        from (
          select t.occurred_on, t.created_at, t.description, c.name as cname, t.amount
            from public.transactions t
            join public.categories c on c.id = t.category_id
           where t.occurred_on between p_from and p_to
             and (v_cats is null or t.category_id = any (v_cats))
           order by t.occurred_on desc, t.created_at desc
           limit 8
        ) s
    ));
  end if;

  return v_result;
end;
$$;

-- Finds transactions by description text, category and date range. Also reports how many
-- rows matched in total and their sum, so a short list never looks like the whole picture.
create or replace function public.ask_search_transactions(
  p_text       text   default null,
  p_categories text[] default null,
  p_from       date   default null,
  p_to         date   default null,
  p_sort       text   default 'date_desc',
  p_limit      int    default 10
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_cats   uuid[];
  v_text   text;
  v_limit  int := greatest(1, least(coalesce(p_limit, 10), 25));
  v_result jsonb;
begin
  if p_sort not in ('date_desc', 'amount_desc', 'amount_asc') then
    raise exception 'sort must be date_desc, amount_desc or amount_asc';
  end if;

  if p_categories is not null and cardinality(p_categories) > 0 then
    select coalesce(array_agg(c.id), '{}'::uuid[])
      into v_cats
      from public.categories c
     where lower(c.name) in (select lower(x) from unnest(p_categories) x);
  end if;

  if p_text is not null and btrim(p_text) <> '' then
    -- Escape LIKE wildcards so the text is matched literally.
    v_text := '%' || replace(replace(replace(left(btrim(p_text), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with m as (
    select t.occurred_on, t.created_at, t.description, c.name as cname, t.amount
      from public.transactions t
      join public.categories c on c.id = t.category_id
     where (p_from is null or t.occurred_on >= p_from)
       and (p_to   is null or t.occurred_on <= p_to)
       and (v_cats is null or t.category_id = any (v_cats))
       and (v_text is null or t.description ilike v_text escape '\')
  ),
  ranked as (
    select m.*,
           row_number() over (
             order by case when p_sort = 'amount_desc' then m.amount end desc nulls last,
                      case when p_sort = 'amount_asc'  then m.amount end asc  nulls last,
                      m.occurred_on desc, m.created_at desc
           ) as rn
      from m
  )
  select jsonb_build_object(
           'matched_count', (select count(*) from m),
           'matched_total', (select coalesce(sum(amount), 0) from m),
           'rows', (select coalesce(jsonb_agg(jsonb_build_object('date', r.occurred_on, 'description', r.description,
                                                                 'category', r.cname, 'amount', r.amount)
                                              order by r.rn), '[]'::jsonb)
                      from ranked r where r.rn <= v_limit)
         )
    into v_result;

  return v_result;
end;
$$;

-- Only signed-in users may call them (same as the dashboard functions).
revoke all on function public.ask_sum_spending(date, date, text[], text) from public, anon;
revoke all on function public.ask_search_transactions(text, text[], date, date, text, int) from public, anon;
grant execute on function public.ask_sum_spending(date, date, text[], text) to authenticated;
grant execute on function public.ask_search_transactions(text, text[], date, date, text, int) to authenticated;
