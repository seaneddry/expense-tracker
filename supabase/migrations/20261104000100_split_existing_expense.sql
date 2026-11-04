-- Split an expense that is already in the log --------------------------------------------
-- Used by "Split with friends" on the Edit expense screen. In one go: saves the edited
-- details with the amount lowered to your share, and creates an IOU for each friend.
-- If your share is 0 (it was all for friends), the expense is removed from the log.
-- SECURITY INVOKER: row level security applies, so it only ever touches your own rows.
create or replace function public.loan_split_existing(
  p_tx_id        uuid,
  p_occurred_on  date,
  p_description  text,
  p_category_id  uuid,
  p_my_share     numeric,
  p_remarks      text,
  p_needs_review boolean,
  p_shares       jsonb          -- [{ "friend_id": "...", "amount": 12.50 }, ...]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_share jsonb;
  v_link  uuid;
begin
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'Pick at least one friend to split with';
  end if;
  if p_my_share is null or p_my_share < 0 then
    raise exception 'Your share cannot be negative';
  end if;
  if not exists (select 1 from public.transactions where id = p_tx_id) then
    raise exception 'This expense no longer exists';
  end if;
  if exists (select 1 from public.loan_entries where linked_expense_id = p_tx_id) then
    raise exception 'This expense is already split';
  end if;

  v_link := case when p_my_share > 0 then p_tx_id end;

  for v_share in select * from jsonb_array_elements(p_shares) loop
    insert into public.loan_entries (friend_id, direction, description, occurred_on, amount, linked_expense_id)
    values ((v_share ->> 'friend_id')::uuid, 'lent', left(btrim(p_description), 120), p_occurred_on,
            round((v_share ->> 'amount')::numeric, 2), v_link);
  end loop;

  if p_my_share > 0 then
    update public.transactions
       set occurred_on  = p_occurred_on,
           description  = btrim(p_description),
           category_id  = p_category_id,
           amount       = round(p_my_share, 2),
           needs_review = coalesce(p_needs_review, false),
           remarks      = nullif(btrim(coalesce(p_remarks, '')), '')
     where id = p_tx_id;
  else
    delete from public.transactions where id = p_tx_id;
  end if;
end;
$$;

revoke all on function public.loan_split_existing(uuid, date, text, uuid, numeric, text, boolean, jsonb) from public, anon;
grant execute on function public.loan_split_existing(uuid, date, text, uuid, numeric, text, boolean, jsonb) to authenticated;
