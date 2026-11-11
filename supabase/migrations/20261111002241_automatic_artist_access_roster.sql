alter table public.artist_access alter column email drop not null;
alter table public.artist_access add constraint artist_access_artist_id_key unique(artist_id);
alter table public.artist_access drop constraint artist_access_artist_id_fkey;
alter table public.artist_access add constraint artist_access_artist_id_fkey foreign key(artist_id) references public.artists(id) on delete cascade;

create or replace function fsb_private.sync_artist_access_roster()
returns trigger language plpgsql security definer set search_path='' as $$
declare pending_id uuid;
begin
 update public.artist_access set artist_name=new.name where artist_id=new.id;
 if found then return new; end if;
 select id into pending_id from public.artist_access
 where artist_id is null and lower(btrim(artist_name))=lower(btrim(new.name))
 order by created_at,id limit 1 for update;
 if pending_id is not null then
  update public.artist_access set artist_id=new.id,artist_name=new.name,
   enabled=false,user_id=null,invited_at=null where id=pending_id;
 else
  insert into public.artist_access(artist_id,artist_name,email,enabled)
  values(new.id,new.name,null,false)
  on conflict(artist_id) do update set artist_name=excluded.artist_name;
 end if;
 return new;
end;
$$;
revoke all on function fsb_private.sync_artist_access_roster() from public,anon,authenticated;
create trigger sync_artist_access_roster after insert or update of name on public.artists
for each row execute function fsb_private.sync_artist_access_roster();

create or replace function fsb_private.guard_artist_delete()
returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and not (select fsb_private.is_site_owner()) then
  raise exception 'Only the FSB owner can delete an artist page.' using errcode='42501';
 end if;
 return old;
end;
$$;
revoke all on function fsb_private.guard_artist_delete() from public,anon,authenticated;
create trigger guard_artist_delete before delete on public.artists
for each row execute function fsb_private.guard_artist_delete();

do $$
declare a record; pending_id uuid;
begin
 for a in select id,name from public.artists order by id loop
  if exists(select 1 from public.artist_access where artist_id=a.id) then
   update public.artist_access set artist_name=a.name where artist_id=a.id;
  else
   pending_id:=null;
   select id into pending_id from public.artist_access where artist_id is null
    and lower(btrim(artist_name))=lower(btrim(a.name)) order by created_at,id limit 1 for update;
   if pending_id is not null then
    update public.artist_access set artist_id=a.id,artist_name=a.name,enabled=false,user_id=null,invited_at=null where id=pending_id;
   else
    insert into public.artist_access(artist_id,artist_name,email,enabled) values(a.id,a.name,null,false);
   end if;
  end if;
 end loop;
end;
$$;