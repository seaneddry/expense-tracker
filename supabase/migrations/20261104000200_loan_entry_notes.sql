-- Friends & IOUs: optional note on IOU items, so items and repayments can both carry a remark.
alter table public.loan_entries
  add column note text check (note is null or length(note) <= 120);

-- loan_add_borrowed gains an optional note. Same behaviour otherwise.
drop function if exists public.loan_add_borrowed(uuid, text, date, numeric, uuid, text);

create or replace function public.loan_add_borrowed(
  p_friend_id    uuid,
  p_description  text,
  p_occurred_on  date,
  p_amount       numeric,
  p_category_id  uuid,     -- null = don't log an expense
  p_remarks      text,
  p_note         text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tx uuid;
  v_id uuid;
begin
  if p_category_id is not null then
    insert into public.transactions (occurred_on, description, category_id, amount, remarks)
    values (p_occurred_on, btrim(p_description), p_category_id, round(p_amount, 2),
            nullif(btrim(coalesce(p_remarks, '')), ''))
    returning id into v_tx;
  end if;

  insert into public.loan_entries (friend_id, direction, description, occurred_on, amount, linked_expense_id, note)
  values (p_friend_id, 'borrowed', left(btrim(p_description), 120), p_occurred_on, round(p_amount, 2), v_tx,
          nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.loan_add_borrowed(uuid, text, date, numeric, uuid, text, text) from public, anon;
grant execute on function public.loan_add_borrowed(uuid, text, date, numeric, uuid, text, text) to authenticated;
