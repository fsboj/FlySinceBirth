alter table public.artist_releases add column hide_track_names boolean not null default false;
alter table public.artist_releases add column release_at timestamptz generated always as (release_date::timestamp at time zone 'America/New_York') stored;
alter table public.artist_songs add column release_at timestamptz generated always as (release_date::timestamp at time zone 'America/New_York') stored;
alter table public.videos add column release_date date;
alter table public.videos add column release_at timestamptz generated always as (release_date::timestamp at time zone 'America/New_York') stored;
create function public.fsb_release_clock() returns jsonb language sql stable security invoker set search_path=pg_catalog as $$select jsonb_build_object('now',statement_timestamp(),'timezone','America/New_York')$$;
revoke all on function public.fsb_release_clock() from public;
grant execute on function public.fsb_release_clock() to anon,authenticated,service_role;
alter policy public_read_artist_releases on public.artist_releases using(release_at is null or release_at<=now());
alter policy public_read_artist_songs on public.artist_songs using((release_at is null or release_at<=now()) and (release_id is null or exists(select 1 from public.artist_releases r where r.id=artist_songs.release_id)));
alter policy public_read_videos on public.videos using((release_at is null or release_at<=now()) and (release_id is null or exists(select 1 from public.artist_releases r where r.id=videos.release_id)));
insert into storage.buckets(id,name,public) values('release-media','release-media',false) on conflict(id) do nothing;
create policy "FSB admins manage private release media" on storage.objects for all to authenticated using(bucket_id='release-media' and exists(select 1 from public.fsb_store_admins a where a.user_id=(select auth.uid()) and lower(a.email)=lower(coalesce((select auth.jwt()->>'email'),'')))) with check(bucket_id='release-media' and exists(select 1 from public.fsb_store_admins a where a.user_id=(select auth.uid()) and lower(a.email)=lower(coalesce((select auth.jwt()->>'email'),''))));

