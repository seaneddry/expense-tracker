-- Friends & IOUs module ----------------------------------------------------------------
-- Tracks money between you and friends, in both directions:
--   lent      = you paid for a friend, they owe you
--   borrowed  = a friend paid for you, you owe them
--   received  = a friend paid you back
--   paid      = you paid a friend back
-- Separate from the expense log on purpose. The only link is an optional
-- linked_expense_id (no foreign key), so deleting an expense never touches an IOU
-- and nothing here changes how the dashboard is calculated.
-- Tables are prefixed loan_ because this Supabase project also holds other apps' tables.

create table public.loan_friends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  phone       text check (phone is null or length(phone) <= 30),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index loan_friends_user_name_uq on public.loan_friends (user_id, lower(btrim(name)));

create table public.loan_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  friend_id          uuid not null references public.loan_friends (id) on delete cascade,
  direction          text not null check (direction in ('lent', 'borrowed')),
  description        text not null check (length(btrim(description)) between 1 and 120),
  occurred_on        date not null,
  amount             numeric(12,2) not null check (amount > 0),
  linked_expense_id  uuid,
  created_at         timestamptz not null default now()
);
create index loan_entries_friend_idx on public.loan_entries (friend_id, occurred_on);
create index loan_entries_user_idx on public.loan_entries (user_id);

create table public.loan_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  friend_id   uuid not null references public.loan_friends (id) on delete cascade,
  direction   text not null check (direction in ('received', 'paid')),
  amount      numeric(12,2) not null check (amount > 0),
  paid_on     date not null,
  note        text check (note is null or length(note) <= 120),
  created_at  timestamptz not null default now()
);
create index loan_payments_friend_idx on public.loan_payments (friend_id, paid_on);
create index loan_payments_user_idx on public.loan_payments (user_id);

create trigger loan_friends_set_updated_at
  before update on public.loan_friends
  for each row execute function public.set_updated_at();

-- Row level security: every row belongs to its owner ----------------------------------
alter table public.loan_friends  enable row level security;
alter table public.loan_entries  enable row level security;
alter table public.loan_payments enable row level security;

create policy "owner access" on public.loan_friends
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner access" on public.loan_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.loan_friends f where f.id = friend_id and f.user_id = (select auth.uid()))
  );
create policy "owner access" on public.loan_payments
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.loan_friends f where f.id = friend_id and f.user_id = (select auth.uid()))
  );

-- Balance per friend ------------------------------------------------------------------
-- net > 0: the friend owes you. net < 0: you owe the friend.
create view public.loan_balances with (security_invoker = true) as
select f.id,
       f.name,
       f.phone,
       coalesce(e.lent, 0)      as lent,
       coalesce(e.borrowed, 0)  as borrowed,
       coalesce(p.received, 0)  as received,
       coalesce(p.paid, 0)      as paid,
       coalesce(e.lent, 0) - coalesce(e.borrowed, 0) - coalesce(p.received, 0) + coalesce(p.paid, 0) as net,
       greatest(e.last_on, p.last_on) as last_activity
  from public.loan_friends f
  left join (
    select friend_id,
           sum(amount) filter (where direction = 'lent')     as lent,
           sum(amount) filter (where direction = 'borrowed') as borrowed,
           max(occurred_on) as last_on
      from public.loan_entries group by friend_id
  ) e on e.friend_id = f.id
  left join (
    select friend_id,
           sum(amount) filter (where direction = 'received') as received,
           sum(amount) filter (where direction = 'paid')     as paid,
           max(paid_on) as last_on
      from public.loan_payments group by friend_id
  ) p on p.friend_id = f.id;

grant select on public.loan_balances to authenticated;
revoke all on public.loan_balances from anon;

-- Split an expense: log your share in the expense log and create the IOUs, all at once.
-- If your share is 0 (you paid only for others), no expense is logged.
create or replace function public.loan_split_expense(
  p_occurred_on  date,
  p_description  text,
  p_category_id  uuid,
  p_my_share     numeric,
  p_remarks      text,
  p_needs_review boolean,
  p_shares       jsonb          -- [{ "friend_id": "...", "amount": 12.50 }, ...]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tx uuid;
  v_share jsonb;
begin
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'Pick at least one friend to split with';
  end if;
  if p_my_share is null or p_my_share < 0 then
    raise exception 'Your share cannot be negative';
  end if;

  if p_my_share > 0 then
    insert into public.transactions (occurred_on, description, category_id, amount, needs_review, remarks)
    values (p_occurred_on, btrim(p_description), p_category_id, round(p_my_share, 2),
            coalesce(p_needs_review, false), nullif(btrim(coalesce(p_remarks, '')), ''))
    returning id into v_tx;
  end if;

  for v_share in select * from jsonb_array_elements(p_shares) loop
    insert into public.loan_entries (friend_id, direction, description, occurred_on, amount, linked_expense_id)
    values ((v_share ->> 'friend_id')::uuid, 'lent', left(btrim(p_description), 120), p_occurred_on,
            round((v_share ->> 'amount')::numeric, 2), v_tx);
  end loop;

  return v_tx;
end;
$$;

-- A friend paid for you: record what you owe and, optionally, log your share as an expense.
create or replace function public.loan_add_borrowed(
  p_friend_id    uuid,
  p_description  text,
  p_occurred_on  date,
  p_amount       numeric,
  p_category_id  uuid,     -- null = don't log an expense
  p_remarks      text
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

  insert into public.loan_entries (friend_id, direction, description, occurred_on, amount, linked_expense_id)
  values (p_friend_id, 'borrowed', left(btrim(p_description), 120), p_occurred_on, round(p_amount, 2), v_tx)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.loan_split_expense(date, text, uuid, numeric, text, boolean, jsonb) from public, anon;
revoke all on function public.loan_add_borrowed(uuid, text, date, numeric, uuid, text) from public, anon;
grant execute on function public.loan_split_expense(date, text, uuid, numeric, text, boolean, jsonb) to authenticated;
grant execute on function public.loan_add_borrowed(uuid, text, date, numeric, uuid, text) to authenticated;
