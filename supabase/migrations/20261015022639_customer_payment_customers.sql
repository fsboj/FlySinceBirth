-- Maps an authenticated FSB account to its Stripe Customer.
-- Payment card details remain stored and managed by Stripe.
create table if not exists public.customer_payment_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique
    check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_payment_customers enable row level security;
revoke all on public.customer_payment_customers from public, anon, authenticated;
grant select, insert, update, delete on public.customer_payment_customers to service_role;

