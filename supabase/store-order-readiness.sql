alter table public.merch_products
  add column if not exists shipping_price numeric(10,2) check (shipping_price >= 0),
  add column if not exists shipping_countries text[] not null default '{}';
alter table public.fsb_store_orders
  add column if not exists inventory_state text not null default 'none'
  check (inventory_state in ('none','reserved','consumed','released'));

create or replace function public.fsb_store_inventory(order_id_input bigint, action_input text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  ord public.fsb_store_orders%rowtype;
  item record;
  product public.merch_products%rowtype;
  options jsonb;
  option_index integer;
  option_stock integer;
  delta integer;
begin
  if action_input not in ('reserve','release','consume') then raise exception 'Invalid inventory action'; end if;
  select * into ord from public.fsb_store_orders where id = order_id_input for update;
  if not found then raise exception 'Order not found'; end if;
  if action_input = 'consume' then
    if ord.inventory_state = 'reserved' and ord.payment_status = 'paid' then
      update public.fsb_store_orders set inventory_state = 'consumed' where id = ord.id;
    end if;
    return;
  end if;
  if action_input = 'reserve' then
    if ord.inventory_state = 'reserved' then return; end if;
    if ord.inventory_state <> 'none' or ord.payment_status <> 'pending' then raise exception 'Order cannot reserve stock'; end if;
    delta := -1;
  else
    if ord.inventory_state <> 'reserved' or ord.payment_status = 'paid' then return; end if;
    delta := 1;
  end if;
  for item in select * from public.fsb_store_order_items where order_id = ord.id order by product_id,id loop
    select * into product from public.merch_products where id = item.product_id for update;
    if not found then raise exception 'A product is no longer available'; end if;
    if product.fulfillment_method = 'printful' or not product.track_inventory then continue; end if;
    options := coalesce(product.variants,'[]'::jsonb);
    if jsonb_array_length(options) > 0 then
      select (v.n - 1)::integer into option_index from jsonb_array_elements(options) with ordinality v(value,n)
      where lower(trim(coalesce(v.value->>'size',v.value->>'name',''))) = lower(trim(coalesce(item.variant_size,'')))
        and lower(trim(coalesce(v.value->>'color',''))) = lower(trim(coalesce(item.variant_color,'')))
      limit 1;
      if option_index is null then raise exception 'A product option is no longer available'; end if;
      option_stock := coalesce((options->option_index->>'stock_quantity')::integer,0);
      if option_stock + delta * item.quantity < 0 then raise exception 'An item is sold out or has insufficient stock'; end if;
      options := jsonb_set(options,array[option_index::text,'stock_quantity'],to_jsonb(option_stock + delta * item.quantity));
      update public.merch_products set variants=options,
        stock_quantity=(select coalesce(sum((v->>'stock_quantity')::integer),0) from jsonb_array_elements(options) v),
        updated_at=now() where id=product.id;
    else
      if product.stock_quantity + delta * item.quantity < 0 then raise exception 'An item is sold out or has insufficient stock'; end if;
      update public.merch_products set stock_quantity=stock_quantity + delta * item.quantity,updated_at=now() where id=product.id;
    end if;
  end loop;
  update public.fsb_store_orders set inventory_state=case when action_input='reserve' then 'reserved' else 'released' end where id=ord.id;
end;
$$;
revoke all on function public.fsb_store_inventory(bigint,text) from public,anon,authenticated;
grant execute on function public.fsb_store_inventory(bigint,text) to service_role;