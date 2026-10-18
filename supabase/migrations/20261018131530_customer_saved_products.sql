create table public.customer_saved_products (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.merch_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index customer_saved_products_product_id_idx
  on public.customer_saved_products (product_id);

alter table public.customer_saved_products enable row level security;

revoke all on public.customer_saved_products from anon;
grant select, insert, delete on public.customer_saved_products to authenticated;

create policy "Customers can read their saved products"
  on public.customer_saved_products for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Customers can save products for themselves"
  on public.customer_saved_products for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Customers can remove their saved products"
  on public.customer_saved_products for delete to authenticated
  using ((select auth.uid()) = user_id);
