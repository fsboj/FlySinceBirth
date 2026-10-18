-- Server-only quote storage keeps shipping choices tied to the authenticated cart.
create table if not exists public.fsb_store_checkout_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote jsonb not null,
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.fsb_store_checkout_quotes enable row level security;
revoke all on public.fsb_store_checkout_quotes from public, anon, authenticated;
grant all on public.fsb_store_checkout_quotes to service_role;

alter table public.fsb_store_orders
  add column if not exists stripe_session_id text,
  add column if not exists checkout_expires_at timestamptz,
  add column if not exists printful_order_id text;

create unique index if not exists fsb_store_orders_stripe_session_id_key
  on public.fsb_store_orders(stripe_session_id)
  where stripe_session_id is not null;

alter table public.fsb_store_order_items
  add column if not exists printful_variant_id text;

create index if not exists fsb_store_checkout_quotes_expiry_idx
  on public.fsb_store_checkout_quotes(expires_at)
  where consumed_at is null;

