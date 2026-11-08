-- Preserve the artists currently shown by the old automatic fallback.
update public.artists set homepage_featured=true where id in(select id from public.artists order by sort_order nulls last,id limit 10) and not exists(select 1 from public.artists where homepage_featured=true);
create index if not exists artists_homepage_display_order on public.artists(sort_order,id) where homepage_featured=true;
create function public.save_homepage_artists(p_artist_ids bigint[])
returns void language plpgsql security invoker set search_path='' as $$
declare ids bigint[]:=coalesce(p_artist_ids,array[]::bigint[]);
begin
 if not exists(select 1 from public.fsb_store_admins a where a.user_id=(select auth.uid()) and lower(a.email)=lower(coalesce((select auth.jwt()->>'email'),''))) then raise exception 'Admin access required.' using errcode='42501';end if;
 if cardinality(ids)>10 then raise exception 'Choose up to 10 homepage artists.';end if;
 if exists(select 1 from unnest(ids) as chosen(id) where id is null) or (select count(distinct id) from unnest(ids) as chosen(id))<>cardinality(ids) then raise exception 'Choose each artist once.';end if;
 perform id from public.artists order by id for update;
 if (select count(*) from public.artists where id=any(ids))<>cardinality(ids) then raise exception 'An artist no longer exists. Refresh the artist list.';end if;
 update public.artists set homepage_featured=false where homepage_featured=true and not(id=any(ids));
 update public.artists a set homepage_featured=true,sort_order=chosen.position::integer from unnest(ids) with ordinality as chosen(id,position) where a.id=chosen.id;
end;
$$;
revoke all on function public.save_homepage_artists(bigint[]) from public,anon,authenticated;
grant execute on function public.save_homepage_artists(bigint[]) to authenticated;