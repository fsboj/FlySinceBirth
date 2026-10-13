create table public.customer_support_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  customer_email text not null check (length(btrim(customer_email)) between 5 and 320),
  topic text not null check (topic in ('account', 'ticket', 'order', 'payment', 'other')),
  subject text not null check (length(btrim(subject)) between 3 and 160),
  message text not null check (length(btrim(message)) between 10 and 5000),
  related_store_order_id bigint references public.fsb_store_orders(id) on delete set null,
  related_ticket_order_id uuid references public.event_ticket_orders(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_customer', 'closed')),
  admin_reply text not null default '' check (length(admin_reply) <= 5000),
  admin_replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_support_one_order check (related_store_order_id is null or related_ticket_order_id is null)
);
create index customer_support_requests_customer_created_idx on public.customer_support_requests(customer_id, created_at desc);
create index customer_support_requests_status_created_idx on public.customer_support_requests(status, created_at desc);
alter table public.customer_support_requests enable row level security;
revoke all on public.customer_support_requests from public, anon, authenticated;
grant select on public.customer_support_requests to authenticated;
grant insert (customer_id, customer_email, topic, subject, message, related_store_order_id, related_ticket_order_id) on public.customer_support_requests to authenticated;
grant update (status, admin_reply, admin_replied_at, updated_at) on public.customer_support_requests to authenticated;
create policy "Customers read their own support requests" on public.customer_support_requests for select to authenticated using (customer_id = (select auth.uid()));
create policy "FSB admins read all support requests" on public.customer_support_requests for select to authenticated using (exists (select 1 from public.fsb_store_admins a where a.user_id = (select auth.uid()) and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))));
create policy "Customers open support requests for themselves" on public.customer_support_requests for insert to authenticated with check (
  customer_id = (select auth.uid())
  and lower(customer_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and (related_store_order_id is null or exists (select 1 from public.fsb_store_orders o where o.id = related_store_order_id and o.user_id = (select auth.uid())))
  and (related_ticket_order_id is null or exists (select 1 from public.event_ticket_orders t where t.id = related_ticket_order_id and t.user_id = (select auth.uid())))
);
create policy "FSB admins update support requests" on public.customer_support_requests for update to authenticated using (exists (select 1 from public.fsb_store_admins a where a.user_id = (select auth.uid()) and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), '')))) with check (exists (select 1 from public.fsb_store_admins a where a.user_id = (select auth.uid()) and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))));
