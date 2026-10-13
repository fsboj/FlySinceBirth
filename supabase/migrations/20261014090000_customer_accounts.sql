-- Customer accounts remain separate from the existing admin authorization flow.
create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_profiles_display_name_length check (length(display_name) <= 120),
  constraint customer_profiles_phone_length check (length(phone) <= 40)
);

alter table public.customer_profiles enable row level security;
revoke all on public.customer_profiles from public, anon;
grant select, insert, update on public.customer_profiles to authenticated;
create policy "Customers read their own profile" on public.customer_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Customers create their own profile" on public.customer_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Customers update their own profile" on public.customer_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.event_ticket_orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists event_ticket_orders_user_created_idx
  on public.event_ticket_orders(user_id, created_at desc) where user_id is not null;
grant select on public.event_ticket_orders to authenticated;
create policy "Customers read their own ticket orders" on public.event_ticket_orders
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.fsb_store_orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists fsb_store_orders_user_created_idx
  on public.fsb_store_orders(user_id, created_at desc) where user_id is not null;
grant select on public.fsb_store_orders to authenticated;
create policy "Customers read their own store orders" on public.fsb_store_orders
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.fsb_store_order_items to authenticated;
create policy "Customers read items in their own store orders" on public.fsb_store_order_items
  for select to authenticated using (
    exists (
      select 1 from public.fsb_store_orders o
      where o.id = fsb_store_order_items.order_id and o.user_id = (select auth.uid())
    )
  );

drop function if exists public.reserve_event_ticket_order(bigint, integer, text, text);
create function public.reserve_event_ticket_order(
  p_event_id bigint,
  p_quantity integer,
  p_buyer_email text,
  p_provider text,
  p_user_id uuid
)
returns setof public.event_ticket_orders
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_event public.events%rowtype;
  v_reserved integer;
begin
  if p_user_id is null then
    raise exception 'Sign in before reserving tickets.' using errcode = '28000';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Choose between 1 and 10 tickets.' using errcode = '22023';
  end if;
  if p_buyer_email is null or length(btrim(p_buyer_email)) not between 5 and 320
     or p_buyer_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if p_provider not in ('stripe', 'paypal') then
    raise exception 'Unsupported payment provider.' using errcode = '22023';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found.' using errcode = 'P0002'; end if;
  if v_event.ticket_sales_mode <> 'on_site' or coalesce(v_event.ticket_price, 0) <= 0 then
    raise exception 'On-site ticket sales are not enabled for this event.' using errcode = '22023';
  end if;
  if not (p_provider = any(v_event.ticket_providers)) then
    raise exception 'This payment method is not enabled for this event.' using errcode = '22023';
  end if;
  select coalesce(sum(quantity), 0)::integer into v_reserved
    from public.event_ticket_orders
   where event_id = p_event_id
     and (status = 'paid' or (status = 'pending' and expires_at > now()));
  if v_event.ticket_capacity is not null and v_reserved + p_quantity > v_event.ticket_capacity then
    raise exception 'Not enough tickets remain for this event.' using errcode = 'P0001';
  end if;
  return query
  insert into public.event_ticket_orders(event_id, buyer_email, quantity, unit_price, provider, user_id)
  values (p_event_id, lower(btrim(p_buyer_email)), p_quantity, v_event.ticket_price, p_provider, p_user_id)
  returning *;
end;
$$;
revoke all on function public.reserve_event_ticket_order(bigint, integer, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_event_ticket_order(bigint, integer, text, text, uuid)
  to service_role;

