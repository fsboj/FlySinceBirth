alter table public.event_ticket_orders add column checked_in_quantity integer not null default 0 check(checked_in_quantity>=0 and checked_in_quantity<=quantity);
create table public.event_ticket_admissions(
 id bigint generated always as identity primary key,
 request_id uuid not null unique,
 order_id uuid not null references public.event_ticket_orders(id),
 event_id bigint not null references public.events(id),
 admitted_quantity integer not null check(admitted_quantity>0),
 checked_in_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index event_ticket_admissions_order_idx on public.event_ticket_admissions(order_id,created_at desc);
create index event_ticket_admissions_event_idx on public.event_ticket_admissions(event_id);
create index event_ticket_admissions_admin_idx on public.event_ticket_admissions(checked_in_by);
alter table public.event_ticket_admissions enable row level security;
revoke all on public.event_ticket_admissions from anon,authenticated;
grant all on public.event_ticket_admissions to service_role;
grant usage,select on sequence public.event_ticket_admissions_id_seq to service_role;
create function public.admit_event_ticket(p_code uuid,p_event_id bigint,p_quantity integer,p_admin_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare o public.event_ticket_orders%rowtype; previous public.event_ticket_admissions%rowtype;
begin
 if not exists(select 1 from public.fsb_store_admins where user_id=p_admin_id) then raise exception 'Admin access required.' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>10 or p_request_id is null then raise exception 'Choose a valid admission quantity.' using errcode='22023'; end if;
 select * into o from public.event_ticket_orders where ticket_code=p_code for update;
 if not found then raise exception 'Ticket not found.' using errcode='P0002'; end if;
 if o.event_id<>p_event_id then raise exception 'This ticket is for a different event.' using errcode='22023'; end if;
 select * into previous from public.event_ticket_admissions where request_id=p_request_id;
 if found then
  if previous.order_id<>o.id or previous.admitted_quantity<>p_quantity or previous.checked_in_by<>p_admin_id then raise exception 'Admission request does not match.' using errcode='22023'; end if;
  return jsonb_build_object('checked_in_quantity',o.checked_in_quantity,'quantity',o.quantity,'duplicate_request',true);
 end if;
 if o.status<>'paid' then raise exception 'Only paid tickets can be admitted.' using errcode='22023'; end if;
 if o.checked_in_quantity+p_quantity>o.quantity then raise exception 'Not enough unused admissions remain.' using errcode='22023'; end if;
 update public.event_ticket_orders set checked_in_quantity=checked_in_quantity+p_quantity where id=o.id returning * into o;
 insert into public.event_ticket_admissions(request_id,order_id,event_id,admitted_quantity,checked_in_by) values(p_request_id,o.id,o.event_id,p_quantity,p_admin_id);
 return jsonb_build_object('checked_in_quantity',o.checked_in_quantity,'quantity',o.quantity,'duplicate_request',false);
end;$$;
revoke all on function public.admit_event_ticket(uuid,bigint,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admit_event_ticket(uuid,bigint,integer,uuid,uuid) to service_role;
create function public.event_ticket_admin_totals(p_event_id bigint default null)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object(
 'paid_orders',count(*) filter(where status='paid'),
 'tickets_sold',coalesce(sum(quantity) filter(where status='paid'),0),
 'paid_sales',coalesce(sum(quantity*unit_price) filter(where status='paid'),0),
 'checked_in',coalesce(sum(checked_in_quantity) filter(where status='paid'),0),
 'reserved',coalesce(sum(quantity) filter(where status='pending' and expires_at>now()),0))
 from public.event_ticket_orders where p_event_id is null or event_id=p_event_id;
$$;
revoke all on function public.event_ticket_admin_totals(bigint) from public,anon,authenticated;
grant execute on function public.event_ticket_admin_totals(bigint) to service_role;


alter table public.event_ticket_orders add column payment_mode text not null default 'unknown' check(payment_mode in ('unknown','test','live'));
create or replace function public.admit_event_ticket(p_code uuid,p_event_id bigint,p_quantity integer,p_admin_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare o public.event_ticket_orders%rowtype; previous public.event_ticket_admissions%rowtype;
begin
 if not exists(select 1 from public.fsb_store_admins where user_id=p_admin_id) then raise exception 'Admin access required.' using errcode='42501'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>10 or p_request_id is null then raise exception 'Choose a valid admission quantity.' using errcode='22023'; end if;
 select * into o from public.event_ticket_orders where ticket_code=p_code for update;
 if not found then raise exception 'Ticket not found.' using errcode='P0002'; end if;
 if o.event_id<>p_event_id then raise exception 'This ticket is for a different event.' using errcode='22023'; end if;
 select * into previous from public.event_ticket_admissions where request_id=p_request_id;
 if found then
  if previous.order_id<>o.id or previous.admitted_quantity<>p_quantity or previous.checked_in_by<>p_admin_id then raise exception 'Admission request does not match.' using errcode='22023'; end if;
  return jsonb_build_object('checked_in_quantity',o.checked_in_quantity,'quantity',o.quantity,'duplicate_request',true);
 end if;
 if o.payment_mode<>'live' then raise exception 'Test or unverified tickets cannot grant admission.' using errcode='22023'; end if;
 if o.status<>'paid' then raise exception 'Only paid tickets can be admitted.' using errcode='22023'; end if;
 if o.checked_in_quantity+p_quantity>o.quantity then raise exception 'Not enough unused admissions remain.' using errcode='22023'; end if;
 update public.event_ticket_orders set checked_in_quantity=checked_in_quantity+p_quantity where id=o.id returning * into o;
 insert into public.event_ticket_admissions(request_id,order_id,event_id,admitted_quantity,checked_in_by) values(p_request_id,o.id,o.event_id,p_quantity,p_admin_id);
 return jsonb_build_object('checked_in_quantity',o.checked_in_quantity,'quantity',o.quantity,'duplicate_request',false);
end;$$;
create or replace function public.event_ticket_admin_totals(p_event_id bigint default null)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object(
 'paid_orders',count(*) filter(where status='paid' and payment_mode='live'),
 'tickets_sold',coalesce(sum(quantity) filter(where status='paid' and payment_mode='live'),0),
 'paid_sales',coalesce(sum(quantity*unit_price) filter(where status='paid' and payment_mode='live'),0),
 'checked_in',coalesce(sum(checked_in_quantity) filter(where status='paid' and payment_mode='live'),0),
 'reserved',coalesce(sum(quantity) filter(where status='pending' and payment_mode='live' and expires_at>now()),0))
 from public.event_ticket_orders where p_event_id is null or event_id=p_event_id;
$$;
