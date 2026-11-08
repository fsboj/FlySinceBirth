alter table public.artist_links add column sort_order integer not null default 2147483647;
with ranked as(select id,row_number() over(partition by artist_id order by created_at,id)::integer as position from public.artist_links)
update public.artist_links l set sort_order=r.position from ranked r where r.id=l.id;
create index artist_links_display_order on public.artist_links(artist_id,sort_order,created_at,id);
create function public.move_artist_link(p_artist_id bigint,p_link_id bigint,p_direction integer)
returns void language plpgsql security invoker set search_path='' as $$
declare current_position integer; adjacent_id bigint; adjacent_position integer; changed integer;
begin
 if p_direction not in(-1,1) or p_direction is null then raise exception 'Choose up or down.';end if;
 if not exists(select 1 from public.fsb_store_admins a where a.user_id=(select auth.uid()) and lower(a.email)=lower(coalesce((select auth.jwt()->>'email'),''))) then raise exception 'Admin access required.' using errcode='42501';end if;
 perform l.id from public.artist_links l where l.artist_id=p_artist_id order by l.id for update;
 if not exists(select 1 from public.artist_links where id=p_link_id and artist_id=p_artist_id) then raise exception 'This artist link no longer exists.';end if;
 with ranked as(select id,row_number() over(order by sort_order,created_at,id)::integer as position from public.artist_links where artist_id=p_artist_id)
 update public.artist_links l set sort_order=r.position from ranked r where l.id=r.id and l.artist_id=p_artist_id;
 select sort_order into current_position from public.artist_links where id=p_link_id and artist_id=p_artist_id;
 select id,sort_order into adjacent_id,adjacent_position from public.artist_links where artist_id=p_artist_id and sort_order=current_position+p_direction;
 if adjacent_id is null then return;end if;
 update public.artist_links set sort_order=case when id=p_link_id then adjacent_position else current_position end where artist_id=p_artist_id and id in(p_link_id,adjacent_id);
 get diagnostics changed=row_count;if changed<>2 then raise exception 'Could not save link order.';end if;
end;
$$;
revoke all on function public.move_artist_link(bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.move_artist_link(bigint,bigint,integer) to authenticated;