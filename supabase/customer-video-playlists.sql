create table public.customer_video_playlists (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 60),
 created_at timestamptz not null default now()
);
create index customer_video_playlists_owner on public.customer_video_playlists(user_id,created_at);
create table public.customer_video_playlist_items (
 id uuid primary key default gen_random_uuid(),
 playlist_id uuid not null references public.customer_video_playlists(id) on delete cascade,
 video_id bigint references public.videos(id) on delete cascade,
 song_id bigint references public.artist_songs(id) on delete cascade,
 release_id uuid references public.artist_releases(id) on delete cascade,
 position bigint generated always as identity,
 check(num_nonnulls(video_id,song_id,release_id)=1),
 unique(playlist_id,video_id),unique(playlist_id,song_id),unique(playlist_id,release_id)
);
create index customer_video_playlist_items_order on public.customer_video_playlist_items(playlist_id,position);
create index customer_video_playlist_items_video on public.customer_video_playlist_items(video_id) where video_id is not null;
create index customer_video_playlist_items_song on public.customer_video_playlist_items(song_id) where song_id is not null;
create index customer_video_playlist_items_release on public.customer_video_playlist_items(release_id) where release_id is not null;
alter table public.customer_video_playlists enable row level security;
alter table public.customer_video_playlist_items enable row level security;
revoke all on public.customer_video_playlists,public.customer_video_playlist_items from public,anon,authenticated;
grant select,insert,update,delete on public.customer_video_playlists to authenticated;
grant select,insert,delete on public.customer_video_playlist_items to authenticated;
grant usage,select on sequence public.customer_video_playlist_items_position_seq to authenticated;
grant all on public.customer_video_playlists,public.customer_video_playlist_items to service_role;
grant usage,select on sequence public.customer_video_playlist_items_position_seq to service_role;
create policy video_playlists_select on public.customer_video_playlists for select to authenticated using(user_id=(select auth.uid()));
create policy video_playlists_insert on public.customer_video_playlists for insert to authenticated with check(user_id=(select auth.uid()));
create policy video_playlists_update on public.customer_video_playlists for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy video_playlists_delete on public.customer_video_playlists for delete to authenticated using(user_id=(select auth.uid()));
create policy video_playlist_items_select on public.customer_video_playlist_items for select to authenticated using(exists(select 1 from public.customer_video_playlists p where p.id=playlist_id and p.user_id=(select auth.uid())));
create policy video_playlist_items_insert on public.customer_video_playlist_items for insert to authenticated with check(exists(select 1 from public.customer_video_playlists p where p.id=playlist_id and p.user_id=(select auth.uid())));
create policy video_playlist_items_delete on public.customer_video_playlist_items for delete to authenticated using(exists(select 1 from public.customer_video_playlists p where p.id=playlist_id and p.user_id=(select auth.uid())));