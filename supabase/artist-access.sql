-- Artist accounts never join fsb_store_admins. All access is revocable here.
create schema if not exists fsb_private;
revoke all on schema fsb_private from public,anon;
grant usage on schema fsb_private to authenticated;
create table public.artist_access (
 id uuid primary key default gen_random_uuid(), artist_id bigint references public.artists(id) on delete set null,
 artist_name text not null, email text not null unique check(email=lower(email) and email ~ '^[a-z0-9._+-]+@flysbirth[.]com$'),
 user_id uuid unique references auth.users(id) on delete set null, enabled boolean not null default false,
 invited_at timestamptz, created_at timestamptz not null default now()
);
create index artist_access_artist_idx on public.artist_access(artist_id);
alter table public.artist_access enable row level security;
grant select,insert,update,delete on public.artist_access to authenticated;
revoke all on public.artist_access from anon;
create function fsb_private.is_site_owner() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.fsb_store_admins a where a.user_id=(select auth.uid()) and lower(a.email)=lower(coalesce((select auth.jwt()->>'email'),'')));
$$;
revoke all on function fsb_private.is_site_owner() from public,anon;
grant execute on function fsb_private.is_site_owner() to authenticated;
create policy owner_manage_artist_access on public.artist_access for all to authenticated using((select fsb_private.is_site_owner())) with check((select fsb_private.is_site_owner()));
create policy artist_read_own_access on public.artist_access for select to authenticated using(user_id=(select auth.uid()) and email=lower(coalesce((select auth.jwt()->>'email'),'')));
-- Narrow definer lookup: authorization only; no rows, secrets or writes are exposed.
create function fsb_private.has_artist_access(p_artist bigint) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.artist_access a join auth.users u on u.id=a.user_id
 where a.artist_id=p_artist and a.enabled and a.user_id=(select auth.uid()) and u.email_confirmed_at is not null
 and lower(u.email)=a.email and a.email=lower(coalesce((select auth.jwt()->>'email'),'')));
$$;
revoke all on function fsb_private.has_artist_access(bigint) from public,anon;
grant execute on function fsb_private.has_artist_access(bigint) to authenticated;
create policy artist_edit_own_profile on public.artists for update to authenticated using(fsb_private.has_artist_access(id)) with check(fsb_private.has_artist_access(id));
create policy artist_own_songs on public.artist_songs for all to authenticated using(fsb_private.has_artist_access(artist_id)) with check(fsb_private.has_artist_access(artist_id));
create policy artist_own_releases on public.artist_releases for all to authenticated using(fsb_private.has_artist_access(artist_id)) with check(fsb_private.has_artist_access(artist_id));
create policy artist_own_videos on public.videos for all to authenticated using(fsb_private.has_artist_access(artist_id)) with check(fsb_private.has_artist_access(artist_id));
create policy artist_own_links on public.artist_links for all to authenticated using(fsb_private.has_artist_access(artist_id)) with check(fsb_private.has_artist_access(artist_id));
create policy artist_own_song_credits on public.artist_song_features for all to authenticated
 using(exists(select 1 from public.artist_songs s where s.id=song_id and fsb_private.has_artist_access(s.artist_id)))
 with check(exists(select 1 from public.artist_songs s where s.id=song_id and fsb_private.has_artist_access(s.artist_id)));
create policy artist_own_video_credits on public.video_artist_features for all to authenticated
 using(exists(select 1 from public.videos v where v.id=video_id and fsb_private.has_artist_access(v.artist_id)))
 with check(exists(select 1 from public.videos v where v.id=video_id and fsb_private.has_artist_access(v.artist_id)));
create function fsb_private.guard_artist_changes() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in('anon','authenticated') or (select fsb_private.is_site_owner()) then return new;end if;
 if tg_table_name='artists' then
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at or new.sort_order is distinct from old.sort_order or new.homepage_featured is distinct from old.homepage_featured then raise exception 'Homepage placement is managed by FSB.' using errcode='42501';end if;
 else
  if tg_op='UPDATE' and new.artist_id is distinct from old.artist_id then raise exception 'Content ownership cannot be changed.' using errcode='42501';end if;
  if tg_table_name='artist_songs' then
   if (tg_op='INSERT' and coalesce(new.plays,0)<>0) or (tg_op='UPDATE' and new.plays is distinct from old.plays) then raise exception 'Listening totals cannot be edited.' using errcode='42501';end if;
  end if;
  if tg_table_name in('artist_songs','videos') then
   if new.release_id is not null and not exists(select 1 from public.artist_releases r where r.id=new.release_id and r.artist_id=new.artist_id) then raise exception 'Choose an album or EP belonging to your artist.' using errcode='42501';end if;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function fsb_private.guard_artist_changes() from public,anon;
