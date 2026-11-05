-- Edit the split on an expense ----------------------------------------------------------
-- Used by the Edit expense screen for split and unsplit expenses alike. In one go it:
--   * saves the expense details with the amount set to your share,
--   * updates the IOU of every friend still in the split (keeping the item, so its note stays),
--   * adds IOUs for newly added friends,
--   * removes the IOUs of friends taken out of the split.
-- An empty p_shares removes the split: the expense keeps p_my_share as its amount (the whole bill).
-- If your share is 0, the expense is removed from the log and only the IOUs remain.
-- Repayments are per friend, not per item, so they are never touched here.
-- SECURITY INVOKER: row level security applies, so it only ever touches your own rows.
create or replace function public.loan_set_split(
  p_tx_id        uuid,
  p_occurred_on  date,
  p_description  text,
  p_category_id  uuid,
  p_my_share     numeric,
  p_remarks      text,
  p_needs_review boolean,
  p_shares       jsonb          -- [{ "friend_id": "...", "amount": 12.50 }, ...] or []
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_share  jsonb;
  v_friend uuid;
  v_amount numeric;
  v_entry  uuid;
  v_keep   uuid[] := '{}';
  v_link   uuid;
begin
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' then
    raise exception 'Invalid split';
  end if;
  if p_my_share is null or p_my_share < 0 then
    raise exception 'Your share cannot be negative';
  end if;
  if jsonb_array_length(p_shares) = 0 and p_my_share <= 0 then
    raise exception 'Amount must be more than 0';
  end if;
  if not exists (select 1 from public.transactions where id = p_tx_id) then
    raise exception 'This expense no longer exists';
  end if;
  if exists (select 1 from public.loan_entries where linked_expense_id = p_tx_id and direction = 'borrowed') then
    raise exception 'A friend paid for this expense. Edit it from that friend''s page';
  end if;
  if (select count(distinct x ->> 'friend_id') from jsonb_array_elements(p_shares) x) <> jsonb_array_length(p_shares) then
    raise exception 'Each friend can only appear once in a split';
  end if;

  v_link := case when p_my_share > 0 then p_tx_id end;

  for v_share in select * from jsonb_array_elements(p_shares) loop
    v_friend := (v_share ->> 'friend_id')::uuid;
    v_amount := round((v_share ->> 'amount')::numeric, 2);
    if v_amount is null or v_amount <= 0 then
      raise exception 'Every friend''s share must be more than 0';
    end if;

    select id into v_entry
      from public.loan_entries
     where linked_expense_id = p_tx_id and direction = 'lent' and friend_id = v_friend
     order by created_at
     limit 1;

    if v_entry is null then
      insert into public.loan_entries (friend_id, direction, description, occurred_on, amount, linked_expense_id)
      values (v_friend, 'lent', left(btrim(p_description), 120), p_occurred_on, v_amount, v_link)
      returning id into v_entry;
    else
      update public.loan_entries
         set amount = v_amount,
             description = left(btrim(p_description), 120),
             occurred_on = p_occurred_on,
             linked_expense_id = v_link
       where id = v_entry;
    end if;
    v_keep := v_keep || v_entry;
  end loop;

  -- Friends taken out of the split (and any duplicates) lose their item for this expense.
  delete from public.loan_entries
   where linked_expense_id = p_tx_id and direction = 'lent' and not (id = any (v_keep));

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

revoke all on function public.loan_set_split(uuid, date, text, uuid, numeric, text, boolean, jsonb) from public, anon;
grant execute on function public.loan_set_split(uuid, date, text, uuid, numeric, text, boolean, jsonb) to authenticated;
