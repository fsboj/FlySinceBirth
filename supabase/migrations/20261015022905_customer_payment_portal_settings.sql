-- Stores the single Stripe Customer Portal configuration used by FSB accounts.
create table if not exists public.customer_payment_portal_settings (
  id smallint primary key default 1 check (id = 1),
  stripe_configuration_id text not null unique
    check (stripe_configuration_id ~ '^bpc_[A-Za-z0-9]+$'),
  updated_at timestamptz not null default now()
);

alter table public.customer_payment_portal_settings enable row level security;
revoke all on public.customer_payment_portal_settings from public, anon, authenticated;
grant select, insert, update, delete on public.customer_payment_portal_settings to service_role;

