-- Ticket sales settings remain optional so every existing event keeps its
-- current external-link behavior until an admin explicitly enables on-site sales.
alter table public.events
  add column ticket_sales_mode text not null default 'external',
  add column ticket_price numeric(10, 2),
  add column ticket_capacity integer,
  add column ticket_providers text[] not null default array['stripe', 'paypal']::text[];

alter table public.events
  add constraint events_ticket_sales_mode_check
    check (ticket_sales_mode in ('external', 'on_site')),
  add constraint events_ticket_price_check
    check (ticket_price is null or ticket_price >= 0),
  add constraint events_ticket_capacity_check
    check (ticket_capacity is null or ticket_capacity > 0),
  add constraint events_ticket_providers_check
    check (
      cardinality(ticket_providers) between 1 and 2
      and ticket_providers <@ array['stripe', 'paypal']::text[]
    ),
  add constraint events_on_site_ticket_price_check
    check (ticket_sales_mode <> 'on_site' or coalesce(ticket_price, 0) > 0);

create table public.event_ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  buyer_email text not null check (length(btrim(buyer_email)) between 5 and 320),
  quantity integer not null check (quantity between 1 and 10),
  unit_price numeric(10, 2) not null check (unit_price > 0),
  provider text not null check (provider in ('stripe', 'paypal')),
  provider_reference text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired')),
  ticket_code uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz not null default (now() + interval '1 hour')
);

create unique index event_ticket_orders_provider_reference_unique
  on public.event_ticket_orders(provider, provider_reference)
  where provider_reference is not null;
create index event_ticket_orders_event_status_idx
  on public.event_ticket_orders(event_id, status, expires_at);

alter table public.event_ticket_orders enable row level security;
revoke all on table public.event_ticket_orders from public, anon, authenticated;
grant all on table public.event_ticket_orders to service_role;

-- Capacity reservation is serialized by locking the event row. Only the trusted
-- Edge Function service role may execute this function; the browser cannot call it.
create or replace function public.reserve_event_ticket_order(
  p_event_id bigint,
  p_quantity integer,
  p_buyer_email text,
  p_provider text
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

  select * into v_event
    from public.events
   where id = p_event_id
   for update;

  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;
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

  if v_event.ticket_capacity is not null
     and v_reserved + p_quantity > v_event.ticket_capacity then
    raise exception 'Not enough tickets remain for this event.' using errcode = 'P0001';
  end if;

  return query
  insert into public.event_ticket_orders(event_id, buyer_email, quantity, unit_price, provider)
  values (p_event_id, btrim(p_buyer_email), p_quantity, v_event.ticket_price, p_provider)
  returning *;
end;
$$;

revoke all on function public.reserve_event_ticket_order(bigint, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_event_ticket_order(bigint, integer, text, text)
  to service_role;

create or replace function public.event_ticket_reserved_count(p_event_id bigint)
returns integer
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(sum(quantity), 0)::integer
    from public.event_ticket_orders
   where event_id = p_event_id
     and (status = 'paid' or (status = 'pending' and expires_at > now()));
$$;

revoke all on function public.event_ticket_reserved_count(bigint)
  from public, anon, authenticated;
grant execute on function public.event_ticket_reserved_count(bigint)
  to service_role;

