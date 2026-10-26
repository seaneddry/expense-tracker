-- Optional free-text remarks on an expense, typed in the web app's add/edit form.
-- Nullable with no default: the Apple Pay / Shortcuts automation never sends it,
-- so those rows simply have no remarks. Existing rows are untouched.

alter table public.transactions
  add column if not exists remarks text;

alter table public.transactions
  drop constraint if exists transactions_remarks_length;
alter table public.transactions
  add constraint transactions_remarks_length
  check (remarks is null or char_length(remarks) <= 500);

-- Let "Ask about your expenses" find words in remarks as well as descriptions.
-- Same signature and same output shape as before, so the edge function needs no redeploy.
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
       and (v_text is null
            or t.description ilike v_text escape '\'
            or t.remarks     ilike v_text escape '\')
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

revoke all on function public.ask_search_transactions(text, text[], date, date, text, int) from public, anon;
grant execute on function public.ask_search_transactions(text, text[], date, date, text, int) to authenticated;