create trigger guard_artist_profile before update on public.artists for each row execute function fsb_private.guard_artist_changes();
create trigger guard_artist_song before insert or update on public.artist_songs for each row execute function fsb_private.guard_artist_changes();
create trigger guard_artist_release before insert or update on public.artist_releases for each row execute function fsb_private.guard_artist_changes();
create trigger guard_artist_video before insert or update on public.videos for each row execute function fsb_private.guard_artist_changes();
create trigger guard_artist_link before insert or update on public.artist_links for each row execute function fsb_private.guard_artist_changes();
create function fsb_private.owns_media_path(p_bucket text,p_name text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.artist_access a where a.user_id=(select auth.uid()) and fsb_private.has_artist_access(a.artist_id)
 and ((p_bucket in('artist-images','artist-backgrounds','artist-artwork','artist-music','videos') and split_part(p_name,'/',1)=a.artist_id::text)
 or (p_bucket='release-media' and split_part(p_name,'/',1) in('artist-music','videos') and split_part(p_name,'/',2)=a.artist_id::text)));
$$;
revoke all on function fsb_private.owns_media_path(text,text) from public,anon;
grant execute on function fsb_private.owns_media_path(text,text) to authenticated;
-- Snapshot existing legacy files once. Artist-editable URLs cannot confer storage access.
create table fsb_private.artist_legacy_media(artist_id bigint not null references public.artists(id) on delete cascade,bucket text not null,name text not null,primary key(artist_id,bucket,name));
alter table fsb_private.artist_legacy_media enable row level security;
revoke all on fsb_private.artist_legacy_media from public,anon,authenticated;
insert into fsb_private.artist_legacy_media(artist_id,bucket,name)
select distinct artist_id,'release-media',split_part(url,'/object/public/release-media/',2) from (
 select artist_id,link url from public.videos union all select artist_id,image from public.videos
 union all select artist_id,audio_url from public.artist_songs union all select artist_id,video_url from public.artist_songs
 union all select artist_id,video_url from public.artist_releases
) files where artist_id is not null and url like '%/object/public/release-media/%' on conflict do nothing;
create function fsb_private.can_read_artist_media(p_bucket text,p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (fsb_private.owns_media_path(p_bucket,p_name) or exists(select 1 from fsb_private.artist_legacy_media m where m.bucket=p_bucket and m.name=p_name and fsb_private.has_artist_access(m.artist_id)));
$$;
revoke all on function fsb_private.can_read_artist_media(text,text) from public,anon;
grant execute on function fsb_private.can_read_artist_media(text,text) to authenticated;
create policy artist_read_private_media on storage.objects for select to authenticated using(fsb_private.can_read_artist_media(bucket_id,name));
create policy artist_insert_own_media on storage.objects for insert to authenticated with check(fsb_private.owns_media_path(bucket_id,name));
create policy artist_update_own_media on storage.objects for update to authenticated using(fsb_private.owns_media_path(bucket_id,name)) with check(fsb_private.owns_media_path(bucket_id,name));
create policy artist_delete_own_media on storage.objects for delete to authenticated using(fsb_private.owns_media_path(bucket_id,name));
insert into public.artist_access(artist_name,email,artist_id)
select x.name,x.email,(select id from public.artists where lower(name)=lower(x.name) limit 1)
from(values('FSB Chnxx','chnxx@flysbirth.com'),('FSB Reef','reef@flysbirth.com'),('FSB Nos','nos@flysbirth.com'),('FSB OJ','oj@flysbirth.com'),('JAY-B','jayb@flysbirth.com'),('Josh Taylor','joshtaylor@flysbirth.com'),('Bando B','bandob@flysbirth.com'),('FSB Pooh','pooh@flysbirth.com')) as x(name,email);


CREATE OR REPLACE FUNCTION public.move_artist_link(p_artist_id bigint, p_link_id bigint, p_direction integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare current_position integer; adjacent_id bigint; adjacent_position integer; changed integer;
begin
 if p_direction not in(-1,1) or p_direction is null then raise exception 'Choose up or down.';end if;
 if not (fsb_private.is_site_owner() or fsb_private.has_artist_access(p_artist_id)) then raise exception 'Admin access required.' using errcode='42501';end if;
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
$function$

create policy no_direct_legacy_media_access on fsb_private.artist_legacy_media for all to authenticated using(false) with check(false);