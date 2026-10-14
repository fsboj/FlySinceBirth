create table public.customer_support_email_deliveries (
  support_request_id uuid primary key
    references public.customer_support_requests(id) on delete cascade,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed')),
  attempts smallint not null default 1 check (attempts between 1 and 3),
  last_error text not null default '' check (length(last_error) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.customer_support_email_deliveries enable row level security;
revoke all on public.customer_support_email_deliveries from public, anon, authenticated;

